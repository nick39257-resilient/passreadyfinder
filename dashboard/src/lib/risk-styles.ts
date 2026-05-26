import type { RiskBand } from "../components/ActionCard";

export const riskPillStyles: Record<RiskBand, string> = {
  critical: "bg-red-500/20 text-red-300 ring-red-500/40",
  high: "bg-amber-500/20 text-amber-300 ring-amber-500/40",
  medium: "bg-sky-500/20 text-sky-300 ring-sky-500/40",
  low: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40",
};

export const statusPillStyles: Record<string, string> = {
  new: "bg-slate-700 text-slate-200",
  drafted: "bg-violet-500/25 text-violet-200",
  approved: "bg-amber-500/25 text-amber-200",
  contacted: "bg-emerald-500/25 text-emerald-200",
  nurture: "bg-slate-600 text-slate-300",
  rejected: "bg-red-900/40 text-red-200",
};
