import {
  computeTexasRiskScore,
  interventionLevelForRiskScore,
} from "./texas-risk-score.js";

if (computeTexasRiskScore({ inspectionScore: 90, demerits: null }) >= 79) {
  console.error("high inspection should be lower risk");
  process.exit(1);
}

if (computeTexasRiskScore({ inspectionScore: 10, demerits: null }) < 79) {
  console.error("low inspection should be critical risk");
  process.exit(1);
}

if (interventionLevelForRiskScore(79) !== "CRITICAL_INTERVENTION") {
  console.error("79 should be critical");
  process.exit(1);
}

if (interventionLevelForRiskScore(78) !== null) {
  console.error("78 should not be critical");
  process.exit(1);
}

console.log("texas-risk-score.test: ok");
