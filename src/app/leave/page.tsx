import { prisma } from "@/lib/prisma";
import { computeLeaveBalances } from "@/lib/leave-balance";
import { LeaveRequestForm } from "@/components/LeaveRequestForm";
import { BalanceForm } from "@/components/BalanceForm";
import { LeaveDecisionButtons } from "@/components/LeaveDecisionButtons";
import { UndoButton } from "@/components/UndoButton";

export const dynamic = "force-dynamic";

const LEAVE_COLORS: Record<string, string> = {
  ANNUAL: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  STUDY: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  PARENTAL: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  MATERNITY: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300",
  MEDICAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  ROSTERED: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
};

const STATUS_COLORS: Record<string, string> = {
  AUTO_APPLIED: "text-emerald-700 dark:text-emerald-400",
  APPROVED: "text-emerald-700 dark:text-emerald-400",
  PENDING_APPROVAL: "text-amber-700 dark:text-amber-400",
  REJECTED: "text-red-700 dark:text-red-400",
  CANCELLED: "text-black/40 dark:text-white/40",
};

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function LeavePage() {
  const consultants = await prisma.consultant.findMany({
    orderBy: { surname: "asc" },
    select: { id: true, surname: true },
  });
  const balances = await computeLeaveBalances();
  const requests = await prisma.leaveRequest.findMany({
    include: { consultant: true },
    orderBy: { startDate: "desc" },
    take: 50,
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Leave</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Leave requests, balances, and the 6-person cap (§6). Covers all 29
            consultants, including the three with no on-call duty.
          </p>
        </div>
        <UndoButton />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <LeaveRequestForm consultants={consultants} />
        <div className="flex flex-col gap-4">
          <BalanceForm
            consultants={consultants}
            title="2026 residual leave (§6.2)"
            description="Must be used before 10 Apr 2027 and takes priority over 2027 entitlement and lieu days. Setting this retroactively converts any pre-10-Apr 2027 leave already booked back to residual."
            fieldLabel="Residual days"
            submitLabel="Set residual"
            endpoint="/api/leave/residual"
            reconciledNoun="residual"
          />
          <BalanceForm
            consultants={consultants}
            title="Lieu days"
            description="Usable any time in 2027, applied to annual leave after residual but before 2027 entitlement. Setting this retroactively converts any annual leave already booked from 2027 entitlement to lieu days."
            fieldLabel="Lieu days"
            submitLabel="Set lieu balance"
            endpoint="/api/leave/lieu"
            reconciledNoun="lieu days"
          />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Balances
        </h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full min-w-[850px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-black/[.02] text-left dark:border-white/15 dark:bg-white/[.03]">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 text-right font-medium">Annual used/cap</th>
                <th className="px-3 py-2 text-right font-medium">Study used/cap</th>
                <th className="px-3 py-2 text-right font-medium">Residual balance</th>
                <th className="px-3 py-2 text-right font-medium">Residual used</th>
                <th className="px-3 py-2 text-right font-medium">Lieu balance</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.consultantId} className="border-b border-black/5 last:border-0 dark:border-white/10">
                  <td className="px-3 py-2 font-medium">{b.surname}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {b.annualUsed} / {b.annualCap}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {b.studyUsed} / {b.studyCap}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.residualBalance}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.residualUsed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.lieuBalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Requests
        </h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-black/[.02] text-left dark:border-white/15 dark:bg-white/[.03]">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Dates</th>
                <th className="px-3 py-2 text-right font-medium">Days</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-black/5 last:border-0 dark:border-white/10">
                  <td className="px-3 py-2 font-medium">{r.consultant.surname}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${LEAVE_COLORS[r.leaveType]}`}>
                      {r.leaveType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-black/70 dark:text-white/70">
                    {fmtDate(r.startDate)} → {fmtDate(r.endDate)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.daysCharged}</td>
                  <td className={`px-3 py-2 font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</td>
                  <td className="px-3 py-2">
                    {r.status === "PENDING_APPROVAL" && <LeaveDecisionButtons leaveRequestId={r.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
