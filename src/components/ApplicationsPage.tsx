"use client";

import { useMemo, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, Download, LayoutGrid, Plus, Table2 } from "lucide-react";
import { isActive, nextInterview, parseDay, parseLocalDateTime, wasSent, type Reminder } from "@/lib/applications";
import { usePersistentState } from "@/lib/use-persistent-state";
import { APPLICATION_OUTCOMES, APPLICATION_STAGES, APPLICATION_STATUSES, type Application, type ApplicationStatus } from "@/types/job";
import type { ApplicationActions, ApplicationTab } from "./ApplicationDialog";
import { Badge, ScoreBadge, inputClass, primaryButton, secondaryButton } from "./ui";

interface Props extends Pick<ApplicationActions, "onMove"> {
  items: Application[];
  reminders: Reminder[];
  onOpen: (id: string, tab?: ApplicationTab) => void;
  onAdd: () => void;
  onExport: () => void;
  onGoDiscover: () => void;
}

export const fmtDay = (day: string | null | undefined) => {
  const d = parseDay(day);
  return d ? d.toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "";
};
export const fmtWhen = (value: string | null | undefined) => {
  const d = parseLocalDateTime(value);
  return d ? d.toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
};

type SortKey = "role" | "status" | "match" | "applied" | "followUp" | "interview";

export function ApplicationsPage({ items, reminders, onOpen, onMove, onAdd, onExport, onGoDiscover }: Props) {
  const [view, setView] = usePersistentState<"board" | "table">("cmh:appview", "board", (v) => (v === "board" || v === "table" ? v : undefined));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | ApplicationStatus>("All");
  const [showFinished, setShowFinished] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((a) => {
      if (q && !`${a.job.title} ${a.job.company}`.toLowerCase().includes(q)) return false;
      if (view === "table" && statusFilter !== "All") return statusFilter === "Active" ? isActive(a.status) : a.status === statusFilter;
      return true;
    });
  }, [items, query, statusFilter, view]);

  const overdueIds = useMemo(() => new Set(reminders.filter((r) => r.overdue).map((r) => r.app.job.id)), [reminders]);
  const finishedCount = items.filter((a) => !isActive(a.status)).length;

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <Header onAdd={onAdd} onExport={onExport} disabled />
        <div className="rounded-xl border border-dashed border-line px-6 py-14">
          <h2 className="font-display text-xl font-semibold">No applications yet</h2>
          <p className="mt-2 max-w-prose text-sm text-muted">Save a job from your search, or add one you found elsewhere, to track it from first interest through interviews to an offer.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={primaryButton} onClick={onGoDiscover}>
              Go to Discover jobs
            </button>
            <button type="button" className={secondaryButton} onClick={onAdd}>
              <Plus className="size-4" aria-hidden /> Add a job you found elsewhere
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Header onAdd={onAdd} onExport={onExport} />

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="View" className="inline-flex rounded-lg border border-line bg-surface p-1">
          {([["board", "Board", LayoutGrid], ["table", "Table", Table2]] as const).map(([v, label, Icon]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? "bg-brand text-on-brand" : "text-muted hover:text-ink"}`}>
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <label htmlFor="app-search" className="sr-only">
          Search applications
        </label>
        <input id="app-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company or title" className={`${inputClass} max-w-xs`} />
        {view === "table" ? (
          <>
            <label htmlFor="app-status" className="sr-only">
              Filter by stage
            </label>
            <select id="app-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={`${inputClass} w-auto`}>
              <option value="All">All stages</option>
              <option value="Active">Active only</option>
              {APPLICATION_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </>
        ) : (
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Show rejected, withdrawn and closed ({finishedCount})
          </label>
        )}
        <span className="ml-auto text-sm text-muted" aria-live="polite">
          {filtered.length} of {items.length}
        </span>
      </div>

      {view === "board" ? (
        <Board items={filtered} columns={showFinished ? APPLICATION_STATUSES : APPLICATION_STAGES} overdueIds={overdueIds} onOpen={onOpen} onMove={onMove} />
      ) : (
        <TableView items={filtered} sort={sort} onSort={(key) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))} overdueIds={overdueIds} onOpen={onOpen} onMove={onMove} />
      )}
    </div>
  );
}

function Header({ onAdd, onExport, disabled }: { onAdd: () => void; onExport: () => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">My applications</h1>
        <p className="mt-1 text-sm text-muted">From first interest to an offer. Drag a card, or use its Move to menu.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" className={secondaryButton} onClick={onAdd}>
          <Plus className="size-4" aria-hidden /> Add application
        </button>
        <button type="button" className={secondaryButton} onClick={onExport} disabled={disabled}>
          <Download className="size-4" aria-hidden /> Export CSV
        </button>
      </div>
    </div>
  );
}

/* ---------- board ---------- */

function Board({ items, columns, overdueIds, onOpen, onMove }: { items: Application[]; columns: readonly ApplicationStatus[]; overdueIds: Set<string>; onOpen: Props["onOpen"]; onMove: Props["onMove"] }) {
  const [over, setOver] = useState<ApplicationStatus | null>(null);
  const drop = (e: DragEvent, status: ApplicationStatus) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) onMove(id, status);
  };

  return (
    <div className="grid gap-4 md:auto-cols-[17rem] md:grid-flow-col md:overflow-x-auto md:pb-3">
      {columns.map((status) => {
        const column = items.filter((a) => a.status === status);
        const finished = (APPLICATION_OUTCOMES as readonly string[]).includes(status);
        return (
          <section
            key={status}
            aria-label={`${status}, ${column.length}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver((o) => (o === status ? null : o))}
            onDrop={(e) => drop(e, status)}
            className={`rounded-xl border p-3 ${over === status ? "border-brand bg-info-bg" : finished ? "border-line bg-surface-2" : "border-line bg-surface"}`}
          >
            <h2 className="flex items-center justify-between gap-2 text-sm font-semibold">
              {status}
              <span className="rounded-full bg-surface-2 px-2 text-xs tabular-nums text-muted">{column.length}</span>
            </h2>
            <ul className="mt-3 space-y-3">
              {column.length === 0 && <li className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">Nothing here</li>}
              {column.map((a) => (
                <li key={a.job.id}>
                  <AppCard app={a} overdue={overdueIds.has(a.job.id)} onOpen={onOpen} onMove={onMove} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AppCard({ app, overdue, onOpen, onMove }: { app: Application; overdue: boolean; onOpen: Props["onOpen"]; onMove: Props["onMove"] }) {
  const next = nextInterview(app);
  const lines = [
    next?.at ? `Interview ${fmtWhen(next.at)}` : "",
    app.followUpDate && isActive(app.status) ? `Follow up ${fmtDay(app.followUpDate)}` : "",
    app.appliedAt ? `Applied ${fmtDay(app.appliedAt)}` : "",
  ].filter(Boolean);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", app.job.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="cursor-grab rounded-lg border border-line bg-surface p-3 shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => onOpen(app.job.id)} className="min-w-0 text-left" aria-label={`Open ${app.job.title} at ${app.job.company}`}>
          <span className="block text-sm font-semibold leading-snug hover:underline">{app.job.title}</span>
          <span className="block truncate text-xs text-muted">{app.job.company}</span>
        </button>
        {app.job.match && <ScoreBadge score={app.job.match.score} source={app.job.match.source} />}
      </div>
      {(lines.length > 0 || overdue) && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {overdue && (
            <li>
              <Badge tone="warn">Needs attention</Badge>
            </li>
          )}
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <label className="mt-3 flex items-center gap-2 text-xs text-muted">
        Move to
        <select value={app.status} onChange={(e) => onMove(app.job.id, e.target.value as ApplicationStatus)} aria-label={`Move ${app.job.title} to another stage`} className={`${inputClass} py-1 text-xs`}>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

/* ---------- table ---------- */

function TableView({ items, sort, onSort, overdueIds, onOpen, onMove }: { items: Application[]; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; overdueIds: Set<string>; onOpen: Props["onOpen"]; onMove: Props["onMove"] }) {
  const statusIdx = (s: ApplicationStatus) => APPLICATION_STATUSES.indexOf(s);
  const rows = useMemo(() => {
    const val = (a: Application): string | number => {
      switch (sort.key) {
        case "role":
          return `${a.job.company} ${a.job.title}`.toLowerCase();
        case "status":
          return statusIdx(a.status);
        case "match":
          return a.job.match?.score ?? -1;
        case "applied":
          return a.appliedAt ?? "9999";
        case "followUp":
          return a.followUpDate ?? "9999";
        case "interview":
          return nextInterview(a)?.at ?? "9999";
      }
    };
    return [...items].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [items, sort]);

  const th = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted">
      <button type="button" onClick={() => onSort(key)} className="inline-flex items-center gap-1 hover:text-ink">
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="border-b border-line">
          <tr>
            {th("role", "Role")}
            {th("status", "Stage")}
            {th("match", "Match")}
            {th("applied", "Applied")}
            {th("followUp", "Follow up")}
            {th("interview", "Next interview")}
            <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted">
              Resume
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((a) => (
            <tr key={a.job.id}>
              <td className="px-3 py-2.5">
                <button type="button" onClick={() => onOpen(a.job.id)} className="text-left">
                  <span className="block font-semibold hover:underline">{a.job.title}</span>
                  <span className="block text-xs text-muted">{a.job.company}</span>
                </button>
              </td>
              <td className="px-3 py-2.5">
                <select value={a.status} onChange={(e) => onMove(a.job.id, e.target.value as ApplicationStatus)} aria-label={`Stage for ${a.job.title}`} className={`${inputClass} w-auto py-1 text-xs`}>
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2.5 tabular-nums">{a.job.match ? a.job.match.score : <span className="text-muted">Not scored</span>}</td>
              <td className="px-3 py-2.5 text-muted">{fmtDay(a.appliedAt) || (wasSent(a) ? "Date not recorded" : "Not yet")}</td>
              <td className="px-3 py-2.5">
                {a.followUpDate && isActive(a.status) ? (
                  <span className={overdueIds.has(a.job.id) ? "font-medium text-warn" : "text-muted"}>{fmtDay(a.followUpDate)}</span>
                ) : (
                  <span className="text-muted">None</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-muted">{fmtWhen(nextInterview(a)?.at) || "None"}</td>
              <td className="px-3 py-2.5 text-muted">{a.resumeName ?? "Not recorded"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No applications match.</p>}
    </div>
  );
}
