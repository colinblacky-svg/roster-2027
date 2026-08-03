"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ConsultantOption {
  id: string;
  surname: string;
}

export function BalanceForm({
  consultants,
  title,
  description,
  fieldLabel,
  submitLabel,
  endpoint,
  reconciledNoun,
}: {
  consultants: ConsultantOption[];
  title: string;
  description: string;
  fieldLabel: string;
  submitLabel: string;
  endpoint: string;
  /** e.g. "residual" or "lieu days" — slotted into "N prior 2027 request(s)
   * reconciled to {reconciledNoun}." */
  reconciledNoun: string;
}) {
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
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultantId, amount }),
      });
      const data = await res.json();
      setMessage(
        data.reconciled > 0
          ? `Set. ${data.reconciled} prior 2027 request(s) reconciled to ${reconciledNoun}.`
          : "Balance set."
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
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-xs text-black/50 dark:text-white/50">{description}</p>
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
          {fieldLabel}
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
        {submitting ? "Saving…" : submitLabel}
      </button>
      {message && <p className="text-sm text-black/70 dark:text-white/70">{message}</p>}
    </form>
  );
}
