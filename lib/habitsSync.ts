// Cross-device sync for the HABITS panel using a secret GitHub Gist as the
// free "database". The write credential is a classic PAT with ONLY the `gist`
// scope (fine-grained tokens don't cover gists), pasted once per device and
// stored in localStorage — same trust model as the KeysPanel: never in the
// repo, never deployed. api.github.com is CORS-enabled, 5000 req/hr authed.
//
// Sync model: pull + merge + push on mount, debounced push on change. Marks
// merge day-by-day (newer stamp wins; legacy unstamped days union), the habit
// list as a whole goes to the newer habitsStamp.

export interface SyncedHabitState {
  habits: { id: string; name: string }[];
  marks: Record<string, string[]>;
  // Per-day last-write stamps (ISO) for day-level merge; optional for
  // backward compat with pre-sync localStorage data.
  stamps?: Record<string, string>;
  habitsStamp?: string;
}

const FILE = "command-center-habits.json";
const TOKEN_KEY = "revengine.command-center.habits.gist-token.v1";
const GIST_KEY = "revengine.command-center.habits.gist-id.v1";

export function loadSyncToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveSyncToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage blocked — sync just won't persist across reloads */
  }
}

export function clearSync(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(GIST_KEY);
  } catch {
    /* ignore */
  }
}

async function gh(path: string, token: string, init?: RequestInit): Promise<Response> {
  const r = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      // After the spread so no caller can strip or override the auth header.
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}`);
  return r;
}

// Locate this device's sync gist (cached), else find it among the account's
// gists by filename, else create a fresh secret gist.
export async function findOrCreateGist(token: string): Promise<string> {
  if (typeof window === "undefined") throw new Error("sync is client-only");
  try {
    const cached = window.localStorage.getItem(GIST_KEY);
    if (cached) return cached;
  } catch {
    /* fall through to lookup */
  }

  const list = (await (await gh("/gists?per_page=100", token)).json()) as {
    id: string;
    files?: Record<string, unknown>;
  }[];
  let id = list.find((g) => g.files && FILE in g.files)?.id;

  if (!id) {
    const created = (await (
      await gh("/gists", token, {
        method: "POST",
        body: JSON.stringify({
          description: "Command Center habit tracker sync (auto-managed)",
          public: false,
          files: { [FILE]: { content: "{}" } },
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

export async function pullRemote(
  token: string,
  gistId: string,
): Promise<SyncedHabitState | null> {
  const g = (await (await gh(`/gists/${gistId}`, token)).json()) as {
    files?: Record<string, { content?: string; truncated?: boolean }>;
  };
  const content = g.files?.[FILE]?.content;
  if (!content) return null;
  try {
    const d = JSON.parse(content) as SyncedHabitState;
    // typeof null === "object", so the null check is load-bearing: a corrupted
    // gist must come back as null, not crash mergeStates.
    return Array.isArray(d.habits) && d.marks !== null && typeof d.marks === "object"
      ? d
      : null;
  } catch {
    return null;
  }
}

export async function pushRemote(
  token: string,
  gistId: string,
  state: SyncedHabitState,
): Promise<void> {
  await gh(`/gists/${gistId}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      files: { [FILE]: { content: JSON.stringify(state, null, 1) } },
    }),
  });
}

function newer(a?: string, b?: string): boolean {
  // true if a is strictly newer than b; missing stamps lose to present ones.
  if (!a) return false;
  if (!b) return true;
  return a > b; // ISO strings compare chronologically
}

export function mergeStates(
  local: SyncedHabitState,
  remote: SyncedHabitState,
): SyncedHabitState {
  // Habit list: whole-list last-write-wins (handles renames/removals sanely).
  const habits = newer(remote.habitsStamp, local.habitsStamp)
    ? remote.habits
    : local.habits;
  const habitsStamp =
    newer(remote.habitsStamp, local.habitsStamp)
      ? remote.habitsStamp
      : local.habitsStamp;

  // Marks: day-level last-write-wins; days stamped on neither side union, so
  // legacy pre-sync data from two devices is never silently dropped.
  const marks: Record<string, string[]> = {};
  const stamps: Record<string, string> = {};
  const days = new Set([...Object.keys(local.marks), ...Object.keys(remote.marks)]);
  for (const day of days) {
    const ls = local.stamps?.[day];
    const rs = remote.stamps?.[day];
    if (!ls && !rs) {
      marks[day] = [
        ...new Set([...(local.marks[day] ?? []), ...(remote.marks[day] ?? [])]),
      ];
    } else if (newer(rs, ls)) {
      marks[day] = remote.marks[day] ?? [];
      stamps[day] = rs as string;
    } else {
      marks[day] = local.marks[day] ?? [];
      if (ls) stamps[day] = ls;
    }
  }
  return { habits, marks, stamps, habitsStamp };
}
