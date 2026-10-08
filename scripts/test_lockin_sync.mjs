// Unit tests for lib/lockinMerge.ts (LOCK IN gist sync merge logic).
// Run: node --experimental-strip-types --test scripts/test_lockin_sync.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyEntries,
  mergeDays,
  mergeEntries,
  parseDoc,
  pruneDoc,
  snapshotDay,
  toEntries,
} from "../lib/lockinMerge.ts";

const T1 = "2026-10-08T10:00:00.000Z";
const T2 = "2026-10-08T11:00:00.000Z";

test("toEntries skips private keys and stamps legacy ticks with their tick time", () => {
  const e = toEntries({ done: { a: T1, "priv:x:2026-10-08": T1 }, outcome: { b: "called, no answer" } });
  assert.deepEqual(Object.keys(e).sort(), ["a", "b"]);
  assert.equal(e.a.updatedAt, T1);
  assert.equal(e.b.updatedAt, "1970-01-01T00:00:00.000Z");
});

test("newer remote untick (tombstone) beats an older local tick", () => {
  const local = { a: { done: T1, outcome: null, updatedAt: T1 } };
  const remote = { a: { done: null, outcome: null, updatedAt: T2 } };
  const m = mergeEntries(local, remote);
  assert.equal(m.a.done, null);
  const st = applyEntries({ done: { a: T1 }, outcome: {} }, m);
  assert.equal(st.done.a, undefined);
});

test("older remote does not override a newer local edit; ties keep local", () => {
  const local = { a: { done: T2, outcome: "done", updatedAt: T2 }, b: { done: T1, outcome: null, updatedAt: T1 } };
  const remote = { a: { done: null, outcome: null, updatedAt: T1 }, b: { done: null, outcome: "x", updatedAt: T1 } };
  const m = mergeEntries(local, remote);
  assert.equal(m.a.done, T2);
  assert.equal(m.b.outcome, null);
});

test("remote-only keys are adopted; private remote keys are ignored", () => {
  const m = mergeEntries({}, {
    "home:x": { done: T1, outcome: "booked", updatedAt: T1 },
    "priv:y:2026-10-08": { done: T1, outcome: null, updatedAt: T2 },
  });
  assert.deepEqual(Object.keys(m), ["home:x"]);
});

test("applyEntries keeps local private state untouched", () => {
  const st = applyEntries({ done: { "priv:z:d": T1 }, outcome: {}, stamps: { "priv:z:d": T1 } }, {
    k: { done: T2, outcome: "ok", updatedAt: T2 },
  });
  assert.equal(st.done["priv:z:d"], T1);
  assert.equal(st.done.k, T2);
  assert.equal(st.outcome.k, "ok");
  assert.equal(st.stamps.k, T2);
});

test("snapshotDay hides private titles but counts them", () => {
  const items = [
    { key: "priv:a:d", track: "private", title: "secret", how: [], minutes: 5, score: 10, rank: 1000, scoreKey: "" },
    { key: "d-x", track: "t20", title: "Visible", how: [], minutes: 10, score: 7, rank: 10, scoreKey: "d-x", due: "2026-10-06" },
  ];
  const snap = snapshotDay(items, { done: { "priv:a:d": T1 }, outcome: {} }, T2);
  assert.equal(snap.privateDone, 1);
  assert.equal(snap.privateTotal, 1);
  assert.equal(snap.items.length, 1);
  assert.equal(snap.items[0].due, "2026-10-06");
  assert.ok(!JSON.stringify(snap).includes("secret"));
});

test("mergeDays keeps the newer snapshot per date", () => {
  const a = { "2026-10-08": { updatedAt: T1, items: [], privateDone: 0, privateTotal: 0 } };
  const b = { "2026-10-08": { updatedAt: T2, items: [{ key: "k" }], privateDone: 0, privateTotal: 0 } };
  assert.equal(mergeDays(a, b)["2026-10-08"].updatedAt, T2);
  assert.equal(mergeDays(b, a)["2026-10-08"].updatedAt, T2);
});

test("pruneDoc drops old tombstones and old days but never old ticks", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  const doc = {
    v: 1,
    entries: {
      oldTomb: { done: null, outcome: null, updatedAt: "2026-07-01T00:00:00.000Z" },
      oldTick: { done: "2026-07-01T00:00:00.000Z", outcome: null, updatedAt: "2026-07-01T00:00:00.000Z" },
      newTomb: { done: null, outcome: null, updatedAt: T1 },
    },
    days: { "2026-08-01": { updatedAt: T1, items: [] }, "2026-10-07": { updatedAt: T1, items: [] } },
  };
  const p = pruneDoc(doc, now);
  assert.deepEqual(Object.keys(p.entries).sort(), ["newTomb", "oldTick"]);
  assert.deepEqual(Object.keys(p.days), ["2026-10-07"]);
});

test("parseDoc tolerates corrupt or empty content", () => {
  assert.equal(parseDoc(""), null);
  assert.equal(parseDoc("{not json"), null);
  assert.deepEqual(parseDoc('{"entries":null}'), { v: 1, entries: {}, days: {} });
});
