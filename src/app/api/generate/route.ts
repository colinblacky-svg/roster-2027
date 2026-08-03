import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadRosterState } from "@/lib/roster-state";
import { generateRoster } from "@/lib/roster-engine/generator";

export async function POST() {
  const state = await loadRosterState();
  const result = generateRoster(state.consultants, state.calendarDays, state.leaveIntervals);

  await prisma.$transaction([
    prisma.assignment.deleteMany({}),
    prisma.weekendDuty.deleteMany({}),
    prisma.weekendDuty.createMany({
      data: result.weekendDuties.map((wd) => ({
        id: wd.id,
        pattern: wd.pattern,
        consultantId: wd.consultantId,
        fraction: wd.fraction,
        cohortWeekLabel: wd.cohortWeekLabel,
      })),
    }),
    prisma.assignment.createMany({
      data: result.assignments.map((a) => ({
        date: new Date(a.date),
        position: a.position,
        consultantId: a.consultantId,
        weekendDutyId: a.weekendDutyId,
        source: a.source,
      })),
    }),
  ]);

  return NextResponse.json({
    assignmentCount: result.assignments.length,
    weekendDutyCount: result.weekendDuties.length,
    warnings: result.warnings,
  });
}
