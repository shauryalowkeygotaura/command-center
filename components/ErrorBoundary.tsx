"use client";

// Catches any render or effect crash below it and shows the real error
// instead of leaving the page stuck on "loading board…". Every store here is
// localStorage, so a crash usually means one saved value no longer matches
// what the code expects; the message names it, and "copy for claude" hands
// the details over without anyone opening dev tools.

import { Component, ReactNode } from "react";

interface State {
  error: Error | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  private report(): string {
    const e = this.state.error;
    const keys: string[] = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k) keys.push(`${k} (${(window.localStorage.getItem(k) ?? "").length} chars)`);
      }
    } catch {
      keys.push("localStorage unreadable");
    }
    return [
      "Command Center crashed",
      `url: ${window.location.href}`,
      `browser: ${navigator.userAgent}`,
      `error: ${e?.name}: ${e?.message}`,
      `stack: ${(e?.stack ?? "").split("\n").slice(0, 6).join(" | ")}`,
      `stores: ${keys.join(", ")}`,
    ].join("\n");
  }

  private copy = async () => {
    try {
      await navigator.clipboard.writeText(this.report());
      this.setState({ copied: true });
    } catch {
      /* clipboard blocked: the message is still on screen */
    }
  };

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto mt-16 flex max-w-xl flex-col gap-4 px-4 font-sans">
        <h1 className="text-[24px] font-bold text-cream">The dashboard hit an error</h1>
        <p className="text-[14px] text-cream-dim">
          Nothing is lost: your ticks and lists are still saved in this browser. Copy the details below and paste them to
          Claude, then reload.
        </p>
        <pre className="whitespace-pre-wrap rounded-xl bg-panel p-3 font-mono text-[11.5px] text-amber">
          {error.name}: {error.message}
        </pre>
        <div className="flex gap-2">
          <button
            onClick={this.copy}
            className="min-h-10 rounded-full bg-amber px-5 text-[13px] font-semibold text-ink"
          >
            {copied ? "Copied ✓" : "Copy error for Claude"}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="min-h-10 rounded-full border border-cream/20 px-5 text-[13px] text-cream"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
