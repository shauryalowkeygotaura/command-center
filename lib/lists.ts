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
  // Your answer back to me on a handoff. replyStatus is the one-tap verdict;
  // reply is optional free text. Both survive seed refreshes and are surfaced
  // by the "Copy replies for Claude" button so I can act on them next session.
  replyStatus?: "done" | "wontdo" | "needinfo";
  reply?: string;
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
// Mirror of the vault Inbox: drop raw ideas/tasks here, then "Copy for Claude"
// to hand them to me so I file them into Vault/Inbox + Notes/todos.
export const inboxStore = makeStore("revengine.command-center.inbox.v1");

// Merge the curated seed into stored items: refresh seeded text/note from the
// current seed (so my edits show up) while keeping each item's done/reply
// state. Display order for seeded items = SEED ARRAY ORDER (newest asks are
// listed first in the seed, so they always render on top); hand-added items
// follow in their saved order. Seeded items dropped from the seed were retired
// in code and are removed from storage too; hand-added items are never touched.
export function mergeChecklistSeed(
  existing: ChecklistItem[],
  seed: ChecklistItem[],
): ChecklistItem[] {
  const byId = new Map(existing.map((it) => [it.id, it]));
  const seeded = seed.map((s) => {
    const it = byId.get(s.id);
    return it ? { ...it, text: s.text, note: s.note, seeded: true } : s;
  });
  const handAdded = existing.filter((it) => !it.seeded && !seed.some((s) => s.id === it.id));
  return [...seeded, ...handAdded];
}

// ── Claude's standing asks of you (curated; newest concerns first) ───────────
// Each item is something I cannot do myself and need your hands/accounts for.
// Check them off as you go; I retire them here once confirmed done.
export const HANDOFF_SEED: ChecklistItem[] = [
  {
    id: "h-dental-demo-clip",
    text: "Record ONE 50-sec VAPI demo clip with a real clinic's name in it",
    note: "The whole edge. Clone the dental agent, swap in a Tier-A clinic's name + 2 services, call it after their closing time, record 45-60s of it booking a cleaning. This clip is what you send after a 'yes'. Without it you're just another text pitch.",
    done: false,
    seeded: true,
  },
  {
    id: "h-dental-verify-bios",
    text: "Open the 8 Tier-A Jaipur dental IG bios, confirm each WhatsApp/number",
    note: "Never DM blind. The 8 Tier-A handles are in the CALL LIST + Projects/client-acquisition-pipeline/jaipur-dental-outreach-2026-06-08.md. 2 min each.",
    done: false,
    seeded: true,
  },
  {
    id: "h-dental-send-8",
    text: "Send the 8 Tier-A Jaipur dental DMs (openers are written, paste-ready)",
    note: "Line-1 openers per clinic are in jaipur-dental-outreach-2026-06-08.md. One DM, one question ('want the clip?'), zero links in msg 1. Log each in the same doc's send-log so the funnel stops reading 0/0/0.",
    done: false,
    seeded: true,
  },
  {
    id: "h-planner-template",
    text: "Tune DAY_TEMPLATE in lib/planner.ts to your real timetable",
    note: "The PLANNER tab seeds every weekday from 5 guessed rows (school 08:00–14:30 Mon–Fri, calls 16:00, deep work 17:30, content 20:30). Edit the rows or tell me the real slots and I'll set them.",
    done: false,
    seeded: true,
  },
  {
    id: "h-football-yt-oauth",
    text: "Run `python auth_youtube.py` in Code/football-shorts-autopilot, put the 3 YT secrets in Doppler, flip YT_DRY_RUN=0",
    note: "The ONLY step left for real uploads. CI is already green daily in dry mode (renders everything, burns no quota). One browser login, then the factory goes live.",
    done: false,
    seeded: true,
  },
  // h-habit-script retired 2026-06-05: found the "Automated Habit Tracker"
  // sheet in Drive myself; the HABITS panel on the LIFE tab replicates it.
  // h-voice-confirm retired 2026-06-06: philosopher voice finalized 2026-06-05.
  // h-cc-usage retired 2026-06-06: the Stop hook auto-publishes cc-usage now.
  {
    id: "h-client-secrets",
    text: "Add the email-finder secrets to the client-acquisition-pipeline repo (Actions → Secrets)",
    note: "HUNTER_API_KEY / SNOV keys (or a DOPPLER_TOKEN). Without them the email cascade can't find addresses even once SerpAPI resets.",
    done: false,
    seeded: true,
  },
  // h-serpapi retired 2026-06-06: June quota reset + Apollo is the lead source.
  {
    id: "h-dental-phones",
    text: "Fill the +91FILL_ phone numbers in the dental clinic configs",
    note: "emergency / human-transfer / owner numbers in Marudhar + Olive Green JSON.",
    done: false,
    seeded: true,
  },
];
