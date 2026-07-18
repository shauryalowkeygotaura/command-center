"use client";

import { useEffect, useRef, useState } from "react";

// JAIPUR DENTAL SENDS — the 8 Tier-A paste-ready DMs, surfaced where the work
// happens instead of buried in the vault doc. Source of truth for the COPY:
// Projects/client-acquisition-pipeline/jaipur-dental-outreach-2026-06-08.md
// (assembled 2026-06-10, honesty guardrails applied: no "I called last night",
// one DM, one question, ZERO links — a cold link is the top phishing signal).
//
// Why these are manual while the rest of sales is automated: these are named
// Tier-A doctors DM'd from Shaurya's PERSONAL handle by design. The automated
// IG channel (client-acquisition-pipeline modules/instagram.py) is for scale
// leads and stays creds-gated on a burner account. Sent-state persists in
// localStorage; log every send in jaipur-sends-log.md after.

interface Send {
  id: string;
  handle: string; // instagram handle, no @
  who: string;
  dm: string;
}

const CLOSER =
  "(Two clinics already run it. No app, no hardware, works on your existing number.)";

const SENDS: Send[] = [
  {
    id: "s-your-dentist",
    handle: "your_dentist_jaipur",
    who: "Dr. Ruby",
    dm: `Hi Dr. Ruby, your "fully digital clinic" reels are why I'm messaging, you clearly think about patient experience more than most clinics in Jaipur.\n\nQuick one: when a patient calls after hours to book a single-visit RCT, that call rings out and the booking walks to whoever picks up first.\n\nI run a voice agent that answers your line 24/7 and books straight into your calendar. I built a 50-second demo with your clinic's name in it so you can hear it, not read about it. Want me to send the clip?\n\n${CLOSER}`,
  },
  {
    id: "s-dental-seva",
    handle: "dental.seva",
    who: "Dr. Anirudh",
    dm: `Hi Dr. Anirudh, "painless since 2012" is a strong promise, and it made me wonder what happens to that promise when a nervous patient calls after hours and nobody picks up.\n\nI run a voice agent that answers your line 24/7 and books straight into your calendar. I can build a 50-second demo with Dental Seva's name in it so you can hear it, not read about it. Want me to send the clip?\n\n${CLOSER}`,
  },
  {
    id: "s-maharishi",
    handle: "maharishi_dental_clinic",
    who: "Dr. Jagrati",
    dm: `Hi Dr. Jagrati, your cosmetic cases on Instagram are genuinely impressive, those are exactly the high-value enquiries you don't want ringing out.\n\nI run a voice agent that answers your line 24/7 and books straight into your calendar. I can build a 50-second demo with your clinic's name in it. Want me to send the clip?\n\n${CLOSER}`,
  },
  {
    id: "s-kk-dental",
    handle: "dr_ankurgoyal_",
    who: "Dr. Ankur (personal handle, preferred over @kkdentalclinicjaipur)",
    dm: `Hi Dr. Ankur, a two-dentist practice where you're both chairside means the phone is the one thing nobody can answer mid-procedure, which is exactly why I'm reaching out.\n\nI run a voice agent that answers your line 24/7 and books straight into your calendar. I can build a 50-second demo with Krishna Kripa's name in it. Want me to send the clip?\n\n${CLOSER}`,
  },
  {
    id: "s-malviya-clinic",
    handle: "malviyadentalclinic",
    who: "Dr. Deepesh",
    dm: `Hi Dr. Deepesh, ortho cases are months of appointments, so one missed booking call early is a whole treatment plan lost to whoever picked up. That's the gap I help close.\n\nI run a voice agent that answers your line 24/7 and books straight into your calendar. I can build a 50-second demo with your clinic's name in it. Want me to send the clip?\n\n${CLOSER}`,
  },
  {
    id: "s-malviya-home",
    handle: "malviyadentalhome",
    who: "Doctor (solo)",
    dm: `Hi Doctor, small clinic, so I'll bet you read your own DMs and answer your own phone, which is exactly the problem I want to take off your plate.\n\nI run a voice agent that answers your line 24/7 and books straight into your calendar. I can build a 50-second demo with your clinic's name in it. Want me to send the clip?\n\n${CLOSER}`,
  },
  {
    id: "s-care-dental",
    handle: "thecaredental",
    who: "Doctor",
    dm: `Hi Doctor, your feed is clearly run by someone who cares about the patient's first impression, and right now the first impression is whoever answers the phone (or doesn't).\n\nI run a voice agent that answers your line 24/7 and books straight into your calendar. I can build a 50-second demo with The Care Dental's name in it. Want me to send the clip?\n\n${CLOSER}`,
  },
  {
    id: "s-vivan",
    handle: "vivan_dental",
    who: "Dr. Deepanshu",
    dm: `Hi Dr. Deepanshu, I noticed Vivan closes for the midday break, that window of unanswered booking calls is the exact slot my voice agent was built for.\n\nIt answers your line 24/7 and books straight into your calendar. I can build a 50-second demo with Vivan's name in it. Want me to send the clip?\n\n${CLOSER}`,
  },
];

const STORE_KEY = "revengine.command-center.jaipur-sends.v1";

function loadSent(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function OutreachSends() {
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSent(loadSent());
    setMounted(true);
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  function toggleSent(id: string) {
    setSent((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        // storage full/blocked — sent-state just won't persist
      }
      return next;
    });
  }

  async function copyDm(s: Send) {
    try {
      await navigator.clipboard.writeText(s.dm);
      setCopiedId(s.id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard unavailable — user can expand + select manually
      setOpen(s.id);
    }
  }

  const doneCount = SENDS.filter((s) => sent[s.id]).length;

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="font-mono text-sm font-bold text-burgundy-bright">
          📨 JAIPUR DENTAL · TIER-A SENDS
        </span>
        <span className="font-mono text-xs tabular-nums text-cream-dim">
          {mounted ? doneCount : 0}/{SENDS.length} sent
        </span>
      </div>
      <p className="border-b border-line px-3 py-2 font-mono text-[11px] leading-relaxed text-cream-dim">
        Copy → open IG → paste → send. One DM, one question, zero links (cold
        links get shadow-filtered). Tap each bio once in the IG app for the
        WhatsApp button. Log every send in jaipur-sends-log.md.
      </p>
      <ul className="divide-y divide-line">
        {SENDS.map((s) => (
          <li key={s.id} className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                onClick={() => toggleSent(s.id)}
                className={`font-mono text-xs ${mounted && sent[s.id] ? "text-burgundy-bright" : "text-cream-dim"} transition hover:text-cream`}
                title="toggle sent"
              >
                {mounted && sent[s.id] ? "☑ sent" : "☐ send"}
              </button>
              <a
                href={`https://instagram.com/${s.handle}`}
                target="_blank"
                rel="noreferrer"
                className={`font-mono text-sm ${mounted && sent[s.id] ? "text-cream-dim line-through" : "text-cream"} transition hover:text-burgundy-bright`}
              >
                @{s.handle}
              </a>
              <span className="font-mono text-[11px] text-cream-dim">{s.who}</span>
              <span className="ml-auto flex items-center gap-3">
                <button
                  onClick={() => copyDm(s)}
                  className="font-mono text-[10px] uppercase tracking-wide text-burgundy-bright transition hover:text-cream"
                >
                  {copiedId === s.id ? "copied ✓" : "copy dm"}
                </button>
                <button
                  onClick={() => setOpen(open === s.id ? null : s.id)}
                  className="font-mono text-[10px] uppercase tracking-wide text-cream-dim transition hover:text-cream"
                >
                  {open === s.id ? "hide" : "read"}
                </button>
              </span>
            </div>
            {open === s.id && (
              <p className="mt-2 whitespace-pre-wrap rounded border border-line bg-ink/40 p-2 font-mono text-[11px] leading-relaxed text-cream">
                {s.dm}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
