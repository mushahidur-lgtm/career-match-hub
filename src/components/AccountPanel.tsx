"use client";

import { Cloud, CloudOff, LogOut, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CloudApi } from "@/lib/cloud/use-cloud";
import { Notice, inputClass, primaryButton, secondaryButton } from "./ui";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null);

/** Sign-in, sync and the morning run. Off, with a short explanation, until a Supabase project is connected. */
export function AccountPanel({ cloud }: { cloud: CloudApi }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!cloud.configured) {
    return (
      <section aria-labelledby="cloud-heading" className="space-y-2 rounded-xl border border-line bg-surface p-4">
        <h2 id="cloud-heading" className="flex items-center gap-2 font-display text-xl font-semibold">
          <CloudOff className="size-5 text-muted" aria-hidden /> Cloud sync
        </h2>
        <p className="text-sm text-muted">
          Off, and so is job searching: this site answers only its signed-in owner. Your data stays in this browser. To sign in, connect a free Supabase project as described in docs/security-hardening.md.
        </p>
      </section>
    );
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const problem = await cloud.signIn(email, password);
    setBusy(false);
    if (problem) setError(problem);
    else setPassword("");
  }

  return (
    <section aria-labelledby="cloud-heading" className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <div>
        <h2 id="cloud-heading" className="flex items-center gap-2 font-display text-xl font-semibold">
          <Cloud className="size-5 text-brand" aria-hidden /> Cloud sync
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted">Keep your data in step across devices, and get a search run for you every morning at 8:00 AM Toronto time.</p>
      </div>

      {!cloud.ready ? (
        <p className="text-sm text-muted">Checking your sign-in…</p>
      ) : !cloud.user ? (
        <form onSubmit={signIn} className="space-y-3">
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <label htmlFor="cloud-email">Email</label>
            <input id="cloud-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            <label htmlFor="cloud-password">Password</label>
            <input id="cloud-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" className={primaryButton} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-xs text-muted">There is no sign-up here. The account is one you created in your own Supabase project.</p>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm">
            Signed in as <strong className="font-semibold">{cloud.user.email}</strong>
          </p>

          {!cloud.enabled ? (
            <div className="space-y-2 rounded-lg bg-surface-2 p-3 text-sm">
              <p className="font-medium">Sync is off</p>
              <p className="text-muted">
                Turning it on uploads a copy of your resume text (without email addresses, phone numbers or LinkedIn addresses; never the file), applications, notes, interviews, search history and preferences to your own Supabase project. Nothing is sent to anyone else. The first sync combines what is on this device with
                what is already there, and never replaces either side.
              </p>
              <button type="button" className={primaryButton} onClick={cloud.enable}>
                Turn on sync
              </button>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p role="status" aria-live="polite">
                {cloud.status === "syncing" ? "Syncing…" : cloud.status === "error" ? "Sync problem" : cloud.status === "gone" ? "Cloud copy missing" : cloud.lastSyncedAt ? `In sync. Last checked ${when(cloud.lastSyncedAt)}.` : "Sync is on."}
              </p>
              {cloud.message && <Notice tone={cloud.status === "error" ? "error" : "warn"}>{cloud.message}</Notice>}
              <div className="flex flex-wrap gap-2">
                {cloud.status === "gone" ? (
                  <button type="button" className={primaryButton} onClick={cloud.reupload}>
                    Upload this device again
                  </button>
                ) : (
                  <button type="button" className={secondaryButton} onClick={cloud.syncNow} disabled={cloud.status === "syncing"}>
                    <RefreshCw className="size-4" aria-hidden /> Sync now
                  </button>
                )}
                <button type="button" className={secondaryButton} onClick={cloud.disable}>
                  Turn off sync
                </button>
              </div>
              <p className="text-xs text-muted">The morning search runs only while sync is on and your email is on the allowed list set up with the project. It uses the resume that is selected here and your primary roles and cities from the settings on the left.</p>
            </div>
          )}

          {cloud.latestRun && <p className="text-sm text-muted">Last morning run: {cloud.latestRun.runDate}, {cloud.latestRun.payload.searches.length} searches.</p>}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" className={secondaryButton} onClick={() => void cloud.signOut()}>
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
            {!confirmDelete ? (
              <button type="button" className={secondaryButton} onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" aria-hidden /> Delete my cloud data
              </button>
            ) : (
              <span role="alert" className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Delete the cloud copy and morning runs? This device keeps its data.</span>
                <button
                  type="button"
                  className={primaryButton}
                  onClick={() => {
                    setConfirmDelete(false);
                    void cloud.deleteAll();
                  }}
                >
                  Yes, delete
                </button>
                <button type="button" className={secondaryButton} onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
