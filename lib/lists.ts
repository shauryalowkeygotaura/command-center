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
  // Sync metadata (used by the INBOX list's gist sync — see inboxSync.ts).
  // updatedAt: ISO stamp of the last local edit, drives last-write-wins merge.
  // deleted: tombstone instead of hard removal, so deletes propagate.
  updatedAt?: string;
  deleted?: boolean;
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
    id: "h-autoshop-pdf-attach-decision",
    text: "autoshop: pick the PDF-attach fix (a) self-hosted download link (b) Playwright dashboard upload (c) static evergreen PDFs",
    note: "2026-07-18: live run 29635870338 proved the pipeline is green end-to-end, but the honest file_uploaded status exposed that Lemon Squeezy's v1 API has NO file-upload endpoint (405 every run, always has). So each run refreshes title/description/price while buyers still download the dashboard-attached PDF. Details + trade-offs in Projects/autoshop/bugs.md Open. Reply a/b/c and I build it; until then the shop sells the old PDFs, nothing is broken or losing money.",
    done: false,
    seeded: true,
  },
  {
    id: "h-autoshop-ig-session",
    text: "autoshop: enable IG posting - run `python login_instagram.py` locally, then set the INSTAGRAM_SESSION repo secret",
    note: "2026-07-18: CI skips Instagram cleanly every run until this exists. In Code/autoshop run `python login_instagram.py` (interactive, handles 2FA), then `gh secret set INSTAGRAM_SESSION --repo shauryalowkeygotaura/autoshop < instagram.session`. Redo whenever the run log shows the skip line again (session expiry). Only you can do the login; everything else is already wired.",
    done: false,
    seeded: true,
  },
  {
    id: "h-ship-five-features",
    text: "Review + ship the 5 verified features (all sit uncommitted in working trees; nothing deployed)",
    note: "Built + adversarially verified across the 2026-07-02..18 ultracode session, ALL PASS. Per repo: (1) clinic-demo: TWO features share the tree; commit Attract Mode (index.html attract parts, api/patient.js, api/tts.py, README, requirements.txt) and Grill Room (api/_drill.js, api/score.js, api/chat.js drill branch, index.html drill UI) as separate commits, push, Vercel auto-deploys; drill URL: clinic-demo-blond.vercel.app/?mode=drill&clinic=Test%20Clinic (never send to prospects). (2) portfolio: Ambush Voice (?from= personalised voice greeting) is tsc/build clean; push is FIXED as of 2026-07-19 (repo recreated at shauryalowkeygotaura/portfolio) — push = preview, review, vercel promote. (3) jio-outbound web_demo: Demo That Remembers (Upstash cross-visit memory, 11/11 tests) - Upstash is LIVE again since 2026-07-04 (excited-sturgeon PONG), so likely just needs a deploy with the canonical UPSTASH_* env; not a git repo, deploy from disk. (4) resume-autopilot: Receipts Mode (evidence appendix, verifier ran live 4/4, vitest 41 pass) - commit + push. Reply per-feature if you want me to do the commits.",
    done: false,
    seeded: true,
  },
  {
    id: "h-vault-leftovers",
    text: "Vault audit leftovers: 4 code folders living in Projects/ + raw/ items - decide, I execute",
    note: "From the 2026-07-02..18 vault audit, report-only because you killed the mover agent (so I will NOT move/delete anything unasked): (a) 4 code-bearing folders inside Projects/ that per CLAUDE.md belong in Code/; (b) raw/reference/ and raw/exun.docx awaiting wiki processing; (c) a duplicate essay v1 PDF; (d) Notes/exun-tasks-status.md rename candidate. Everything else from the audit (31 fixes, master-index rebuild, todo closures) is already applied. Reply 'go' on any subset and I do it next session.",
    done: false,
    seeded: true,
  },
  {
    id: "h-inbox-sync-pat",
    text: "Activate inbox cross-device sync: paste a gist-scope PAT once per device (INBOX panel)",
    note: "Built 2026-07-19: the INBOX now syncs through a secret gist, and an hourly vault cron ('CC Inbox Vault Sync', Task Scheduler) files new drops into Inbox/command-center-inbox.md + Notes/todos.md automatically — no more copy-paste relay. Missing piece: each device needs a PAT once. github.com/settings/tokens → classic token → ONLY the `gist` scope → paste it into the sync bar on the INBOX panel (the same token also powers HABITS sync, one paste covers both). It must be from shauryalowkeygotaura — the vault cron reads that account's gists; the panel verifies and yells if it's the wrong account.",
    done: false,
    seeded: true,
  },
  // h-portfolio-git-remote resolved 2026-07-19 same-session: Shaurya confirmed
  //   shauryalowkeygotaura is THE account; the portfolio repo simply no longer
  //   existed there. Claude recreated it (private), pushed full history, fixed
  //   Doppler GITHUB_OWNER (dev+prd) and replaced Vercel production's DEAD
  //   GITHUB_TOKEN + CRLF-polluted GITHUB_OWNER/GITHUB_REPO (all verified
  //   green). Iterator commits work again from the next prod deploy.
  {
    id: "h-revengine-post-1",
    text: "Post Revengine #1: upload the already-rendered failure carousel, then run `python feedback.py posted`",
    note: "2026-06-29: your first-ever Revengine post is rendered and waiting — Code/carousel-autoposter/output/ig-2026-06-28-it-broke-github-profile.../ (5 PNGs + a PDF). Upload the PNGs to @revengineee as an album, then run `python feedback.py posted` in the repo so the taste ledger learns what you actually ship. This is the whole point of the rebuild: ideas from you, the draining part already done.",
    done: false,
    seeded: true,
  },
  {
    id: "h-revengine-ig-autopost",
    text: "Arm Revengine IG autopost: @revengineee creds + POST_IG=1 in Doppler (carousel-autoposter, NOT here)",
    note: "Built 2026-06-29 (Code/carousel-autoposter): a daily Task Scheduler cron renders a carousel at 08:07 (run-on-wake) and posts via run.py when POST_IG=1. Wiring is done and verified as a safe no-op (logs 'posted to: nothing' until armed). Missing piece = @revengineee's OWN login (philosopher's creds are a different account). From the repo: `doppler secrets set INSTAGRAM_USERNAME=revengineee`, then `INSTAGRAM_PASSWORD=<pw>`, then `POST_IG=1`. CAUTION: an instagrapi auto-album on a brand-new account is ban-bait — hand-upload for ~1-2 weeks to age @revengineee first, THEN flip POST_IG. Reply with the password and I will set Doppler for you.",
    done: false,
    seeded: true,
  },
  {
    id: "h-revengine-linkedin-token",
    text: "Provision a LinkedIn token to turn on LinkedIn doc-post autopost",
    note: "2026-06-29: post_linkedin.py needs LINKEDIN_ACCESS_TOKEN (scope w_member_social) + LINKEDIN_AUTHOR_URN (urn:li:person:...). Doppler only has LINKEDIN_COOKIES_JSON, which that code does not use. Make a LinkedIn dev app, run the OAuth, paste the token + your person URN, and I will set Doppler + flip POST_LINKEDIN=1. Until then LinkedIn just leaves the PDF on disk (render still happens).",
    done: false,
    seeded: true,
  },
  {
    id: "h-revengine-beehiiv",
    text: "Authorize beehiiv (one browser login) so I can wire the Revengine newsletter",
    note: "2026-06-29: the last of your original three asks (the daily suggester + carousel pipeline are done). The beehiiv MCP needs an interactive browser auth I cannot do headless. Once you are logged in, I will wire the failure/cost carousels to compile into the quarterly Revengine letter — repurposing what you already make, not net-new writing. Say go and I will start the auth.",
    done: false,
    seeded: true,
  },
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
    text: "YouTube OAuth for football autopost: ~8-min Google Cloud setup + `python auth_youtube.py`, then I flip YT_DRY_RUN=0",
    note: "Re-verified 2026-07-03: the OAuth APP does not exist yet anywhere — no client_secret.json in the repo, no YT_CLIENT_ID/SECRET in Doppler, google-auth-oauthlib not installed. Full path: (1) console.cloud.google.com → pick/create project; (2) APIs & Services → Library → enable YouTube Data API v3; (3) OAuth consent screen → External → add your channel's Google email as a TEST USER (skip this and the browser step throws 'access denied'); (4) Credentials → Create → OAuth client ID → Desktop app → download JSON → save as client_secret.json next to auth_youtube.py; (5) `pip install google-auth-oauthlib` then `python auth_youtube.py` in Code/football-shorts-autopilot — browser opens, PICK THE CHANNEL, Allow. It writes .yt_oauth.json + prints the doppler commands; just tell me it ran and I do the rest (Doppler + YT_DRY_RUN=0). Everything else is already wired and green in dry-run.",
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
  // h-planner-template retired 2026-07-04: Shaurya confirmed done.
  // h-upstash-push retired 2026-07-04: Shaurya's smart-drop HAD worked — the new
  //   DB creds were sitting in Doppler portfolio/dev under off-names
  //   (UPSTASH_REST_URL/UPSTASH_TOKEN). Claude re-pointed the canonical names in
  //   BOTH Doppler projects, set the GH repo secrets + pipeline.yml env, and
  //   replaced the Vercel env (production + preview/master). New host
  //   excited-sturgeon-110590 answers PONG. Demo KV + portfolio cache are back.
  // ── Retired from the old HandoffCards tab (merged into this seed 2026-07-03,
  //    when the duplicate handoff UI was consolidated to this single list):
  // ho-football-data-token retired 2026-07-03: FOOTBALL_DATA_TOKEN verified live
  //   in Doppler youtube-title-autoresearch/dev.
  // ho-promote-portfolio retired 2026-07-03: prod alias (revengine-studio) already
  //   serves the latest commit 10aa178 — promoted Jun 30, nothing newer to ship.
  // ho-upstash-db superseded 2026-07-03 by h-upstash-push above: DB created, creds
  //   still need to reach Doppler.
  // ho-youtube-oauth merged 2026-07-03 into h-football-yt-oauth above.
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
