// Server-side helpers shared by the leave API routes: applying a booked
// request (charging a bucket, running the on-call auto-swap) and residual
// reconciliation.

import { prisma } from "./prisma";
import { loadRosterState } from "./roster-state";
import { computeAutoSwapPlan } from "./roster-engine/leave-swap";
import { RESIDUAL_DEADLINE } from "./roster-engine/leave-engine";

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function residualBalance(consultantId: string): Promise<number> {
  const txns = await prisma.leaveTransaction.findMany({
    where: { consultantId, bucket: "RESIDUAL_2026" },
  });
  return txns.reduce((sum, t) => sum + t.amount, 0);
}

/** Charges the request's days to the right bucket (residual-first if any
 * remains and the leave starts before the deadline, §6.2) and runs the
 * on-call auto-swap for any assignments the leave now covers (§6.6). */
export async function finalizeLeaveApplication(leaveRequestId: string) {
  const request = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: leaveRequestId } });
  const startDate = toISO(request.startDate);
  const endDate = toISO(request.endDate);

  if (request.leaveType === "ANNUAL" || request.leaveType === "STUDY") {
    const residual = await residualBalance(request.consultantId);
    const useResidual = residual > 0 && startDate < RESIDUAL_DEADLINE;
    const bucket = useResidual
      ? "RESIDUAL_2026"
      : request.leaveType === "ANNUAL"
        ? "ENTITLEMENT_2027_ANNUAL"
        : "ENTITLEMENT_2027_STUDY";

    await prisma.leaveTransaction.create({
      data: {
        consultantId: request.consultantId,
        leaveRequestId: request.id,
        bucket,
        amount: -request.daysCharged,
        reason: useResidual ? "booked (drawn from 2026 residual)" : "booked",
      },
    });
  }

  const state = await loadRosterState();
  const mutations = computeAutoSwapPlan(state, request.consultantId, startDate, endDate);
  const dutyReassignments = new Map<string, string>(); // dutyId -> new consultantId
  for (const m of mutations) {
    await prisma.assignment.update({
      where: { date_position: { date: new Date(m.date), position: m.position } },
      data: { consultantId: m.newConsultantId, source: "SWAP" },
    });
    if (m.weekendDutyId) dutyReassignments.set(m.weekendDutyId, m.newConsultantId);
  }
  // Keep WeekendDuty.consultantId in sync — the ledger and validation key off
  // the duty record, not the individual Assignment rows, for weekend/BH work.
  for (const [dutyId, newConsultantId] of dutyReassignments) {
    await prisma.weekendDuty.update({ where: { id: dutyId }, data: { consultantId: newConsultantId } });
  }

  return { swapCount: mutations.length };
}

/** Sets a consultant's 2026 residual balance to `amount` and retrospectively
 * reconciles: any ANNUAL/STUDY leave already booked before 10 Apr 2027 that
 * drew from the 2027 entitlement gets converted to draw from residual
 * instead, up to however much residual is now available (§6.2). */
export async function setResidualAndReconcile(consultantId: string, amount: number) {
  const current = await residualBalance(consultantId);
  const delta = amount - current;
  if (delta !== 0) {
    await prisma.leaveTransaction.create({
      data: {
        consultantId,
        bucket: "RESIDUAL_2026",
        amount: delta,
        reason: `residual balance set to ${amount}`,
      },
    });
  }

  let available = await residualBalance(consultantId);
  if (available <= 0) return { reconciled: 0 };

  const candidates = await prisma.leaveRequest.findMany({
    where: {
      consultantId,
      leaveType: { in: ["ANNUAL", "STUDY"] },
      status: { in: ["AUTO_APPLIED", "APPROVED"] },
      startDate: { lt: new Date(RESIDUAL_DEADLINE) },
    },
    orderBy: { startDate: "asc" },
  });

  let reconciled = 0;
  for (const req of candidates) {
    if (available <= 0) break;
    const entitlementBucket = req.leaveType === "ANNUAL" ? "ENTITLEMENT_2027_ANNUAL" : "ENTITLEMENT_2027_STUDY";
    const existing = await prisma.leaveTransaction.findFirst({
      where: { leaveRequestId: req.id, bucket: entitlementBucket, amount: { lt: 0 } },
    });
    if (!existing) continue; // already on residual, or not charged to entitlement at all
    if (available < req.daysCharged) continue; // not enough residual to cover this one yet

    await prisma.leaveTransaction.create({
      data: {
        consultantId,
        leaveRequestId: req.id,
        bucket: entitlementBucket,
        amount: req.daysCharged,
        reason: "reconciled to 2026 residual",
      },
    });
    await prisma.leaveTransaction.create({
      data: {
        consultantId,
        leaveRequestId: req.id,
        bucket: "RESIDUAL_2026",
        amount: -req.daysCharged,
        reason: "reconciled from 2027 entitlement",
      },
    });
    available -= req.daysCharged;
    reconciled += 1;
  }

  return { reconciled };
}
