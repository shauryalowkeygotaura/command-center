# Round 2: take the WEB DEV track all the way up to the real capstone -
# the self-iterating portfolio (Next.js 16 on Vercel, cron-driven) - and
# bolt "field notes" onto the nodes whose matching Exun build used a spec
# loophole / minimum-viable-compliance shortcut.
#
# NEW    = appended web dev nodes (Next.js -> automatic website).
# PATCH  = loophole text added in place to existing nodes (any track).
#
# Idempotent + crash-safe: validates the merged DAG before writing, writes
# atomically via a temp file. ASCII-only, no em dashes, house style.

import json
import os
import sys

DATA = os.path.join(os.path.dirname(__file__), "..", "data")

FILES = {
    "webdev": "skilltree-webdev.json",
    "cp": "skilltree-cp.json",
    "ml": "skilltree-ml.json",
}

REQUIRED_KEYS = {
    "id", "track", "title", "subtitle", "level", "parents",
    "minutes", "explain", "example", "exercise", "solution", "checklist",
}
OPTIONAL_KEYS = {"loophole"}

# ---------------------------------------------------------------------------
# NEW NODES: web dev -> the automatic website
# Branches off web-react-state (so the tree forks: React Native for the
# "copt." app, Next.js for the auto-portfolio).
# ---------------------------------------------------------------------------

NEW = [
    {
        "id": "web-nextjs",
        "track": "webdev",
        "title": "Next.js: App Router",
        "subtitle": "React as a real framework",
        "level": 7,
        "parents": ["web-react-state"],
        "minutes": 35,
        "explain": "Plain React gives you components and nothing else: no routing, no server, no build story. Next.js wraps React into a full framework, and it is what the auto-portfolio actually runs on (Next.js 16).\n\nThe App Router is folder-based, like Express routes but for pages. A folder under app/ is a route; app/page.tsx is the home page, app/work/page.tsx is /work, and app/layout.tsx wraps everything in that folder with shared chrome (nav, fonts). Same file-as-route idea you saw in Expo Router, pointed at the web.\n\nThe piece that trips people up is server versus client components. By DEFAULT every component renders on the SERVER: it runs once on Vercel, can read secrets and databases directly, and ships zero JavaScript for that part to the browser, so it is fast. The moment a component needs interactivity (useState, onClick, useEffect) you put `'use client'` at the very top of the file to opt INTO the browser. The habit: server by default, client only where you truly need hands-on behaviour.\n\nThat split is the whole reason a Next.js site can quietly do server work (fetch data, call an API with a secret key) without leaking anything to the visitor.",
        "example": "// app/page.tsx -- a SERVER component (no 'use client')\nimport { Counter } from './counter';\n\nexport default function Home() {\n  // this runs on the server; could read a DB or env here\n  return (\n    <main>\n      <h1>revengine</h1>\n      <Counter />   {/* the interactive bit is its own client file */}\n    </main>\n  );\n}\n// app/counter.tsx starts with:  'use client'  (it uses useState)",
        "exercise": "Sketch two files: app/page.tsx as a SERVER component that renders an h1 and a client <Hits /> component, and say (in a comment) what the very first line of the Hits file must be and why. You wrote Hits earlier in the React state node, so reuse it.",
        "solution": "// app/page.tsx  (server component, no directive)\nimport { Hits } from './hits';\nexport default function Home() {\n  return (\n    <main>\n      <h1>revengine</h1>\n      <Hits />\n    </main>\n  );\n}\n// app/hits.tsx  -- first line MUST be:\n//   'use client'\n// because Hits calls useState, which only runs in the browser.",
        "checklist": [
            "How does the App Router decide what the routes are?",
            "What renders on the server by default, and what does 'use client' opt into?",
            "Why can a server component safely read a secret but a client component cannot?",
        ],
    },
    {
        "id": "web-server-routes",
        "track": "webdev",
        "title": "Server Code & API Routes",
        "subtitle": "where secrets stay secret",
        "level": 8,
        "parents": ["web-nextjs"],
        "minutes": 30,
        "explain": "Pages render UI. Sometimes you need a plain HTTP endpoint instead: something a cron can hit, or a form can POST to. In the App Router that is a Route Handler, a file app/api/<name>/route.ts that exports functions named after HTTP verbs: export GET, export POST, and so on. Same REST verbs you learned on the Express side, just living inside Next.\n\nThis code only ever runs on the server, which is the important part. That means it can read `process.env.MY_KEY` and the value never reaches the browser. API keys, database URLs, the LLM token: all of it lives in environment variables (you already keep yours in Doppler), gets injected at runtime, and stays server-side. The cardinal sin is putting a secret in a client component or, worse, a NEXT_PUBLIC_ variable, which Next deliberately ships to the browser.\n\nA handler reads the request, does work, and returns a Response, usually `Response.json(...)`. From here it can fetch any external API, talk to Mongo, or kick off a job. This node is the doorway between your site and everything it does behind the scenes.",
        "example": "// app/api/health/route.ts\nexport async function GET() {\n  const region = process.env.VERCEL_REGION ?? 'local'; // server-only\n  return Response.json({ status: 'ok', region, now: Date.now() });\n}\n// hit it at /api/health -- no key ever crosses to the browser",
        "exercise": "Write a Route Handler at app/api/ping/route.ts exporting a GET that returns JSON { ok: true, at: <current ISO time> }. Then write the one-sentence reason a secret read here is safe but the same read inside a 'use client' component is not.",
        "solution": "// app/api/ping/route.ts\nexport async function GET() {\n  return Response.json({ ok: true, at: new Date().toISOString() });\n}\n// Reason: a route handler executes only on the server, so process.env\n// values are never serialized into anything the browser receives; a\n// client component's code is shipped to and runs in the browser.",
        "checklist": [
            "What is the filename pattern that turns a folder into an API endpoint?",
            "Where do API keys live, and what makes NEXT_PUBLIC_ variables dangerous for secrets?",
            "What does a route handler return to send back JSON?",
        ],
    },
    {
        "id": "web-vercel-cron",
        "track": "webdev",
        "title": "Vercel Cron Jobs",
        "subtitle": "the site's heartbeat",
        "level": 9,
        "parents": ["web-server-routes"],
        "minutes": 25,
        "explain": "A normal site only does something when a visitor clicks. An AUTOMATIC site needs to do things on its own, on a schedule, with nobody watching. On Vercel that is a Cron Job: an entry in vercel.json that maps a schedule to one of your route handlers, and Vercel calls that URL for you at those times.\n\nThe schedule uses cron syntax, five fields (minute, hour, day-of-month, month, day-of-week). `0 6 * * *` means 06:00 every day; `*/15 * * * *` means every fifteen minutes. You point it at a path like /api/iterate, and that handler runs as if someone had requested it.\n\nThe security gotcha everyone hits: that URL is public, so anyone who guesses it can trigger your job. The fix is a shared secret. You store a CRON_SECRET env var, Vercel sends it as an Authorization header on its scheduled calls, and your handler rejects any request that does not carry it. Without that guard a stranger can run your expensive LLM job all day.\n\nThis is the heartbeat of the auto-portfolio: the thing that wakes the site up.",
        "example": "// vercel.json\n{\n  \"crons\": [\n    { \"path\": \"/api/iterate\", \"schedule\": \"0 6 * * *\" }\n  ]\n}\n\n// app/api/iterate/route.ts -- reject anyone without the secret\nexport async function GET(req: Request) {\n  const auth = req.headers.get('authorization');\n  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {\n    return new Response('forbidden', { status: 401 });\n  }\n  // ...do the scheduled work...\n  return Response.json({ ran: true });\n}",
        "exercise": "Write the vercel.json crons entry that runs /api/iterate once a day at 6am, and the first few lines of that handler that reject any request whose Authorization header is not `Bearer <CRON_SECRET>` with a 401.",
        "solution": "// vercel.json\n{ \"crons\": [ { \"path\": \"/api/iterate\", \"schedule\": \"0 6 * * *\" } ] }\n\n// app/api/iterate/route.ts\nexport async function GET(req: Request) {\n  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {\n    return new Response('forbidden', { status: 401 });\n  }\n  return Response.json({ ran: true });\n}",
        "checklist": [
            "Read the cron string 0 6 * * * out loud: when does it fire?",
            "Why is an unguarded cron route a real risk, and how does CRON_SECRET fix it?",
            "What does Vercel actually do at the scheduled time?",
        ],
    },
    {
        "id": "web-llm-in-app",
        "track": "webdev",
        "title": "Calling an LLM in Your App",
        "subtitle": "the engine of self-iteration",
        "level": 9,
        "parents": ["web-server-routes"],
        "minutes": 30,
        "explain": "A self-improving site needs something that can decide WHAT to improve. That decision comes from a language model, called from your own server code. The mechanics are just a fetch: POST a prompt to the model's chat-completions endpoint with your API key in the header, read the JSON back, pull out the text.\n\nTwo rules make it production-safe. First, it MUST happen in a server route, never the browser, because the request carries your secret key (you use Groq, and the key lives in an env var, not in the code). Second, treat the model's output as untrusted text: if you need structured data back, ask for JSON, then JSON.parse inside a try/catch, because a model will occasionally hand you something malformed and you do not want that to crash the cron.\n\nThe shape is always: build a prompt from your real inputs, send it, parse the reply, act on it. Here the 'act on it' is later (write a change, deploy). Right now just get clean text or JSON out of the call.\n\nThis is the brain that sits behind the heartbeat: cron wakes the route, the route asks the model, the model answers.",
        "example": "// app/api/iterate/route.ts (inside the guarded handler)\nasync function askModel(prompt: string): Promise<string> {\n  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {\n    method: 'POST',\n    headers: {\n      'Content-Type': 'application/json',\n      Authorization: `Bearer ${process.env.GROQ_API_KEY}`, // server-only\n    },\n    body: JSON.stringify({\n      model: 'llama-3.3-70b-versatile',\n      messages: [{ role: 'user', content: prompt }],\n    }),\n  });\n  const data = await res.json();\n  return data.choices[0].message.content;\n}",
        "exercise": "Write an async function suggestEdit(prompt) that POSTs to the Groq chat-completions URL with the key from process.env.GROQ_API_KEY, sends the prompt as a single user message, and returns the model's reply text. Keep it server-side; do not hardcode the key.",
        "solution": "async function suggestEdit(prompt) {\n  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {\n    method: 'POST',\n    headers: {\n      'Content-Type': 'application/json',\n      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,\n    },\n    body: JSON.stringify({\n      model: 'llama-3.3-70b-versatile',\n      messages: [{ role: 'user', content: prompt }],\n    }),\n  });\n  const data = await res.json();\n  return data.choices[0].message.content;\n}",
        "checklist": [
            "Why must the LLM call live in a server route and not a client component?",
            "Why wrap a JSON.parse of model output in a try/catch?",
            "Trace the chain: what wakes this call, and what supplies the API key?",
        ],
    },
    {
        "id": "web-self-iterating-site",
        "track": "webdev",
        "title": "Self-Iterating Site",
        "subtitle": "the automatic website, end to end",
        "level": 10,
        "parents": ["web-vercel-cron", "web-llm-in-app", "web-deploy-vercel"],
        "minutes": 50,
        "explain": "This is the capstone: the actual self-iterating portfolio, assembled from every node below it. Nothing new to learn, just the loop wired together.\n\nThe five stages, in order: (1) a Vercel CRON fires on schedule and hits a guarded route. (2) The route gathers SIGNAL, real data about how the site is doing (visitor analytics, which sections got attention). (3) It builds a prompt from that signal and asks the LLM for ONE concrete, small improvement. (4) It applies the change (commit a content/style tweak, or write to a store the site reads from). (5) That triggers a Vercel DEPLOY, and crucially a PREVIEW deploy, not production, so a human can look before it goes live.\n\nThe word 'self-learning' just means stage 2 feeds real outcomes back into stage 3: the site's own traffic shapes what it asks for next. Which is also why, with little traffic, the runs come back with nothing useful to change. That is the system working as designed on a quiet site, not a bug, so do not chase empty iteration runs.\n\nIf you can describe these five stages and say which earlier node powers each, you understand the whole machine.",
        "example": "// app/api/iterate/route.ts -- the loop, guard already passed\nexport async function runIteration() {\n  const signal = await readAnalytics();          // 2. gather signal\n  const idea = await suggestEdit(                 // 3. ask the model\n    `Visitors did: ${signal}. Suggest ONE small improvement as JSON.`\n  );\n  const change = safeParse(idea);                // untrusted -> parse carefully\n  if (!change) return { skipped: 'empty or unusable' };\n  await applyChange(change);                      // 4. write the tweak\n  await triggerPreviewDeploy();                    // 5. PREVIEW, not prod\n  return { proposed: change.summary };\n}\n// stage 1 (the cron) lives in vercel.json and calls the route on schedule",
        "exercise": "Write the five stages of the loop as a single commented function outline (just the stage comments and the call you'd make at each, no real bodies). Make stage 5 explicitly a PREVIEW deploy, and have the function bail early if the model returns nothing usable.",
        "solution": "async function iterateOnce() {\n  // 1. cron triggers this route (configured in vercel.json)\n  const signal = await readAnalytics();        // 2. gather real signal\n  const idea = await suggestEdit(signal);      // 3. ask the LLM\n  const change = safeParse(idea);\n  if (!change) return;                         // bail on empty/unusable\n  await applyChange(change);                   // 4. apply the tweak\n  await triggerPreviewDeploy();                // 5. PREVIEW deploy only\n}",
        "checklist": [
            "Name the five stages of the loop in order.",
            "What does 'self-learning' actually refer to here (which stage feeds which)?",
            "Why are empty iteration runs expected on a low-traffic site rather than a bug?",
        ],
        "loophole": "The cron deploys a PREVIEW, never production. The robot proposes; a human runs `vercel promote` to ship. It is the cheapest insurance against the model pushing something broken to your live site, and it means a boring or empty iteration costs you nothing. Automate the labour, keep the gate. The lesson generalises: let automation do the work, but never let it be the last signature.",
    },
]

# ---------------------------------------------------------------------------
# PATCHES: loophole field notes onto existing nodes (grounded in the real
# Exun builds, per Projects/exun-*/overview.md and exun-ctc/plan.md).
# ---------------------------------------------------------------------------

PATCHES = {
    "web-mongodb-mongoose": "The Exun spec wanted a database. It never said WHERE it had to live. So instead of an Atlas account, a connection string, and a grader who has to set env vars, I used `mongodb-memory-server`: a real MongoDB that boots inside the Node process and wipes on restart. `npm install && npm start` just works with zero config, and the Mongoose code is identical either way. Reads like a full database setup; is actually zero infrastructure. The habit worth stealing: read the spec for what it does NOT demand, and ship the smallest thing that satisfies the literal requirement.",
    "web-react-native": "The 'copt.' app task is where this paid off. It never required a routing library, so there isn't one: screens swap with a single `useState` that picks which component to render. It explicitly ALLOWED login and register to be empty stub pages, so they stayed empty. Fewer dependencies, less code, and it still demos the full flow end to end. When the rules hand you an allowance (stubs are fine, no router required), take it, do not gold-plate past the spec.",
    "ml-image-preprocessing": "The butterfly task said use a MINIMUM of 15 species. So I used EXACTLY 15, and not a random 15: the 15 species with the MOST labelled images. More images per class is an easier, higher-accuracy model, and nothing in the spec said the choice had to be random or representative. Choosing your own inputs to favour the metric is allowed unless the rules forbid it. Just be ready to say WHY in the interview (max data per class), because a defensible reason is what separates a smart choice from a fluke.",
    "ml-train-test-split": "The dataset's official 'test' folder was unlabelled (a competition leftover), so it was useless for measuring accuracy. Rather than fight that, I ignored it and cut my OWN 80/10/10 stratified split out of the labelled training data. The deliverable needs a number you can stand behind; if the provided data can't give you one, make a clean split that can. Stratified so every class keeps its proportion in each split.",
    "cp-timed-practice": "The assignment EXPLICITLY allows reading editorials, so the honest way to use that: attempt alone for 30 minutes, read the editorial, then CLOSE it and re-type the solution from memory, and write one line on the core idea ('hash map of seen values', 'monotonic stack'). Shortlisters can smell pasted code that the writer can't explain, so the UNDERSTANDING is the real deliverable, not the characters. Time tactic for the AtCoder batches: do every contest's A problem first (under 5 minutes each), then circle back for the B's, so one slow B never eats the whole evening.",
}


# ---------------------------------------------------------------------------

def load_nodes(path):
    if not os.path.isfile(path):
        sys.exit(f"data file not found: {path}")
    try:
        with open(path, encoding="utf-8") as f:
            nodes = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        sys.exit(f"could not read {path}: {e}")
    if not isinstance(nodes, list):
        sys.exit(f"{path}: expected a JSON array")
    return nodes


def atomic_write(path, nodes):
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(nodes, f, indent=2, ensure_ascii=True)
            f.write("\n")
        os.replace(tmp, path)
    except OSError as e:
        if os.path.exists(tmp):
            os.remove(tmp)
        sys.exit(f"could not write {path}: {e}")


def main():
    if not os.path.isdir(DATA):
        sys.exit(f"data directory not found: {DATA}")

    # validate NEW node schema: keys present, no strays, and correct types
    # (these objects are written straight into the data files the app imports)
    for n in NEW:
        missing = REQUIRED_KEYS - n.keys()
        extra = n.keys() - REQUIRED_KEYS - OPTIONAL_KEYS
        if missing:
            sys.exit(f"node {n.get('id')} missing keys: {missing}")
        if extra:
            sys.exit(f"node {n.get('id')} has unknown keys: {extra}")
        nid = n.get("id")
        for key in ("id", "track", "title", "subtitle", "explain",
                    "example", "exercise", "solution"):
            if not isinstance(n[key], str) or not n[key].strip():
                sys.exit(f"node {nid}: {key} must be a non-empty string")
        for key in ("level", "minutes"):
            if not isinstance(n[key], int) or isinstance(n[key], bool):
                sys.exit(f"node {nid}: {key} must be an int")
        if not isinstance(n["parents"], list) or not all(
            isinstance(p, str) for p in n["parents"]
        ):
            sys.exit(f"node {nid}: parents must be a list of strings")
        if not n["parents"]:
            sys.exit(f"node {nid}: parents must not be empty (use ['root'])")
        if not isinstance(n["checklist"], list) or not all(
            isinstance(c, str) for c in n["checklist"]
        ):
            sys.exit(f"node {nid}: checklist must be a list of strings")
        if "loophole" in n and (
            not isinstance(n["loophole"], str) or not n["loophole"].strip()
        ):
            sys.exit(f"node {nid}: loophole must be a non-empty string")

    # patch text must be non-empty strings too
    for pid, text in PATCHES.items():
        if not isinstance(text, str) or not text.strip():
            sys.exit(f"PATCH {pid}: loophole text must be a non-empty string")

    # load everything
    existing = {t: load_nodes(os.path.join(DATA, f)) for t, f in FILES.items()}
    all_nodes = [n for nodes in existing.values() for n in nodes]
    by_id = {n["id"]: n for n in all_nodes}

    # NEW ids must be unique and unused (or identical, for a safe re-run)
    new_ids = [n["id"] for n in NEW]
    if len(new_ids) != len(set(new_ids)):
        sys.exit("duplicate id within NEW")
    for n in NEW:
        prior = by_id.get(n["id"])
        if prior is not None and prior != n:
            sys.exit(f"id {n['id']} exists with different content")

    # every PATCH target must exist
    for pid in PATCHES:
        if pid not in by_id:
            sys.exit(f"PATCH target {pid} does not exist")

    # every NEW parent must resolve
    merged_ids = {"root"} | set(by_id) | set(new_ids)
    for n in NEW:
        for p in n["parents"]:
            if p not in merged_ids:
                sys.exit(f"node {n['id']} has unknown parent {p}")

    # acyclic over the full merged graph
    full = {n["id"]: n["parents"] for n in all_nodes + NEW}
    state = {}

    def visit(nid):
        if nid == "root" or nid not in full:
            return
        if state.get(nid) == 1:
            return
        if state.get(nid) == 0:
            sys.exit(f"cycle at {nid}")
        state[nid] = 0
        for p in full[nid]:
            visit(p)
        state[nid] = 1

    for nid in full:
        visit(nid)

    # apply: append NEW to its track, patch loopholes in place
    new_by_track = {}
    for n in NEW:
        new_by_track.setdefault(n["track"], []).append(n)

    for track, fname in FILES.items():
        path = os.path.join(DATA, fname)
        nodes = existing[track]
        have = {n["id"] for n in nodes}
        changed = False

        # patches
        patched = 0
        for node in nodes:
            if node["id"] in PATCHES and node.get("loophole") != PATCHES[node["id"]]:
                node["loophole"] = PATCHES[node["id"]]
                patched += 1
                changed = True

        # appends
        appended = [n for n in new_by_track.get(track, []) if n["id"] not in have]
        if appended:
            nodes.extend(appended)
            changed = True

        if changed:
            atomic_write(path, nodes)
            print(f"{fname}: +{len(appended)} nodes, {patched} loopholes -> {len(nodes)} total")
        else:
            print(f"{fname}: already up to date")

    print("OK: DAG validated, no cycles, all parents and patch targets resolve")


if __name__ == "__main__":
    main()
