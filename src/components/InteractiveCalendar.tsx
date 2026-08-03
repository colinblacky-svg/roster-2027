"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isoWeekday, monthLabel, type ISODate } from "@/lib/roster-engine/date-utils";

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
  onLeave: { abbrev: string; colorClass: string }[];
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

export function InteractiveCalendar({
  weekEntries,
  consultants,
}: {
  weekEntries: [ISODate, DayRow[]][];
  consultants: ConsultantOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<SlotKey | null>(null);
  const [picking, setPicking] = useState<SlotKey | null>(null);
  const [busy, setBusy] = useState(false);

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
      setSelected(null);
      setPicking(null);
    }
  }

  function personAt(days: [ISODate, DayRow[]][], key: SlotKey) {
    for (const [, weekDays] of days) {
      const day = weekDays.find((d) => d.date === key.date);
      if (day) return key.position === "FIRST" ? day.first : day.second;
    }
    return null;
  }

  function handleSlotClick(key: SlotKey, occupied: boolean) {
    if (busy) return;

    if (picking && slotKeyEq(picking, key)) {
      setPicking(null);
      return;
    }

    if (!selected) {
      if (occupied) {
        setSelected(key);
      } else {
        setPicking(key);
      }
      return;
    }

    if (slotKeyEq(selected, key)) {
      setSelected(null);
      return;
    }

    const fromPerson = personAt(weekEntries, selected);
    if (!occupied) {
      // Move: clear the source, assign the destination.
      void sendCommand(
        "MOVE_ASSIGNMENT",
        [
          { date: selected.date, position: selected.position, toConsultantId: null },
          { date: key.date, position: key.position, toConsultantId: fromPerson?.consultantId ?? null },
        ],
        `Moved ${fromPerson?.surname ?? "?"} from ${selected.date} to ${key.date}`
      );
    } else {
      const toPerson = personAt(weekEntries, key);
      void sendCommand(
        "SWAP_ASSIGNMENTS",
        [
          { date: selected.date, position: selected.position, toConsultantId: toPerson?.consultantId ?? null },
          { date: key.date, position: key.position, toConsultantId: fromPerson?.consultantId ?? null },
        ],
        `Swapped ${fromPerson?.surname ?? "?"} ↔ ${toPerson?.surname ?? "?"}`
      );
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

  function OnCallSlot({ day, position, label }: { day: DayRow; position: Position; label: string }) {
    const person = position === "FIRST" ? day.first : day.second;
    const key: SlotKey = { date: day.date, position };
    const isSelected = slotKeyEq(selected, key);
    const isPicking = slotKeyEq(picking, key);

    if (isPicking) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-black/40 dark:text-white/40">{label}:</span>
          <select
            autoFocus
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) handleAssign(key, e.target.value);
            }}
            onBlur={() => setPicking(null)}
            className="rounded border border-blue-400 bg-white px-1 py-0.5 text-[11px] dark:bg-zinc-900"
          >
            <option value="" disabled>
              choose…
            </option>
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.surname}
              </option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => handleSlotClick(key, Boolean(person))}
        onDoubleClick={() => person && handleClear(key)}
        title={person ? "Click to select for swap/move; double-click to clear" : "Click to assign"}
        className={`flex w-full items-center gap-1 rounded px-0.5 text-left transition-colors ${
          isSelected
            ? "bg-blue-100 ring-1 ring-blue-500 dark:bg-blue-900/50"
            : "hover:bg-black/5 dark:hover:bg-white/10"
        }`}
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

  let lastMonth = "";

  return (
    <div className="flex flex-col gap-4">
      {selected && (
        <div className="sticky top-0 z-20 flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow">
          <span>
            Selected {selected.date} ({selected.position === "FIRST" ? "1st" : "2nd"}). Click another slot to swap
            or move, or click it again to cancel.
          </span>
          <button onClick={() => setSelected(null)} className="ml-auto underline">
            Cancel
          </button>
        </div>
      )}

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
    </div>
  );
}
