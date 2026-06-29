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
    id: "h-instagram-creds",
    text: "Add Instagram creds so the new IG DM channel goes live (NOT here, in Doppler + GH secrets)",
    note: "Built 2026-06-29: instagram.py is a live send channel (informal DM copy, hides the thread after send so only repliers show in your inbox, no auto-replies). It is OFF until creds exist. They do NOT go in the Command Center, they go where the pipeline runs: Doppler project client-acquisition-pipeline (INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD, INSTAGRAM_ENABLED=1) AND as GH repo secrets (pipeline.yml env reads secrets.*). Use a BURNER IG, not your personal handle, automated cold DMs get soft-banned. Reply with the burner user/pass and I will set Doppler + the gh secrets for you.",
    done: false,
    seeded: true,
  },
  {
    id: "h-video-pitch-wip",
    text: "Decide on modules/video_pitch.py (your untracked WIP) — commit it or bin it?",
    note: "Found 2026-06-29 untracked in client-acquisition-pipeline: a coherent $0 personalized pitch-video generator (Groq script + edge-tts + Playwright recording + ffmpeg). I did NOT commit it (you authored it, not me) and left the edge-tts line in requirements.txt intact. It is not wired into the pipeline yet. Tell me to commit + wire it into the qualified-lead flow, or to drop it.",
    done: false,
    seeded: true,
  },
  {
    id: "h-apollo-cookies",
    text: "Run `python scripts/save_apollo_cookies.py` in Code/client-acquisition-pipeline (one Apollo login)",
    note: "FOUND 2026-06-10: the APOLLO_COOKIES_JSON repo secret was never set, so the daily pipeline scrapes 0 leads. The script opens a browser, you log in to Apollo once, it writes apollo_cookies.json — then paste it: gh secret set APOLLO_COOKIES_JSON -R shauryalowkeygotaura/client-acquisition-pipeline --body (Get-Content apollo_cookies.json -Raw). Or just run the script and tell me — I'll do the gh part.",
    done: false,
    seeded: true,
  },
  {
    id: "h-dental-send-8",
    text: "Send the 8 Tier-A Jaipur dental DMs — fully assembled, just paste",
    note: "I verified all 8 bios via web (2026-06-10, table in jaipur-dental-outreach-2026-06-08.md) and assembled the complete DMs with honesty guardrails applied — scroll to 'Paste-ready DMs'. The 57-sec demo clip for Dr. Ruby is rendered and ready to send after her 'yes' (Code/dental-receptionist/demo_clips/). Use @dr_ankurgoyal_ (personal) for #4, and tap each bio in the IG app once for WhatsApp buttons. Log sends in jaipur-sends-log.md.",
    done: false,
    seeded: true,
  },
  {
    id: "h-football-yt-oauth",
    text: "World Cup is HERE: 3-min Google Cloud step + `python auth_youtube.py`, then I flip YT_DRY_RUN=0",
    note: "Verified 2026-06-10: every other piece is wired (DOPPLER_TOKEN in GH, doppler.yaml → youtube-title-autoresearch/dev, CI green daily in dry mode). Missing ONLY: console.cloud.google.com → enable YouTube Data API v3 → OAuth client (Desktop) → save client_secret.json next to auth_youtube.py → run it; it prints the exact doppler commands. I left YT_DRY_RUN=1 on purpose — flipping early would crash tomorrow's scheduled run.",
    done: false,
    seeded: true,
  },
  {
    id: "h-planner-template",
    text: "Send me your real Class-11 timetable (July onward)",
    note: "DONE for June (2026-06-10): the planner now mirrors the Jaipur sprint doc's dental two-session windows (11:00–13:30 / 17:00–19:30) through Jun 30 — not a guess. School rows resume Jul 1 but the 08:00–14:30 slot is still my guess; reply with the real DPS RK Puram timing and I'll set it.",
    done: false,
    seeded: true,
  },
  {
    id: "h-client-secrets",
    text: "Sign up free at hunter.io (2 min) and paste the API key back to me",
    note: "Shrunk 2026-06-10: I wired the workflow to pass HUNTER_API_KEY / SNOV_* into the job (it never did before) — the only missing piece is a key, and key signup needs your email. Free tier = 50 finds/month. Paste it in the reply box here and I'll set Doppler + the repo secret.",
    done: false,
    seeded: true,
  },
  // h-habit-script retired 2026-06-05: found the "Automated Habit Tracker"
  // sheet in Drive myself; the HABITS panel on the LIFE tab replicates it.
  // h-voice-confirm retired 2026-06-06: philosopher voice finalized 2026-06-05.
  // h-cc-usage retired 2026-06-06: the Stop hook auto-publishes cc-usage now.
  // h-serpapi retired 2026-06-06: June quota reset + Apollo is the lead source.
  // h-dental-demo-clip retired 2026-06-10: Claude rendered the 57.6s clip itself
  //   (edge-tts production voices + ffmpeg phone EQ) for Your Dentist Jaipur —
  //   Code/dental-receptionist/demo_clips/, script reusable per clinic.
  // h-dental-verify-bios retired 2026-06-10: all 8 Tier-A handles web-verified;
  //   corrections (Maharishi=Sanganer, @dr_ankurgoyal_ personal IG, @vivan_dental
  //   found) + numbers in jaipur-dental-outreach-2026-06-08.md.
  // h-dental-phones retired 2026-06-10: all FILL_ slots filled with each clinic's
  //   verified public front-desk line (safe by construction); swap owner_callback
  //   for the doctors' direct mobiles when they share them.
];
