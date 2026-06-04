// Two lightweight checklists that live alongside the daily board:
//   - LIFE     : your freeform real-life to-dos (you fill it)
//   - HANDOFFS : things only YOU can do for me (Claude curates the seed below;
//                check-off state is saved locally). Edit HANDOFF_SEED each
//                session to add/retire asks — done state survives edits.

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  note?: string;
  seeded?: boolean; // true = comes from a code seed (HANDOFF_SEED), not hand-added
}

function makeStore(key: string) {
  return {
    load(): ChecklistItem[] {
      if (typeof window === "undefined") return [];
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as ChecklistItem[]) : [];
      } catch {
        return [];
      }
    },
    save(items: ChecklistItem[]): void {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, JSON.stringify(items));
    },
  };
}

export const lifeStore = makeStore("revengine.command-center.life.v1");
export const handoffStore = makeStore("revengine.command-center.handoffs.v1");

// Merge the curated seed into stored items: refresh seeded text/note from the
// current seed (so my edits show up) while keeping each item's done state, and
// append brand-new seeds. Hand-added items are left untouched.
export function mergeChecklistSeed(
  existing: ChecklistItem[],
  seed: ChecklistItem[],
): ChecklistItem[] {
  const seedById = new Map(seed.map((s) => [s.id, s]));
  const refreshed = existing.map((it) => {
    const s = seedById.get(it.id);
    return s ? { ...it, text: s.text, note: s.note, seeded: true } : it;
  });
  const ids = new Set(existing.map((it) => it.id));
  return [...refreshed, ...seed.filter((s) => !ids.has(s.id))];
}

// ── Claude's standing asks of you (curated; newest concerns first) ───────────
// Each item is something I cannot do myself and need your hands/accounts for.
// Check them off as you go; I retire them here once confirmed done.
export const HANDOFF_SEED: ChecklistItem[] = [
  {
    id: "h-habit-script",
    text: "Send me your habit-tracker app script so I can replicate it here",
    note: "The habit tracker is waiting on this — I'll match your existing app, not guess.",
    done: false,
    seeded: true,
  },
  {
    id: "h-voice-confirm",
    text: "Listen to the deep philosopher voice + tell me deeper / lighter",
    note: "output/smoketest-kinetic-v2.mp4 — now an elder-sage 82 Hz (was 87). Locked to STYLE=kinetic on the live cron.",
    done: false,
    seeded: true,
  },
  {
    id: "h-repos-public",
    text: "Confirm philosopher-pipeline + client-acquisition-pipeline repos are PUBLIC",
    note: "The dashboard fetches each repo's runs/latest.json over raw.githubusercontent — private repos return 404 and the rows show 'no data'.",
    done: false,
    seeded: true,
  },
  {
    id: "h-cc-usage",
    text: "Run `python scripts/update_cc_usage.py` then commit, to refresh the TOKENS panel",
    note: "I can't read your local Claude Code transcripts from CI, so this is a manual local refresh (free, nothing leaves your machine).",
    done: false,
    seeded: true,
  },
  {
    id: "h-client-secrets",
    text: "Add the email-finder secrets to the client-acquisition-pipeline repo (Actions → Secrets)",
    note: "HUNTER_API_KEY / SNOV keys (or a DOPPLER_TOKEN). Without them the email cascade can't find addresses even once SerpAPI resets.",
    done: false,
    seeded: true,
  },
  {
    id: "h-serpapi",
    text: "SerpAPI free quota is exhausted — wait for the monthly reset, or switch to free Apollo source",
    note: "That's why client-acq found 0 leads. MAX_CITIES_PER_RUN=2 now stops it re-exhausting. For leads sooner free: LEAD_SOURCE=apollo with saved cookies.",
    done: false,
    seeded: true,
  },
  {
    id: "h-profile-repo",
    text: "Rename the GitHub profile-README repo to `shauryalowkeygotaura`",
    note: "GitHub doesn't auto-rename it on username change, so your profile README stays dark until you do.",
    done: false,
    seeded: true,
  },
  {
    id: "h-dental-phones",
    text: "Fill the +91FILL_ phone numbers in the dental clinic configs",
    note: "emergency / human-transfer / owner numbers in Marudhar + Olive Green JSON.",
    done: false,
    seeded: true,
  },
];
