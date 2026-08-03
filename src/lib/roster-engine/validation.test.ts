import { describe, expect, it } from "vitest";
import { validateRoster } from "./validation";
import type {
  AssignmentData,
  CallWeekday,
  ConsultantData,
  LeaveInterval,
  RosterState,
  WeekendDutyData,
  WeekPattern,
} from "./types";
import type { CalendarDayData } from "./calendar";
import { buildCalendar2027 } from "./calendar";

const ALL_IN: WeekPattern = [true, true, true, true, true];
const ALL_OUT: WeekPattern = [false, false, false, false, false];

function consultant(overrides: Partial<ConsultantData> & { id: string; surname: string }): ConsultantData {
  return {
    specialty: "GENERAL",
    callProportion: 1.0,
    employmentFraction: 1.0,
    weekAPattern: ALL_IN,
    weekBPattern: ALL_IN,
    preferredDay: null as CallWeekday | null,
    secondaryDays: [],
    returnToWorkDate: null,
    firstEligibleDate: null,
    excludeFromBankHoliday: false,
    ...overrides,
  };
}

function assignment(overrides: Partial<AssignmentData> & { date: string; consultantId: string }): AssignmentData {
  return {
    position: "FIRST",
    weekendDutyId: null,
    source: "MANUAL",
    ...overrides,
  };
}

// Real calendar days, sliced to what fixtures need — real week labels and
// bank-holiday-block flags matter for a couple of the rule checks.
const REAL_CALENDAR = buildCalendar2027().days;
function calendarDaysFor(dates: string[]): CalendarDayData[] {
  const byDate = new Map(REAL_CALENDAR.map((d) => [d.date, d]));
  return dates.map((d) => {
    const found = byDate.get(d);
    if (!found) throw new Error(`no calendar day for ${d}`);
    return found;
  });
}

function baseState(overrides: Partial<RosterState> = {}): RosterState {
  return {
    calendarDays: [],
    consultants: [],
    assignments: [],
    weekendDuties: [],
    leaveIntervals: [],
    ...overrides,
  };
}

describe("validateRoster — rule 1: not a working day", () => {
  it("flags a consultant assigned on a day their pattern has them OUT", () => {
    // 2027-01-05 (Tue) is Week A.
    const c = consultant({ id: "c1", surname: "Test", weekAPattern: ALL_OUT });
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-01-05"]),
      consultants: [c],
      assignments: [assignment({ date: "2027-01-05", consultantId: "c1" })],
    });
    const violations = validateRoster(state);
    expect(violations.some((v) => v.rule === "NOT_WORKING_DAY")).toBe(true);
  });

  it("does not flag a bank holiday Monday even if the pattern has them OUT that day", () => {
    // 2027-02-01 is the Monday of the St Brigid's bank holiday block.
    const c = consultant({ id: "c1", surname: "Test", weekAPattern: ALL_OUT });
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-02-01"]),
      consultants: [c],
      assignments: [assignment({ date: "2027-02-01", consultantId: "c1", position: "SECOND", weekendDutyId: "bh1" })],
      weekendDuties: [{ id: "bh1", pattern: "BH_D", consultantId: "c1", fraction: 0.5, cohortWeekLabel: "A" }],
    });
    const violations = validateRoster(state);
    expect(violations.some((v) => v.rule === "NOT_WORKING_DAY")).toBe(false);
  });
});

describe("validateRoster — rule 2: on leave", () => {
  it("flags a consultant rostered while on leave", () => {
    const c = consultant({ id: "c1", surname: "Test" });
    const leave: LeaveInterval = { consultantId: "c1", startDate: "2027-01-04", endDate: "2027-01-08" };
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-01-05"]),
      consultants: [c],
      assignments: [assignment({ date: "2027-01-05", consultantId: "c1" })],
      leaveIntervals: [leave],
    });
    expect(validateRoster(state).some((v) => v.rule === "ON_LEAVE")).toBe(true);
  });

  it("does not flag a day outside the leave interval", () => {
    const c = consultant({ id: "c1", surname: "Test" });
    const leave: LeaveInterval = { consultantId: "c1", startDate: "2027-01-04", endDate: "2027-01-04" };
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-01-05"]),
      consultants: [c],
      assignments: [assignment({ date: "2027-01-05", consultantId: "c1" })],
      leaveIntervals: [leave],
    });
    expect(validateRoster(state).some((v) => v.rule === "ON_LEAVE")).toBe(false);
  });
});

describe("validateRoster — rule 3: cardiac cover", () => {
  it("flags a day where neither position is cardiac", () => {
    const c1 = consultant({ id: "c1", surname: "Gen1", specialty: "GENERAL" });
    const c2 = consultant({ id: "c2", surname: "Gen2", specialty: "GENERAL" });
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-01-05"]),
      consultants: [c1, c2],
      assignments: [
        assignment({ date: "2027-01-05", consultantId: "c1", position: "FIRST" }),
        assignment({ date: "2027-01-05", consultantId: "c2", position: "SECOND" }),
      ],
    });
    expect(validateRoster(state).some((v) => v.rule === "NO_CARDIAC_COVER")).toBe(true);
  });

  it("does not flag a day where one position is cardiac", () => {
    const c1 = consultant({ id: "c1", surname: "Card1", specialty: "CARDIAC" });
    const c2 = consultant({ id: "c2", surname: "Gen2", specialty: "GENERAL" });
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-01-05"]),
      consultants: [c1, c2],
      assignments: [
        assignment({ date: "2027-01-05", consultantId: "c1", position: "FIRST" }),
        assignment({ date: "2027-01-05", consultantId: "c2", position: "SECOND" }),
      ],
    });
    expect(validateRoster(state).some((v) => v.rule === "NO_CARDIAC_COVER")).toBe(false);
  });

  it("does not flag an incomplete day (only one slot filled)", () => {
    const c1 = consultant({ id: "c1", surname: "Gen1", specialty: "GENERAL" });
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-01-05"]),
      consultants: [c1],
      assignments: [assignment({ date: "2027-01-05", consultantId: "c1", position: "FIRST" })],
    });
    expect(validateRoster(state).some((v) => v.rule === "NO_CARDIAC_COVER")).toBe(false);
  });
});

describe("validateRoster — rule 4: consecutive days", () => {
  it("flags two consecutive days on call from different duties", () => {
    // Thursday call (midweek) followed by that week's weekend, §5.1's structural case.
    const c = consultant({ id: "c1", surname: "Test" });
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-01-07", "2027-01-08"]), // Thu, Fri
      consultants: [c],
      assignments: [
        assignment({ date: "2027-01-07", consultantId: "c1", weekendDutyId: null }),
        assignment({ date: "2027-01-08", consultantId: "c1", weekendDutyId: "wd1" }),
      ],
      weekendDuties: [{ id: "wd1", pattern: "ORD_121", consultantId: "c1", fraction: 1, cohortWeekLabel: "A" }],
    });
    expect(validateRoster(state).some((v) => v.rule === "CONSECUTIVE_DAYS")).toBe(true);
  });

  it("does not flag a Fri-Sat-Sun weekend run sharing one weekendDutyId", () => {
    const c = consultant({ id: "c1", surname: "Test" });
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-01-08", "2027-01-09", "2027-01-10"]), // Fri Sat Sun
      consultants: [c],
      assignments: [
        assignment({ date: "2027-01-08", consultantId: "c1", position: "FIRST", weekendDutyId: "wd1" }),
        assignment({ date: "2027-01-09", consultantId: "c1", position: "SECOND", weekendDutyId: "wd1" }),
        assignment({ date: "2027-01-10", consultantId: "c1", position: "FIRST", weekendDutyId: "wd1" }),
      ],
      weekendDuties: [{ id: "wd1", pattern: "ORD_121", consultantId: "c1", fraction: 1, cohortWeekLabel: "A" }],
    });
    expect(validateRoster(state).some((v) => v.rule === "CONSECUTIVE_DAYS")).toBe(false);
  });

  it("does not flag a bank-holiday Sun-Mon pair sharing one weekendDutyId", () => {
    const c = consultant({ id: "c1", surname: "Test" });
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-01-31", "2027-02-01"]), // Sun, Mon (St Brigid's block)
      consultants: [c],
      assignments: [
        assignment({ date: "2027-01-31", consultantId: "c1", position: "FIRST", weekendDutyId: "bhD" }),
        assignment({ date: "2027-02-01", consultantId: "c1", position: "SECOND", weekendDutyId: "bhD" }),
      ],
      weekendDuties: [{ id: "bhD", pattern: "BH_D", consultantId: "c1", fraction: 0.5, cohortWeekLabel: "A" }],
    });
    expect(validateRoster(state).some((v) => v.rule === "CONSECUTIVE_DAYS")).toBe(false);
  });
});

describe("validateRoster — rule 5: weekend adjacent to leave", () => {
  const weekendDuty: WeekendDutyData = {
    id: "wd1",
    pattern: "ORD_121",
    consultantId: "c1",
    fraction: 1,
    cohortWeekLabel: "A",
  };
  const weekendAssignments: AssignmentData[] = [
    assignment({ date: "2027-01-08", consultantId: "c1", position: "FIRST", weekendDutyId: "wd1" }),
    assignment({ date: "2027-01-09", consultantId: "c1", position: "SECOND", weekendDutyId: "wd1" }),
    assignment({ date: "2027-01-10", consultantId: "c1", position: "FIRST", weekendDutyId: "wd1" }),
  ];

  it("flags a weekend with leave the Thursday before", () => {
    const c = consultant({ id: "c1", surname: "Test" });
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-01-07", "2027-01-08", "2027-01-09", "2027-01-10"]),
      consultants: [c],
      assignments: weekendAssignments,
      weekendDuties: [weekendDuty],
      leaveIntervals: [{ consultantId: "c1", startDate: "2027-01-07", endDate: "2027-01-07" }],
    });
    expect(validateRoster(state).some((v) => v.rule === "WEEKEND_ADJACENT_LEAVE")).toBe(true);
  });

  it("flags a weekend with leave the Monday after", () => {
    const c = consultant({ id: "c1", surname: "Test" });
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-01-08", "2027-01-09", "2027-01-10", "2027-01-11"]),
      consultants: [c],
      assignments: weekendAssignments,
      weekendDuties: [weekendDuty],
      leaveIntervals: [{ consultantId: "c1", startDate: "2027-01-11", endDate: "2027-01-11" }],
    });
    expect(validateRoster(state).some((v) => v.rule === "WEEKEND_ADJACENT_LEAVE")).toBe(true);
  });

  it("does not flag a weekend with no adjacent leave", () => {
    const c = consultant({ id: "c1", surname: "Test" });
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-01-08", "2027-01-09", "2027-01-10"]),
      consultants: [c],
      assignments: weekendAssignments,
      weekendDuties: [weekendDuty],
    });
    expect(validateRoster(state).some((v) => v.rule === "WEEKEND_ADJACENT_LEAVE")).toBe(false);
  });
});

describe("validateRoster — rule 6: maternity ramp", () => {
  function returner(): ConsultantData {
    return consultant({
      id: "holt",
      surname: "Holt",
      specialty: "CARDIAC",
      returnToWorkDate: "2027-07-01",
      firstEligibleDate: "2027-07-29",
    });
  }

  it("flags a call before the 4-week exclusion clears", () => {
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-07-20"]),
      consultants: [returner()],
      assignments: [assignment({ date: "2027-07-20", consultantId: "holt", position: "SECOND" })],
    });
    expect(validateRoster(state).some((v) => v.rule === "MATERNITY_RAMP_BREACH")).toBe(true);
  });

  it("flags a 1st-on-call before two 2nd-on-calls are completed", () => {
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-07-29"]),
      consultants: [returner()],
      assignments: [assignment({ date: "2027-07-29", consultantId: "holt", position: "FIRST" })],
    });
    expect(validateRoster(state).some((v) => v.rule === "MATERNITY_RAMP_BREACH")).toBe(true);
  });

  it("flags a weekend duty before two 2nd-on-calls are completed", () => {
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-07-30"]),
      consultants: [returner()],
      assignments: [
        assignment({ date: "2027-07-30", consultantId: "holt", position: "SECOND", weekendDutyId: "bh1" }),
      ],
      weekendDuties: [{ id: "bh1", pattern: "BH_A", consultantId: "holt", fraction: 0.5, cohortWeekLabel: "B" }],
    });
    expect(validateRoster(state).some((v) => v.rule === "MATERNITY_RAMP_BREACH")).toBe(true);
  });

  it("does not flag a legitimate 2nd-on-call, non-weekend, after eligibility", () => {
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-07-29"]),
      consultants: [returner()],
      assignments: [assignment({ date: "2027-07-29", consultantId: "holt", position: "SECOND" })],
    });
    expect(validateRoster(state).some((v) => v.rule === "MATERNITY_RAMP_BREACH")).toBe(false);
  });

  it("clears the ramp after two valid 2nd-on-calls, allowing 1st-on-call after that", () => {
    const state = baseState({
      calendarDays: calendarDaysFor(["2027-07-29", "2027-08-03", "2027-08-05"]),
      consultants: [returner()],
      assignments: [
        assignment({ date: "2027-07-29", consultantId: "holt", position: "SECOND" }),
        assignment({ date: "2027-08-03", consultantId: "holt", position: "SECOND" }),
        assignment({ date: "2027-08-05", consultantId: "holt", position: "FIRST" }),
      ],
    });
    expect(validateRoster(state).some((v) => v.rule === "MATERNITY_RAMP_BREACH")).toBe(false);
  });
});
