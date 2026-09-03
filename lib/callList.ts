// Daily "call 50 clinics" list. Self-contained: its own localStorage key,
// its own daily model. Paste the day's numbers (from the pipeline / sheet),
// check them off, uncalled ones roll to tomorrow.

export interface CallEntry {
  id: string;
  number: string;
  label?: string; // clinic name etc.
  whatsapp?: string; // wa.me-ready digits (91XXXXXXXXXX), empty for landlines
  area?: string; // locality, from the maps listing
  // One line of context shown under the number, written by the generator
  // (scripts/lead_quality.py describe()): what the place is, whether it already
  // has a website, rating/hours where the source had them. You cannot pick
  // which of 50 numbers to dial from a name alone.
  description?: string;
  // "private" | "chain". Government and institutional listings never reach the
  // file at all — they were 23% of it before the gate existed — so this is not
  // a filter, only a warning that a chain buys centrally.
  kind?: string;
  called: boolean;
  dueDate: string; // YYYY-MM-DD
}

export const CALL_TARGET = 50;

const KEY = "revengine.command-center.calls.v1";

export const callStore = {
  load(): CallEntry[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as CallEntry[]) : [];
    } catch {
      return [];
    }
  },
  save(entries: CallEntry[]): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify(entries));
  },
};

/** Pull one {number, label, description} per non-empty line from pasted text.
 *  Line shapes handled: "9636180333", "+91 96361 80333 Marudhar Dental",
 *  "9636180333, Olive Green". First phone-like run = number, rest = label.
 *  A "|" splits the remainder into label and description, so a row pasted by
 *  hand can carry the same context an auto-loaded one does:
 *      "9636180333 Marudhar Dental | no website, 4.6*"                        */
export function parseNumbers(
  raw: string,
): { number: string; label?: string; description?: string }[] {
  const out: { number: string; label?: string; description?: string }[] = [];
  const trim = (v: string) =>
    v.replace(/^[\s,–—-]+|[\s,–—-]+$/g, "").trim();
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/\+?\d[\d\-\s()]{5,}\d/);
    if (!m) continue;
    const number = m[0].replace(/\s+/g, " ").trim();
    // Cut the MATCHED span out by index, not by value. `t.replace(m[0], "")`
    // removes the first textual occurrence, which is a different span whenever
    // the digits appear earlier in the line ("123 Clinic 9636180333 | rated
    // 123") — that silently corrupted the label and now the description too.
    const rest = t.slice(0, m.index) + t.slice((m.index ?? 0) + m[0].length);
    const bar = rest.indexOf("|");
    const label = trim(bar === -1 ? rest : rest.slice(0, bar)) || undefined;
    const description =
      bar === -1 ? undefined : trim(rest.slice(bar + 1)) || undefined;
    out.push({ number, label, description });
  }
  return out;
}
