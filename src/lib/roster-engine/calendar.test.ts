import { describe, expect, it } from "vitest";
import { buildCalendar2027 } from "./calendar";

describe("buildCalendar2027", () => {
  const { days, bankHolidayBlocks } = buildCalendar2027();
  const byDate = new Map(days.map((d) => [d.date, d]));

  it("covers 1 Jan 2027 through 3 Jan 2028", () => {
    expect(days[0].date).toBe("2027-01-01");
    expect(days[days.length - 1].date).toBe("2028-01-03");
    expect(days.length).toBe(368);
  });

  it("anchors Week A to Monday 4 Jan 2027, and labels 1-3 Jan as the tail of a B week", () => {
    expect(byDate.get("2027-01-04")!.weekLabel).toBe("A");
    expect(byDate.get("2027-01-01")!.weekLabel).toBe("B"); // Friday, tail of prior week
    expect(byDate.get("2027-01-02")!.weekLabel).toBe("B");
    expect(byDate.get("2027-01-03")!.weekLabel).toBe("B");
    // Whole first A week Mon-Sun
    for (const d of ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08", "2027-01-09", "2027-01-10"]) {
      expect(byDate.get(d)!.weekLabel).toBe("A");
    }
    // Following week is B
    for (const d of ["2027-01-11", "2027-01-17"]) {
      expect(byDate.get(d)!.weekLabel).toBe("B");
    }
  });

  it("alternates every 7 days for the whole year", () => {
    let prevLabel = byDate.get("2027-01-04")!.weekLabel;
    for (let i = 11; i < 360; i += 7) {
      const date = days[i].date;
      const label = byDate.get(date)!.weekLabel;
      expect(label).not.toBe(prevLabel);
      prevLabel = label;
    }
  });

  it("flags all 10 public holidays", () => {
    const holidays = days.filter((d) => d.isPublicHoliday).map((d) => d.date);
    expect(holidays).toEqual([
      "2027-01-01",
      "2027-02-01",
      "2027-03-17",
      "2027-03-29",
      "2027-05-03",
      "2027-06-07",
      "2027-08-02",
      "2027-10-25",
      "2027-12-25",
      "2027-12-26",
    ]);
  });

  it("treats St Patrick's Day as an ordinary weekday (no bank holiday block)", () => {
    const day = byDate.get("2027-03-17")!;
    expect(day.isPublicHoliday).toBe(true);
    expect(day.bankHolidayBlockId).toBeNull();
  });

  it("builds exactly 6 bank holiday blocks, each Fri-Sat-Sun-Mon", () => {
    expect(bankHolidayBlocks.length).toBe(6);
    const expectedFridays = [
      "2027-01-29",
      "2027-03-26",
      "2027-04-30",
      "2027-06-04",
      "2027-07-30",
      "2027-10-22",
    ];
    expect(bankHolidayBlocks.map((b) => b.friday)).toEqual(expectedFridays);
    for (const block of bankHolidayBlocks) {
      expect(byDate.get(block.friday)!.bankHolidayBlockId).toBe(block.id);
      expect(byDate.get(block.saturday)!.bankHolidayBlockId).toBe(block.id);
      expect(byDate.get(block.sunday)!.bankHolidayBlockId).toBe(block.id);
      expect(byDate.get(block.monday)!.bankHolidayBlockId).toBe(block.id);
      // The Monday of every block is one of the 10 gazetted public holidays.
      expect(byDate.get(block.monday)!.isPublicHoliday).toBe(true);
    }
  });

  it("marks 1-3 Jan 2027 out of generator scope (prior year's tail, §4.7)", () => {
    expect(byDate.get("2027-01-01")!.inGeneratorScope).toBe(false);
    expect(byDate.get("2027-01-02")!.inGeneratorScope).toBe(false);
    expect(byDate.get("2027-01-03")!.inGeneratorScope).toBe(false);
    expect(byDate.get("2027-01-04")!.inGeneratorScope).toBe(true);
  });

  it("marks 24 Dec 2027 - 3 Jan 2028 out of generator scope (hand-assigned, §4.7)", () => {
    for (const d of ["2027-12-24", "2027-12-25", "2027-12-31", "2028-01-01", "2028-01-03"]) {
      expect(byDate.get(d)!.inGeneratorScope).toBe(false);
    }
    // the day immediately before the hand-assigned block is in scope
    expect(byDate.get("2027-12-23")!.inGeneratorScope).toBe(true);
  });

  it("marks every other day in scope", () => {
    const outOfScope = days.filter((d) => !d.inGeneratorScope).map((d) => d.date);
    expect(outOfScope.length).toBe(3 + 11); // 1-3 Jan + (24 Dec..3 Jan inclusive = 11 days)
  });
});
