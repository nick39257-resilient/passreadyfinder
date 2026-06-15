/**
 * Florida market config — DBPR bulk license/inspection extracts.
 * Uses FLORIDA_DBPR_DATA_URL when set; otherwise district CSVs from MyFloridaLicense.
 */

import { defaultFloridaDataUrl } from "../engine/florida/florida-district-sources.js";

export const floridaProductConfig = {
  region: "FLORIDA" as const,
  criticalRiskThreshold: 75,
  ingestion: {
    defaultLimit: Number(process.env.FLORIDA_INGEST_LIMIT) || 2000,
    requestDelayMs: 600,
    dataUrl:
      process.env.FLORIDA_DBPR_DATA_URL?.trim() ||
      process.env.FLORIDA_DBPR_LICENSE_URL?.trim() ||
      defaultFloridaDataUrl(),
  },
  outreach: {
    productName: "PassReady",
    scoreUrl: process.env.FLORIDA_SCORE_URL ?? "https://score.passready.us",
    siteUrl: process.env.FLORIDA_SITE_URL ?? "https://passready.us",
  },
} as const;
