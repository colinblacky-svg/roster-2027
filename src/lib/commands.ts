// The undo/history backbone (§9): every interactive edit is one or more
// SlotMutations sharing a groupId. Undo always operates at groupId
// granularity — that's what makes a swap (2 legs) or a move (2 legs)
// collapse to a single undo step "for free", per the CommandLogEntry design.

import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import type { Position } from "./roster-engine/types";

export interface SlotMutation {
  date: string; // ISODate
  position: Position;
  toConsultantId: string | null;
}

type CommandType = "ASSIGN_SLOT" | "CLEAR_SLOT" | "MOVE_ASSIGNMENT" | "SWAP_ASSIGNMENTS";

interface SlotPayload {
  date: string;
  position: Position;
  consultantId: string | null;
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

    await prisma.commandLogEntry.create({
      data: {
        groupId,
        sequenceInGroup: i + 1,
        commandType,
        forwardPayload: JSON.stringify(forwardPayload),
        inversePayload: JSON.stringify(inversePayload),
        description,
      },
    });
  }

  return { groupId };
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
    const inverse = JSON.parse(entry.inversePayload) as SlotPayload;
    await prisma.assignment.update({
      where: { date_position: { date: new Date(inverse.date), position: inverse.position } },
      data: { consultantId: inverse.consultantId, source: "MANUAL" },
    });
    await prisma.commandLogEntry.update({ where: { id: entry.id }, data: { undoneAt: new Date() } });
  }

  return { undone: true as const, description: last.description };
}
