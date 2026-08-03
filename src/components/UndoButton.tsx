"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UndoButton() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleUndo() {
    setBusy(true);
    try {
      const res = await fetch("/api/commands/undo", { method: "POST" });
      const data = await res.json();
      setStatus(data.undone ? `Undid: ${data.description}` : "Nothing to undo.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleUndo}
        disabled={busy}
        className="w-fit rounded-md border border-black/15 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
      >
        ↶ Undo
      </button>
      {status && <p className="text-xs text-black/50 dark:text-white/50">{status}</p>}
    </div>
  );
}
