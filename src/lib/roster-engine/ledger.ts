// The Ledger — expected vs actual call counts, per §8. Built as the
// measurement instrument the generator (phase 5) checks itself against and
// the interaction layer (phase 7) recomputes live on every edit.

import { diffDays, isoWeekday } from "./date-utils";
import { RosterIndex } from "./roster-index";
import type { RosterState, Specialty } from "./types";

const YEAR_START = "2027-01-01";
const YEAR_END = "2027-12-31";
const YEAR_DAYS = diffDays(YEAR_END, YEAR_START) + 1; // 365

// A variance is called out on the ledger once it drifts this many calls (or
// this many weekend-fraction units) away from target. Not specified exactly
// by the spec ("highlighted when material") — chosen as a readable default.
const MATERIALITY_THRESHOLD = 2;

export interface LedgerRow {
  consultantId: string;
  surname: string;
  specialty: Specialty;
  callProportion: number;
  availabilityFraction: number;
  expectedTotal: number;
  actualTotal: number;
  firstCount: number;
  secondCount: number;
  midweekExpected: number;
  midweekActual: number;
  weekendExpected: number;
  weekendActual: number;
  count121: number;
  count212: number;
  variance: number;
  materialVariance: boolean;
}

/** Fraction of 2027 the person is available for call, per §7.2 — runs from
 * first-eligible-for-call, not return-to-work (the 4-week exclusion is
 * unavailable time). 1.0 for anyone without a maternity return. */
function availabilityFraction(firstEligibleDate: string | null): number {
  if (!firstEligibleDate) return 1.0;
  if (firstEligibleDate <= YEAR_START) return 1.0;
  if (firstEligibleDate > YEAR_END) return 0.0;
  const daysAvailable = diffDays(YEAR_END, firstEligibleDate) + 1;
  return daysAvailable / YEAR_DAYS;
}

export function computeLedger(state: RosterState): LedgerRow[] {
  const index = new RosterIndex(state);
  const onCall = state.consultants.filter((c) => c.callProportion > 0);

  const effectiveProportion = new Map<string, number>();
  for (const c of onCall) {
    effectiveProportion.set(c.id, c.callProportion * availabilityFraction(c.firstEligibleDate));
  }
  const sumEffective = [...effectiveProportion.values()].reduce((a, b) => a + b, 0);

  // Structural pool sizes, derived from the calendar itself rather than
  // hardcoded, so they stay correct if the calendar module ever changes.
  const inScopeDays = state.calendarDays.filter((d) => d.date <= YEAR_END && d.inGeneratorScope);
  const totalMidweekSlots = inScopeDays.filter((d) => isoWeekday(d.date) <= 3).length * 2; // Mon-Thu, 2 positions
  const ordinaryWeekendCount = inScopeDays.filter(
    (d) => isoWeekday(d.date) === 4 && !d.bankHolidayBlockId
  ).length; // Fridays => §7.3's 44
  const bankHolidayBlockCount = new Set(
    state.calendarDays.filter((d) => d.bankHolidayBlockId).map((d) => d.bankHolidayBlockId)
  ).size;
  // Each ordinary weekend distributes 2.0 total fraction (2 people x 1.0);
  // each BH weekend also distributes 2.0 total (4 people x 0.5).
  const totalWeekendFractionPool = ordinaryWeekendCount * 2.0 + bankHolidayBlockCount * 2.0;

  const ratio = sumEffective > 0 ? 1 / sumEffective : 0;

  const rows: LedgerRow[] = onCall
    .map((c) => {
      const eff = effectiveProportion.get(c.id) ?? 0;
      const share = eff * ratio;

      const calls = (index.assignmentsByConsultant.get(c.id) ?? []).filter((a) => a.date <= YEAR_END);
      const firstCount = calls.filter((a) => a.position === "FIRST").length;
      const secondCount = calls.filter((a) => a.position === "SECOND").length;
      const midweekActual = calls.filter((a) => a.weekendDutyId === null).length;

      const dutyIds = new Set(calls.filter((a) => a.weekendDutyId).map((a) => a.weekendDutyId as string));
      let weekendActual = 0;
      let count121 = 0;
      let count212 = 0;
      for (const dutyId of dutyIds) {
        const duty = index.weekendDutyById.get(dutyId);
        if (!duty) continue;
        weekendActual += duty.fraction;
        if (duty.pattern === "ORD_121") count121++;
        if (duty.pattern === "ORD_212") count212++;
      }

      const midweekExpected = totalMidweekSlots * share;
      const weekendExpected = totalWeekendFractionPool * share;
      const expectedTotal = midweekExpected + weekendExpected;
      const actualTotal = midweekActual + weekendActual;
      const variance = actualTotal - expectedTotal;

      return {
        consultantId: c.id,
        surname: c.surname,
        specialty: c.specialty,
        callProportion: c.callProportion,
        availabilityFraction: availabilityFraction(c.firstEligibleDate),
        expectedTotal,
        actualTotal,
        firstCount,
        secondCount,
        midweekExpected,
        midweekActual,
        weekendExpected,
        weekendActual,
        count121,
        count212,
        variance,
        materialVariance: Math.abs(variance) >= MATERIALITY_THRESHOLD,
      } satisfies LedgerRow;
    })
    .sort((a, b) => a.surname.localeCompare(b.surname));

  return rows;
}
