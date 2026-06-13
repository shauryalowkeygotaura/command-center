// Skill tree data + progress for the SKILL TREE tab.
//
// Curriculum nodes live in data/skilltree-*.json (one file per track,
// generated from the Exun induction repos + vault notes). Each node is a
// concept with an explanation, a worked example, and an exercise. The tree
// is a DAG: a node unlocks when ALL of its parents are done (parents are
// real prerequisites, not decoration). Progress (done/draft/reveals) is
// localStorage-only, same as every other store in this app.

import cpData from "@/data/skilltree-cp.json";
import webData from "@/data/skilltree-webdev.json";
import mlData from "@/data/skilltree-ml.json";

export type TrackId = "webdev" | "cp" | "ml";

export interface SkillNode {
  id: string;
  track: TrackId;
  title: string;
  subtitle: string;
  level: number;
  parents: string[]; // node ids; the track roots point at the virtual "root"
  minutes: number;
  explain: string; // markdown-lite: **bold**, `code`, \n\n paragraphs
  example: string; // code, rendered verbatim
  exercise: string;
  solution: string;
  checklist: string[];
  // Optional "field notes": the real-world shortcut / spec loophole actually
  // used in the matching Exun build. Textbook path is in explain/example;
  // this is what shipped. markdown-lite, same as explain.
  loophole?: string;
}

export const TRACKS: { id: TrackId; label: string; accent: string }[] = [
  { id: "webdev", label: "WEB DEV", accent: "#7b61ff" },
  { id: "cp", label: "COMP PROG", accent: "#ff7a1a" },
  { id: "ml", label: "ML", accent: "#9a3f4a" },
];

export const NODES: SkillNode[] = [
  ...(webData as unknown as SkillNode[]),
  ...(cpData as unknown as SkillNode[]),
  ...(mlData as unknown as SkillNode[]),
];

export const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

// children map (for the "UNLOCKED →" reveal after completing a node)
export const CHILDREN: Record<string, string[]> = {};
for (const n of NODES) {
  for (const p of n.parents) {
    (CHILDREN[p] ??= []).push(n.id);
  }
}

/* ---------------- progress store ---------------- */

export interface NodeProgress {
  done?: boolean;
  doneAt?: string;
  draft?: string; // the answer typed in the panel textarea
  submitted?: boolean; // answer submitted — unlocks the solution
  revealed?: boolean; // solution currently shown (only after submit)
  checks?: number[]; // ticked checklist indexes
}
export type Progress = Record<string, NodeProgress>;

const KEY = "revengine.command-center.skilltree.v1";

export const progressStore = {
  load(): Progress {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Progress) : {};
    } catch {
      return {};
    }
  },
  save(p: Progress): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* private mode / quota — progress just won't persist */
    }
  },
};

export function isDone(id: string, p: Progress): boolean {
  return id === "root" || !!p[id]?.done;
}

// Unlock rule: every prerequisite must be done. Strict on purpose — the
// parents ARE the concepts the node builds on.
export function isUnlocked(id: string, p: Progress): boolean {
  const node = NODE_BY_ID.get(id);
  if (!node) return false;
  return node.parents.every((pid) => isDone(pid, p));
}

export function trackStats(track: TrackId, p: Progress) {
  const nodes = NODES.filter((n) => n.track === track);
  const done = nodes.filter((n) => isDone(n.id, p)).length;
  return { done, total: nodes.length };
}

// XP = number of nodes completed (one node = one point), not minutes.
export function totalXp(p: Progress): number {
  return NODES.filter((n) => isDone(n.id, p)).length;
}

// Total nodes in the tree, so the meter can read "12 / 70".
export const TOTAL_NODES = NODES.length;

// First node you can actually work on right now, shallowest first.
export function nextUp(p: Progress): SkillNode | null {
  const candidates = NODES.filter(
    (n) => !isDone(n.id, p) && isUnlocked(n.id, p),
  );
  if (candidates.length === 0) return null;
  const depth = computeDepths();
  candidates.sort((a, b) => (depth[a.id] ?? 0) - (depth[b.id] ?? 0));
  return candidates[0];
}

/* ---------------- layout ---------------- */
// Layered DAG layout: depth = longest path from the virtual root, tracks sit
// side by side as vertical bands, siblings spread within their band row.

export interface NodePos {
  x: number;
  y: number;
}

const SPACING_X = 132;
const ROW_H = 116;
const TOP_PAD = 150; // room for the root chip
const BOTTOM_PAD = 70;

function computeDepths(): Record<string, number> {
  const depth: Record<string, number> = {};
  const visiting = new Set<string>(); // cycle guard: bad data must not hang the UI
  const get = (id: string): number => {
    if (id === "root") return 0;
    if (depth[id] !== undefined) return depth[id];
    const n = NODE_BY_ID.get(id);
    if (!n || visiting.has(id)) return 1;
    visiting.add(id);
    depth[id] = 1 + Math.max(...n.parents.map(get));
    visiting.delete(id);
    return depth[id];
  };
  for (const n of NODES) get(n.id);
  return depth;
}

export function computeLayout(): {
  pos: Record<string, NodePos>;
  rootPos: NodePos;
  width: number;
  height: number;
} {
  const depth = computeDepths();
  const pos: Record<string, NodePos> = {};

  let bandStart = 0;
  let maxDepth = 0;
  for (const track of TRACKS) {
    const nodes = NODES.filter((n) => n.track === track.id);
    const rows = new Map<number, SkillNode[]>();
    for (const n of nodes) {
      const d = depth[n.id];
      maxDepth = Math.max(maxDepth, d);
      const row = rows.get(d) ?? [];
      row.push(n);
      rows.set(d, row);
    }
    const widest = Math.max(...[...rows.values()].map((r) => r.length));
    const bandWidth = Math.max(2, widest) * SPACING_X;
    const center = bandStart + bandWidth / 2;
    for (const [d, row] of rows) {
      row.forEach((n, i) => {
        pos[n.id] = {
          x: center + (i - (row.length - 1) / 2) * SPACING_X,
          y: TOP_PAD + (d - 1) * ROW_H,
        };
      });
    }
    bandStart += bandWidth + 40;
  }

  const width = bandStart;
  return {
    pos,
    rootPos: { x: width / 2, y: 48 },
    width,
    height: TOP_PAD + (maxDepth - 1) * ROW_H + BOTTOM_PAD,
  };
}
