import { Task } from "./types";

// The ONLY module that knows where tasks physically live. Swap this
// implementation for an Upstash/Supabase-backed one in the "dashboard"
// phase and nothing above it changes — the UI talks to `store`, never
// to localStorage directly.
export interface Store {
  load(): Task[];
  save(tasks: Task[]): void;
}

// Bump this version to discard a stale local cache after a seed/plan change.
const KEY = "revengine.command-center.v2";

class LocalStore implements Store {
  load(): Task[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Task[]) : [];
    } catch {
      return [];
    }
  }

  save(tasks: Task[]): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY, JSON.stringify(tasks));
  }
}

export const store: Store = new LocalStore();
