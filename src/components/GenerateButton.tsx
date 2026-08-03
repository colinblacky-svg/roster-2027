"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GenerateButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [warnings, setWarnings] = useState<string[]>([]);

  async function handleGenerate() {
    setStatus("loading");
    setWarnings([]);
    try {
      const res = await fetch("/api/generate", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setWarnings(data.warnings ?? []);
      setStatus("done");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleGenerate}
        disabled={status === "loading"}
        className="w-fit rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {status === "loading" ? "Generating…" : "Generate Roster"}
      </button>
      {status === "error" && (
        <p className="text-sm text-red-700 dark:text-red-400">
          Generation failed. Check the server logs.
        </p>
      )}
      {status === "done" && warnings.length === 0 && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Generated with no warnings.
        </p>
      )}
      {status === "done" && warnings.length > 0 && (
        <details className="text-sm text-amber-700 dark:text-amber-400">
          <summary>{warnings.length} generator warning(s)</summary>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
