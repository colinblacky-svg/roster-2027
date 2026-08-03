// The six §5 hard-constraint / red-alert rules, as pure functions over a
// RosterState. Alerts are advisory (§5): a manual edit that trips one still
// applies, but gets flagged. The generator must never knowingly produce one.

import type { ISODate } from "./date-utils";
import { RosterIndex } from "./roster-index";
import type { RosterState } from "./types";

export type ViolationRule =
  | "NOT_WORKING_DAY"
  | "ON_LEAVE"
  | "NO_CARDIAC_COVER"
  | "CONSECUTIVE_DAYS"
  | "WEEKEND_ADJACENT_LEAVE"
  | "MATERNITY_RAMP_BREACH";

export interface Violation {
  rule: ViolationRule;
  date: ISODate;
  consultantId?: string;
  message: string;
}

function surname(index: RosterIndex, consultantId: string): string {
  return index.consultantById.get(consultantId)?.surname ?? consultantId;
}

/** Rule 1: rostered on a day their A/B pattern has them OUT. Exempt: bank
 * holiday Mondays (§4.5 — persons C/D don't need to work Mondays). */
function checkNotWorkingDay(index: RosterIndex): Violation[] {
  const violations: Violation[] = [];
  for (const a of index.state.assignments) {
    if (!a.consultantId) continue;
    if (index.isBankHolidayMonday(a.date)) continue;
    const consultant = index.consultantById.get(a.consultantId);
    if (!consultant) continue;
    if (!index.isWorkingDay(consultant, a.date)) {
      violations.push({
        rule: "NOT_WORKING_DAY",
        date: a.date,
        consultantId: a.consultantId,
        message: `${surname(index, a.consultantId)} is rostered on ${a.date}, a day their pattern has them OUT.`,
      });
    }
  }
  return violations;
}

/** Rule 2: on leave that day (any leave type). */
function checkOnLeave(index: RosterIndex): Violation[] {
  const violations: Violation[] = [];
  for (const a of index.state.assignments) {
    if (!a.consultantId) continue;
    if (index.isOnLeave(a.consultantId, a.date)) {
      violations.push({
        rule: "ON_LEAVE",
        date: a.date,
        consultantId: a.consultantId,
        message: `${surname(index, a.consultantId)} is on leave on ${a.date} but is rostered on call.`,
      });
    }
  }
  return violations;
}

/** Rule 3: neither person on call that day is cardiac. */
function checkCardiacCover(index: RosterIndex): Violation[] {
  const violations: Violation[] = [];
  for (const [date, dayAssignments] of index.assignmentsByDate) {
    const first = dayAssignments.find((a) => a.position === "FIRST");
    const second = dayAssignments.find((a) => a.position === "SECOND");
    if (!first?.consultantId || !second?.consultantId) continue; // incomplete day, nothing to check yet
    const firstSpecialty = index.consultantById.get(first.consultantId)?.specialty;
    const secondSpecialty = index.consultantById.get(second.consultantId)?.specialty;
    if (firstSpecialty !== "CARDIAC" && secondSpecialty !== "CARDIAC") {
      violations.push({
        rule: "NO_CARDIAC_COVER",
        date,
        message: `No cardiac cover on ${date}: neither ${surname(index, first.consultantId)} nor ${surname(index, second.consultantId)} is cardiac.`,
      });
    }
  }
  return violations;
}

/** Rule 4: consecutive days on call. Exempt: Fri-Sat-Sun weekend run and the
 * Sun-Mon bank-holiday pair — both identified by sharing one weekendDutyId. */
function checkConsecutiveDays(index: RosterIndex): Violation[] {
  const violations: Violation[] = [];
  for (const [consultantId, list] of index.assignmentsByConsultant) {
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (index.dayAfter(a.date) !== b.date) continue; // not actually adjacent dates
      const exempt = a.weekendDutyId !== null && a.weekendDutyId === b.weekendDutyId;
      if (!exempt) {
        violations.push({
          rule: "CONSECUTIVE_DAYS",
          date: b.date,
          consultantId,
          message: `${surname(index, consultantId)} is on call on consecutive days ${a.date} and ${b.date}.`,
        });
      }
    }
  }
  return violations;
}

/** Rule 5: holds a weekend/BH duty and has any leave immediately before or
 * after it (§5.5) — a single day off counts as much as a full week. */
function checkWeekendAdjacentLeave(index: RosterIndex): Violation[] {
  const violations: Violation[] = [];
  const assignmentsByDuty = new Map<string, ISODate[]>();
  for (const a of index.state.assignments) {
    if (!a.weekendDutyId) continue;
    const list = assignmentsByDuty.get(a.weekendDutyId) ?? [];
    list.push(a.date);
    assignmentsByDuty.set(a.weekendDutyId, list);
  }

  for (const [dutyId, dates] of assignmentsByDuty) {
    const duty = index.weekendDutyById.get(dutyId);
    if (!duty) continue;
    const sorted = [...dates].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const before = index.dayBefore(first);
    const after = index.dayAfter(last);
    if (index.hasLeaveOnAnyOf(duty.consultantId, [before, after])) {
      violations.push({
        rule: "WEEKEND_ADJACENT_LEAVE",
        date: first,
        consultantId: duty.consultantId,
        message: `${surname(index, duty.consultantId)} holds a duty ${first}-${last} adjacent to leave on ${before} or ${after}.`,
      });
    }
  }
  return violations;
}

/** Rule 6: a maternity returner rostered inside their 4-week exclusion, or
 * given 1st-on-call / a weekend before completing two 2nd-on-calls (§2.2). */
function checkMaternityRamp(index: RosterIndex): Violation[] {
  const violations: Violation[] = [];
  for (const consultant of index.state.consultants) {
    if (!consultant.firstEligibleDate) continue;
    const eligibleFrom = consultant.firstEligibleDate;
    const calls = index.assignmentsByConsultant.get(consultant.id) ?? [];

    for (const a of calls) {
      if (a.date < eligibleFrom) {
        violations.push({
          rule: "MATERNITY_RAMP_BREACH",
          date: a.date,
          consultantId: consultant.id,
          message: `${consultant.surname} is rostered on ${a.date}, before their maternity return exclusion clears on ${eligibleFrom}.`,
        });
        continue;
      }

      const priorValidSecondCalls = calls.filter(
        (c) => c.date < a.date && c.date >= eligibleFrom && c.position === "SECOND" && c.weekendDutyId === null
      ).length;
      if (priorValidSecondCalls >= 2) continue;

      const reasons: string[] = [];
      if (a.position === "FIRST") reasons.push("1st on call");
      if (a.weekendDutyId !== null) reasons.push("a weekend/bank-holiday duty");
      if (reasons.length > 0) {
        violations.push({
          rule: "MATERNITY_RAMP_BREACH",
          date: a.date,
          consultantId: consultant.id,
          message: `${consultant.surname} is given ${reasons.join(" and ")} on ${a.date} before completing two 2nd-on-calls since returning from maternity leave.`,
        });
      }
    }
  }
  return violations;
}

export function validateRoster(state: RosterState): Violation[] {
  const index = new RosterIndex(state);
  return [
    ...checkNotWorkingDay(index),
    ...checkOnLeave(index),
    ...checkCardiacCover(index),
    ...checkConsecutiveDays(index),
    ...checkWeekendAdjacentLeave(index),
    ...checkMaternityRamp(index),
  ];
}
