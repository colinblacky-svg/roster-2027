// Maps Prisma rows into the plain, DB-agnostic RosterState shape that
// lib/roster-engine's pure functions operate on. Server-only.

import { prisma } from "./prisma";
import { parseSecondaryDays } from "./weekdays";
import type { CalendarDayData } from "./roster-engine/calendar";
import type {
  AssignmentData,
  ConsultantData,
  LeaveInterval,
  RosterState,
  WeekendDutyData,
  WeekPattern,
} from "./roster-engine/types";

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function loadRosterState(): Promise<RosterState> {
  const [consultantRows, calendarRows, assignmentRows, weekendDutyRows, leaveRows] = await Promise.all([
    prisma.consultant.findMany(),
    prisma.calendarDay.findMany(),
    prisma.assignment.findMany(),
    prisma.weekendDuty.findMany(),
    prisma.leaveRequest.findMany({ where: { status: { in: ["AUTO_APPLIED", "APPROVED"] } } }),
  ]);

  const consultants: ConsultantData[] = consultantRows.map((c) => ({
    id: c.id,
    surname: c.surname,
    specialty: c.specialty,
    callProportion: c.callProportion,
    employmentFraction: c.employmentFraction,
    weekAPattern: [c.weekAMon, c.weekATue, c.weekAWed, c.weekAThu, c.weekAFri] as WeekPattern,
    weekBPattern: [c.weekBMon, c.weekBTue, c.weekBWed, c.weekBThu, c.weekBFri] as WeekPattern,
    preferredDay: c.preferredDay,
    secondaryDays: parseSecondaryDays(c.secondaryDays),
    returnToWorkDate: c.returnToWorkDate ? toISO(c.returnToWorkDate) : null,
    firstEligibleDate: c.firstEligibleDate ? toISO(c.firstEligibleDate) : null,
    excludeFromBankHoliday: c.excludeFromBankHoliday,
  }));

  const calendarDays: CalendarDayData[] = calendarRows.map((r) => ({
    date: toISO(r.date),
    weekLabel: r.weekLabel,
    isPublicHoliday: r.isPublicHoliday,
    holidayName: r.holidayName,
    bankHolidayBlockId: r.bankHolidayBlockId,
    inGeneratorScope: r.inGeneratorScope,
  }));

  const assignments: AssignmentData[] = assignmentRows.map((a) => ({
    date: toISO(a.date),
    position: a.position,
    consultantId: a.consultantId,
    weekendDutyId: a.weekendDutyId,
    source: a.source,
  }));

  const weekendDuties: WeekendDutyData[] = weekendDutyRows.map((wd) => ({
    id: wd.id,
    pattern: wd.pattern,
    consultantId: wd.consultantId,
    fraction: wd.fraction,
    cohortWeekLabel: wd.cohortWeekLabel,
  }));

  const leaveIntervals: LeaveInterval[] = leaveRows.map((lr) => ({
    consultantId: lr.consultantId,
    startDate: toISO(lr.startDate),
    endDate: toISO(lr.endDate),
  }));

  return { calendarDays, consultants, assignments, weekendDuties, leaveIntervals };
}
