// Steps 1-3 of §7.5: bank holiday weekends first (scarcest resource), then
// every ordinary weekend in one chronological pass.
//
// Weekends are placed in a single date-ordered pass (rather than "coupled
// group grabs its weekends first, greedily, from the earliest available
// slot") for two reasons the earlier greedy version got wrong in practice:
//   1. Greedily taking the chronologically-first eligible slot for whichever
//      person is processed first front-loads that person's whole year's
//      quota into the first few months instead of spreading it out.
//   2. It has no memory of how recently a person last held a weekend, so
//      nothing stopped the same person coming up again the very next week.
// Both are fixed here with an explicit minimum-gap constraint (§ operational
// requirement, not in the original spec text but confirmed with the user):
// nobody may hold two weekends/BH duties on consecutive Fridays (hard), and
// a 2-clear-weekend gap is preferred (soft, breaks near-ties in scoring).
//
// The other real cause of the imbalance: pairing two cardiac people on the
// same weekend "just happens" whenever the highest-deficit candidate for a
// slot turns out to be cardiac, since the old partner-picker only enforced
// cardiac cover when the FIRST pick wasn't cardiac. That silently consumed
// cardiac capacity faster than necessary and pushed a handful of cardiac
// people (see: Black, Ghent) far above their fair share. Partner selection
// now actively prefers a general partner whenever the first pick is cardiac,
// falling back to cardiac only if no eligible general candidate exists.

import { isEligible } from "./eligibility";
import { diffDays, type ISODate } from "./date-utils";
import type { BankHolidayWeekend, OrdinaryWeekend } from "./generator-facts";
import { getBankHolidayWeekends, getOrdinaryWeekends } from "./generator-facts";
import type { GenState } from "./generator-state";
import type { PersonTargets } from "./generator-targets";
import type { ConsultantData } from "./types";

const PLACEHOLDER_DUTY_ID = "__pending__";

// Never immediately-following week (2 weeks apart = adjacent Fridays 14 days
// apart = "back to back" in on-call terms is 1 week apart, i.e. gap 1 — so
// the hard floor of 2 forbids that). Soft preference nudges toward a full
// 2-clear-weekend gap (3 weeks apart) without overriding real deficit gaps.
const MIN_GAP_WEEKS_HARD = 2;
const MIN_GAP_WEEKS_SOFT = 3;
const GAP_SOFT_BONUS = 0.3;

type DutyFridaysByPerson = Map<string, ISODate[]>;

function weekGap(fridayA: ISODate, fridayB: ISODate): number {
  return Math.round(Math.abs(diffDays(fridayA, fridayB)) / 7);
}

function minGapWeeks(dutyFridays: ISODate[], candidateFriday: ISODate): number {
  if (dutyFridays.length === 0) return Infinity;
  let min = Infinity;
  for (const f of dutyFridays) {
    const g = weekGap(f, candidateFriday);
    if (g < min) min = g;
  }
  return min;
}

function recordDuty(byPerson: DutyFridaysByPerson, consultantId: string, friday: ISODate) {
  const list = byPerson.get(consultantId) ?? [];
  list.push(friday);
  byPerson.set(consultantId, list);
}

function canTakeOrdinaryWeekend(state: GenState, c: ConsultantData, w: OrdinaryWeekend): boolean {
  const opts = { weekendDutyId: PLACEHOLDER_DUTY_ID };
  return (
    isEligible(state.index, c, w.friday, "FIRST", opts) &&
    isEligible(state.index, c, w.saturday, "SECOND", opts) &&
    isEligible(state.index, c, w.sunday, "FIRST", opts)
  );
}

function canTakeBankHolidayLeg(state: GenState, c: ConsultantData, day1: string, day2: string): boolean {
  const opts = { weekendDutyId: PLACEHOLDER_DUTY_ID };
  return isEligible(state.index, c, day1, "FIRST", opts) && isEligible(state.index, c, day2, "SECOND", opts);
}

function weekendDeficit(state: GenState, targets: Map<string, PersonTargets>, id: string): number {
  return (targets.get(id)?.weekendExpected ?? 0) - state.weekendFractionTotal(id);
}

function bhDeficit(state: GenState, targets: Map<string, PersonTargets>, id: string): number {
  return (targets.get(id)?.bhExpected ?? 0) - state.bhFractionTotal(id);
}

/** Deficit is the primary sort key (fairness matters most); a healthy gap
 * since the person's last duty only breaks near-ties. */
function scoreCandidate(deficit: number, gapWeeks: number): number {
  return deficit + (gapWeeks >= MIN_GAP_WEEKS_SOFT ? GAP_SOFT_BONUS : 0);
}

function pickBest(pool: ConsultantData[], scoreFn: (c: ConsultantData) => number): ConsultantData | undefined {
  if (pool.length === 0) return undefined;
  return [...pool].sort((a, b) => {
    const d = scoreFn(b) - scoreFn(a);
    if (d !== 0) return d;
    return a.surname.localeCompare(b.surname);
  })[0];
}

/** Assigns 121 vs 212 to whichever pairing keeps both people's own running
 * 121/212 counts closer to even (§7.3) — the split doesn't change either
 * person's total weekend fraction, only their 1st/2nd on-call mix. */
function choose121or212(
  state: GenState,
  personX: ConsultantData,
  personY: ConsultantData
): { p121: ConsultantData; p212: ConsultantData } {
  const imbalance = (id: string, pattern: "121" | "212") => {
    const c121 = state.count121(id) + (pattern === "121" ? 1 : 0);
    const c212 = state.count212(id) + (pattern === "212" ? 1 : 0);
    return Math.abs(c121 - c212);
  };
  const scoreXFirst = imbalance(personX.id, "121") + imbalance(personY.id, "212");
  const scoreYFirst = imbalance(personX.id, "212") + imbalance(personY.id, "121");
  return scoreXFirst <= scoreYFirst ? { p121: personX, p212: personY } : { p121: personY, p212: personX };
}

// ---- Step 1: bank holiday weekends ----

function pickBhPartner(
  pool: ConsultantData[],
  primary: ConsultantData,
  state: GenState,
  targets: Map<string, PersonTargets>
): ConsultantData | undefined {
  let candidates = pool.filter((c) => c.id !== primary.id);
  if (primary.specialty === "CARDIAC") {
    const generalOnly = candidates.filter((c) => c.specialty === "GENERAL");
    if (generalOnly.length > 0) candidates = generalOnly;
  } else {
    candidates = candidates.filter((c) => c.specialty === "CARDIAC");
  }
  return pickBest(candidates, (c) => bhDeficit(state, targets, c.id));
}

function runBankHolidays(
  state: GenState,
  consultants: ConsultantData[],
  targets: Map<string, PersonTargets>,
  dutyFridaysByPerson: DutyFridaysByPerson
) {
  const blocks: BankHolidayWeekend[] = getBankHolidayWeekends(state.calendarState.calendarDays);

  for (const block of blocks) {
    const eligibleBase = consultants.filter((c) => !c.excludeFromBankHoliday && state.bhFractionTotal(c.id) < 0.5);

    // A/B: Friday+Saturday, must work that Friday (Friday-cohort eligibility).
    const abPool = eligibleBase.filter((c) => canTakeBankHolidayLeg(state, c, block.friday, block.saturday));
    const personA = pickBest(abPool, (c) => bhDeficit(state, targets, c.id));
    if (!personA) {
      state.warn(`Bank holiday ${block.friday}: no eligible person A found.`);
      continue;
    }
    let personB = pickBhPartner(abPool, personA, state, targets);
    if (!personB) {
      state.warn(`Bank holiday ${block.friday}: no cardiac-eligible person B found, relaxing cardiac requirement.`);
      personB = pickBest(
        abPool.filter((c) => c.id !== personA.id),
        (c) => bhDeficit(state, targets, c.id)
      );
    }
    if (!personB) {
      state.warn(`Bank holiday ${block.friday}: no eligible person B found.`);
      continue;
    }

    state.placeBankHolidayLeg("BH_A", block.friday, "FIRST", block.saturday, "SECOND", block.cohortWeekLabel, personA);
    state.placeBankHolidayLeg("BH_B", block.friday, "SECOND", block.saturday, "FIRST", block.cohortWeekLabel, personB);
    recordDuty(dutyFridaysByPerson, personA.id, block.friday);
    recordDuty(dutyFridaysByPerson, personB.id, block.friday);

    // C/D: Sunday+Monday, anybody (no Friday-working requirement, §4.5).
    const cdPool = eligibleBase.filter(
      (c) => c.id !== personA.id && c.id !== personB!.id && canTakeBankHolidayLeg(state, c, block.sunday, block.monday)
    );
    const personC = pickBest(cdPool, (c) => bhDeficit(state, targets, c.id));
    if (!personC) {
      state.warn(`Bank holiday ${block.friday}: no eligible person C found.`);
      continue;
    }
    let personD = pickBhPartner(cdPool, personC, state, targets);
    if (!personD) {
      state.warn(`Bank holiday ${block.friday}: no cardiac-eligible person D found, relaxing cardiac requirement.`);
      personD = pickBest(
        cdPool.filter((c) => c.id !== personC.id),
        (c) => bhDeficit(state, targets, c.id)
      );
    }
    if (!personD) {
      state.warn(`Bank holiday ${block.friday}: no eligible person D found.`);
      continue;
    }

    state.placeBankHolidayLeg("BH_C", block.sunday, "FIRST", block.monday, "SECOND", block.cohortWeekLabel, personC);
    state.placeBankHolidayLeg("BH_D", block.sunday, "SECOND", block.monday, "FIRST", block.cohortWeekLabel, personD);
    recordDuty(dutyFridaysByPerson, personC.id, block.friday);
    recordDuty(dutyFridaysByPerson, personD.id, block.friday);
  }
}

// ---- Steps 2 & 3 (unified): every ordinary weekend, one chronological pass ----

function pickPrimary(
  state: GenState,
  targets: Map<string, PersonTargets>,
  weekend: OrdinaryWeekend,
  consultants: ConsultantData[],
  dutyFridaysByPerson: DutyFridaysByPerson
): ConsultantData | undefined {
  const pool = consultants.filter(
    (c) =>
      canTakeOrdinaryWeekend(state, c, weekend) &&
      minGapWeeks(dutyFridaysByPerson.get(c.id) ?? [], weekend.friday) >= MIN_GAP_WEEKS_HARD
  );
  return pickBest(pool, (c) =>
    scoreCandidate(weekendDeficit(state, targets, c.id), minGapWeeks(dutyFridaysByPerson.get(c.id) ?? [], weekend.friday))
  );
}

function pickPartner(
  state: GenState,
  targets: Map<string, PersonTargets>,
  weekend: OrdinaryWeekend,
  consultants: ConsultantData[],
  primary: ConsultantData,
  dutyFridaysByPerson: DutyFridaysByPerson
): ConsultantData | undefined {
  let pool = consultants.filter(
    (c) =>
      c.id !== primary.id &&
      canTakeOrdinaryWeekend(state, c, weekend) &&
      minGapWeeks(dutyFridaysByPerson.get(c.id) ?? [], weekend.friday) >= MIN_GAP_WEEKS_HARD
  );
  if (primary.specialty === "CARDIAC") {
    // Prefer a general partner so cardiac capacity isn't consumed by two
    // cardiac people on the same weekend when it doesn't have to be.
    const generalOnly = pool.filter((c) => c.specialty === "GENERAL");
    if (generalOnly.length > 0) pool = generalOnly;
  } else {
    // Primary isn't cardiac, so cardiac cover requires the partner to be.
    pool = pool.filter((c) => c.specialty === "CARDIAC");
  }
  return pickBest(pool, (c) =>
    scoreCandidate(weekendDeficit(state, targets, c.id), minGapWeeks(dutyFridaysByPerson.get(c.id) ?? [], weekend.friday))
  );
}

function runOrdinaryWeekends(
  state: GenState,
  consultants: ConsultantData[],
  targets: Map<string, PersonTargets>,
  weekends: OrdinaryWeekend[],
  dutyFridaysByPerson: DutyFridaysByPerson
) {
  for (const weekend of weekends) {
    const personX = pickPrimary(state, targets, weekend, consultants, dutyFridaysByPerson);
    if (!personX) {
      state.warn(`Weekend ${weekend.friday}: no eligible person found (minimum gap or pattern constraints).`);
      continue;
    }
    let personY = pickPartner(state, targets, weekend, consultants, personX, dutyFridaysByPerson);
    if (!personY) {
      // Relax the gap constraint before giving up entirely — better a
      // slightly-too-soon repeat than an empty slot.
      const relaxedPool = consultants.filter(
        (c) => c.id !== personX.id && canTakeOrdinaryWeekend(state, c, weekend)
      );
      const cardiacNeeded = personX.specialty !== "CARDIAC";
      const filtered = cardiacNeeded ? relaxedPool.filter((c) => c.specialty === "CARDIAC") : relaxedPool;
      personY = pickBest(filtered.length > 0 ? filtered : relaxedPool, (c) => weekendDeficit(state, targets, c.id));
      if (personY) {
        state.warn(
          `Weekend ${weekend.friday}: relaxed the minimum weekend-gap for ${personY.surname} to fill ${personX.surname}'s partner slot.`
        );
      }
    }
    if (!personY) {
      state.warn(`Weekend ${weekend.friday}: no eligible partner found for ${personX.surname}.`);
      continue;
    }

    const { p121, p212 } = choose121or212(state, personX, personY);
    state.placeOrdinaryWeekendDuty(weekend.friday, weekend.saturday, weekend.sunday, weekend.cohortWeekLabel, p121, p212);
    recordDuty(dutyFridaysByPerson, personX.id, weekend.friday);
    recordDuty(dutyFridaysByPerson, personY.id, weekend.friday);
  }
}

export function runWeekendSteps(
  state: GenState,
  consultants: ConsultantData[],
  targets: Map<string, PersonTargets>
) {
  const onCall = consultants.filter((c) => c.callProportion > 0);
  const dutyFridaysByPerson: DutyFridaysByPerson = new Map();

  runBankHolidays(state, onCall, targets, dutyFridaysByPerson);

  const ordinaryWeekends = getOrdinaryWeekends(state.calendarState.calendarDays);
  runOrdinaryWeekends(state, onCall, targets, ordinaryWeekends, dutyFridaysByPerson);
}
