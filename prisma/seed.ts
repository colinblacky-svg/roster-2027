import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { CONSULTANTS } from "./seed-data";
import { seedCalendar } from "./seed-calendar";
import { seedMaternityLeave } from "./seed-maternity-leave";

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const c of CONSULTANTS) {
    const isReturner = Boolean(c.returnToWorkDate);
    await prisma.consultant.upsert({
      where: { surname: c.surname },
      create: {
        surname: c.surname,
        specialty: c.specialty,
        callProportion: c.callProportion,
        employmentFraction: c.employmentFraction,
        weekAMon: c.weekA[0],
        weekATue: c.weekA[1],
        weekAWed: c.weekA[2],
        weekAThu: c.weekA[3],
        weekAFri: c.weekA[4],
        weekBMon: c.weekB[0],
        weekBTue: c.weekB[1],
        weekBWed: c.weekB[2],
        weekBThu: c.weekB[3],
        weekBFri: c.weekB[4],
        preferredDay: c.preferredDay,
        secondaryDays: JSON.stringify(c.secondaryDays),
        returnToWorkDate: c.returnToWorkDate ? new Date(c.returnToWorkDate) : null,
        firstEligibleDate: c.firstEligibleDate ? new Date(c.firstEligibleDate) : null,
        rampComplete: !isReturner,
        excludeFromBankHoliday: c.excludeFromBankHoliday ?? false,
      },
      update: {
        specialty: c.specialty,
        callProportion: c.callProportion,
        employmentFraction: c.employmentFraction,
        weekAMon: c.weekA[0],
        weekATue: c.weekA[1],
        weekAWed: c.weekA[2],
        weekAThu: c.weekA[3],
        weekAFri: c.weekA[4],
        weekBMon: c.weekB[0],
        weekBTue: c.weekB[1],
        weekBWed: c.weekB[2],
        weekBThu: c.weekB[3],
        weekBFri: c.weekB[4],
        preferredDay: c.preferredDay,
        secondaryDays: JSON.stringify(c.secondaryDays),
        returnToWorkDate: c.returnToWorkDate ? new Date(c.returnToWorkDate) : null,
        firstEligibleDate: c.firstEligibleDate ? new Date(c.firstEligibleDate) : null,
        excludeFromBankHoliday: c.excludeFromBankHoliday ?? false,
      },
    });
  }

  const count = await prisma.consultant.count();
  console.log(`Seeded ${count} consultants.`);

  await seedCalendar(prisma);
  await seedMaternityLeave(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
