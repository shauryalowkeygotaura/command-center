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
// your own yes/no verdict is localStorage-only, same as every other store.

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

export const IDEAS: AngusIdea[] = rawIdeas as AngusIdea[];

// ── your yes/no marks (local, per device) ────────────────────────────────────

const VERDICT_KEY = "revengine.command-center.angus.verdicts.v1";

export const verdictStore = {
  load(): Record<number, Verdict> {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(VERDICT_KEY);
      return raw ? (JSON.parse(raw) as Record<number, Verdict>) : {};
    } catch {
      return {};
    }
  },
  save(verdicts: Record<number, Verdict>): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VERDICT_KEY, JSON.stringify(verdicts));
  },
};
