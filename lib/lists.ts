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
  // -- Added 2026-08-29 (newest first) --------------------------------------
  {
    id: "h-asteroid-rerendered",
    text: "WATCH the re-rendered asteroid video, then decide on the ONE remaining blocker",
    done: false,
    seeded: true,
    note: "2026-08-29: there IS a new video now. output/every-asteroid-that-could-actually-hit-earth-explained/ , 2.4 min, plus 4 shorts. Rendered with Deepgram Aura-2 andromeda, the voice you picked. THE COMPARISON THAT MATTERS: the old render tripped THREE blockers, this one trips ONE. Title is honest so title_duration_conflict is None (the old one claimed 12 minutes over 2:54). The gate reports beat_opener_variety as asteroid x1, where the old script opened 5 of 9 beats on the same word. filler_phrases is empty; the old one said valuable insights three times. The hook is real: there are four specific rocks in space currently on a collision course with our planet, and none of them are theoretical. 75 caption lines are burned in, built from Aura timings. THE ONE REMAINING BLOCKER is the thumbnail: it built two_subject_versus and the format wants scene_no_clear_subject, so it wants a wide environmental frame rather than a subject on a plain background. TWO THINGS I FOUND BY EYEBALLING THAT NUMBERS MISSED, both worth your call. (1) Beat 4 is about uncharted small asteroids and the imagery it fetched is MARS. Wrong subject, exactly the failure your own note warns about. Commons matched on the wrong noun. (2) Beat 2 says Apophis passed within 30,000 km in 2029, in the past tense, but 2029 has not happened. The gate flagged 1 claim as needs_check and that is the one. Reply `asteroid = ship` or `asteroid = fix imagery first`.",
  },
  {
    id: "h-orpheus-now-live",
    text: "Groq Orpheus is unblocked and you rated it on par with andromeda: pick one as default",
    done: false,
    seeded: true,
    note: "2026-08-29: you accepted the terms, so canopylabs/orpheus-v1-english now works on your Groq key, and you said it is on par with Aura-2 andromeda. Right now andromeda is wired as the format-render default (FR_TTS_PROVIDER=aura) because it was the only one available when I built it. NOT wiring Orpheus yet, deliberately, because on-par quality means the choice is about something other than quality and that is your call: ORPHEUS keeps everything on one vendor and one key, which is simpler, and Groq latency is excellent. AURA-2 is already integrated AND it solves a problem Orpheus does not: burned captions need word timings, and the aura path recovers them by sending its own audio back through Deepgram STT, then aligning those timestamps to the SUBMITTED text so a mishearing never reaches the screen. Wiring Orpheus means rebuilding that timing recovery against a second vendor, or accepting no captions on Orpheus renders. Reply `tts = orpheus default` and I will port the timing recovery, or `tts = keep aura` and I will leave it.",
  },
  {
    id: "h-two-repos-still-unversioned",
    text: "TWO more repos have no version control: voicezero-space and heart-venture-paper",
    done: false,
    seeded: true,
    note: "2026-08-29: during the end-of-session audit I git-initialised four repos that were holding a full day of work with no history at all: format-render (captions, the aura provider, 29 tests, the quality gates), format-engine (the hardened prompt and script-quality gate), clipworks, and dental-receptionist, which is your LIVE product and had never been versioned. Those four are now committed. TWO REMAIN UNVERSIONED and I did not initialise them because I do not know your intent for either: Code/voicezero-space (contains cookbook-pr/, which looks like a pull request aimed at Groq's own cookbook) and Code/heart-venture-paper. Both had edits from this session sitting on disk. Both also still referenced the decommissioned llama-3.3-70b-versatile and are now fixed; the cookbook one mattered twice over, since a contribution to Groq's cookbook citing a model Groq has retired would fail the moment a reviewer ran it. Reply `git init = both` or tell me which to leave alone.",
  },
  {
    id: "h-format-engine-tpm-bug",
    text: "KNOW: format-engine brief generation was impossible on your Groq tier until today",
    done: false,
    seeded: true,
    note: "2026-08-29: `formatengine brief` could never have completed on this account, for any model, and this was not a model problem. build() reserved a flat max_tokens=8000 while your on-demand tier has an 8000 tokens-per-minute ceiling, and Groq counts prompt PLUS reserved completion against that limit. Every request therefore asked for about 8950 against a cap of 8000 and came back HTTP 413. I only found it because I tried to generate a fresh asteroid brief and it failed on qwen, then failed identically on gpt-oss-120b, which is what ruled out the model as the cause. The reservation now scales with the requested word count (roughly 3 tokens per word plus structure, clamped to leave room for the prompt), so 450 words reserves 2850 and 3000 words reserves 6800. Worth knowing because it means any past attempt to generate a brief silently failed, and it is also an argument for the Dev tier if you start generating longer scripts.",
  },
  // -- Added 2026-08-28 (newest first) --------------------------------------
  {
    id: "h-tts-pick-voice",
    text: "LISTEN to 6 TTS samples and pick one, then click ONE Groq link to unlock a second option",
    done: true,
    seeded: true,
    note: "2026-08-29: ANSWERED. You listened and said andromeda is good, orion is fine, and Prabhat for Hindi. Deepgram Aura-2 andromeda is now the wired default in format-render (FR_TTS_PROVIDER=aura) and it rendered the new asteroid video. Hindi stays on edge-tts PrabhatNeural, since Aura-2 is English only. Wiring it needed more than a swap: edge-tts was the default purely because it returns the word timings burned captions depend on, and kokoro was rejected on exactly that ground. So the aura path synthesises, then sends its own audio back through Deepgram STT and aligns those timestamps to the SUBMITTED text, which means a mishearing can never reach the screen. That alignment had to handle Deepgram expanding numbers: 2029 comes back as twenty twenty nine, 12 submitted tokens against 14 heard, so a token-count check returned no captions at all. 10 tests cover it. Orpheus is now unblocked too and has its own item above.",
  },
  {
    id: "h-dental-targets-tier-a",
    text: "WALK INTO the 4 Tier-A Delhi clinics I handpicked, nearest is 1.0 km from your school",
    done: false,
    seeded: true,
    note: "2026-08-28: you asked me to personally handpick these, so this is judgement rather than a scrape. Deliverables/handpicked-dental-targets-2026-08-28.md. From 105 Delhi dental practices in OpenStreetMap only 24 publish a phone number, and I ranked those 24 on three signals chosen for YOUR situation. FIRST, MULTIPLE LISTED PHONE NUMBERS is the strongest buy signal in the set: a clinic publishing three or four numbers is one where calls are already scattered and somebody is juggling them, which is exactly the pain you sell into. Kalra Dental Specialities lists FOUR. Doctor Dubey and Muskaan list three. SECOND, WALKING DISTANCE FROM DPS RK PURAM: New Delhi Dental Centre is 1.0 km, you can go between classes, and a student walking in with the school-project framing converts differently from a cold DM. Nobody else selling this product can do that. THIRD, published opening hours, meaning they already think about when patients can reach them, so the out-of-hours question lands instead of confusing them. WHAT I COULD NOT CHECK: review text. A Google review saying you called three times and nobody picked up would beat all three of my signals combined, and it needs a Places API key with billing that you do not have enabled. If you enable one, re-rank on that and ignore my ordering. Verify each number before calling too, OSM is volunteer-maintained and can be stale. The doc also argues PHYSIOTHERAPY is a better next vertical than more dentists, because cannot-pick-up-mid-appointment is more obviously true for a physio. Reply `targets = walked <name>` or `targets = physio` if you want that pitch written.",
  },
  {
    id: "h-pinterest-robots-ack",
    text: "DECIDE whether to acknowledge Pinterest robots.txt so taste-engine can pull boards",
    done: false,
    seeded: true,
    note: "2026-08-28: Pinterest is wired into taste-engine and pushed (commit 1b2aa6b) via public board RSS. No API key, no login, no app review, verified live against 4 real boards. BUT pinterest.com/robots.txt is User-agent:* / Disallow:/ site-wide, .rss included, and i.pinimg.com says the same. Every bot not on their submitted-crawler allowlist is disallowed. No key or app review changes that: it is crawler policy, not an auth wall. So the script evaluates robots.txt AT RUNTIME against the exact URL it is about to request and REFUSES with exit 2 unless you set TASTE_PINTEREST_ACK_ROBOTS=1. No default, deliberately, because the call is yours: pulling a board you chose, by hand, at 1.5s intervals is feed-reader traffic, while running it unattended across boards that are not yours is crawling. The refusal points at the Pinterest allowlist form rather than around the block, and the evaluator is live rather than hardcoded so it flips to allow on its own if the policy ever changes. ONE LIMITATION either way: the feed returns only the newest ~25 pins, so a 400-pin board gives you 25. Reply `pinterest = ack` and I will document the env var as the supported path, or `pinterest = drop` and I will retire the script rather than leave a loaded gun in a public repo.",
  },
  {
    id: "h-taste-stop-hook-arm",
    text: "ARM the taste-engine Stop hook (one command) or tell me to leave it off",
    done: false,
    seeded: true,
    note: "2026-08-28: built and pushed, deliberately NOT installed into your real ~/.claude/settings.json. A Stop hook executes automatically at the end of every session, the request reached me relayed through an agent rather than from you directly, and settings.json is configuration outside the vault, so arming it silently was not mine to do. It is a NUDGE, not an auto-capture: it counts journal entries still marked distilled:no and prints ONE line only once you cross the threshold (default 2, matching profile.md), stays silent below that, and never blocks a session or writes to the journal. The original handoff described it as auto-capturing corrections, but SKILL.md section 4 already records those live, so a hook that also wrote entries would duplicate them and pollute an append-only audit trail. To arm: run `bash hooks/install-hook.sh` from the taste-engine clone. It backs up settings.json first, is idempotent, refuses to touch invalid JSON, and takes --uninstall. Reply `taste hook = arm` or `= leave off`.",
  },
  {
    id: "h-setup-package-licence",
    text: "PICK a licence and read the 130 skills before the setup package could ever be sold",
    done: false,
    seeded: true,
    note: "2026-08-28: your setup is packaged at Deliverables/claude-code-setup-package/ as a COPY. Your live ~/.claude was NOT modified. It went 734 MB to 4.7 MB, and the reason matters for selling: two third-party skills (video-use 360 MB, video-shotcraft 293 MB) were 89 percent of the weight, and SEVEN skills in total turned out to be clones of other peoples repos with their own licences. Those are removed and listed in THIRD-PARTY-SKILLS.md as install-separately, because they are not yours to redistribute. SCANNED CLEAN: zero live credentials (checked Groq, OpenAI, Google, GitHub, Doppler and Slack token shapes), personal paths templated to {{HOME}} and {{VAULT_ROOT}} across 29 files, your name to {{USER_NAME}} in 6. ONE LEAK THAT WAS EASY TO MISS: after templating the .py files, the __pycache__ .pyc files still contained your original directory paths, because compiled bytecode embeds them. Two files were still leaking your home path after the source looked clean. Removed. NEVER COPIED and it must stay that way: .credentials.json (a live Anthropic OAuth access AND refresh token), key-drop-passphrase.txt, projects/ (per-project memory, very personal), and all session and telemetry state. TWO THINGS ONLY YOU CAN DO: there is no licence, and without one nobody can legally use it; and someone has to READ the 130 skills for business context, because my scan catches credentials and paths but cannot catch a skill that mentions a client name, a rate or a private strategy in prose. My honest read is that the autoresume rig is the more sellable artefact on its own, since it solves a problem every heavy Claude Code user hits. Reply `package = <licence>` or `package = autoresume only`.",
  },
  {
    id: "h-whop-no-clipping-api",
    text: "WHOP: a path exists after all — CLI-Anything-WEB can generate a CLI from Whop's internal API",
    done: false,
    seeded: true,
    note: "2026-08-28 UPDATED: I first reported this as unsolvable and that was only half right. The PUBLIC Whop API genuinely has no Content Rewards (verified three ways: their getting-started docs, their full docs index at docs.whop.com/llms.txt, and search). No campaign discovery, no clip submission, no earnings read. That part stands. WHAT I MISSED is that you meant a specific repo, not 'use a CLI'. It is CLI-Anything (HKUDS/CLI-Anything, 48k stars) and more precisely the variant ItamarZand88/CLI-Anything-WEB, a Claude Code plugin that generates production-grade Python CLIs for any web app. Neither hub has a Whop CLI yet, so one would be generated. HOW IT CLOSES THE GAP: it runs four phases (capture traffic, analyse APIs, generate code, publish) driving the real site with Playwright, so it reverse-engineers the INTERNAL endpoints the Whop web app itself calls. The public API lacks Content Rewards, but the website plainly has endpoints for listing campaigns and submitting clips, and those are what it would capture. TO RUN IT (three commands, inside Claude Code): /plugin marketplace add ItamarZand88/CLI-Anything-WEB then /plugin install cli-anything-web then /reload-plugins , followed by /cli-anything-web https://whop.com . Needs Python 3.10+ and Node 18+. THREE THINGS TO WEIGH BEFORE YOU DO. (1) It has to capture traffic from a LOGGED-IN session, so it needs your Whop account, and I cannot do that half for you. (2) A generated CLI drives an undocumented internal API: Whop can change it without notice and it is a grey area against their terms, unlike the public API. Treat anything it generates as fragile. (3) IT DOES NOT TOUCH THE REAL BLOCKER. Whop needs 18+ and the guardian-account payout route is still unresolved, so even a perfect CLI cannot collect money yet. My honest read: this is worth doing AFTER the payout rail is solved, not before, because the CLI is the cheap part and the account is the expensive part. Reply `whop cli = build it` and I will run the generation with you, or `whop cli = after payout` and I will leave it queued.",
  },
  // ── Added 2026-08-16 (client acquisition: student framing + IG queue) ─────
  {
    id: "h-ca-whatsapp-template",
    text: "SUBMIT the new WhatsApp template to Meta (`school_project_outreach`), then set WHATSAPP_TEMPLATE_NAME to it",
    done: false,
    seeded: true,
    note: "2026-08-16: this is the ONLY piece of the new framing I could not ship in code, because WhatsApp's first cold message must be a template Meta has approved in advance — editing the string in the repo changes nothing about what Meta actually sends. RIGHT NOW YOU ARE SENDING TWO DIFFERENT PITCHES: email, Instagram, LinkedIn and the openWA path all say `I'm Shaurya, a student at DPS RKP doing a school project`, while the Meta WhatsApp path still sends the old `are you still looking to fill the receptionist gap at X?`. A prospect hit on both channels meets two different people, which is worse than either message alone. THE FIX, ~5 min plus 1-2 days of Meta's review: business.facebook.com -> WhatsApp Manager -> Message Templates -> Create. Name `school_project_outreach`, category MARKETING, language English. Body: `Hi {{1}}, I'm Shaurya, I'm a student at DPS RKP and I'm doing a school project. Can I show you what I built for {{2}}?` with footer `Reply STOP to opt out.` ({{1}} = contact name or 'there', {{2}} = company). The exact text is also in modules/whatsapp.py so you are not retyping it from here. Once approved, set the WHATSAPP_TEMPLATE_NAME secret. I deliberately left the old template as the default so an un-migrated deploy keeps sending rather than erroring on a template name that does not exist yet. Reply `template = approved` or `template = rejected <reason>` (Meta rejects for vague reasons and I can rewrite it).",
  },
  {
    id: "h-ca-instagram-creds",
    text: "DECIDE on the Instagram sending account, then set INSTAGRAM_USERNAME / PASSWORD / INSTAGRAM_ENABLED=1 — after warming it",
    done: false,
    seeded: true,
    note: "2026-08-16: I found and fixed the reason your Instagram outreach has never sent a single DM. `instagram_handle` was being read by instagram.py and written to the leads sheet, but NOTHING IN THE CODE EVER SET IT — so resolve_handle returned None for every lead and every send was skipped, silently, regardless of INSTAGRAM_ENABLED. It now gets extracted from the business's own homepage during the scrape that was already happening (free, no new API). There is also a new daily A-tier queue: `python pipeline.py ig_queue` runs in CI and writes runs/ig_queue.json, ranking score>=7 leads across ALL cities with ties going to the least-messaged city, so it spreads instead of draining Jaipur. WHAT IS LEFT IS A JUDGEMENT CALL, NOT CODE. Sending needs a real IG account, and cold DMs from a cold account get soft-banned fast. So: use a warmed secondary, not your main. Post 5-10 things, follow ~20 dental accounts, like ~50 posts, and let it sit a few days BEFORE flipping INSTAGRAM_ENABLED=1. The cap is already set to 20 DMs/day with 45s spacing. ONE THING TO WEIGH: instagrapi drives the private API and Instagram does ban for it. The account is the thing at risk, so do not use one you would mind losing. Reply `ig = <handle> warmed` when it is ready, or `ig = skip` if you would rather not risk an account and I will leave the queue as a copy-paste list you send by hand.",
  },
  {
    id: "h-ca-verify-first-sends",
    text: "READ 3 generated messages end to end before the next run sends anything, and tell me if the school framing sounds like you",
    done: false,
    seeded: true,
    note: "2026-08-16: I rewrote every outreach channel onto the student frame you asked for and verified real Groq output, but I am the wrong judge of whether it sounds like a 16-year-old you. Sample of what now goes out on Instagram: `hey, i'm Shaurya, i'm at DPS RKP and i'm doing a school project. ur reels are actually clean, whoever edits them knows what they're doing. i built a thing that picks up the clinic phone when no one can + books the appointment. 2 clinics are already using it. could i talk to u about it sometime? jus want some feedback on it`. TWO DELIBERATE DECISIONS TO CHECK. First, the ask is `can I talk to you sometime` and NOT `can I send you a demo` — asking to talk costs them a yes, while asking to send costs them the work of receiving and judging a file, and `sometime` deliberately asks for willingness rather than a slot so there is nothing to check a calendar for. The demo is now mentioned as something you HAVE. Second, `2 clinics are already using it` is a factual claim about the real world, wired to PROOF_CLIENT_COUNT in modules/persona.py. If that number is not exactly right, tell me and I will change it in one place — the copy will never round it up on its own. Also: the `saw your reels` line ONLY appears when a real Instagram handle was found on that clinic's own website; with no evidence the prompt forbids claiming to have seen anything and falls back to category-and-city. Reply `copy = ship` or paste the line you would change.",
  },
  {
    id: "h-ca-portfolio-os-duplication",
    text: "DECIDE what to do about portfolio-os existing twice (the answer to 'why is this in here twice')",
    done: false,
    seeded: true,
    note: "2026-08-16: your instinct was right that something is duplicated, but not in the way it looks — do NOT just delete the copy inside portfolio, it would break the live site. WHAT IS ACTUALLY THERE: `Code/portfolio-os/` is the standalone open-source npm package, and `Code/portfolio/lib/portfolio-os/` is a SECOND, EARLIER copy of the same engine that the site actually imports from. The site does not depend on the published package at all — portfolio-os is not in portfolio's package.json. THEY HAVE ALREADY DRIFTED: I diffed engine.ts and they are materially different. The package version is properly generic (imports only its own ./types.js, no framework, no site imports), while the vendored copy is still wired into the site (`@/lib/content`, `@/lib/ambush`) and carries an older comment describing itself as freshly extracted. So the open-source repo you show people and the code that actually runs your site are two different implementations wearing one name. THREE OPTIONS. (1) Leave it, rename the vendored folder to something like `lib/personalization-engine` so nobody thinks it is the package — cheapest, kills the confusion, keeps the drift. (2) Make the site consume the real package (`npm i portfolio-os`, delete the vendored copy, adapt the site types to the generic ones) — correct, and it makes the open-source repo genuinely load-bearing, which is a much stronger story when someone asks about it. (3) Delete the standalone repo — I would not, it is one of your better public artifacts. My recommendation is (2), and it is maybe an hour. Reply `portfolio-os = 1`, `= 2`, or `= 3`.",
  },
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
    note: "2026-08-27: confirmed done by you.",
    done: true,
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
    note: "2026-08-27: DONE. Committed and pushed across portfolio, philosopher-pipeline, client-acquisition-pipeline (53 commits), football-shorts-autopilot, voicezero, exun-appdev, carousel-autoposter, autoshop. glass/video-use/video-shotcraft committed locally only, since their origins are other people's repos. Accidental deletions in autoresearch and Anthropic-Cybersecurity-Skills were RESTORED, not committed: both are third-party clones.",
    done: true,
    seeded: true,
  },
  {
    id: "h-taste-slash-wrappers",
    text: "taste-engine: want real /taste slash commands + the optional Stop hook installed? (say yes and I do it)",
    note: "2026-08-27: DONE, commit ba42670. Your '2' meant the Stop hook, not the slash commands: the numbered offer is in handoffs.md and item (1) had already shipped as /ts on 2026-07-24. Built hooks/taste-stop.sh (counts undistilled journal entries, one line only at threshold, silent below, never blocks or writes) plus an idempotent installer. NOT armed in your real settings.json, deliberately: see the new arming item at the top of this list. Also fixed a live public-repo bug where the README told users to type /taste commands that no longer exist after the rename.",
    done: true,
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
    note: "2026-08-27: DONE. Every key validated against its provider BEFORE storage. Newly wired: HUNTER_API_KEY (Doppler + GH secret) and APOLLO_COOKIES_JSON. That second one mattered: the workflow sets LEAD_SOURCE=apollo but the secret was missing, so CI was scraping zero leads. Already-correct no-ops: Pexels, Revengine IG password, Groq + Deepgram for dental, football-data. Two were NOT integrated and have their own items: the spare Groq key, and the vayuvani Deepgram value which is a URL rather than a key.",
    done: true,
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
    text: "Bind Doppler to creative-studio, drop the LinkedIn token, draft-test the doc post",
    note: "2026-08-15: OAuth is SOLVED. The dev app is created, Page-verified, both products added, and auth_linkedin.py (new, in Code/carousel-autoposter) runs the whole 3-legged flow and prints both values. A token was minted successfully. Author URN is urn:li:person:eHYDW8eXxZ and is not secret. THREE steps left. (1) Fix the Doppler binding FIRST: that directory currently resolves to client-acquisition-pipeline, not the creative-studio/dev its .doppler.yaml declares, so anything set now lands in the wrong project. Run `doppler setup --project creative-studio --config dev --no-interactive`, then confirm `doppler configure get project --plain` prints creative-studio. (2) In creative-studio/dev set LINKEDIN_ACCESS_TOKEN, LINKEDIN_AUTHOR_URN, LINKEDIN_TOKEN_EXPIRES=2026-10-14, POST_LINKEDIN=1, LINKEDIN_DRAFT=1. (3) Test in two stages: --dry-run renders only and never calls LinkedIn; then with LINKEDIN_DRAFT=1 the full path runs but lands as a draft on your profile instead of your feed. Clear LINKEDIN_DRAFT once a draft looks right. RECURRING: LinkedIn gives consumer apps no refresh token, so this token dies ~2026-10-14 and you re-run auth_linkedin.py every 60 days. That is ~30 seconds and does NOT mean touching the developer portal again, the app config is permanent. post_linkedin.py now warns from 10 days out and labels a 401 as likely expiry.",
    done: false,
    seeded: true,
  },
  {
    id: "h-revengine-beehiiv",
    text: "Authorize beehiiv (one browser login) so I can wire the Revengine newsletter",
    note: "2026-08-27: DONE. Deliverables/angus-style-analysis-2026-08-27.md. CORRECTION worth knowing: Angus publishes on SUBSTACK, not beehiiv, so the beehiiv auth does not reach his data. Cadence: 15 sends 06-26 to 08-25, ~2.1/week Tue+Fri until Aug 4, then a deliberate downshift to strictly weekly Tuesdays at 1200-1800 words. Structure: reversal headlines, cold open on a named person or a dollar figure, prompts shown as images not code fences, closing P.S. ONE THING NOT TO COPY: he leans heavily on em dashes, which is against your standing rule.",
    done: true,
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
    note: "2026-08-27: DONE, keep it. Demo at Code/client-acquisition-pipeline/runs/video_pitches/demo-smile-dental.mp4 (22.7s, narrated). Rendering it and LOOKING exposed four defects invisible in the source: a white Chromium flash on open, a 5px label misalignment, CTA centring fighting its entrance animation, and hero text starting hidden. All fixed, verified by measurement (value edges 299/304/300 -> 340/340/340). Two earlier agents rendered this and died before looking at it; the bugs only existed on screen.",
    done: true,
    seeded: true,
  },
  {
    id: "h-dental-send-8",
    text: "Send the 8 Tier-A Jaipur dental DMs — fully assembled, just paste",
    note: "2026-08-27: SENT by you. Timing was luckier than it looked: clinic-demo was returning a raw groq 404 to every visitor until it was fixed and redeployed the same day, so the demo was live by the time they landed. FOLLOW-UP: log the sends in jaipur-sends-log.md and confirm reply handling is armed so responses are not missed.",
    done: true,
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
    done: true,
    seeded: true,
    note: "2026-08-27: DONE. New DB climbing-reindeer-192325 wired into all three places (portfolio Vercel env, client-acquisition GH secrets, its Doppler config) and portfolio redeployed. Verified PONG. A keepalive workflow now runs Mon/Thu so this does not happen a third time: it does a SET then GET and compares, rather than a /ping, because read-only traffic is not reliably counted as activity and a write you cannot read back is a dead database wearing a healthy status code.",
  },
  {
    id: "h-yt-dry-run-flip",
    text: "DECIDE: flip YT_DRY_RUN to 0 and go live on YouTube? OAuth is done and everything else is ready. I did NOT flip it.",
    done: true,
    seeded: true,
    note: "2026-08-27: DONE AND LIVE. 4 real videos uploaded, the first ever from this pipeline after 308 dry runs. OAuth was never the blocker; YT_DRY_RUN=1 was. Two things had to be fixed before anything reached YouTube: GROQ_MODEL_FAST pointed at llama-3.1-8b-instant which Groq also decommissioned, and one unreadable image was killing the whole cycle at ffmpeg exit 8 (Commons serves SVG as image/svg+xml, which passed the old startswith('image/') check). Uploads land PRIVATE until the API compliance audit clears.",
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
