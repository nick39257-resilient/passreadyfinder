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

function LeadCard({ lead }: { lead: DeskLead }) {
  const waPhone = (lead.phone ?? "").replace(/\D/g, "");
  const waUrl =
    waPhone.length >= 10
      ? `https://wa.me/${waPhone.startsWith("44") ? waPhone : `44${waPhone.replace(/^0/, "")}`}`
      : null;

  return (
    <li className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-100">{lead.businessName}</p>
          <p className="text-[11px] text-slate-500">{lead.subtitle}</p>
        </div>
        <span className="shrink-0 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold tabular-nums text-cyan-300">
          {lead.priorityScore}
        </span>
      </div>
      {lead.gapReasons.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {lead.gapReasons.slice(0, 2).map((g) => (
            <li key={g} className="text-[11px] text-amber-200/90">
              {g}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
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
    </li>
  );
}

export function ActionDesk({ leads, stats, onExport }: Props) {
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

      {leads.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Run a scan to populate the priority queue.
        </p>
      ) : (
        <ul className="grid max-h-[420px] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
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
      ...(!l.email ? ["No email on file"] : []),
    ],
    priorityScore: l.riskScore,
    phone: l.phone,
    website: null,
    email: l.email,
  }));
}
