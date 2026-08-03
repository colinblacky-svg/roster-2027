import { NextResponse } from "next/server";
import { setResidualAndReconcile } from "@/lib/leave-apply";

export async function POST(request: Request) {
  const { consultantId, amount } = (await request.json()) as { consultantId: string; amount: number };
  const result = await setResidualAndReconcile(consultantId, amount);
  return NextResponse.json(result);
}
