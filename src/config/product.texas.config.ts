/**
 * Texas market config — isolated from UK `product.config.ts` / FSA pipeline.
 */

export const texasProductConfig = {
  region: "TEXAS" as const,
  criticalRiskThreshold: 79,
  hb2844EffectiveDate: "2026-07-01",
  defaultDshsLicenseStatus: "PENDING_JULY_2026",
  /** Risk score at or above this value → CRITICAL_INTERVENTION */
  interventionThreshold: 79,
  ingestion: {
    defaultSource: "austin",
    defaultLimit: 500,
    requestDelayMs: 600,
    sources: {
      austin: {
        label: "Austin/Travis (open data)",
        url:
          process.env.TEXAS_AUSTIN_INSPECTIONS_URL ??
          "https://data.austintexas.gov/resource/ecmv-9xxi.json",
      },
    },
  },
  enrichment: {
    /** Pause between Apollo lookups (rate limit). */
    apolloDelayMs: Number(process.env.TEXAS_APOLLO_DELAY_MS) || 1200,
    /** Default batch size for `npm run texas-enrich-apollo`. */
    defaultBatchLimit: Number(process.env.TEXAS_APOLLO_BATCH_LIMIT) || 500,
    autopilotBatchLimit: Number(process.env.TEXAS_AUTOPILOT_LIMIT) || 500,
    autopilotDelayMs: Number(process.env.TEXAS_AUTOPILOT_DELAY_MS) || 1500,
  },
  outreach: {
    productName: "PassReady",
    emailSubject:
      process.env.TEXAS_OUTREACH_EMAIL_SUBJECT ??
      "HB 2844 mobile compliance — PassReady",
    emailSubjectFixed:
      process.env.TEXAS_OUTREACH_EMAIL_SUBJECT_FIXED ??
      "DSHS compliance check — PassReady",
    scoreUrl: process.env.TEXAS_SCORE_URL ?? "https://score.passready.us",
    siteUrl: process.env.TEXAS_SITE_URL ?? "https://passready.us",
    /** Optional override — set TEXAS_HB2844_MOBILE_TEMPLATE in .env for a custom body. */
    hb2844MobileTemplate: process.env.TEXAS_HB2844_MOBILE_TEMPLATE ?? "",
  },
} as const;

export type TexasProductConfig = typeof texasProductConfig;
