"use client";

import { Search } from "lucide-react";
import { jobKey } from "@/lib/backup";
import { contactsForJob } from "@/lib/contacts/model";
import type { Application } from "@/types/job";
import { secondaryButton } from "../ui";
import { useContacts } from "./context";
import { StatusBadge } from "./parts";

/** The contacts tied to one application, shown inside the application, with a way to find more. */
export function LinkedContacts({ app }: { app: Application }) {
  const api = useContacts();
  const key = jobKey(app.job);
  const mine = [...new Map([...contactsForJob(api.store, key), ...api.store.contacts.filter((c) => c.applicationJobIds.includes(app.job.id))].map((c) => [c.id, c])).values()];
  return (
    <div className="space-y-3">
      {mine.length === 0 ? (
        <p className="text-sm text-muted">No contacts saved for this job yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {mine.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <button type="button" className="min-w-0 text-left hover:underline" onClick={() => api.openContact(c.id)}>
                <span className="font-medium">{c.name}</span> <span className="text-muted">· {c.title || c.type} · {c.stage}</span>
              </button>
              <StatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={secondaryButton} onClick={() => api.openFinder(app.job)}>
        <Search className="size-4" aria-hidden /> Find recruiter
      </button>
    </div>
  );
}
