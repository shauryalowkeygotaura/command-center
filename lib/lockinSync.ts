// Cross-device sync for LOCK IN ticks + outcomes, riding the same secret-gist
// pattern and the SAME pasted PAT as INBOX and HABITS (habitsSync's token
// slot): one paste per device covers all three. The vault-side end-of-day
// review (Vault/Scripts/lockin_eod_review.py, 23:00 IST) reads this gist with
// the Doppler GITHUB_TOKEN, so it must live on EXPECTED_OWNER's account.
// Merge logic lives in ./lockinMerge (pure, unit-tested).

import { gh, loadSyncToken } from "./habitsSync";
import { verifyOwner } from "./inboxSync";
import { LockSyncDoc, parseDoc, pruneDoc } from "./lockinMerge";

export { loadSyncToken, verifyOwner };

export const LOCKIN_GIST_FILE = "command-center-lockin.json";
const GIST_KEY = "revengine.command-center.lockin.gist-id.v1";

// Cached id, else the OLDEST gist holding the file (the vault script uses the
// same rule, so both sides converge), else create it.
export async function findOrCreateLockinGist(token: string): Promise<string> {
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
    .filter((g) => g.files && LOCKIN_GIST_FILE in g.files)
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  let id = matches[0]?.id;
  if (!id) {
    const created = (await (
      await gh("/gists", token, {
        method: "POST",
        body: JSON.stringify({
          description: "Command Center LOCK IN sync (auto-managed)",
          public: false,
          files: { [LOCKIN_GIST_FILE]: { content: '{"v":1,"entries":{},"days":{}}' } },
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

export async function pullLockin(token: string, gistId: string): Promise<LockSyncDoc | null> {
  const g = (await (await gh(`/gists/${gistId}`, token)).json()) as {
    files?: Record<string, { content?: string }>;
  };
  return parseDoc(g.files?.[LOCKIN_GIST_FILE]?.content);
}

export async function pushLockin(token: string, gistId: string, doc: LockSyncDoc): Promise<void> {
  const kept = pruneDoc(doc, Date.now());
  await gh(`/gists/${gistId}`, token, {
    method: "PATCH",
    body: JSON.stringify({ files: { [LOCKIN_GIST_FILE]: { content: JSON.stringify(kept, null, 1) } } }),
  });
}
