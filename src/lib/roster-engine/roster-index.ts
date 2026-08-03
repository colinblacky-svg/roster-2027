// Shared lookup structures built from a RosterState — used by validation,
// ledger, and generator alike so each doesn't re-derive the same maps.

import { addDays, isoWeekday, type ISODate } from "./date-utils";
import type { CalendarDayData } from "./calendar";
import {
  patternDay,
  type AssignmentData,
  type ConsultantData,
  type LeaveInterval,
  type RosterState,
  type WeekendDutyData,
} from "./types";

const WEEKDAY_NAMES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export class RosterIndex {
  readonly calendarByDate = new Map<ISODate, CalendarDayData>();
  readonly consultantById = new Map<string, ConsultantData>();
  readonly assignmentsByDate = new Map<ISODate, AssignmentData[]>();
  readonly assignmentsByConsultant = new Map<string, AssignmentData[]>();
  readonly weekendDutyById = new Map<string, WeekendDutyData>();
  readonly leaveIntervalsByConsultant = new Map<string, LeaveInterval[]>();

  constructor(readonly state: RosterState) {
    for (const day of state.calendarDays) this.calendarByDate.set(day.date, day);
    for (const c of state.consultants) this.consultantById.set(c.id, c);
    for (const wd of state.weekendDuties) this.weekendDutyById.set(wd.id, wd);

    for (const a of state.assignments) {
      const byDate = this.assignmentsByDate.get(a.date) ?? [];
      byDate.push(a);
      this.assignmentsByDate.set(a.date, byDate);

      if (a.consultantId) {
        const byConsultant = this.assignmentsByConsultant.get(a.consultantId) ?? [];
        byConsultant.push(a);
        this.assignmentsByConsultant.set(a.consultantId, byConsultant);
      }
    }
    for (const list of this.assignmentsByConsultant.values()) {
      list.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    }

    for (const interval of state.leaveIntervals) {
      const list = this.leaveIntervalsByConsultant.get(interval.consultantId) ?? [];
      list.push(interval);
      this.leaveIntervalsByConsultant.set(interval.consultantId, list);
    }
  }

  weekdayName(date: ISODate): (typeof WEEKDAY_NAMES)[number] {
    return WEEKDAY_NAMES[isoWeekday(date)];
  }

  isOnLeave(consultantId: string, date: ISODate): boolean {
    const intervals = this.leaveIntervalsByConsultant.get(consultantId);
    if (!intervals) return false;
    return intervals.some((iv) => date >= iv.startDate && date <= iv.endDate);
  }

  /** True if the consultant has any leave interval touching this exact date. */
  hasLeaveOnAnyOf(consultantId: string, dates: ISODate[]): boolean {
    return dates.some((d) => this.isOnLeave(consultantId, d));
  }

  isWorkingDay(consultant: ConsultantData, date: ISODate): boolean {
    const day = this.calendarByDate.get(date);
    if (!day) return false;
    const weekdayIdx = isoWeekday(date);
    if (weekdayIdx >= 5) return true; // Sat/Sun: pattern doesn't govern weekend duty days
    const weekday = WEEKDAY_NAMES[weekdayIdx] as "MON" | "TUE" | "WED" | "THU" | "FRI";
    const pattern = day.weekLabel === "A" ? consultant.weekAPattern : consultant.weekBPattern;
    return patternDay(pattern, weekday);
  }

  isBankHolidayMonday(date: ISODate): boolean {
    const day = this.calendarByDate.get(date);
    if (!day?.bankHolidayBlockId) return false;
    return isoWeekday(date) === 0; // Monday
  }

  /** All calls for the consultant strictly before `date` (chronological). */
  callsBefore(consultantId: string, date: ISODate): AssignmentData[] {
    const all = this.assignmentsByConsultant.get(consultantId) ?? [];
    return all.filter((a) => a.date < date);
  }

  assignmentDate(a: AssignmentData): ISODate {
    return a.date;
  }

  dayBefore(date: ISODate): ISODate {
    return addDays(date, -1);
  }

  dayAfter(date: ISODate): ISODate {
    return addDays(date, 1);
  }
}
