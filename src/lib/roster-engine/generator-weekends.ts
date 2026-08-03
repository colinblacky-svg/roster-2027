// Steps 1-3 of §7.5: bank holiday weekends first (scarcest resource), then
// the Thursday/Monday coupled groups' weekends, then everything left over.

import { cardiacCoverOK, isEligible } from "./eligibility";
import type { BankHolidayWeekend, OrdinaryWeekend } from "./generator-facts";
import { getBankHolidayWeekends, getOrdinaryWeekends } from "./generator-facts";
import type { GenState } from "./generator-state";
import type { PersonTargets } from "./generator-targets";
import type { ConsultantData } from "./types";

const PLACEHOLDER_DUTY_ID = "__pending__";

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

function pickHighestDeficit(
  pool: ConsultantData[],
  deficitFn: (id: string) => number
): ConsultantData | undefined {
  if (pool.length === 0) return undefined;
  return [...pool].sort((a, b) => {
    const d = deficitFn(b.id) - deficitFn(a.id);
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

function placeWeekend(
  state: GenState,
  targets: Map<string, PersonTargets>,
  weekend: OrdinaryWeekend,
  personX: ConsultantData,
  personY: ConsultantData
) {
  const { p121, p212 } = choose121or212(state, personX, personY);
  state.placeOrdinaryWeekendDuty(weekend.friday, weekend.saturday, weekend.sunday, weekend.cohortWeekLabel, p121, p212);
}

// ---- Step 1: bank holiday weekends ----

function runBankHolidays(state: GenState, consultants: ConsultantData[], targets: Map<string, PersonTargets>) {
  const blocks = getBankHolidayWeekends(state.calendarState.calendarDays);

  for (const block of blocks) {
    const eligibleBase = consultants.filter((c) => !c.excludeFromBankHoliday && state.bhFractionTotal(c.id) < 0.5);

    // A/B: Friday+Saturday, must work that Friday (Friday-cohort eligibility).
    const abPool = eligibleBase.filter((c) => canTakeBankHolidayLeg(state, c, block.friday, block.saturday));
    const personA = pickHighestDeficit(abPool, (id) => bhDeficit(state, targets, id));
    if (!personA) {
      state.warn(`Bank holiday ${block.friday}: no eligible person A found.`);
      continue;
    }
    let abPool2 = abPool.filter((c) => c.id !== personA.id);
    if (personA.specialty !== "CARDIAC") abPool2 = abPool2.filter((c) => c.specialty === "CARDIAC");
    let personB = pickHighestDeficit(abPool2, (id) => bhDeficit(state, targets, id));
    if (!personB) {
      state.warn(`Bank holiday ${block.friday}: no cardiac-eligible person B found, relaxing cardiac requirement.`);
      personB = pickHighestDeficit(
        abPool.filter((c) => c.id !== personA.id),
        (id) => bhDeficit(state, targets, id)
      );
    }
    if (!personB) {
      state.warn(`Bank holiday ${block.friday}: no eligible person B found.`);
      continue;
    }

    state.placeBankHolidayLeg("BH_A", block.friday, "FIRST", block.saturday, "SECOND", block.cohortWeekLabel, personA);
    state.placeBankHolidayLeg("BH_B", block.friday, "SECOND", block.saturday, "FIRST", block.cohortWeekLabel, personB);

    // C/D: Sunday+Monday, anybody (no Friday-working requirement, §4.5).
    const cdPool = eligibleBase.filter(
      (c) => c.id !== personA.id && c.id !== personB!.id && canTakeBankHolidayLeg(state, c, block.sunday, block.monday)
    );
    const personC = pickHighestDeficit(cdPool, (id) => bhDeficit(state, targets, id));
    if (!personC) {
      state.warn(`Bank holiday ${block.friday}: no eligible person C found.`);
      continue;
    }
    let cdPool2 = cdPool.filter((c) => c.id !== personC.id);
    if (personC.specialty !== "CARDIAC") cdPool2 = cdPool2.filter((c) => c.specialty === "CARDIAC");
    let personD = pickHighestDeficit(cdPool2, (id) => bhDeficit(state, targets, id));
    if (!personD) {
      state.warn(`Bank holiday ${block.friday}: no cardiac-eligible person D found, relaxing cardiac requirement.`);
      personD = pickHighestDeficit(
        cdPool.filter((c) => c.id !== personC.id),
        (id) => bhDeficit(state, targets, id)
      );
    }
    if (!personD) {
      state.warn(`Bank holiday ${block.friday}: no eligible person D found.`);
      continue;
    }

    state.placeBankHolidayLeg("BH_C", block.sunday, "FIRST", block.monday, "SECOND", block.cohortWeekLabel, personC);
    state.placeBankHolidayLeg("BH_D", block.sunday, "SECOND", block.monday, "FIRST", block.cohortWeekLabel, personD);
  }
}

// ---- Steps 2 & 3: ordinary weekends ----

function pickPartner(
  state: GenState,
  targets: Map<string, PersonTargets>,
  weekend: OrdinaryWeekend,
  consultants: ConsultantData[],
  primary: ConsultantData
): ConsultantData | undefined {
  let pool = consultants.filter((c) => c.id !== primary.id && canTakeOrdinaryWeekend(state, c, weekend));
  if (primary.specialty !== "CARDIAC") {
    const cardiacPool = pool.filter((c) => c.specialty === "CARDIAC");
    if (cardiacPool.length > 0) pool = cardiacPool;
  }
  return pickHighestDeficit(pool, (id) => weekendDeficit(state, targets, id));
}

function runCoupledGroupWeekends(
  state: GenState,
  consultants: ConsultantData[],
  targets: Map<string, PersonTargets>,
  remaining: OrdinaryWeekend[]
) {
  const coupledGroup = consultants
    .filter((c) => c.preferredDay === "THU" || c.preferredDay === "MON")
    .sort((a, b) => (targets.get(b.id)?.weekendExpected ?? 0) - (targets.get(a.id)?.weekendExpected ?? 0));

  for (const person of coupledGroup) {
    const target = targets.get(person.id)?.weekendExpected ?? 0;
    let guard = 0;
    while (state.weekendFractionTotal(person.id) + 0.5 <= target && guard < remaining.length + 1) {
      guard++;
      const idx = remaining.findIndex((w) => canTakeOrdinaryWeekend(state, person, w));
      if (idx === -1) break;
      const weekend = remaining[idx];
      const partner = pickPartner(state, targets, weekend, consultants, person);
      if (!partner) break;
      placeWeekend(state, targets, weekend, person, partner);
      remaining.splice(idx, 1);
    }
  }
}

function runRemainingWeekends(
  state: GenState,
  consultants: ConsultantData[],
  targets: Map<string, PersonTargets>,
  remaining: OrdinaryWeekend[]
) {
  for (const weekend of remaining) {
    const pool = consultants.filter((c) => canTakeOrdinaryWeekend(state, c, weekend));
    const personX = pickHighestDeficit(pool, (id) => weekendDeficit(state, targets, id));
    if (!personX) {
      state.warn(`Weekend ${weekend.friday}: no eligible person X found.`);
      continue;
    }
    const personY = pickPartner(state, targets, weekend, consultants, personX);
    if (!personY) {
      state.warn(`Weekend ${weekend.friday}: no eligible partner found for ${personX.surname}.`);
      continue;
    }
    placeWeekend(state, targets, weekend, personX, personY);
  }
}

export function runWeekendSteps(
  state: GenState,
  consultants: ConsultantData[],
  targets: Map<string, PersonTargets>
) {
  const onCall = consultants.filter((c) => c.callProportion > 0);

  runBankHolidays(state, onCall, targets);

  const remaining = getOrdinaryWeekends(state.calendarState.calendarDays);
  runCoupledGroupWeekends(state, onCall, targets, remaining);
  runRemainingWeekends(state, onCall, targets, remaining);
}
