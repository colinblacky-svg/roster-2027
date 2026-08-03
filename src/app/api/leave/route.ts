import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadRosterState } from "@/lib/roster-state";
import { finalizeLeaveApplication } from "@/lib/leave-apply";
import { chargeDaysFor } from "@/lib/roster-engine/leave-engine";
import { eachDay, type ISODate } from "@/lib/roster-engine/date-utils";

function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { consultantId, startDate, endDate, leaveType, bookingOrCancelling } = body as {
    consultantId: string;
    startDate: ISODate;
    endDate: ISODate;
    leaveType: "ANNUAL" | "STUDY" | "PARENTAL" | "MATERNITY" | "MEDICAL";
    bookingOrCancelling: "BOOK" | "CANCEL";
  };

  if (bookingOrCancelling === "CANCEL") {
    const existing = await prisma.leaveRequest.findMany({
      where: {
        consultantId,
        leaveType,
        status: { in: ["AUTO_APPLIED", "APPROVED", "PENDING_APPROVAL"] },
        startDate: { lte: new Date(endDate) },
        endDate: { gte: new Date(startDate) },
      },
    });
    for (const req of existing) {
      await prisma.leaveRequest.update({
        where: { id: req.id },
        data: { status: "CANCELLED", decidedAt: new Date() },
      });
      const txns = await prisma.leaveTransaction.findMany({ where: { leaveRequestId: req.id } });
      for (const t of txns) {
        await prisma.leaveTransaction.create({
          data: {
            consultantId,
            leaveRequestId: req.id,
            bucket: t.bucket,
            amount: -t.amount,
            reason: `reversal of: ${t.reason}`,
          },
        });
      }
    }
    return NextResponse.json({ cancelled: existing.length });
  }

  const state = await loadRosterState();
  const consultantData = state.consultants.find((c) => c.id === consultantId);
  if (!consultantData) {
    return NextResponse.json({ error: "Consultant not found" }, { status: 404 });
  }
  const calendarByDate = new Map(state.calendarDays.map((d) => [d.date, d]));
  const daysCharged = chargeDaysFor(consultantData, startDate, endDate, calendarByDate);

  let exceedsCap = false;
  if (leaveType !== "MATERNITY") {
    const activeLeave = await prisma.leaveRequest.findMany({
      where: {
        status: { in: ["AUTO_APPLIED", "APPROVED"] },
        leaveType: { not: "MATERNITY" },
        startDate: { lte: new Date(endDate) },
        endDate: { gte: new Date(startDate) },
      },
    });
    for (const date of eachDay(startDate, endDate)) {
      const count =
        activeLeave.filter((r) => toISO(r.startDate) <= date && toISO(r.endDate) >= date).length + 1;
      if (count > 6) {
        exceedsCap = true;
        break;
      }
    }
  }

  const status = exceedsCap ? "PENDING_APPROVAL" : "AUTO_APPLIED";
  const leaveRequest = await prisma.leaveRequest.create({
    data: {
      consultantId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      leaveType,
      bookingOrCancelling: "BOOK",
      status,
      daysCharged,
    },
  });

  let swapCount = 0;
  if (status === "AUTO_APPLIED") {
    const result = await finalizeLeaveApplication(leaveRequest.id);
    swapCount = result.swapCount;
  }

  return NextResponse.json({ leaveRequest, pendingApproval: exceedsCap, swapCount });
}

export async function GET() {
  const requests = await prisma.leaveRequest.findMany({
    include: { consultant: true },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(requests);
}
