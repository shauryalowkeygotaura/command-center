// Cross-device sync for the INBOX checklist, riding the same secret-gist
// "database" pattern — and the SAME pasted PAT (habitsSync's token slot) — as
// the HABITS panel. One paste per device covers both panels.
//
// Unlike habits (day-keyed grid), the inbox is a flat item list, so the merge
// is per-item last-write-wins on `updatedAt`, with tombstones: a delete is
// recorded as { deleted: true, updatedAt } instead of removal, otherwise the
// other device's copy would resurrect it on the next union. Tombstones are
// pruned after 45 days on push.
//
// The vault-side cron (Vault/Scripts/sync_command_center_inbox.py) reads this
// gist with the Doppler GITHUB_TOKEN, which belongs to EXPECTED_OWNER — so the
// gist must live on that account. connect verifies the pasted PAT's login and
// fails loudly instead of silently split-braining into a second account.

import { ChecklistItem } from "./lists";
import { gh, loadSyncToken, saveSyncToken } from "./habitsSync";

export { loadSyncToken, saveSyncToken };

const FILE = "command-center-inbox.json";
const GIST_KEY = "revengine.command-center.inbox.gist-id.v1";
const TOMBSTONE_TTL_MS = 45 * 24 * 60 * 60 * 1000;

/** The GitHub account the vault cron reads gists from (Doppler GITHUB_TOKEN). */
export const EXPECTED_OWNER = "shauryalowkeygotaura";

export async function verifyOwner(token: string): Promise<void> {
  const user = (await (await gh("/user", token)).json()) as { login?: string };
  if (user.login !== EXPECTED_OWNER) {
    throw new Error(
      `inbox sync needs a PAT from ${EXPECTED_OWNER} (this one is ${user.login ?? "unknown"}) — the vault cron only sees that account's gists`,
    );
  }
}

// Locate the inbox gist (cached), else find it by filename, else create it.
// On multiple matches (e.g. cron + browser both created one) the OLDEST wins
// on both sides, so they deterministically converge.
export async function findOrCreateInboxGist(token: string): Promise<string> {
  if (typeof window === "undefined") throw new Error("sync is client-only");
  try {
    const cached = window.localStorage.getItem(GIST_KEY);
    if (cached) return cached;
  } catch {
    /* fall through to lookup */
  }

  const list = (await (await gh("/gists?per_page=100", token)).json()) as {
    id: string;
    created_at?: string;
    files?: Record<string, unknown>;
  }[];
  const matches = list
    .filter((g) => g.files && FILE in g.files)
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  let id = matches[0]?.id;

  if (!id) {
    const created = (await (
      await gh("/gists", token, {
        method: "POST",
        body: JSON.stringify({
          description: "Command Center inbox sync (auto-managed)",
          public: false,
          files: { [FILE]: { content: '{"items":[]}' } },
        }),
      })
    ).json()) as { id: string };
    id = created.id;
  }

  try {
    window.localStorage.setItem(GIST_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

export async function pullInbox(
  token: string,
  gistId: string,
): Promise<ChecklistItem[] | null> {
  const g = (await (await gh(`/gists/${gistId}`, token)).json()) as {
    files?: Record<string, { content?: string }>;
  };
  const content = g.files?.[FILE]?.content;
  if (!content) return null;
  try {
    const d = JSON.parse(content) as { items?: ChecklistItem[] };
    return Array.isArray(d.items) ? d.items : null;
  } catch {
    return null;
  }
}

export async function pushInbox(
  token: string,
  gistId: string,
  items: ChecklistItem[],
): Promise<void> {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  const kept = items.filter(
    (i) => !i.deleted || !i.updatedAt || Date.parse(i.updatedAt) > cutoff,
  );
  await gh(`/gists/${gistId}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      files: { [FILE]: { content: JSON.stringify({ items: kept }, null, 1) } },
    }),
  });
}

function newer(a?: string, b?: string): boolean {
  // true if a is strictly newer than b; missing stamps lose to present ones.
  if (!a) return false;
  if (!b) return true;
  return a > b; // ISO strings compare chronologically
}

// Per-item LWW: local order is kept, remote-only items append in their order.
export function mergeInbox(
  local: ChecklistItem[],
  remote: ChecklistItem[],
): ChecklistItem[] {
  const remoteById = new Map(remote.map((i) => [i.id, i]));
  const merged = local.map((l) => {
    const r = remoteById.get(l.id);
    return r && newer(r.updatedAt, l.updatedAt) ? r : l;
  });
  const localIds = new Set(local.map((i) => i.id));
  return [...merged, ...remote.filter((r) => !localIds.has(r.id))];
}
