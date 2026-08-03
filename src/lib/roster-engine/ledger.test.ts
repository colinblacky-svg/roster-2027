import { describe, expect, it } from "vitest";
import { computeLedger } from "./ledger";
import { buildCalendar2027 } from "./calendar";
import type { ConsultantData, RosterState, WeekPattern } from "./types";

const ALL_IN: WeekPattern = [true, true, true, true, true];

function consultant(overrides: Partial<ConsultantData> & { id: string; surname: string }): ConsultantData {
  return {
    specialty: "GENERAL",
    callProportion: 1.0,
    employmentFraction: 1.0,
    weekAPattern: ALL_IN,
    weekBPattern: ALL_IN,
    preferredDay: null,
    secondaryDays: [],
    returnToWorkDate: null,
    firstEligibleDate: null,
    excludeFromBankHoliday: false,
    ...overrides,
  };
}

const { days } = buildCalendar2027();

function stateWith(consultants: ConsultantData[], overrides: Partial<RosterState> = {}): RosterState {
  return {
    calendarDays: days,
    consultants,
    assignments: [],
    weekendDuties: [],
    leaveIntervals: [],
    ...overrides,
  };
}

describe("computeLedger — availability fractions (§7.2)", () => {
  it("matches the spec's worked examples for the three returners", () => {
    const matthews = consultant({
      id: "matthews",
      surname: "Matthews",
      firstEligibleDate: "2027-03-10",
    });
    const murphy = consultant({ id: "murphy", surname: "Murphy", firstEligibleDate: "2027-05-08" });
    const holt = consultant({ id: "holt", surname: "Holt", firstEligibleDate: "2027-07-29" });
    const rows = computeLedger(stateWith([matthews, murphy, holt]));

    const byId = new Map(rows.map((r) => [r.consultantId, r]));
    expect(byId.get("matthews")!.availabilityFraction).toBeCloseTo(0.81, 2);
    expect(byId.get("murphy")!.availabilityFraction).toBeCloseTo(0.65, 2);
    expect(byId.get("holt")!.availabilityFraction).toBeCloseTo(0.43, 2);
  });

  it("gives everyone else availability 1.0", () => {
    const c = consultant({ id: "c1", surname: "Black" });
    const rows = computeLedger(stateWith([c]));
    expect(rows[0].availabilityFraction).toBe(1.0);
  });
});

describe("computeLedger — exclusions and pools", () => {
  it("excludes non-call consultants (proportion 0) from the ledger", () => {
    const onCall = consultant({ id: "c1", surname: "Black" });
    const nonCall = consultant({ id: "c2", surname: "Mannion", specialty: "NONE", callProportion: 0 });
    const rows = computeLedger(stateWith([onCall, nonCall]));
    expect(rows.length).toBe(1);
    expect(rows[0].consultantId).toBe("c1");
  });

  it("splits expected total between two equal-proportion consultants 50/50", () => {
    const a = consultant({ id: "a", surname: "Alpha" });
    const b = consultant({ id: "b", surname: "Beta" });
    const rows = computeLedger(stateWith([a, b]));
    expect(rows[0].expectedTotal).toBeCloseTo(rows[1].expectedTotal, 6);
    // Between them they should account for the whole pool (midweek + weekend).
    const total = rows[0].expectedTotal + rows[1].expectedTotal;
    expect(total).toBeGreaterThan(0);
  });

  it("gives a half-proportion consultant half the expected total of a full-time one", () => {
    const full = consultant({ id: "full", surname: "Full", callProportion: 1.0 });
    const half = consultant({ id: "half", surname: "Half", callProportion: 0.5 });
    const rows = computeLedger(stateWith([full, half]));
    const byId = new Map(rows.map((r) => [r.consultantId, r]));
    expect(byId.get("half")!.expectedTotal).toBeCloseTo(byId.get("full")!.expectedTotal / 2, 6);
  });
});

describe("computeLedger — actual counts from assignments", () => {
  it("tallies 1st/2nd counts, midweek vs weekend, and 121/212 patterns", () => {
    const c = consultant({ id: "c1", surname: "Black" });
    const state = stateWith([c], {
      assignments: [
        { date: "2027-01-05", position: "FIRST", consultantId: "c1", weekendDutyId: null, source: "MANUAL" },
        { date: "2027-01-06", position: "SECOND", consultantId: "c1", weekendDutyId: null, source: "MANUAL" },
        { date: "2027-01-08", position: "FIRST", consultantId: "c1", weekendDutyId: "wd1", source: "MANUAL" },
        { date: "2027-01-09", position: "SECOND", consultantId: "c1", weekendDutyId: "wd1", source: "MANUAL" },
        { date: "2027-01-10", position: "FIRST", consultantId: "c1", weekendDutyId: "wd1", source: "MANUAL" },
      ],
      weekendDuties: [{ id: "wd1", pattern: "ORD_121", consultantId: "c1", fraction: 1.0, cohortWeekLabel: "A" }],
    });
    const row = computeLedger(state)[0];
    expect(row.firstCount).toBe(3);
    expect(row.secondCount).toBe(2);
    expect(row.midweekActual).toBe(2);
    expect(row.weekendActual).toBe(1.0);
    expect(row.count121).toBe(1);
    expect(row.count212).toBe(0);
    expect(row.actualTotal).toBe(3); // 2 midweek + 1.0 weekend fraction
  });

  it("does not count assignments in the 2028 hand-assigned tail toward 2027 totals", () => {
    const c = consultant({ id: "c1", surname: "Black" });
    const state = stateWith([c], {
      assignments: [
        { date: "2028-01-02", position: "FIRST", consultantId: "c1", weekendDutyId: null, source: "HAND_ASSIGNED" },
      ],
    });
    const row = computeLedger(state)[0];
    expect(row.midweekActual).toBe(0);
    expect(row.actualTotal).toBe(0);
  });

  it("flags material variance when actual diverges sharply from expected", () => {
    const a = consultant({ id: "a", surname: "Alpha" });
    const b = consultant({ id: "b", surname: "Beta" });
    const state = stateWith([a, b], {
      assignments: Array.from({ length: 20 }, (_, i) => ({
        date: `2027-01-${String((i % 27) + 1).padStart(2, "0")}`,
        position: "FIRST" as const,
        consultantId: "a",
        weekendDutyId: null,
        source: "MANUAL" as const,
      })),
    });
    const rows = computeLedger(state);
    const alpha = rows.find((r) => r.consultantId === "a")!;
    const beta = rows.find((r) => r.consultantId === "b")!;
    // Alpha got 20 calls, beta got none, but both are far under their fair
    // share of the whole year's pool — so both read as under-assigned, with
    // alpha materially closer to its target than beta.
    expect(alpha.materialVariance).toBe(true);
    expect(beta.materialVariance).toBe(true);
    expect(alpha.variance).toBeGreaterThan(beta.variance);
    expect(alpha.actualTotal).toBe(20);
    expect(beta.actualTotal).toBe(0);
  });
});
