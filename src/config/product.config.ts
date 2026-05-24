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
  businessTypeNames: ["Takeaway/sandwich shop", "Restaurant/Cafe/Canteen"],

  /** Geographic area to search */
  area: {
    mode: "localAuthority",
    localAuthorityName: "Preston",
  } as AreaConfig,

  /** Only keep establishments with numeric FSA rating 0–maxRating (inclusive) */
  maxRating: 2,

  /** Only run OSM enrichment on the top N leads by FSA-only score */
  enrichTopN: 200,

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
  },

  /** Overpass API settings */
  osm: {
    overpassUrl: "https://overpass-api.de/api/interpreter",
    searchRadiusMetres: 150,
    requestDelayMs: 1100,
  },

  /**
   * Phase B outreach — pitch copy, links, and channel settings.
   * Model name and API keys live in .env (prices move fast).
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
    /** PassReady free trial URL — set TRIAL_URL in .env */
    trialUrlEnvKey: "TRIAL_URL" as const,
    /** Pre-filled WhatsApp opener — [Business Name] replaced per lead */
    whatsappPrefillTemplate:
      "Show me how PassReady works for [Business Name]",
    /** Leads to draft per `npm run draft` run */
    draftBatchSize: 5,
    /** Auto-pause sending if bounce rate exceeds this (0–1) over recent sends */
    bounceRatePauseThreshold: 0.05,
    /** Window size for bounce-rate calculation */
    bounceRateWindowSize: 50,
    /** Email tone guidelines passed to Gemini */
    pitchGuidelines: [
      "Speak as an ally helping them be ready for their next EHO inspection",
      "Never accuse or shame them about their rating",
      "Never pretend to be an EHO officer or any official body",
      "Be openly from PassReady — a £29.99/month app for UK food businesses",
      "One clear call-to-action: tap the WhatsApp link to see how it works",
      "Keep it short — under 150 words",
    ],
  },
} as const;

export type ProductConfig = typeof productConfig;
