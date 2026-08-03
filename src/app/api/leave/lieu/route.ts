import { NextResponse } from "next/server";
import { setLieuAndReconcile } from "@/lib/leave-apply";

export async function POST(request: Request) {
  const { consultantId, amount } = (await request.json()) as { consultantId: string; amount: number };
  const result = await setLieuAndReconcile(consultantId, amount);
  return NextResponse.json(result);
}
