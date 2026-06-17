/**
 * Strict schema for Texas CPF and Florida commissary extraction.
 * Do not invent missing fields — use null / false only when evidence supports it.
 */

export type MfuSupportFacilityState = "TX" | "FL";

export type MfuLegalTerm = "Central Preparation Facility" | "Commissary";

export type MfuFacilityContactDetails = {
  phone: string | null;
  email: string | null;
  website: string | null;
  primary_contact_name: string | null;
};

export type MfuFacilityAddress = {
  street: string;
  city: string;
  county: string;
  state: MfuSupportFacilityState;
  zip_code: string;
};

export type MfuServicesProvided = {
  potable_water_fill: boolean | null;
  greywater_dump: boolean | null;
  grease_disposal: boolean | null;
  commercial_kitchen_access: boolean | null;
  dry_cold_storage: boolean | null;
};

export type MfuSupportFacilityRecord = {
  state: MfuSupportFacilityState;
  facility_name: string;
  legal_term_used: MfuLegalTerm;
  governing_authority: string;
  license_number: string | null;
  contact_details: MfuFacilityContactDetails;
  address: MfuFacilityAddress;
  services_provided: MfuServicesProvided;
};

export type MfuFacilityExtractionResult = {
  extractedAt: string;
  source: string;
  records: MfuSupportFacilityRecord[];
  skipped: number;
};
