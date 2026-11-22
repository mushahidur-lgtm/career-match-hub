"use client";

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { parseLocalDateTime } from "@/lib/applications";
import type { Application, Interview } from "@/types/job";
import type { ApplicationTab } from "./ApplicationDialog";
import { fmtWhen } from "./ApplicationsPage";
import { interviewBadge } from "./InterviewEditor";
import { Badge, secondaryButton } from "./ui";

interface Row {
  app: Application;
  iv: Interview;
}

interface Props {
  items: Application[];
  onOpen: (id: string, tab?: ApplicationTab) => void;
  onGoApplications: () => void;
  now?: Date;
}

export function InterviewTracker({ items, onOpen, onGoApplications, now = new Date() }: Props) {
  const groups = useMemo(() => {
    const rows: Row[] = items.flatMap((app) => (app.interviews ?? []).map((iv) => ({ app, iv })));
    const when = (r: Row) => parseLocalDateTime(r.iv.at)?.getTime() ?? null;
    const t = now.getTime();
    const scheduled = rows.filter((r) => r.iv.status === "Scheduled");
    return {
      upcoming: scheduled.filter((r) => (when(r) ?? -1) >= t).sort((a, b) => when(a)! - when(b)!),
      needsNotes: scheduled.filter((r) => when(r) !== null && when(r)! < t).sort((a, b) => when(b)! - when(a)!),
      unscheduled: scheduled.filter((r) => when(r) === null),
      past: rows.filter((r) => r.iv.status !== "Scheduled").sort((a, b) => (when(b) ?? 0) - (when(a) ?? 0)),
      total: rows.length,
    };
  }, [items, now]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Interview tracker</h1>
        <p className="mt-1 text-sm text-muted">Every interview across your applications. Open one to prepare, add notes, or record how it went.</p>
      </div>

      {groups.total === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-14">
          <h2 className="font-display text-xl font-semibold">No interviews yet</h2>
          <p className="mt-2 max-w-prose text-sm text-muted">Open an application and add an interview from its Interviews tab. Adding one moves the application to the Interview stage.</p>
          <button type="button" className={`${secondaryButton} mt-4`} onClick={onGoApplications}>
            Go to My applications
          </button>
        </div>
      ) : (
        <>
          <Group title="Record how it went" empty="" rows={groups.needsNotes} onOpen={onOpen} tone="warn" />
          <Group title="Upcoming" empty="No interviews scheduled. Set a date on one to see it here." rows={groups.upcoming} onOpen={onOpen} />
          <Group title="Time not set" empty="" rows={groups.unscheduled} onOpen={onOpen} />
          <Group title="Past and cancelled" empty="" rows={groups.past} onOpen={onOpen} />
        </>
      )}
    </div>
  );
}

function Group({ title, rows, empty, onOpen, tone }: { title: string; rows: Row[]; empty: string; onOpen: Props["onOpen"]; tone?: "warn" }) {
  if (!rows.length && !empty) return null;
  return (
    <section aria-label={title}>
      <h2 className="font-display text-lg font-semibold">
        {title} <span className="text-sm font-normal text-muted">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map(({ app, iv }) => (
            <li key={iv.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <CalendarClock className="size-4 text-brand" aria-hidden />
                  {iv.stage} · {iv.format}
                  {interviewBadge(iv)}
                  {tone === "warn" && <Badge tone="warn">No notes yet</Badge>}
                </p>
                <p className="mt-0.5 text-sm">
                  {app.job.title} at {app.job.company}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {fmtWhen(iv.at) || "Time not set"}
                  {iv.interviewers ? ` · ${iv.interviewers}` : ""}
                </p>
              </div>
              <button type="button" className={secondaryButton} onClick={() => onOpen(app.job.id, "interviews")} aria-label={`Open ${iv.stage} interview for ${app.job.title}`}>
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
