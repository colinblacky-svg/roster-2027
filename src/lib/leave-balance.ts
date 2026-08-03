import { prisma } from "./prisma";
import { entitlementCaps } from "./roster-engine/leave-engine";

export interface LeaveBalanceRow {
  consultantId: string;
  surname: string;
  employmentFraction: number;
  annualCap: number;
  annualUsed: number;
  studyCap: number;
  studyUsed: number;
  residualBalance: number;
}

export async function computeLeaveBalances(): Promise<LeaveBalanceRow[]> {
  const consultants = await prisma.consultant.findMany({ orderBy: { surname: "asc" } });
  const transactions = await prisma.leaveTransaction.findMany();

  return consultants.map((c) => {
    const caps = entitlementCaps(c.employmentFraction);
    const own = transactions.filter((t) => t.consultantId === c.id);
    const annualUsed = -own.filter((t) => t.bucket === "ENTITLEMENT_2027_ANNUAL").reduce((s, t) => s + t.amount, 0);
    const studyUsed = -own.filter((t) => t.bucket === "ENTITLEMENT_2027_STUDY").reduce((s, t) => s + t.amount, 0);
    const residualBalance = own.filter((t) => t.bucket === "RESIDUAL_2026").reduce((s, t) => s + t.amount, 0);

    return {
      consultantId: c.id,
      surname: c.surname,
      employmentFraction: c.employmentFraction,
      annualCap: caps.annual,
      annualUsed,
      studyCap: caps.study,
      studyUsed,
      residualBalance,
    };
  });
}
