import { useRef, useState } from "react";
import type { ApiLead } from "../api/leads";
import { riskPillStyles, statusPillStyles } from "../lib/risk-styles";
import type { RiskBand } from "./ActionCard";

const SWIPE_THRESHOLD = 72;

export function LeadRow({
  lead,
  onRowTap,
  onSwipeLeft,
  onSwipeRight,
  busy,
}: {
  lead: ApiLead;
  onRowTap: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  busy?: boolean;
}) {
  const band = lead.riskBand as RiskBand;
  const startX = useRef(0);
  const [offset, setOffset] = useState(0);
  const [hint, setHint] = useState<"left" | "right" | null>(null);

  const statusStyle =
    statusPillStyles[lead.status] ?? "bg-slate-700 text-slate-200";

  return (
    <li className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-between px-4 text-xs font-bold"
        aria-hidden
      >
        <span className={hint === "right" ? "text-emerald-400" : "text-transparent"}>
          Quick draft →
        </span>
        <span className={hint === "left" ? "text-amber-400" : "text-transparent"}>
          ← Snooze 30d
        </span>
      </div>

      <button
        type="button"
        onClick={onRowTap}
        disabled={busy}
        className="relative flex min-h-[56px] w-full touch-pan-y items-center gap-2 bg-slate-900/95 px-3 py-3 text-left transition-transform"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={(e) => {
          startX.current = e.touches[0]?.clientX ?? 0;
        }}
        onTouchMove={(e) => {
          const dx = (e.touches[0]?.clientX ?? 0) - startX.current;
          setOffset(dx);
          if (dx > SWIPE_THRESHOLD) {
            setHint("right");
          } else if (dx < -SWIPE_THRESHOLD) {
            setHint("left");
          } else {
            setHint(null);
          }
        }}
        onTouchEnd={() => {
          if (offset > SWIPE_THRESHOLD) {
            onSwipeRight();
          } else if (offset < -SWIPE_THRESHOLD) {
            onSwipeLeft();
          }
          setOffset(0);
          setHint(null);
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight">{lead.businessName}</p>
          <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
            {lead.signals.ehoScraped ? (
              <span title="EHO scraped">🔍 EHO</span>
            ) : null}
            {lead.signals.predictiveScore ? (
              <span title="Predictive score">🧠 Score</span>
            ) : null}
            {lead.signals.draftReady ? (
              <span title="Draft ready">🤖 Draft</span>
            ) : null}
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums ring-1 ${riskPillStyles[band]}`}
        >
          {lead.riskScore}
        </span>

        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyle}`}
        >
          {lead.status}
        </span>
      </button>
    </li>
  );
}
