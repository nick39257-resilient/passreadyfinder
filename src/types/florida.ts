/** PassReady Finder — Florida DBPR module */

export type FloridaRegion = "FLORIDA";

export interface FloridaLeadInput {
  externalId: string;
  source: string;
  region: FloridaRegion;
  businessName: string;
  address: string | null;
  city: string | null;
  county: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  licenseType: string | null;
  riskLevel: string | null;
  inspectionScore: number | null;
  priorityViolations: number | null;
  lastInspectionDate: string | null;
  riskScore: number;
  status: string;
}

export interface FloridaFindJobParams {
  limit?: number;
  county?: string;
  city?: string;
}

export interface FloridaIngestionResult {
  fetched: number;
  stored: number;
  criticalCount: number;
  source: string;
}
