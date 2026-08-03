// Pro-rated per-person targets the generator scores candidates against.
// Reuses computeLedger's pool-sizing/pro-rating math (§7.2) on an
// assignment-free snapshot, so the target numbers are guaranteed to match
// exactly what the Ledger tab itself will later report as "expected".

import { computeLedger } from "./ledger";
import type { CalendarDayData } from "./calendar";
import type { ConsultantData } from "./types";

export interface PersonTargets {
  midweekExpected: number;
  weekendExpected: number;
  expected121: number;
  expected212: number;
  bhExpected: number;
}

export function computeTargets(
  consultants: ConsultantData[],
  calendarDays: CalendarDayData[]
): Map<string, PersonTargets> {
  const rows = computeLedger({
    calendarDays,
    consultants,
    assignments: [],
    weekendDuties: [],
    leaveIntervals: [],
  });

  const targets = new Map<string, PersonTargets>();
  for (const row of rows) {
    const consultant = consultants.find((c) => c.id === row.consultantId);
    targets.set(row.consultantId, {
      midweekExpected: row.midweekExpected,
      weekendExpected: row.weekendExpected,
      expected121: row.weekendExpected / 2,
      expected212: row.weekendExpected / 2,
      bhExpected: consultant?.excludeFromBankHoliday ? 0 : 0.5,
    });
  }
  return targets;
}
