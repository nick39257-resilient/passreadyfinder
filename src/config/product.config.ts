/**
 * PassReady product config — edit this file to change WHO we target, WHERE, and HOW we score.
 * The engine reads only from here; swap this file for a future product (e.g. Resilient Kitchen).
 */

export type AreaConfig =
  | { mode: "localAuthority"; localAuthorityName: string }
  | {
      mode: "radius";
      latitude: number;
      longitude: number;
      radiusMetres: number;
    };

export const productConfig = {
  /** FSA BusinessType names — resolved to IDs at runtime via /BusinessTypes */
  businessTypeNames: [
    "Takeaway/sandwich shop",
    "Restaurant/Cafe/Canteen",
    "Mobile caterer",
  ],

  /** Geographic area to search (UK = all FSA local authorities) */
  area: {
    mode: "localAuthority",
    localAuthorityName: "UK",
  } as AreaConfig,

  /** Only keep establishments with numeric FSA rating 0–maxRating (inclusive) */
  maxRating: 4,

  /** Cap OSM/email enrichment per find run when matches exceed this (delta runs usually smaller). */
  enrichTopN: 500,

  /** Phase 1 enrichment — Apollo + optional contact-form fallback */
  enrichment: {
    apolloEnabled: true,
    apolloDailyCap: 50,
    contactFormMessage:
      "Hi — I'm a kitchen manager in Preston. I built PassReady for [Business Name] and our own takeaway team (EHO checklists, allergens, multilingual). Free FSA score check: https://score.passready.uk — happy to share a 7-day trial if useful.",
    contactFormAutoSubmit: false,
  },

  /** Scoring weights — see scorer.ts for formula */
  scoring: {
    /** Points per rating: index = rating value (0–5) */
    ratingPoints: [50, 40, 30, 15, 5, 0] as const,
    /** Points for non-numeric ratings (Scotland Pass/Improvement etc.) */
    nullRatingPoints: 10,
    /** Max points from inspection age (daysSince / inspectionAgeDivisor, capped) */
    inspectionAgeDivisor: 30,
    inspectionAgeMaxPoints: 36,
    /** Bonus when on_delivery_app = 'true' ('unknown' adds nothing) */
    deliveryAppBonus: 5,
  },

  /** FSA API settings */
  fsa: {
    baseUrl: "https://api.ratings.food.gov.uk",
    pageSize: 200,
    /** Minimum ms between FSA HTTP calls (serialized queue). */
    requestDelayMs: 800,
    /** Base pause when FSA returns 429 before retry (multiplied by attempt). */
    rateLimitPauseMs: 10_000,
    maxRetries: 4,
  },

  /** Overpass API settings */
  osm: {
    overpassUrl: "https://overpass-api.de/api/interpreter",
    searchRadiusMetres: 150,
    /** ≥1.2s between Overpass calls (see osm-enricher OSM_REQUEST_INTERVAL_MS). */
    requestDelayMs: 1200,
  },

  /**
   * Phase B outreach — pitch copy, links, and channel settings.
   * Drafting model: GEMINI_DRAFT_MODEL in .env (see gemini-draft-model.ts). API keys in .env.
   */
  outreach: {
    /** English-only for now (Phase C adds Urdu/Bengali/Polish) */
    language: "en" as const,
    /** Product name used in copy */
    productName: "PassReady",
    /** Monthly price mentioned in copy */
    monthlyPrice: "£29.99",
    /** WhatsApp Business number (digits only, no +) — set WHATSAPP_NUMBER in .env */
    whatsappNumberEnvKey: "WHATSAPP_NUMBER" as const,
    /** SafeScore / outreach landing URL — set TRIAL_URL or SCORE_URL in .env (default score.passready.uk) */
    trialUrlEnvKey: "TRIAL_URL" as const,
    /** Pre-filled WhatsApp opener — [Business Name] replaced per lead */
    whatsappPrefillTemplate:
      "Curious if this might help [Business Name] like it did our kitchen — happy to show you",
    /** Outbound wa.me to the business (their number) — [Business Name] replaced per lead */
    whatsappOutboundTemplate:
      "Hi — we built a free tool that shows your FSA food safety score in seconds. Worth a look for [Business Name]?",
    /** Leads to draft per `npm run draft` run */
    draftBatchSize: 5,
    /** Minimum ms between Gemini calls (serialized queue). */
    geminiRequestDelayMs: 4000,
    /** Base pause when Gemini returns 429 before retry (multiplied by attempt). */
    geminiRateLimitPauseMs: 15_000,
    geminiMaxRetries: 4,
    /** Finder cron — once per UTC day (pair with hourly Render schedule). */
    finderCron: {
      earliestHourUtc: 5,
      latestHourUtc: 8,
      runBucketMinutes: 60,
    },
    /** QueueDrafter — small batch every ~30 min; long gaps between leads. */
    queueDrafter: {
      /** Leads drafted per cron tick (keep low to avoid 429). */
      batchSize: 2,
      /** Only draft leads above this risk score. */
      riskScoreThreshold: 75,
      leadDelayMinMs: 60_000,
      leadDelayMaxMs: 120_000,
      rateLimitPauseMs: 5 * 60_000,
      maxRetriesPerLead: 4,
    },
    /** Auto-pause sending if bounce rate exceeds this (0–1) over recent sends */
    bounceRatePauseThreshold: 0.02,
    /** Max outreach emails per lead before moving to nurture */
    maxTouchesPerLead: 4,
    /** Min/max delay between individual sends (ms) */
    sendDelayMinMs: 5 * 60 * 1000,
    sendDelayMaxMs: 15 * 60 * 1000,
    /** Max outreach emails per mailbox per UTC day (override via DAILY_SEND_CAP env). */
    dailySendCap: 30,
    /** Background cron — run bucket size (pair with Render schedule every 5 minutes). */
    cronSchedule: {
      earliestHourUtc: 9,
      latestHourUtc: 15,
      runBucketMinutes: 5,
    },
    /** Window size for bounce-rate calculation */
    bounceRateWindowSize: 50,
    /** Email tone guidelines passed to Gemini */
    pitchGuidelines: [
      "Zero judgment: never mention their FSA rating, stars, failures, issues, or inspection outcomes in the opening—or anywhere as shame.",
      "Assume they are doing their best in a high-pressure environment.",
      "Shared struggle opener: start with one line acknowledging the grind (e.g. Friday night rush, staffing, stock).",
      "Tool as byproduct: do not present PassReady as a product or sales pitch—it is a side project you built for your own kitchens that happened to work well.",
      "Variable injection (required): naturally include all three — (1) Business Name, (2) a practical FSA-area issue hook (not their star rating), (3) a generic local reference (Preston). Never mention being on the same road/high street.",
      "First message: include the SafeScore link (score.passready.uk) on its own line as the only URL — free FSA check, no sign-up. No other links or wa.me.",
      "Follow-up after they reply: same SafeScore link as the only CTA.",
      "Never pretend to be an EHO officer or any official body.",
      "Keep it short — under 125 words.",
    ],
  },
} as const;

export type ProductConfig = typeof productConfig;
