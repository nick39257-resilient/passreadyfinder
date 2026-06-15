export function computeFloridaRiskScore(input: {
  priorityViolations: number | null;
  inspectionScore: number | null;
  riskLevel: string | null;
}): number {
  let score = 30;

  const pv = input.priorityViolations ?? 0;
  if (pv >= 5) {
    score += 45;
  } else if (pv >= 3) {
    score += 30;
  } else if (pv >= 1) {
    score += 15;
  }

  const insp = input.inspectionScore;
  if (insp !== null) {
    if (insp < 70) {
      score += 25;
    } else if (insp < 85) {
      score += 10;
    }
  }

  const risk = (input.riskLevel ?? "").toLowerCase();
  if (risk.includes("high")) {
    score += 20;
  } else if (risk.includes("moderate") || risk.includes("medium")) {
    score += 10;
  }

  return Math.min(Math.max(score, 0), 100);
}

export function isFloridaCriticalRisk(score: number, threshold = 75): boolean {
  return score >= threshold;
}
