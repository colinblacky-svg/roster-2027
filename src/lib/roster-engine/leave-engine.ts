// Leave accounting (§6): day-charging (full week vs. partial), entitlement
// caps scaled by employment fraction, and residual-2026 reconciliation.

import { addDays, eachDay, mondayOfWeek, type ISODate } from "./date-utils";
import { patternDay, type ConsultantData } from "./types";
import type { CalendarDayData } from "./calendar";

export const RESIDUAL_DEADLINE: ISODate = "2027-04-10";

/** Max people (any leave type except MATERNITY) on leave the same day before
 * a new overlapping request gets flagged PENDING_APPROVAL instead of
 * auto-applying (§6.5). Mislovic's ROSTERED leave counts toward this same
 * pool rather than being excluded like MATERNITY — that's what makes "only 5
 * other people" fall out of this one shared cap rather than needing its own
 * rule: his rostered week already occupies one of the six slots. */
export const LEAVE_CAP = 6;

const WEEKDAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI"] as const;

function isPatternWorkingDay(
  consultant: ConsultantData,
  date: ISODate,
  calendarByDate: Map<ISODate, CalendarDayData>
): boolean {
  const day = calendarByDate.get(date);
  if (!day) return false;
  const jsDay = new Date(date).getUTCDay();
  const idx = (jsDay + 6) % 7; // 0=Mon..6=Sun
  if (idx >= 5) return false; // weekends are never chargeable working days
  const pattern = day.weekLabel === "A" ? consultant.weekAPattern : consultant.weekBPattern;
  return patternDay(pattern, WEEKDAY_NAMES[idx]);
}

/** Full weeks (start<=Monday AND end>=Friday of that week) charge a flat 5
 * days regardless of the person's actual working-day count that week (§6.1).
 * Anything shorter charges working days only, using the correct A/B pattern
 * for each date it touches. */
export function chargeDaysFor(
  consultant: ConsultantData,
  startDate: ISODate,
  endDate: ISODate,
  calendarByDate: Map<ISODate, CalendarDayData>
): number {
  const weekStarts = new Set<ISODate>();
  for (const date of eachDay(startDate, endDate)) weekStarts.add(mondayOfWeek(date));

  let total = 0;
  for (const weekStart of weekStarts) {
    const friday = addDays(weekStart, 4);
    const sunday = addDays(weekStart, 6);
    const fullyCovered = startDate <= weekStart && endDate >= friday;
    if (fullyCovered) {
      total += 5;
      continue;
    }
    const rangeStart = startDate > weekStart ? startDate : weekStart;
    const rangeEnd = endDate < sunday ? endDate : sunday;
    for (const date of eachDay(rangeStart, rangeEnd)) {
      if (isPatternWorkingDay(consultant, date, calendarByDate)) total += 1;
    }
  }
  return total;
}

/** Annual/study entitlement caps scale with employment fraction (§6.1) — the
 * three given data points (1.0->30/10, 0.8->24/8, 0.5->15/5) are all exactly
 * proportional, so a direct formula covers them (and any other fraction)
 * without a lookup table. */
export function entitlementCaps(employmentFraction: number): { annual: number; study: number } {
  return {
    annual: Math.round(30 * employmentFraction),
    study: Math.round(10 * employmentFraction),
  };
}
