import type { RiskBand } from "./ActionCard";
import { riskBandDisplayLabel } from "../lib/lead-insights";
import { riskPillStyles } from "../lib/risk-styles";

export function RiskScoreBadge({
  score,
  band,
}: {
  score: number;
  band: RiskBand;
}) {
  return (
    <div
      className={`flex shrink-0 flex-col items-center rounded-xl border border-slate-700/80 bg-slate-950/60 px-2.5 py-2 ring-1 ${riskPillStyles[band]}`}
    >
      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
        Risk score
      </span>
      <span className="text-xl font-bold tabular-nums leading-none">{score}</span>
      <span className="mt-0.5 text-[10px] font-semibold">{riskBandDisplayLabel(band)}</span>
    </div>
  );
}
