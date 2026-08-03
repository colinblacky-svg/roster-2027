"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ConsultantOption {
  id: string;
  surname: string;
}

const LEAVE_TYPES = ["ANNUAL", "STUDY", "PARENTAL", "MATERNITY", "MEDICAL"] as const;

export function LeaveRequestForm({ consultants }: { consultants: ConsultantOption[] }) {
  const router = useRouter();
  const [consultantId, setConsultantId] = useState(consultants[0]?.id ?? "");
  const [startDate, setStartDate] = useState("2027-01-04");
  const [endDate, setEndDate] = useState("2027-01-08");
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_TYPES)[number]>("ANNUAL");
  const [bookingOrCancelling, setBookingOrCancelling] = useState<"BOOK" | "CANCEL">("BOOK");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultantId, startDate, endDate, leaveType, bookingOrCancelling }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Request failed.");
      } else if (bookingOrCancelling === "CANCEL") {
        setMessage(`Cancelled ${data.cancelled} matching request(s).`);
      } else if (data.pendingApproval) {
        setMessage("Leave cap of 6 would be exceeded — flagged for admin approval.");
      } else {
        setMessage(
          `Applied. Charged ${data.leaveRequest.daysCharged} day(s).${
            data.swapCount > 0 ? ` ${data.swapCount} on-call assignment(s) auto-swapped.` : ""
          }`
        );
      }
      router.refresh();
    } catch {
      setMessage("Request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold">Leave request</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          Consultant
          <select
            value={consultantId}
            onChange={(e) => setConsultantId(e.target.value)}
            className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/20"
          >
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.surname}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/20"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          End date
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/20"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Leave type
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value as (typeof LEAVE_TYPES)[number])}
            className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/20"
          >
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Action
          <select
            value={bookingOrCancelling}
            onChange={(e) => setBookingOrCancelling(e.target.value as "BOOK" | "CANCEL")}
            className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/20"
          >
            <option value="BOOK">Book</option>
            <option value="CANCEL">Cancel</option>
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit"}
      </button>
      {message && <p className="text-sm text-black/70 dark:text-white/70">{message}</p>}
    </form>
  );
}
