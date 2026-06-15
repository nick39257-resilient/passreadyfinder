import { useState } from "react";
import type { GenericLead } from "../../api/generic-leads";
import type { FloridaLead } from "../../api/florida-leads";

export type DeskLead = {
  id: number | string;
  businessName: string;
  subtitle: string;
  gapReasons: string[];
  priorityScore: number;
  phone: string | null;
  website: string | null;
  email: string | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  zip?: string | null;
  keyword?: string | null;
  licenseNumber?: string | null;
  lastInspectionDate?: string | null;
  priorityViolations?: number | null;
  inspectionScore?: number | null;
  riskLevel?: string | null;
  status?: string | null;
  phoneRegion?: "uk" | "us";
};

type Props = {
  leads: DeskLead[];
  stats: {
    total: number;
    highPriority: number;
    contactReady: number;
  };
  onExport: () => void;
};

function whatsAppUrl(lead: DeskLead): string | null {
  const digits = (lead.phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) {
    return null;
  }
  if (lead.phoneRegion === "us" || lead.county || lead.city?.match(/^[A-Z]/)) {
    const n = digits.length === 10 ? `1${digits}` : digits.startsWith("1") ? digits : `1${digits}`;
    return `https://wa.me/${n}`;
  }
  const uk = digits.startsWith("44") ? digits : `44${digits.replace(/^0/, "")}`;
  return `https://wa.me/${uk}`;
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) {
    return null;
  }
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  );
}

function LeadCard({
  lead,
  expanded,
  onToggle,
}: {
  lead: DeskLead;
  expanded: boolean;
  onToggle: () => void;
}) {
  const waUrl = whatsAppUrl(lead);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={`w-full rounded-xl border p-3 text-left transition-colors ${
          expanded
            ? "border-cyan-600/60 bg-slate-900/90 ring-1 ring-cyan-500/30"
            : "border-slate-800 bg-slate-950/70 hover:border-slate-600 hover:bg-slate-900/60"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-100">{lead.businessName}</p>
            <p className="text-[11px] text-slate-500">{lead.subtitle}</p>
          </div>
          <span className="shrink-0 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold tabular-nums text-cyan-300">
            {lead.priorityScore}
          </span>
        </div>

        {!expanded && lead.gapReasons.length > 0 ? (
          <p className="mt-2 text-[11px] text-amber-200/90">{lead.gapReasons[0]}</p>
        ) : null}

        {expanded ? (
          <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-3">
            <DetailRow label="Address" value={lead.address} />
            <DetailRow label="City" value={lead.city} />
            <DetailRow label="County" value={lead.county} />
            <DetailRow label="Postcode" value={lead.zip} />
            <DetailRow label="Keyword" value={lead.keyword} />
            <DetailRow label="License" value={lead.licenseNumber} />
            <DetailRow label="Last inspection" value={lead.lastInspectionDate} />
            <DetailRow
              label="Violations"
              value={
                lead.priorityViolations != null
                  ? String(lead.priorityViolations)
                  : lead.inspectionScore != null
                    ? String(lead.inspectionScore)
                    : null
              }
            />
            <DetailRow label="Risk level" value={lead.riskLevel} />
            <DetailRow label="Status" value={lead.status} />
            {lead.gapReasons.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {lead.gapReasons.map((g) => (
                  <li key={g} className="text-[11px] text-amber-200/90">
                    {g}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-green-800/50 bg-green-950/40 px-2 py-1 text-[10px] font-semibold text-green-200"
                >
                  WhatsApp
                </a>
              ) : null}
              {lead.phone ? (
                <a
                  href={`tel:${lead.phone}`}
                  className="rounded-lg border border-sky-800/50 px-2 py-1 text-[10px] font-semibold text-sky-200"
                >
                  Call
                </a>
              ) : null}
              {lead.email ? (
                <a
                  href={`mailto:${lead.email}`}
                  className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300"
                >
                  Email
                </a>
              ) : null}
              {lead.website ? (
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-400"
                >
                  Site
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[10px] text-slate-600">Tap for full details</p>
        )}
      </button>
    </li>
  );
}

export function ActionDesk({ leads, stats, onExport }: Props) {
  const sorted = [...leads].sort((a, b) => b.priorityScore - a.priorityScore);
  const [expandedId, setExpandedId] = useState<number | string | null>(null);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-100">Action desk</h2>
        <button
          type="button"
          onClick={onExport}
          disabled={leads.length === 0}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-300 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-2 text-center">
          <p className="text-[10px] text-slate-500">Total targets</p>
          <p className="text-xl font-bold tabular-nums text-slate-50">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-2 text-center">
          <p className="text-[10px] text-slate-500">High priority</p>
          <p className="text-xl font-bold tabular-nums text-amber-300">{stats.highPriority}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-2 text-center">
          <p className="text-[10px] text-slate-500">Ready to contact</p>
          <p className="text-xl font-bold tabular-nums text-emerald-300">{stats.contactReady}</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Run a scan to populate the priority queue.
        </p>
      ) : (
        <ul className="grid max-h-[420px] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              expanded={expandedId === lead.id}
              onToggle={() => setExpandedId((cur) => (cur === lead.id ? null : lead.id))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function genericToDesk(leads: GenericLead[]): DeskLead[] {
  return leads.map((l) => ({
    id: l.id,
    businessName: l.businessName,
    subtitle: [l.city, l.postcode, l.locationLabel].filter(Boolean).join(" · "),
    gapReasons: l.gapReasons,
    priorityScore: l.priorityScore,
    phone: l.phone,
    website: l.website,
    email: l.email,
    address: l.address,
    city: l.city,
    zip: l.postcode,
    keyword: l.keyword,
    phoneRegion: "uk",
  }));
}

export function floridaToDesk(leads: FloridaLead[]): DeskLead[] {
  return leads.map((l) => ({
    id: l.id,
    businessName: l.businessName,
    subtitle: [l.city, l.county, l.zip].filter(Boolean).join(" · "),
    gapReasons: [
      ...(l.priorityViolations && l.priorityViolations > 0
        ? [`${l.priorityViolations} priority violations`]
        : []),
      ...(l.riskLevel ? [`Risk: ${l.riskLevel}`] : []),
      ...(l.lastInspectionDate ? [`Last inspected ${l.lastInspectionDate}`] : []),
      ...(!l.email ? ["No email on file"] : []),
    ],
    priorityScore: l.riskScore,
    phone: l.phone,
    website: null,
    email: l.email,
    address: l.address,
    city: l.city,
    county: l.county,
    zip: l.zip,
    licenseNumber: l.licenseNumber,
    lastInspectionDate: l.lastInspectionDate,
    priorityViolations: l.priorityViolations,
    inspectionScore: l.inspectionScore,
    riskLevel: l.riskLevel,
    status: l.status,
    phoneRegion: "us",
  }));
}
