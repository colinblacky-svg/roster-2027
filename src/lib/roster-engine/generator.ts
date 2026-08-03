// generateRoster — orchestrates the seven-step algorithm from §7.5, in the
// order the spec insists on: weekends before midweek, because the
// consecutive-day rule (§5.1) makes them mutually exclusive for the
// Thursday and Monday groups. See the individual step modules for detail.

import { GenState } from "./generator-state";
import { computeLedger, type LedgerRow } from "./ledger";
import { runCorrectionStep } from "./generator-correction";
import { runMidweekSteps } from "./generator-midweek";
import { computeTargets } from "./generator-targets";
import { runWeekendSteps } from "./generator-weekends";
import type { CalendarDayData } from "./calendar";
import type { AssignmentData, ConsultantData, LeaveInterval, WeekendDutyData } from "./types";

export interface GeneratorResult {
  assignments: AssignmentData[];
  weekendDuties: WeekendDutyData[];
  warnings: string[];
  ledger: LedgerRow[];
}

export function generateRoster(
  consultants: ConsultantData[],
  calendarDays: CalendarDayData[],
  leaveIntervals: LeaveInterval[] = []
): GeneratorResult {
  const state = new GenState(consultants, {
    calendarDays,
    consultants,
    assignments: [],
    weekendDuties: [],
    leaveIntervals,
  });

  const targets = computeTargets(consultants, calendarDays);

  // 1-3: bank holidays, then coupled-group weekends, then everything left.
  runWeekendSteps(state, consultants, targets);

  // 4-5: Thursday/Monday midweek back-fill, then Tuesday/Wednesday.
  runMidweekSteps(state, consultants);

  // 6: measure (available mid-run for diagnostics; the returned ledger below
  // is the post-correction one, since that's what matters to the caller).

  // 7: correction pass.
  runCorrectionStep(state, consultants);

  const ledger = computeLedger(state.toRosterState());

  return {
    assignments: state.assignments,
    weekendDuties: state.weekendDuties,
    warnings: state.warnings,
    ledger,
  };
}
