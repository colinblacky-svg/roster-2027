import { NextResponse } from "next/server";
import { undoLastCommand } from "@/lib/commands";

export async function POST() {
  const result = await undoLastCommand();
  return NextResponse.json(result);
}
