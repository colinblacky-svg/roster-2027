import { prisma } from "@/lib/prisma";
import { loadRosterState } from "@/lib/roster-state";
import { eachDay, mondayOfWeek, type ISODate } from "@/lib/roster-engine/date-utils";
import { validateRoster } from "@/lib/roster-engine/validation";
import { GenerateButton } from "@/components/GenerateButton";
import { UndoButton } from "@/components/UndoButton";
import { InteractiveCalendar, type DayRow } from "@/components/InteractiveCalendar";

export const dynamic = "force-dynamic";

interface LeaveTag {
  consultantId: string;
  leaveType: string;
  abbrev: string;
  colorClass: string;
}

function toISODate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

// §6.1's leave colours.
const LEAVE_TAG_COLOR: Record<string, string> = {
  ANNUAL: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  STUDY: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  PARENTAL: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  MATERNITY: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300",
  MEDICAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
};

const LEAVE_TYPE_LABELS: [type: string, label: string][] = [
  ["ANNUAL", "Annual"],
  ["STUDY", "Study"],
  ["PARENTAL", "Parental"],
  ["MATERNITY", "Maternity"],
  ["MEDICAL", "Medical"],
];

function LeaveLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-black/60 dark:text-white/60">
      <span className="font-medium text-black/40 dark:text-white/40">Leave:</span>
      {LEAVE_TYPE_LABELS.map(([type, label]) => (
        <span key={type} className="flex items-center gap-1.5">
          <span className={`rounded px-1 text-[10px] font-medium ${LEAVE_TAG_COLOR[type]}`}>ABC</span>
          {label}
        </span>
      ))}
    </div>
  );
}

function fmtWhen(d: Date): string {
  return d.toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function CalendarPage() {
  const state = await loadRosterState();
  const consultantById = new Map(state.consultants.map((c) => [c.id, c]));
  const violations = validateRoster(state);

  const alertsByDate = new Map<string, string[]>();
  for (const v of violations) {
    const list = alertsByDate.get(v.date) ?? [];
    list.push(v.message);
    alertsByDate.set(v.date, list);
  }

  const activeLeave = await prisma.leaveRequest.findMany({
    where: { status: { in: ["AUTO_APPLIED", "APPROVED"] } },
    include: { consultant: true },
  });
  const leaveByDate = new Map<string, LeaveTag[]>();
  for (const lr of activeLeave) {
    const tag: LeaveTag = {
      consultantId: lr.consultantId,
      leaveType: lr.leaveType,
      abbrev: lr.consultant.surname.slice(0, 3),
      colorClass: LEAVE_TAG_COLOR[lr.leaveType],
    };
    for (const date of eachDay(toISODate(lr.startDate), toISODate(lr.endDate))) {
      const list = leaveByDate.get(date) ?? [];
      list.push(tag);
      leaveByDate.set(date, list);
    }
  }

  const assignmentsByDate = new Map<string, { first: DayRow["first"]; second: DayRow["second"] }>();
  for (const a of state.assignments) {
    const entry = assignmentsByDate.get(a.date) ?? { first: null, second: null };
    const c = a.consultantId ? consultantById.get(a.consultantId) : undefined;
    const who = c ? { consultantId: c.id, surname: c.surname, specialty: c.specialty } : null;
    if (a.position === "FIRST") entry.first = who;
    else entry.second = who;
    assignmentsByDate.set(a.date, entry);
  }

  const days: DayRow[] = state.calendarDays.map((d) => {
    const assigned = assignmentsByDate.get(d.date);
    return {
      date: d.date,
      weekLabel: d.weekLabel,
      isPublicHoliday: d.isPublicHoliday,
      holidayName: d.holidayName,
      bankHolidayBlockId: d.bankHolidayBlockId,
      inGeneratorScope: d.inGeneratorScope,
      first: assigned?.first ?? null,
      second: assigned?.second ?? null,
      alerts: alertsByDate.get(d.date) ?? [],
      onLeave: leaveByDate.get(d.date) ?? [],
    };
  });

  // Group into Monday-Sunday weeks (the first week may be a partial tail, §3.1).
  const weeks = new Map<ISODate, DayRow[]>();
  for (const day of days) {
    const weekStart = mondayOfWeek(day.date);
    const bucket = weeks.get(weekStart);
    if (bucket) bucket.push(day);
    else weeks.set(weekStart, [day]);
  }
  const weekEntries = [...weeks.entries()];

  const onCallConsultants = state.consultants
    .filter((c) => c.callProportion > 0)
    .map((c) => ({ id: c.id, surname: c.surname }))
    .sort((a, b) => a.surname.localeCompare(b.surname));

  const history = await prisma.commandLogEntry.findMany({
    orderBy: [{ appliedAt: "desc" }],
    take: 30,
  });
  const seenGroups = new Set<string>();
  const historyGroups = history.filter((h) => {
    if (seenGroups.has(h.groupId)) return false;
    seenGroups.add(h.groupId);
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Calendar</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            2027 on-call roster. Week labels (A/B) determine who is available
            each week (§3.1). Click a name to change or remove it directly.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <UndoButton />
        </div>
      </div>

      <LeaveLegend />

      <InteractiveCalendar weekEntries={weekEntries} consultants={onCallConsultants} />

      {historyGroups.length > 0 && (
        <details className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
          <summary className="cursor-pointer font-medium text-black/70 dark:text-white/70">
            Change history ({historyGroups.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {historyGroups.map((h) => (
              <li
                key={h.groupId}
                className={`flex justify-between gap-3 text-xs ${
                  h.undoneAt ? "text-black/35 line-through dark:text-white/30" : "text-black/70 dark:text-white/70"
                }`}
              >
                <span>{h.description}</span>
                <span className="shrink-0 text-black/40 dark:text-white/40">{fmtWhen(h.appliedAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-4 flex flex-col items-start gap-2 border-t border-black/10 pt-6 dark:border-white/15">
        <p className="text-sm text-black/60 dark:text-white/60">
          Regenerating replaces the entire year&apos;s roster from scratch (undoable as one step).
        </p>
        <GenerateButton />
      </div>
    </div>
  );
}
