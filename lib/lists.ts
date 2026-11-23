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
// Retired 2026-11-24: h-voice-pacing (picked E_orpheus_diana_onecall; now the format-render default),
//   h-groq-key-dead (replaced by h-groq-cleanup, one command). Every note is now numbered steps (asked 2026-11-24).
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
    note: "Why: the 23:00 review only reads your real day if your ticks and replies reach it.\n1. Open the Command Center, LOCK IN tab.\n2. Look at the button row at the top.\n3. 'log ✓' = working, you are done.\n4. 'log ✕' = open the KEYS panel, click the settings gear, re-enter your passphrase.\n5. Reload LOCK IN and check it says 'log ✓'.\nReply `log = ok` or `log = x`.",
  },
  {
    id: "h-nightcrew-open-cloud",
    text: "P1 · CONNECT nightcrew to Roblox: make an Open Cloud API key + 2 empty games. Without it no nightcrew game is ever tested or published",
    done: false,
    seeded: true,
    note: "2026-11-24: this is the missing Roblox connection. roblox.py and all 3 workflows already read these values, but none are set, so the smoke test and publish stages skip every run.\n1. On create.roblox.com, click Create, make a new empty Baseplate experience named 'nightcrew test'. Keep it private.\n2. Make 2 more empty experiences: 'nightcrew slot 1' and 'nightcrew slot 2'.\n3. For each one, open it in Creator Hub. The URL holds the universe id, and Places shows the place id. Write each down as universeId:placeId.\n4. Open create.roblox.com/dashboard/credentials, then API Keys, then Create API Key. Name it nightcrew.\n5. Add API system 'universe-places' with Write, and 'Luau execution session' (universe.place.luau-execution-session) with Write.\n6. Add 'assets' with Read and Write, and 'universe.thumbnail' with Read and Write.\n7. For each permission, pick only the 3 nightcrew experiences, not your whole account.\n8. Accepted IP addresses: 0.0.0.0/0 (GitHub runners change IP). Set an expiry of 90 days.\n9. Click Save, then copy the key (it is shown once).\n10. In a terminal: `gh secret set ROBLOX_API_KEY -R shauryalowkeygotaura/nightcrew`, then paste the key and press Enter.\n11. `gh variable set NIGHTCREW_TEST_SLOT -R shauryalowkeygotaura/nightcrew -b <test universeId:placeId>`\n12. `gh variable set NIGHTCREW_SLOTS -R shauryalowkeygotaura/nightcrew -b <slot1>,<slot2>`\n13. `gh variable set NIGHTCREW_CREATOR -R shauryalowkeygotaura/nightcrew -b user:<your Roblox user id>` (the number in your profile URL).\nReply `roblox key = set` and I run the smoke stage on the next game.",
  },
  {
    id: "h-roblox-creator-ready",
    text: "P1 · ROBLOX account: turn on 2FA and do the age check. Every nightcrew game is stuck 16+ only without it",
    done: false,
    seeded: true,
    note: "Why: new games launch to age-checked 16+ players only. Reaching under-16s, where most players are, needs this. Source: Research/roblox-platform-2026-research-2026-11-17.md.\n1. On roblox.com, open Settings, then Security.\n2. Turn on 2-Step Verification. Use an authenticator app, not email.\n3. In Settings, open Account Info and click Verify My Age.\n4. Do the facial age estimate on your phone (fine under 18).\n5. Wait for the 'age verified' badge in Account Info.\nReply `roblox = 2fa + age checked` or `roblox = blocked <why>`.",
  },
  {
    id: "h-vayuvani-answer-key",
    text: "P1 · SEND the two VayuVani answer-key requests: email Dr Shahzad Gani (IIT Delhi) and post the RTI to DPCC",
    done: false,
    seeded: true,
    note: "Why: Kaun's local source calls were at chance level in the blind test. Measured hourly source data is the only way to tune it. Final drafts: Projects/vayuvani/outreach-final-2026-11-23.md.\nEMAIL:\n1. Open that file, section 1, and copy the email.\n2. Send it from your Gmail to the address given in the file.\nRTI:\n3. At a post office, buy a Rs 10 Indian Postal Order payable to 'Accounts Officer, Delhi Pollution Control Committee'.\n4. Print section 2 of the file. Write your postal address and the IPO number on it, then sign it.\n5. Photocopy everything.\n6. Send it by Speed Post to: SPIO (Administrative Officer), DPCC, 4th & 5th Floor, ISBT Building, Kashmere Gate, Delhi 110006.\n7. Keep the receipt. The 30-day reply clock starts when they receive it.\nReply `vayu = sent` and later with what came back.",
  },
  {
    id: "h-dental-targets-tier-a",
    text: "P1 · WALK INTO the 4 Tier-A Delhi clinics I handpicked, nearest is 1.0 km from your school",
    done: false,
    seeded: true,
    note: "Why: a student walking in converts differently from a cold DM. List and reasoning: Deliverables/handpicked-dental-targets-2026-08-28.md (Kalra Dental lists 4 phone numbers, the strongest buy signal; New Delhi Dental Centre is 1.0 km from DPS RK Puram).\n1. Open the file and pick New Delhi Dental Centre first (closest).\n2. Call the listed number once to check it is current.\n3. Go between classes, ask the front desk how many calls they miss when busy.\n4. Offer the free 2-week trial and ask for the owner's number.\n5. Write what they said in the file under the clinic's name.\n6. Repeat for the other 3.\nReply `targets = walked <name>`, or `targets = physio` if you want the physio pitch written.",
  },
  {
    id: "h-t20-deadlines",
    text: "P1 · T20: Diamond Challenge concept due 14 Jan 2027, 5 PM EST (3:30 AM IST on 15 Jan). Lock a team of 2-4 + an adult advisor",
    done: false,
    seeded: true,
    note: "2026-11-24, re your reply: checked again. NASA Space Apps 2026 ran 14-15 Nov, so it is over. Results: nominees in Dec, winners in Jan. Diamond is open until 14 Jan 2027, 5 PM EST (University of Delaware Horn timeline; one older Diamond page says 15 Jan, so treat 14 Jan as the real one).\n1. If you entered Space Apps, write what you built in one line for the T20 log.\n2. Pick 1-3 classmates aged 14-18 (team of 2-4, each student on one team only).\n3. Ask a teacher or parent aged 21+ to be adult advisor.\n4. Register the team at diamondchallenge.org.\n5. Pick the idea (I suggest the dental receptionist or VayuVani; both have real data).\n6. Tell me the names and the idea, and I draft the concept narrative with you.\nReply `t20 = spaceapps <what happened>, diamond <names>`.",
  },
  {
    id: "h-groq-cleanup",
    text: "P2 · RUN one Groq cleanup command: the revoked key still breaks autoshop's CI and 2 other projects",
    done: false,
    seeded: true,
    note: "2026-11-24: the revoked key (ends SEX5) is still in autoshop GROQ_API_KEY_2, philosopher-pipeline GROQ_API_KEY and vayuvani GROQ_API_KEYS. autoshop's GitHub secret GROQ_API_KEY is dead too, so the 22 Nov weekly run 401'd on its first call. I wrote the fix but auto mode will not let me write secrets, so it is your one command.\n1. Open a terminal in the Vault folder.\n2. Run `python Scripts/groq_cleanup_dead.py`.\n3. It swaps the dead key for live ones in Doppler and updates autoshop's 3 GitHub secrets. It never prints a key.\n4. Check with `python Scripts/groq_key_health.py`. The last line should say 'dead: 0'.\nReply `groq = cleaned`.",
  },
  {
    id: "h-autoshop-lemon-confirmation-links",
    text: "P2 · autoshop: set each Lemon product's 'after purchase' link once, or buyers keep getting the July PDF",
    done: false,
    seeded: true,
    note: "2026-11-24, re 'product quality isn't good': two real causes. (a) FIXED: the PDF builder dropped every line after another line. The 22 Nov n8n product lost 112 lines: all use cases, code blocks and results. Fixed and pushed (c8742cc), next Sunday's run is the first full one. (b) YOURS: Lemon's API cannot replace the file (405 every run), so buyers still download whatever PDF you attached by hand. The fresh PDF is hosted at a fixed link that only needs setting once. It already runs weekly (Sundays 07:00 UTC), not daily.\n1. In Code/autoshop run `doppler run -- python list_delivery_links.py`. It prints 6 links, one per niche.\n2. Open app.lemonsqueezy.com, then Products.\n3. Open a product, scroll to Confirmation modal / Receipt, set 'Button link' to that niche's link.\n4. Save, and repeat for all 6.\n5. Delete the old attached PDF file from each product.\nReply `lemon = links set`.",
  },
  {
    id: "h-revengine-ig-autopost",
    text: "P2 · Revengine IG: autoposter improved. Post each ready-to-post bundle by hand until @revengineee is aged",
    done: false,
    seeded: true,
    note: "2026-11-24, re 'improve autoposter first': done. (1) 11, 12 and 17 Nov posts died on one dead Groq key. It now rotates keys and waits out throttles (groq_pool). (2) The caption opened with the raw log title ('Vayuvani: blind test, co unit bug...'). It now leads with the cover hook and subhead, and the LinkedIn title matches. Pushed 223004d. Still true: the cron only runs when your laptop is on, which is why the gaps are there.\n1. Open OneDrive on your phone: Code/carousel-autoposter/ready-to-post/<date>/.\n2. In Instagram, new post, pick 01.jpg to 06.jpg in order.\n3. Paste caption.txt as the caption.\n4. Post, then tell me so it lands in the taste ledger.\n5. Once the account is 30+ days old with normal activity, reply `ig = aged` and I flip POST_IG=1.\nReply `ig = posted <date>`.",
  },
  {
    id: "h-li-comment-round",
    text: "P2 · LINKEDIN comment round: run Scripts/linkedin-feed-copy.js on your scrolled feed, paste the result to me, post the comments I draft yourself",
    done: false,
    seeded: true,
    note: "Why: a comment on a big post reaches more people than most of your own posts. Nothing automated touches the account.\n1. Open linkedin.com/feed in Chrome and scroll past 10-15 posts.\n2. Press F12, open Console.\n3. Paste the whole of Scripts/linkedin-feed-copy.js and press Enter (first time: type 'allow pasting' first).\n4. It says 'copied N posts'. Paste that into a Claude chat.\n5. I give 2 comment options per post. Post the ones you like yourself.\nIf it says 0 posts, send me a screenshot of one post opened in Inspect.\nReply `li = ran, <n> posts`.",
  },
  {
    id: "h-oracle-free-server",
    text: "P2 · CLAIM the Oracle Always Free server (2 CPU / 12 GB ARM, free forever): runs the voice agents 24/7 at $0",
    done: false,
    seeded: true,
    note: "Full guide: Deliverables/free-cloud-ai-perks-redemption-guide-2026-11-18.md.\n1. Get a Visa or Mastercard CREDIT card ready (RuPay, prepaid and virtual fail). Turn on international transactions in the bank app.\n2. Turn OFF any VPN.\n3. Open oracle.com/cloud/free, click Start for free, country India, verify email.\n4. Pick an account name (it becomes your console URL).\n5. Home region (permanent): Hyderabad or Mumbai; Singapore if those say out of capacity.\n6. Enter address, verify phone by SMS, add the card (~Rs 100 hold, refunded), accept.\n7. Wait for the 'account provisioned' email.\n8. If 'Error Processing Transaction': stop retrying, wait 24h, try another card.\nLimit is 2 CPU / 12 GB total; anything over gets auto-deleted.\nReply `oracle = in <region>` and I set up the server with you.",
  },
  {
    id: "h-cloudflare-free",
    text: "P2 · OPEN a free Cloudflare account: free HTTPS + tunnel in front of the Oracle server, Workers, and 10 GB R2 storage",
    done: false,
    seeded: true,
    note: "1. Open dash.cloudflare.com/sign-up, use your main email, verify it.\n2. Skip 'add a domain' for now.\n3. Open Workers & Pages once and pick a workers.dev subdomain.\n4. Open R2 and click Enable (free plan, 10 GB).\n5. My Profile, API Tokens, Create Token, template 'Edit Cloudflare Workers'.\n6. Copy the token and the Account ID (right sidebar of the dashboard).\n7. Run `doppler secrets set CLOUDFLARE_API_TOKEN` and `doppler secrets set CLOUDFLARE_ACCOUNT_ID`.\nReply `cloudflare = in`.",
  },
  {
    id: "h-mistral-free-api",
    text: "P2 · GET a free Mistral API key (Experiment plan, ~1B tokens/month, no card) as a backup brain next to the Groq pool",
    done: false,
    seeded: true,
    note: "1. Open console.mistral.ai and sign up (Google login is fine).\n2. Verify your phone number.\n3. Admin, Billing: choose the free Experiment plan.\n4. Privacy settings: turn OFF 'use my data for training'.\n5. API Keys, Create new key, name shaurya-main, no expiry.\n6. Copy it once (shown only once).\n7. Run `doppler secrets set MISTRAL_API_KEY` in each project that needs it. Never paste it in chat.\nReply `mistral = in doppler`.",
  },
  {
    id: "h-reel-brain-login",
    text: "P2 · reel-brain's Instagram session EXPIRED: log in again so @mike_buildsai (the last of your 5 creators) can be transcribed",
    done: false,
    seeded: true,
    note: "4 of 5 creators are done and already turned into nightcrew code and skills.\n1. Close heavy apps (low RAM killed a run before).\n2. Open a terminal in Code/reel-brain.\n3. Run `doppler run -- python login.py`.\n4. A Chromium window opens: log in to Instagram, do any code check it asks.\n5. Wait until the terminal says the session is saved, then close the window.\nReply `reels = logged in`.",
  },
  {
    id: "h-dental-sarvam-path",
    text: "P2 · Dental: decide whether I test Sarvam ears + voice inside your Pipecat agent (Hinglish accuracy vs Groq Whisper)",
    done: false,
    seeded: true,
    note: "Why: Sarvam leads Hindi/Hinglish accuracy in every comparison I found, but all were run by vendors. It is a swap of 2 services in your existing Pipecat agent, not a new stack. DPDP duties apply from 13 May 2027.\n1. Record 3-5 short real clinic-style calls in Hinglish on your phone (you and a friend is fine).\n2. Save them in Code/dental-receptionist/samples/hinglish/.\n3. Sign up at dashboard.sarvam.ai and copy the API key (free credits).\n4. Run `doppler secrets set SARVAM_API_KEY -p dental-receptionist -c dev`.\nReply `dental = test sarvam` (I run the side-by-side) or `dental = keep groq whisper`.",
  },
  {
    id: "h-rt-agent-mic",
    text: "P2 · Talk to the new real-time Jio agent once, with headphones, and tell me where it felt slow",
    done: false,
    seeded: true,
    note: "Why: the selftest passed, but only a live conversation tests turn-taking.\n1. Put on headphones (without them it hears itself).\n2. Open a terminal in Code/jio-outbound/local_agent.\n3. Run the command in the docstring at the top of rt_agent.py.\n4. Talk for 2 minutes. Interrupt it mid-sentence at least once.\n5. Note where it paused too long or talked over you.\nReply `rt = <what felt off>`.",
  },
  {
    id: "h-dental-niche-risk",
    text: "P2 · READ the voice-agent finding: dental offices are named as the niche to avoid on price",
    done: false,
    seeded: true,
    note: "Why: an agency owner with 20+ industries says simple booking (dental, salons) commoditises fast. The agent is the commodity; the MAINTENANCE retainer is the product. Starting there for first revenue is fine. Full writeup: Resources/skills/voice-agent-offer/SKILL.md.\n1. Open that file and read the 'what to avoid' and 'maintenance' sections (5 min).\n2. Decide if the 0/3k/6k tiers should price monthly maintenance instead of the agent.\nReply `dental = reprice on maintenance` or `dental = leave pricing`.",
  },
  {
    id: "h-github-pat-scope",
    text: "P2 · REISSUE the GitHub token in Doppler: it can delete any of your repos",
    done: false,
    seeded: true,
    note: "Why: portfolio/GITHUB_API_KEY has admin:enterprise, admin:org and delete_repo, and several automated jobs read that store.\n1. github.com, Settings, Developer settings, Personal access tokens, Tokens (classic).\n2. Generate new token (classic), name 'vault-automation', 90 days.\n3. Tick only: repo, workflow, gist.\n4. Generate and copy it.\n5. Run `doppler secrets set GITHUB_API_KEY -p portfolio -c dev` and paste.\n6. Back on GitHub, delete the old token.\nReply `pat = reissued`.",
  },
  {
    id: "h-vtuber-avatar",
    text: "P2 · Record your voice-clone take (5 min): read Code/vtuber-render/samples/voice/READ-THIS.md into your phone",
    done: false,
    seeded: true,
    note: "Why: the manhwa avatar is ready; it still talks in a stock voice.\n1. Quietest room, fan and AC off, door shut.\n2. Phone voice recorder 15-20 cm from your mouth, a little below the chin. No earphone mic.\n3. Read the 10 lines in READ-THIS.md with reel energy, 60-90 s total.\n4. Optional: lines 1, 3, 6 and 8 again in Hinglish, the way you'd say them to a friend.\n5. Save as Code/vtuber-render/samples/voice/take1.m4a (and take2-hinglish.m4a). It is gitignored, never pushed.\nReply `take = take1.m4a`. I clone it locally first; nothing is posted without your OK.",
  },
  {
    id: "h-clipworks-meta-app",
    text: "P2 · CREATE a Meta developer app (Instagram Graph API): the only Instagram path left, and it unlocks trial reels",
    done: false,
    seeded: true,
    note: "Why: instagrapi logins are dead ('Your version of Instagram is out of date'). The official app posts without ban risk and pulls real Reels insights.\n1. In the Instagram app: Settings, Account type, switch to Professional (Creator).\n2. Link it to a Facebook Page (create a blank one if needed).\n3. Open developers.facebook.com, My Apps, Create App, use case 'Other', type 'Business'.\n4. Add the product 'Instagram' (Instagram API with Instagram login).\n5. Add your IG account as an Instagram Tester under App roles, then accept the invite in the IG app.\n6. App settings, Basic: copy App ID and App Secret.\n7. Paste both in the Command Center KEYS panel, not in chat.\nReply `meta = done`.",
  },
  {
    id: "h-trial-reels-loop",
    text: "P2 · TRIAL REELS loop for philosopher-pipeline: confirm the account is Creator + linked to a Facebook Page",
    done: false,
    seeded: true,
    note: "Why: post hook variants of one reel to non-followers only, keep the hook that spreads. Needs the Meta app above.\n1. Finish h-clipworks-meta-app first.\n2. In the philosopher IG account: Settings, Account type, check it says Creator or Business.\n3. Settings, Accounts Center: check a Facebook Page is linked.\nReply `trial = yes` or `trial = no page`.",
  },
  {
    id: "h-format-channel-decision",
    text: "P2 · PICK a faceless niche from the second, story-first shortlist (my pick: true survival stories)",
    done: false,
    seeded: true,
    note: "2026-11-24: your reply ('1. yea, 2. best or god-named acc, niche needs to be more interesting') is the one from before 22 Oct. The story-first re-scan it asked for is done: Deliverables/faceless-niche-shortlist-interesting-2026-10-22.md.\n1. Open that file (2 min).\n2. Options: 1 true survival stories, 2 places humans cannot go, 3 India's hidden vaults and mysteries, 4 discoveries that proved experts wrong.\n3. Pick the account to use: best or the god-named one.\nReply `niche = <number>, account = <name>`, or `niche = rescan <what kind>` if none grab you.",
  },
  {
    id: "h-pixabay-key",
    text: "P2 · Free Pixabay key doubles the b-roll pool for zero code",
    done: false,
    seeded: true,
    note: "Why: Pixabay search is already wired; it returns nothing because the key is unset.\n1. Sign up at pixabay.com (free).\n2. Open pixabay.com/api/docs while logged in; your key is shown in the Parameters section.\n3. Run `doppler secrets set PIXABAY_API_KEY -p creative-studio -c dev` and paste.\nReply `pixabay = set`.",
  },
  {
    id: "h-roblox-studio-plugin",
    text: "P3 · OPTIONAL: install Roblox's Claude plugin so I can open Studio, playtest and screenshot games myself",
    done: false,
    seeded: true,
    note: "2026-11-24, re 'why is it asking me to install a plugin': this is NOT the nightcrew connection (that is h-nightcrew-open-cloud). It only gives me eyes in Studio on your laptop. I tried to install it, but it is only in the in-app plugin directory, not the CLI's.\n1. In Claude Code, type /plugin.\n2. Search 'Roblox Studio', install it.\n3. Open Roblox Studio, sign in, open any place.\n4. Assistant panel, ... menu, Settings, MCP Servers, turn on 'Enable Studio as MCP server'.\n5. Start a new Claude chat and say 'list my open Roblox Studio windows'.\nReply `plugin = installed` or `plugin = later`.",
  },
  {
    id: "h-ca-whatsapp-template",
    text: "P3 · WhatsApp sends 0 messages because its token EXPIRED on 13 Apr 2026: make a permanent one, or drop the channel",
    done: false,
    seeded: true,
    note: "2026-11-24, re 'no WhatsApp Manager option': you do not need WhatsApp Manager. I ran the template workflow tonight: Meta says the access token expired on 13 Apr 2026, so nothing has gone out since. A System User token never expires and is made in Business Settings.\n1. Open business.facebook.com/settings (Meta Business Suite settings).\n2. Users, System users, Add: name 'pipeline', role Admin.\n3. Click Assign assets: add your Meta app (Full control) and the WhatsApp account (Full control).\n4. Click Generate new token, pick the app, expiry 'Never'.\n5. Tick whatsapp_business_messaging and whatsapp_business_management, then Generate.\n6. Run `gh secret set WHATSAPP_ACCESS_TOKEN -R shauryalowkeygotaura/client-acquisition-pipeline` and paste.\nIf you cannot see System users, the number is not in a business you admin, and dropping it is the right call (email is the bottleneck anyway).\nReply `whatsapp = token set` or `whatsapp = drop`.",
  },
  {
    id: "h-sheetal-call",
    text: "P3 · TELL ME how the 26 Sep call with Dr. Sheetal Badami went",
    done: false,
    seeded: true,
    note: "Why: her lead is stage=handoff, so the bot never replies to her again. A warm intro from her is worth more than 50 cold emails.\n1. Write 2 lines: what she thought of the product.\n2. Write 1 line: would she intro you to a clinic with the front-desk problem.\nReply `sheetal = <what she said>`.",
  },
  {
    id: "h-desk-unlock",
    text: "P3 · Unlock the DESK tab once (paste DESK_PASSPHRASE) to see clinic names",
    done: false,
    seeded: true,
    note: "Why: the pipeline repo is public, so clinic names are encrypted and only your browser decrypts them.\n1. Open a terminal in Code/client-acquisition-pipeline.\n2. Run `doppler secrets get DESK_PASSPHRASE --plain`.\n3. Copy the output.\n4. Open the Command Center DESK tab and paste it into any locked view.\nIt stays saved in that browser. Reply `desk = unlocked`.",
  },
  {
    id: "h-student-pack-pick",
    text: "P3 · PICK your GitHub Student Pack offers (my shortlist: Doppler Team, a free domain, Sentry, BrowserStack)",
    done: false,
    seeded: true,
    note: "Full list mapped to your projects: Deliverables/github-student-pack-picks-2026-09-25.md.\n1. Open education.github.com/pack while logged in.\n2. Open the file and tick the picks you want.\n3. Claim Doppler Team first (removes the 10-project cap).\n4. Claim the free domain (Namecheap or name.com offer).\nReply `pack = <picks>` and I wire each one.",
  },
];
