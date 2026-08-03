import { prisma } from "@/lib/prisma";
import { WEEKDAY_LABELS, parseSecondaryDays } from "@/lib/weekdays";

export const dynamic = "force-dynamic";

const SPECIALTY_DOT: Record<string, string> = {
  CARDIAC: "bg-red-600",
  GENERAL: "bg-blue-600",
  NONE: "bg-zinc-400",
};

function formatDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
}

function PatternRow({ pattern }: { pattern: boolean[] }) {
  return (
    <div className="flex gap-1">
      {pattern.map((isIn, i) => (
        <span
          key={i}
          className={`flex h-6 w-9 items-center justify-center rounded text-[11px] font-medium ${
            isIn
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
          }`}
        >
          {isIn ? "IN" : "OUT"}
        </span>
      ))}
    </div>
  );
}

export default async function PersonnelPage() {
  const consultants = await prisma.consultant.findMany({ orderBy: { surname: "asc" } });

  const onCall = consultants.filter((c) => c.callProportion > 0);
  const nonCall = consultants.filter((c) => c.callProportion === 0);

  function renderTable(rows: typeof consultants) {
    return (
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-black/[.02] text-left dark:border-white/15 dark:bg-white/[.03]">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Prop.</th>
              <th className="px-3 py-2 font-medium">Week A (M-T-W-T-F)</th>
              <th className="px-3 py-2 font-medium">Week B (M-T-W-T-F)</th>
              <th className="px-3 py-2 font-medium">Preferred</th>
              <th className="px-3 py-2 font-medium">Secondary</th>
              <th className="px-3 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const weekA = [c.weekAMon, c.weekATue, c.weekAWed, c.weekAThu, c.weekAFri];
              const weekB = [c.weekBMon, c.weekBTue, c.weekBWed, c.weekBThu, c.weekBFri];
              const secondary = parseSecondaryDays(c.secondaryDays);
              const notes: string[] = [];
              if (c.standingNotes) notes.push(c.standingNotes);
              if (c.firstEligibleDate) {
                notes.push(
                  `Maternity return: first eligible for call ${formatDate(c.firstEligibleDate)}${
                    !c.rampComplete ? " (ramp not yet complete)" : ""
                  }`
                );
              }
              if (c.excludeFromBankHoliday) {
                notes.push("Excluded from bank holiday duty (§10.1)");
              }

              return (
                <tr
                  key={c.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${SPECIALTY_DOT[c.specialty]}`}
                        aria-hidden
                      />
                      {c.surname}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{c.callProportion.toFixed(1)}</td>
                  <td className="px-3 py-2">
                    <PatternRow pattern={weekA} />
                  </td>
                  <td className="px-3 py-2">
                    <PatternRow pattern={weekB} />
                  </td>
                  <td className="px-3 py-2">
                    {c.preferredDay ? WEEKDAY_LABELS[c.preferredDay] : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {secondary.length > 0
                      ? secondary.map((d) => WEEKDAY_LABELS[d]).join(", ")
                      : "None"}
                  </td>
                  <td className="px-3 py-2 text-black/60 dark:text-white/60">
                    {notes.length > 0 ? notes.join("; ") : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Personnel</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          {onCall.length} on-call consultants ({onCall.filter((c) => c.specialty === "CARDIAC").length}{" "}
          cardiac, {onCall.filter((c) => c.specialty === "GENERAL").length} general), {nonCall.length}{" "}
          with no on-call duty.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          On-call roster ({onCall.length})
        </h2>
        {renderTable(onCall)}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          No on-call duty ({nonCall.length})
        </h2>
        {renderTable(nonCall)}
      </section>
    </div>
  );
}
