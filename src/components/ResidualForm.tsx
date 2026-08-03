"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ConsultantOption {
  id: string;
  surname: string;
}

export function ResidualForm({ consultants }: { consultants: ConsultantOption[] }) {
  const router = useRouter();
  const [consultantId, setConsultantId] = useState(consultants[0]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/leave/residual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultantId, amount }),
      });
      const data = await res.json();
      setMessage(
        data.reconciled > 0
          ? `Set. ${data.reconciled} prior 2027 request(s) reconciled to residual.`
          : "Residual balance set."
      );
      router.refresh();
    } catch {
      setMessage("Request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold">2026 residual leave (§6.2)</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Must be used before 10 Apr 2027 and takes priority over 2027 entitlement.
        Setting this retroactively converts any pre-10-Apr 2027 leave already
        booked back to residual.
      </p>
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
          Residual days
          <input
            type="number"
            min={0}
            step={0.5}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/20"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-fit rounded-md bg-zinc-700 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
      >
        {submitting ? "Saving…" : "Set residual"}
      </button>
      {message && <p className="text-sm text-black/70 dark:text-white/70">{message}</p>}
    </form>
  );
}
