# Enrich the capstone node of each track with a full "authorship interview"
# brief in its `interview` field: a spoken walkthrough, terminology, plain
# "what does this line do" answers, and a hardest-part answer. The existing
# grounded note is kept at the end. Per-concept nodes are left as-is.
#
# markdown-lite aware: label paragraphs are separated from "- " list blocks by
# a blank line so the panel renders real bullet lists. ASCII only, no em dashes.
# Idempotent (skips if already enriched) + atomic.

import json
import os
import sys

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
MARKER = "**WALK ME THROUGH IT"

TARGETS = {
    "skilltree-webdev.json": (
        "web-automatic",
        """**WALK ME THROUGH IT (say this):** "I built AUTOMATIC, a fake startup site, then grew it into a full app. Task 2 was three pages in plain HTML, CSS and JavaScript: a home page, a contact form, and a waitlist form. Task 3 added a fourth page that fetches live data from an API and filters it. For Assignment 2 I put it all behind one Express server: Node serves the same pages and a /api with full CRUD for messages plus register, login and logout. Data lives in MongoDB through Mongoose, passwords are hashed, and login is held by a session cookie. The bonus is a websocket so a message edit shows up live in every open tab. It is deployed on Vercel, and I keep two branches, master for REST and ws for the websocket version."

**TERMS, use the right word:**

- HTML is structure, CSS is looks, JavaScript is behaviour.
- DOM is the live tree of the page that JavaScript edits.
- API is a URL you ask for data; it replies in JSON.
- endpoint or route is one URL plus method the server answers, e.g. POST /api/message.
- HTTP method: GET reads, POST creates, PUT updates, DELETE removes.
- status code is the 3-digit result: 200 ok, 201 created, 401 not logged in, 403 not yours, 404 not found, 409 already exists.
- REST is using those methods and URLs to do CRUD (create, read, update, delete).
- middleware is a function that runs on every request before the route, e.g. parse JSON, check the session.
- Express is the Node library that defines the server and its routes.
- MongoDB is the database; Mongoose is the layer that gives it schemas and models (an ODM).
- session cookie is a small token in the browser that proves you are logged in.
- hashing is one-way scrambling of the password so the database never stores it in plain text.
- websocket is a two-way always-open connection so the server can push, unlike normal request and response.

**IF THEY POINT AT CODE, say:**

- `app.use(express.json())` parses the JSON request body so I can read req.body.
- `app.use(session(...))` attaches a logged-in session to each request via a cookie.
- `bcrypt.hash(password, 10)` hashes the password (10 is the work factor) before saving.
- `Message.find({ user: req.session.userId })` gets only THIS user's messages from Mongo.
- `if (contactBox) { ... }` only runs that block on the page that has the element, so one shared script.js never crashes on the others.
- `el.textContent = data` inserts plain text, never innerHTML, so a malicious string cannot run (that attack is XSS).
- `res.status(201).json(...)` replies "created" with the new record as JSON.

**HARDEST / WOULD CHANGE:** Hardest was the websocket bonus, making the upgrade handshake reuse the session middleware so an anonymous socket gets 401 just like the REST routes. If I redid it I would add input validation on every endpoint and use a real hosted database instead of the in-memory fallback.

**ALSO BE READY TO RECITE:** """,
    ),
    "skilltree-ml.json": (
        "ml-butterfly-capstone",
        """**WALK ME THROUGH IT (say this):** "There were two weeks. Week 1 was linear regression predicting medical insurance cost from age, BMI, smoking and so on; I one-hot encoded the categories, split the data, and the biggest driver by far was smoking. Week 2 was the big one: classifying butterfly species from photos with a CNN I built from scratch. I took the 15 species with the most images, made my own 80/10/10 stratified split because the provided test set had no labels, and I split BEFORE augmenting so no augmented copy of a training image leaks into validation. I augmented only the training set about 5x with flips, rotations, noise and blur, but avoided anything that changes colour because colour is how you tell the species apart. The network is three convolution blocks then a classifier head, with dropout against overfitting, trained with Adam and cross-entropy for 15 epochs on CPU; it hit about 83% test accuracy versus 7% for random guessing."

**TERMS, use the right word:**

- model is a function that learns the mapping from inputs to an answer.
- feature is an input column; label or target is the answer you predict.
- regression predicts a number (cost); classification predicts a category (species).
- one-hot encoding turns a category like sex into 0/1 columns so the maths can use it.
- train, validation, test split: data to learn on, to tune on, to judge on, kept separate.
- stratified means each split keeps the same class proportions.
- data leakage is test information sneaking into training; I avoid it by splitting before augmenting.
- augmentation is making more training images by flipping, rotating and noising the originals.
- overfitting is memorising the training set; dropout and augmentation fight it.
- epoch is one full pass over the training data; a batch is a small chunk processed at once.
- loss is how wrong the model is: cross-entropy for classification, MSE for regression.
- optimizer (Adam) is the rule that nudges weights to lower the loss; learning rate is the step size (1e-3).
- CNN is a network for images: convolution finds patterns, pooling shrinks, ReLU adds non-linearity, softmax turns scores into probabilities.
- accuracy is the fraction correct; baseline is the random guess (1 in 15 is 6.7%).

**IF THEY POINT AT CODE, say:**

- `train_test_split(..., stratify=y)` splits while keeping the class balance.
- `cv2.resize(img, (96, 96))` shrinks images to 96x96 for CPU speed (raw is 224).
- `nn.Conv2d` / `nn.MaxPool2d` are the convolution and pooling layers of a block.
- `nn.Dropout(0.5)` randomly drops half the activations during training to reduce overfitting.
- `criterion = nn.CrossEntropyLoss()` is the loss for multi-class classification.
- `optimizer.zero_grad(); loss.backward(); optimizer.step()` clears old gradients, computes new ones, updates the weights (the per-batch core).
- `model.eval()` with `torch.no_grad()` switches off dropout and stops tracking gradients when scoring.
- the best-val checkpoint means I keep the weights from the epoch with the highest validation accuracy (epoch 12), not the last epoch.

**HARDEST / WOULD CHANGE:** Hardest was getting decent accuracy on a CPU with few images per class; the answer was heavy train-only augmentation plus a small from-scratch CNN. If I redid it I would try transfer learning (a pretrained ResNet) for higher accuracy, train more epochs on a GPU, and target the two weak classes (Copper Tail 0.50, Iphiclus Sister 0.60).

**ALSO BE READY TO RECITE:** """,
    ),
    "skilltree-cp.json": (
        "cp-timed-practice",
        """**WALK ME THROUGH IT (say this):** "I drilled four patterns on NeetCode, then practised AtCoder ABC A and B problems under a clock. The four patterns are hashing (a dict or set for O(1) 'have I seen this'), two pointers (move in from both ends), stack (last-in-first-out matching, and a monotonic stack for next-greater), and sliding window (grow right, shrink left, track the window). For every problem I attempted it myself first, read the editorial only if stuck, then re-coded it from memory and wrote one line on the idea, so I can explain any solution rather than having pasted it."

**TERMS, use the right word:**

- time complexity (Big O) is how runtime grows with input size: O(n) one pass, O(n^2) nested loops, O(log n) halving.
- hash map or dict maps key to value in O(1); a set checks membership in O(1).
- two pointers means two indices moving toward each other instead of a nested loop.
- stack is last-in-first-out; a monotonic stack stays ordered to answer next-greater.
- sliding window is a moving sub-range you grow and shrink.
- brute force is the obvious slow way; the pattern is the fast way.

**IF THEY ASK 'EXPLAIN THIS SOLUTION', say the shape:**

- Two Sum: a dict of value to index; for each number check if target minus it was already seen BEFORE inserting, so O(n) not O(n^2).
- Valid Parentheses: push opening brackets on a stack, pop and match on closing ones, valid only if the stack ends empty.
- Daily Temperatures: a stack of INDICES; pop while the current day is warmer to fill in the answer.
- Best Time to Buy/Sell: track the lowest price so far and the best profit, in one pass.
- Longest Substring: a sliding window with a set; move the left edge forward on a repeat, do not reset it.

**HARDEST / WOULD CHANGE:** Hardest under the clock was reading the B statement fast, not the easy A problems; the fix was doing every contest's A first then the B's. If I redid prep I would run more full timed contests for speed and drill binary-search-on-the-answer.

**ALSO BE READY TO RECITE:** """,
    ),
}

EM_DASHES = ("—", "–")


def main():
    staged = []
    for fname, (nid, prepend) in TARGETS.items():
        if any(ch in prepend for ch in EM_DASHES):
            sys.exit(f"{nid}: prepend text contains a dash char")
        if any(ord(ch) > 127 for ch in prepend):
            sys.exit(f"{nid}: prepend text has non-ASCII chars")
        path = os.path.join(DATA, fname)
        if not os.path.isfile(path):
            sys.exit(f"missing: {path}")
        with open(path, encoding="utf-8") as f:
            nodes = json.load(f)
        node = next((n for n in nodes if n.get("id") == nid), None)
        if node is None:
            sys.exit(f"{fname}: node {nid} not found")
        staged.append((path, nodes, node, prepend))

    changed = 0
    for path, nodes, node, prepend in staged:
        existing = node.get("interview", "")
        if existing.startswith(MARKER):
            print(f"{node['id']}: already enriched, skipping")
            continue
        node["interview"] = prepend + existing
        tmp = path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(nodes, f, indent=2, ensure_ascii=True)
                f.write("\n")
            os.replace(tmp, path)
        except OSError as e:
            try:
                if os.path.exists(tmp):
                    os.remove(tmp)
            except OSError:
                pass
            sys.exit(f"could not write {path}: {e}")
        print(f"{node['id']}: enriched ({len(node['interview'])} chars)")
        changed += 1

    print(f"OK: {changed} capstone interview notes enriched")


if __name__ == "__main__":
    main()
