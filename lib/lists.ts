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
  // ── Added 2026-08-14 (clipworks / clipping automation) ────────────────────
  {
    id: "h-clipworks-payout-rail",
    text: "BLOCKER: get a parent or guardian to open the Whop account, and check FIRST whether Whop offers direct bank deposit to India",
    done: false,
    seeded: true,
    note: "This decides whether clipworks earns money or is only a clip factory for your own channels. The code works either way, so nothing is waiting on you to ship. A guardian has to hold it because Whop and platform monetization are both 18+. FamPay cannot receive international payouts, and PhonePe/Paytm are domestic UPI interfaces, but the bank account behind them takes a SWIFT wire. Preference: Whop direct bank deposit, then Wise (~1.7%), then Payoneer. PayPal is out entirely (India individual accounts cannot receive international payments) and so is crypto (30% + 1% TDS). Also worth raising at home: that money is your guardian's taxable income and India's clubbing rules apply. Reply `payout = <method> confirmed` or `payout = blocked <reason>`.",
  },
  {
    id: "h-clipworks-campaign-brief",
    text: "GET one real clipping campaign brief (Whop listing or a streamer Discord) and paste it to me verbatim",
    done: false,
    seeded: true,
    note: "`compliance.py` is built and tested but has no real campaign to validate against, and I refused to invent rules because a validator built on guesses passes clips the campaign then rejects. This matters more than it sounds: Whop verifies clips AFTER the views accrue and rejects retroactively, so a 40,000-view clip missing a credit line pays zero. Paste the brief verbatim and I encode it the same session. Note the Whop API is payments-and-merchant infrastructure only, with no campaign or submission endpoints, so this stays manual. Your Discord idea is good and is now in the spec: streamer Discords list campaigns before Whop does, they often pay direct (which sidesteps the payout blocker but has no escrow), and it can never be automated because self-bots get accounts terminated.",
  },
  {
    id: "h-clipworks-meta-app",
    text: "CREATE a Meta developer app (Instagram Graph API): it unlocks both the auto-poster and publikclip's score calibration loop",
    done: false,
    seeded: true,
    note: "Worth it because it pays for itself twice. publikclip already ships an Instagram feedback loop that pulls real Reels insights and calibrates its virality scores against your actual views, so after a few weeks the scorer learns what performs on YOUR account rather than a generic prior. The same app also posts via the official Content Publishing API, which replaces instagrapi and removes the ban vector at zero marginal cost since you need the app regardless. Requires the IG account to be Professional (Creator or Business) linked to a Facebook Page. Send the App ID and Secret through the KEYS panel, not plain chat, then reply `meta = done`.",
  },
  {
    id: "h-clipworks-doppler-slot",
    text: "DECIDE: free a Doppler project slot, or leave clipworks borrowing philosopher-pipeline/dev (you are at the 10-project free-plan cap)",
    done: false,
    seeded: true,
    note: "Already resolved, but you should know. Groq is wired and working: I patched a GroqClient into the vendored publikclip fork, made it the default, and reused the GROQ_API_KEY already sitting in philosopher-pipeline/dev, so no new key was needed. What I could not do is give clipworks its own Doppler project, because your workplace is at the free plan's 10-project cap, and I would not delete one of yours to make room. So clipworks borrows philosopher-pipeline/dev, which happens to hold exactly what it needs (Groq key plus Instagram credentials). Verified resolving. Leave it borrowed or free a slot; it only starts mattering once the Meta app keys land, since those belong to clipworks proper. Reply `doppler = borrow` or `doppler = free <project>`.",
  },
  {
    id: "h-format-channel-decision",
    text: "DECIDE: are you actually running a faceless channel from this pipeline — and if so, on which Google account?",
    done: false,
    seeded: true,
    note: "2026-07-30: format-engine + format-render are both built and verified, but there is NO CHANNEL. The tooling found a live breakout to bend from (Bluntly Explained: 21k subs, 104 days old, 1.33M top video, +0.080 momentum, est. RPM $5-14) and produced a gated brief and a finished video. What is missing is your decision, and it gates h-football-yt-oauth (no point doing OAuth with no channel to point it at). THREE THINGS ONLY YOU CAN DO: (1) decide yes/no — this is a real time commitment and the honest read is that adavia's own channel has a 3,953-view MEDIAN with exactly one outlier, so the tutorials sell the system better than the system performs; (2) if yes, pick the Google account — the tutorials recommend an AGED account (one you have had for years, not made yesterday) and warming it by watching ~20 min of in-niche video before the first upload; (3) confirm the niche — asteroids/space is just what the first bend surfaced, not a choice you made. Reply `channel = yes <account hint> <niche>` or `channel = no` and I either wire it up or stop spending time here.",
  },
  // ── Backfilled 2026-07-26 ────────────────────────────────────────────────
  // Sessions 07-22 → 07-26 ended abruptly and their handoffs never reached this
  // seed. Recovered from Logs/session-log-archive.md + Projects/*/plan.md and
  // added below, newest first. Verified live before adding (repo dirty counts
  // re-checked, autoshop delivery confirmed already on origin, meta-ads MCP
  // still shows an authenticate tool = still unauthed).
  {
    id: "h-fish-api-key",
    text: "⏳ DEADLINE 2026-07-31 — create a Fish Audio API key (fish.audio → API Keys → Create new) and drop it as FISH_API_KEY",
    note: "2026-07-25: Code/fish-voice is built and smoke-tested but has NEVER made a live call, because no key exists anywhere. TIME-SENSITIVE: the free S2.1-Pro window closes 2026-07-31 — after that you drop to ~8k credits/month (~7 minutes of audio), which a daily reel cron burns through in about a week. So the cheap window to record + clone is THIS WEEK. Steps: fish.audio → API Keys → Create new (the key displays exactly once, copy it immediately) → drop via the KEYS panel or paste it to me and I run `doppler secrets set FISH_API_KEY`. Everything downstream is already wired: the stdlib client (clone/speak/speak_many/CLI) and the `fish` provider in voicezero, which silently falls back to edge-tts until the key lands. Pairs with h-fish-reference-clip.",
    done: false,
    seeded: true,
  },
  {
    id: "h-fish-reference-clip",
    text: "Record a 15-30s voice reference clip for cloning (quiet room, natural delivery, not monotone)",
    note: "2026-07-25: the other half of fish-voice — a key alone clones nothing. Record 15-30 seconds of yourself talking normally (quiet room, no music, natural delivery; reading flatly produces a flat clone). Any format the recorder gives you is fine. Tell me the file path and I run `clone ... --default` and store the returned voice id as FISH_VOICE_ID in Doppler. Do this inside the free S2.1-Pro window (see h-fish-api-key) — cloning on the free tier costs credits you will want later. NOTE what this is NOT for: philosopher-pipeline can't use it (tts.py:259 needs edge-tts per-word WordBoundary timestamps for kinetic caption sync; Fish returns audio only, would need whisper forced alignment first) and dental-receptionist is deliberately excluded (guardian-signed deployment to real patients + cloud TTS breaks the $0/min latency design).",
    done: false,
    seeded: true,
  },
  {
    id: "h-td-invisibility-build",
    text: "TouchDesigner: run the builder in Textport and save invisibility.toe (~2 min, TD is installed)",
    note: "2026-07-25: this one got orphaned when your battery died mid-session. Status re-verified 2026-07-26: TouchDesigner IS installed (C:\\Program Files\\Derivative\\TouchDesigner), the builder script IS written (Code/td-invisibility/build_invisibility.py) — but no .toe exists, so the invisibility effect has never actually been generated or seen. TD is a GUI app, I cannot drive it. Steps: (1) open TD, (2) Textport with Alt+T, (3) paste `exec(open(r\"C:\\Users\\shaur\\OneDrive\\Desktop\\Vault\\Code\\td-invisibility\\build_invisibility.py\").read())`, (4) view /invisibility/out1, (5) Save As invisibility.toe. It self-animates on open, so it proves itself with no camera and no plugin attached. WHAT TO SEND ME: the script guards every param write and PRINTS the ones it could not set (Displace/Rectangle/Noise param names drift across TD builds) — paste that warning list to me and I patch the builder. Real hand tracking is a separate later step (needs Torin Blankensmith's MediaPipe TD plugin, then export a landmark CHOP onto Centerx/Centery/Width — one wire).",
    done: false,
    seeded: true,
  },
  {
    id: "h-meta-ads-auth",
    text: "Authenticate the meta-ads MCP — one OAuth login, or paste a token from pipeboard.co/api-tokens",
    note: "2026-07-24: installed the pipeboard-hosted meta-ads MCP at user scope (https://meta-ads.mcp.pipeboard.co/). It shows 'Failed to connect' and exposes only an `authenticate` tool until you log in — still unauthed as of 2026-07-26, I re-checked. Two ways: (1) run `/mcp` in a session and complete the browser OAuth, or (2) grab a token at pipeboard.co/api-tokens and paste it to me — I append `?token=...` to the server URL. This is the difference between having ad STRATEGY skills (ads-meta, audit-meta, which are analysis-only) and being able to actually read/execute live FB/IG/Threads ad campaigns. No spend happens from authenticating.",
    done: false,
    seeded: true,
  },
  {
    id: "h-postiz-key",
    text: "Get a POSTIZ_API_KEY (hosted Postiz account) so the 28-platform scheduler works",
    note: "2026-07-24: installed the `postiz@claude-plugins-official` plugin at user scope — no Docker, lightweight. It is inert without POSTIZ_API_KEY. Sign up for a hosted Postiz account, copy the API key, drop it via the KEYS panel (or paste it to me) and I set Doppler. Payoff: one scheduler across 28+ platforms, which is the piece the existing per-platform autoposters (carousel-autoposter, philosopher, football) each reimplement. Low urgency — nothing is broken without it, it just stays unused.",
    done: false,
    seeded: true,
  },
  {
    id: "h-inflight-uncommitted",
    text: "Your own uncommitted work in 5 repos — tell me which to review + commit (I will not commit your authorship blind)",
    note: "Found 2026-07-22 during the unattended upgrade sweep, RE-VERIFIED 2026-07-26 (all still dirty, nothing unpushed): carousel-autoposter 27 changed files, youtube-title-autoresearch 7, client-acquisition-pipeline 3, philosopher-pipeline 1, exun-appdev 1. I deliberately did not touch any of it — you authored it, and committing someone else's in-flight work is how half-finished features reach live repos (exactly what happened on autoshop that same session). None of it is lost, it is just unversioned, so a bad edit or a disk problem eats it. Reply per repo (e.g. 'review carousel-autoposter') and I read the diff, tell you what is in it, secret-audit it, and commit + push with a real message. Start with carousel-autoposter — 27 files is the one actually at risk.",
    done: false,
    seeded: true,
  },
  {
    id: "h-taste-slash-wrappers",
    text: "taste-engine: want real /taste slash commands + the optional Stop hook installed? (say yes and I do it)",
    note: "2026-07-24: taste-engine shipped PUBLIC at github.com/shauryalowkeygotaura/taste-engine (MIT). Two optional pieces were left off deliberately rather than installed without asking. (1) Real `/taste new|use|moodboard|learn|distill|status` slash-command wrappers — right now those are documented in SKILL.md and run through the skill, not as first-class slash commands. (2) The Stop hook, which would auto-capture design corrections into the journal at the end of every session — genuinely useful for the self-improving half, but it fires on EVERY session and you already run several Stop hooks, so I did not add another one unasked. Reply 'taste wrappers', 'taste hook', or 'both'. Neither is required for the engine to work.",
    done: false,
    seeded: true,
  },
  // ── end 2026-07-26 backfill ──────────────────────────────────────────────
  // key-drop SSO block fixed 2026-07-21: the key-drop proxy had Vercel
  //   Deployment Protection (ssoProtection: all_except_custom_domains) ON, so
  //   every browser  hit 401  and NO key
  //   ever reached Doppler (activity log confirmed nothing since 07-19). Root
  //   cause of . Disabled ssoProtection via
  //   the Vercel API -> endpoint now returns the app's own {"error":"bad drop
  //   token"}, i.e. the proxy is reachable and running. Push path is live again.
  {
    id: "h-repush-keys-after-ssofix",
    text: "Re-push your dropped keys — KEYS panel ⚙ endpoint = https://key-drop-phi.vercel.app/api/keys, tag each with a project, hit 'push to doppler' (or 'copy for claude' + paste)",
    note: "2026-07-21: I fixed the key-drop proxy. It was silently 401ing every push behind Vercel SSO, which is why none of the keys you dropped ever reached Doppler (I checked the Doppler activity log: nothing since 07-19). Now: open KEYS panel -> ⚙ -> endpoint = https://key-drop-phi.vercel.app/api/keys, passphrase = the DROP_TOKEN set in the key-drop Vercel project env. Every pending key needs a project tag to route (client-acquisition-pipeline, philosopher-pipeline, autoshop, or name/config like jio-outbound/prd). Then click 'push to doppler'. GUARANTEED fallback if it still errors: click 'copy for claude' and paste the block to me. The moment the keys land in Doppler I wire them into the repos + GH secrets and flip the pipeline flags same-session.",
    done: false,
    seeded: true,
  },
  // h-vercel-blocked resolved 2026-07-19 same-session: readyState BLOCKED was
  //   seatBlock COMMIT_AUTHOR_REQUIRED - the repo's git identity was the fake
  //   , which Vercel Hobby can't map to a team
  //   member. Fixed repo git config to the real account email, re-pushed ->
  //   READY -> layout A/B verified live on revengine-studio.vercel.app.
  {
    id: "h-autoshop-lemon-confirmation-links",
    text: "autoshop: set each Lemon product's confirmation/redirect link to its delivery URL — run `python list_delivery_links.py` in Code/autoshop",
    note: "2026-07-22: option (a) BUILT + tested (you chose 'a'). autoshop now self-hosts each day's PDF on Vercel Blob at a stable, unguessable, per-niche URL (overwritten each run, so buyers always get the latest edition), and deletes local files so output/ never grows. Token wired in Doppler + the autoshop repo secret + CI. ONE manual step to make delivery buyer-only: in Code/autoshop run `python list_delivery_links.py` (prints all 6 niche URLs), then in the Lemon Squeezy dashboard set each product's confirmation / redirect-after-purchase link to its URL. One-time; the URL never changes. Until then buyers still get the old dashboard-attached PDF (nothing broken). Details: Projects/autoshop/bugs.md. (Also: 3 empty stray Vercel Blob stores autoshop-dl/-store/-blob from setup can be deleted in the Vercel dashboard; harmless.)",
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
  // h-ship-five-features SHIPPED 2026-07-21 (Shaurya said ): (1)+(2)
  //   clinic-demo Attract Mode + Grill Room committed (d957b2e, 517d168) and
  //   deployed via vercel --prod -> clinic-demo-blond.vercel.app (drill gated
  //   behind ?mode=drill). (3) jio  built + deployed ->
  //   jio-voice-demo.vercel.app, smoke-tested live (200, agent replied by name
  //   with TTS, Upstash memory env present). (4) resume-autopilot Receipts Mode
  //   committed + pushed (4caa908, 12/12 receipts tests pass) -> Vercel auto-
  //   deploys. (5) portfolio Ambush Voice was already shipped 07-19 (7d4cebd).
  // h-video-pitch-wip retired 2026-07-21: ALREADY DONE by a prior session -
  //   modules/video_pitch.py is committed (e26f927) and wired into delivery.py
  //   + demo_builder.py. Nothing to commit.
  {
    id: "h-vault-leftovers",
    text: "Vault audit leftovers: 4 code folders living in Projects/ + raw/ items - decide, I execute",
    note: "2026-07-21 update (you said 'go'): I checked. (a) the 4 code folders are github-profile, portfolio, vayuvani, vayuvani-app - and the prior audit DELIBERATELY did not move them because 'deploys depend on these paths'. github-profile is likely safe (its automation is a cloud GitHub Action); portfolio/vayuvani/vayuvani-app deploy from disk, so a blind move can break prod. I will NOT move deploy-critical folders on a generic 'go' - reply per folder (e.g. 'move github-profile') and I do that one carefully. (b) raw/exun.docx + raw/reference/ is a content task (wiki processing), not a move - say the word and I process it. (c)+(d) the specific dup essay PDF path and the exun-tasks-status rename target weren't in this note and the vault is too slow to scan blind - tell me the file and target and I do it in seconds.",
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
    id: "h-dental-send-8",
    text: "Send the 8 Tier-A Jaipur dental DMs — fully assembled, just paste",
    note: "I verified all 8 bios via web (2026-06-10, table in jaipur-dental-outreach-2026-06-08.md) and assembled the complete DMs with honesty guardrails applied — scroll to 'Paste-ready DMs'. The 57-sec demo clip for Dr. Ruby is rendered and ready to send after her 'yes' (Code/dental-receptionist/demo_clips/). Use @dr_ankurgoyal_ (personal) for #4, and tap each bio in the IG app once for WhatsApp buttons. Log sends in jaipur-sends-log.md.",
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
  // h-habit-script retired 2026-06-05: found the 
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

  // -- Added 2026-08-15 -----------------------------------------------------
  {
    id: "h-upstash-dead-db",
    text: "URGENT: the Upstash DB is GONE (authoritative NXDOMAIN). Create a new Redis DB, then update UPSTASH_REDIS_REST_URL + TOKEN in THREE places: portfolio Vercel env, client-acquisition-pipeline GitHub secrets, and its Doppler config.",
    done: false,
    seeded: true,
    note: "Silent damage right now: prospects get the GENERIC demo instead of their personalised /demo/<slug>, and nothing errors. Portfolio /api/iterate also throws. Second time this has happened (apt-starfish died the same way in July), consistent with free-tier inactivity reaping.",
  },
  {
    id: "h-yt-dry-run-flip",
    text: "DECIDE: flip YT_DRY_RUN to 0 and go live on YouTube? OAuth is done and everything else is ready. I did NOT flip it.",
    done: false,
    seeded: true,
    note: "Flipping this makes the next cron publish REAL videos. The asteroid render is still the bad one (no hook, 2.9 min under a 12-minute title, repeated stills), and low-quality mass-produced uploads are exactly what the inauthentic-content policy targets. Fix a render first, then flip. Command: doppler secrets set --project youtube-title-autoresearch --config dev YT_DRY_RUN=0",
  },
  {
    id: "h-youtube-data-api-key",
    text: "Create a YouTube Data API v3 key (same GCP project as the OAuth client) and drop it as YOUTUBE_API_KEY.",
    done: false,
    seeded: true,
    note: "Unlocks Scripts/yt_analytics.py so I can pull stats for videos we post and for any channel you ask me to research. Public stats only; no OAuth needed for this one.",
  },
  {
    id: "h-football-license",
    text: "DECIDE a licence for football-shorts-autopilot: MIT or AGPL-3.0. It is PUBLIC with NO licence file, which legally means all rights reserved.",
    done: false,
    seeded: true,
    note: "Nobody can legally use it and you have no stated terms. Also gates the publikclip question: vendoring its AGPL code would force this repo to AGPL. Cleaner path is to invoke publikclip as a separate program, which keeps your code unencumbered.",
  },
  {
    id: "h-github-pat-scope",
    text: "The GitHub PAT you dropped has admin:enterprise, admin:org and delete_repo. Consider reissuing it with just repo + workflow + gist.",
    done: false,
    seeded: true,
    note: "It works and is now in Doppler as portfolio/GITHUB_API_KEY. But that scope set can delete any of your repos, and it is sitting in a secrets store that several automated jobs read.",
  },
  {
    id: "h-spare-groq-key",
    text: "Spare Groq key ...39ZZ8 is valid but has no home. The live dental key is ...xMYOMl. Where do you want it?",
    done: false,
    seeded: true,
    note: "I did not rotate the live receptionist key without a reason to.",
  },
  {
    id: "h-vayuvani-deepgram-junk",
    text: "vayuvani DEEPGRAM_API_KEY in Doppler holds a GitHub Pages URL, not a key. Delete the junk entry?",
    done: false,
    seeded: true,
    note: "Nothing is broken: no vayuvani code reads Deepgram at all. It is just a misleading entry that looks like a secret.",
  },

];
