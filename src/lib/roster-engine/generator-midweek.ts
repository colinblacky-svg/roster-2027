// Steps 4 & 5 of §7.5: fill every weekday group's midweek calls by simple
// round-robin rotation through that preferred-day group. Running weekends
// first (steps 1-3) means the shared eligibility/consecutive-day check
// already excludes a coupled-group member from their own midweek day in any
// week they're doing the adjacent weekend — no separate bookkeeping needed,
// that skip just falls out of sequencing.
//
// Deliberately NOT deficit-scored against ledger targets — the point of this
// step is to let the natural cardiac-forced skew (§7.6) emerge, so step 7's
// correction pass has something real to work with.

import { cardiacCoverOK, isEligible } from "./eligibility";
import { getWeekdayDates } from "./generator-facts";
import type { GenState } from "./generator-state";
import type { CallWeekday, ConsultantData } from "./types";

function canTakeFirst(state: GenState, p: ConsultantData, date: string): boolean {
  return isEligible(state.index, p, date, "FIRST", { weekendDutyId: null });
}

function runGroupRotation(state: GenState, group: ConsultantData[], weekday: CallWeekday) {
  const dates = getWeekdayDates(state.calendarState.calendarDays, weekday);
  let queue = [...group].sort((a, b) => a.surname.localeCompare(b.surname));

  for (const date of dates) {
    // SECOND is the qualifying bar here — it's the least restrictive position
    // (a maternity returner mid-ramp can only take SECOND, never FIRST; using
    // "FIRST" as the pre-filter would wrongly exclude them from the day
    // entirely instead of just barring them from the FIRST slot).
    const eligibleInOrder = queue.filter((p) =>
      isEligible(state.index, p, date, "SECOND", { weekendDutyId: null })
    );
    if (eligibleInOrder.length < 2) {
      state.warn(`${weekday} ${date}: only ${eligibleInOrder.length} eligible group member(s) available.`);
      continue;
    }

    let chosen: [ConsultantData, ConsultantData] = [eligibleInOrder[0], eligibleInOrder[1]];
    let displaced: ConsultantData | null = null;

    if (!cardiacCoverOK(chosen[0].specialty, chosen[1].specialty)) {
      const replacement = eligibleInOrder.slice(2).find((p) => p.specialty === "CARDIAC");
      if (replacement) {
        displaced = chosen[1];
        chosen = [chosen[0], replacement];
      } else {
        state.warn(`${weekday} ${date}: no cardiac cover available among eligible group members.`);
      }
    }

    const [personX, personY] = chosen;
    const xCanFirst = canTakeFirst(state, personX, date);
    const yCanFirst = canTakeFirst(state, personY, date);

    let firstPerson: ConsultantData;
    let secondPerson: ConsultantData;
    if (xCanFirst && yCanFirst) {
      firstPerson = state.firstCount(personX.id) <= state.firstCount(personY.id) ? personX : personY;
      secondPerson = firstPerson === personX ? personY : personX;
    } else if (xCanFirst && !yCanFirst) {
      firstPerson = personX;
      secondPerson = personY;
    } else if (!xCanFirst && yCanFirst) {
      firstPerson = personY;
      secondPerson = personX;
    } else {
      state.warn(`${weekday} ${date}: neither ${personX.surname} nor ${personY.surname} can take 1st on call (maternity ramp).`);
      firstPerson = personX;
      secondPerson = personY;
    }
    state.placeMidweekCall(date, firstPerson, secondPerson);

    // Rotate: chosen pair go to the back; a displaced (bumped) member goes to
    // the very front so they get first refusal next available date.
    const chosenIds = new Set(chosen.map((p) => p.id));
    const rest = queue.filter((p) => !chosenIds.has(p.id) && p.id !== displaced?.id);
    queue = displaced ? [displaced, ...rest, ...chosen] : [...rest, ...chosen];
  }
}

export function runMidweekSteps(state: GenState, consultants: ConsultantData[]) {
  const onCall = consultants.filter((c) => c.callProportion > 0);
  const groupFor = (weekday: CallWeekday) => onCall.filter((c) => c.preferredDay === weekday);

  // Thursday and Monday first (§7.5 step 4 — they've just had their weekends
  // placed), then Tuesday and Wednesday (step 5 — unconstrained).
  runGroupRotation(state, groupFor("THU"), "THU");
  runGroupRotation(state, groupFor("MON"), "MON");
  runGroupRotation(state, groupFor("TUE"), "TUE");
  runGroupRotation(state, groupFor("WED"), "WED");
}
