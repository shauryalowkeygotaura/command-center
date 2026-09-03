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

To retrofit the gate onto older files:

```bash
python scripts/clean_call_lists.py --dry-run   # then without the flag
```

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
    "kind": "private"
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
