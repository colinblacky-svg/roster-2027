// Shared eligibility predicates used by both the generator and (conceptually)
// mirrored by validation.ts's rule checks. Kept separate from validation.ts
// because the generator asks "would this be allowed" prospectively, while
// validation.ts scans a finished state and reports what already happened.

import { addDays, type ISODate } from "./date-utils";
import { RosterIndex } from "./roster-index";
import type { ConsultantData, Position, Specialty } from "./types";

// Weekends (steps 1-3 of §7.5) are generated in one batch before any midweek
// call exists, so at that point a returner's real prior-call history is
// always empty regardless of the actual calendar date — counting prior
// SECOND-on-call midweek calls (as the maternity ramp rule literally
// describes) would wrongly bar them from every weekend all year. Midweek
// generation (steps 4-5) runs later, in full chronological order, so its own
// prior-call count IS accurate there. For weekend/BH eligibility specifically,
// fall back to a date-based proxy: assume the ramp clears a few weeks after
// first-eligibility, enough time for the person's own preferred-day rotation
// to have produced two midweek calls in the real world.
const RAMP_WEEKEND_HEURISTIC_DAYS = 21;

/** Would assigning `consultant` on `date` (as part of weekendDutyId, if any)
 * create an illegal consecutive-day run? Exempt only when the neighbouring
 * day's call shares the SAME non-null weekendDutyId (the Fri-Sat-Sun run and
 * the bank-holiday Sun-Mon pair are placed atomically under one id). */
function wouldBreakConsecutiveDay(
  index: RosterIndex,
  consultantId: string,
  date: ISODate,
  newWeekendDutyId: string | null
): boolean {
  const calls = index.assignmentsByConsultant.get(consultantId) ?? [];
  const prevDate = index.dayBefore(date);
  const nextDate = index.dayAfter(date);
  for (const neighborDate of [prevDate, nextDate]) {
    const neighbor = calls.find((c) => c.date === neighborDate);
    if (!neighbor) continue;
    const exempt = neighbor.weekendDutyId !== null && neighbor.weekendDutyId === newWeekendDutyId;
    if (!exempt) return true;
  }
  return false;
}

function maternityRampCleared(
  index: RosterIndex,
  consultant: ConsultantData,
  date: ISODate,
  context: "weekend" | "midweek"
): boolean {
  if (!consultant.firstEligibleDate) return true;

  if (context === "weekend") {
    return date >= addDays(consultant.firstEligibleDate, RAMP_WEEKEND_HEURISTIC_DAYS);
  }

  const priorValidSecondCalls = (index.assignmentsByConsultant.get(consultant.id) ?? []).filter(
    (c) =>
      c.date < date &&
      c.date >= consultant.firstEligibleDate! &&
      c.position === "SECOND" &&
      c.weekendDutyId === null
  ).length;
  return priorValidSecondCalls >= 2;
}

export interface EligibilityOptions {
  /** The weekendDutyId this call would belong to, or null for an ordinary
   * midweek call. Needed to correctly exempt a duty's own internal days
   * from the consecutive-day check while still blocking adjacency to any
   * unrelated existing booking. */
  weekendDutyId: string | null;
}

export function isEligible(
  index: RosterIndex,
  consultant: ConsultantData,
  date: ISODate,
  position: Position,
  options: EligibilityOptions
): boolean {
  if (consultant.callProportion <= 0) return false;
  if (index.isOnLeave(consultant.id, date)) return false;

  if (consultant.firstEligibleDate && date < consultant.firstEligibleDate) return false; // 4-week exclusion

  const rampContext = options.weekendDutyId !== null ? "weekend" : "midweek";
  if (!maternityRampCleared(index, consultant, date, rampContext)) {
    if (position === "FIRST") return false;
    if (options.weekendDutyId !== null) return false;
  }

  if (!index.isBankHolidayMonday(date) && !index.isWorkingDay(consultant, date)) return false;

  const alreadyThatDay = (index.assignmentsByDate.get(date) ?? []).some(
    (a) => a.consultantId === consultant.id
  );
  if (alreadyThatDay) return false;

  if (wouldBreakConsecutiveDay(index, consultant.id, date, options.weekendDutyId)) return false;

  return true;
}

export function cardiacCoverOK(a: Specialty, b: Specialty): boolean {
  return a === "CARDIAC" || b === "CARDIAC";
}
