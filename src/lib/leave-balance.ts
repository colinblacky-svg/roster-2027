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
  /** Net days actually drawn from the 2026 residual bucket so far — every
   * transaction tied to a real leave request (booking, reversal, or
   * reconciliation), as opposed to the admin balance-setting transactions
   * (which carry no leaveRequestId) that only add/remove capacity. */
  residualUsed: number;
  lieuBalance: number;
}

export async function computeLeaveBalances(): Promise<LeaveBalanceRow[]> {
  const consultants = await prisma.consultant.findMany({ orderBy: { surname: "asc" } });
  const transactions = await prisma.leaveTransaction.findMany();

  return consultants.map((c) => {
    const caps = entitlementCaps(c.employmentFraction);
    const own = transactions.filter((t) => t.consultantId === c.id);
    const annualUsed = -own.filter((t) => t.bucket === "ENTITLEMENT_2027_ANNUAL").reduce((s, t) => s + t.amount, 0);
    const studyUsed = -own.filter((t) => t.bucket === "ENTITLEMENT_2027_STUDY").reduce((s, t) => s + t.amount, 0);
    const residualTxns = own.filter((t) => t.bucket === "RESIDUAL_2026");
    const residualBalance = residualTxns.reduce((s, t) => s + t.amount, 0);
    const residualUsed = -residualTxns
      .filter((t) => t.leaveRequestId !== null)
      .reduce((s, t) => s + t.amount, 0);
    const lieuBalance = own.filter((t) => t.bucket === "LIEU").reduce((s, t) => s + t.amount, 0);

    return {
      consultantId: c.id,
      surname: c.surname,
      employmentFraction: c.employmentFraction,
      annualCap: caps.annual,
      annualUsed,
      studyCap: caps.study,
      studyUsed,
      residualBalance,
      residualUsed,
      lieuBalance,
    };
  });
}
