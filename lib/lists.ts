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
// Retired 2026-11-18: h-vayuvani-kaun-merge (PR #4 merged 18 Nov).
// Retired 2026-10-30: h-quant-explain-ml (ml_strategy.py done 10-01: lost to buy & hold),
//   h-quant-fish-channel (fish_study.py scorecard done 10-08), h-paralang-latency +
//   h-paralang-listen-perf (v0.3 hybrid mode + prewarmed worker; speed test passes, 0.4 s).
// Retired 2026-10-01: h-harvey-setup (Harvey's safeguards + desk were folded
//   into client-acquisition-pipeline and the DESK tab; no separate agent to set up).
// Retired 2026-09-25: all done items, h-format-engine-tpm-bug (info only),
//   h-clipworks-doppler-slot (resolved), h-ca-verify-first-sends (superseded by
//   h-proof-count), h-instagram-creds (dup of h-ca-instagram-creds),
//   h-autoshop-ig-session (folded into h-instagram-login), h-fish-reference-clip
//   (folded into h-fish-api-key), h-revengine-post-1 (folded into ig-autopost).
// Retired 2026-09-25 (later): h-bandit-orphaned (resolved: the 134 reward rows
//   carry no arm value, so relearning from zero is the only option).
// Retired 2026-10-22: h-revengine-linkedin-token (minted 2026-10-22, 59 days, self-stored),
//   h-deepgram-vercel-env (key added, redeployed), h-city-grid-render
//   (skipped as recommended), h-instagram-login (instagrapi dead; folded into
//   h-clipworks-meta-app).
// Retired 2026-10-15: h-proof-count (confirmed: 2 clinics), h-dental-report-commit
//   (5cbae1b), h-two-repos-still-unversioned (git init done 2026-10-08).
// Retired 2026-10-03: football licence (MIT, pushed), taste Stop hook (armed),
//   pinterest ack (wired, see h-pinterest-boards), setup-package licence (personal
//   backup, stays private), vayuvani deepgram junk (deleted), YouTube key (verified),
//   whop x2 (no dashboard access), postiz (paid), fish (parked), IG sending account
//   (parked), asteroid video (superseded by voice pacing work).
export const HANDOFF_SEED: ChecklistItem[] = [
  {
    id: "h-lockin-log-check",
    text: "P1 · OPEN LOCK IN and check for 'log ✓' in the button row at the top: it decides whether tonight's review reads your real day",
    done: false,
    seeded: true,
    note: "2026-10-15: every 23:00 review so far said 'source: plan' because your ticks and handoff replies never left the browser. Now LOCK IN sends them through your KEYS passphrase (no GitHub token, no paste), and the review reads every new reply, writes what happened, and edits tomorrow itself: re-dates what slipped, adds follow-ups your replies create, retires only what your ticks or replies say is finished (max 6 changes, all listed in Notes/claude-notes/lockin-<date>.md). If you see 'log ✕', your browser's saved passphrase is stale: re-enter it in the KEYS panel's settings gear. Reply `log = ok` or `log = x`.",
  },
  {
    id: "h-vayuvani-answer-key",
    text: "P1 · SEND the two VayuVani answer-key requests: email Dr Shahzad Gani (IIT Delhi) and file an RTI with DPCC for the Rouse Avenue supersite data",
    note: "Kaun failed its blind test: local source calls are at chance level. Measured hourly source data is the only way to tune it to a real 95%. The Gani email is also a mentorship, internship and rec-letter opening, written to that standard. Both drafts are in Code/vayuvani/docs/outreach/answer_key_requests.md, with what to verify before sending. Reply with what came back.",
    done: false,
    seeded: true,
  },
  {
    id: "h-roblox-creator-ready",
    text: "P1 · ROBLOX account: turn on 2FA and do the age check. Every nightcrew game is stuck 16+ only without it",
    done: false,
    seeded: true,
    note: "2026-11-17 (overnight Roblox research, Research/roblox-platform-2026-research-2026-11-17.md): new games now launch to age-checked 16+ players only. Reaching under-16s (Roblox Kids 5-8, Select 9-15), where most Roblox players are, needs the creator account age-checked (facial estimation is fine under 18) with 2FA on, then a refundable fee or 2 months of Premium, then 250 highly engaged plays in 60 days. Rewarded video ads (now built into the kit) also need an ID-verified creator aged 13+. Nothing in the pipeline can do this for you. Reply `roblox = 2fa + age checked` or `roblox = blocked <why>`.",
  },
  {
    id: "h-dental-targets-tier-a",
    text: "P1 · WALK INTO the 4 Tier-A Delhi clinics I handpicked, nearest is 1.0 km from your school",
    done: false,
    seeded: true,
    note: "2026-08-28: you asked me to personally handpick these, so this is judgement rather than a scrape. Deliverables/handpicked-dental-targets-2026-08-28.md. From 105 Delhi dental practices in OpenStreetMap only 24 publish a phone number, and I ranked those 24 on three signals chosen for YOUR situation. FIRST, MULTIPLE LISTED PHONE NUMBERS is the strongest buy signal in the set: a clinic publishing three or four numbers is one where calls are already scattered and somebody is juggling them, which is exactly the pain you sell into. Kalra Dental Specialities lists FOUR. Doctor Dubey and Muskaan list three. SECOND, WALKING DISTANCE FROM DPS RK PURAM: New Delhi Dental Centre is 1.0 km, you can go between classes, and a student walking in with the school-project framing converts differently from a cold DM. Nobody else selling this product can do that. THIRD, published opening hours, meaning they already think about when patients can reach them, so the out-of-hours question lands instead of confusing them. WHAT I COULD NOT CHECK: review text. A Google review saying you called three times and nobody picked up would beat all three of my signals combined, and it needs a Places API key with billing that you do not have enabled. If you enable one, re-rank on that and ignore my ordering. Verify each number before calling too, OSM is volunteer-maintained and can be stale. The doc also argues PHYSIOTHERAPY is a better next vertical than more dentists, because cannot-pick-up-mid-appointment is more obviously true for a physio. Reply `targets = walked <name>` or `targets = physio` if you want that pitch written.",
  },
  {
    id: "h-t20-deadlines",
    text: "P1 · T20: Space Apps weekend has passed. Diamond concept due 14 Jan 2027: lock a team of 2-4 + an adult advisor",
    done: false,
    seeded: true,
    note: "2026-11-17: Space Apps was 14-15 Nov; tell me what you entered so it lands in the T20 log. Diamond's concept is due 14 Jan 2027, 5 PM ET, and needs 2-4 people plus an adult advisor, so the team is still the long pole. Reply `t20 = spaceapps <what happened>, diamond <names>`.",
  },
  {
    id: "h-oracle-free-server",
    text: "P2 · CLAIM the Oracle Always Free server (2 CPU / 12 GB ARM, free forever): runs the voice agents 24/7 at $0",
    done: false,
    seeded: true,
    note: "2026-11-18: full guide in Deliverables/free-cloud-ai-perks-redemption-guide-2026-11-18.md. One step per line:\n1. Get a Visa or Mastercard CREDIT card ready (RuPay, prepaid, virtual fail). Turn on international transactions in the bank app.\n2. Turn OFF any VPN.\n3. Open oracle.com/cloud/free, click Start for free, country India, verify email.\n4. Pick an account name (it becomes your console URL).\n5. Home region (permanent): Hyderabad or Mumbai for low voice latency; Singapore if those say out of capacity.\n6. Enter address, verify phone by SMS, add the card (~Rs 100 hold, refunded), accept.\n7. Wait for the 'account provisioned' email.\n8. If 'Error Processing Transaction': stop retrying, wait 24h, try another card.\n9. Once in, reply `oracle = in <region>` and I create the server, firewall and SSH setup with you.\nRemember: the limit is 2 CPU / 12 GB total now, not the 4/24 in old videos; anything over gets auto-deleted.",
  },
  {
    id: "h-roblox-studio-plugin",
    text: "P2 · INSTALL Roblox's official Claude plugin (/plugin, search Roblox Studio) so I can playtest and screenshot nightcrew games",
    done: false,
    seeded: true,
    note: "2026-11-17: Roblox now ships its own Claude Code plugin (Roblox/roblox-studio-agent-plugin, MIT) that talks to Studio's built-in MCP server: playtests, screen capture, console, run Luau. Today nobody looks at a generated game before it ships; this gives me eyes. It also unlocks the biggest discovery lever found tonight: gameplay video now autoplays on Home and gave up to +39% playtime in Roblox's tests, and the third-party Chrrxs/robloxstudio-mcp can record that video (review it before installing; it is not Roblox's). Install is yours because it changes your Claude setup. Reply `plugin = installed` or `plugin = later`.",
  },
  {
    id: "h-reel-brain-login",
    text: "P2 · reel-brain's Instagram session EXPIRED mid-run: log in again so @mike_buildsai (the last of your 5 creators) can be transcribed",
    done: false,
    seeded: true,
    note: "2026-11-17: 4 of the 5 creators you sent are done (adamdoesrobloxx 63 reels, rxzdev 7, oksitaine 5, oakbranchstudio 6) and already turned into nightcrew code, playbooks and 3 skills. The session died before @mike_buildsai started. Command: `doppler run -- python login.py` in Code/reel-brain (a Chromium window opens; close heavy apps first, low RAM killed a run tonight too). Reply `reels = logged in` and I finish mike_buildsai the same way.",
  },
  {
    id: "h-dental-sarvam-path",
    text: "P2 · Dental: test Sarvam ears + voice inside your Pipecat agent on real clinic audio (Hinglish accuracy vs Groq Whisper)",
    done: false,
    seeded: true,
    note: "2026-11-17 scout: Exotel's Voicebot Applet streams straight into Pipecat (ExotelFrameSerializer), and Sarvam's saaras:v3-realtime STT + bulbul TTS ship in pipecat-ai[sarvam]. Sarvam leads Hindi/Hinglish accuracy in every comparison I found, though all were vendor-run, so it needs a test on real clinic audio. Your agent already runs on Pipecat + Groq, so this is a swap of the STT/TTS services, not a new stack; Exotel's serializer also keeps the CPaaS Indian and in the clinic's name. DPDP: notice, consent and breach duties apply from 13 May 2027. Reply `dental = test sarvam` or `dental = keep groq whisper`.",
  },
  {
    id: "h-rt-agent-mic",
    text: "P2 · Talk to the new real-time Jio agent once, with headphones, and tell me where it felt slow",
    done: false,
    seeded: true,
    note: "Code/jio-outbound/local_agent/rt_agent.py is Phase 2: Pipecat, streaming both ways, you can interrupt it mid-sentence. Selftest passed against real services (TTS, Groq Whisper heard Hinglish, 5 tools, pipeline builds), but only a live conversation tests turn-taking. Headphones matter: without echo cancellation it hears itself. Command is in the file's docstring. Reply `rt = <what felt off>`.",
  },
  {
    id: "h-dental-niche-risk",
    text: "P2 · READ the voice-agent finding: your dental niche is named as the one to avoid",
    done: false,
    seeded: true,
    note: "From 6 Brendan Jowett transcripts (25,700 words, 3yr agency, $12k+ per deployment, 20+ industries). Asked which offer he would personally avoid in 2026 he says: generic appointment booking for low-complexity industries, and names hair salons, barber shops, DENTAL OFFICES and med spas explicitly. Reason: booking is simple, the systems are well known, integrations are minimal, so every newcomer starts there and margins collapse. He ALSO says starting in a simple niche to get first revenue is completely fine, which is exactly your position (gate = first paying client), so this is not 'stop'. It is 'do not plan to defend it on price'. His actual argument: the agent is now the commodity and the MAINTENANCE is the product - a retainer buys monitoring calls, reviewing transcripts, and updating prompts when their scheduler changes its API or they add a service. That reframes our 0/3k/6k tiers, which currently price the agent. Full writeup in Resources/skills/voice-agent-offer/SKILL.md. Also useful: latency budget is ~1400ms total and the LLM is ~800ms of it, so tuning TTS while running a slow model is the wrong axis. He does not use Claude for voice agents; he uses GPT-4.1 or Gemini Flash for turn-taking speed. Reply `dental = reprice on maintenance` or `dental = leave pricing, note taken`.",
  },
  {
    id: "h-cloudflare-free",
    text: "P2 · OPEN a free Cloudflare account: free HTTPS + tunnel in front of the Oracle server, Workers, and 10 GB R2 storage",
    done: false,
    seeded: true,
    note: "2026-11-18: one step per line:\n1. Open dash.cloudflare.com/sign-up, use your main email, verify it.\n2. Skip 'add a domain' for now (use the Student Pack free domain later).\n3. Open Workers & Pages once so the free workers.dev subdomain gets created; pick a subdomain name.\n4. Open R2 and click Enable (free plan, 10 GB; it may ask for a card but does not charge under the free limits).\n5. Go to My Profile, API Tokens, Create Token, template 'Edit Cloudflare Workers'.\n6. Copy the token and Account ID (right sidebar on the dashboard).\n7. Run: doppler secrets set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.\n8. Reply `cloudflare = in` and I set up the tunnel to the Oracle box.",
  },
  {
    id: "h-mistral-free-api",
    text: "P2 · GET a free Mistral API key (Experiment plan, ~1B tokens/month, no card) as a backup brain next to the Groq pool",
    done: false,
    seeded: true,
    note: "2026-11-18: one step per line:\n1. Open console.mistral.ai and sign up (Google login is fine).\n2. Verify your phone number when asked.\n3. Go to Admin / Billing and choose the free Experiment plan (no card).\n4. Go to Privacy settings and turn OFF 'use my data for training'.\n5. Open API Keys, click Create new key, name it shaurya-main, no expiry.\n6. Copy the key once (it is shown only once).\n7. Run: doppler secrets set MISTRAL_API_KEY in each project that needs it (never paste it in chat).\n8. Reply `mistral = in doppler` and I wire it as the fallback after Groq.",
  },
  {
    id: "h-github-pat-scope",
    text: "P2 · The GitHub PAT you dropped has admin:enterprise, admin:org and delete_repo. Consider reissuing it with just repo + workflow + gist.",
    done: false,
    seeded: true,
    note: "It works and is now in Doppler as portfolio/GITHUB_API_KEY. But that scope set can delete any of your repos, and it is sitting in a secrets store that several automated jobs read.",
  },
  {
    id: "h-vtuber-avatar",
    text: "P2 · Record your voice-clone take (5 min): read Code/vtuber-render/samples/voice/READ-THIS.md into your phone, save as samples/voice/take1.m4a",
    done: false,
    seeded: true,
    note: "2026-10-30: the avatar is now your own manhwa drawing (assets/avatar/manhwa-v1.png + rig-base.png): 10 expressions, jointed arms, robot hands, entrances/camera/b-roll moves (demo: Code/vtuber-render/output/cartoon/moves-demo-v1.mp4). The photo version is retired. HOW TO RECORD: quietest room, fan/AC off, door shut; phone voice recorder 15-20 cm from your mouth, slightly below the chin; no earphone mic; talk with reel energy, don't 'read'; 60-90 s; read the 10 lines in READ-THIS.md (mixed tones on purpose: hype, calm, question, shock). Optional take2-hinglish.m4a with lines 1/3/6/8 the way you'd say them to a friend. Save into Code/vtuber-render/samples/voice/ (gitignored, never pushed). THEN: reply `take = take1.m4a`. I clone it free and locally first (zero-shot clone, no upload); if it doesn't sound like you, the upgrade is ElevenLabs Instant Voice Clone (Starter, about $5/mo), your call. Nothing gets posted without your OK.",
  },
  {
    id: "h-voice-pacing",
    text: "P2 · LISTEN to 4 clips and pick the narration voice: paralang pacing is built, it only needs your ear",
    note: "2026-10-09: paralang was good but could not do this job, so it was improved: | beat and *emphasis* markup, an Orpheus engine (Groq, acts [serious]/[dramatic] itself), an Aura engine (sentence gaps only, because slowing Aura fragments made it unintelligible in the A/B), and auto-markup that can never change a word. Wired into format-render as FR_TTS_PROVIDER=paralang. Listen in Code/paralang/samples/ab: A_aura_flat (today), H_paralang_aura (andromeda paced), G_paralang_orpheus_troy, E_orpheus_hannah_onecall. Reply `voice = aura` or `voice = orpheus <name>`.",
    done: false,
    seeded: true,
  },
  {
    id: "h-trial-reels-loop",
    text: "P2 · TRIAL REELS loop for philosopher-pipeline: is the account Business/Creator linked to a Facebook Page? Yes = I build it",
    done: false,
    seeded: true,
    note: "From the reel you sent (DfzD-XNnDQx): auto-generate hook variants of one reel, post them as trial reels (non-followers only), see which spread, learn why, evolve the hooks. Philosopher-pipeline is the first target because it already has HOOKS + a bandit whose loop never closed; trial reels give a clean A/B (same quote, only the hook differs). Needs the official Graph API (trial_params with SS_PERFORMANCE auto-graduation), so it depends on the Meta app handoff above; instagrapi cannot do it and is what got the account restricted. Unverified: whether insights return reach for trial reels. format-render and vtuber-render follow later (vtuber stays approve-before-post). Reply `trial = yes` or `trial = no page`.",
  },
  {
    id: "h-clipworks-meta-app",
    text: "P2 · CREATE a Meta developer app (Instagram Graph API): instagrapi logins are now dead, this is the only Instagram path left, and it unlocks auto trial reels",
    done: false,
    seeded: true,
    note: "2026-10-22: your 3.0.20 run also got 'Your version of Instagram is out of date'. The newest instagrapi (3.1.0) still sends the same app version (449), so upgrading again changes nothing; that is why the login handoff is retired into this one. Worth it because it pays for itself twice. publikclip already ships an Instagram feedback loop that pulls real Reels insights and calibrates its virality scores against your actual views, so after a few weeks the scorer learns what performs on YOUR account rather than a generic prior. The same app also posts via the official Content Publishing API, which replaces instagrapi and removes the ban vector at zero marginal cost since you need the app regardless. Requires the IG account to be Professional (Creator or Business) linked to a Facebook Page. Send the App ID and Secret through the KEYS panel, not plain chat, then reply `meta = done`.",
  },
  {
    id: "h-revengine-ig-autopost",
    text: "P2 · Revengine IG: each day's carousel now lands in carousel-autoposter/ready-to-post/<date>/ on your phone (OneDrive). Post it by hand until @revengineee is aged",
    note: "2026-10-30 (LOCK IN task): the cron was dying on no-network at wake (3 days lost) and LinkedIn rejected a retired API version (426). Fixed: waits up to 20 min for the network, LinkedIn version rolls itself, one platform failing no longer kills the rest, and whenever auto-post is off or fails you get a hand-post bundle (numbered JPGs + caption.txt). Expired IG session = one re-login retry; any other IG error is never retried, so it cannot double-post. Flip POST_IG=1 once the account is aged (Meta app handoff is the long-term route).",
    done: false,
    seeded: true,
  },
  {
    id: "h-li-comment-round",
    text: "P2 · LINKEDIN comment round: run Scripts/linkedin-feed-copy.js on your scrolled feed, paste the result to me, post the comments I draft yourself",
    done: false,
    seeded: true,
    note: "2026-11-20: a comment on a big post reaches more people than most of your own posts, and you send each one by hand. The snippet only copies posts already on the page (up to 15, no ads, no short ones), so nothing automated touches the account. I draft 2 options per post with li-comment and li-human. Untested on live LinkedIn: if it says 0 posts, send a screenshot of one post opened in Inspect. Reply `li = ran, <n> posts` or `li = 0 posts`.",
  },
  {
    id: "h-format-channel-decision",
    text: "P2 · PICK a niche: new, more interesting shortlist of 4 (my pick: true survival stories)",
    done: false,
    seeded: true,
    note: "2026-10-22, after 'niche needs to be more interesting': a second live scan seeded on stories, not explainers (22 channels): Deliverables/faceless-niche-shortlist-interesting-2026-10-22.md. 1 true survival stories (Worth Knowing Files: 50 days old, 442 subs, 258k on '4 Men Left on an Arctic Island for 6 Years'), 2 places humans cannot go (BeyondTheGreen 64k subs, 3.1M top; a Hindi version did 1.0M at 7.9k subs), 3 India's hidden vaults and mysteries in English, 4 discoveries that proved experts wrong (crowded by a 2M-sub channel). Heists, con artists and failed experiments had no breakout channel; declassified projects got blocked as conspiracy. The account is yours to pick (best or the god-named one). Reply `niche = 1` or any number.",
  },
  {
    id: "h-pixabay-key",
    text: "P2 · Free Pixabay key doubles the b-roll pool for zero code",
    done: false,
    seeded: true,
    note: "broll._search_pixabay is already implemented and already wired - it just returns nothing because PIXABAY_API_KEY is unset, so every render currently searches Pexels alone. Free signup at pixabay.com/api/docs, then `doppler secrets set PIXABAY_API_KEY -p creative-studio -c dev`. Zero code changes. Related and already fixed this session: Pexels was only ever reading page 1 while reporting total_results in the thousands (8000 for 'dark city night'), so the pool was about 100x shallower than it looked. That now pages.",
  },
  {
    id: "h-groq-key-dead",
    text: "P3 · Groq cleanup: the revoked key still sits first in 3 pools (autoshop, philosopher-pipeline, vayuvani). Delete it there",
    done: false,
    seeded: true,
    note: "2026-11-17: you ran Scripts/replace_dead_groq.py and the 3 projects with no working key are fixed (re-checked: all 200). What is left is cosmetic: autoshop GROQ_API_KEY_2, philosopher-pipeline GROQ_API_KEY and one entry in vayuvani GROQ_API_KEYS still hold the dead key, so each call there wastes one 401 before a live key answers. Also check GitHub repo secrets copied from Doppler (vtuber-render, nightcrew), which I cannot read. Football shorts will still fail at its TTS step (edge-tts returned no audio); that is separate. Re-check anytime with `python Scripts/groq_key_health.py`. Reply `groq = cleaned`.",
  },
  {
    id: "h-sheetal-call",
    text: "P3 · TELL ME how the 26 Sep call with Dr. Sheetal Badami went",
    done: false,
    seeded: true,
    note: "Her lead is stage=handoff, so the bot will never reply to her again; this thread is fully yours. Two things worth capturing: her feedback on the product (she ran clinics for years), and whether she would make an intro to a clinic that still has the front-desk problem. A warm intro from her is worth more than 50 cold emails. Reply `sheetal = <what she said>`.",
  },
  {
    id: "h-desk-unlock",
    text: "P3 \u00b7 Unlock the new DESK tab once (paste DESK_PASSPHRASE) to see names",
    done: false,
    seeded: true,
    note: "DESK is Harvey's dashboard rebuilt on your pipeline: Today (who is waiting on you), Conversations, Sends, Campaigns, Activity, Controls (kill switch + send-gate blocks). The pipeline repo is public, so anything with a clinic's name is encrypted and only your browser decrypts it. Get the passphrase with `doppler secrets get DESK_PASSPHRASE --plain` inside Code/client-acquisition-pipeline, paste it into any locked view, done; it stays in that browser. Reply `desk = unlocked`.",
  },
  {
    id: "h-ca-whatsapp-template",
    text: "P3 · WhatsApp has sent 0 messages in the last 8 pipeline runs: no mixed pitch, but a dead channel",
    done: false,
    seeded: true,
    note: "2026-10-03: since WhatsApp Manager is not reachable for you, I built a Graph API path instead (scripts/wa_template.py + a manual 'WhatsApp template' workflow that runs list or submit with the repo-secret token; Doppler's copy is empty). That commit is local only: another session is mid-work in the same repo and the push was blocked, so it goes out with the next push. Bigger fact: the pipeline itself sends 0-3 emails per run and 0 WhatsApp, so the template is not your bottleneck. Reply `whatsapp = submit` after the workflow exists, or `whatsapp = drop`.",
  },
  {
    id: "h-autoshop-lemon-confirmation-links",
    text: "P3 · autoshop: product PDFs fixed; set each Lemon product's redirect link (`python list_delivery_links.py`)",
    note: "2026-10-03: it is already weekly (Sundays), not daily. On quality: the last weekly run CRASHED on an en dash in a title, and every smart quote or dash in paid PDFs was printing as '?'. Switched to Noto Sans, real bullet lists, bold kept; 73 tests pass, pushed. Content quality (what the model writes) is the next lever if PDFs still read thin. The Lemon redirect step below is unchanged and still yours.",
    done: false,
    seeded: true,
  },
  {
    id: "h-student-pack-pick",
    text: "P3 · PICK your GitHub Student Pack offers (my shortlist: Doppler Team, a free domain, Sentry, BrowserStack)",
    done: false,
    seeded: true,
    note: "Full list mapped to your projects: Deliverables/github-student-pack-picks-2026-09-25.md. Doppler Team removes the 10-project cap you are stuck at; a domain gives the portfolio a real address and outreach a real sender (gmail cold email is part of why the Sheetal thread read as unserious); Sentry catches portfolio errors with replays; BrowserStack reproduces the mic bug on a real phone. Azure $100 and Stripe are 18+. Reply `pack = <picks>` and I wire each one.",
  },
];
