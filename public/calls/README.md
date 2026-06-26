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

## File shape (array of objects)

```json
[
  {
    "number": "+91 96361 80333",
    "label": "Marudhar Dental",
    "whatsapp": "919636180333",
    "area": "Vaishali Nagar, Jaipur",
    "website": "https://example.com"
  }
]
```

`whatsapp` is empty for landlines (call-only). The panel shows a `wa` button
only when it is present.

## Ban-safety

Calls are unlimited. Cold WhatsApp is NOT: keep it under ~20/day from your
personal number or it gets banned. The panel shows this and you send by hand,
one tap at a time. Never wire an auto-sender to this list.

⚠️ This repo is public, so anything committed here is world-readable. The
numbers are public Google-Maps business listings, but the *list itself* (who
you're contacting) is visible. You've accepted that tradeoff for this feature.
