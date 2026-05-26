import { useRef, useState } from "react";
import type { ApiLead } from "../api/leads";
import {
  getLeadReasonBullets,
  priorityCardStyles,
  priorityFromBand,
  priorityLabel,
  statusDisplayLabel,
} from "../lib/lead-insights";
import { statusPillStyles } from "../lib/risk-styles";
import type { RiskBand } from "./ActionCard";
import { RiskScoreBadge } from "./RiskScoreBadge";

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
  const tier = priorityFromBand(band);
  const styles = priorityCardStyles[tier];
  const reasons = getLeadReasonBullets(lead, 2);
  const startX = useRef(0);
  const [offset, setOffset] = useState(0);
  const [hint, setHint] = useState<"left" | "right" | null>(null);

  const statusStyle = statusPillStyles[lead.status] ?? "bg-slate-700 text-slate-200";

  return (
    <li
      className={`relative overflow-hidden rounded-2xl border bg-slate-900/70 ring-1 ring-slate-800/80 ${styles.border} ${styles.glow}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${styles.accent}`}
        aria-hidden
      />

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
        className="relative flex w-full touch-pan-y gap-2.5 px-3 py-3 text-left transition-transform active:bg-slate-800/30"
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
          <p className="truncate text-[15px] font-semibold leading-tight text-slate-50">
            {lead.businessName}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${statusStyle}`}
            >
              {statusDisplayLabel(lead.status)}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ${styles.badge}`}
            >
              {priorityLabel(tier)}
            </span>
          </div>

          {reasons.length > 0 ? (
            <ul className="mt-2 space-y-0.5">
              {reasons.map((reason) => (
                <li
                  key={reason}
                  className="flex items-start gap-1.5 text-xs leading-snug text-slate-400"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500/70" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">{lead.postcode}</p>
          )}
        </div>

        <RiskScoreBadge score={lead.riskScore} band={band} />
      </button>
    </li>
  );
}
