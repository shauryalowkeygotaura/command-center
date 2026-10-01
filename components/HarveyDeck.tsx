"use client";

import { useCallback, useEffect, useState } from "react";

// Harvey (Code/harvey) serves its own dashboard on this machine only. The
// Command Center is a static GitHub Pages site, so it cannot proxy or host
// Harvey; it embeds the local server when it is running, and says how to
// start it when it is not. Chrome's Local Network Access gate asks once
// before a public page may reach localhost, hence the iframe `allow` below.
const HARVEY_URL = "http://localhost:5555/";
const RECHECK_MS = 10_000;

type Status = "checking" | "up" | "down";

export function HarveyDeck() {
  const [status, setStatus] = useState<Status>("checking");
  const [nonce, setNonce] = useState(0);

  const probe = useCallback(async () => {
    try {
      // no-cors: an opaque response still proves the server answered.
      await fetch(HARVEY_URL, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(3000) });
      setStatus("up");
    } catch {
      setStatus("down");
    }
  }, []);

  useEffect(() => {
    void probe();
  }, [probe, nonce]);

  useEffect(() => {
    if (status !== "down") return;
    const id = setInterval(() => void probe(), RECHECK_MS);
    return () => clearInterval(id);
  }, [status, probe]);

  if (status === "up") {
    return (
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-mono text-cream-dim">
          <span>
            <span className="inline-block h-2 w-2 rounded-full bg-term mr-2 align-middle" />
            harvey live on localhost:5555
          </span>
          <a href={HARVEY_URL} target="_blank" rel="noreferrer" className="underline hover:text-cream">
            open full screen
          </a>
        </div>
        <iframe
          title="Harvey dashboard"
          src={HARVEY_URL}
          allow="local-network-access"
          className="w-full h-[78vh] rounded border border-cream-dim/20 bg-black"
        />
      </section>
    );
  }

  return (
    <section className="rounded border border-cream-dim/20 p-5 font-mono text-sm leading-relaxed">
      <p className="text-cream">
        {status === "checking" ? "looking for harvey on localhost:5555..." : "harvey is not running on this machine."}
      </p>
      {status === "down" && (
        <>
          <p className="mt-3 text-cream-dim">Start the dashboard (safe: it sends nothing):</p>
          <pre className="mt-1 overflow-x-auto text-term">cd Code/harvey && .venv/Scripts/harvey dashboard</pre>
          <p className="mt-3 text-cream-dim">Start the agent loop (drafts only; every email waits in its Outbox for you):</p>
          <pre className="mt-1 overflow-x-auto text-term">cd Code/harvey && .venv/Scripts/harvey run</pre>
          <p className="mt-3 text-cream-dim">
            Running but still blank? Chrome may be blocking this page from reaching localhost: allow
            &quot;local network access&quot; in the site settings (padlock icon).
          </p>
          <button
            type="button"
            onClick={() => { setStatus("checking"); setNonce((n) => n + 1); }}
            className="mt-4 rounded border border-cream-dim/30 px-3 py-1 text-cream hover:bg-cream-dim/10"
          >
            check again
          </button>
        </>
      )}
    </section>
  );
}
