// Structural facts about the calendar the generator needs repeatedly —
// derived from CalendarDayData rather than hardcoded, so they stay correct
// if the calendar module ever changes (and so they're independently
// checkable against §7.5/§11's stated figures in tests).

import { addDays, isoWeekday } from "./date-utils";
import type { CalendarDayData } from "./calendar";
import type { CallWeekday } from "./types";
import { WEEKDAY_TO_INDEX } from "./generator-state";

const YEAR_END = "2027-12-31";

export interface OrdinaryWeekend {
  friday: string;
  saturday: string;
  sunday: string;
  cohortWeekLabel: "A" | "B";
}

export interface BankHolidayWeekend {
  id: string;
  friday: string;
  saturday: string;
  sunday: string;
  monday: string;
  cohortWeekLabel: "A" | "B";
}

/** The 44 ordinary weekends the generator must fill (§7.3, §11) — Fridays in
 * generator scope that aren't part of a bank-holiday block. */
export function getOrdinaryWeekends(calendarDays: CalendarDayData[]): OrdinaryWeekend[] {
  return calendarDays
    .filter((d) => d.date <= YEAR_END && d.inGeneratorScope && isoWeekday(d.date) === 4 && !d.bankHolidayBlockId)
    .map((d) => ({
      friday: d.date,
      saturday: addDays(d.date, 1),
      sunday: addDays(d.date, 2),
      cohortWeekLabel: d.weekLabel,
    }))
    .sort((a, b) => (a.friday < b.friday ? -1 : 1));
}

/** The 6 bank-holiday weekends (§4.5). */
export function getBankHolidayWeekends(calendarDays: CalendarDayData[]): BankHolidayWeekend[] {
  const fridays = calendarDays.filter((d) => d.bankHolidayBlockId && isoWeekday(d.date) === 4);
  return fridays
    .map((d) => ({
      id: d.bankHolidayBlockId as string,
      friday: d.date,
      saturday: addDays(d.date, 1),
      sunday: addDays(d.date, 2),
      monday: addDays(d.date, 3),
      cohortWeekLabel: d.weekLabel,
    }))
    .sort((a, b) => (a.friday < b.friday ? -1 : 1));
}

/** All in-scope dates falling on `weekday`, chronological. Excludes any date
 * that's part of a bank-holiday block (only ever matters for Monday, since
 * a BH block's Mon leg is already covered by BH_C/BH_D — §4.5 — and must not
 * also receive a regular midweek assignment). */
export function getWeekdayDates(calendarDays: CalendarDayData[], weekday: CallWeekday): string[] {
  const idx = WEEKDAY_TO_INDEX[weekday];
  return calendarDays
    .filter(
      (d) => d.date <= YEAR_END && d.inGeneratorScope && isoWeekday(d.date) === idx && !d.bankHolidayBlockId
    )
    .map((d) => d.date)
    .sort();
}
