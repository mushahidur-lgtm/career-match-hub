"use client";

import type { ReactNode } from "react";
import { BriefcaseBusiness, CalendarClock, ClipboardList, FileUser, LayoutDashboard, Radar, Settings, type LucideIcon } from "lucide-react";

export type Tab = "overview" | "profile" | "discover" | "applications" | "interviews" | "settings";

export const TABS: Tab[] = ["overview", "profile", "discover", "applications", "interviews", "settings"];

/** Maps the tab names used before the sidebar existed onto the current ones. */
export function normalizeTab(value: unknown): Tab | undefined {
  if (typeof value !== "string") return undefined;
  if ((TABS as string[]).includes(value)) return value as Tab;
  const legacy: Record<string, Tab> = { resume: "profile", search: "discover", saved: "applications" };
  return legacy[value];
}

const ITEMS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "discover", label: "Discover jobs", icon: Radar },
  { id: "applications", label: "My applications", icon: ClipboardList },
  { id: "interviews", label: "Interview tracker", icon: CalendarClock },
  { id: "profile", label: "Resume and profile", icon: FileUser },
  { id: "settings", label: "Settings", icon: Settings },
];

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
  counts?: Partial<Record<Tab, number>>;
  /** Shown above the page content, for example the data-source status. */
  status?: ReactNode;
  children: ReactNode;
}

export function AppShell({ tab, onTab, counts, status, children }: Props) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-4 pb-2 pt-4 sm:px-6 lg:px-5 lg:pt-6">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-on-brand">
            <BriefcaseBusiness className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold leading-none tracking-tight">Career Match Hub</p>
            <p className="mt-1 hidden text-xs text-muted lg:block">Your job search, in one place</p>
          </div>
        </div>
        <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-3 pb-2 pt-1 lg:flex-col lg:overflow-visible lg:px-3 lg:pt-4">
          {ITEMS.map(({ id, label, icon: Icon }) => {
            const count = counts?.[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  tab === id ? "bg-brand text-on-brand" : "text-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">{label}</span>
                {count ? <span className={`ml-auto rounded-full px-2 text-xs tabular-nums ${tab === id ? "bg-on-brand/20" : "bg-surface-2 text-muted"}`}>{count}</span> : null}
              </button>
            );
          })}
        </nav>
        <p className="hidden px-5 pb-6 pt-8 text-xs leading-relaxed text-muted lg:absolute lg:bottom-0 lg:block">
          Your data stays in this browser.
          <br />
          Match scores are guidance, not hiring predictions.
        </p>
      </aside>

      <div className="min-w-0">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {status}
          {children}
        </div>
      </div>
    </div>
  );
}
