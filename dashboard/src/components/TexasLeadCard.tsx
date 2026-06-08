import type { ApiTexasLead } from "../api/texas-leads";
import {
  formatTexasField,
  formatTexasLocation,
  formatTexasScore,
  formatVendorTier,
} from "../lib/texas-lead-display";
import { isLiveVisitor } from "../lib/live-visitor";
import { DraftPreviewBlock } from "./DraftPreviewBlock";
import { TexasContactOptions } from "./TexasContactOptions";

export function TexasLeadCard({
  lead,
  onTap,
}: {
  lead: ApiTexasLead;
  onTap?: () => void;
}) {
  const critical = Boolean(lead.isCritical);
  const businessName = formatTexasField(lead.businessName, "Unknown venue");
  const riskScore = formatTexasScore(lead.texasRiskScore);
  const location = formatTexasLocation(lead);
  const draftPreview =
    lead.outreachDraftPreview?.trim() || lead.hb2844DraftPreview?.trim() || null;
  const liveVisitor = isLiveVisitor(lead.lastPreviewedAt);

  return (
    <li
      className={`flex flex-col gap-3 rounded-2xl border p-4 ${
        liveVisitor
          ? "animate-pulse border-amber-400 bg-amber-950/30 ring-2 ring-amber-400/60"
          : critical
            ? "border-red-500/70 bg-red-950/40 ring-2 ring-red-500/50"
            : "border-amber-900/50 bg-slate-900/80 ring-1 ring-slate-700"
      }`}
    >
      <button
        type="button"
        onClick={onTap}
        className="flex min-h-12 w-full flex-col gap-2 text-left"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-100">{businessName}</h3>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              critical
                ? "bg-red-600 text-white"
                : "bg-amber-700/80 text-amber-50"
            }`}
          >
            Risk {riskScore}
          </span>
        </div>

        {critical ? (
          <p className="text-xs font-bold uppercase tracking-wide text-red-300">
            CRITICAL_INTERVENTION — score ≥ 79
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
          {lead.inspectionScore != null ? (
            <span>Inspection {formatTexasScore(lead.inspectionScore)}</span>
          ) : null}
          {lead.demerits != null ? (
            <span>Demerits {formatTexasScore(lead.demerits)}</span>
          ) : null}
          {lead.vehicleType ? (
            <span>{formatTexasField(lead.vehicleType)}</span>
          ) : null}
          {lead.isMobileVendor ? (
            <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-amber-100">
              Mobile unit
              {lead.vendorTier ? ` · ${formatVendorTier(lead.vendorTier)}` : ""}
            </span>
          ) : null}
          {liveVisitor ? (
            <span className="rounded bg-amber-500/30 px-1.5 py-0.5 font-bold text-amber-100 ring-1 ring-amber-400/50">
              Live visitor
            </span>
          ) : null}
          {lead.draftHasScoreLink ? (
            <span className="rounded bg-emerald-900/60 px-1.5 py-0.5 font-semibold text-emerald-100">
              SafeScore link
            </span>
          ) : draftPreview ? (
            <span className="rounded bg-amber-900/60 px-1.5 py-0.5 font-semibold text-amber-100">
              Needs refresh
            </span>
          ) : null}
          {lead.outreachComplete ? (
            <span className="rounded bg-emerald-900/60 px-1.5 py-0.5 text-emerald-100">
              {formatTexasField(lead.statusLabel, lead.status)}
            </span>
          ) : null}
        </div>

        {location !== "—" ? (
          <p className="text-xs text-slate-500">{location}</p>
        ) : null}

        {draftPreview ? (
          <DraftPreviewBlock
            text={draftPreview}
            hasScoreLink={lead.draftHasScoreLink}
            maxLines={2}
          />
        ) : null}
      </button>

      <TexasContactOptions lead={lead} />
    </li>
  );
}
