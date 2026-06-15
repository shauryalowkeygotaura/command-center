# Close the one real ML interview gap: the data->model handoff (tensors,
# per-channel normalization with train-only stats, DataLoader batching) is in
# the CNN notebook but had no node. Adds ml-tensors-normalize as an essential
# node (carries an interview note) parented on ml-image-preprocessing.
# Validates the merged DAG, atomic write, idempotent.

import json
import os
import sys

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
TARGET = os.path.join(DATA, "skilltree-ml.json")

REQUIRED = {"id", "track", "title", "subtitle", "level", "parents",
            "minutes", "explain", "example", "exercise", "solution", "checklist"}
OPTIONAL = {"loophole", "group", "interview"}
EM_DASHES = ("—", "–")

NODE = {
    "id": "ml-tensors-normalize",
    "track": "ml",
    "title": "Tensors, Normalize & Batches",
    "subtitle": "arrays to model-ready",
    "level": 5,
    "parents": ["ml-image-preprocessing"],
    "minutes": 25,
    "explain": "After preprocessing you have images as plain numpy arrays, but a CNN wants three more things done first.\n\nOne: the array becomes a TENSOR (PyTorch's array type) and the axes flip from H x W x C (height, width, colour) to C x H x W, because PyTorch convolutions expect channels first. That is what permute does.\n\nTwo: the pixel values get NORMALIZED, per channel, by subtracting the mean and dividing by the standard deviation, so every input sits roughly centred at 0 with spread 1. This makes training stable and faster because the optimiser is not fighting wildly different scales. The catch that matters: you compute that mean and std on the TRAINING set only, then reuse the same numbers on val and test. Same reason you split before augmenting: using test stats would leak test information into training.\n\nThree: the data is wrapped in a DataLoader, which feeds the model in small BATCHES (you used 64) and shuffles the training set each epoch so it cannot memorise the order.\n\nSo the pipeline is: numpy array, to float tensor, channels-first, normalize with train stats, batch with a DataLoader.",
    "example": "import torch\nfrom torch.utils.data import DataLoader\n\n# one image: numpy (H, W, C) uint8 -> model-ready tensor\nx = torch.from_numpy(img).float() / 255.0     # scale to 0..1\nx = x.permute(2, 0, 1)                         # HWC -> CHW (channels first)\n\n# per-channel stats from the TRAIN set only, then reused on val/test\nmean = train_imgs.mean(dim=(0, 2, 3))\nstd = train_imgs.std(dim=(0, 2, 3))\nx = (x - mean[:, None, None]) / std[:, None, None]\n\n# feed the model in shuffled batches of 64\nloader = DataLoader(train_ds, batch_size=64, shuffle=True)",
    "exercise": "Answer in a sentence each: (1) why flip H x W x C to C x H x W, (2) why normalize the inputs at all, (3) why compute the mean and std on the train set only, (4) what a DataLoader with batch_size=64, shuffle=True actually does.",
    "solution": "1. PyTorch conv layers expect channels-first (C, H, W), so the array is permuted to match.\n2. Normalizing centres each channel near 0 with unit spread, so the optimiser trains stably and faster instead of fighting different value scales.\n3. Train-only stats keep val/test information out of training; reusing test stats is data leakage, the same trap as splitting after augmenting.\n4. It serves the data in shuffled batches of 64 per step, so the model updates on small chunks and never learns the order of the data.",
    "checklist": [
        "Which axis order does a PyTorch CNN expect, and what does permute do?",
        "Why must the normalization mean and std come from the training set only?",
        "What does batch_size do to training, and why shuffle each epoch?",
    ],
    "interview": "Examiner tests: how raw images become model input, and whether you understand normalization and batching. Be ready to explain that I convert each image to a C x H x W float tensor (channels-first for PyTorch), normalize per channel by subtracting the train mean and dividing by the train std, then feed it through a DataLoader in batches of 64, shuffled each epoch. The nuance only I would know: the mean and std are computed on the TRAINING split only and reused on val and test, the same no-leakage rule as splitting before augmenting; using test stats would quietly leak. If pushed on why normalize at all: it centres the inputs so the optimiser is not fighting wildly different scales, which is why training is stable and converges faster.",
}


def main():
    missing = REQUIRED - NODE.keys()
    extra = NODE.keys() - REQUIRED - OPTIONAL
    if missing:
        sys.exit(f"missing keys: {missing}")
    if extra:
        sys.exit(f"unknown keys: {extra}")
    # type checks (these get written into the data the app imports)
    for k in ("id", "track", "title", "subtitle", "explain", "example",
              "exercise", "solution", "interview"):
        if k not in NODE:
            continue  # interview is optional
        if not isinstance(NODE[k], str) or not NODE[k].strip():
            sys.exit(f"{k}: must be a non-empty string")
    for k in ("level", "minutes"):
        if not isinstance(NODE[k], int) or isinstance(NODE[k], bool):
            sys.exit(f"{k}: must be an int")
    if not isinstance(NODE["parents"], list) or not NODE["parents"] or not all(
        isinstance(p, str) for p in NODE["parents"]
    ):
        sys.exit("parents: must be a non-empty list of strings")
    if not isinstance(NODE["checklist"], list) or not all(
        isinstance(c, str) for c in NODE["checklist"]
    ):
        sys.exit("checklist: must be a list of strings")
    for k in ("explain", "example", "exercise", "solution", "interview"):
        if any(d in NODE[k] for d in EM_DASHES) or any(ord(c) > 127 for c in NODE[k]):
            sys.exit(f"{k}: non-ASCII or dash char")

    if not os.path.isfile(TARGET):
        sys.exit(f"missing: {TARGET}")
    try:
        with open(TARGET, encoding="utf-8") as f:
            nodes = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        sys.exit(f"could not read {TARGET}: {e}")
    if not isinstance(nodes, list):
        sys.exit(f"{TARGET}: expected a JSON array")

    by_id = {n["id"]: n for n in nodes}
    if NODE["id"] in by_id:
        if by_id[NODE["id"]] == NODE:
            print(f"{NODE['id']}: already present, no change")
            return
        sys.exit(f"{NODE['id']} exists with different content")
    for p in NODE["parents"]:
        if p not in by_id and p != "root":
            sys.exit(f"unknown parent {p}")

    nodes.append(NODE)
    tmp = TARGET + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(nodes, f, indent=2, ensure_ascii=True)
            f.write("\n")
        os.replace(tmp, TARGET)
    except OSError as e:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass
        sys.exit(f"could not write: {e}")
    print(f"added {NODE['id']} -> {len(nodes)} ml nodes")


if __name__ == "__main__":
    main()
