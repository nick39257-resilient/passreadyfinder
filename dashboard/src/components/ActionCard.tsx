export type RiskBand = "critical" | "high" | "medium" | "low";

export interface ActionCardProps {
  businessName: string;
  detail?: string;
  riskScore: number;
  riskBand?: RiskBand;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}

const bandStyles: Record<
  RiskBand,
  { badge: string; ring: string; score: string }
> = {
  critical: {
    badge: "bg-red-500/20 text-red-300 ring-red-500/40",
    ring: "ring-red-500/30",
    score: "text-red-300",
  },
  high: {
    badge: "bg-amber-500/20 text-amber-300 ring-amber-500/40",
    ring: "ring-amber-500/30",
    score: "text-amber-300",
  },
  medium: {
    badge: "bg-sky-500/20 text-sky-300 ring-sky-500/40",
    ring: "ring-sky-500/30",
    score: "text-sky-300",
  },
  low: {
    badge: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40",
    ring: "ring-emerald-500/30",
    score: "text-emerald-300",
  },
};

function defaultBand(score: number): RiskBand {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function bandLabel(band: RiskBand): string {
  return band.charAt(0).toUpperCase() + band.slice(1);
}

export function ActionCard({
  businessName,
  detail,
  riskScore,
  riskBand,
  actionLabel,
  onAction,
  disabled = false,
}: ActionCardProps) {
  const band = riskBand ?? defaultBand(riskScore);
  const styles = bandStyles[band];

  return (
    <article
      className={`rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-black/30 ring-1 ${styles.ring}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Lead
          </p>
          <h2 className="truncate text-lg font-bold leading-tight">{businessName}</h2>
          {detail ? (
            <p className="mt-1 truncate text-sm text-slate-400">{detail}</p>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${styles.badge}`}
        >
          {bandLabel(band)}
        </span>
      </div>

      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Risk score
        </p>
        <p className={`text-4xl font-bold tabular-nums ${styles.score}`}>{riskScore}</p>
      </div>

      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="min-h-[56px] w-full rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-lg shadow-emerald-900/30 active:scale-[0.98] disabled:opacity-50"
      >
        {actionLabel}
      </button>
    </article>
  );
}
