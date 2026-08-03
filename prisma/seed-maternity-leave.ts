// Creates the MATERNITY leave record for each maternity returner, covering
// from the start of the year through the day before they're back at work
// (§6.3 — leave of every type, including maternity, must show on the
// calendar; §6.1 — maternity doesn't count toward the leave cap or any
// entitlement bucket, so this bypasses the normal booking flow's cap-check
// and charges no bucket, but still needs a real LeaveRequest row to display).

import type { PrismaClient } from "../src/generated/prisma/client";
import { addDays, type ISODate } from "../src/lib/roster-engine/date-utils";
import { chargeDaysFor } from "../src/lib/roster-engine/leave-engine";
import { buildCalendar2027 } from "../src/lib/roster-engine/calendar";
import { parseSecondaryDays } from "../src/lib/weekdays";
import type { ConsultantData, WeekPattern } from "../src/lib/roster-engine/types";

const YEAR_START: ISODate = "2027-01-01";

export async function seedMaternityLeave(prisma: PrismaClient) {
  const returners = await prisma.consultant.findMany({
    where: { returnToWorkDate: { not: null } },
  });
  if (returners.length === 0) return;

  const { days } = buildCalendar2027();
  const calendarByDate = new Map(days.map((d) => [d.date, d]));

  for (const c of returners) {
    const returnDate = c.returnToWorkDate!.toISOString().slice(0, 10);
    const endDate = addDays(returnDate, -1);
    if (endDate < YEAR_START) continue; // returned before the year even starts

    const existing = await prisma.leaveRequest.findFirst({
      where: { consultantId: c.id, leaveType: "MATERNITY" },
    });
    if (existing) continue;

    const consultantData: ConsultantData = {
      id: c.id,
      surname: c.surname,
      specialty: c.specialty,
      callProportion: c.callProportion,
      employmentFraction: c.employmentFraction,
      weekAPattern: [c.weekAMon, c.weekATue, c.weekAWed, c.weekAThu, c.weekAFri] as WeekPattern,
      weekBPattern: [c.weekBMon, c.weekBTue, c.weekBWed, c.weekBThu, c.weekBFri] as WeekPattern,
      preferredDay: c.preferredDay,
      secondaryDays: parseSecondaryDays(c.secondaryDays),
      returnToWorkDate: returnDate,
      firstEligibleDate: c.firstEligibleDate ? c.firstEligibleDate.toISOString().slice(0, 10) : null,
      excludeFromBankHoliday: c.excludeFromBankHoliday,
    };
    const daysCharged = chargeDaysFor(consultantData, YEAR_START, endDate, calendarByDate);

    await prisma.leaveRequest.create({
      data: {
        consultantId: c.id,
        startDate: new Date(YEAR_START),
        endDate: new Date(endDate),
        leaveType: "MATERNITY",
        bookingOrCancelling: "BOOK",
        status: "AUTO_APPLIED",
        daysCharged,
      },
    });
    console.log(`Seeded maternity leave for ${c.surname}: ${YEAR_START} - ${endDate}`);
  }
}
