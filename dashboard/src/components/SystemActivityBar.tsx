import { useState } from "react";
import type { ActivityItem } from "../api/activity";

export function SystemActivityBar({
  items,
  complianceTip,
}: {
  items: ActivityItem[];
  complianceTip: string;
}) {
  const [open, setOpen] = useState(false);
  const latest = items[0]?.message ?? "Engine idle — ready for commands";

  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-2 text-left"
        aria-expanded={open}
      >
        <span className="truncate text-sm text-slate-300">
          <span className="mr-2 text-emerald-400">●</span>
          {latest}
        </span>
        <span className="shrink-0 text-xs text-slate-500">{open ? "Hide" : "Engine room"}</span>
      </button>

      {open ? (
        <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950/90 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            System activity
          </p>
          <ul className="max-h-32 space-y-1 overflow-y-auto text-sm text-slate-400">
            {items.length === 0 ? (
              <li>No recent jobs</li>
            ) : (
              items.map((item) => (
                <li key={item.id} className="truncate">
                  {item.message}
                </li>
              ))
            )}
          </ul>
          <p className="mt-3 border-t border-slate-800 pt-3 text-sm text-amber-200/90">
            💡 {complianceTip}
          </p>
        </div>
      ) : null}
    </section>
  );
}
