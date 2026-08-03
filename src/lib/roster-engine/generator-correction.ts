// Step 7 of §7.5: correction pass. Moves midweek calls onto secondary days to
// level the ledgers, using two mechanisms:
//
//  1. An explicit, deterministic seed rule for the named Tuesday cardiac
//     relief route (§7.6) — made concrete rather than left to hope generic
//     search finds it.
//  2. A bounded hill-climb that searches for further secondary-day midweek
//     swaps reducing midweek variance, never touching weekend/BH duties
//     (§7.1 — weekend and midweek ledgers are never traded against each
//     other, so this pass only ever proposes midweek-for-midweek moves).

import { cardiacCoverOK, isEligible } from "./eligibility";
import { getWeekdayDates } from "./generator-facts";
import { computeLedger } from "./ledger";
import { validateRoster } from "./validation";
import type { GenState } from "./generator-state";
import type { CallWeekday, ConsultantData } from "./types";

const TUESDAY_RELIEF_SURNAMES = ["Black", "Doyle", "Cronly"];
const TUESDAY_RELIEF_QUOTA = 10;

function runTuesdayCardiacRelief(state: GenState, consultants: ConsultantData[]) {
  const reliefPersons = TUESDAY_RELIEF_SURNAMES.map((s) => consultants.find((c) => c.surname === s)).filter(
    (c): c is ConsultantData => Boolean(c)
  );
  if (reliefPersons.length === 0) return;

  const tuesdayDates = getWeekdayDates(state.calendarState.calendarDays, "TUE");
  let shed = 0;

  for (const date of tuesdayDates) {
    if (shed >= TUESDAY_RELIEF_QUOTA) break;
    const dayAssignments = state.index.assignmentsByDate.get(date) ?? [];
    const candidateSlot = dayAssignments.find((a) => {
      if (!a.consultantId || a.weekendDutyId !== null) return false;
      const c = consultants.find((x) => x.id === a.consultantId);
      return c?.preferredDay === "TUE" && c.specialty === "CARDIAC" && !TUESDAY_RELIEF_SURNAMES.includes(c.surname);
    });
    if (!candidateSlot) continue;

    for (const relief of reliefPersons) {
      if (!relief.secondaryDays.includes("TUE")) continue;
      const alreadyBooked = dayAssignments.some((a) => a.consultantId === relief.id);
      if (alreadyBooked) continue;
      if (!isEligible(state.index, relief, date, candidateSlot.position, { weekendDutyId: null })) continue;

      const otherPosition = candidateSlot.position === "FIRST" ? "SECOND" : "FIRST";
      const other = dayAssignments.find((a) => a.position === otherPosition);
      const otherSpecialty = consultants.find((c) => c.id === other?.consultantId)?.specialty ?? "GENERAL";
      if (!cardiacCoverOK(otherSpecialty, relief.specialty)) continue;

      state.replaceMidweekConsultant(date, candidateSlot.position, relief.id);
      shed++;
      break;
    }
  }
}

const MAX_ITERATIONS = 300;
const CANDIDATE_WINDOW = 6;

function weekdayOf(date: string, calendarDays: { date: string }[]): CallWeekday | null {
  const idx = new Date(date).getUTCDay();
  const map: Record<number, CallWeekday | null> = { 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 0: null, 5: null, 6: null };
  return map[idx] ?? null;
}

/** Bounded hill-climb: repeatedly looks for one secondary-day midweek swap
 * that reduces total midweek variance cost, applies it, and stops once no
 * improving swap is found or the iteration cap is hit. */
function runGenericMidweekCorrection(state: GenState, consultants: ConsultantData[]) {
  const onCall = consultants.filter((c) => c.callProportion > 0);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const ledger = computeLedger({
      calendarDays: state.calendarState.calendarDays,
      consultants,
      assignments: state.assignments,
      weekendDuties: state.weekendDuties,
      leaveIntervals: state.calendarState.leaveIntervals,
    });
    const byId = new Map(ledger.map((r) => [r.consultantId, r]));

    const overServed = [...ledger]
      .filter((r) => r.midweekActual - r.midweekExpected > 0.5)
      .sort((a, b) => b.midweekActual - b.midweekExpected - (a.midweekActual - a.midweekExpected))
      .slice(0, CANDIDATE_WINDOW);
    const underServed = [...ledger]
      .filter((r) => r.midweekActual - r.midweekExpected < -0.5)
      .sort((a, b) => a.midweekActual - a.midweekExpected - (b.midweekActual - b.midweekExpected))
      .slice(0, CANDIDATE_WINDOW);

    let appliedSwap = false;

    outer: for (const over of overServed) {
      const overCalls = state.assignments.filter((a) => a.consultantId === over.consultantId && a.weekendDutyId === null);
      for (const under of underServed) {
        if (under.consultantId === over.consultantId) continue;
        const underPerson = onCall.find((c) => c.id === under.consultantId);
        if (!underPerson || underPerson.secondaryDays.length === 0) continue;

        for (const call of overCalls) {
          const weekday = weekdayOf(call.date, state.calendarState.calendarDays);
          if (!weekday || !underPerson.secondaryDays.includes(weekday)) continue;
          if (!isEligible(state.index, underPerson, call.date, call.position, { weekendDutyId: null })) continue;

          const otherPosition = call.position === "FIRST" ? "SECOND" : "FIRST";
          const otherAssignment = state.index.assignmentsByDate.get(call.date)?.find((a) => a.position === otherPosition);
          const otherSpecialty = onCall.find((c) => c.id === otherAssignment?.consultantId)?.specialty ?? "GENERAL";
          if (!cardiacCoverOK(otherSpecialty, underPerson.specialty)) continue;

          const costBefore =
            (byId.get(over.consultantId)!.midweekActual - byId.get(over.consultantId)!.midweekExpected) ** 2 +
            (byId.get(under.consultantId)!.midweekActual - byId.get(under.consultantId)!.midweekExpected) ** 2;
          const costAfter =
            (over.midweekActual - 1 - over.midweekExpected) ** 2 + (under.midweekActual + 1 - under.midweekExpected) ** 2;
          if (costAfter >= costBefore) continue;

          state.replaceMidweekConsultant(call.date, call.position, underPerson.id);
          appliedSwap = true;
          break outer;
        }
      }
    }

    if (!appliedSwap) break;
  }
}

// ---- Maternity ramp cleanup ----
//
// Weekend placement (steps 1-3) runs before any midweek call exists, so a
// returner's maternity-ramp clearance can only be estimated there (see the
// heuristic in eligibility.ts) — it's a real approximation, not a precise
// count. This pass re-validates the finished roster against the same six
// §5 rules the Ledger/Calendar tabs use and, for any residual
// MATERNITY_RAMP_BREACH the heuristic missed, reassigns that specific slot
// (or the whole weekend/BH duty it belongs to) to someone else eligible.

const MAX_RAMP_FIX_PASSES = 40;

function findMidweekReplacement(state: GenState, consultants: ConsultantData[], date: string, position: "FIRST" | "SECOND", exclude: ConsultantData) {
  return consultants
    .filter((c) => c.callProportion > 0 && c.id !== exclude.id)
    .find((c) => isEligible(state.index, c, date, position, { weekendDutyId: null }));
}

function findWeekendDutyReplacement(
  state: GenState,
  consultants: ConsultantData[],
  dutyId: string,
  dutyAssignments: { date: string; position: "FIRST" | "SECOND" }[],
  exclude: ConsultantData
) {
  return consultants
    .filter((c) => c.callProportion > 0 && c.id !== exclude.id)
    .find((c) => dutyAssignments.every((a) => isEligible(state.index, c, a.date, a.position, { weekendDutyId: dutyId })));
}

function fixMaternityRampViolations(state: GenState, consultants: ConsultantData[]) {
  for (let pass = 0; pass < MAX_RAMP_FIX_PASSES; pass++) {
    const violations = validateRoster(state.toRosterState()).filter((v) => v.rule === "MATERNITY_RAMP_BREACH");
    if (violations.length === 0) return;

    const violation = violations[0];
    const returner = consultants.find((c) => c.id === violation.consultantId);
    if (!returner) break;

    const dayAssignments = state.assignments.filter(
      (a) => a.date === violation.date && a.consultantId === returner.id
    );
    let fixedAny = false;

    for (const a of dayAssignments) {
      if (a.weekendDutyId) {
        const dutyAssignments = state.assignments
          .filter((x) => x.weekendDutyId === a.weekendDutyId)
          .map((x) => ({ date: x.date, position: x.position }));
        const replacement = findWeekendDutyReplacement(state, consultants, a.weekendDutyId, dutyAssignments, returner);
        if (replacement) {
          state.reassignWeekendDuty(a.weekendDutyId, replacement.id);
          fixedAny = true;
        } else {
          state.warn(`Maternity ramp: no replacement found for ${returner.surname}'s duty on ${violation.date}.`);
        }
      } else {
        const replacement = findMidweekReplacement(state, consultants, a.date, a.position, returner);
        if (replacement) {
          state.replaceMidweekConsultant(a.date, a.position, replacement.id);
          fixedAny = true;
        } else {
          state.warn(`Maternity ramp: no midweek replacement found for ${returner.surname} on ${violation.date}.`);
        }
      }
    }

    if (!fixedAny) break;
  }
}

export function runCorrectionStep(state: GenState, consultants: ConsultantData[]) {
  fixMaternityRampViolations(state, consultants);
  runTuesdayCardiacRelief(state, consultants);
  runGenericMidweekCorrection(state, consultants);
  // Balancing swaps above can occasionally reshuffle a returner's calls in a
  // way that reopens a ramp violation — sweep once more to be sure.
  fixMaternityRampViolations(state, consultants);
}
