// buildCalendar2027 — pure calendar structure for the roster (§3).
//
// Covers 1 Jan 2027 through 3 Jan 2028: the extra tail days let the
// hand-assigned festive block (24 Dec 2027 - 3 Jan 2028, §4.7) actually be
// displayed and edited, even though they fall in the next calendar year.

import { addDays, diffDays, eachDay, mondayOfWeek, type ISODate } from "./date-utils";

export type WeekLabel = "A" | "B";

export interface BankHolidayBlockData {
  id: string;
  name: string;
  friday: ISODate;
  saturday: ISODate;
  sunday: ISODate;
  monday: ISODate;
}

export interface CalendarDayData {
  date: ISODate;
  weekLabel: WeekLabel;
  isPublicHoliday: boolean;
  holidayName: string | null;
  bankHolidayBlockId: string | null;
  inGeneratorScope: boolean;
}

export interface Calendar2027 {
  days: CalendarDayData[];
  bankHolidayBlocks: BankHolidayBlockData[];
}

const CALENDAR_START: ISODate = "2027-01-01";
const CALENDAR_END: ISODate = "2028-01-03"; // tail of the hand-assigned block

// Week A is anchored to Monday 4 Jan 2027 (§3.1).
const WEEK_A_ANCHOR_MONDAY: ISODate = "2027-01-04";

// 2027 Irish public holidays (§3.2). Bank-holiday-weekend Mondays are listed
// here too (they're still public holidays) alongside the two that aren't part
// of a Fri-Mon block (17 Mar, 25/26 Dec).
const PUBLIC_HOLIDAYS: { date: ISODate; name: string }[] = [
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-02-01", name: "St Brigid's Day" },
  { date: "2027-03-17", name: "St Patrick's Day" },
  { date: "2027-03-29", name: "Easter Monday" },
  { date: "2027-05-03", name: "May Bank Holiday" },
  { date: "2027-06-07", name: "June Bank Holiday" },
  { date: "2027-08-02", name: "August Bank Holiday" },
  { date: "2027-10-25", name: "October Bank Holiday" },
  { date: "2027-12-25", name: "Christmas Day" },
  { date: "2027-12-26", name: "St Stephen's Day" },
];

// The six bank-holiday weekends (§4.5), each a Fri-Sat-Sun-Mon block.
const BANK_HOLIDAY_BLOCKS_RAW: { name: string; friday: ISODate }[] = [
  { name: "St Brigid's", friday: "2027-01-29" },
  { name: "Easter", friday: "2027-03-26" },
  { name: "May", friday: "2027-04-30" },
  { name: "June", friday: "2027-06-04" },
  { name: "August", friday: "2027-07-30" },
  { name: "October", friday: "2027-10-22" },
];

// 24 Dec 2027 - 3 Jan 2028: hand-assigned, outside all generator rules (§4.7).
const HAND_ASSIGNED_START: ISODate = "2027-12-24";
const HAND_ASSIGNED_END: ISODate = "2028-01-03";

// 1-3 Jan 2027: 1 Jan has its own arrangement and doesn't enter the weekend
// cycle (§4.7); 2-3 Jan complete that same Fri-Sat-Sun weekend and, per the
// spec, were "most likely already assigned by the equivalent block at the
// end of the 2026 roster" — i.e. covered by the PRIOR year's own hand-assigned
// tail, mirroring this year's Dec24-Jan3 block. All three days are therefore
// out of this generator's scope, not just the Friday.
const PRIOR_YEAR_TAIL_START: ISODate = "2027-01-01";
const PRIOR_YEAR_TAIL_END: ISODate = "2027-01-03";

function weekLabelFor(date: ISODate): WeekLabel {
  const weekStart = mondayOfWeek(date);
  const weeksSinceAnchor = diffDays(weekStart, WEEK_A_ANCHOR_MONDAY) / 7;
  const parity = ((weeksSinceAnchor % 2) + 2) % 2; // normalize negative modulo
  return parity === 0 ? "A" : "B";
}

export function buildCalendar2027(): Calendar2027 {
  const bankHolidayBlocks: BankHolidayBlockData[] = BANK_HOLIDAY_BLOCKS_RAW.map((b, i) => ({
    id: `bh-${i + 1}-${b.friday}`,
    name: b.name,
    friday: b.friday,
    saturday: addDays(b.friday, 1),
    sunday: addDays(b.friday, 2),
    monday: addDays(b.friday, 3),
  }));

  const bankHolidayBlockIdByDate = new Map<ISODate, string>();
  for (const block of bankHolidayBlocks) {
    for (const d of [block.friday, block.saturday, block.sunday, block.monday]) {
      bankHolidayBlockIdByDate.set(d, block.id);
    }
  }

  const holidayByDate = new Map(PUBLIC_HOLIDAYS.map((h) => [h.date, h.name]));

  const days: CalendarDayData[] = [];
  for (const date of eachDay(CALENDAR_START, CALENDAR_END)) {
    const inHandAssignedBlock = date >= HAND_ASSIGNED_START && date <= HAND_ASSIGNED_END;
    const isOwnArrangementDay = date >= PRIOR_YEAR_TAIL_START && date <= PRIOR_YEAR_TAIL_END;

    days.push({
      date,
      weekLabel: weekLabelFor(date),
      isPublicHoliday: holidayByDate.has(date),
      holidayName: holidayByDate.get(date) ?? null,
      bankHolidayBlockId: bankHolidayBlockIdByDate.get(date) ?? null,
      inGeneratorScope: !inHandAssignedBlock && !isOwnArrangementDay,
    });
  }

  return { days, bankHolidayBlocks };
}
