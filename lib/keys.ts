// Local-only API-key drop. NOTHING here is ever committed or sent anywhere by
// the app itself — it lives purely in this browser's localStorage. The only way
// a key leaves is when YOU press "Copy for Claude" and paste it to me, at which
// point I route it into Doppler / the project's .env. Treat the copy block like
// a plaintext secret: paste it to me, then clear this panel.

export interface KeyEntry {
  id: string;
  name: string; // e.g. GROQ_API_KEY
  value: string; // the secret itself
  project?: string; // which Doppler project / repo it belongs to
  integrated?: boolean; // you/I flip this once it's wired into Doppler
}

export const KEYS_STORAGE = "revengine.command-center.keys.v1";

export function loadKeys(): KeyEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEYS_STORAGE);
    return raw ? (JSON.parse(raw) as KeyEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveKeys(keys: KeyEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
}

// Parse pasted lines of the form NAME=value (one per line). Surrounding quotes,
// a leading "export ", and blank/comment (#) lines are tolerated.
export function parseKeyLines(text: string, project?: string): KeyEntry[] {
  const out: KeyEntry[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    if (!name || !value) continue;
    out.push({
      id: crypto.randomUUID(),
      name,
      value,
      project: project?.trim() || undefined,
      integrated: false,
    });
  }
  return out;
}

export function maskValue(value: string): string {
  if (value.length <= 8) return "•".repeat(value.length);
  return value.slice(0, 4) + "•".repeat(Math.max(4, value.length - 8)) + value.slice(-4);
}
