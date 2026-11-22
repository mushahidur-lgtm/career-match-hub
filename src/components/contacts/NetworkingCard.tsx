"use client";

import { UsersRound } from "lucide-react";
import { useMemo } from "react";
import { contactReminders, networkingStats } from "@/lib/contacts/model";
import { Badge } from "../ui";
import { useContacts } from "./context";

/** Networking follow-ups due, and where your contacts stand. Shown on the Overview only when you have saved contacts. */
export function NetworkingCard({ onGo }: { onGo: () => void }) {
  const api = useContacts();
  const { contacts } = api.store;
  const reminders = useMemo(() => contactReminders(contacts), [contacts]);
  const stats = useMemo(() => networkingStats(contacts), [contacts]);
  if (contacts.length === 0) return null;
  const active = stats.byStage.filter((s) => s.value > 0);
  return (
    <section aria-labelledby="networking-heading" className="space-y-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="networking-heading" className="flex items-center gap-2 font-display text-lg font-semibold">
          <UsersRound className="size-5 text-brand" aria-hidden /> Networking
        </h2>
        <button type="button" className="text-sm font-semibold text-brand underline-offset-2 hover:underline" onClick={onGo}>
          Open HR &amp; Recruiter Finder
        </button>
      </div>
      <p className="text-sm text-muted">
        {stats.total} saved {stats.total === 1 ? "contact" : "contacts"}
        {active.length ? `: ${active.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(", ")}` : ""}.
      </p>
      {reminders.length > 0 ? (
        <ul className="divide-y divide-line">
          {reminders.slice(0, 5).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <button type="button" className="text-left font-medium hover:underline" onClick={() => api.openContact(r.contactId)}>
                {r.label}
              </button>
              <Badge tone={r.overdue ? "warn" : "neutral"}>{r.when}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No networking follow-ups due this week.</p>
      )}
    </section>
  );
}
