import { describe, expect, it } from "vitest";
import { chargeDaysFor, entitlementCaps } from "./leave-engine";
import { buildCalendar2027 } from "./calendar";
import type { ConsultantData, WeekPattern } from "./types";

const { days } = buildCalendar2027();
const calendarByDate = new Map(days.map((d) => [d.date, d]));

function consultant(weekAPattern: WeekPattern, weekBPattern: WeekPattern): ConsultantData {
  return {
    id: "c1",
    surname: "Test",
    specialty: "GENERAL",
    callProportion: 1,
    employmentFraction: 1,
    weekAPattern,
    weekBPattern,
    preferredDay: null,
    secondaryDays: [],
    returnToWorkDate: null,
    firstEligibleDate: null,
    excludeFromBankHoliday: false,
  };
}

describe("chargeDaysFor", () => {
  it("charges a flat 5 for a full Mon-Fri week regardless of actual working days", () => {
    // 2027-01-04 (Mon) is Week A. Pattern: only Tue+Thu are working days.
    const c = consultant([false, true, false, true, false], [false, true, false, true, false]);
    const days5 = chargeDaysFor(c, "2027-01-04", "2027-01-08", calendarByDate); // Mon-Fri
    expect(days5).toBe(5);
  });

  it("charges a flat 5 for a full Mon-Sun week", () => {
    const c = consultant([true, true, true, true, true], [true, true, true, true, true]);
    const days5 = chargeDaysFor(c, "2027-01-04", "2027-01-10", calendarByDate); // Mon-Sun
    expect(days5).toBe(5);
  });

  it("charges working days only for a Tue-Thu block (§6.1's own example)", () => {
    // Someone who works Tue+Thu that week: Tue-Thu block should cost 2, not 3.
    const c = consultant([false, true, false, true, false], [false, true, false, true, false]);
    const cost = chargeDaysFor(c, "2027-01-05", "2027-01-07", calendarByDate); // Tue,Wed,Thu
    expect(cost).toBe(2);
  });

  it("charges nothing for a single day off on a non-working day", () => {
    const c = consultant([false, true, true, true, true], [false, true, true, true, true]); // Mon OUT
    const cost = chargeDaysFor(c, "2027-01-04", "2027-01-04", calendarByDate); // Monday
    expect(cost).toBe(0);
  });

  it("charges 1 for a single day off on a working day", () => {
    const c = consultant([true, true, true, true, true], [true, true, true, true, true]);
    const cost = chargeDaysFor(c, "2027-01-05", "2027-01-05", calendarByDate); // Tuesday
    expect(cost).toBe(1);
  });

  it("never charges weekend days even if requested", () => {
    const c = consultant([true, true, true, true, true], [true, true, true, true, true]);
    const cost = chargeDaysFor(c, "2027-01-09", "2027-01-10", calendarByDate); // Sat,Sun
    expect(cost).toBe(0);
  });

  it("charges 5+5=10 for two consecutive full weeks", () => {
    const c = consultant([true, true, true, true, true], [true, true, true, true, true]);
    const cost = chargeDaysFor(c, "2027-01-04", "2027-01-15", calendarByDate); // 2 full Mon-Fri weeks + weekend between
    expect(cost).toBe(10);
  });
});

describe("entitlementCaps", () => {
  it("matches the spec's three worked examples exactly", () => {
    expect(entitlementCaps(1.0)).toEqual({ annual: 30, study: 10 });
    expect(entitlementCaps(0.8)).toEqual({ annual: 24, study: 8 });
    expect(entitlementCaps(0.5)).toEqual({ annual: 15, study: 5 });
  });
});
