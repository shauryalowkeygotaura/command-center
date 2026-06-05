// Pipeline ops data layer for the Command Center.
//
// The dashboard is a static GitHub Pages app (no backend), so it reads pipeline
// health from two free, public sources:
//   1. GitHub Actions REST API  -> live pass/fail + last-run time (unauthenticated,
//      60 req/hr/IP, plenty for a personal board).
//   2. raw.githubusercontent     -> each repo's runs/latest.json (counts + budgets)
//      that the pipeline commits at the end of every run.
// Claude Code usage comes from a committed status/cc-usage.json (generated locally
// by scripts/update_cc_usage.py, since Claude Code has no public usage API).

export const GH_OWNER = "shauryalowkeygotaura";

export interface PipelineCfg {
  key: string;
  label: string;
  repo: string;
  branch: string;
  site?: string; // deployed app URL, rendered as an "open" link on the card
}

// The pipelines wired into the board. Add a row here to track a new pipeline;
// it just needs to commit a runs/latest.json in the shared schema. Deployed
// apps (no runs/latest.json) still get Actions deploy status + an open link.
export const PIPELINES: PipelineCfg[] = [
  { key: "philosopher", label: "Philosopher reels", repo: "philosopher-pipeline", branch: "master" },
  { key: "client", label: "Client acquisition", repo: "client-acquisition-pipeline", branch: "master" },
  { key: "football", label: "Football shorts", repo: "football-shorts-autopilot", branch: "main" },
  {
    key: "resume",
    label: "Resume autopilot",
    repo: "resume-autopilot",
    branch: "main",
    site: "https://shauryalowkeygotaura.github.io/resume-autopilot/",
  },
];

export interface RunMetrics {
  pipeline: string;
  ts: string;
  mode: string;
  status: "ok" | "degraded" | "error";
  summary: string;
  metrics: Record<string, unknown>;
  budgets: Record<string, { used?: number | null; limit?: number; note?: string }>;
}

export interface ActionsStatus {
  conclusion: string | null; // success | failure | null (in progress)
  status: string; // completed | in_progress | queued
  createdAt: string;
  url: string;
}

export interface PipelineState {
  cfg: PipelineCfg;
  actions?: ActionsStatus;
  metrics?: RunMetrics;
  error?: string;
}

export interface CCUsage {
  ts: string;
  todayTokens: number;
  todayCostUsd: number;
  weekTokens?: number;
  // Live "token burn" gauge: rolling 5-hour window + a fast trailing rate.
  // burnTokPerMin excludes cache tokens (readable); burnCostPerHour bills every
  // token at its rate (the honest $/hr). See scripts/update_cc_usage.py.
  live5hTokens?: number;
  live5hCostUsd?: number;
  // This week's max rolling-5h burn — the de facto rate-limit ceiling that
  // scales the gauge bar (live5hTokens / peak5hTokens).
  peak5hTokens?: number;
  burnTokPerMin?: number;
  burnCostPerHour?: number;
  limitNote?: string;
}

const rawUrl = (p: PipelineCfg) =>
  `https://raw.githubusercontent.com/${GH_OWNER}/${p.repo}/${p.branch}/runs/latest.json`;

// Claude Code token usage, read from the committed cc-usage.json via raw GitHub
// (same pattern as pipeline metrics) so the LIVE deployed site shows it without a
// Pages rebuild — the Stop hook pushes the file, raw serves the latest commit.
// Note: raw.githubusercontent has a ~5-min CDN cache, so freshness tops out there.
export const CC_RAW_URL =
  `https://raw.githubusercontent.com/${GH_OWNER}/command-center/main/public/status/cc-usage.json`;

const actionsUrl = (p: PipelineCfg) =>
  `https://api.github.com/repos/${GH_OWNER}/${p.repo}/actions/runs?branch=${p.branch}&per_page=1`;

export async function fetchActions(p: PipelineCfg): Promise<ActionsStatus | undefined> {
  try {
    const r = await fetch(actionsUrl(p), {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!r.ok) return undefined;
    const data = await r.json();
    const run = data?.workflow_runs?.[0];
    if (!run) return undefined;
    return {
      conclusion: run.conclusion ?? null,
      status: run.status,
      createdAt: run.created_at,
      url: run.html_url,
    };
  } catch {
    return undefined;
  }
}

export async function fetchMetrics(p: PipelineCfg): Promise<RunMetrics | undefined> {
  try {
    const r = await fetch(rawUrl(p), { cache: "no-store" });
    if (!r.ok) return undefined;
    return (await r.json()) as RunMetrics;
  } catch {
    return undefined;
  }
}

// "ok" green, "degraded" amber, "error"/failure red. Actions failure overrides a
// stale-but-ok metrics file (the run blew up before writing its own status).
export function severity(s?: PipelineState): "ok" | "warn" | "bad" | "idle" {
  if (!s) return "idle";
  if (s.actions?.conclusion === "failure") return "bad";
  const st = s.metrics?.status;
  if (st === "error") return "bad";
  if (st === "degraded") return "warn";
  if (st === "ok") return "ok";
  if (s.actions?.conclusion === "success") return "ok";
  return "idle";
}

export function relTime(iso?: string): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
