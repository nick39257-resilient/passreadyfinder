import { useState } from "react";
import type { SystemStatusFeedItem } from "../api/status";

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

const COLLAPSED_COUNT = 3;

export function ActivityFeed({ items }: { items: SystemStatusFeedItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT);
  const hiddenCount = Math.max(0, items.length - COLLAPSED_COUNT);

  return (
    <section
      className="mb-3 rounded-xl border border-slate-700/50 bg-slate-950/50 px-3 py-2"
      aria-label="Engine activity"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Engine room
        </p>
        {items.length > COLLAPSED_COUNT ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] font-semibold text-emerald-500/90"
          >
            {expanded ? "Less" : `+${hiddenCount} more`}
          </button>
        ) : null}
      </div>
      <ul className="space-y-0.5">
        {visible.length === 0 ? (
          <li className="text-xs text-slate-500">No engine logs yet</li>
        ) : (
          visible.map((item) => (
            <li
              key={item.id}
              className={`flex items-start justify-between gap-2 text-xs leading-snug ${
                item.level === "error" ? "text-red-300/90" : "text-slate-500"
              }`}
            >
              <span className="min-w-0 truncate">
                {item.level === "error" ? "✗ " : "· "}
                {item.message}
              </span>
              <span className="shrink-0 text-[9px] text-slate-600">
                {formatLogTime(item.createdAt)}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
