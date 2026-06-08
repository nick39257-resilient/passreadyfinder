import { useRef, useState } from "react";
import type { ApiLead } from "../api/leads";
import {
  getLeadReasonBullets,
  priorityCardStyles,
  priorityFromBand,
  priorityLabel,
  statusDisplayLabel,
} from "../lib/lead-insights";
import { getLeadNextAction } from "../lib/lead-next-action";
import { statusPillStyles } from "../lib/risk-styles";
import type { RiskBand } from "./ActionCard";
import { isLiveVisitor } from "../lib/live-visitor";
import { sequenceTouchLabel } from "../lib/outreach-sequence";
import { DraftPreviewBlock } from "./DraftPreviewBlock";
import { RiskScoreBadge } from "./RiskScoreBadge";

const SWIPE_THRESHOLD = 72;

export function LeadRow({
  lead,
  onRowTap,
  onAction,
  onSwipeLeft,
  onSwipeRight,
  busy,
  busyLabel = "Working…",
  emphasizePhone = false,
  emphasizeWhatsApp = false,
}: {
  lead: ApiLead;
  onRowTap: () => void;
  onAction: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  busy?: boolean;
  busyLabel?: string;
  emphasizePhone?: boolean;
  emphasizeWhatsApp?: boolean;
}) {
  const band = lead.riskBand as RiskBand;
  const tier = priorityFromBand(band);
  const styles = priorityCardStyles[tier];
  const reasons = getLeadReasonBullets(lead, 2);
  const next = getLeadNextAction(lead);
  const startX = useRef(0);
  const didSwipe = useRef(false);
  const [offset, setOffset] = useState(0);
  const [hint, setHint] = useState<"left" | "right" | null>(null);

  const statusStyle = statusPillStyles[lead.status] ?? "bg-slate-700 text-slate-200";
  const showDraftPreview =
    Boolean(lead.draftPreview?.trim()) &&
    (lead.status === "drafted" || lead.status === "approved" || lead.status === "contacted");
  const inPostbox = lead.status === "approved";
  const liveVisitor = isLiveVisitor(lead.lastPreviewedAt);

  return (
    <li
      className={`relative overflow-hidden rounded-2xl border bg-slate-900/70 ${
        liveVisitor
          ? "animate-pulse border-amber-400 ring-2 ring-amber-400/70 shadow-[0_0_20px_rgba(251,191,36,0.35)]"
          : `ring-1 ring-slate-800/80 ${styles.border} ${styles.glow}`
      }`}
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
          {next.buttonLabel} →
        </span>
        <span className={hint === "left" ? "text-amber-400" : "text-transparent"}>
          ← Snooze
        </span>
      </div>

      {busy ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-950/75">
          <p className="rounded-full bg-emerald-950/90 px-3 py-1.5 text-xs font-semibold text-emerald-300">
            {busyLabel}
          </p>
        </div>
      ) : null}

      <div className="relative flex flex-col">
        <button
          type="button"
          onClick={() => {
            if (didSwipe.current) {
              didSwipe.current = false;
              return;
            }
            onRowTap();
          }}
          disabled={busy}
          className="relative w-full touch-pan-y px-3 py-3 text-left transition-transform active:bg-slate-800/30"
          style={{ transform: `translateX(${offset}px)` }}
          onTouchStart={(e) => {
            startX.current = e.touches[0]?.clientX ?? 0;
            didSwipe.current = false;
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
              didSwipe.current = true;
              onSwipeRight();
            } else if (offset < -SWIPE_THRESHOLD) {
              didSwipe.current = true;
              onSwipeLeft();
            }
            setOffset(0);
            setHint(null);
          }}
        >
          <div className="flex gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight text-slate-50">
                {lead.businessName}
              </p>

              <p className="mt-1 text-xs leading-snug text-sky-200/90">{next.hint}</p>

              {emphasizeWhatsApp && lead.whatsappUrl ? (
                <a
                  href={lead.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block min-h-[48px] rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white ring-1 ring-emerald-400/40"
                  onClick={(e) => e.stopPropagation()}
                >
                  WhatsApp (mobile) {lead.businessName}
                </a>
              ) : null}

              {emphasizePhone && lead.phone?.trim() ? (
                <a
                  href={`tel:${lead.phone.replace(/\s+/g, "")}`}
                  className="mt-2 inline-block min-h-[48px] rounded-xl bg-sky-600/90 px-4 py-2.5 text-sm font-bold text-white ring-1 ring-sky-500/50"
                  onClick={(e) => e.stopPropagation()}
                >
                  Call {lead.phone.trim()}
                </a>
              ) : null}

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
                {liveVisitor ? (
                  <span className="rounded-md bg-amber-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-100 ring-2 ring-amber-400/60">
                    Live visitor
                  </span>
                ) : null}
                {lead.recentlyChanged ? (
                  <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200 ring-1 ring-violet-500/30">
                    FSA update
                  </span>
                ) : null}
                {inPostbox ? (
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-500/30">
                    2pm send
                  </span>
                ) : null}
                {!lead.sequenceComplete ? (
                  <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-200 ring-1 ring-violet-500/30">
                    {sequenceTouchLabel(lead)}
                  </span>
                ) : null}
                {lead.draftHasScoreLink ? (
                  <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-100 ring-1 ring-emerald-500/40">
                    SafeScore link
                  </span>
                ) : lead.draftPreview ? (
                  <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-500/30">
                    Needs re-draft
                  </span>
                ) : null}
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
              ) : showDraftPreview ? (
                <DraftPreviewBlock
                  text={lead.draftPreview ?? ""}
                  hasScoreLink={lead.draftHasScoreLink}
                  maxLines={2}
                />
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">{lead.postcode}</p>
              )}
            </div>

            <RiskScoreBadge score={lead.riskScore} band={band} />
          </div>
        </button>

        {next.kind !== "wait_send" && lead.status !== "contacted" && lead.status !== "opted_in" ? (
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 border-t border-slate-800/80 bg-slate-950/30 text-sm font-bold text-emerald-400 disabled:opacity-40"
          >
            <span aria-hidden>→</span>
            <span>{next.buttonLabel}</span>
          </button>
        ) : null}
      </div>
    </li>
  );
}
