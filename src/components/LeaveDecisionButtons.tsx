"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeaveDecisionButtons({ leaveRequestId }: { leaveRequestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function decide(decision: "APPROVE" | "REJECT") {
    setBusy(true);
    try {
      await fetch("/api/leave/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveRequestId, decision }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        disabled={busy}
        onClick={() => decide("APPROVE")}
        className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        disabled={busy}
        onClick={() => decide("REJECT")}
        className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
