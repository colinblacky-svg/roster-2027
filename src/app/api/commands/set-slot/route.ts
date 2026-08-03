import { NextResponse } from "next/server";
import { applySlotCommand, type SlotMutation } from "@/lib/commands";

export async function POST(request: Request) {
  const body = await request.json();
  const { commandType, mutations, description } = body as {
    commandType: "ASSIGN_SLOT" | "CLEAR_SLOT" | "MOVE_ASSIGNMENT" | "SWAP_ASSIGNMENTS";
    mutations: SlotMutation[];
    description: string;
  };

  if (!mutations || mutations.length === 0) {
    return NextResponse.json({ error: "No mutations provided" }, { status: 400 });
  }

  const result = await applySlotCommand(commandType, mutations, description);
  return NextResponse.json(result);
}
