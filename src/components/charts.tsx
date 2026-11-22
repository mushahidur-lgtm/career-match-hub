"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * Small charts drawn from real counts only. One colour (the app's brand colour) is used for a single
 * measure, so colour never has to be told apart. Every chart can be read as a table, and shows its numbers
 * as text, so nothing depends on seeing the bars.
 */

export interface Row {
  label: string;
  value: number;
  /** Shown after the value, for example "of 12 jobs". */
  note?: string;
  /** Marks a row that stands out, for example a skill you already have. Drawn with a pattern, not only a colour. */
  muted?: boolean;
}

export function ChartFrame({ title, subtitle, table, children }: { title: string; subtitle?: string; table: { head: string[]; rows: (string | number)[][] }; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={id} className="font-display text-base font-semibold">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} className="rounded-md px-2 py-1 text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>
      <div className="mt-3">
        {asTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  {table.head.map((h) => (
                    <th key={h} scope="col" className="py-1.5 pr-4 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    {r.map((c, j) => (
                      <td key={j} className="py-1.5 pr-4 tabular-nums">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** Horizontal bars with the label and number written out. Used for rankings and categories. */
export function BarList({ rows, empty = "Nothing to show yet.", max }: { rows: Row[]; empty?: string; max?: number }) {
  if (!rows.length) return <p className="py-4 text-sm text-muted">{empty}</p>;
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]" title={`${r.label}: ${r.value}${r.note ? ` ${r.note}` : ""}`}>
          <span className="truncate">{r.label}</span>
          <span className="h-2.5 rounded-r bg-surface-2" aria-hidden>
            <span
              className="block h-full rounded-r"
              style={{
                width: `${Math.max(r.value > 0 ? 2 : 0, (r.value / top) * 100)}%`,
                background: r.muted ? "repeating-linear-gradient(45deg, var(--brand) 0 3px, transparent 3px 6px)" : "var(--brand)",
                boxShadow: r.muted ? "inset 0 0 0 1px var(--brand)" : undefined,
              }}
            />
          </span>
          <span className="whitespace-nowrap text-right tabular-nums">
            <strong className="font-semibold">{r.value}</strong>
            {r.note && <span className="ml-1 text-xs text-muted">{r.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const shortDay = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const W = 640;
const H = 190;
const PAD = { l: 32, r: 8, t: 10, b: 24 };

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function Axes({ top, unit = "" }: { top: number; unit?: string }) {
  const ticks = [0, top / 2, top];
  return (
    <>
      {ticks.map((t) => {
        const y = PAD.t + (1 - t / top) * (H - PAD.t - PAD.b);
        return (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
              {Math.round(t * 10) / 10}
              {unit}
            </text>
          </g>
        );
      })}
    </>
  );
}

function XLabels({ days }: { days: string[] }) {
  const step = Math.ceil(days.length / 6);
  const inner = W - PAD.l - PAD.r;
  return (
    <>
      {days.map((d, i) =>
        i % step === 0 || i === days.length - 1 ? (
          <text key={d} x={PAD.l + ((i + 0.5) / days.length) * inner} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
            {shortDay(d)}
          </text>
        ) : null,
      )}
    </>
  );
}

/** One column per day. Hover a column to read its value; the table view has every day for keyboard and screen-reader users. */
export function ColumnChart({ days, label, unit }: { days: { day: string; value: number }[]; label: string; unit: string }) {
  const [hot, setHot] = useState<number | null>(null);
  const top = niceMax(Math.max(0, ...days.map((d) => d.value)));
  const inner = W - PAD.l - PAD.r;
  const slot = inner / days.length;
  const bar = Math.min(14, slot * 0.6);
  const total = days.reduce((n, d) => n + d.value, 0);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. ${total} ${unit} over ${days.length} days. Use "Show as table" for each day.`} className="h-auto w-full">
        <Axes top={top} />
        <XLabels days={days.map((d) => d.day)} />
        {days.map((d, i) => {
          const h = (d.value / top) * (H - PAD.t - PAD.b);
          const x = PAD.l + slot * i + (slot - bar) / 2;
          const y = H - PAD.b - h;
          return (
            <g key={d.day} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}>
              <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
              {d.value > 0 && <path d={`M${x},${H - PAD.b} V${y + 4} q0,-4 4,-4 h${bar - 8} q4,0 4,4 V${H - PAD.b} z`} fill="var(--brand)" opacity={hot === null || hot === i ? 1 : 0.55} />}
            </g>
          );
        })}
      </svg>
      {hot !== null && (
        <div className="pointer-events-none absolute top-1 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-sm" style={{ left: `${Math.min(80, Math.max(2, ((PAD.l + slot * (hot + 0.5)) / W) * 100 - 8))}%` }}>
          <span className="font-semibold">{shortDay(days[hot].day)}</span>: {days[hot].value} {unit}
        </div>
      )}
    </div>
  );
}

/** A line across days. A day with no value leaves a gap, never a made-up point. Hover a point to read it; the table view has every day. */
export function LineChart({ days, label, unit, domain = [0, 100] }: { days: { day: string; value: number | null }[]; label: string; unit: string; domain?: [number, number] }) {
  const [hot, setHot] = useState<number | null>(null);
  const [lo, hi] = domain;
  const inner = W - PAD.l - PAD.r;
  const slot = inner / days.length;
  const px = (i: number) => PAD.l + slot * (i + 0.5);
  const py = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const real = days.flatMap((d, i) => (d.value === null ? [] : [{ i, v: d.value }]));
  // Break the line wherever a day has no value.
  let path = "";
  let prev = -2;
  for (const p of real) {
    path += `${p.i === prev + 1 ? "L" : "M"}${px(p.i)},${py(p.v)} `;
    prev = p.i;
  }
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. ${real.length} of ${days.length} days have a value. Use "Show as table" for each day.`} className="h-auto w-full">
        <Axes top={hi} />
        <XLabels days={days.map((d) => d.day)} />
        {path && <path d={path} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {real.map((p) => (
          <g key={p.i} onMouseEnter={() => setHot(p.i)} onMouseLeave={() => setHot(null)}>
            <circle cx={px(p.i)} cy={py(p.v)} r={12} fill="transparent" />
            <circle cx={px(p.i)} cy={py(p.v)} r={4} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        ))}
      </svg>
      {hot !== null && days[hot].value !== null && (
        <div className="pointer-events-none absolute top-1 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-sm" style={{ left: `${Math.min(80, Math.max(2, (px(hot) / W) * 100 - 8))}%` }}>
          <span className="font-semibold">{shortDay(days[hot].day)}</span>: {days[hot].value}
          {unit}
        </div>
      )}
    </div>
  );
}

/** A figure with a label and, when it matters, a caveat. Used where a chart would add nothing. */
export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
