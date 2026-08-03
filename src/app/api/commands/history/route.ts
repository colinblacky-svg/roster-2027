import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const entries = await prisma.commandLogEntry.findMany({
    orderBy: [{ appliedAt: "desc" }, { sequenceInGroup: "asc" }],
    take: 100,
  });

  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = groups.get(e.groupId) ?? [];
    list.push(e);
    groups.set(e.groupId, list);
  }

  const summary = [...groups.entries()].map(([groupId, group]) => ({
    groupId,
    commandType: group[0].commandType,
    description: group[0].description,
    appliedAt: group[0].appliedAt,
    undone: group.every((e) => e.undoneAt !== null),
    legCount: group.length,
  }));

  return NextResponse.json(summary);
}
