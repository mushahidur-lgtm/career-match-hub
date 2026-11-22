"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { Job } from "@/types/job";
import { RecruiterPanel } from "./RecruiterPanel";

/** A modal shell, the same as the app's other dialogs. */
export function Modal({ titleId, title, subtitle, onClose, children }: { titleId: string; title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
      className="m-auto w-[min(52rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink"
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface p-5 pb-3">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-xl font-semibold leading-snug">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
          <X className="size-5" aria-hidden />
        </button>
      </header>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

export function RecruiterDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  return (
    <Modal titleId={`recruiter-${job.id}`} title="Find recruiter" subtitle={`${job.title} at ${job.company}`} onClose={onClose}>
      <RecruiterPanel job={job} />
    </Modal>
  );
}
