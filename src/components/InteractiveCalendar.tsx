"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isoWeekday, monthLabel, type ISODate } from "@/lib/roster-engine/date-utils";
import { LEAVE_CAP } from "@/lib/roster-engine/leave-engine";

export interface DayRow {
  date: ISODate;
  weekLabel: "A" | "B";
  isPublicHoliday: boolean;
  holidayName: string | null;
  bankHolidayBlockId: string | null;
  inGeneratorScope: boolean;
  first: { consultantId: string | null; surname: string; specialty: string } | null;
  second: { consultantId: string | null; surname: string; specialty: string } | null;
  alerts: string[];
  onLeave: { consultantId: string; leaveType: string; abbrev: string; colorClass: string }[];
}

interface ConsultantOption {
  id: string;
  surname: string;
}

const SPECIALTY_DOT: Record<string, string> = {
  CARDIAC: "bg-red-600",
  GENERAL: "bg-blue-600",
  NONE: "bg-zinc-400",
};

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Position = "FIRST" | "SECOND";
interface SlotKey {
  date: ISODate;
  position: Position;
}

function slotKeyEq(a: SlotKey | null, b: SlotKey): boolean {
  return !!a && a.date === b.date && a.position === b.position;
}

interface DragPayload extends SlotKey {
  consultantId: string;
  surname: string;
}

const DRAG_MIME = "application/x-roster-slot";

export function InteractiveCalendar({
  weekEntries,
  consultants,
}: {
  weekEntries: [ISODate, DayRow[]][];
  consultants: ConsultantOption[];
}) {
  const router = useRouter();
  const [picking, setPicking] = useState<SlotKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterId, setFilterId] = useState("");
  const [dragOverKey, setDragOverKey] = useState<SlotKey | null>(null);

  async function sendCommand(
    commandType: "ASSIGN_SLOT" | "CLEAR_SLOT" | "MOVE_ASSIGNMENT" | "SWAP_ASSIGNMENTS",
    mutations: { date: ISODate; position: Position; toConsultantId: string | null }[],
    description: string
  ) {
    setBusy(true);
    try {
      await fetch("/api/commands/set-slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commandType, mutations, description }),
      });
      router.refresh();
    } finally {
      setBusy(false);
      setPicking(null);
    }
  }

  function handleAssign(key: SlotKey, consultantId: string) {
    const consultant = consultants.find((c) => c.id === consultantId);
    void sendCommand(
      "ASSIGN_SLOT",
      [{ date: key.date, position: key.position, toConsultantId: consultantId }],
      `Assigned ${consultant?.surname ?? "?"} to ${key.date} (${key.position === "FIRST" ? "1st" : "2nd"})`
    );
  }

  function handleClear(key: SlotKey) {
    void sendCommand(
      "CLEAR_SLOT",
      [{ date: key.date, position: key.position, toConsultantId: null }],
      `Cleared ${key.date} (${key.position === "FIRST" ? "1st" : "2nd"})`
    );
  }

  function handleDrop(source: DragPayload, target: SlotKey, targetPerson: { consultantId: string | null; surname: string } | null) {
    if (slotKeyEq(target, source)) return;

    if (targetPerson?.consultantId) {
      void sendCommand(
        "SWAP_ASSIGNMENTS",
        [
          { date: source.date, position: source.position, toConsultantId: targetPerson.consultantId },
          { date: target.date, position: target.position, toConsultantId: source.consultantId },
        ],
        `Swapped ${source.surname} ↔ ${targetPerson.surname}`
      );
    } else {
      void sendCommand(
        "MOVE_ASSIGNMENT",
        [
          { date: source.date, position: source.position, toConsultantId: null },
          { date: target.date, position: target.position, toConsultantId: source.consultantId },
        ],
        `Moved ${source.surname} from ${source.date} to ${target.date}`
      );
    }
  }

  function OnCallSlot({ day, position, label }: { day: DayRow; position: Position; label: string }) {
    const person = position === "FIRST" ? day.first : day.second;
    const key: SlotKey = { date: day.date, position };
    const isPicking = slotKeyEq(picking, key);

    if (isPicking) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-black/40 dark:text-white/40">{label}:</span>
          <select
            autoFocus
            defaultValue={person?.consultantId ?? ""}
            onChange={(e) => {
              if (e.target.value === "__clear__") handleClear(key);
              else if (e.target.value) handleAssign(key, e.target.value);
              else setPicking(null);
            }}
            onBlur={() => setPicking(null)}
            className="rounded border border-blue-400 bg-white px-1 py-0.5 text-[11px] dark:bg-zinc-900"
          >
            <option value="" disabled>
              choose…
            </option>
            {person && <option value="__clear__">— remove —</option>}
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.surname}
              </option>
            ))}
          </select>
        </div>
      );
    }

    const isDragOver = slotKeyEq(dragOverKey, key);

    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setPicking(key)}
        draggable={Boolean(person)}
        onDragStart={(e) => {
          if (!person?.consultantId) return;
          const payload: DragPayload = { ...key, consultantId: person.consultantId, surname: person.surname };
          e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!isDragOver) setDragOverKey(key);
        }}
        onDragLeave={() => {
          if (isDragOver) setDragOverKey(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverKey(null);
          const raw = e.dataTransfer.getData(DRAG_MIME);
          if (!raw) return;
          const source = JSON.parse(raw) as DragPayload;
          handleDrop(source, key, person);
        }}
        title={person ? "Click to change or remove; drag onto another slot to swap or move" : "Click to assign, or drop a name here"}
        className={`flex w-full items-center gap-1 rounded px-0.5 text-left transition-colors ${
          isDragOver
            ? "bg-blue-100 ring-1 ring-blue-500 dark:bg-blue-900/50"
            : "hover:bg-black/5 dark:hover:bg-white/10"
        } ${person ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <span className="text-black/40 dark:text-white/40">{label}:</span>
        {person ? (
          <span className="flex items-center gap-1 font-medium">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SPECIALTY_DOT[person.specialty]}`} aria-hidden />
            {person.surname}
          </span>
        ) : (
          <span className="text-black/30 dark:text-white/30">—</span>
        )}
      </button>
    );
  }

  function isLeaveFull(day: DayRow): boolean {
    return day.onLeave.filter((tag) => tag.leaveType !== "MATERNITY").length >= LEAVE_CAP;
  }

  function FullBadge() {
    return (
      <span className="rounded bg-black px-1 text-[10px] font-medium text-white dark:bg-white dark:text-black">
        FULL
      </span>
    );
  }

  function DayCell({ day }: { day: DayRow }) {
    const [, month, dayNum] = day.date.split("-");
    const isWeekend = isoWeekday(day.date) >= 5;
    const hasAlert = day.alerts.length > 0;

    return (
      <div
        title={day.alerts.join("\n")}
        className={`flex min-h-[128px] flex-col gap-1.5 rounded-md border p-2 text-xs ${
          hasAlert
            ? "border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
            : !day.inGeneratorScope
              ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
              : day.bankHolidayBlockId
                ? "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30"
                : isWeekend
                  ? "border-black/10 bg-black/[.015] dark:border-white/10 dark:bg-white/[.03]"
                  : "border-black/10 bg-white dark:border-white/10 dark:bg-transparent"
        }`}
      >
        <div className="flex items-baseline justify-between">
          <span className="font-semibold tabular-nums">
            {parseInt(dayNum, 10)}
            <span className="ml-1 font-normal text-black/40 dark:text-white/40">/{month}</span>
          </span>
          {!day.inGeneratorScope && (
            <span className="rounded bg-amber-200 px-1 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-200">
              hand-assigned
            </span>
          )}
        </div>
        {day.holidayName && (
          <div className="text-[11px] font-medium text-violet-700 dark:text-violet-300">{day.holidayName}</div>
        )}
        <div className="mt-auto flex flex-col gap-0.5 text-[11px]">
          <OnCallSlot day={day} position="FIRST" label="1st" />
          <OnCallSlot day={day} position="SECOND" label="2nd" />
        </div>
        {day.onLeave.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {day.onLeave.map((tag, i) => (
              <span key={i} className={`rounded px-1 text-[10px] font-medium ${tag.colorClass}`}>
                {tag.abbrev}
              </span>
            ))}
            {isLeaveFull(day) && <FullBadge />}
          </div>
        )}
        {hasAlert && (
          <div className="text-[10px] font-medium text-red-700 dark:text-red-400">
            {day.alerts.length} alert{day.alerts.length > 1 ? "s" : ""}
          </div>
        )}
      </div>
    );
  }

  function FilteredRow({ day, position }: { day: DayRow; position: Position | null }) {
    const [, month, dayNum] = day.date.split("-");
    const weekdayName = WEEKDAY_HEADERS[isoWeekday(day.date)];
    const hasAlert = day.alerts.length > 0;

    return (
      <div
        title={day.alerts.join("\n")}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-xs ${
          hasAlert
            ? "border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
            : day.bankHolidayBlockId
              ? "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30"
              : "border-black/10 bg-white dark:border-white/10 dark:bg-transparent"
        }`}
      >
        <span className="w-20 shrink-0 font-semibold tabular-nums">
          {weekdayName} {parseInt(dayNum, 10)}/{month}
        </span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${
            day.weekLabel === "A"
              ? "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300"
              : "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300"
          }`}
        >
          Week {day.weekLabel}
        </span>
        {day.holidayName && (
          <span className="font-medium text-violet-700 dark:text-violet-300">{day.holidayName}</span>
        )}
        <span className="min-w-[70px]">
          {position ? (
            <OnCallSlot day={day} position={position} label={position === "FIRST" ? "1st" : "2nd"} />
          ) : (
            <span className="text-black/40 dark:text-white/40">On leave</span>
          )}
        </span>
        {day.onLeave.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {day.onLeave.map((tag, i) => (
              <span key={i} className={`rounded px-1 text-[10px] font-medium ${tag.colorClass}`}>
                {tag.abbrev}
              </span>
            ))}
            {isLeaveFull(day) && <FullBadge />}
          </div>
        )}
        {hasAlert && (
          <span className="text-[10px] font-medium text-red-700 dark:text-red-400">
            {day.alerts.length} alert{day.alerts.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
    );
  }

  let lastMonth = "";

  const filteredDays = filterId
    ? weekEntries
        .flatMap(([, weekDays]) => weekDays)
        .map((day): { day: DayRow; position: Position | null } | null => {
          if (day.first?.consultantId === filterId) return { day, position: "FIRST" };
          if (day.second?.consultantId === filterId) return { day, position: "SECOND" };
          // No on-call slot that day — still include it if this is one of
          // their own booked leave days (maternity excluded: it spans months
          // at a time and would swamp the list, per the request that added
          // this leave-in-filter behavior).
          const onOwnLeave = day.onLeave.some((tag) => tag.consultantId === filterId && tag.leaveType !== "MATERNITY");
          if (onOwnLeave) return { day, position: null };
          return null;
        })
        .filter((x): x is { day: DayRow; position: Position | null } => x !== null)
        .sort((a, b) => a.day.date.localeCompare(b.day.date))
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label htmlFor="consultant-filter" className="font-medium text-black/50 dark:text-white/50">
          Filter by consultant:
        </label>
        <select
          id="consultant-filter"
          value={filterId}
          onChange={(e) => setFilterId(e.target.value)}
          className="rounded border border-black/15 bg-white px-2 py-1 dark:border-white/20 dark:bg-zinc-900"
        >
          <option value="">All consultants</option>
          {consultants.map((c) => (
            <option key={c.id} value={c.id}>
              {c.surname}
            </option>
          ))}
        </select>
        {filterId && (
          <button onClick={() => setFilterId("")} className="text-blue-600 underline dark:text-blue-400">
            Clear
          </button>
        )}
      </div>

      {filteredDays ? (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-black/50 dark:text-white/50">
            {filteredDays.length} on-call/leave day{filteredDays.length === 1 ? "" : "s"} for{" "}
            {consultants.find((c) => c.id === filterId)?.surname}
          </div>
          {filteredDays.map(({ day, position }) => (
            <FilteredRow key={day.date} day={day} position={position} />
          ))}
        </div>
      ) : (
        <>
          <div className="hidden gap-2 px-1 text-xs font-medium text-black/40 dark:text-white/40 md:grid md:grid-cols-7">
            {WEEKDAY_HEADERS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {weekEntries.map(([weekStart, weekDays]) => {
            const label = weekDays[0].weekLabel;
            const month = monthLabel(weekDays[0].date);
            const showMonthHeader = month !== lastMonth;
            lastMonth = month;

            return (
              <div key={weekStart} className="flex flex-col gap-2">
                {showMonthHeader && (
                  <h2 className="sticky top-8 z-10 -mx-4 bg-white px-4 py-1 text-sm font-semibold text-black/70 dark:bg-black dark:text-white/70">
                    {month}
                  </h2>
                )}
                <div className="flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
                  <span
                    className={`rounded px-1.5 py-0.5 font-semibold ${
                      label === "A"
                        ? "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300"
                        : "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300"
                    }`}
                  >
                    Week {label}
                  </span>
                  <span>{weekStart}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
                  {weekDays.map((day) => (
                    // Explicit column placement (1=Mon..7=Sun), only at the md+
                    // breakpoint where the grid actually has 7 columns — the
                    // first/last weeks in range are partial (2027 opens on a
                    // Friday), so placing by array order alone would misalign
                    // those days under the wrong weekday header.
                    <div
                      key={day.date}
                      className="md:[grid-column-start:var(--weekday-col)]"
                      style={{ "--weekday-col": isoWeekday(day.date) + 1 } as React.CSSProperties}
                    >
                      <DayCell day={day} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
