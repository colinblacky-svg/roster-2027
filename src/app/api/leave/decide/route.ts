import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finalizeLeaveApplication } from "@/lib/leave-apply";

export async function POST(request: Request) {
  const { leaveRequestId, decision } = (await request.json()) as {
    leaveRequestId: string;
    decision: "APPROVE" | "REJECT";
  };

  if (decision === "REJECT") {
    await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    return NextResponse.json({ status: "REJECTED" });
  }

  await prisma.leaveRequest.update({
    where: { id: leaveRequestId },
    data: { status: "APPROVED", decidedAt: new Date() },
  });
  // Undo here only covers the auto-swap this triggers (restoring the
  // original on-call assignments) — reverting the approval decision itself
  // isn't wired up, same as reject.
  const result = await finalizeLeaveApplication(leaveRequestId, randomUUID(), 1, `Approved leave request ${leaveRequestId}`);
  return NextResponse.json({ status: "APPROVED", ...result });
}
