// The undo/history backbone (§9): every interactive edit is one or more
// mutations sharing a groupId. Undo always operates at groupId granularity —
// that's what makes a swap (2 legs), a move (2 legs), or a leave booking plus
// its auto-swaps collapse to a single undo step "for free", per the
// CommandLogEntry design.

import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import type { Position } from "./roster-engine/types";

export interface SlotMutation {
  date: string; // ISODate
  position: Position;
  toConsultantId: string | null;
}

export type CommandType =
  | "ASSIGN_SLOT"
  | "CLEAR_SLOT"
  | "MOVE_ASSIGNMENT"
  | "SWAP_ASSIGNMENTS"
  | "APPLY_LEAVE_REQUEST"
  | "CANCEL_LEAVE_REQUEST"
  | "AUTO_SWAP_FOR_LEAVE";

interface SlotPayload {
  date: string;
  position: Position;
  consultantId: string | null;
  /** Set when this leg belongs to a whole weekend/BH duty — undo also
   * restores WeekendDuty.consultantId, which the ledger and validation key
   * off instead of the individual Assignment rows. */
  weekendDutyId?: string | null;
}

interface ApplyLeavePayload {
  leaveRequestId: string;
}

interface CancelLeavePayload {
  leaveRequestId: string;
  previousStatus: string;
  reversalTransactionIds: string[];
}

export async function logCommand(
  groupId: string,
  sequenceInGroup: number,
  commandType: CommandType,
  forwardPayload: unknown,
  inversePayload: unknown,
  description: string
) {
  await prisma.commandLogEntry.create({
    data: {
      groupId,
      sequenceInGroup,
      commandType,
      forwardPayload: JSON.stringify(forwardPayload),
      inversePayload: JSON.stringify(inversePayload),
      description,
    },
  });
}

export async function applySlotCommand(commandType: CommandType, mutations: SlotMutation[], description: string) {
  const groupId = randomUUID();

  for (let i = 0; i < mutations.length; i++) {
    const m = mutations[i];
    const existing = await prisma.assignment.findUnique({
      where: { date_position: { date: new Date(m.date), position: m.position } },
    });
    const fromConsultantId = existing?.consultantId ?? null;

    // Out-of-generator-scope dates (§4.7's hand-assigned block, 1-3 Jan)
    // never got an Assignment row from the generator — create it on first
    // manual edit rather than silently no-op-ing.
    await prisma.assignment.upsert({
      where: { date_position: { date: new Date(m.date), position: m.position } },
      create: { date: new Date(m.date), position: m.position, consultantId: m.toConsultantId, source: "MANUAL" },
      update: { consultantId: m.toConsultantId, source: "MANUAL" },
    });

    const forwardPayload: SlotPayload = { date: m.date, position: m.position, consultantId: m.toConsultantId };
    const inversePayload: SlotPayload = { date: m.date, position: m.position, consultantId: fromConsultantId };

    await logCommand(groupId, i + 1, commandType, forwardPayload, inversePayload, description);
  }

  return { groupId };
}

async function undoEntry(entry: { commandType: string; inversePayload: string }) {
  switch (entry.commandType) {
    case "ASSIGN_SLOT":
    case "CLEAR_SLOT":
    case "MOVE_ASSIGNMENT":
    case "SWAP_ASSIGNMENTS":
    case "AUTO_SWAP_FOR_LEAVE": {
      const inverse = JSON.parse(entry.inversePayload) as SlotPayload;
      await prisma.assignment.update({
        where: { date_position: { date: new Date(inverse.date), position: inverse.position } },
        data: { consultantId: inverse.consultantId, source: "MANUAL" },
      });
      if (inverse.weekendDutyId && inverse.consultantId) {
        await prisma.weekendDuty.update({
          where: { id: inverse.weekendDutyId },
          data: { consultantId: inverse.consultantId },
        });
      }
      break;
    }
    case "APPLY_LEAVE_REQUEST": {
      const { leaveRequestId } = JSON.parse(entry.inversePayload) as ApplyLeavePayload;
      await prisma.leaveTransaction.deleteMany({ where: { leaveRequestId } });
      await prisma.leaveRequest.delete({ where: { id: leaveRequestId } });
      break;
    }
    case "CANCEL_LEAVE_REQUEST": {
      const { leaveRequestId, previousStatus, reversalTransactionIds } = JSON.parse(
        entry.inversePayload
      ) as CancelLeavePayload;
      if (reversalTransactionIds.length > 0) {
        await prisma.leaveTransaction.deleteMany({ where: { id: { in: reversalTransactionIds } } });
      }
      await prisma.leaveRequest.update({
        where: { id: leaveRequestId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- previousStatus round-trips the LeaveStatus enum through JSON
        data: { status: previousStatus as any, decidedAt: null },
      });
      break;
    }
  }
}

export async function undoLastCommand() {
  const last = await prisma.commandLogEntry.findFirst({
    where: { undoneAt: null },
    orderBy: { appliedAt: "desc" },
  });
  if (!last) return { undone: false as const };

  const group = await prisma.commandLogEntry.findMany({
    where: { groupId: last.groupId, undoneAt: null },
    orderBy: { sequenceInGroup: "desc" },
  });

  for (const entry of group) {
    await undoEntry(entry);
    await prisma.commandLogEntry.update({ where: { id: entry.id }, data: { undoneAt: new Date() } });
  }

  return { undone: true as const, description: last.description };
}
