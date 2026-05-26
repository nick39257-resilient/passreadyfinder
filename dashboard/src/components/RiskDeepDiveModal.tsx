import type { ApiLead } from "../api/leads";
import { riskPillStyles } from "../lib/risk-styles";
import type { RiskBand } from "./ActionCard";

export function RiskDeepDiveModal({
  lead,
  onClose,
}: {
  lead: ApiLead;
  onClose: () => void;
}) {
  const band = lead.riskBand as RiskBand;
  const daysLabel =
    lead.daysSinceInspection === null
      ? "Unknown"
      : lead.daysSinceInspection === 0
        ? "Today"
        : `${lead.daysSinceInspection} days`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="risk-modal-title"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="risk-modal-title" className="text-lg font-bold">
              {lead.businessName}
            </h2>
            <p className="text-sm text-slate-400">Compliance cheat sheet</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] rounded-xl bg-slate-800 text-sm font-bold"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <span
            className={`rounded-full px-3 py-1 text-sm font-bold ring-1 ${riskPillStyles[band]}`}
          >
            Risk {lead.riskScore}
          </span>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
            {lead.status}
          </span>
        </div>

        <div className="mb-4 rounded-2xl bg-slate-950/80 p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">
            Time since last inspection
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{daysLabel}</p>
          <p className="mt-2 text-sm text-slate-300">{lead.inspectionSummary}</p>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
            Risk triggers (raw)
          </p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            <li className="rounded-xl bg-slate-950 p-3">
              Rating pressure
              <span className="block text-lg font-bold tabular-nums">
                {lead.riskComponents.ratingPressure}
              </span>
            </li>
            <li className="rounded-xl bg-slate-950 p-3">
              Inspection staleness
              <span className="block text-lg font-bold tabular-nums">
                {lead.riskComponents.inspectionStaleness}
              </span>
            </li>
            <li className="rounded-xl bg-slate-950 p-3">
              Low-rating urgency
              <span className="block text-lg font-bold tabular-nums">
                {lead.riskComponents.lowRatingUrgency}
              </span>
            </li>
            <li className="rounded-xl bg-slate-950 p-3">
              Contact gap
              <span className="block text-lg font-bold tabular-nums">
                {lead.riskComponents.contactGap}
              </span>
            </li>
          </ul>
        </div>

        {lead.competitors.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
              Local leaderboard
            </p>
            <ul className="space-y-2">
              <li className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-sm">
                <span className="font-semibold">{lead.businessName}</span>
                <span className="text-slate-400">
                  {" "}
                  (you — {lead.fsaRating ?? "?"}★)
                </span>
              </li>
              {lead.competitors.map((c) => (
                <li
                  key={`${c.businessName}-${c.postcode}`}
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                >
                  <span className="font-semibold">{c.businessName}</span>
                  <span className="text-slate-400"> ({c.fsaRating ?? "?"}★ rival)</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
