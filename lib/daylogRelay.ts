// Day-log relay: sends LOCK IN ticks/outcomes + HANDOFFS replies to the
// key-drop /api/daylog endpoint, which merges them into Doppler
// portfolio/dev LOCKIN_DAYLOG for the 23:00 vault review. Rides the KEYS
// panel's existing drop passphrase, so no GitHub PAT has to be pasted.
// Write-only: the endpoint never returns stored data.

import type { ChecklistItem } from "./lists";
import { loadDropSettings } from "./keys";
import type { DaySnapshot, LockEntry } from "./lockinMerge";

export interface ReplyEntry {
  text: string;
  replyStatus: string | null;
  reply: string | null;
  done: boolean;
  updatedAt: string;
}

/** The daylog URL next to the configured /api/keys endpoint, or "" if unset. */
export function daylogEndpoint(): { url: string; token: string } {
  const s = loadDropSettings();
  if (!s.endpoint || !s.token) return { url: "", token: "" };
  try {
    const u = new URL(s.endpoint);
    u.pathname = "/api/daylog";
    return { url: u.toString(), token: s.token };
  } catch {
    return { url: "", token: "" };
  }
}

/** Only handoffs he has actually answered or ticked; stamp = now if unstamped. */
export function repliesFrom(items: ChecklistItem[], nowIso: string): Record<string, ReplyEntry> {
  const out: Record<string, ReplyEntry> = {};
  for (const it of items) {
    if (it.deleted || !(it.replyStatus || it.reply || it.done)) continue;
    out[it.id] = {
      text: it.text,
      replyStatus: it.replyStatus ?? null,
      reply: it.reply ?? null,
      done: it.done,
      updatedAt: it.updatedAt ?? nowIso,
    };
  }
  return out;
}

export async function pushDaylog(payload: {
  entries: Record<string, LockEntry>;
  days: Record<string, DaySnapshot>;
  replies: Record<string, ReplyEntry>;
}): Promise<boolean> {
  const { url, token } = daylogEndpoint();
  if (!url) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-drop-token": token },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`daylog HTTP ${res.status}`);
  return true;
}
