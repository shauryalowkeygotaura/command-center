// Brand + sales clock. Day 1 = launch of the current @revengineee 30-day plan.
// Restarted 2026-10-01 ("locked in"); the source of truth is data/lockin.json,
// so the BOARD brand lane and the LOCK IN tab always agree on the day number.
import lockin from "@/data/lockin.json";

export const LAUNCH_DATE = lockin.launchDate;
// Day-21 hard milestone.
export const MILESTONE_DATE = lockin.milestone.date;
export const MILESTONE_LABEL = lockin.milestone.label;

/** Local (not UTC) YYYY-MM-DD for a given date, defaulting to now. */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T00:00:00");
  const b = new Date(toISO + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** 1-indexed day number in the 30-day plan for a given date. */
export function dayNumber(toISO: string = isoDate()): number {
  return daysBetween(LAUNCH_DATE, toISO) + 1;
}

/** Whole days remaining until the milestone (negative = past). */
export function daysToMilestone(fromISO: string = isoDate()): number {
  return daysBetween(fromISO, MILESTONE_DATE);
}
