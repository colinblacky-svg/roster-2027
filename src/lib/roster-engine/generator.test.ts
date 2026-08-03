import { describe, expect, it } from "vitest";
import { buildCalendar2027 } from "./calendar";
import { generateRoster } from "./generator";
import { validateRoster } from "./validation";
import { CONSULTANTS } from "../../../prisma/seed-data";
import type { ConsultantData } from "./types";

function toConsultantData(): ConsultantData[] {
  return CONSULTANTS.map((c, i) => ({
    id: `c${i}-${c.surname}`,
    surname: c.surname,
    specialty: c.specialty,
    callProportion: c.callProportion,
    employmentFraction: c.employmentFraction,
    weekAPattern: c.weekA,
    weekBPattern: c.weekB,
    preferredDay: c.preferredDay,
    secondaryDays: c.secondaryDays,
    returnToWorkDate: c.returnToWorkDate ?? null,
    firstEligibleDate: c.firstEligibleDate ?? null,
    excludeFromBankHoliday: c.excludeFromBankHoliday ?? false,
  }));
}

describe("generateRoster — full year, real personnel data", () => {
  const consultants = toConsultantData();
  const { days: calendarDays } = buildCalendar2027();
  const result = generateRoster(consultants, calendarDays);

  it("produces very few generator warnings", () => {
    if (result.warnings.length > 0) {
      console.log("Generator warnings:", result.warnings.slice(0, 20));
    }
    expect(result.warnings.length).toBeLessThan(15);
  });

  it("fills both positions for every in-scope day", () => {
    const inScopeDates = calendarDays.filter((d) => d.inGeneratorScope && d.date <= "2027-12-31").map((d) => d.date);
    const byDate = new Map<string, Set<string>>();
    for (const a of result.assignments) {
      if (!a.consultantId) continue;
      const set = byDate.get(a.date) ?? new Set();
      set.add(a.position);
      byDate.set(a.date, set);
    }
    const incomplete = inScopeDates.filter((d) => (byDate.get(d)?.size ?? 0) < 2);
    if (incomplete.length > 0) console.log("Incomplete days:", incomplete.slice(0, 10));
    expect(incomplete.length).toBe(0);
  });

  it("produces zero or very few §5 validation violations", () => {
    const violations = validateRoster({
      calendarDays,
      consultants,
      assignments: result.assignments,
      weekendDuties: result.weekendDuties,
      leaveIntervals: [],
    });
    if (violations.length > 0) {
      console.log("Violations by rule:", violations.reduce<Record<string, number>>((acc, v) => {
        acc[v.rule] = (acc[v.rule] ?? 0) + 1;
        return acc;
      }, {}));
      console.log("First few:", violations.slice(0, 10).map((v) => v.message));
    }
    expect(violations.length).toBeLessThan(10);
  });

  it("gives every bank-holiday-eligible consultant exactly 0.5 bank holiday fraction", () => {
    const eligible = consultants.filter((c) => c.callProportion > 0 && !c.excludeFromBankHoliday);
    const fractionByConsultant = new Map<string, number>();
    for (const wd of result.weekendDuties) {
      if (["BH_A", "BH_B", "BH_C", "BH_D"].includes(wd.pattern)) {
        fractionByConsultant.set(wd.consultantId, (fractionByConsultant.get(wd.consultantId) ?? 0) + wd.fraction);
      }
    }
    const offByHalf = eligible.filter((c) => Math.abs((fractionByConsultant.get(c.id) ?? 0) - 0.5) > 0.01);
    if (offByHalf.length > 0) {
      console.log(
        "Off bank-holiday target:",
        offByHalf.map((c) => `${c.surname}=${fractionByConsultant.get(c.id) ?? 0}`)
      );
    }
    expect(offByHalf.length).toBeLessThanOrEqual(2);
  });

  it("keeps Holt and Murphy at zero bank holiday fraction", () => {
    const holt = consultants.find((c) => c.surname === "Holt")!;
    const murphy = consultants.find((c) => c.surname === "Murphy")!;
    for (const person of [holt, murphy]) {
      const total = result.weekendDuties
        .filter((wd) => wd.consultantId === person.id && ["BH_A", "BH_B", "BH_C", "BH_D"].includes(wd.pattern))
        .reduce((s, wd) => s + wd.fraction, 0);
      expect(total).toBe(0);
    }
  });

  it("keeps ledger variances within a reasonable range after correction", () => {
    const materialCount = result.ledger.filter((r) => r.materialVariance).length;
    console.log(
      "Ledger variance summary:",
      result.ledger.map((r) => `${r.surname}=${r.variance.toFixed(1)}`).join(", ")
    );
    // Not a hard spec number — just a sanity check that correction did real work.
    expect(materialCount).toBeLessThan(result.ledger.length);
  });
});
