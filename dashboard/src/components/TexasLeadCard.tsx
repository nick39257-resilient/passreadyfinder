import type { ApiTexasLead } from "../api/texas-leads";

export function TexasLeadCard({
  lead,
  onTap,
}: {
  lead: ApiTexasLead;
  onTap?: () => void;
}) {
  const critical = lead.isCritical;
  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        className={`flex min-h-12 w-full flex-col gap-2 rounded-2xl border p-4 text-left transition ${
          critical
            ? "border-red-500/70 bg-red-950/40 ring-2 ring-red-500/50"
            : "border-amber-900/50 bg-slate-900/80 ring-1 ring-slate-700"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-100">{lead.businessName}</h3>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              critical
                ? "bg-red-600 text-white"
                : "bg-amber-700/80 text-amber-50"
            }`}
          >
            Risk {lead.texasRiskScore}
          </span>
        </div>

        {critical ? (
          <p className="text-xs font-bold uppercase tracking-wide text-red-300">
            CRITICAL_INTERVENTION — score ≥ 79
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
          {lead.inspectionScore != null ? (
            <span>Inspection {lead.inspectionScore}</span>
          ) : null}
          {lead.demerits != null ? <span>Demerits {lead.demerits}</span> : null}
          {lead.vehicleType ? <span>{lead.vehicleType}</span> : null}
          {lead.isMobileVendor ? (
            <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-amber-100">
              Mobile unit
              {lead.vendorTier ? ` · ${lead.vendorTier.replace("_", " ")}` : ""}
            </span>
          ) : null}
        </div>

        {(lead.city || lead.county) && (
          <p className="text-xs text-slate-500">
            {[lead.city, lead.county, lead.zip].filter(Boolean).join(", ")}
          </p>
        )}

        {lead.hb2844DraftPreview && lead.isMobileVendor ? (
          <p className="line-clamp-2 text-xs text-slate-400">{lead.hb2844DraftPreview}</p>
        ) : null}
      </button>
    </li>
  );
}
