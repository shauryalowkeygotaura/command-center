// Daily "call 50 clinics" list. Self-contained: its own localStorage key,
// its own daily model. Paste the day's numbers (from the pipeline / sheet),
// check them off, uncalled ones roll to tomorrow.

export interface CallEntry {
  id: string;
  number: string;
  label?: string; // clinic name etc.
  whatsapp?: string; // wa.me-ready digits (91XXXXXXXXXX), empty for landlines
  area?: string; // locality, from the maps listing
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

/** Pull one {number, label} per non-empty line from pasted text.
 *  Line shapes handled: "9636180333", "+91 96361 80333 Marudhar Dental",
 *  "9636180333, Olive Green". First phone-like run = number, rest = label. */
export function parseNumbers(raw: string): { number: string; label?: string }[] {
  const out: { number: string; label?: string }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/\+?\d[\d\-\s()]{5,}\d/);
    if (!m) continue;
    const number = m[0].replace(/\s+/g, " ").trim();
    const label =
      t.replace(m[0], "").replace(/^[\s,–—-]+|[\s,–—-]+$/g, "").trim() || undefined;
    out.push({ number, label });
  }
  return out;
}
