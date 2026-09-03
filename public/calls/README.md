# Daily lead lists

The dashboard's **CALL + MESSAGE** panel auto-loads `./<YYYY-MM-DD>.json` for
today's date: real clinic leads to call and (where the number is a mobile)
WhatsApp.

## Automatic (daily)

`.github/workflows/leads-daily.yml` runs every morning (01:00 UTC / 06:30 IST):
it builds the next batch of *fresh* leads, commits today's file, and triggers a
Pages rebuild. No manual step once the secret is set.

**One-time setup** — give it the SerpAPI keys (rotated to stay on the free
tier, ~100 searches/month per account):

```bash
# from comma-separated keys across a few free SerpAPI accounts
gh secret set SERPAPI_KEYS -R shauryalowkeygotaura/command-center
```

Until that secret exists the workflow is inert: the producer exits clean and
nothing is committed, so the daily run just stays green.

## Manual (local)

```bash
doppler run --project client-acquisition-pipeline --config dev -- \
    python scripts/build_call_list.py
git add public/calls && git commit -m "data: call list $(date +%F)" && git push
```

## Freshness / dedupe

`_seen.json` is the memory of every lead ever emitted (last-10-digit phone
keys). Each run skips anything already seen, so you get *new* clinics daily, not
the same top results. When a city's pond thins, add cities via `CALL_CITIES`
(comma-separated) or top up by hand. The producer rotates SerpAPI keys, so it
moves to the next account when one runs out of quota.

## Who gets on the list

Government facilities never do. They were **121 of 516 entries (23%)** across
the first 13 daily files: CGHS dispensaries, ESI dispensaries, MCD/NDMC
dispensaries, Aam Aadmi polyclinics, Chandigarh civil and ayurvedic
dispensaries. Two days (08-17, 08-27) were more than half government.

They came in because the Overpass fallback queries `amenity=clinic` alongside
the dentist tags, and in Indian OSM data that branch is largely public health
infrastructure. **43% of Delhi's phone-bearing OSM listings are government** —
worse than the raw share, because civic imports carry phone numbers where
private clinics often do not, so the old "has a phone" filter actively selected
for them.

None of them can buy: no owner, no P&L, no marketing budget, spend by tender.
`scripts/lead_quality.py` now drops them before they reach the file, and prints
what it dropped so a short list is never mistaken for a dry pond.

Chains (Clove Dental, Apollo) are **labelled, not dropped** — `kind: "chain"`
puts a badge on the row. They buy centrally, but that is a judgement about the
offer, not a fact about the entity.

## Order: A, B, C

The day runs out before the list does, so the order is the product. Rows are
sorted best first and carry a tier.

The **tier is definitional, not a prediction**. It asks the only two things
that have to be true before a call can work at all:

- **Reach** — can this call land on someone with the authority to say yes? A
  mobile is usually the dentist's own; a landline is the front desk, which
  cannot buy and is the role the product touches. A chain branch cannot buy
  either: procurement is central.
- **Fit** — does the pitch land? Dental gets two live deployments, a dental
  demo and a dental system prompt behind it. A diagnostics lab does not.

`A` is both, `B` is one, `C` is neither. That is the same test that removed the
dispensaries — they fail both, which is why they are not leads.

The **score only breaks ties inside a tier, and its weights are stated priors,
not measured ones.** Treat it as an argument, which is why every row carries
the `reasons` that produced it — hover the tier letter to read them.

### Checking whether any of it is true

Tick a row and an outcome selector appears: *no answer · front desk only ·
owner not interested · owner interested · booked · dead / wrong number*.

Those six exist to test the two things the tier claims, and nothing else.
`front desk only` versus the three `owner-*` outcomes tests **reach**;
`owner, not interested` versus `owner, interested` / `booked` tests **fit**.
`dead` is kept separate from `no answer` on purpose: a wrong or closed number
is a scraper problem, not a rejection, and merging them would make the pitch
look bad while the data looked fine.

The panel then shows a per-tier tally — called, reached the owner, interested.
**If A does not out-reach B and C over a few weeks, the weights are wrong and
should change.**

Each outcome freezes `tierAtCall` and `scoreAtCall` at the moment it is
recorded, and analysis must use those, never the live `tier`. `rank()`'s
weights will change, and scoring old outcomes against re-computed tiers is a
confident answer to a question nobody asked — the same stale-attribution
mistake that orphaned 134 rewards in the philosopher-pipeline bandit when its
hook text changed.

The `copy` link next to the tally puts the recorded outcomes on the clipboard
as JSON. Everything lives in that browser's `localStorage`, so that link is the
only way the data leaves the device.

Two priors *are* grounded, in the only two clinics that have actually bought
(`dental-receptionist/assistant/clinics/*_CLIENT.md`):

- Both had a website, one with an online booking page, so **a website counts in
  favour**. The `dental-receptionist/acquisition/README.md` line about
  prioritising clinics *without* a website belongs to the older free-website-
  chatbot offer and is stale for a phone product.
- Both are Jaipur and one carries 1,150+ Google reviews. A busy practice misses
  more calls, which is the whole pitch.

n=2 sets no weights. It only stops the ranking burying its own customers, which
is what `test_ranking_matches_real_clients` checks.

Current spread across the 13 files: **A:46, B:180, C:169** — only 12% of what
the OSM pond yields is both reachable and dental.

## Landlines never get a [wa] button

`0731-2551733` is an Indore landline. Strip the trunk 0 and `7312551733` looks
exactly like a mobile in the 73xx series, so the old rule handed it a wa.me
link — to a stranger. 37 of 395 rows were like that, and cold WhatsApp to
strangers is precisely what gets the personal number banned.

`whatsapp_digits()` now checks the number against the STD codes of every city
the generator targets. It errs toward landline on purpose: losing a `[wa]`
button costs nothing because the number is still callable, whereas messaging a
stranger costs the account. The panel re-derives `whatsapp` from the number on
every load rather than trusting what is stored, so rows saved before the fix
heal themselves.

## Retrofitting older files

```bash
python scripts/clean_call_lists.py --dry-run   # then without the flag
```

Drops the unsellable, corrects `whatsapp`, adds `description`, scores and
reorders. Idempotent, atomic writes. The generator cannot do this itself:
every number in those files is stamped in `_seen.json`, so a fresh run would
skip them all and write an empty file.

## File shape (array of objects)

```json
[
  {
    "number": "+91 96361 80333",
    "label": "Marudhar Dental",
    "whatsapp": "919636180333",
    "area": "Vaishali Nagar, Jaipur",
    "website": "https://example.com",
    "description": "Dental clinic · 4.6* (128) · has website · Mo-Sa 09:00-20:00",
    "kind": "private",
    "tier": "A",
    "score": 12,
    "reasons": ["mobile, likely the owner", "dental, the pitch has proof"]
  }
]
```

`whatsapp` is empty for landlines (call-only). The panel shows a `wa` button
only when it is present.

`description` is the line under the number in the panel: what the place is,
whether it already has a website (the free-chatbot opener only lands on clinics
that do not), plus rating and hours where the source had them. Fifty bare
numbers give you nothing to choose with. Pasting by hand? Use `|` to add one:
`9636180333 Marudhar Dental | no website`.

## Ban-safety

Calls are unlimited. Cold WhatsApp is NOT: keep it under ~20/day from your
personal number or it gets banned. The panel shows this and you send by hand,
one tap at a time. Never wire an auto-sender to this list.

⚠️ This repo is public, so anything committed here is world-readable. The
numbers are public Google-Maps business listings, but the *list itself* (who
you're contacting) is visible. You've accepted that tradeoff for this feature.
