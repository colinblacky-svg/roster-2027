// §6.6: if a booked leave request covers a day the person holds a call, swap
// it to someone else, and make a reciprocal swap — the covering consultant
// hands back a call on another day to the original person. Weekend/BH duties
// are reassigned as a whole unit (no reciprocal attempted there — giving away
// an entire weekend in exchange would cascade into reassigning someone else's
// weekend too, out of scope for this pass).

import { isEligible } from "./eligibility";
import { RosterIndex } from "./roster-index";
import type { ISODate } from "./date-utils";
import type { CallWeekday, Position, RosterState } from "./types";

export interface SwapMutation {
  date: ISODate;
  position: Position;
  newConsultantId: string;
  /** Set when this mutation is one leg of a whole weekend/BH duty being
   * reassigned — the caller must also update WeekendDuty.consultantId for
   * this id, not just the Assignment rows, or the ledger and validation
   * (which key off the duty record) will disagree with the calendar. */
  weekendDutyId: string | null;
}

const WEEKDAY_MAP: Record<number, CallWeekday | null> = { 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 0: null, 5: null, 6: null };

function weekdayOf(date: ISODate): CallWeekday | null {
  return WEEKDAY_MAP[new Date(date).getUTCDay()] ?? null;
}

export function computeAutoSwapPlan(
  state: RosterState,
  consultantId: string,
  leaveStart: ISODate,
  leaveEnd: ISODate
): SwapMutation[] {
  const index = new RosterIndex(state);
  const person = state.consultants.find((c) => c.id === consultantId);
  if (!person) return [];

  const affected = state.assignments.filter(
    (a) => a.consultantId === consultantId && a.date >= leaveStart && a.date <= leaveEnd
  );
  const candidates = state.consultants.filter((c) => c.id !== consultantId && c.callProportion > 0);
  const mutations: SwapMutation[] = [];
  const handledDuties = new Set<string>();

  for (const a of affected) {
    if (a.weekendDutyId) {
      if (handledDuties.has(a.weekendDutyId)) continue;
      handledDuties.add(a.weekendDutyId);
      const dutyAssignments = state.assignments.filter((x) => x.weekendDutyId === a.weekendDutyId);
      const replacement = candidates.find((c) =>
        dutyAssignments.every((da) => isEligible(index, c, da.date, da.position, { weekendDutyId: a.weekendDutyId }))
      );
      if (replacement) {
        for (const da of dutyAssignments) {
          mutations.push({
            date: da.date,
            position: da.position,
            newConsultantId: replacement.id,
            weekendDutyId: a.weekendDutyId,
          });
        }
      }
      continue;
    }

    const replacement = candidates.find((c) => isEligible(index, c, a.date, a.position, { weekendDutyId: null }));
    if (!replacement) continue;
    mutations.push({ date: a.date, position: a.position, newConsultantId: replacement.id, weekendDutyId: null });

    // Reciprocal: give the original person back one of the replacement's own
    // midweek calls, on a day that's one of the original person's own
    // preferred/secondary days (§7.4's correction mechanism, applied here).
    const personDays = [person.preferredDay, ...person.secondaryDays].filter((d): d is CallWeekday => Boolean(d));
    const replacementCalls = state.assignments.filter(
      (x) => x.consultantId === replacement.id && x.weekendDutyId === null && x.date !== a.date
    );
    const reciprocal = replacementCalls.find((rc) => {
      const wd = weekdayOf(rc.date);
      if (!wd || !personDays.includes(wd)) return false;
      return isEligible(index, person, rc.date, rc.position, { weekendDutyId: null });
    });
    if (reciprocal) {
      mutations.push({
        date: reciprocal.date,
        position: reciprocal.position,
        newConsultantId: person.id,
        weekendDutyId: null,
      });
    }
  }

  return mutations;
}
