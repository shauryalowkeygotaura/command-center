// Angus idea backlog for the ANGUS tab.
//
// Ideas are mined from Angus Sewell's Substack emails (angussewell@substack.com)
// by the `agunus-email-implement-scout` cloud routine + Claude sessions, and
// live in data/angus-ideas.json. IDs are permanent sequential numbers in
// email-chronological order — "build idea 7 from command center" must mean the
// same idea forever, so NEVER renumber or delete entries; retire with status
// instead. New emails append new ideas with the next free id.
//
// `status` in the JSON is the build lifecycle (Claude updates it on build);
// your yes/no verdicts and comments are localStorage-only, same as every
// other store in this app. Ideas marked "no" auto-hide from the tab after
// NO_TTL_DAYS — hidden, not deleted, so the numbering stays intact and a
// changed mind can bring one back.

import rawIdeas from "@/data/angus-ideas.json";

export type IdeaStatus = "proposed" | "building" | "built" | "rejected";
export type Verdict = "yes" | "no";

export interface AngusIdea {
  id: number;
  title: string;
  summary: string;
  effort: "S" | "M" | "L";
  relevance: string;
  status: IdeaStatus;
  source: { subject: string; date: string; threadId: string };
}

export interface VerdictMark {
  v: Verdict;
  at: string; // ISO stamp of when the verdict was set — drives the no-TTL
}

export const IDEAS: AngusIdea[] = rawIdeas as AngusIdea[];

// A "no" older than this disappears from the tab (render-side only).
export const NO_TTL_DAYS = 7;

export function isExpiredNo(mark: VerdictMark | undefined, now: Date): boolean {
  if (!mark || mark.v !== "no") return false;
  const setAt = Date.parse(mark.at);
  if (Number.isNaN(setAt)) return false;
  return now.getTime() - setAt > NO_TTL_DAYS * 24 * 60 * 60 * 1000;
}

// ── your yes/no marks (local, per device) ────────────────────────────────────
// v2 adds the timestamp; v1 (plain "yes"/"no" values) is migrated on first
// load by stamping with "now", so old marks get a full week from the upgrade.

const VERDICT_KEY_V1 = "revengine.command-center.angus.verdicts.v1";
const VERDICT_KEY = "revengine.command-center.angus.verdicts.v2";

export const verdictStore = {
  load(): Record<number, VerdictMark> {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(VERDICT_KEY);
      if (raw) return JSON.parse(raw) as Record<number, VerdictMark>;
      const old = window.localStorage.getItem(VERDICT_KEY_V1);
      if (old) {
        const v1 = JSON.parse(old) as Record<number, Verdict>;
        const now = new Date().toISOString();
        const migrated = Object.fromEntries(
          Object.entries(v1).map(([id, v]) => [id, { v, at: now }]),
        ) as Record<number, VerdictMark>;
        window.localStorage.setItem(VERDICT_KEY, JSON.stringify(migrated));
        window.localStorage.removeItem(VERDICT_KEY_V1);
        return migrated;
      }
      return {};
    } catch {
      return {};
    }
  },
  save(verdicts: Record<number, VerdictMark>): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VERDICT_KEY, JSON.stringify(verdicts));
  },
};

// ── your comments per idea (local, per device) ───────────────────────────────

const COMMENT_KEY = "revengine.command-center.angus.comments.v1";

export const commentStore = {
  load(): Record<number, string> {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(COMMENT_KEY);
      return raw ? (JSON.parse(raw) as Record<number, string>) : {};
    } catch {
      return {};
    }
  },
  save(comments: Record<number, string>): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COMMENT_KEY, JSON.stringify(comments));
  },
};

// The paste-to-Claude block: only marked or commented ideas, grouped by
// verdict, comments inline — so a paste is a complete brief, not a data dump.
export function buildClaudeExport(
  verdicts: Record<number, VerdictMark>,
  comments: Record<number, string>,
  now: Date,
): string {
  const line = (idea: AngusIdea) => {
    const c = comments[idea.id]?.trim();
    return `#${idea.id} ${idea.title}${c ? ` — comment: "${c}"` : ""}`;
  };
  const yes = IDEAS.filter((i) => verdicts[i.id]?.v === "yes");
  const no = IDEAS.filter(
    (i) => verdicts[i.id]?.v === "no" && !isExpiredNo(verdicts[i.id], now),
  );
  const commentedOnly = IDEAS.filter(
    (i) => comments[i.id]?.trim() && !verdicts[i.id],
  );

  if (yes.length === 0 && no.length === 0 && commentedOnly.length === 0)
    return "(no angus verdicts or comments yet)";

  const parts = [`Angus idea verdicts from Command Center (${now.toISOString().slice(0, 10)}):`];
  if (yes.length)
    parts.push(`BUILD THESE (yes):\n${yes.map(line).join("\n")}`);
  if (no.length) parts.push(`PASSED ON (no):\n${no.map(line).join("\n")}`);
  if (commentedOnly.length)
    parts.push(`COMMENTS (no verdict yet):\n${commentedOnly.map(line).join("\n")}`);
  return parts.join("\n\n");
}
