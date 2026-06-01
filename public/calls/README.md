# Daily call lists

The dashboard's CALL LIST auto-loads `./<YYYY-MM-DD>.json` for today's date.

Generate it with the producer (uses the pipeline's SerpAPI key):

```bash
doppler run --project client-acquisition-pipeline --config dev -- \
    python scripts/build_call_list.py
git add public/calls && git commit -m "data: call list $(date +%F)" && git push
```

File shape (array of objects):

```json
[
  { "number": "+91 96361 80333", "label": "Marudhar Dental" },
  { "number": "9001234567", "label": "Olive Green Dental" }
]
```

⚠️ This repo is public, so anything committed here is world-readable. The
numbers are public Google-Maps business listings, but the *list itself* (who
you're calling) is visible. Keep that in mind before pushing.
