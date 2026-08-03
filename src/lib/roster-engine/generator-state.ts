// Mutable accumulator the generator builds up over its seven steps. Wraps a
// RosterIndex that's rebuilt lazily (cheap at this scale: ~730 assignments)
// whenever a read follows a write.

import { RosterIndex } from "./roster-index";
import type {
  AssignmentData,
  CallWeekday,
  ConsultantData,
  Position,
  RosterState,
  WeekendDutyData,
  WeekendPattern,
} from "./types";
import type { ISODate } from "./date-utils";

let dutyCounter = 0;
export function nextWeekendDutyId(): string {
  dutyCounter += 1;
  return `gen-wd-${dutyCounter}`;
}

export class GenState {
  assignments: AssignmentData[] = [];
  weekendDuties: WeekendDutyData[] = [];
  warnings: string[] = [];

  private indexDirty = true;
  private _index: RosterIndex | null = null;

  constructor(
    public readonly consultants: ConsultantData[],
    public readonly calendarState: RosterState
  ) {}

  get index(): RosterIndex {
    if (this.indexDirty || !this._index) {
      this._index = new RosterIndex({
        calendarDays: this.calendarState.calendarDays,
        consultants: this.consultants,
        assignments: this.assignments,
        weekendDuties: this.weekendDuties,
        leaveIntervals: this.calendarState.leaveIntervals,
      });
      this.indexDirty = false;
    }
    return this._index;
  }

  addAssignment(a: AssignmentData) {
    this.assignments.push(a);
    this.indexDirty = true;
  }

  /** Swaps who holds an existing midweek slot — used only by the step-7
   * correction pass. Weekend/BH assignments are never mutated this way
   * (their weekendDutyId ties them to their duty record). */
  replaceMidweekConsultant(date: ISODate, position: Position, newConsultantId: string) {
    const a = this.assignments.find((x) => x.date === date && x.position === position && x.weekendDutyId === null);
    if (!a) return;
    a.consultantId = newConsultantId;
    this.indexDirty = true;
  }

  addWeekendDuty(wd: WeekendDutyData) {
    this.weekendDuties.push(wd);
    this.indexDirty = true;
  }

  /** Reassigns every Assignment and the WeekendDuty record sharing `dutyId`
   * to `newConsultantId` — used only by the maternity-ramp cleanup pass. */
  reassignWeekendDuty(dutyId: string, newConsultantId: string) {
    for (const a of this.assignments) {
      if (a.weekendDutyId === dutyId) a.consultantId = newConsultantId;
    }
    for (const wd of this.weekendDuties) {
      if (wd.id === dutyId) wd.consultantId = newConsultantId;
    }
    this.indexDirty = true;
  }

  warn(message: string) {
    this.warnings.push(message);
  }

  toRosterState(): RosterState {
    return {
      calendarDays: this.calendarState.calendarDays,
      consultants: this.consultants,
      assignments: this.assignments,
      weekendDuties: this.weekendDuties,
      leaveIntervals: this.calendarState.leaveIntervals,
    };
  }

  /** Places an ordinary Fri-Sat-Sun weekend duty for two people under one
   * pattern (§4.4), atomically so the consecutive-day exemption applies. */
  placeOrdinaryWeekendDuty(
    friday: ISODate,
    saturday: ISODate,
    sunday: ISODate,
    cohortWeekLabel: "A" | "B",
    person121: ConsultantData,
    person212: ConsultantData
  ) {
    const dutyA = nextWeekendDutyId();
    const dutyB = nextWeekendDutyId();
    this.addWeekendDuty({
      id: dutyA,
      pattern: "ORD_121",
      consultantId: person121.id,
      fraction: 1.0,
      cohortWeekLabel,
    });
    this.addWeekendDuty({
      id: dutyB,
      pattern: "ORD_212",
      consultantId: person212.id,
      fraction: 1.0,
      cohortWeekLabel,
    });
    this.addAssignment({ date: friday, position: "FIRST", consultantId: person121.id, weekendDutyId: dutyA, source: "GENERATED" });
    this.addAssignment({ date: saturday, position: "SECOND", consultantId: person121.id, weekendDutyId: dutyA, source: "GENERATED" });
    this.addAssignment({ date: sunday, position: "FIRST", consultantId: person121.id, weekendDutyId: dutyA, source: "GENERATED" });
    this.addAssignment({ date: friday, position: "SECOND", consultantId: person212.id, weekendDutyId: dutyB, source: "GENERATED" });
    this.addAssignment({ date: saturday, position: "FIRST", consultantId: person212.id, weekendDutyId: dutyB, source: "GENERATED" });
    this.addAssignment({ date: sunday, position: "SECOND", consultantId: person212.id, weekendDutyId: dutyB, source: "GENERATED" });
  }

  /** Places one bank-holiday leg (§4.5): Fri+Sat (BH_A/BH_B) or Sun+Mon
   * (BH_C/BH_D), each 0.5 fraction, for one person. */
  placeBankHolidayLeg(
    pattern: Extract<WeekendPattern, "BH_A" | "BH_B" | "BH_C" | "BH_D">,
    firstDay: ISODate,
    firstPosition: Position,
    secondDay: ISODate,
    secondPosition: Position,
    cohortWeekLabel: "A" | "B",
    person: ConsultantData
  ) {
    const dutyId = nextWeekendDutyId();
    this.addWeekendDuty({ id: dutyId, pattern, consultantId: person.id, fraction: 0.5, cohortWeekLabel });
    this.addAssignment({ date: firstDay, position: firstPosition, consultantId: person.id, weekendDutyId: dutyId, source: "GENERATED" });
    this.addAssignment({ date: secondDay, position: secondPosition, consultantId: person.id, weekendDutyId: dutyId, source: "GENERATED" });
  }

  placeMidweekCall(date: ISODate, firstPerson: ConsultantData, secondPerson: ConsultantData) {
    this.addAssignment({ date, position: "FIRST", consultantId: firstPerson.id, weekendDutyId: null, source: "GENERATED" });
    this.addAssignment({ date, position: "SECOND", consultantId: secondPerson.id, weekendDutyId: null, source: "GENERATED" });
  }

  bhFractionTotal(consultantId: string): number {
    return this.weekendDuties
      .filter((wd) => wd.consultantId === consultantId && (wd.pattern === "BH_A" || wd.pattern === "BH_B" || wd.pattern === "BH_C" || wd.pattern === "BH_D"))
      .reduce((sum, wd) => sum + wd.fraction, 0);
  }

  weekendFractionTotal(consultantId: string): number {
    return this.weekendDuties
      .filter((wd) => wd.consultantId === consultantId && (wd.pattern === "ORD_121" || wd.pattern === "ORD_212"))
      .reduce((sum, wd) => sum + wd.fraction, 0);
  }

  count121(consultantId: string): number {
    return this.weekendDuties.filter((wd) => wd.consultantId === consultantId && wd.pattern === "ORD_121").length;
  }

  count212(consultantId: string): number {
    return this.weekendDuties.filter((wd) => wd.consultantId === consultantId && wd.pattern === "ORD_212").length;
  }

  midweekCount(consultantId: string): number {
    return this.assignments.filter((a) => a.consultantId === consultantId && a.weekendDutyId === null).length;
  }

  firstCount(consultantId: string): number {
    return this.assignments.filter((a) => a.consultantId === consultantId && a.position === "FIRST").length;
  }

  secondCount(consultantId: string): number {
    return this.assignments.filter((a) => a.consultantId === consultantId && a.position === "SECOND").length;
  }
}

export const WEEKDAY_TO_INDEX: Record<CallWeekday, number> = { MON: 0, TUE: 1, WED: 2, THU: 3 };
