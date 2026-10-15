"use client";

// The local date, kept current. The old pattern, useMemo(() => isoDate(), []),
// froze "today" at the moment the page opened, so a tab left open overnight
// kept showing yesterday's list until a manual reload. This re-checks every
// minute and whenever the tab becomes visible or focused again (phones resume
// a backgrounded tab without reloading it), and only re-renders when the
// calendar date actually changes.

import { useEffect, useState } from "react";
import { isoDate } from "./day";

export function useToday(): string {
  const [today, setToday] = useState(() => isoDate());

  useEffect(() => {
    const check = () => {
      const now = isoDate();
      setToday((prev) => (prev === now ? prev : now));
    };
    const timer = setInterval(check, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    check();
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);

  return today;
}
