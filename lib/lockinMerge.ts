// Pure merge logic for LOCK IN cross-device sync (no runtime imports, so the
// node test runner can load it directly: scripts/test_lockin_sync.mjs).
//
// Wire format of the secret gist file command-center-lockin.json:
//   entries: key -> { done: ISO | null, outcome: string | null, updatedAt }
//            one per tick/outcome key, per-item last-write-wins on updatedAt.
//            An untick is { done: null } with a fresh stamp (a tombstone), so
//            the other device's tick cannot resurrect it on the next union.
//   days:    date -> snapshot of what the list SHOWED that day (keys, titles,
//            tracks, ranks, due dates). The vault-side end-of-day review
//            (Vault/Scripts/lockin_eod_review.py) reads this, because it cannot
//            rebuild the ranked list itself. Newer updatedAt wins per day.
//
// Private items ("priv:" keys) never leave the browser: their titles are
// personal and this gist is read by a script that calls an LLM. A day
// snapshot carries only their done/total count.

import type { LockItem, LockState } from "./lockin";

export interface LockEntry {
  done: string | null;
  outcome: string | null;
  updatedAt: string;
}

export interface DayItem {
  key: string;
  title: string;
  track: string;
  rank: number;
  score: number;
  minutes: number;
  due?: string;
}

export interface DaySnapshot {
  updatedAt: string;
  items: DayItem[];
  privateDone: number;
  privateTotal: number;
}

export interface LockSyncDoc {
  v: 1;
  entries: Record<string, LockEntry>;
  days: Record<string, DaySnapshot>;
}

export const TOMBSTONE_TTL_DAYS = 45;
export const KEEP_DAYS = 30;

const isPrivate = (key: string) => key.startsWith("priv:");

/** true if a is strictly newer than b; a missing stamp loses to a present one. */
export function newer(a?: string, b?: string): boolean {
  if (!a) return false;
  if (!b) return true;
  return a > b; // ISO strings compare chronologically
}

/** Local state -> wire entries. Keys with no stamp (ticked before sync
 *  existed) get their tick time, or the epoch, so any stamped remote edit
 *  beats them but they still sync out. */
export function toEntries(state: LockState): Record<string, LockEntry> {
  const stamps = state.stamps ?? {};
  const keys = new Set([...Object.keys(state.done), ...Object.keys(state.outcome), ...Object.keys(stamps)]);
  const out: Record<string, LockEntry> = {};
  for (const key of keys) {
    if (isPrivate(key)) continue;
    out[key] = {
      done: state.done[key] ?? null,
      outcome: state.outcome[key] ?? null,
      updatedAt: stamps[key] ?? state.done[key] ?? "1970-01-01T00:00:00.000Z",
    };
  }
  return out;
}

/** Per-key LWW. On an exact tie the local side is kept. */
export function mergeEntries(
  local: Record<string, LockEntry>,
  remote: Record<string, LockEntry>,
): Record<string, LockEntry> {
  const out: Record<string, LockEntry> = { ...local };
  for (const [key, r] of Object.entries(remote)) {
    if (isPrivate(key) || !r || typeof r !== "object") continue;
    const l = out[key];
    if (!l || newer(r.updatedAt, l.updatedAt)) out[key] = r;
  }
  return out;
}

/** Write merged entries back into local state, leaving private keys alone. */
export function applyEntries(state: LockState, entries: Record<string, LockEntry>): LockState {
  const done: Record<string, string> = {};
  const outcome: Record<string, string> = {};
  const stamps: Record<string, string> = {};
  for (const [k, v] of Object.entries(state.done)) if (isPrivate(k)) done[k] = v;
  for (const [k, v] of Object.entries(state.outcome)) if (isPrivate(k)) outcome[k] = v;
  for (const [k, v] of Object.entries(state.stamps ?? {})) if (isPrivate(k)) stamps[k] = v;
  for (const [k, e] of Object.entries(entries)) {
    if (e.done) done[k] = e.done;
    if (e.outcome) outcome[k] = e.outcome;
    stamps[k] = e.updatedAt;
  }
  return { done, outcome, stamps };
}

/** What today's list showed, for the vault-side review. */
export function snapshotDay(items: LockItem[], state: LockState, nowISO: string): DaySnapshot {
  const priv = items.filter((i) => i.track === "private");
  return {
    updatedAt: nowISO,
    privateDone: priv.filter((i) => state.done[i.key]).length,
    privateTotal: priv.length,
    items: items
      .filter((i) => i.track !== "private")
      .map((i) => ({
        key: i.key,
        title: i.title,
        track: i.track,
        rank: i.rank,
        score: i.score,
        minutes: i.minutes,
        ...(i.due ? { due: i.due } : {}),
      })),
  };
}

export function mergeDays(
  local: Record<string, DaySnapshot>,
  remote: Record<string, DaySnapshot>,
): Record<string, DaySnapshot> {
  const out = { ...local };
  for (const [d, r] of Object.entries(remote)) {
    if (!r || !Array.isArray(r.items)) continue;
    if (!out[d] || newer(r.updatedAt, out[d].updatedAt)) out[d] = r;
  }
  return out;
}

/** Drop old tombstones and day snapshots so the gist stays small. Ticks are
 *  never pruned: the queues (homes, clinics, brand days) depend on them. */
export function pruneDoc(doc: LockSyncDoc, nowMs: number): LockSyncDoc {
  const tombCut = new Date(nowMs - TOMBSTONE_TTL_DAYS * 86_400_000).toISOString();
  const dayCut = new Date(nowMs - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const entries: Record<string, LockEntry> = {};
  for (const [k, e] of Object.entries(doc.entries)) {
    const tomb = !e.done && !e.outcome;
    if (tomb && e.updatedAt < tombCut) continue;
    entries[k] = e;
  }
  const days: Record<string, DaySnapshot> = {};
  for (const [d, s] of Object.entries(doc.days)) if (d >= dayCut) days[d] = s;
  return { v: 1, entries, days };
}

/** Parse gist content defensively: a corrupt file is treated as empty. */
export function parseDoc(content: string | undefined | null): LockSyncDoc | null {
  if (!content) return null;
  try {
    const d = JSON.parse(content) as Partial<LockSyncDoc>;
    const entries = d.entries && typeof d.entries === "object" ? d.entries : {};
    const days = d.days && typeof d.days === "object" ? d.days : {};
    return { v: 1, entries, days };
  } catch {
    return null;
  }
}
