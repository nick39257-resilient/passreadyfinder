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
      "Curious if this might help [Business Name] like it did our kitchen — happy to show you",
    /** Leads to draft per `npm run draft` run */
    draftBatchSize: 5,
    /** Auto-pause sending if bounce rate exceeds this (0–1) over recent sends */
    bounceRatePauseThreshold: 0.02,
    /** Max outreach emails per lead before moving to nurture */
    maxTouchesPerLead: 4,
    /** Min/max delay between individual sends (ms) */
    sendDelayMinMs: 5 * 60 * 1000,
    sendDelayMaxMs: 15 * 60 * 1000,
    /** Window size for bounce-rate calculation */
    bounceRateWindowSize: 50,
    /** Email tone guidelines passed to Gemini */
    pitchGuidelines: [
      "Zero judgment: never mention their FSA rating, stars, failures, issues, or inspection outcomes in the opening—or anywhere as shame.",
      "Assume they are doing their best in a high-pressure environment.",
      "Shared struggle opener: start with one line acknowledging the grind (e.g. Friday night rush, staffing, stock).",
      "Tool as byproduct: do not present PassReady as a product or sales pitch—it is a side project you built for your own kitchens that happened to work well.",
      "The ask: never say 'let me help you.' Close with curiosity (e.g. 'I'm curious if this would make your life easier like it did mine') before the WhatsApp link.",
      "Never pretend to be an EHO officer or any official body.",
      "One clear call-to-action: the WhatsApp link only—no other links.",
      "Keep it short — under 125 words.",
    ],
  },
} as const;

export type ProductConfig = typeof productConfig;
