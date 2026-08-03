import type { ISODate } from "./date-utils";
import type { CalendarDayData } from "./calendar";

export type Specialty = "CARDIAC" | "GENERAL" | "NONE";
export type CallWeekday = "MON" | "TUE" | "WED" | "THU";
export type Position = "FIRST" | "SECOND";
export type AssignmentSource = "GENERATED" | "MANUAL" | "SWAP" | "HAND_ASSIGNED";
export type WeekendPattern =
  | "ORD_121"
  | "ORD_212"
  | "BH_A"
  | "BH_B"
  | "BH_C"
  | "BH_D"
  | "MANUAL_SAT_ONLY"
  | "MANUAL_SUN_ONLY";

/** Mon-Fri, true = IN, matching the spec's tables verbatim. */
export type WeekPattern = [boolean, boolean, boolean, boolean, boolean];

export interface ConsultantData {
  id: string;
  surname: string;
  specialty: Specialty;
  callProportion: number;
  employmentFraction: number;
  weekAPattern: WeekPattern;
  weekBPattern: WeekPattern;
  preferredDay: CallWeekday | null;
  secondaryDays: CallWeekday[];
  returnToWorkDate: ISODate | null;
  firstEligibleDate: ISODate | null;
  excludeFromBankHoliday: boolean;
}

export interface AssignmentData {
  date: ISODate;
  position: Position;
  consultantId: string | null;
  weekendDutyId: string | null;
  source: AssignmentSource;
}

export interface WeekendDutyData {
  id: string;
  pattern: WeekendPattern;
  consultantId: string;
  fraction: number;
  cohortWeekLabel: "A" | "B";
}

/** A closed [startDate, endDate] inclusive interval of leave for one consultant. */
export interface LeaveInterval {
  consultantId: string;
  startDate: ISODate;
  endDate: ISODate;
}

export interface RosterState {
  calendarDays: CalendarDayData[];
  consultants: ConsultantData[];
  assignments: AssignmentData[];
  weekendDuties: WeekendDutyData[];
  leaveIntervals: LeaveInterval[];
}

const WEEKDAY_INDEX: Record<CallWeekday, number> = { MON: 0, TUE: 1, WED: 2, THU: 3 };

export function patternDay(pattern: WeekPattern, weekday: CallWeekday | "FRI"): boolean {
  if (weekday === "FRI") return pattern[4];
  return pattern[WEEKDAY_INDEX[weekday]];
}
