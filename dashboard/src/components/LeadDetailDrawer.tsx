import type { ApiLead } from "../api/leads";
import { riskPillStyles } from "../lib/risk-styles";
import type { RiskBand } from "./ActionCard";

function ScoreCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 text-center ${
        highlight
          ? "border-amber-500/50 bg-amber-950/30"
          : "border-slate-800 bg-slate-950/80"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-100">
        {value === null ? "—" : value}
      </p>
      <p className="text-[10px] text-slate-500">/ 25</p>
    </div>
  );
}

export function LeadDetailDrawer({
  lead,
  onClose,
  onQuickDraft,
  onSnooze,
  onDismiss,
  busy,
}: {
  lead: ApiLead;
  onClose: () => void;
  onQuickDraft: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  const band = lead.riskBand as RiskBand;
  const focus = lead.carrotFocusArea;
  const scores = lead.fsaScores;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-slate-600" aria-hidden />

        <div className="p-5 pb-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold leading-tight">{lead.businessName}</h2>
              {lead.rivalBadge ? (
                <span className="mt-2 inline-block rounded-full border border-violet-500/40 bg-violet-950/40 px-3 py-1 text-xs font-semibold text-violet-200">
                  {lead.rivalBadge}
                </span>
              ) : null}
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${riskPillStyles[band]}`}
            >
              {lead.riskScore}
            </span>
          </div>

          <section className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              The Carrot — FSA breakdown
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <ScoreCell
                label="Hygiene"
                value={scores.hygiene}
                highlight={focus === "hygiene"}
              />
              <ScoreCell
                label="Structure"
                value={scores.structural}
                highlight={focus === "structural"}
              />
              <ScoreCell
                label="Management"
                value={scores.management}
                highlight={focus === "management"}
              />
            </div>
          </section>

          {lead.consultantTip ? (
            <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-950/25 p-4">
              <p className="text-xs font-semibold uppercase text-amber-400">
                Consultant tip
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-50">
                {lead.consultantTip}
              </p>
            </div>
          ) : (
            <p className="mb-4 text-sm text-slate-500">
              FSA sub-scores not available yet — run Find Leads to pull EHO data.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onQuickDraft}
              className="min-h-[56px] rounded-2xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50"
            >
              Quick-Draft
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onSnooze}
              className="min-h-[56px] rounded-2xl border border-slate-600 bg-slate-800 text-sm font-bold text-slate-200"
            >
              Snooze 30d
            </button>
            <a
              href={lead.ehoReportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[56px] items-center justify-center rounded-2xl border border-sky-600/50 bg-sky-950/40 text-sm font-bold text-sky-200"
            >
              Deep-Dive (EHO)
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={onDismiss}
              className="min-h-[56px] rounded-2xl border border-red-500/40 bg-red-950/30 text-sm font-bold text-red-200"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
