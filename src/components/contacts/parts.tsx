"use client";

import { AlertTriangle, ExternalLink, Link2, Mail, Phone } from "lucide-react";
import { mailtoLink, webLink } from "@/lib/contacts/links";
import type { Contact, ContactStatus } from "@/types/contacts";
import { Badge } from "../ui";

const STATUS_TONE: Record<ContactStatus, "good" | "info" | "warn"> = { Verified: "good", "Likely match": "info", "Possible match": "warn" };

export function StatusBadge({ status }: { status: ContactStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** Where we learned of this person, with what each source says. Every contact shows at least one. */
export function Evidence({ contact }: { contact: Contact }) {
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {contact.sources.map((s) => {
          const href = webLink(s.url);
          return (
            <li key={s.id} className="rounded-lg bg-surface-2 p-2.5 text-sm">
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className="font-semibold uppercase tracking-wide">{s.type}</span>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline">
                    {host(s.url)} <ExternalLink className="size-3" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                ) : (
                  <span>{s.url.startsWith("posting:") ? "this job posting" : host(s.url)}</span>
                )}
              </p>
              {s.evidence && <p className="mt-1">&ldquo;{s.evidence}&rdquo;</p>}
            </li>
          );
        })}
      </ul>
      {contact.bioQuote && (
        <p className="text-xs text-muted">
          Public biography, quoted from a source: &ldquo;{contact.bioQuote.text}&rdquo;
        </p>
      )}
      {contact.aiNote && (
        <p className="text-xs text-muted">
          <span className="font-semibold">AI inference, not a verified fact:</span> {contact.aiNote}
        </p>
      )}
    </div>
  );
}

export function Cautions({ contact }: { contact: Contact }) {
  if (!contact.cautions.length) return null;
  return (
    <ul className="space-y-1">
      {contact.cautions.map((c) => (
        <li key={c} className="flex items-start gap-1.5 text-xs text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {c}
        </li>
      ))}
    </ul>
  );
}

/** Public business contact details and the public profile, only as found. Opens in the person's own apps. */
export function ContactLinks({ contact }: { contact: Contact }) {
  const li = webLink(contact.linkedinUrl);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {li && (
        <a href={li} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-brand underline-offset-2 hover:underline">
          <Link2 className="size-4" aria-hidden /> Public profile <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
      {contact.businessEmail && (
        <a href={mailtoLink(contact.businessEmail, "", "")} className="inline-flex items-center gap-1.5 text-brand underline-offset-2 hover:underline">
          <Mail className="size-4" aria-hidden /> {contact.businessEmail}
        </a>
      )}
      {contact.businessPhone && (
        <span className="inline-flex items-center gap-1.5">
          <Phone className="size-4 text-muted" aria-hidden /> {contact.businessPhone}
        </span>
      )}
    </div>
  );
}

export const confidenceText = (c: Contact) => `Confidence ${c.confidence} of 100, worked out from the sources`;
