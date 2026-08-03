import type { PrismaClient } from "../src/generated/prisma/client";
import { buildCalendar2027 } from "../src/lib/roster-engine/calendar";

export async function seedCalendar(prisma: PrismaClient) {
  const { days, bankHolidayBlocks } = buildCalendar2027();

  for (const block of bankHolidayBlocks) {
    await prisma.bankHolidayBlock.upsert({
      where: { id: block.id },
      create: {
        id: block.id,
        name: block.name,
        friday: new Date(block.friday),
        saturday: new Date(block.saturday),
        sunday: new Date(block.sunday),
        monday: new Date(block.monday),
      },
      update: {
        name: block.name,
        friday: new Date(block.friday),
        saturday: new Date(block.saturday),
        sunday: new Date(block.sunday),
        monday: new Date(block.monday),
      },
    });
  }

  for (const day of days) {
    await prisma.calendarDay.upsert({
      where: { date: new Date(day.date) },
      create: {
        date: new Date(day.date),
        weekLabel: day.weekLabel,
        isPublicHoliday: day.isPublicHoliday,
        holidayName: day.holidayName,
        bankHolidayBlockId: day.bankHolidayBlockId,
        inGeneratorScope: day.inGeneratorScope,
      },
      update: {
        weekLabel: day.weekLabel,
        isPublicHoliday: day.isPublicHoliday,
        holidayName: day.holidayName,
        bankHolidayBlockId: day.bankHolidayBlockId,
        inGeneratorScope: day.inGeneratorScope,
      },
    });
  }

  console.log(`Seeded ${days.length} calendar days and ${bankHolidayBlocks.length} bank holiday blocks.`);
}
