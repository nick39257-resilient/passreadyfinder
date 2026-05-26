import type { SystemStatusFeedItem } from "../api/status";

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function ActivityFeed({ items }: { items: SystemStatusFeedItem[] }) {
  return (
    <section
      className="mb-4 rounded-2xl border border-slate-800 bg-slate-950/80 px-3 py-2"
      aria-label="Engine activity feed"
    >
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Activity
      </p>
      <ul className="space-y-1">
        {items.length === 0 ? (
          <li className="text-sm text-slate-500">No engine logs yet</li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              className={`flex items-start justify-between gap-2 text-sm ${
                item.level === "error" ? "text-red-300" : "text-slate-400"
              }`}
            >
              <span className="min-w-0 truncate">
                {item.level === "error" ? "✗ " : "· "}
                {item.message}
              </span>
              <span className="shrink-0 text-[10px] text-slate-600">
                {formatLogTime(item.createdAt)}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
