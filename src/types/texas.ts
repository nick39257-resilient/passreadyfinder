/** PassReady Finder — US-Texas module (isolated from UK FSA `leads` table). */

export type TexasRegion = "TEXAS";

export type MobileVendorTier = "TYPE_I" | "TYPE_II" | "TYPE_III";

export type TexasInterventionLevel = "CRITICAL_INTERVENTION" | null;

export const TEXAS_CRITICAL_RISK_THRESHOLD = 79;

export const TEXAS_STATUS_EMAIL_DISCOVERED = "EMAIL_DISCOVERED" as const;
export const TEXAS_STATUS_EMAIL_SENT = "EMAIL_SENT" as const;
export const TEXAS_STATUS_FORM_SUBMITTED = "FORM_SUBMITTED" as const;

export interface TexasLeadInput {
  externalId: string;
  source: string;
  region: TexasRegion;
  businessName: string;
  address: string | null;
  city: string | null;
  county: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  ownerName: string | null;
  inspectionScore: number | null;
  demerits: number | null;
  vehicleType: string | null;
  isMobileVendor: boolean;
  vendorTier: MobileVendorTier | null;
  dshsLicenseStatus: string;
  riskScore: number;
  interventionLevel: TexasInterventionLevel;
  lastInspectionDate: string | null;
}

export interface TexasFindJobParams {
  /** Socrata / open-data source key (default: austin) */
  source?: string;
  /** Max rows per ingest run */
  limit?: number;
  /** When true, only mobile food units / trucks */
  mobileOnly?: boolean;
  fullResync?: boolean;
}

export interface TexasIngestionResult {
  fetched: number;
  stored: number;
  mobileVendors: number;
  criticalCount: number;
  source: string;
}
