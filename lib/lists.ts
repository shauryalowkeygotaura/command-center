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
// RANKED: array order = priority (display order). Text is prefixed P1/P2/P3.
//   P1 = this week, money or a live person waiting. P2 = unblocks automation
//   or closes a real risk. P3 = parked or nice to have. RULE: every time a
//   handoff is added, re-rank the WHOLE list, not just prepend the new one.
// Retired 2026-09-25: all done items, h-format-engine-tpm-bug (info only),
//   h-clipworks-doppler-slot (resolved), h-ca-verify-first-sends (superseded by
//   h-proof-count), h-instagram-creds (dup of h-ca-instagram-creds),
//   h-autoshop-ig-session (folded into h-instagram-login), h-fish-reference-clip
//   (folded into h-fish-api-key), h-revengine-post-1 (folded into ig-autopost).
export const HANDOFF_SEED: ChecklistItem[] = [
  {
    id: "h-sheetal-call",
    text: "P1 · Take the Sat 26 Sep 10 AM call with Dr. Sheetal Badami yourself (meet.google.com/nhm-itqe-aqo)",
    done: false,
    seeded: true,
    note: "The bot flooded her: 16 replies between 17 and 24 Sep, 4 per run, because it re-answered every message in a 7-day window. It also gave her three different made-up reasons for not naming the '2 clinics' (patient privacy, students still in school, confidentiality agreements) and offered to set the demo up on her clinic, which she told you she no longer runs. Fixed in code (commit 8e8fb74) and her lead is now stage=handoff, so nothing automated reaches her again. On the call: open by owning the email mess in one line, and give her ONE straight answer on the clinics. She said she wants to give feedback, not buy; treat it as that. Reply `sheetal = done <what she said>`.",
  },
  {
    id: "h-proof-count",
    text: "P1 · CONFIRM '2 clinics are already using it' is literally true, or tell me the real number",
    done: false,
    seeded: true,
    note: "Every cold email states it (PROOF_CLIENT_COUNT=2 in modules/persona.py). It is exactly what Dr. Badami asked about, and the bot had no true answer to give, so it improvised. If the real number is 0, say so and I switch the line to something true. Reply `proof = <n>`.",
  },
  {
    id: "h-dental-targets-tier-a",
    text: "P1 · WALK INTO the 4 Tier-A Delhi clinics I handpicked, nearest is 1.0 km from your school",
    done: false,
    seeded: true,
    note: "2026-08-28: you asked me to personally handpick these, so this is judgement rather than a scrape. Deliverables/handpicked-dental-targets-2026-08-28.md. From 105 Delhi dental practices in OpenStreetMap only 24 publish a phone number, and I ranked those 24 on three signals chosen for YOUR situation. FIRST, MULTIPLE LISTED PHONE NUMBERS is the strongest buy signal in the set: a clinic publishing three or four numbers is one where calls are already scattered and somebody is juggling them, which is exactly the pain you sell into. Kalra Dental Specialities lists FOUR. Doctor Dubey and Muskaan list three. SECOND, WALKING DISTANCE FROM DPS RK PURAM: New Delhi Dental Centre is 1.0 km, you can go between classes, and a student walking in with the school-project framing converts differently from a cold DM. Nobody else selling this product can do that. THIRD, published opening hours, meaning they already think about when patients can reach them, so the out-of-hours question lands instead of confusing them. WHAT I COULD NOT CHECK: review text. A Google review saying you called three times and nobody picked up would beat all three of my signals combined, and it needs a Places API key with billing that you do not have enabled. If you enable one, re-rank on that and ignore my ordering. Verify each number before calling too, OSM is volunteer-maintained and can be stale. The doc also argues PHYSIOTHERAPY is a better next vertical than more dentists, because cannot-pick-up-mid-appointment is more obviously true for a physio. Reply `targets = walked <name>` or `targets = physio` if you want that pitch written.",
  },
  {
    id: "h-revengine-linkedin-token",
    text: "P1 · LinkedIn autopost is NOT live: no LINKEDIN_* secrets in creative-studio/dev, and the minted token dies 14 Oct",
    note: "2026-08-15: OAuth is SOLVED. The dev app is created, Page-verified, both products added, and auth_linkedin.py (new, in Code/carousel-autoposter) runs the whole 3-legged flow and prints both values. A token was minted successfully. Author URN is urn:li:person:eHYDW8eXxZ and is not secret. THREE steps left. (1) Fix the Doppler binding FIRST: that directory currently resolves to client-acquisition-pipeline, not the creative-studio/dev its .doppler.yaml declares, so anything set now lands in the wrong project. Run `doppler setup --project creative-studio --config dev --no-interactive`, then confirm `doppler configure get project --plain` prints creative-studio. (2) In creative-studio/dev set LINKEDIN_ACCESS_TOKEN, LINKEDIN_AUTHOR_URN, LINKEDIN_TOKEN_EXPIRES=2026-10-14, POST_LINKEDIN=1, LINKEDIN_DRAFT=1. (3) Test in two stages: --dry-run renders only and never calls LinkedIn; then with LINKEDIN_DRAFT=1 the full path runs but lands as a draft on your profile instead of your feed. Clear LINKEDIN_DRAFT once a draft looks right. RECURRING: LinkedIn gives consumer apps no refresh token, so this token dies ~2026-10-14 and you re-run auth_linkedin.py every 60 days. That is ~30 seconds and does NOT mean touching the developer portal again, the app config is permanent. post_linkedin.py now warns from 10 days out and labels a 401 as likely expiry.",
    done: false,
    seeded: true,
  },
  {
    id: "h-dental-niche-risk",
    text: "P2 · READ the voice-agent finding: your dental niche is named as the one to avoid",
    done: false,
    seeded: true,
    note: "From 6 Brendan Jowett transcripts (25,700 words, 3yr agency, $12k+ per deployment, 20+ industries). Asked which offer he would personally avoid in 2026 he says: generic appointment booking for low-complexity industries, and names hair salons, barber shops, DENTAL OFFICES and med spas explicitly. Reason: booking is simple, the systems are well known, integrations are minimal, so every newcomer starts there and margins collapse. He ALSO says starting in a simple niche to get first revenue is completely fine, which is exactly your position (gate = first paying client), so this is not 'stop'. It is 'do not plan to defend it on price'. His actual argument: the agent is now the commodity and the MAINTENANCE is the product - a retainer buys monitoring calls, reviewing transcripts, and updating prompts when their scheduler changes its API or they add a service. That reframes our 0/3k/6k tiers, which currently price the agent. Full writeup in Resources/skills/voice-agent-offer/SKILL.md. Also useful: latency budget is ~1400ms total and the LLM is ~800ms of it, so tuning TTS while running a slow model is the wrong axis. He does not use Claude for voice agents; he uses GPT-4.1 or Gemini Flash for turn-taking speed. Reply `dental = reprice on maintenance` or `dental = leave pricing, note taken`.",
  },
  {
    id: "h-github-pat-scope",
    text: "P2 · The GitHub PAT you dropped has admin:enterprise, admin:org and delete_repo. Consider reissuing it with just repo + workflow + gist.",
    done: false,
    seeded: true,
    note: "It works and is now in Doppler as portfolio/GITHUB_API_KEY. But that scope set can delete any of your repos, and it is sitting in a secrets store that several automated jobs read.",
  },
  {
    id: "h-ca-whatsapp-template",
    text: "P2 · SUBMIT the new WhatsApp template to Meta (`school_project_outreach`), then set WHATSAPP_TEMPLATE_NAME to it",
    done: false,
    seeded: true,
    note: "2026-08-16: this is the ONLY piece of the new framing I could not ship in code, because WhatsApp's first cold message must be a template Meta has approved in advance — editing the string in the repo changes nothing about what Meta actually sends. RIGHT NOW YOU ARE SENDING TWO DIFFERENT PITCHES: email, Instagram, LinkedIn and the openWA path all say `I'm Shaurya, a student at DPS RKP doing a school project`, while the Meta WhatsApp path still sends the old `are you still looking to fill the receptionist gap at X?`. A prospect hit on both channels meets two different people, which is worse than either message alone. THE FIX, ~5 min plus 1-2 days of Meta's review: business.facebook.com -> WhatsApp Manager -> Message Templates -> Create. Name `school_project_outreach`, category MARKETING, language English. Body: `Hi {{1}}, I'm Shaurya, I'm a student at DPS RKP and I'm doing a school project. Can I show you what I built for {{2}}?` with footer `Reply STOP to opt out.` ({{1}} = contact name or 'there', {{2}} = company). The exact text is also in modules/whatsapp.py so you are not retyping it from here. Once approved, set the WHATSAPP_TEMPLATE_NAME secret. I deliberately left the old template as the default so an un-migrated deploy keeps sending rather than erroring on a template name that does not exist yet. Reply `template = approved` or `template = rejected <reason>` (Meta rejects for vague reasons and I can rewrite it).",
  },
  {
    id: "h-instagram-login",
    text: "P2 · One interactive Instagram login unblocks autoshop AND philosopher POSTING",
    done: false,
    seeded: true,
    note: "Worth doing even though the research it originally blocked is finished. INSTAGRAM_PASSWORD in Doppler autoshop/dev is REJECTED by Instagram (verified with exactly one login attempt - I stopped there deliberately, since repeated failures are what actually locks an account). The saved session.json is from 2026-03-18. Fix: `cd Code/autoshop && doppler run -- python login_instagram.py` interactively, which handles the 2FA/email challenge a headless process cannot. If it still says BadPassword the stored password is simply stale: `doppler secrets set INSTAGRAM_PASSWORD -p autoshop -c dev`. This blocks POSTING from autoshop and philosopher-pipeline, not just research - and it is also what keeps the philosopher bandit's reward pull (insights.py) unable to run. Full runbook: Resources/instagram-access-runbook.md.",
  },
  {
    id: "h-ca-instagram-creds",
    text: "P2 · DECIDE on the Instagram sending account, then set INSTAGRAM_USERNAME / PASSWORD / INSTAGRAM_ENABLED=1 — after warming it",
    done: false,
    seeded: true,
    note: "2026-08-16: I found and fixed the reason your Instagram outreach has never sent a single DM. `instagram_handle` was being read by instagram.py and written to the leads sheet, but NOTHING IN THE CODE EVER SET IT — so resolve_handle returned None for every lead and every send was skipped, silently, regardless of INSTAGRAM_ENABLED. It now gets extracted from the business's own homepage during the scrape that was already happening (free, no new API). There is also a new daily A-tier queue: `python pipeline.py ig_queue` runs in CI and writes runs/ig_queue.json, ranking score>=7 leads across ALL cities with ties going to the least-messaged city, so it spreads instead of draining Jaipur. WHAT IS LEFT IS A JUDGEMENT CALL, NOT CODE. Sending needs a real IG account, and cold DMs from a cold account get soft-banned fast. So: use a warmed secondary, not your main. Post 5-10 things, follow ~20 dental accounts, like ~50 posts, and let it sit a few days BEFORE flipping INSTAGRAM_ENABLED=1. The cap is already set to 20 DMs/day with 45s spacing. ONE THING TO WEIGH: instagrapi drives the private API and Instagram does ban for it. The account is the thing at risk, so do not use one you would mind losing. Reply `ig = <handle> warmed` when it is ready, or `ig = skip` if you would rather not risk an account and I will leave the queue as a copy-paste list you send by hand.",
  },
  {
    id: "h-bandit-orphaned",
    text: "P2 · DECIDE: restore the old philosopher hook wording, or let the bandit relearn from zero",
    done: false,
    seeded: true,
    note: "This is the one that needs YOUR call, not more code. philosopher-pipeline has a genuinely good self-improving bandit: phased so it degrades safely, exploration seeded from SHA-256 so runs stay reproducible. It has never learned anything, and the reason is worse than 'it was never turned on'. The ledger holds 161 rows and 134 of them DO carry real engagement rewards. Not one matches a hook in the current HOOKS list. The ledger says 'the words that shaped western thought.' and HOOKS now says 'the kind of words that hit at 3am.' The wording was rewritten at some point, and a bandit keyed on exact arm text cannot connect a reward to an arm that no longer exists. So it has been round-robinning while sitting on months of real data. Run `python -c \"import bandit,pipeline;print(bandit.loop_status(pipeline.HOOKS)['verdict'])\"` to see it say ORPHANED. Two options, both defensible: restore the old hook strings so 134 observations start counting immediately, or accept that learning restarts from zero because the new hooks are better writing. I did NOT choose for you. Reply `bandit = restore old hooks` or `bandit = start fresh`.",
  },
  {
    id: "h-ca-portfolio-os-duplication",
    text: "P2 · DECIDE what to do about portfolio-os existing twice (the answer to 'why is this in here twice')",
    done: false,
    seeded: true,
    note: "2026-08-16: your instinct was right that something is duplicated, but not in the way it looks — do NOT just delete the copy inside portfolio, it would break the live site. WHAT IS ACTUALLY THERE: `Code/portfolio-os/` is the standalone open-source npm package, and `Code/portfolio/lib/portfolio-os/` is a SECOND, EARLIER copy of the same engine that the site actually imports from. The site does not depend on the published package at all — portfolio-os is not in portfolio's package.json. THEY HAVE ALREADY DRIFTED: I diffed engine.ts and they are materially different. The package version is properly generic (imports only its own ./types.js, no framework, no site imports), while the vendored copy is still wired into the site (`@/lib/content`, `@/lib/ambush`) and carries an older comment describing itself as freshly extracted. So the open-source repo you show people and the code that actually runs your site are two different implementations wearing one name. THREE OPTIONS. (1) Leave it, rename the vendored folder to something like `lib/personalization-engine` so nobody thinks it is the package — cheapest, kills the confusion, keeps the drift. (2) Make the site consume the real package (`npm i portfolio-os`, delete the vendored copy, adapt the site types to the generic ones) — correct, and it makes the open-source repo genuinely load-bearing, which is a much stronger story when someone asks about it. (3) Delete the standalone repo — I would not, it is one of your better public artifacts. My recommendation is (2), and it is maybe an hour. Reply `portfolio-os = 1`, `= 2`, or `= 3`.",
  },
  {
    id: "h-football-license",
    text: "P2 · DECIDE a licence for football-shorts-autopilot: MIT or AGPL-3.0. It is PUBLIC with NO licence file, which legally means all rights reserved.",
    done: false,
    seeded: true,
    note: "Nobody can legally use it and you have no stated terms. Also gates the publikclip question: vendoring its AGPL code would force this repo to AGPL. Cleaner path is to invoke publikclip as a separate program, which keeps your code unencumbered.",
  },
  {
    id: "h-format-channel-decision",
    text: "P3 · DECIDE: are you actually running a faceless channel from this pipeline — and if so, on which Google account?",
    done: false,
    seeded: true,
    note: "2026-07-30: format-engine + format-render are both built and verified, but there is NO CHANNEL. The tooling found a live breakout to bend from (Bluntly Explained: 21k subs, 104 days old, 1.33M top video, +0.080 momentum, est. RPM $5-14) and produced a gated brief and a finished video. What is missing is your decision, and it gates h-football-yt-oauth (no point doing OAuth with no channel to point it at). THREE THINGS ONLY YOU CAN DO: (1) decide yes/no — this is a real time commitment and the honest read is that adavia's own channel has a 3,953-view MEDIAN with exactly one outlier, so the tutorials sell the system better than the system performs; (2) if yes, pick the Google account — the tutorials recommend an AGED account (one you have had for years, not made yesterday) and warming it by watching ~20 min of in-niche video before the first upload; (3) confirm the niche — asteroids/space is just what the first bend surfaced, not a choice you made. Reply `channel = yes <account hint> <niche>` or `channel = no` and I either wire it up or stop spending time here.",
  },
  {
    id: "h-city-grid-render",
    text: "P3 · Render the 2,900-word city-grid brief - the first script at real working-channel length",
    done: false,
    seeded: true,
    note: "format-engine/data/briefs/the-4-levels-of-city-grid-failure-2026-09-02.json. 17 beats, 2,900 words, passing every gate including the two new ones: second person 8.7 per 100 words (floor 4.0) and median sentence 4 words (ceiling 12). Working channels in this format run a 2,462-word median, so this is the first script we have produced at genuine length - previous ones were 313 and 620. It needed chunked generation, because Groq caps at 8000 tokens PER MINUTE counting prompt plus reserved completion, and the non-obvious part is that sizing the calls is not enough: several individually-legal calls fired back to back still breach it, so they are paced 35s apart. Expect ~2.5 hours to render (~225 shots at ~39s each of image generation). Command is at the top of Logs/session-checkpoints/RESUME-HERE.md. TWO THINGS TO DECIDE FIRST, both would be baked into 17 minutes of video: (1) the --tone string currently constrains LOCATION as well as lighting, so every generated shot is an interior in the same blue-grey register - fine for 3 minutes, samey for 17. (2) The title says '4 Levels' while the script has 17 beats, because beat count comes from word count and the title comes from the format; they are derived independently and disagree.",
  },
  {
    id: "h-asteroid-rerendered",
    text: "P3 · WATCH the re-rendered asteroid video, then decide on the ONE remaining blocker",
    done: false,
    seeded: true,
    note: "2026-08-29: there IS a new video now. output/every-asteroid-that-could-actually-hit-earth-explained/ , 2.4 min, plus 4 shorts. Rendered with Deepgram Aura-2 andromeda, the voice you picked. THE COMPARISON THAT MATTERS: the old render tripped THREE blockers, this one trips ONE. Title is honest so title_duration_conflict is None (the old one claimed 12 minutes over 2:54). The gate reports beat_opener_variety as asteroid x1, where the old script opened 5 of 9 beats on the same word. filler_phrases is empty; the old one said valuable insights three times. The hook is real: there are four specific rocks in space currently on a collision course with our planet, and none of them are theoretical. 75 caption lines are burned in, built from Aura timings. THE ONE REMAINING BLOCKER is the thumbnail: it built two_subject_versus and the format wants scene_no_clear_subject, so it wants a wide environmental frame rather than a subject on a plain background. TWO THINGS I FOUND BY EYEBALLING THAT NUMBERS MISSED, both worth your call. (1) Beat 4 is about uncharted small asteroids and the imagery it fetched is MARS. Wrong subject, exactly the failure your own note warns about. Commons matched on the wrong noun. (2) Beat 2 says Apophis passed within 30,000 km in 2029, in the past tense, but 2029 has not happened. The gate flagged 1 claim as needs_check and that is the one. Reply `asteroid = ship` or `asteroid = fix imagery first`.",
  },
  {
    id: "h-clipworks-payout-rail",
    text: "P3 · BLOCKER: get a parent or guardian to open the Whop account, and check FIRST whether Whop offers direct bank deposit to India",
    done: false,
    seeded: true,
    note: "This decides whether clipworks earns money or is only a clip factory for your own channels. The code works either way, so nothing is waiting on you to ship. A guardian has to hold it because Whop and platform monetization are both 18+. FamPay cannot receive international payouts, and PhonePe/Paytm are domestic UPI interfaces, but the bank account behind them takes a SWIFT wire. Preference: Whop direct bank deposit, then Wise (~1.7%), then Payoneer. PayPal is out entirely (India individual accounts cannot receive international payments) and so is crypto (30% + 1% TDS). Also worth raising at home: that money is your guardian's taxable income and India's clubbing rules apply. Reply `payout = <method> confirmed` or `payout = blocked <reason>`.",
  },
  {
    id: "h-clipworks-campaign-brief",
    text: "P3 · GET one real clipping campaign brief (Whop listing or a streamer Discord) and paste it to me verbatim",
    done: false,
    seeded: true,
    note: "`compliance.py` is built and tested but has no real campaign to validate against, and I refused to invent rules because a validator built on guesses passes clips the campaign then rejects. This matters more than it sounds: Whop verifies clips AFTER the views accrue and rejects retroactively, so a 40,000-view clip missing a credit line pays zero. Paste the brief verbatim and I encode it the same session. Note the Whop API is payments-and-merchant infrastructure only, with no campaign or submission endpoints, so this stays manual. Your Discord idea is good and is now in the spec: streamer Discords list campaigns before Whop does, they often pay direct (which sidesteps the payout blocker but has no escrow), and it can never be automated because self-bots get accounts terminated.",
  },
  {
    id: "h-clipworks-meta-app",
    text: "P3 · CREATE a Meta developer app (Instagram Graph API): it unlocks both the auto-poster and publikclip's score calibration loop",
    done: false,
    seeded: true,
    note: "Worth it because it pays for itself twice. publikclip already ships an Instagram feedback loop that pulls real Reels insights and calibrates its virality scores against your actual views, so after a few weeks the scorer learns what performs on YOUR account rather than a generic prior. The same app also posts via the official Content Publishing API, which replaces instagrapi and removes the ban vector at zero marginal cost since you need the app regardless. Requires the IG account to be Professional (Creator or Business) linked to a Facebook Page. Send the App ID and Secret through the KEYS panel, not plain chat, then reply `meta = done`.",
  },
  {
    id: "h-whop-no-clipping-api",
    text: "P3 · WHOP: a path exists after all — CLI-Anything-WEB can generate a CLI from Whop's internal API",
    done: false,
    seeded: true,
    note: "2026-08-28 UPDATED: I first reported this as unsolvable and that was only half right. The PUBLIC Whop API genuinely has no Content Rewards (verified three ways: their getting-started docs, their full docs index at docs.whop.com/llms.txt, and search). No campaign discovery, no clip submission, no earnings read. That part stands. WHAT I MISSED is that you meant a specific repo, not 'use a CLI'. It is CLI-Anything (HKUDS/CLI-Anything, 48k stars) and more precisely the variant ItamarZand88/CLI-Anything-WEB, a Claude Code plugin that generates production-grade Python CLIs for any web app. Neither hub has a Whop CLI yet, so one would be generated. HOW IT CLOSES THE GAP: it runs four phases (capture traffic, analyse APIs, generate code, publish) driving the real site with Playwright, so it reverse-engineers the INTERNAL endpoints the Whop web app itself calls. The public API lacks Content Rewards, but the website plainly has endpoints for listing campaigns and submitting clips, and those are what it would capture. TO RUN IT (three commands, inside Claude Code): /plugin marketplace add ItamarZand88/CLI-Anything-WEB then /plugin install cli-anything-web then /reload-plugins , followed by /cli-anything-web https://whop.com . Needs Python 3.10+ and Node 18+. THREE THINGS TO WEIGH BEFORE YOU DO. (1) It has to capture traffic from a LOGGED-IN session, so it needs your Whop account, and I cannot do that half for you. (2) A generated CLI drives an undocumented internal API: Whop can change it without notice and it is a grey area against their terms, unlike the public API. Treat anything it generates as fragile. (3) IT DOES NOT TOUCH THE REAL BLOCKER. Whop needs 18+ and the guardian-account payout route is still unresolved, so even a perfect CLI cannot collect money yet. My honest read: this is worth doing AFTER the payout rail is solved, not before, because the CLI is the cheap part and the account is the expensive part. Reply `whop cli = build it` and I will run the generation with you, or `whop cli = after payout` and I will leave it queued.",
  },
  {
    id: "h-whop-key",
    text: "P3 · Add WHOP_API_KEY so the new Whop CLI can actually return data",
    done: false,
    seeded: true,
    note: "Built Code/whop-cli this session, to the CLI-Anything convention you asked for (HKUDS/CLI-Anything, 48.8k stars). I checked their hub: ~90 CLIs published, none for Whop, so this is genuinely new. Five commands - whoami, products, memberships, payments, revenue - each with --json because the primary caller is an agent. The error paths are PROVEN against the live API: a bad key returns a real 401 and the CLI relays Whop's own message instead of a traceback. Every success path is UNVERIFIED because no key exists. One command unblocks it: `doppler secrets set WHOP_API_KEY -p creative-studio -c dev` (key from whop.com/dashboard/developer), then `doppler run -- whop whoami`. The key is read from the environment only, never an argument, so it cannot land in shell history.",
  },
  {
    id: "h-pixabay-key",
    text: "P3 · Free Pixabay key doubles the b-roll pool for zero code",
    done: false,
    seeded: true,
    note: "broll._search_pixabay is already implemented and already wired - it just returns nothing because PIXABAY_API_KEY is unset, so every render currently searches Pexels alone. Free signup at pixabay.com/api/docs, then `doppler secrets set PIXABAY_API_KEY -p creative-studio -c dev`. Zero code changes. Related and already fixed this session: Pexels was only ever reading page 1 while reporting total_results in the thousands (8000 for 'dark city night'), so the pool was about 100x shallower than it looked. That now pages.",
  },
  {
    id: "h-youtube-data-api-key",
    text: "P3 · Create a YouTube Data API v3 key (same GCP project as the OAuth client) and drop it as YOUTUBE_API_KEY.",
    done: false,
    seeded: true,
    note: "Unlocks Scripts/yt_analytics.py so I can pull stats for videos we post and for any channel you ask me to research. Public stats only; no OAuth needed for this one.",
  },
  {
    id: "h-install-component-taste",
    text: "P3 · What did 'install component taste' mean? I could not resolve it",
    done: false,
    seeded: true,
    note: "From your inbox list. I did the Pinterest half (taste-engine's SKILL.md documented scripts/pinterest.sh in full detail and the script did not exist, so /ts pin would have failed on a missing file - it is written and committed now, with the robots gate exiting 2 verbatim and no workaround offered). But 'install component taste' I could not pin down. Best guesses: (a) a shadcn-style component library wired INTO taste-engine so it can judge real components, (b) installing the taste-engine skill itself somewhere specific, (c) something else entirely. Rather than guess and build the wrong thing, tell me which. Reply `component taste = <what you meant>`.",
  },
  {
    id: "h-pinterest-robots-ack",
    text: "P3 · DECIDE whether to acknowledge Pinterest robots.txt so taste-engine can pull boards",
    done: false,
    seeded: true,
    note: "2026-08-28: Pinterest is wired into taste-engine and pushed (commit 1b2aa6b) via public board RSS. No API key, no login, no app review, verified live against 4 real boards. BUT pinterest.com/robots.txt is User-agent:* / Disallow:/ site-wide, .rss included, and i.pinimg.com says the same. Every bot not on their submitted-crawler allowlist is disallowed. No key or app review changes that: it is crawler policy, not an auth wall. So the script evaluates robots.txt AT RUNTIME against the exact URL it is about to request and REFUSES with exit 2 unless you set TASTE_PINTEREST_ACK_ROBOTS=1. No default, deliberately, because the call is yours: pulling a board you chose, by hand, at 1.5s intervals is feed-reader traffic, while running it unattended across boards that are not yours is crawling. The refusal points at the Pinterest allowlist form rather than around the block, and the evaluator is live rather than hardcoded so it flips to allow on its own if the policy ever changes. ONE LIMITATION either way: the feed returns only the newest ~25 pins, so a 400-pin board gives you 25. Reply `pinterest = ack` and I will document the env var as the supported path, or `pinterest = drop` and I will retire the script rather than leave a loaded gun in a public repo.",
  },
  {
    id: "h-taste-stop-hook-arm",
    text: "P3 · ARM the taste-engine Stop hook (one command) or tell me to leave it off",
    done: false,
    seeded: true,
    note: "2026-08-28: built and pushed, deliberately NOT installed into your real ~/.claude/settings.json. A Stop hook executes automatically at the end of every session, the request reached me relayed through an agent rather than from you directly, and settings.json is configuration outside the vault, so arming it silently was not mine to do. It is a NUDGE, not an auto-capture: it counts journal entries still marked distilled:no and prints ONE line only once you cross the threshold (default 2, matching profile.md), stays silent below that, and never blocks a session or writes to the journal. The original handoff described it as auto-capturing corrections, but SKILL.md section 4 already records those live, so a hook that also wrote entries would duplicate them and pollute an append-only audit trail. To arm: run `bash hooks/install-hook.sh` from the taste-engine clone. It backs up settings.json first, is idempotent, refuses to touch invalid JSON, and takes --uninstall. Reply `taste hook = arm` or `= leave off`.",
  },
  {
    id: "h-setup-package-licence",
    text: "P3 · PICK a licence and read the 130 skills before the setup package could ever be sold",
    done: false,
    seeded: true,
    note: "2026-08-28: your setup is packaged at Deliverables/claude-code-setup-package/ as a COPY. Your live ~/.claude was NOT modified. It went 734 MB to 4.7 MB, and the reason matters for selling: two third-party skills (video-use 360 MB, video-shotcraft 293 MB) were 89 percent of the weight, and SEVEN skills in total turned out to be clones of other peoples repos with their own licences. Those are removed and listed in THIRD-PARTY-SKILLS.md as install-separately, because they are not yours to redistribute. SCANNED CLEAN: zero live credentials (checked Groq, OpenAI, Google, GitHub, Doppler and Slack token shapes), personal paths templated to {{HOME}} and {{VAULT_ROOT}} across 29 files, your name to {{USER_NAME}} in 6. ONE LEAK THAT WAS EASY TO MISS: after templating the .py files, the __pycache__ .pyc files still contained your original directory paths, because compiled bytecode embeds them. Two files were still leaking your home path after the source looked clean. Removed. NEVER COPIED and it must stay that way: .credentials.json (a live Anthropic OAuth access AND refresh token), key-drop-passphrase.txt, projects/ (per-project memory, very personal), and all session and telemetry state. TWO THINGS ONLY YOU CAN DO: there is no licence, and without one nobody can legally use it; and someone has to READ the 130 skills for business context, because my scan catches credentials and paths but cannot catch a skill that mentions a client name, a rate or a private strategy in prose. My honest read is that the autoresume rig is the more sellable artefact on its own, since it solves a problem every heavy Claude Code user hits. Reply `package = <licence>` or `package = autoresume only`.",
  },
  {
    id: "h-two-repos-still-unversioned",
    text: "P3 · TWO more repos have no version control: voicezero-space and heart-venture-paper",
    done: false,
    seeded: true,
    note: "2026-08-29: during the end-of-session audit I git-initialised four repos that were holding a full day of work with no history at all: format-render (captions, the aura provider, 29 tests, the quality gates), format-engine (the hardened prompt and script-quality gate), clipworks, and dental-receptionist, which is your LIVE product and had never been versioned. Those four are now committed. TWO REMAIN UNVERSIONED and I did not initialise them because I do not know your intent for either: Code/voicezero-space (contains cookbook-pr/, which looks like a pull request aimed at Groq's own cookbook) and Code/heart-venture-paper. Both had edits from this session sitting on disk. Both also still referenced the decommissioned llama-3.3-70b-versatile and are now fixed; the cookbook one mattered twice over, since a contribution to Groq's cookbook citing a model Groq has retired would fail the moment a reviewer ran it. Reply `git init = both` or tell me which to leave alone.",
  },
  {
    id: "h-revengine-ig-autopost",
    text: "P3 · Revengine IG: hand-post the rendered carousel, then arm POST_IG=1 once @revengineee is aged",
    note: "Built 2026-06-29 (Code/carousel-autoposter): a daily Task Scheduler cron renders a carousel at 08:07 (run-on-wake) and posts via run.py when POST_IG=1. Wiring is done and verified as a safe no-op (logs 'posted to: nothing' until armed). Missing piece = @revengineee's OWN login (philosopher's creds are a different account). From the repo: `doppler secrets set INSTAGRAM_USERNAME=revengineee`, then `INSTAGRAM_PASSWORD=<pw>`, then `POST_IG=1`. CAUTION: an instagrapi auto-album on a brand-new account is ban-bait — hand-upload for ~1-2 weeks to age @revengineee first, THEN flip POST_IG. Reply with the password and I will set Doppler for you.",
    done: false,
    seeded: true,
  },
  {
    id: "h-autoshop-lemon-confirmation-links",
    text: "P3 · autoshop: set each Lemon product's confirmation/redirect link to its delivery URL — run `python list_delivery_links.py` in Code/autoshop",
    note: "2026-07-22: option (a) BUILT + tested (you chose 'a'). autoshop now self-hosts each day's PDF on Vercel Blob at a stable, unguessable, per-niche URL (overwritten each run, so buyers always get the latest edition), and deletes local files so output/ never grows. Token wired in Doppler + the autoshop repo secret + CI. ONE manual step to make delivery buyer-only: in Code/autoshop run `python list_delivery_links.py` (prints all 6 niche URLs), then in the Lemon Squeezy dashboard set each product's confirmation / redirect-after-purchase link to its URL. One-time; the URL never changes. Until then buyers still get the old dashboard-attached PDF (nothing broken). Details: Projects/autoshop/bugs.md. (Also: 3 empty stray Vercel Blob stores autoshop-dl/-store/-blob from setup can be deleted in the Vercel dashboard; harmless.)",
    done: false,
    seeded: true,
  },
  {
    id: "h-inbox-sync-pat",
    text: "P3 · Activate inbox cross-device sync: paste a gist-scope PAT once per device (INBOX panel)",
    note: "Built 2026-07-19: the INBOX now syncs through a secret gist, and an hourly vault cron ('CC Inbox Vault Sync', Task Scheduler) files new drops into Inbox/command-center-inbox.md + Notes/todos.md automatically — no more copy-paste relay. Missing piece: each device needs a PAT once. github.com/settings/tokens → classic token → ONLY the `gist` scope → paste it into the sync bar on the INBOX panel (the same token also powers HABITS sync, one paste covers both). It must be from shauryalowkeygotaura — the vault cron reads that account's gists; the panel verifies and yells if it's the wrong account.",
    done: false,
    seeded: true,
  },
  {
    id: "h-fish-api-key",
    text: "P3 · Fish Audio voice clone: key + a 15-30s reference clip (free Pro window closed 31 Jul, now low priority)",
    note: "2026-07-25: Code/fish-voice is built and smoke-tested but has NEVER made a live call, because no key exists anywhere. TIME-SENSITIVE: the free S2.1-Pro window closes 2026-07-31 — after that you drop to ~8k credits/month (~7 minutes of audio), which a daily reel cron burns through in about a week. So the cheap window to record + clone is THIS WEEK. Steps: fish.audio → API Keys → Create new (the key displays exactly once, copy it immediately) → drop via the KEYS panel or paste it to me and I run `doppler secrets set FISH_API_KEY`. Everything downstream is already wired: the stdlib client (clone/speak/speak_many/CLI) and the `fish` provider in voicezero, which silently falls back to edge-tts until the key lands. Pairs with h-fish-reference-clip.",
    done: false,
    seeded: true,
  },
  {
    id: "h-td-invisibility-build",
    text: "P3 · TouchDesigner: run the builder in Textport and save invisibility.toe (~2 min, TD is installed)",
    note: "2026-07-25: this one got orphaned when your battery died mid-session. Status re-verified 2026-07-26: TouchDesigner IS installed (C:\\Program Files\\Derivative\\TouchDesigner), the builder script IS written (Code/td-invisibility/build_invisibility.py) — but no .toe exists, so the invisibility effect has never actually been generated or seen. TD is a GUI app, I cannot drive it. Steps: (1) open TD, (2) Textport with Alt+T, (3) paste `exec(open(r\"C:\\Users\\shaur\\OneDrive\\Desktop\\Vault\\Code\\td-invisibility\\build_invisibility.py\").read())`, (4) view /invisibility/out1, (5) Save As invisibility.toe. It self-animates on open, so it proves itself with no camera and no plugin attached. WHAT TO SEND ME: the script guards every param write and PRINTS the ones it could not set (Displace/Rectangle/Noise param names drift across TD builds) — paste that warning list to me and I patch the builder. Real hand tracking is a separate later step (needs Torin Blankensmith's MediaPipe TD plugin, then export a landmark CHOP onto Centerx/Centery/Width — one wire).",
    done: false,
    seeded: true,
  },
  {
    id: "h-postiz-key",
    text: "P3 · Get a POSTIZ_API_KEY (hosted Postiz account) so the 28-platform scheduler works",
    note: "2026-07-24: installed the `postiz@claude-plugins-official` plugin at user scope — no Docker, lightweight. It is inert without POSTIZ_API_KEY. Sign up for a hosted Postiz account, copy the API key, drop it via the KEYS panel (or paste it to me) and I set Doppler. Payoff: one scheduler across 28+ platforms, which is the piece the existing per-platform autoposters (carousel-autoposter, philosopher, football) each reimplement. Low urgency — nothing is broken without it, it just stays unused.",
    done: false,
    seeded: true,
  },
  {
    id: "h-vault-leftovers",
    text: "P3 · Vault audit leftovers: 4 code folders living in Projects/ + raw/ items - decide, I execute",
    note: "2026-07-21 update (you said 'go'): I checked. (a) the 4 code folders are github-profile, portfolio, vayuvani, vayuvani-app - and the prior audit DELIBERATELY did not move them because 'deploys depend on these paths'. github-profile is likely safe (its automation is a cloud GitHub Action); portfolio/vayuvani/vayuvani-app deploy from disk, so a blind move can break prod. I will NOT move deploy-critical folders on a generic 'go' - reply per folder (e.g. 'move github-profile') and I do that one carefully. (b) raw/exun.docx + raw/reference/ is a content task (wiki processing), not a move - say the word and I process it. (c)+(d) the specific dup essay PDF path and the exun-tasks-status rename target weren't in this note and the vault is too slow to scan blind - tell me the file and target and I do it in seconds.",
    done: false,
    seeded: true,
  },
  {
    id: "h-spare-groq-key",
    text: "P3 · Spare Groq key ...39ZZ8 is valid but has no home. The live dental key is ...xMYOMl. Where do you want it?",
    done: false,
    seeded: true,
    note: "I did not rotate the live receptionist key without a reason to.",
  },
  {
    id: "h-vayuvani-deepgram-junk",
    text: "P3 · vayuvani DEEPGRAM_API_KEY in Doppler holds a GitHub Pages URL, not a key. Delete the junk entry?",
    done: false,
    seeded: true,
    note: "Nothing is broken: no vayuvani code reads Deepgram at all. It is just a misleading entry that looks like a secret.",
  },
];
