// Daily "call 50 clinics" list. Self-contained: its own localStorage key,
// its own daily model. Paste the day's numbers (from the pipeline / sheet),
// check them off, uncalled ones roll to tomorrow.

export interface CallEntry {
  id: string;
  number: string;
  label?: string; // clinic name etc.
  whatsapp?: string; // wa.me-ready digits (91XXXXXXXXXX), empty for landlines
  area?: string; // locality, from the maps listing
  // One line of context shown under the number, written by the generator
  // (scripts/lead_quality.py describe()): what the place is, whether it already
  // has a website, rating/hours where the source had them. You cannot pick
  // which of 50 numbers to dial from a name alone.
  description?: string;
  // "private" | "chain". Government and institutional listings never reach the
  // file at all — they were 23% of it before the gate existed — so this is not
  // a filter, only a warning that a chain buys centrally.
  kind?: string;
  // "A" | "B" | "C", from scripts/lead_quality.py rank(). The day usually runs
  // out before the list does, so the order is the product.
  //
  // The tier is definitional, not a prediction: A means the call can reach
  // someone with the authority to say yes AND the pitch lands on this kind of
  // business, B means one of those, C means neither. Same test that removed
  // the government listings — a civil dispensary fails both.
  tier?: string;
  // Breaks ties inside a tier. Its weights are stated priors, NOT measured
  // against outcomes, which is why `reasons` travels with it.
  score?: number;
  reasons?: string[];
  called: boolean;
  // What the call actually did. Until this existed the ranking was unfalsifiable:
  // the panel stored `called` and nothing else, so no weight in rank() could
  // ever be checked against anything.
  outcome?: CallOutcome;
  outcomeAt?: string; // YYYY-MM-DD the outcome was recorded
  // The tier and score AS THEY WERE when the call was made.
  //
  // This is the whole point of the snapshot. rank()'s weights will change, and
  // comparing outcomes recorded under old rules against tiers recomputed under
  // new ones produces a confident answer to a question nobody asked. That
  // exact mistake orphaned 134 rewards in the philosopher-pipeline bandit when
  // its hook text changed. Analyse against these fields, never against the
  // live `tier`.
  tierAtCall?: string;
  scoreAtCall?: number;
  dueDate: string; // YYYY-MM-DD
}

/** What a call did. Ordered from "learned nothing" to "learned everything".
 *
 *  Chosen to test the two things the tier claims, and nothing else:
 *    REACH — did the call get past the front desk to someone who can decide?
 *            `gatekeeper` vs the three `owner-*` outcomes separates that.
 *    FIT   — given it reached them, did the pitch land? `owner-no` vs
 *            `owner-maybe` / `booked`.
 *  `dead` is kept apart from `no-answer` because a wrong or closed number is a
 *  data-quality problem, not a rejection, and lumping them would make the
 *  scraper look fine while the pitch looked bad. */
export type CallOutcome =
  | "no-answer"
  | "gatekeeper"
  | "owner-no"
  | "owner-maybe"
  | "booked"
  | "dead";

export const OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: "no-answer", label: "no answer" },
  { value: "gatekeeper", label: "front desk only" },
  { value: "owner-no", label: "owner, not interested" },
  { value: "owner-maybe", label: "owner, interested" },
  { value: "booked", label: "booked" },
  { value: "dead", label: "dead / wrong number" },
];

const REACHED: CallOutcome[] = ["owner-no", "owner-maybe", "booked"];
const WARM: CallOutcome[] = ["owner-maybe", "booked"];

export interface TierStats {
  tier: string;
  called: number;
  reached: number; // got to a decision-maker
  warm: number; // that decision-maker wanted to keep talking
  dead: number; // wrong number or closed
}

/** Per-tier outcome tally, keyed on the tier RECORDED AT CALL TIME.
 *
 *  Reads only rows that carry an outcome, so an untouched list reports
 *  nothing rather than reporting zeros that look like failure. */
export function outcomeStats(entries: CallEntry[]): TierStats[] {
  const by = new Map<string, TierStats>();
  for (const e of entries) {
    if (!e.outcome) continue;
    const tier = e.tierAtCall ?? e.tier ?? "?";
    const s =
      by.get(tier) ??
      { tier, called: 0, reached: 0, warm: 0, dead: 0 };
    s.called += 1;
    if (REACHED.includes(e.outcome)) s.reached += 1;
    if (WARM.includes(e.outcome)) s.warm += 1;
    if (e.outcome === "dead") s.dead += 1;
    by.set(tier, s);
  }
  return [...by.values()].sort((a, b) => a.tier.localeCompare(b.tier));
}

/** The rows worth exporting for analysis: one line per recorded outcome.
 *  Deliberately drops everything else — a dump of the whole store is mostly
 *  un-worked numbers, and the numbers themselves are not the finding. */
export function outcomeExport(entries: CallEntry[]) {
  return entries
    .filter((e) => e.outcome)
    .map((e) => ({
      label: e.label ?? "",
      area: e.area ?? "",
      tier: e.tierAtCall ?? e.tier ?? null,
      score: e.scoreAtCall ?? e.score ?? null,
      reasons: e.reasons ?? [],
      outcome: e.outcome,
      at: e.outcomeAt ?? null,
    }));
}

/** Call-sheet order: tier first, then score, best at the top.
 *  Tier leads because it is the part that is actually defensible; the score
 *  only arranges rows that pass or fail the same two tests. Rows with no tier
 *  (pasted by hand) sort with C rather than to the very bottom — a number you
 *  typed in yourself was deliberate. Stable, so equal rows keep their order. */
const TIER_ORDER: Record<string, number> = { A: 0, B: 1, C: 2 };

export function byRank(a: CallEntry, b: CallEntry): number {
  const ta = TIER_ORDER[a.tier ?? "C"] ?? 2;
  const tb = TIER_ORDER[b.tier ?? "C"] ?? 2;
  if (ta !== tb) return ta - tb;
  return (b.score ?? 0) - (a.score ?? 0);
}

export const CALL_TARGET = 50;

const KEY = "revengine.command-center.calls.v1";

export const callStore = {
  load(): CallEntry[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as CallEntry[]) : [];
    } catch {
      return [];
    }
  },
  save(entries: CallEntry[]): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(entries));
    } catch {
      // Quota exceeded, or storage blocked in a private window. Rows now carry
      // reasons and outcomes, so the payload only grows from here. Losing one
      // save is survivable; throwing inside a render effect takes the whole
      // panel down and loses the day's ticks with it.
    }
  },
};

/** Pull one {number, label, description} per non-empty line from pasted text.
 *  Line shapes handled: "9636180333", "+91 96361 80333 Marudhar Dental",
 *  "9636180333, Olive Green". First phone-like run = number, rest = label.
 *  A "|" splits the remainder into label and description, so a row pasted by
 *  hand can carry the same context an auto-loaded one does:
 *      "9636180333 Marudhar Dental | no website, 4.6*"                        */
export function parseNumbers(
  raw: string,
): { number: string; label?: string; description?: string }[] {
  const out: { number: string; label?: string; description?: string }[] = [];
  const trim = (v: string) =>
    v.replace(/^[\s,–—-]+|[\s,–—-]+$/g, "").trim();
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/\+?\d[\d\-\s()]{5,}\d/);
    if (!m) continue;
    const number = m[0].replace(/\s+/g, " ").trim();
    // Cut the MATCHED span out by index, not by value. `t.replace(m[0], "")`
    // removes the first textual occurrence, which is a different span whenever
    // the digits appear earlier in the line ("123 Clinic 9636180333 | rated
    // 123") — that silently corrupted the label and now the description too.
    const rest = t.slice(0, m.index) + t.slice((m.index ?? 0) + m[0].length);
    const bar = rest.indexOf("|");
    const label = trim(bar === -1 ? rest : rest.slice(0, bar)) || undefined;
    const description =
      bar === -1 ? undefined : trim(rest.slice(bar + 1)) || undefined;
    out.push({ number, label, description });
  }
  return out;
}
