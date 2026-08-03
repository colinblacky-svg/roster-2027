// Steps 4 & 5 of §7.5: fill every weekday group's midweek calls via a
// proportion-weighted rotation through that preferred-day group. Running
// weekends first (steps 1-3) means the shared eligibility/consecutive-day
// check already excludes a coupled-group member from their own midweek day
// in any week they're doing the adjacent weekend — no separate bookkeeping
// needed, that skip just falls out of sequencing.
//
// Weighting is by EFFECTIVE proportion (callProportion scaled by the same
// year-availability fraction the Ledger uses, §7.2) — not raw callProportion.
// Each eligible person's "entitlement score" is their own turns-taken-so-far
// divided by their effective proportion, and whoever has the LOWEST score
// (least turns relative to their own fair rate) gets picked next. A 0.5-FTE
// person's score jumps by 1/0.5 = 2.0 each time they're picked (vs 1.0 for a
// full-timer), so they naturally wait proportionally longer between turns
// without needing any global target — this fixes a real bug where the
// previous plain "pop 2, requeue" rotation gave every group member an equal
// number of raw turns regardless of proportion, over-serving half-timers
// (Kong/Magee) and correspondingly under-serving full-timers in the same
// group (Saviani) in a way the step-7 correction pass couldn't fix
// afterwards (it only has secondary days to work with, and a person's
// secondary day doesn't always have safely swappable spare capacity —
// Saviani's only secondary is Tuesday, where the surplus belongs to the
// deliberately-placed Tuesday cardiac-relief people and can't be handed to a
// general person without breaking cover).
//
// Using EFFECTIVE rather than raw proportion matters specifically for
// mid-year maternity returners: a returner's score starts at 0 the moment
// they become eligible, same as everyone else's baseline, so they get an
// initial priority boost to help them catch up — but weighting by raw
// callProportion (1.0, same as a full-year colleague) let that catch-up
// burst overshoot their true fair share (which is lower, since they're only
// available for part of the year), and the step-7 correction pass would
// then claw the excess back off them in a scattered, uneven way. Dividing
// by effective proportion instead makes their score climb faster per turn,
// so the catch-up burst self-limits to roughly their real pro-rated share.
//
// This weighting is deliberately the ONLY correction happening here — the
// cardiac-forced skew (§7.6) is still left alone for step 7 to address,
// since forcing cardiac cover this week doesn't change what a fair NUMBER
// of turns looks like for anyone, only who's eligible to fill them.

import { cardiacCoverOK, isEligible } from "./eligibility";
import { getWeekdayDates } from "./generator-facts";
import { availabilityFraction } from "./ledger";
import type { GenState } from "./generator-state";
import type { CallWeekday, ConsultantData } from "./types";

function canTakeFirst(state: GenState, p: ConsultantData, date: string): boolean {
  return isEligible(state.index, p, date, "FIRST", { weekendDutyId: null });
}

function runGroupRotation(state: GenState, group: ConsultantData[], weekday: CallWeekday) {
  const dates = getWeekdayDates(state.calendarState.calendarDays, weekday);
  const turnsTaken = new Map<string, number>(group.map((p) => [p.id, 0]));
  const effectiveProportion = new Map<string, number>(
    group.map((p) => [p.id, p.callProportion * availabilityFraction(p.firstEligibleDate)])
  );
  const entitlementScore = (p: ConsultantData) => (turnsTaken.get(p.id) ?? 0) / (effectiveProportion.get(p.id) ?? 1);

  for (const date of dates) {
    // SECOND is the qualifying bar here — it's the least restrictive position
    // (a maternity returner mid-ramp can only take SECOND, never FIRST; using
    // "FIRST" as the pre-filter would wrongly exclude them from the day
    // entirely instead of just barring them from the FIRST slot).
    const eligible = group.filter((p) => isEligible(state.index, p, date, "SECOND", { weekendDutyId: null }));
    if (eligible.length < 2) {
      state.warn(`${weekday} ${date}: only ${eligible.length} eligible group member(s) available.`);
      continue;
    }

    const byEntitlement = [...eligible].sort((a, b) => {
      const d = entitlementScore(a) - entitlementScore(b); // ascending: least-served-so-far first
      if (d !== 0) return d;
      return a.surname.localeCompare(b.surname);
    });

    let chosen: [ConsultantData, ConsultantData] = [byEntitlement[0], byEntitlement[1]];

    if (!cardiacCoverOK(chosen[0].specialty, chosen[1].specialty)) {
      const replacement = byEntitlement.slice(2).find((p) => p.specialty === "CARDIAC");
      if (replacement) {
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

    for (const p of chosen) {
      turnsTaken.set(p.id, (turnsTaken.get(p.id) ?? 0) + 1);
    }
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
