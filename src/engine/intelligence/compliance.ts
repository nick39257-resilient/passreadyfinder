const COMPLIANCE_TIPS = [
  "Check fridge seals today — weak seals are a common 2-star finding.",
  "Log core temperatures at opening and peak service; gaps show up fast on revisit.",
  "Keep allergen info visible at the point of order, not just in the back office.",
  "Date-label opened sauces and chilled prep — EHOs spot this in minutes.",
  "Clear grease build-up behind fryers before your next inspection window.",
] as const;

export function getComplianceTipOfDay(): string {
  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return COMPLIANCE_TIPS[dayIndex % COMPLIANCE_TIPS.length] ?? COMPLIANCE_TIPS[0];
}

export function daysSinceInspection(isoDate: string | null): number | null {
  if (!isoDate) {
    return null;
  }
  const inspected = new Date(isoDate);
  if (Number.isNaN(inspected.getTime())) {
    return null;
  }
  return Math.floor((Date.now() - inspected.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildInspectionSummary(
  fsaRating: number | null,
  fsaLastInspectionDate: string | null,
): string {
  const days = daysSinceInspection(fsaLastInspectionDate);
  const daysText =
    days === null ? "unknown" : days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`;

  if (fsaRating === null) {
    return `Last inspection ${daysText}. Rating not published — focus on documented daily checks before outreach.`;
  }
  if (fsaRating <= 2) {
    return `Rated ${fsaRating}-star, last inspection ${daysText}. Prioritise hygiene records, temperature logs, and allergen controls in your message.`;
  }
  if (fsaRating === 3) {
    return `Rated 3-star, last inspection ${daysText}. Emphasise consistency habits and closing small gaps before the next visit.`;
  }
  return `Rated ${fsaRating}-star, last inspection ${daysText}. Position PassReady as efficiency and reputation protection ahead of the next EHO visit.`;
}
