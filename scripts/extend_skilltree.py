# One-shot: append the advanced tier to each track's curriculum JSON.
# Extends the three dead-ending leaves into tracks that match the real
# Exun work: CP algorithms (binary search -> DP), the ML butterfly CNN
# capstone, and React / React Native (the "copt." appdev project).
#
# Safe to re-run: nodes already present (by id) are skipped, never duplicated.
# Validates the whole DAG (unique ids, every parent exists, acyclic, full
# schema) BEFORE writing anything back. ASCII-only, no em dashes, to match
# the house style of the existing files.

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

# ----------------------------------------------------------------------------
# NEW NODES
# ----------------------------------------------------------------------------

NEW = [
    # ===================== CP: algorithms tier ==========================
    {
        "id": "cp-binary-search",
        "track": "cp",
        "title": "Binary Search",
        "subtitle": "halve the search space",
        "level": 6,
        "parents": ["cp-timed-practice"],
        "minutes": 30,
        "explain": "Linear scan is O(n): you look at every element. If the data is SORTED, you can do better. Binary search keeps two pointers, lo and hi, looks at the middle, and throws away half the range every step. n elements take about log2(n) steps: a million elements in 20 looks, a billion in 30.\n\nThe loop invariant is the whole trick: the answer, if it exists, is always inside [lo, hi]. While lo <= hi, look at mid = (lo + hi) // 2. If nums[mid] == target you are done. If nums[mid] < target the answer is to the right, so lo = mid + 1. If it is bigger, hi = mid - 1. The two `+1 / -1` are not decoration: they shrink the range so the loop must end.\n\nThe pattern that wins contests is \"binary search on the answer\". When a problem asks for the smallest / largest value that still works, and \"works\" is monotonic (once it works it keeps working), you binary-search over the answer itself instead of an array. That is one of the four patterns you are drilling for the Exun shortlist.\n\nClassic infinite loop: writing `lo = mid` instead of `lo = mid + 1`. If mid never moves past lo, the range stops shrinking and the loop hangs. Always step past mid.",
        "example": "# search a sorted list, return index or -1\ndef bsearch(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            lo = mid + 1   # answer is to the right\n        else:\n            hi = mid - 1   # answer is to the left\n    return -1",
        "exercise": "From memory, write bsearch(nums, target) on an ascending list, returning the index or -1. It must pass: bsearch([1, 3, 5, 7, 9], 7) == 3, bsearch([1, 3, 5, 7, 9], 4) == -1, bsearch([2], 2) == 0, bsearch([], 5) == -1. Use lo <= hi and remember the +1 / -1.",
        "solution": "def bsearch(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1",
        "checklist": [
            "Why does the range have to shrink every iteration, and which line guarantees it?",
            "How many steps for a billion sorted elements, roughly, and why log2?",
            "What does 'binary search on the answer' need to be true about the problem (the monotonic property)?",
        ],
    },
    {
        "id": "cp-prefix-sums",
        "track": "cp",
        "title": "Prefix Sums",
        "subtitle": "range sums in O(1)",
        "level": 6,
        "parents": ["cp-timed-practice"],
        "minutes": 25,
        "explain": "A contest gives you an array and then asks for the sum between index l and r, a hundred thousand times. Summing the slice each time is O(n) per query, so O(n*q) total, and you time out. Prefix sums turn each query into one subtraction, O(1).\n\nBuild one array once: pre[0] = 0, and pre[i] = pre[i-1] + nums[i-1]. So pre[i] is the sum of the FIRST i elements. Then the sum of nums[l..r] (inclusive) is just pre[r+1] - pre[l]. You added everything up to r+1 and subtracted everything before l, leaving exactly the window.\n\nWhy the extra leading zero and the r+1: the shifted-by-one indexing is what makes the boundary math clean and lets l = 0 work without a special case. Draw it once on paper with [2, 4, 1, 3] and the off-by-one stops being scary.\n\nThis is the same precompute-once-answer-many idea behind a lot of harder problems (2-D prefix sums for grids, difference arrays for range updates). Get the 1-D version into muscle memory first.",
        "example": "# precompute, then every range sum is one subtraction\ndef build_prefix(nums):\n    pre = [0] * (len(nums) + 1)\n    for i, x in enumerate(nums):\n        pre[i + 1] = pre[i] + x\n    return pre\n\npre = build_prefix([2, 4, 1, 3, 5])\n# sum of index 1..3 (4 + 1 + 3 = 8):\nprint(pre[4] - pre[1])   # 8",
        "exercise": "Write range_sum(nums, queries) where queries is a list of (l, r) inclusive pairs; return a list of the sums, using a prefix array (build it ONCE, not per query). It must pass: range_sum([2, 4, 1, 3, 5], [(0, 2), (1, 3), (4, 4)]) == [7, 8, 5].",
        "solution": "def range_sum(nums, queries):\n    pre = [0] * (len(nums) + 1)\n    for i, x in enumerate(nums):\n        pre[i + 1] = pre[i] + x\n    return [pre[r + 1] - pre[l] for (l, r) in queries]",
        "checklist": [
            "Why is pre one element longer than nums, and what does pre[0] = 0 buy you?",
            "Derive sum(l..r) = pre[r+1] - pre[l] in words.",
            "What was the time complexity before (per query and total) versus after?",
        ],
    },
    {
        "id": "cp-recursion-backtracking",
        "track": "cp",
        "title": "Recursion & Backtracking",
        "subtitle": "try, recurse, undo",
        "level": 6,
        "parents": ["cp-timed-practice"],
        "minutes": 35,
        "explain": "A recursive function solves a problem by calling itself on a smaller version. Two parts, always: the BASE CASE that stops (no smaller version left), and the RECURSIVE CASE that does one step and hands the rest to itself. Miss the base case and you blow the stack.\n\nBacktracking is recursion for \"generate all the ways\" problems: subsets, permutations, placing queens, sudoku. The shape is choose / explore / un-choose. You make a choice, recurse to build on it, then UNDO the choice before trying the next one, so the path is clean for the sibling branch. The undo is the part beginners forget, and then every branch leaks state into the next.\n\nThink of it as walking a tree of decisions. Going down = choose. Hitting a leaf = record a complete answer. Coming back up = un-choose. The same skeleton solves a whole family of problems once you see it.\n\nIt is also the honest way to understand DP later: DP is backtracking plus a memo so you stop re-solving the same subproblem. Learn the slow, correct recursion first; speed comes after.",
        "example": "# all subsets of a list, via choose / explore / un-choose\ndef subsets(nums):\n    out, path = [], []\n    def dfs(i):\n        if i == len(nums):\n            out.append(path[:])      # leaf: record a copy\n            return\n        path.append(nums[i])         # choose\n        dfs(i + 1)                   # explore with it\n        path.pop()                   # un-choose\n        dfs(i + 1)                   # explore without it\n    dfs(0)\n    return out\n# subsets([1, 2]) -> [[1, 2], [1], [2], []]",
        "exercise": "Write permutations(nums) returning every ordering, using backtracking (a used set or swap, then undo). It must pass: sorted(permutations([1, 2, 3])) has 6 lists and includes [1, 2, 3] and [3, 2, 1]. Remember to undo your choice before the next branch.",
        "solution": "def permutations(nums):\n    out, path, used = [], [], [False] * len(nums)\n    def dfs():\n        if len(path) == len(nums):\n            out.append(path[:])\n            return\n        for i in range(len(nums)):\n            if used[i]:\n                continue\n            used[i] = True\n            path.append(nums[i])   # choose\n            dfs()                  # explore\n            path.pop()             # un-choose\n            used[i] = False\n    dfs()\n    return out",
        "checklist": [
            "Name the two parts every recursion needs, and what happens if the base case is missing.",
            "In backtracking, why must you undo the choice before the next branch?",
            "Why append path[:] (a copy) at a leaf instead of path itself?",
        ],
    },
    {
        "id": "cp-graphs-bfs-dfs",
        "track": "cp",
        "title": "Graphs: BFS & DFS",
        "subtitle": "explore a grid or network",
        "level": 7,
        "parents": ["cp-recursion-backtracking"],
        "minutes": 40,
        "explain": "Once you can recurse, graphs open up. A graph is just nodes and edges, stored as an adjacency list: a dict mapping each node to its neighbours. A grid is a graph too, where each cell's neighbours are up / down / left / right.\n\nTwo ways to walk it, and one shared rule: keep a `visited` set so you never process a node twice (that is what stops infinite loops on cycles). DFS goes deep first, easiest as recursion or a stack. BFS goes level by level using a QUEUE (collections.deque), and that level-by-level order is special: on an unweighted graph, the first time BFS reaches a node, it reached it by the SHORTEST path. So DFS for \"can I reach / connected components\", BFS for \"fewest steps\".\n\nThe bread-and-butter problem is counting connected components, also seen as \"number of islands\": loop over every cell, and each time you find an unvisited land cell, run one flood-fill from it and count it as a new island. The flood-fill marks the whole island visited so you do not recount it.\n\nGotcha: mark a node visited when you ENQUEUE it in BFS, not when you pop it, or the same node gets added to the queue many times before you ever process it.",
        "example": "from collections import deque\n# shortest hops from start on an unweighted graph (adjacency dict)\ndef bfs_dist(graph, start):\n    dist = {start: 0}\n    q = deque([start])\n    while q:\n        node = q.popleft()\n        for nxt in graph[node]:\n            if nxt not in dist:          # first sighting == shortest\n                dist[nxt] = dist[node] + 1\n                q.append(nxt)\n    return dist",
        "exercise": "Write count_islands(grid), a list of lists of 0s and 1s; return how many groups of 1s are connected horizontally or vertically. Use BFS or DFS flood-fill with a visited set. It must pass: grid [[1,1,0],[0,1,0],[0,0,1]] -> 2.",
        "solution": "from collections import deque\ndef count_islands(grid):\n    if not grid:\n        return 0\n    R, C = len(grid), len(grid[0])\n    seen = set()\n    count = 0\n    for r in range(R):\n        for c in range(C):\n            if grid[r][c] == 1 and (r, c) not in seen:\n                count += 1\n                q = deque([(r, c)])\n                seen.add((r, c))\n                while q:\n                    y, x = q.popleft()\n                    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):\n                        ny, nx = y + dy, x + dx\n                        if 0 <= ny < R and 0 <= nx < C and \\\n                           grid[ny][nx] == 1 and (ny, nx) not in seen:\n                            seen.add((ny, nx))\n                            q.append((ny, nx))\n    return count",
        "checklist": [
            "Why does BFS find shortest paths on an unweighted graph but DFS does not?",
            "Why mark a node visited when you enqueue it rather than when you pop it?",
            "What is the role of the outer double loop in the islands problem versus the inner flood-fill?",
        ],
    },
    {
        "id": "cp-dp-intro",
        "track": "cp",
        "title": "DP: 1-D Tables",
        "subtitle": "remember subproblems",
        "level": 8,
        "parents": ["cp-recursion-backtracking", "cp-binary-search"],
        "minutes": 40,
        "explain": "Dynamic programming sounds scary and is not. It is recursion where subproblems OVERLAP, so instead of re-solving the same thing a thousand times you solve each subproblem once and write the answer in a table.\n\nClimbing stairs is the cleanest first example: to reach step n you came from step n-1 or step n-2, so ways(n) = ways(n-1) + ways(n-2). The naive recursion recomputes ways(3) over and over and is exponential. The fix is either memoize (cache results in a dict) or build a table bottom-up: dp[0] and dp[1] are the base cases, then fill dp[i] = dp[i-1] + dp[i-2] up to n. O(n) time, and only the last two values matter so you can even drop to O(1) space.\n\nThe recipe for any 1-D DP: (1) define dp[i] in one sentence as a quantity, (2) write the recurrence that builds dp[i] from smaller indices, (3) set the base cases, (4) decide the fill order so a cell's dependencies are ready before it. Coin change, house robber, longest increasing subsequence all fit this mould.\n\nThe mistake is starting to code before you can say in plain words what dp[i] MEANS. Define the meaning first; the recurrence falls out of the definition.",
        "example": "# climbing stairs: how many ways to reach step n (1 or 2 at a time)\ndef climb(n):\n    if n <= 2:\n        return n\n    a, b = 1, 2            # ways to reach step 1 and step 2\n    for _ in range(3, n + 1):\n        a, b = b, a + b    # dp[i] = dp[i-1] + dp[i-2]\n    return b\n# climb(5) -> 8",
        "exercise": "Write coin_change(coins, amount): the FEWEST coins that sum to amount, or -1 if impossible. Use a dp table where dp[a] = min coins for amount a, dp[0] = 0. It must pass: coin_change([1, 2, 5], 11) == 3, coin_change([2], 3) == -1, coin_change([1], 0) == 0.",
        "solution": "def coin_change(coins, amount):\n    INF = float('inf')\n    dp = [0] + [INF] * amount\n    for a in range(1, amount + 1):\n        for c in coins:\n            if c <= a and dp[a - c] + 1 < dp[a]:\n                dp[a] = dp[a - c] + 1\n    return dp[amount] if dp[amount] != INF else -1",
        "checklist": [
            "State in one sentence what dp[i] means in coin change before writing any code.",
            "Why is the naive stairs recursion exponential, and what exactly does the table remove?",
            "What decides the fill order of a DP table?",
        ],
    },

    # ===================== ML: capstone tier ============================
    {
        "id": "ml-dropout-batchnorm",
        "track": "ml",
        "title": "Dropout & BatchNorm",
        "subtitle": "fight overfitting inside the net",
        "level": 9,
        "parents": ["ml-overfitting-accuracy"],
        "minutes": 30,
        "explain": "You can see overfitting on the curves: training accuracy climbs while validation stalls or drops. Two layers you drop into the network itself push back.\n\nDropout randomly zeroes a fraction of activations DURING TRAINING (say 30 percent). The network can no longer lean on any single neuron, so it learns redundant, more general features. At inference time dropout turns off and nothing is zeroed. That train-versus-eval difference is exactly why `model.train()` and `model.eval()` exist and why forgetting to switch is a real bug.\n\nBatchNorm normalizes a layer's inputs across the batch (zero mean, unit variance, then a learned scale and shift). It smooths the loss surface, lets you train faster with a higher learning rate, and adds a little regularization for free. Like dropout it behaves differently in train and eval mode, because in eval it uses running statistics it gathered during training, not the current batch.\n\nThe headline: these are not magic accuracy buttons. They trade a bit of training fit for better generalization, which is the whole point when your butterfly dataset is small.",
        "example": "import torch.nn as nn\n# a small classifier head with both regularizers\nhead = nn.Sequential(\n    nn.Linear(512, 256),\n    nn.BatchNorm1d(256),   # normalize across the batch\n    nn.ReLU(),\n    nn.Dropout(0.3),       # zero 30% of activations in training\n    nn.Linear(256, 10),    # 10 butterfly classes\n)\n# remember: head.train() during training, head.eval() before testing",
        "exercise": "Given a plain head `nn.Sequential(nn.Linear(512, 128), nn.ReLU(), nn.Linear(128, 5))`, rewrite it to add BatchNorm1d after the first Linear and Dropout(0.4) after the ReLU. Then write the one line you must call before running validation so dropout/batchnorm switch to eval behaviour.",
        "solution": "import torch.nn as nn\nhead = nn.Sequential(\n    nn.Linear(512, 128),\n    nn.BatchNorm1d(128),\n    nn.ReLU(),\n    nn.Dropout(0.4),\n    nn.Linear(128, 5),\n)\n# before validating / testing:\nhead.eval()",
        "checklist": [
            "What does dropout do differently in train mode versus eval mode?",
            "Why does forgetting model.eval() at test time silently hurt your numbers?",
            "Name one thing batchnorm buys you besides a little regularization.",
        ],
    },
    {
        "id": "ml-transfer-learning",
        "track": "ml",
        "title": "Transfer Learning",
        "subtitle": "stand on a pretrained net",
        "level": 10,
        "parents": ["ml-dropout-batchnorm"],
        "minutes": 35,
        "explain": "Training a deep CNN from scratch needs a lot of images and a lot of compute. You have neither for a butterfly assignment. Transfer learning is the shortcut everyone actually uses: take a network already trained on ImageNet's millions of images, keep everything it learned about edges, textures and shapes, and only retrain the last layer for YOUR classes.\n\nThe early layers of a vision net learn generic features (edges, colour blobs, fur, wings) that transfer across almost any image task. The final fully-connected layer is the only part that is ImageNet-specific (1000 classes). So you FREEZE the backbone (set requires_grad = False so its weights do not update) and REPLACE the final layer with a fresh one sized to your class count. You now train only a few thousand weights instead of millions, on a handful of images, in minutes.\n\nFor resnet18 the final layer is `model.fc`; read its in_features and build a new nn.Linear from that to your number of classes. Later, if you have time and data, you can UNFREEZE the top blocks and fine-tune at a tiny learning rate for a few more points of accuracy.\n\nThis is the single highest-leverage move for the butterfly classifier: it is the difference between 40 percent from scratch and 90 percent in the same wall-clock time.",
        "example": "import torch.nn as nn\nfrom torchvision import models\n\nmodel = models.resnet18(weights='IMAGENET1K_V1')\nfor p in model.parameters():\n    p.requires_grad = False          # freeze the backbone\nn_features = model.fc.in_features    # 512 for resnet18\nmodel.fc = nn.Linear(n_features, 10) # fresh head, 10 classes, trainable\n# only model.fc's weights will update during training",
        "exercise": "You have 6 butterfly classes. Write the lines that load a pretrained resnet18, freeze every backbone parameter, and replace model.fc with a new Linear sized correctly. Read the in_features from the old fc instead of hardcoding 512.",
        "solution": "import torch.nn as nn\nfrom torchvision import models\n\nmodel = models.resnet18(weights='IMAGENET1K_V1')\nfor p in model.parameters():\n    p.requires_grad = False\nmodel.fc = nn.Linear(model.fc.in_features, 6)",
        "checklist": [
            "Why do early CNN layers transfer to a new task but the final layer does not?",
            "What does freezing (requires_grad = False) actually prevent during training?",
            "Why read fc.in_features instead of hardcoding the number?",
        ],
    },
    {
        "id": "ml-confusion-matrix",
        "track": "ml",
        "title": "Confusion Matrix",
        "subtitle": "which classes get mixed up",
        "level": 9,
        "parents": ["ml-overfitting-accuracy"],
        "minutes": 25,
        "explain": "Accuracy is one number and it lies on imbalanced data: a classifier that always says \"not butterfly\" scores 95 percent if only 5 percent of images are butterflies. To see what is really happening you need the confusion matrix.\n\nIt is a grid: rows are the TRUE class, columns are the PREDICTED class. The diagonal is correct predictions; everything off the diagonal is a specific mistake, and the position tells you which class got mistaken for which. Two visually similar butterfly species lighting up each other's cells is a concrete, fixable signal.\n\nFrom the matrix you read three per-class numbers. Precision for a class: of everything I PREDICTED as this class, what fraction was right (punishes false positives). Recall: of everything that TRULY is this class, what fraction did I catch (punishes false misses). F1 is their harmonic mean, one number when you need a single score per class. sklearn's classification_report prints all three for every class at once.\n\nFor the assignment this is what turns \"my accuracy is 88 percent\" into \"class 3 has 0.6 recall because it keeps getting called class 5\", which is an actual finding you can write up.",
        "example": "from sklearn.metrics import confusion_matrix, classification_report\n\ny_true = [0, 0, 1, 1, 2, 2]\ny_pred = [0, 0, 1, 2, 2, 2]\nprint(confusion_matrix(y_true, y_pred))\n# [[2 0 0]\n#  [0 1 1]\n#  [0 0 2]]   -> one class-1 sample was called class 2\nprint(classification_report(y_true, y_pred, digits=2))",
        "exercise": "By hand IN CODE (no sklearn), compute precision and recall for the positive class from these lists: y_true = [1,1,1,0,0], y_pred = [1,0,1,1,0]. Count TP, FP, FN yourself, then precision = TP/(TP+FP), recall = TP/(TP+FN). Print both.",
        "solution": "y_true = [1, 1, 1, 0, 0]\ny_pred = [1, 0, 1, 1, 0]\ntp = sum(t == 1 and p == 1 for t, p in zip(y_true, y_pred))\nfp = sum(t == 0 and p == 1 for t, p in zip(y_true, y_pred))\nfn = sum(t == 1 and p == 0 for t, p in zip(y_true, y_pred))\nprecision = tp / (tp + fp)   # 2 / 3\nrecall = tp / (tp + fn)      # 2 / 3\nprint(precision, recall)",
        "checklist": [
            "Give one example where 95 percent accuracy hides a useless model.",
            "State precision and recall in words, and which kind of error each one punishes.",
            "On a confusion matrix, what does an off-diagonal cell at row i column j mean?",
        ],
    },
    {
        "id": "ml-save-load-model",
        "track": "ml",
        "title": "Save & Load Models",
        "subtitle": "state_dict, not the whole object",
        "level": 9,
        "parents": ["ml-overfitting-accuracy"],
        "minutes": 20,
        "explain": "You trained for ten minutes; you do not want to do it again every time you open the notebook. Saving a model in PyTorch has one right way and one fragile way.\n\nThe right way saves the STATE DICT: a plain dictionary of the learned tensors (weights and biases), with `torch.save(model.state_dict(), 'model.pt')`. To restore, you rebuild the same architecture in code, then load the numbers into it with `model.load_state_dict(torch.load('model.pt'))`. The fragile way pickles the whole model object; that file silently breaks when your class definition or library version moves, so it is not how anyone ships.\n\nTwo steps people forget. First, call `model.eval()` after loading and before predicting, so dropout and batchnorm switch to inference behaviour. Second, when loading on a machine with no GPU, pass `map_location='cpu'` or the load will error looking for CUDA.\n\nFor a longer training run you save a CHECKPOINT, a dict holding the model state, the optimizer state, and the epoch number, so you can resume mid-training and not just run inference. Same idea, just more keys.",
        "example": "import torch\n# save just the learned numbers\ntorch.save(model.state_dict(), 'butterfly.pt')\n\n# later, in fresh code: rebuild the SAME architecture first...\nmodel = build_model()                                  # your function\nmodel.load_state_dict(torch.load('butterfly.pt',\n                                 map_location='cpu'))\nmodel.eval()   # critical before inference",
        "exercise": "Write two functions: save_model(model, path) that stores only the state dict, and load_model(model, path) that loads the state dict into an already-built model, puts it in eval mode, and returns it. Assume CPU, so pass map_location='cpu'.",
        "solution": "import torch\n\ndef save_model(model, path):\n    torch.save(model.state_dict(), path)\n\ndef load_model(model, path):\n    model.load_state_dict(torch.load(path, map_location='cpu'))\n    model.eval()\n    return model",
        "checklist": [
            "Why save the state_dict instead of pickling the whole model object?",
            "What two things must you do after loading before you can trust a prediction?",
            "What extra keys go into a training checkpoint versus an inference-only save?",
        ],
    },
    {
        "id": "ml-butterfly-capstone",
        "track": "ml",
        "title": "Butterfly Classifier",
        "subtitle": "the whole pipeline, end to end",
        "level": 11,
        "parents": ["ml-transfer-learning", "ml-confusion-matrix", "ml-save-load-model"],
        "minutes": 60,
        "explain": "This is the node where every earlier one pays off: the actual Exun ML assignment-2 CNN. Nothing new to learn here, just the order things go in, which is the part that trips people up under a deadline.\n\nThe pipeline, top to bottom: (1) build DataLoaders for train and validation, with augmentation on the train set only and the SAME normalization on both. (2) Load a pretrained resnet18, freeze the backbone, swap the final layer for your class count (transfer learning). (3) Pick a loss, CrossEntropyLoss for multi-class, and an optimizer over only the trainable parameters. (4) The training loop: for each epoch, for each batch, do the five-step dance you already know - zero_grad, forward, loss, backward, step - then run validation in eval() with no_grad. (5) After training, build the confusion matrix on the validation set to see which species get confused. (6) Save the state_dict so you never retrain.\n\nThe one piece worth memorising is the train-one-epoch loop, because the five steps in the wrong order is the most common silent bug: forgetting zero_grad makes gradients accumulate across batches and your loss goes haywire.\n\nWrite this loop from memory once and the whole assignment is just wiring known parts together.",
        "example": "import torch\n# one training epoch: the five-step dance, per batch\ndef train_one_epoch(model, loader, loss_fn, optimizer, device):\n    model.train()\n    running = 0.0\n    for images, labels in loader:\n        images, labels = images.to(device), labels.to(device)\n        optimizer.zero_grad()           # 1. clear old gradients\n        outputs = model(images)         # 2. forward\n        loss = loss_fn(outputs, labels) # 3. measure\n        loss.backward()                 # 4. backprop\n        optimizer.step()                # 5. update weights\n        running += loss.item() * images.size(0)\n    return running / len(loader.dataset)",
        "exercise": "From memory, write the validation counterpart evaluate(model, loader, device) that returns accuracy. It must: set model.eval(), wrap the loop in torch.no_grad(), take argmax over outputs for predictions, count correct vs total, and return correct/total. No gradients, no optimizer.",
        "solution": "import torch\ndef evaluate(model, loader, device):\n    model.eval()\n    correct, total = 0, 0\n    with torch.no_grad():\n        for images, labels in loader:\n            images, labels = images.to(device), labels.to(device)\n            outputs = model(images)\n            preds = outputs.argmax(dim=1)\n            correct += (preds == labels).sum().item()\n            total += labels.size(0)\n    return correct / total",
        "checklist": [
            "List the five per-batch training steps in order, and what breaks if zero_grad is skipped.",
            "Why is validation wrapped in torch.no_grad() and model.eval()?",
            "Which earlier nodes supply the dataloaders, the model, and the final report in this pipeline?",
        ],
    },

    # ===================== WEBDEV: React / RN tier ======================
    {
        "id": "web-react-intro",
        "track": "webdev",
        "title": "React: Components & JSX",
        "subtitle": "UI as functions",
        "level": 5,
        "parents": ["web-forms-events", "web-fetch-api"],
        "minutes": 30,
        "explain": "Manually poking the DOM with querySelector and innerHTML works for a small page and turns into spaghetti for an app: the UI and the data drift apart and you spend your life keeping them in sync. React flips it. You write a function that takes data and RETURNS what the screen should look like, and React figures out the DOM changes for you.\n\nA component is just that function. It returns JSX, which looks like HTML living inside JavaScript: `return <h2>Hello {name}</h2>`. The curly braces drop back into real JS, so you interpolate variables, map over arrays, and use conditionals right in the markup. Components are PascalCase (Card, not card) so React can tell them apart from plain HTML tags.\n\nData flows ONE way: a parent passes values down to a child through props, the child's single argument object. Props are read-only; a child never reaches up and edits its parent's data. This one-way flow is the whole reason React apps stay predictable as they grow, and it is the mental model the rest of the track builds on.\n\nComing from the appdev project: this is the same React that React Native uses, so every hour here is an hour toward the app, not a detour.",
        "example": "// a component is a function returning JSX; props are its input\nfunction Card({ title, tag }) {\n  return (\n    <div className=\"card\">\n      <h3>{title}</h3>\n      <span>{tag}</span>\n    </div>\n  );\n}\n// used like a tag, props passed as attributes:\n// <Card title=\"copt.\" tag=\"appdev\" />",
        "exercise": "Write a React component Profile that takes props { name, role } and returns a div containing an h2 with the name and a p with the role. Then write the one line that renders it for name 'Shaurya' and role 'builder' (just the JSX usage, e.g. <Profile ... />).",
        "solution": "function Profile({ name, role }) {\n  return (\n    <div>\n      <h2>{name}</h2>\n      <p>{role}</p>\n    </div>\n  );\n}\n// usage:\n// <Profile name=\"Shaurya\" role=\"builder\" />",
        "checklist": [
            "What does a component function return, and what is JSX?",
            "Why must component names be capitalized?",
            "What does 'props are read-only, data flows one way' protect you from?",
        ],
    },
    {
        "id": "web-react-state",
        "track": "webdev",
        "title": "useState & useEffect",
        "subtitle": "memory and side effects",
        "level": 6,
        "parents": ["web-react-intro"],
        "minutes": 35,
        "explain": "Props come from the parent and never change from the inside. But a component often needs its OWN memory that changes over time: a counter, a typed input, fetched data. That is state, and you reach it with the useState hook.\n\n`const [count, setCount] = useState(0)` gives you the current value and a setter. The rule that catches everyone: never assign to the variable directly. You call the setter (`setCount(count + 1)`), and React re-runs your component function with the new value and updates the screen. Mutating the variable does nothing because React only re-renders when a setter tells it to.\n\nuseEffect is for SIDE EFFECTS: things outside rendering, like fetching from an API, setting a timer, or subscribing to something. It runs AFTER the render. Its second argument, the dependency array, controls when it re-runs: `[]` means once on mount, `[id]` means whenever id changes. Leave the array off entirely and it runs after every render, which is how people accidentally fetch in an infinite loop.\n\nHooks have two hard rules: only call them at the top level of a component (never inside an if or a loop), and only from React functions. Break those and the order React relies on falls apart.",
        "example": "import { useState, useEffect } from 'react';\nfunction Counter() {\n  const [count, setCount] = useState(0);   // state\n  useEffect(() => {\n    document.title = `count: ${count}`;     // side effect\n  }, [count]);                              // re-run when count changes\n  return (\n    <button onClick={() => setCount(count + 1)}>\n      clicked {count}\n    </button>\n  );\n}",
        "exercise": "Write a component Hits that holds a number in state starting at 0, shows it inside a button, and adds 1 each time the button is clicked. Use useState and update only through the setter (never reassign the variable).",
        "solution": "import { useState } from 'react';\nfunction Hits() {\n  const [hits, setHits] = useState(0);\n  return (\n    <button onClick={() => setHits(hits + 1)}>\n      {hits}\n    </button>\n  );\n}",
        "checklist": [
            "Why does reassigning the state variable directly not update the screen?",
            "What does the useEffect dependency array control, and what does [] versus no array mean?",
            "State the two rules of hooks (where you may call them).",
        ],
    },
    {
        "id": "web-react-native",
        "track": "webdev",
        "title": "React Native + Expo",
        "subtitle": "same React, native screens",
        "level": 7,
        "parents": ["web-react-state"],
        "minutes": 35,
        "explain": "React Native is the React you just learned, rendering to real iOS and Android views instead of a web page. Same components, same props, same useState and useEffect. What changes is the vocabulary of built-in elements and how you style them.\n\nThere is no div, p, or button. You use View (the container, like a div), Text (ALL text must sit inside a Text, you cannot put a bare string in a View), Pressable or TouchableOpacity (tappable), and Image. Styling is not CSS files; you pass a `style` object, usually made with StyleSheet.create, and the property names are camelCase (backgroundColor, not background-color). Layout is flexbox by default, and the default direction is column, not row, which surprises everyone coming from the web.\n\nExpo is the toolchain that makes this painless: `npx create-expo-app`, then `npx expo start`, scan the QR code with the Expo Go app, and your phone live-reloads as you save. No Xcode or Android Studio needed to start. This is exactly the stack your 'copt.' appdev project runs on, so this node is the bridge from the web track into that build.\n\nThe trap when crossing over: wrapping text directly in a View. `<View>hello</View>` crashes; it has to be `<View><Text>hello</Text></View>`.",
        "example": "import { View, Text, Pressable, StyleSheet } from 'react-native';\nimport { useState } from 'react';\n\nexport default function Screen() {\n  const [n, setN] = useState(0);\n  return (\n    <View style={styles.box}>\n      <Text style={styles.label}>tapped {n}</Text>\n      <Pressable onPress={() => setN(n + 1)}>\n        <Text>tap me</Text>\n      </Pressable>\n    </View>\n  );\n}\nconst styles = StyleSheet.create({\n  box: { flex: 1, justifyContent: 'center', alignItems: 'center' },\n  label: { fontSize: 20, fontWeight: 'bold' },\n});",
        "exercise": "Write a React Native screen component that shows a Text greeting and a Pressable that, when pressed, flips a boolean in state to toggle the greeting between 'hi' and 'bye'. Use View, Text, Pressable, and useState. Remember every string lives inside a Text.",
        "solution": "import { View, Text, Pressable } from 'react-native';\nimport { useState } from 'react';\n\nexport default function Greeting() {\n  const [hi, setHi] = useState(true);\n  return (\n    <View>\n      <Text>{hi ? 'hi' : 'bye'}</Text>\n      <Pressable onPress={() => setHi(!hi)}>\n        <Text>toggle</Text>\n      </Pressable>\n    </View>\n  );\n}",
        "checklist": [
            "Map div, p, and button to their React Native equivalents.",
            "Why does putting a bare string directly inside a View crash?",
            "How does styling and the default flex direction differ from web CSS?",
        ],
    },
    {
        "id": "web-expo-router",
        "track": "webdev",
        "title": "Expo Router",
        "subtitle": "file-based screens",
        "level": 8,
        "parents": ["web-react-native"],
        "minutes": 30,
        "explain": "One screen is a demo; an app has many and you move between them. Expo Router gives you navigation the same way Next.js gives the web routes: the FILE SYSTEM is the router. A file at app/index.tsx is the home route, app/settings.tsx is the /settings route, and a folder with nested files becomes nested routes. No central route config to keep in sync.\n\nYou move between screens with the Link component for declarative taps (`<Link href=\"/settings\">`), or imperatively with the useRouter hook when you need to navigate from code after, say, a successful login (`router.push('/home')`). Going back is `router.back()`.\n\nA special file, app/_layout.tsx, wraps every screen in that folder, which is where shared chrome lives: a tab bar, a header, a provider. Dynamic routes use brackets in the filename, app/butterfly/[id].tsx, and you read the id with useLocalSearchParams, the same pattern as passing a record id into a detail screen.\n\nIf you already understand Next.js file routing from the web side of this track, this is the same idea pointed at native screens, so it should click fast.",
        "example": "// app/index.tsx  -> the \"/\" screen\nimport { View, Text } from 'react-native';\nimport { Link } from 'expo-router';\n\nexport default function Home() {\n  return (\n    <View>\n      <Text>home</Text>\n      <Link href=\"/about\">go to about</Link>\n    </View>\n  );\n}\n// app/about.tsx automatically becomes the \"/about\" screen",
        "exercise": "Describe the two files you create to make a home screen and a 'profile' screen reachable at /profile, and write the Home component (app/index.tsx) with a Link that navigates to /profile. Just the index file's component is enough.",
        "solution": "// file 1: app/index.tsx   (the home / \"/\" route)\n// file 2: app/profile.tsx (auto-becomes the \"/profile\" route)\nimport { View, Text } from 'react-native';\nimport { Link } from 'expo-router';\n\nexport default function Home() {\n  return (\n    <View>\n      <Text>home</Text>\n      <Link href=\"/profile\">open profile</Link>\n    </View>\n  );\n}",
        "checklist": [
            "How does Expo Router decide what the routes are?",
            "When would you use useRouter().push() instead of a Link?",
            "What is app/_layout.tsx for, and how do you make a dynamic route like /butterfly/3?",
        ],
    },
    {
        "id": "web-ship-eas",
        "track": "webdev",
        "title": "Ship with EAS",
        "subtitle": "build and submit the app",
        "level": 9,
        "parents": ["web-expo-router", "web-deploy-vercel"],
        "minutes": 25,
        "explain": "A web app ends at a Vercel deploy. A phone app has one more step: it has to become an installable binary and, eventually, reach a store. EAS (Expo Application Services) is the cloud build service that does both without you owning a Mac or fighting native toolchains.\n\nThe config lives in app.json (or app.config.js): the app's name, slug, version, icon, splash screen, and bundle identifiers (a reverse-domain id like com.shaurya.copt for iOS, a package name for Android). Get these right once; they identify your app everywhere.\n\nThe commands are short. `eas build --platform android` (or ios) sends your project to Expo's servers, which compile a real .apk/.aab or .ipa and hand back a download link, no local Android Studio needed. `eas submit` then uploads that build to the Play Store or App Store. And because most changes are just JavaScript, `eas update` pushes an over-the-air update straight to installed apps, no new store build at all, which is the appdev equivalent of a fast Vercel redeploy.\n\nThe mental model: app.json is your manifest, build makes the binary, submit ships it, update patches the JS layer in place.",
        "example": "// app.json -- the manifest EAS reads\n{\n  \"expo\": {\n    \"name\": \"copt.\",\n    \"slug\": \"copt\",\n    \"version\": \"1.0.0\",\n    \"ios\": { \"bundleIdentifier\": \"com.shaurya.copt\" },\n    \"android\": { \"package\": \"com.shaurya.copt\" }\n  }\n}\n// then, in the terminal:\n//   eas build --platform android   -> cloud-built .aab + a link\n//   eas submit  --platform android -> uploads to Play Store\n//   eas update                     -> OTA JS patch to live installs",
        "exercise": "Write the minimal expo block of app.json for an app named 'copt.' at version 1.0.0 with an Android package com.shaurya.copt, then write the single command that produces an installable Android build in the cloud.",
        "solution": "// app.json\n{\n  \"expo\": {\n    \"name\": \"copt.\",\n    \"slug\": \"copt\",\n    \"version\": \"1.0.0\",\n    \"android\": { \"package\": \"com.shaurya.copt\" }\n  }\n}\n// command:\n//   eas build --platform android",
        "checklist": [
            "What lives in app.json and why do the bundle id / package matter?",
            "What does eas build give you that a Vercel deploy never has to produce?",
            "When can you use eas update (OTA) instead of a full rebuild and resubmit?",
        ],
    },
]


def load_nodes(path):
    """Load a track file, failing loudly if it is missing or malformed."""
    if not os.path.isfile(path):
        sys.exit(f"data file not found: {path}")
    try:
        with open(path, encoding="utf-8") as f:
            nodes = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        sys.exit(f"could not read {path}: {e}")
    if not isinstance(nodes, list):
        sys.exit(f"{path}: expected a JSON array of nodes")
    return nodes


def atomic_write(path, nodes):
    """Write via a temp file + replace so a crash can never leave a
    half-written curriculum file."""
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(nodes, f, indent=2, ensure_ascii=True)
            f.write("\n")
        os.replace(tmp, path)  # atomic on the same filesystem
    except OSError as e:
        if os.path.exists(tmp):
            os.remove(tmp)
        sys.exit(f"could not write {path}: {e}")


def main():
    if not os.path.isdir(DATA):
        sys.exit(f"data directory not found: {DATA}")

    by_track = {}
    for node in NEW:
        missing = REQUIRED_KEYS - node.keys()
        if missing:
            sys.exit(f"node {node.get('id')} missing keys: {missing}")
        by_track.setdefault(node["track"], []).append(node)

    # load all existing nodes first so cross-track parents validate
    existing = {}
    all_nodes = []
    for track, fname in FILES.items():
        nodes = load_nodes(os.path.join(DATA, fname))
        existing[track] = nodes
        all_nodes.extend(nodes)

    known_ids = {"root"} | {n["id"] for n in all_nodes}
    new_ids = {n["id"] for n in NEW}

    # unique among the new set
    if len(new_ids) != len(NEW):
        sys.exit("duplicate id within the new nodes")

    # a new id may collide with an existing one ONLY if it is byte-identical
    # (a safe re-run); a different node reusing an id is data corruption.
    by_id_existing = {n["id"]: n for n in all_nodes}
    for n in NEW:
        prior = by_id_existing.get(n["id"])
        if prior is not None and prior != n:
            sys.exit(f"id {n['id']} already exists with different content")

    merged_ids = known_ids | new_ids

    # 3. every parent must resolve
    for n in NEW:
        for p in n["parents"]:
            if p not in merged_ids:
                sys.exit(f"node {n['id']} has unknown parent {p}")

    # 4. acyclic over the full merged graph
    full = {n["id"]: n["parents"] for n in all_nodes + NEW}
    state = {}  # 0=visiting, 1=done

    def visit(nid):
        if nid == "root" or nid not in full:
            return
        if state.get(nid) == 1:
            return
        if state.get(nid) == 0:
            sys.exit(f"cycle detected at {nid}")
        state[nid] = 0
        for p in full[nid]:
            visit(p)
        state[nid] = 1

    for nid in full:
        visit(nid)

    # write back per track, skipping any new node already present (re-run safe)
    for track, fname in FILES.items():
        add = by_track.get(track, [])
        if not add:
            continue
        path = os.path.join(DATA, fname)
        nodes = existing[track]
        have = {n["id"] for n in nodes}
        appended = [n for n in add if n["id"] not in have]
        if not appended:
            print(f"{fname}: already up to date ({len(nodes)} nodes)")
            continue
        nodes.extend(appended)
        atomic_write(path, nodes)
        print(f"{fname}: +{len(appended)} -> {len(nodes)} nodes")

    print("OK: DAG validated, no cycles, all parents resolve")


if __name__ == "__main__":
    main()
