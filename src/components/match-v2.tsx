"use client";

import { useState } from "react";
import type { CheckStatus, EvidencedPoint, Job, MatchResult, PostingStatus, RecommendedAction } from "@/types/job";
import { DESCRIPTION_LABEL, VERIFICATION_LABEL } from "@/lib/jobs/apply-check";
import { useFeedback } from "./feedback-context";
import { Badge, inputClass, secondaryButton } from "./ui";

type Tone = "good" | "info" | "warn" | "neutral";

export const ACTION_LABEL: Record<RecommendedAction, [string, Tone]> = {
  strong_match: ["Strong match", "good"],
  consider: ["Worth considering", "info"],
  upskill: ["Needs upskilling", "neutral"],
  not_recommended: ["Not recommended", "neutral"],
  verify_requirements: ["Verify requirements", "warn"],
};
export const ELIGIBILITY_LABEL: Record<CheckStatus, [string, Tone]> = {
  preferred_missing: ["Preferred qualification missing", "neutral"],
  eligible: ["Eligible", "good"],
  not_eligible: ["Not eligible", "warn"],
  needs_verification: ["Check eligibility", "warn"],
  not_applicable: ["No eligibility condition found", "neutral"],
};
export const POSTING_LABEL: Record<PostingStatus, [string, Tone]> = {
  retrieved: ["Posting retrieved", "neutral"],
  partial: ["Partial posting", "warn"],
  expired: ["Posting closed", "warn"],
  unreachable: ["Posting unreachable", "warn"],
  unverified: ["Posting unverified", "neutral"],
};

/** Posting completeness and checks, shown on a result card. Kept apart from the match score. */
export function PostingBadges({ job }: { job: Job }) {
  const d = job.match?.detail;
  const total = d?.skillEvidence?.filter((s) => s.importance === "required").length ?? 0;
  const preferredMissing = job.match?.eligibility?.checks.some((c) => c.status === "preferred_missing");
  return (
    <>
      {job.verification && <Badge tone={VERIFICATION_LABEL[job.verification.state][1]}>{VERIFICATION_LABEL[job.verification.state][0]}</Badge>}
      {job.enrichment && <Badge>{DESCRIPTION_LABEL[job.enrichment.status]}</Badge>}
      {d && total > 0 && <Badge>Required skills {d.requiredMatched.length}/{total}</Badge>}
      {job.match && <Badge>{job.match.ai?.status === "applied" ? "Reviewed by Claude" : "Rules only"}</Badge>}
      {d?.careerAlignment?.relation === "transition" && <Badge tone="info">Career transition</Badge>}
      {preferredMissing && <Badge>Preferred qualification missing</Badge>}
    </>
  );
}

/** The badges shown on a result card. */
export function MatchBadges({ match }: { match: MatchResult }) {
  const action = match.recommendedAction && ACTION_LABEL[match.recommendedAction];
  const eligibility = match.eligibility && match.eligibility.status !== "not_applicable" ? ELIGIBILITY_LABEL[match.eligibility.status] : null;
  const posting = match.postingStatus && match.postingStatus !== "retrieved" ? POSTING_LABEL[match.postingStatus] : null;
  return (
    <>
      {action && <Badge tone={action[1]}>{action[0]}</Badge>}
      {eligibility && <Badge tone={eligibility[1]}>{eligibility[0]}</Badge>}
      {posting && <Badge tone={posting[1]}>{posting[0]}</Badge>}
    </>
  );
}

/** How the number was reached, the eligibility gates and doubts about the analysis. */
export function ScoreSummary({ match }: { match: MatchResult }) {
  const d = match.detail;
  const e = match.eligibility;
  const adj = match.aiAdjustment ?? 0;
  if (match.deterministicScore === undefined) return null;
  return (
    <section aria-label="Score summary" className="space-y-3">
      <p className="text-sm">
        <span className="font-semibold">{match.score}/100</span> = {match.deterministicScore} from the rules
        {match.ai?.status === "applied" ? `, ${adj >= 0 ? "+" : ""}${adj} from Claude` : ""}.
        {d?.confidenceScore !== undefined && ` Confidence ${d.confidenceScore}/100 (${d.confidence}).`}
      </p>
      {match.ai && match.ai.status !== "applied" && (
        <p className="text-xs text-muted">
          {match.ai.status === "unavailable" ? "Claude is not connected, so this is a rule-based score." : match.ai.status === "failed" ? "Claude's review failed, so this is a rule-based score." : "Claude reviews only the top results; this is a rule-based score."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <MatchBadges match={match} />
      </div>
      {e && e.checks.length > 0 && (
        <ul className="space-y-2">
          {e.checks.map((c) => (
            <li key={`${c.gate}-${c.postingEvidence}`} className="rounded-lg border border-line p-3 text-sm">
              <p className="font-semibold">
                {ELIGIBILITY_LABEL[c.status][0]}: {c.note}
              </p>
              <p className="mt-1 text-xs text-muted">Posting: “{c.postingEvidence}”</p>
              {c.candidateEvidence && <p className="text-xs text-muted">{c.candidateEvidence}</p>}
            </li>
          ))}
        </ul>
      )}
      {d?.flags?.map((f) => (
        <p key={f} className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
          {f}
        </p>
      ))}
      {match.ai?.concerns?.length ? <p className="text-sm text-muted">Claude&apos;s concerns: {match.ai.concerns.join(" ")}</p> : null}
    </section>
  );
}

export function Points({ title, points }: { title: string; points: EvidencedPoint[] }) {
  if (!points.length) return null;
  return (
    <section aria-label={title}>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <ul className="mt-2 space-y-2">
        {points.map((p) => (
          <li key={p.text} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <p>
              {p.text}
              {p.source === "ai" && <span className="ml-2 text-xs text-muted">from Claude</span>}
            </p>
            {p.evidence.map((e) => (
              <p key={e} className="mt-1 text-xs text-muted">
                “{e}”
              </p>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Lets you say where the analysis was wrong. Recorded only; scores are not changed by it. */
export function Corrections({ job }: { job: Job }) {
  const record = useFeedback();
  const [skill, setSkill] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const skills = job.match?.detail?.skillEvidence?.map((s) => s.skill) ?? [];
  const note = (message: string) => setDone(message);
  return (
    <section aria-label="Corrections" className="space-y-2 border-t border-line pt-4">
      <h3 className="text-sm font-semibold">Is something wrong?</h3>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={secondaryButton} onClick={() => (record("marked_irrelevant", job), note("Noted as not relevant."))}>
          Not relevant to me
        </button>
        <button type="button" className={secondaryButton} onClick={() => (record("eligibility_corrected", job, job.match?.eligibility?.status), note("Noted that the eligibility result is wrong."))}>
          Eligibility is wrong
        </button>
        {skills.length > 0 && (
          <>
            <label className="sr-only" htmlFor={`fix-${job.id}`}>
              Skill that was matched wrongly
            </label>
            <select id={`fix-${job.id}`} value={skill} onChange={(e) => setSkill(e.target.value)} className={`${inputClass} w-auto py-1.5`}>
              <option value="">Choose a skill</option>
              {skills.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button type="button" className={secondaryButton} disabled={!skill} onClick={() => (record("skill_match_corrected", job, skill), note(`Noted that ${skill} was matched wrongly.`))}>
              Skill match is wrong
            </button>
          </>
        )}
      </div>
      {done && (
        <p role="status" className="text-sm text-muted">
          {done} Scores are not changed automatically.
        </p>
      )}
    </section>
  );
}
