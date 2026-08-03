import { describe, expect, it } from "vitest";
import { buildCalendar2027 } from "./calendar";
import { getBankHolidayWeekends, getOrdinaryWeekends, getWeekdayDates } from "./generator-facts";

const { days } = buildCalendar2027();

describe("generator-facts", () => {
  it("finds exactly 44 ordinary weekends (§7.3, §11)", () => {
    expect(getOrdinaryWeekends(days).length).toBe(44);
  });

  it("finds exactly 6 bank holiday weekends (§4.5)", () => {
    expect(getBankHolidayWeekends(days).length).toBe(6);
  });

  it("excludes 1 Jan and the Dec24-Jan3 hand-assigned block from ordinary weekends", () => {
    const weekends = getOrdinaryWeekends(days);
    expect(weekends.some((w) => w.friday === "2027-01-01")).toBe(false);
    expect(weekends.some((w) => w.friday === "2027-12-24")).toBe(false);
    expect(weekends.some((w) => w.friday === "2027-12-31")).toBe(false);
  });

  it("gives ~52 dates for Tue/Wed/Thu, unaffected by bank holidays", () => {
    for (const wd of ["TUE", "WED", "THU"] as const) {
      const dates = getWeekdayDates(days, wd);
      expect(dates.length).toBeGreaterThanOrEqual(51);
      expect(dates.length).toBeLessThanOrEqual(53);
    }
  });

  it("excludes the 6 bank-holiday Mondays from Monday's midweek dates (§4.5)", () => {
    const mondays = getWeekdayDates(days, "MON");
    expect(mondays.length).toBeGreaterThanOrEqual(45);
    expect(mondays.length).toBeLessThanOrEqual(47);
    for (const bhMonday of ["2027-02-01", "2027-03-29", "2027-05-03", "2027-06-07", "2027-08-02", "2027-10-25"]) {
      expect(mondays).not.toContain(bhMonday);
    }
  });
});
