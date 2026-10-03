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
// Retired 2026-10-01: h-harvey-setup (Harvey's safeguards + desk were folded
//   into client-acquisition-pipeline and the DESK tab; no separate agent to set up).
// Retired 2026-09-25: all done items, h-format-engine-tpm-bug (info only),
//   h-clipworks-doppler-slot (resolved), h-ca-verify-first-sends (superseded by
//   h-proof-count), h-instagram-creds (dup of h-ca-instagram-creds),
//   h-autoshop-ig-session (folded into h-instagram-login), h-fish-reference-clip
//   (folded into h-fish-api-key), h-revengine-post-1 (folded into ig-autopost).
// Retired 2026-09-25 (later): h-bandit-orphaned (resolved: the 134 reward rows
//   carry no arm value, so relearning from zero is the only option).
// Retired 2026-10-03: football licence (MIT, pushed), taste Stop hook (armed),
//   pinterest ack (wired, see h-pinterest-boards), setup-package licence (personal
//   backup, stays private), vayuvani deepgram junk (deleted), YouTube key (verified),
//   whop x2 (no dashboard access), postiz (paid), fish (parked), IG sending account
//   (parked), asteroid video (superseded by voice pacing work).
export const HANDOFF_SEED: ChecklistItem[] = [
  {
    id: "h-t20-deadlines",
    text: "P1 · T20 deadlines are slipping with nothing on the board: NASA Space Apps is 4-5 Oct, Diamond Challenge registration opened 16 Sep",
    done: false,
    seeded: true,
    note: "Surfaced from Notes/todos.md, where these sat unseen. Space Apps (Delhi local) is the planned VayuVani v2 build weekend, this Sat-Sun, and its registration window was ~17 Jul, so first check whether you are even registered. Diamond Challenge 2027 needs a team of 2-4 registered (concept due 14 Jan 2027). Two more 'check in September' items never got checked: Rise 2027 cohort opening and Conrad (activation expected ~30 Oct). I can verify every date live and draft registrations, but registering and picking teammates is yours. Reply `t20 = spaceapps <registered|not> diamond <team names>`.",
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
    text: "P1 · ONE command makes LinkedIn autopost live: `doppler run -- python auth_linkedin.py` in Code/carousel-autoposter",
    note: "2026-10-03: the August token was only ever printed, never stored, so it is gone and a fresh browser mint is unavoidable. auth_linkedin.py now writes the token, author URN, expiry date, POST_LINKEDIN=1 and LINKEDIN_DRAFT=1 straight into creative-studio/dev itself (via stdin, never argv), so there is nothing to paste. It also stores LINKEDIN_CLIENT_ID / SECRET if they are in your env, so every 60-day re-mint after this is the same one command. First real post lands as a DRAFT on your profile; clear LINKEDIN_DRAFT once one looks right. Reply `linkedin = minted`.",
    done: false,
    seeded: true,
  },
  {
    id: "h-desk-unlock",
    text: "P2 \u00b7 Unlock the new DESK tab once (paste DESK_PASSPHRASE) to see names",
    done: false,
    seeded: true,
    note: "DESK is Harvey's dashboard rebuilt on your pipeline: Today (who is waiting on you), Conversations, Sends, Campaigns, Activity, Controls (kill switch + send-gate blocks). The pipeline repo is public, so anything with a clinic's name is encrypted and only your browser decrypts it. Get the passphrase with `doppler secrets get DESK_PASSPHRASE --plain` inside Code/client-acquisition-pipeline, paste it into any locked view, done; it stays in that browser. Reply `desk = unlocked`.",
  },
  {
    id: "h-gemini-image-key",
    text: "P2 · Image generation has no working provider. The Gemini value you pasted (AQ.) is an ephemeral token, and it transited chat, so revoke it",
    done: false,
    seeded: true,
    note: "nano-banana is built and blocked only on a real AIza key on a Cloud project with billing on (image models have ~0 free quota). That is also why covers fall back to the ink design. The security half matters more: revoke the AQ. token whether or not you ever make the key. Reply `gemini = key set` or `gemini = revoked, skip images`.",
  },
  {
    id: "h-dental-report-commit",
    text: "P2 · SAY 'commit' for dental-receptionist: report/ (day-7 + monthly, 89 tests) and the new digest headline have never been committed",
    done: false,
    seeded: true,
    note: "Built across the 24-25 Sep sessions and left untracked on purpose because I do not commit your LIVE product without a go-ahead. It is the code that produces the page you put in front of a doctor on day 7 and on the 1st of every month, and right now one bad delete loses it. Since 1 Oct the owner digest changes sit uncommitted beside it too: the email subject and WhatsApp push now lead with the most important item (emergency, then missed callbacks, then bookings) instead of 'see email for the full recap', with 8 new tests. Second risk: the structured `hours` blocks it needs live in the clinic configs, which are gitignored, so they exist only on this laptop. Reply `report = commit` (and `hours = back up to Doppler` if you want those off-machine too).",
  },
  {
    id: "h-portfolio-mic-bugs",
    text: "P2 · Portfolio: mic still broken + 'a lot of bugs'. I am doing a full live bug sweep; your browser/device still helps",
    done: false,
    seeded: true,
    note: "2026-10-03 inbox: you say the mic still fails and there are many bugs. On 25 Sep the mic worked end to end in a fake-mic Chromium on the live site, so whatever breaks for you is device or browser specific (real mic permission, Safari/iOS audio rules, or a blocked autoplay). Next from me: a full click-through of the live site on desktop and mobile widths, with every bug written down and fixed on a branch. The one thing I cannot reproduce blind is your setup. Reply `mic = <browser> <device> <what happens>` and list any other bug you have seen.",
  },
  {
    id: "h-sheetal-call",
    text: "P2 · TELL ME how the 26 Sep call with Dr. Sheetal Badami went",
    done: false,
    seeded: true,
    note: "Her lead is stage=handoff, so the bot will never reply to her again; this thread is fully yours. Two things worth capturing: her feedback on the product (she ran clinics for years), and whether she would make an intro to a clinic that still has the front-desk problem. A warm intro from her is worth more than 50 cold emails. Reply `sheetal = <what she said>`.",
  },
  {
    id: "h-opencode-key",
    text: "P2 · Make a free OpenCode Zen account and put OPENCODE_API_KEY in Doppler + GitHub secrets",
    done: false,
    seeded: true,
    note: "Answer to 'opencode jev for replacing groq pool?': not a replacement, an overflow, and that is the better design. The Groq pool already falls through to Zen's free models only when every Groq key is spent, and the reply classifier can use free Jev. Replacing Groq outright would be worse for three reasons: Zen's free models are a limited-time offer, they may train on prompts (so never near patient data), and Groq is faster. One key unlocks both paths. It goes in client-acquisition-pipeline (Doppler + repo secret), philosopher-pipeline and autoshop, NOT dental-receptionist. Reply `opencode = set`.",
  },
  {
    id: "h-student-pack-pick",
    text: "P2 · PICK your GitHub Student Pack offers (my shortlist: Doppler Team, a free domain, Sentry, BrowserStack)",
    done: false,
    seeded: true,
    note: "Full list mapped to your projects: Deliverables/github-student-pack-picks-2026-09-25.md. Doppler Team removes the 10-project cap you are stuck at; a domain gives the portfolio a real address and outreach a real sender (gmail cold email is part of why the Sheetal thread read as unserious); Sentry catches portfolio errors with replays; BrowserStack reproduces the mic bug on a real phone. Azure $100 and Stripe are 18+. Reply `pack = <picks>` and I wire each one.",
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
    id: "h-instagram-login",
    text: "P2 · Re-run the Instagram login: the 'app out of date' error is fixed",
    done: false,
    seeded: true,
    note: "2026-10-03: the error was instagrapi 2.6.5 sending a years-old app version, which Instagram now refuses. Upgraded locally to 3.0.16 and raised the floor in autoshop, philosopher-pipeline and carousel-autoposter so CI can never resolve the old one. Run `doppler run -- python login_instagram.py` in Code/autoshop again (it needs your 2FA, so it is yours). Then, for the philosopher hooks you asked to restore: `doppler run -- python scripts/backfill_ledger.py --reattribute` in Code/philosopher-pipeline. The wording never actually changed; the backfill script promised hook matching and never did it, so all 134 old posts were hook=None. That is fixed and pushed, and --reattribute credits them and prints any old opening lines that do not match a current hook. Reply `ig = logged in`.",
  },
  {
    id: "h-ca-portfolio-os-duplication",
    text: "P2 · portfolio-os: switching the site to the real package (option 2), in progress",
    done: false,
    seeded: true,
    note: "You chose 2 or whatever is better; 2 is better (it makes the public repo load-bearing). Not started yet this session because it touches the live site: I will do it on a branch, build, and diff the rendered pages before anything reaches master. Nothing needed from you.",
  },
  {
    id: "h-ca-whatsapp-template",
    text: "P3 · WhatsApp has sent 0 messages in the last 8 pipeline runs: no mixed pitch, but a dead channel",
    done: false,
    seeded: true,
    note: "2026-10-03: since WhatsApp Manager is not reachable for you, I built a Graph API path instead (scripts/wa_template.py + a manual 'WhatsApp template' workflow that runs list or submit with the repo-secret token; Doppler's copy is empty). That commit is local only: another session is mid-work in the same repo and the push was blocked, so it goes out with the next push. Bigger fact: the pipeline itself sends 0-3 emails per run and 0 WhatsApp, so the template is not your bottleneck. Reply `whatsapp = submit` after the workflow exists, or `whatsapp = drop`.",
  },
  {
    id: "h-rt-agent-mic",
    text: "P3 · Talk to the new real-time Jio agent once, with headphones, and tell me where it felt slow",
    done: false,
    seeded: true,
    note: "Code/jio-outbound/local_agent/rt_agent.py is Phase 2: Pipecat, streaming both ways, you can interrupt it mid-sentence. Selftest passed against real services (TTS, Groq Whisper heard Hinglish, 5 tools, pipeline builds), but only a live conversation tests turn-taking. Headphones matter: without echo cancellation it hears itself. Command is in the file's docstring. Reply `rt = <what felt off>`.",
  },
  {
    id: "h-football-yt-oauth",
    text: "P3 · football-shorts-autopilot: one YouTube OAuth run is the ONLY thing between it and real uploads. Still want it?",
    done: false,
    seeded: true,
    note: "It was folded into the faceless-channel decision below, but football shorts is its own channel and its own project: built, CI green, dry-running daily since June, and `uploader.is_dry()` forces dry mode while the YouTube creds are absent. auth_youtube.py is the one browser login it needs. The same creds would also make format-render's publish step real. Reply `football = go` and we do the login together, or `football = shelve` and I stop the daily dry runs.",
  },
  {
    id: "h-brand-launchpad-stars",
    text: "P3 · brand-launchpad: 3 clicks only you can make (social preview, pin repo, awesome-claude-code form)",
    done: false,
    seeded: true,
    note: "Sitting in Notes/todos.md since June, never on this board. The GitHub API cannot upload a social preview or pin a repo, and awesome-claude-code accepts only its web issue form (a PR or gh there gets you banned). Paste-ready copy is in Projects/brand-launchpad-product/. The preview card is the biggest click-through lever whenever the link is shared. Reply `launchpad = done`.",
  },
  {
    id: "h-strix-docker",
    text: "P3 · Strix pentest agent is installed but cannot run: Docker Desktop is stopped",
    done: false,
    seeded: true,
    note: "Installed 10 Sep with ranked scan targets in Projects/strix/overview.md. It needs the Docker daemon running (29.2.1 is installed, just not started) and runs through Doppler with Groq. Only worth doing if you want your public repos scanned. Reply `strix = docker on` or `strix = drop`.",
  },
  {
    id: "h-format-channel-decision",
    text: "P3 · Faceless channel = YES on the 'god'-named account. I owe you a more interesting niche shortlist",
    done: false,
    seeded: true,
    note: "2026-10-03: you said yes, the god-named account (or whichever is best), and that the niche needs to be more interesting than asteroids. Next from me: 3-5 niches mined with format-engine against live breakouts (momentum, RPM, how recognisable the hook is), each with one sample title. You pick one, then we do the YouTube OAuth together, which also unblocks football shorts. Reply with a niche anytime to skip the shortlist.",
  },
  {
    id: "h-city-grid-render",
    text: "P3 · City-grid render: fixing the samey tone and the '4 Levels vs 17 beats' title before burning 2.5 hours",
    done: false,
    seeded: true,
    note: "You said do the best thing. The best thing is not to render as-is: both known defects would be baked into 17 minutes of video. Plan: loosen --tone so it sets lighting only (not location), make the title derive from the beat structure, then render in the background and eyeball the first minute before letting it finish. Nothing needed from you.",
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
    id: "h-pixabay-key",
    text: "P3 · Free Pixabay key doubles the b-roll pool for zero code",
    done: false,
    seeded: true,
    note: "broll._search_pixabay is already implemented and already wired - it just returns nothing because PIXABAY_API_KEY is unset, so every render currently searches Pexels alone. Free signup at pixabay.com/api/docs, then `doppler secrets set PIXABAY_API_KEY -p creative-studio -c dev`. Zero code changes. Related and already fixed this session: Pexels was only ever reading page 1 while reporting total_results in the thousands (8000 for 'dark city night'), so the pool was about 100x shallower than it looked. That now pages.",
  },
  {
    id: "h-install-component-taste",
    text: "P3 · Install the full Taste Skill collection: one command, mine was blocked",
    done: false,
    seeded: true,
    note: "2026-10-03: 'component taste' best matches Leonxlnx/taste-skill (MIT). You only have its base skill; the repo also ships redesign, minimalist, brutalist, soft, output and image-to-code variants. My install was blocked by the permission classifier (third-party code into ~/.claude), so run `! npx skills add Leonxlnx/taste-skill`. Also re-run `bash install.sh` in Code/taste-engine so the installed SKILL.md picks up the new one-board-per-project Pinterest rule.",
  },
  {
    id: "h-pinterest-boards",
    text: "P3 · Send one Pinterest board URL per project you want taste-engine to learn from",
    note: "2026-10-03: wired as you asked. Each taste-engine project now binds ONE board (kept local, gitignored). `/ts pin <url>` binds and pulls it, `/ts pin` alone re-pulls. The robots.txt acknowledgement is set once in your Claude settings. Reply `pin <project> = <board url>` for each.",
    done: false,
    seeded: true,
  },
  {
    id: "h-two-repos-still-unversioned",
    text: "P3 · git init voicezero-space and heart-venture-paper: blocked for me, 2 commands for you",
    done: false,
    seeded: true,
    note: "You said fix it, but the permission classifier blocked me even from listing those folders, so I could not check them for secrets before a first commit. Run `git init` and `git add -A` in each, glance at `git status` for any .env or key file, then commit. Or allow it and I do it next session.",
  },
  {
    id: "h-revengine-ig-autopost",
    text: "P3 · Revengine IG: autoposter improved, now hand-post until @revengineee is aged, then POST_IG=1",
    note: "2026-10-03 (you said improve the autoposter first): it kept drafting from the same session entry (one entry fed 3 carousels, another fed 4 in two weeks); entries already used now lose to fresh ones. A stale cover test was fixed and the LinkedIn mint now stores itself. The ageing advice stands: hand-upload for 1-2 weeks, then flip POST_IG=1.",
    done: false,
    seeded: true,
  },
  {
    id: "h-autoshop-lemon-confirmation-links",
    text: "P3 · autoshop: product PDFs fixed; set each Lemon product's redirect link (`python list_delivery_links.py`)",
    note: "2026-10-03: it is already weekly (Sundays), not daily. On quality: the last weekly run CRASHED on an en dash in a title, and every smart quote or dash in paid PDFs was printing as '?'. Switched to Noto Sans, real bullet lists, bold kept; 73 tests pass, pushed. Content quality (what the model writes) is the next lever if PDFs still read thin. The Lemon redirect step below is unchanged and still yours.",
    done: false,
    seeded: true,
  },
  {
    id: "h-inbox-sync-pat",
    text: "P3 · Inbox sync: the portfolio PAT is the wrong token for this. Paste a gist-only one in the INBOX panel",
    note: "The key in portfolio/GITHUB_API_KEY carries admin:org, admin:enterprise and delete_repo. Pasting that into a browser panel on every device spreads a repo-deleting token around. A classic token with ONLY the gist scope is the right one; one paste per device covers INBOX and HABITS.",
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
    id: "h-vault-leftovers",
    text: "P3 · Vault audit leftovers: 4 code folders living in Projects/ + raw/ items - decide, I execute",
    note: "2026-07-21 update (you said 'go'): I checked. (a) the 4 code folders are github-profile, portfolio, vayuvani, vayuvani-app - and the prior audit DELIBERATELY did not move them because 'deploys depend on these paths'. github-profile is likely safe (its automation is a cloud GitHub Action); portfolio/vayuvani/vayuvani-app deploy from disk, so a blind move can break prod. I will NOT move deploy-critical folders on a generic 'go' - reply per folder (e.g. 'move github-profile') and I do that one carefully. (b) raw/exun.docx + raw/reference/ is a content task (wiki processing), not a move - say the word and I process it. (c)+(d) the specific dup essay PDF path and the exun-tasks-status rename target weren't in this note and the vault is too slow to scan blind - tell me the file and target and I do it in seconds.",
    done: false,
    seeded: true,
  },
  {
    id: "h-spare-groq-key",
    text: "P3 · Spare Groq key ...39ZZ8 goes in the pool as GROQ_API_KEY_3: one Doppler set per project, mine was blocked",
    done: false,
    seeded: true,
    note: "The pool already does what you described: the best model per pipeline first, downgrade down the chain on failure, rotate keys across accounts. Moving keys between Doppler projects was blocked for me (credential handling), so add ...39ZZ8 as GROQ_API_KEY_3 in philosopher-pipeline, autoshop and client-acquisition-pipeline (plus the repo secret where CI runs). Only worth it if ...39ZZ8 is from a different Groq account than the other two; same-account keys share one quota.",
  },
  {
    id: "h-voice-pacing",
    text: "P3 · Voice pacing for format-render: pauses so the narration can land on intense words (mine)",
    note: "From your asteroid reply. Deepgram Aura ignores SSML, so the plan is to mark emphasis beats in the script and split the TTS there, inserting short silences (and a slower pass on the key line), then re-check caption timing. Nothing needed from you; you get a before/after clip to judge.",
    done: false,
    seeded: true,
  },
  {
    id: "h-quant-explain-ml",
    text: "P3 · quant-lab: the plain-English answer to 'people earn money with trading', and a basic ML strategy run through the same honest tests (mine)",
    note: "Simple version: some people do make money, most active traders do not, and the winners mostly have an edge you cannot copy (speed, data, scale) or got lucky; the lab has shown every strategy tried so far earns less than just holding the index. A self-optimising loop is exactly what loses (it was tested: re-searching every fold lost to buy & hold on Nifty and the S&P). A basic ML model is fine to TRY, and ml_strategy.py is already started: it must go through the same walk-forward and trial ledger, so a lucky fit cannot sneak through. Paper only, no real money, as always.",
    done: false,
    seeded: true,
  },
  {
    id: "h-quant-fish-channel",
    text: "P3 · Analyse every @not_a_lil_fish video and keep only what is testable in quant-lab (mine)",
    note: "Pull all transcripts, list each concrete claim or strategy, and test only the ones that fit the lab's rule (a price history in, a position out). Anything that needs news, leverage or 'trust me' gets a one-line reason it was dropped. You get a short scorecard: claim, tested or not, result.",
    done: false,
    seeded: true,
  },
  {
    id: "h-quant-markets",
    text: "P3 · Polymarket / Kalshi / crypto in quant-lab: data and paper trading YES, real money NO",
    note: "Crypto price history (BTC, ETH) drops straight into the existing backtester. Polymarket and Kalshi publish market prices you can read for free, so paper-forecasting against them is a real, interesting test of whether you can beat a crowd. What I will not wire: real accounts or memecoins. Both prediction markets are 18+, India taxes crypto at 30% plus 1% TDS, and memecoins have no price history worth testing (most go to zero). Reply `markets = crypto first` or `= prediction markets first`.",
    done: false,
    seeded: true,
  },
  {
    id: "h-jobleft-windows",
    text: "P3 · jobleft (blueturboguy07) is Mac-only. I can try a Windows build; tell me what you want it for",
    note: "It is a TypeScript desktop app (15 stars, active) that reads employer job boards, scores matches and tailors resumes, shipped only as an Apple-silicon .dmg. If it is a Tauri or Electron app, a Windows build is usually possible from source, but the macOS Keychain part would need replacing. Before I spend that time: what is it for? Internships and summer programs would need a different set of sources than the US tech boards it reads. Reply `jobleft = <what you want to find>`.",
    done: false,
    seeded: true,
  },
];
