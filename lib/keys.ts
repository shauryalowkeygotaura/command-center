// API-key drop. Keys are staged in this browser's localStorage, then pushed
// straight to Doppler via the key-drop proxy (Code/key-drop on Vercel) — no
// secrets ever transit chat. "Copy for Claude" remains as a manual fallback.

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

// ---- key-drop proxy (browser -> Vercel -> Doppler) ----

export const DROP_SETTINGS_STORAGE = "revengine.command-center.keydrop.v1";

// Threat model note: the drop token below IS stored in localStorage, on
// purpose. It is a low-value, write-only credential — possessing it only lets
// someone ADD secrets to Doppler via the proxy, never read or list them. The
// powerful credential (DOPPLER_TOKEN) never leaves the Vercel server env. If
// this passphrase leaks, rotate it in Vercel; nothing is exposed.
export interface DropSettings {
  endpoint: string; // e.g. https://key-drop.vercel.app/api/keys
  token: string; // the x-drop-token passphrase
}

export function loadDropSettings(): DropSettings {
  if (typeof window === "undefined") return { endpoint: "", token: "" };
  try {
    const raw = window.localStorage.getItem(DROP_SETTINGS_STORAGE);
    return raw ? (JSON.parse(raw) as DropSettings) : { endpoint: "", token: "" };
  } catch {
    return { endpoint: "", token: "" };
  }
}

export function saveDropSettings(s: DropSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DROP_SETTINGS_STORAGE, JSON.stringify(s));
}

// The project field may carry an explicit Doppler config: "jio-outbound/prd".
// Bare names default to the "dev" config.
export function splitProjectConfig(raw: string): { project: string; config: string } {
  const trimmed = raw.trim();
  const slash = trimmed.indexOf("/");
  if (slash < 1) return { project: trimmed, config: "dev" };
  return {
    project: trimmed.slice(0, slash).trim(),
    config: trimmed.slice(slash + 1).trim() || "dev",
  };
}

// Push one project's pending keys through the proxy into Doppler.
// Throws with a readable message on any failure so the panel can surface it.
export async function pushToDoppler(
  settings: DropSettings,
  projectField: string,
  entries: KeyEntry[],
): Promise<string[]> {
  const { project, config } = splitProjectConfig(projectField);
  const secrets: Record<string, string> = {};
  for (const e of entries) secrets[e.name] = e.value;

  let res: Response;
  try {
    res = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-drop-token": settings.token,
      },
      body: JSON.stringify({ project, config, secrets }),
    });
  } catch {
    throw new Error("endpoint unreachable — check the URL in settings");
  }

  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; saved?: string[]; error?: string }
    | null;
  if (!res.ok || !body?.ok) {
    throw new Error(body?.error || `push failed (HTTP ${res.status})`);
  }
  return body.saved ?? entries.map((e) => e.name);
}

// ---- smart drop: plain-language description -> Groq routes it -> Doppler ----

export interface SmartDropResult {
  name: string;
  project: string;
  config: string;
  note: string;
}

// Thrown when the router needs a better description — the panel keeps the key
// and asks the user to rephrase, offering the live project list as chips.
export class SmartDropClarify extends Error {
  projects: string[];
  envName?: string; // env var name, if that half was inferred fine
  constructor(message: string, projects: string[], envName?: string) {
    super(message);
    Object.setPrototypeOf(this, SmartDropClarify.prototype);
    this.projects = projects;
    this.envName = envName;
  }
}

// The smart endpoint lives next to the keys endpoint: .../api/keys -> .../api/smart
export function smartEndpoint(keysEndpoint: string): string {
  return keysEndpoint.replace(/\/keys\/?$/, "/smart");
}

export async function smartDrop(
  settings: DropSettings,
  description: string,
  value: string,
): Promise<SmartDropResult> {
  let res: Response;
  try {
    res = await fetch(smartEndpoint(settings.endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-drop-token": settings.token,
      },
      body: JSON.stringify({ description, value }),
    });
  } catch {
    throw new Error("endpoint unreachable — check the URL in settings");
  }

  const body = (await res.json().catch(() => null)) as
    | (Partial<SmartDropResult> & {
        ok?: boolean;
        error?: string;
        clarify?: boolean;
        projects?: string[];
      })
    | null;
  if (body?.clarify) {
    throw new SmartDropClarify(
      body.error || "say it more explicitly",
      Array.isArray(body.projects) ? body.projects : [],
      body.name,
    );
  }
  if (!res.ok || !body?.ok || !body.name || !body.project) {
    throw new Error(body?.error || `smart drop failed (HTTP ${res.status})`);
  }
  return {
    name: body.name,
    project: body.project,
    config: body.config || "dev",
    note: body.note || "",
  };
}
