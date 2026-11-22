"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { buildBackup, parseBackup, type AppData } from "@/lib/backup";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { IntelStore } from "@/types/job";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCloudConfigured } from "./config";
import { readDailyPayload, replayRun, type DailyPayload } from "./daily-payload";
import { deleteCloud, fetchRow, fetchRuns, pushRow } from "./remote";
import { NO_SYNC, hashData, isEmptyData, mergeAppData, planSync, type SyncMemory } from "./sync";

const MemorySchema = z.object({
  enabled: z.boolean(),
  lastVersion: z.number().int().min(0),
  lastHash: z.string().max(100).nullable(),
  importedRuns: z.array(z.string().max(80)).max(200),
  userId: z.string().max(80).nullable().default(null),
});

export type CloudStatus = "idle" | "syncing" | "error" | "gone";

export interface LatestRun {
  id: string;
  ranAt: string;
  runDate: string;
  payload: DailyPayload;
  /** Jobs in this run that were new to your history when it was added. 0 once seen. */
  newJobs: number;
}

export interface CloudApi {
  configured: boolean;
  /** False until the saved sign-in has been looked up. */
  ready: boolean;
  user: { id: string; email: string } | null;
  enabled: boolean;
  status: CloudStatus;
  message: string | null;
  lastSyncedAt: string | null;
  latestRun: LatestRun | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  enable: () => void;
  disable: () => void;
  syncNow: () => void;
  reupload: () => void;
  deleteAll: () => Promise<void>;
}

interface Options {
  /** What would be synced. Must change only when the data does, not on every render. */
  data: AppData;
  /** Puts data into the app. Search filters are left alone. */
  apply: (d: AppData) => void;
  /** Updates the search history. */
  updateIntel: (change: (s: IntelStore) => IntelStore) => void;
  intel: IntelStore;
}

const DEBOUNCE_MS = 4000;

function readRow(data: unknown): { ok: true; data: AppData } | { ok: false; error: string } {
  const parsed = parseBackup(JSON.stringify(data));
  return parsed.ok ? { ok: true, data: parsed.data } : { ok: false, error: `The copy in the cloud could not be read (${parsed.error}). Nothing on this device was changed.` };
}

/**
 * Sign-in, sync and the morning run's results. Everything is off unless the Supabase values are set, so the app
 * is the same browser-only app without them. A copy is never overwritten without having been seen first: see planSync.
 */
export function useCloud({ data, apply, updateIntel, intel }: Options): CloudApi {
  const configured = isCloudConfigured();
  // The Supabase library is loaded only when cloud features are configured, so a browser-only setup never downloads it.
  const [sb, setSb] = useState<SupabaseClient | null>(null);
  const [memory, setMemory, hydrated] = usePersistentState<SyncMemory>("cmh:cloud", NO_SYNC, (v) => {
    const r = MemorySchema.safeParse(v);
    return r.success ? r.data : undefined;
  });
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [ready, setReady] = useState(!configured);
  const [status, setStatus] = useState<CloudStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<LatestRun | null>(null);

  useEffect(() => {
    if (!configured) return;
    let live = true;
    import("./client")
      .then((m) => live && setSb(m.getCloud()))
      .catch(() => {
        // The library could not be loaded, for example offline. Say so instead of waiting forever.
        if (!live) return;
        setReady(true);
        setStatus("error");
        setMessage("Cloud features could not be loaded. Check your connection and reload.");
      });
    return () => {
      live = false;
    };
  }, [configured]);

  // The latest values, for callbacks that run later (timers, focus) and must not see old ones.
  const dataRef = useRef(data);
  const memoryRef = useRef(memory);
  const userRef = useRef(user);
  const intelRef = useRef(intel);
  const applyRef = useRef(apply);
  const updateIntelRef = useRef(updateIntel);
  useEffect(() => {
    dataRef.current = data;
    userRef.current = user;
    intelRef.current = intel;
    applyRef.current = apply;
    updateIntelRef.current = updateIntel;
  });
  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);

  const commit = useCallback(
    (next: SyncMemory) => {
      memoryRef.current = next;
      setMemory(next);
    },
    [setMemory],
  );

  useEffect(() => {
    if (!sb) return;
    let live = true;
    const toUser = (s: { user: { id: string; email?: string | null } } | null) => (s ? { id: s.user.id, email: s.user.email ?? "" } : null);
    void sb.auth.getSession().then(({ data: d }) => {
      if (!live) return;
      setUser(toUser(d.session));
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (live) setUser(toUser(session));
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  const busy = useRef(false);
  const syncAgain = useRef<(() => void) | null>(null);

  const syncNow = useCallback(async () => {
    const u = userRef.current;
    if (!sb || !u || busy.current || !memoryRef.current.enabled || memoryRef.current.userId !== u.id) return;
    busy.current = true;
    setStatus("syncing");
    setMessage(null);
    try {
      let done = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const mem = memoryRef.current;
        const local = dataRef.current;
        const row = await fetchRow(sb, u.id);
        const hash = hashData(local);
        const action = planSync({ cloudVersion: row?.version ?? null, memory: mem, localHash: hash, localEmpty: isEmptyData(local) });

        if (action === "none") {
          done = true;
          break;
        }
        if (action === "gone") {
          setStatus("gone");
          setMessage("Your cloud copy was deleted, perhaps from another device. Nothing was sent. You can upload this device's data again, or turn sync off.");
          return;
        }

        let toPush = local;
        if (action === "pull" || action === "merge") {
          const cloud = readRow(row!.data);
          if (!cloud.ok) {
            setStatus("error");
            setMessage(cloud.error);
            return;
          }
          // Something may have been edited while the cloud copy was being fetched. Replacing the data now would lose
          // that edit, so look again: with the edit in place this becomes a combine.
          if (hashData(dataRef.current) !== hash) continue;
          if (action === "pull") {
            applyRef.current(cloud.data);
            commit({ ...mem, lastVersion: row!.version, lastHash: hashData(cloud.data) });
            done = true;
            break;
          }
          // Both copies changed. Keep a copy of this device's data first, then combine without losing either.
          try {
            window.localStorage.setItem("cmh:backup:pre-sync", buildBackup(local));
          } catch {
            /* storage full: the merge still never deletes anything */
          }
          toPush = mergeAppData(local, cloud.data);
          applyRef.current(toPush);
        }

        const res = await pushRow(sb, u.id, JSON.parse(buildBackup(toPush)), row?.version ?? 0);
        if (res.ok) {
          commit({ ...mem, lastVersion: res.version, lastHash: hashData(toPush) });
          done = true;
          break;
        }
        if (attempt === 2) {
          setStatus("error");
          setMessage("Another device saved at the same moment. Nothing was lost. Try again in a minute.");
          return;
        }
      }
      if (!done) {
        // Edits kept arriving during the check. Nothing was lost; it is tried again shortly.
        setStatus("idle");
        setMessage("Your data changed while syncing, so it will be checked again in a moment.");
        setTimeout(() => syncAgain.current?.(), 2000);
        return;
      }
      setLastSyncedAt(new Date().toISOString());
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      busy.current = false;
    }
  }, [sb, commit]);

  // The morning run's results. Adding one is idempotent, so a run is never counted twice.
  const importRuns = useCallback(async () => {
    const u = userRef.current;
    if (!sb || !u || memoryRef.current.userId !== u.id) return;
    try {
      const rows = (await fetchRuns(sb)).sort((a, b) => a.ran_at.localeCompare(b.ran_at));
      const readable = rows.flatMap((r) => {
        const payload = readDailyPayload(r.payload);
        return payload ? [{ row: r, payload }] : [];
      });
      const known = new Set(memoryRef.current.importedRuns);
      const fresh = readable.filter((r) => !known.has(r.row.id));
      let newJobs = 0;
      if (fresh.length) {
        let s = intelRef.current;
        for (const r of fresh) s = replayRun(s, r.row, r.payload);
        newJobs = s.seen.length - intelRef.current.seen.length;
        updateIntelRef.current((cur) => fresh.reduce((acc, r) => replayRun(acc, r.row, r.payload), cur));
        commit({ ...memoryRef.current, importedRuns: [...memoryRef.current.importedRuns, ...fresh.map((r) => r.row.id)].slice(-200) });
      }
      const last = readable[readable.length - 1];
      if (last) setLatestRun({ id: last.row.id, ranAt: last.row.ran_at, runDate: last.row.run_date, payload: last.payload, newJobs: fresh.some((f) => f.row.id === last.row.id) ? Math.max(0, newJobs) : 0 });
    } catch {
      /* the morning run is optional: a failed fetch is tried again next time */
    }
  }, [sb, commit]);

  useEffect(() => {
    syncAgain.current = () => void syncNow();
  }, [syncNow]);

  const userId = user?.id ?? null;
  const enabled = memory.enabled;

  // Another account signing in on this browser must never be handed the first account's sync state:
  // its cloud copy could otherwise replace this device's data. It starts from scratch, with sync off.
  useEffect(() => {
    if (!hydrated || !userId || memoryRef.current.userId === userId) return;
    const previous = memoryRef.current.userId;
    setStatus("idle");
    if (previous === null) {
      // The first sign-in on this browser claims the sync state.
      commit({ ...memoryRef.current, userId });
      return;
    }
    commit({ ...NO_SYNC, userId });
    setMessage("A different account signed in here, so sync was turned off. Turn it on again if you want that account's copy combined with this device.");
  }, [hydrated, userId, commit]);

  // Sync shortly after a change, and again whenever you come back to the tab.
  useEffect(() => {
    if (!hydrated || !userId || !enabled) return;
    const t = setTimeout(() => void syncNow(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [hydrated, userId, enabled, data, syncNow]);

  useEffect(() => {
    if (!hydrated || !userId) return;
    void importRuns();
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      void syncNow();
      void importRuns();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [hydrated, userId, syncNow, importRuns]);

  return {
    configured,
    ready,
    user,
    enabled,
    status,
    message,
    lastSyncedAt,
    latestRun,
    async signIn(email, password) {
      if (!sb) return "Cloud features are not set up.";
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      // The same wording whatever went wrong, so it does not reveal which accounts exist.
      return error ? "That email and password did not work." : null;
    },
    async signOut() {
      await sb?.auth.signOut();
      setStatus("idle");
      setMessage(null);
      setLatestRun(null);
    },
    enable() {
      // Starting from scratch: the first sync compares both copies and combines them, never replaces one.
      commit({ ...memoryRef.current, enabled: true, lastVersion: 0, lastHash: null });
      setStatus("idle");
      setMessage(null);
      setTimeout(() => void syncNow(), 0);
    },
    disable() {
      commit({ ...memoryRef.current, enabled: false });
      setStatus("idle");
      setMessage(null);
    },
    syncNow: () => void syncNow(),
    reupload() {
      commit({ ...memoryRef.current, enabled: true, lastVersion: 0, lastHash: null });
      setStatus("idle");
      setMessage(null);
      setTimeout(() => void syncNow(), 0);
    },
    async deleteAll() {
      const u = userRef.current;
      if (!sb || !u) return;
      try {
        await deleteCloud(sb, u.id);
        commit({ ...NO_SYNC, userId: u.id });
        setLatestRun(null);
        setStatus("idle");
        setMessage("Your cloud copy and daily runs were deleted. This device's data is unchanged, and sync is off.");
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Could not delete the cloud copy.");
      }
    },
  };
}
