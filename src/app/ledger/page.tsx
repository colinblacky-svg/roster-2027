import { loadRosterState } from "@/lib/roster-state";
import { computeLedger } from "@/lib/roster-engine/ledger";

export const dynamic = "force-dynamic";

const SPECIALTY_DOT: Record<string, string> = {
  CARDIAC: "bg-red-600",
  GENERAL: "bg-blue-600",
  NONE: "bg-zinc-400",
};

function fmt(n: number): string {
  return n.toFixed(1);
}

export default async function LedgerPage() {
  const state = await loadRosterState();
  const rows = computeLedger(state);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Ledger</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Expected vs. actual call counts, pro-rated by call proportion and
          year availability (§7.2). Updates live as the roster changes.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-black/[.02] text-left dark:border-white/15 dark:bg-white/[.03]">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 text-right font-medium">Prop.</th>
              <th className="px-3 py-2 text-right font-medium">Avail.</th>
              <th className="px-3 py-2 text-right font-medium">Expected</th>
              <th className="px-3 py-2 text-right font-medium">Actual</th>
              <th className="px-3 py-2 text-right font-medium">1st</th>
              <th className="px-3 py-2 text-right font-medium">2nd</th>
              <th className="px-3 py-2 text-right font-medium">Midweek (exp/act)</th>
              <th className="px-3 py-2 text-right font-medium">Weekends (exp/act)</th>
              <th className="px-3 py-2 text-right font-medium">121</th>
              <th className="px-3 py-2 text-right font-medium">212</th>
              <th className="px-3 py-2 text-right font-medium">Variance</th>
              <th className="px-3 py-2 text-right font-medium">Total calls</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.consultantId}
                className="border-b border-black/5 last:border-0 dark:border-white/10"
              >
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${SPECIALTY_DOT[r.specialty]}`}
                      aria-hidden
                    />
                    {r.surname}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.callProportion)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.availabilityFraction)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.expectedTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.actualTotal)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.firstCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.secondCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmt(r.midweekExpected)} / {r.midweekActual}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmt(r.weekendExpected)} / {fmt(r.weekendActual)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.count121}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.count212}</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums font-medium ${
                    r.materialVariance
                      ? r.variance > 0
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-red-700 dark:text-red-400"
                      : "text-black/60 dark:text-white/60"
                  }`}
                >
                  {r.variance > 0 ? "+" : ""}
                  {fmt(r.variance)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{r.totalCallDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
