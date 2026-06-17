import type {
  MfuFacilityAddress,
  MfuFacilityContactDetails,
  MfuLegalTerm,
  MfuServicesProvided,
  MfuSupportFacilityRecord,
  MfuSupportFacilityState,
} from "../../types/mfu-support-facility.js";

const FL_COMMISSARY_RE =
  /\bcommissary(?:\s+services|\s+kitchen|\s+for\s+mobile|\s+food)?\b/i;
const TX_CPF_RE =
  /\b(central\s+preparation\s+facility|\bcpf\b|commissary(?:\s+services|\s+kitchen)?)\b/i;

const MFU_EVIDENCE_RE =
  /\b(mobile\s+food(\s+unit|\s+dispensing\s+vehicle|\s+truck)?|mfdv|mfu|food\s+truck|commissary|central\s+preparation\s+facility|\bcpf\b)\b/i;

const FL_EXCLUDE_ONLY_MFDV_OPERATOR_RE =
  /\b(mobile\s+food\s+dispensing\s+vehicle|hot\s+dog\s+cart|mfdv|mfu)\b/i;

export function passesFloridaCommissaryTaxonomy(text: string): boolean {
  return FL_COMMISSARY_RE.test(text);
}

export function passesTexasCpfTaxonomy(text: string): boolean {
  return TX_CPF_RE.test(text);
}

/**
 * Facility must explicitly signal MFU/MFDV support — not a generic restaurant.
 * Florida commissary naming satisfies this; Texas rows need CPF/commissary + mobile context
 * unless sourced from an authority-published CPF/commissary list.
 */
export function hasExplicitMfuServiceEvidence(text: string, options?: { authorityListed?: boolean }): boolean {
  if (options?.authorityListed) {
    return true;
  }
  if (!MFU_EVIDENCE_RE.test(text)) {
    return false;
  }
  if (FL_EXCLUDE_ONLY_MFDV_OPERATOR_RE.test(text) && !/\bcommissary\b/i.test(text)) {
    return false;
  }
  return true;
}

export function formatUsPhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) {
    return null;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return null;
}

export function parseServicesFromText(text: string | null | undefined): MfuServicesProvided {
  if (!text?.trim()) {
    return {
      potable_water_fill: null,
      greywater_dump: null,
      grease_disposal: null,
      commercial_kitchen_access: null,
      dry_cold_storage: null,
    };
  }

  const lower = text.toLowerCase();
  const hasWater =
    /\b(potable\s+water|water\s+fill|fill\s+water|water\b)/i.test(lower) &&
    !/no\s+water/i.test(lower);
  const hasDump =
    /\b(dump\/?fill|grey\s*water|gray\s*water|wastewater|liquid\s+waste|dump\b)/i.test(lower);
  const hasGrease = /\bgrease\b/i.test(lower);
  const hasKitchen = /\b(kitchen\s+available|commercial\s+kitchen|kitchen\s+access|prep\s+kitchen)\b/i.test(
    lower,
  );
  const hasStorage = /\b(dry\s+storage|cold\s+storage|storage|onsite\s+storage)\b/i.test(lower);

  return {
    potable_water_fill: hasWater ? true : null,
    greywater_dump: hasDump ? true : null,
    grease_disposal: hasGrease ? true : null,
    commercial_kitchen_access: hasKitchen ? true : null,
    dry_cold_storage: hasStorage ? true : null,
  };
}

export function mergeServices(
  base: MfuServicesProvided,
  extra: MfuServicesProvided,
): MfuServicesProvided {
  return {
    potable_water_fill: extra.potable_water_fill ?? base.potable_water_fill,
    greywater_dump: extra.greywater_dump ?? base.greywater_dump,
    grease_disposal: extra.grease_disposal ?? base.grease_disposal,
    commercial_kitchen_access: extra.commercial_kitchen_access ?? base.commercial_kitchen_access,
    dry_cold_storage: extra.dry_cold_storage ?? base.dry_cold_storage,
  };
}

export function splitStreetCityZip(input: {
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  county?: string | null;
  state: MfuSupportFacilityState;
}): MfuFacilityAddress | null {
  const street = input.street?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const zip = (input.zip?.trim() ?? "").replace(/[^\d-]/g, "");
  const county = input.county?.trim() ?? "";

  if (!street || !city || !zip) {
    return null;
  }

  return {
    street,
    city,
    county: county || "Unknown",
    state: input.state,
    zip_code: zip.length >= 5 ? zip.slice(0, 5) : zip,
  };
}

export function buildFacilityRecord(input: {
  state: MfuSupportFacilityState;
  facilityName: string;
  legalTerm: MfuLegalTerm;
  governingAuthority: string;
  licenseNumber?: string | null;
  contact?: Partial<MfuFacilityContactDetails>;
  address: MfuFacilityAddress;
  servicesText?: string | null;
  services?: MfuServicesProvided;
}): MfuSupportFacilityRecord {
  return {
    state: input.state,
    facility_name: input.facilityName.trim(),
    legal_term_used: input.legalTerm,
    governing_authority: input.governingAuthority,
    license_number: input.licenseNumber?.trim() || null,
    contact_details: {
      phone: formatUsPhone(input.contact?.phone ?? null),
      email: input.contact?.email?.trim() || null,
      website: input.contact?.website?.trim() || null,
      primary_contact_name: input.contact?.primary_contact_name?.trim() || null,
    },
    address: input.address,
    services_provided: input.services ?? parseServicesFromText(input.servicesText),
  };
}

export function dedupeFacilities(records: MfuSupportFacilityRecord[]): MfuSupportFacilityRecord[] {
  const byKey = new Map<string, MfuSupportFacilityRecord>();
  for (const record of records) {
    const key = [
      record.state,
      record.license_number ?? "",
      record.facility_name.toLowerCase(),
      record.address.street.toLowerCase(),
    ].join("|");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, record);
      continue;
    }
    byKey.set(key, {
      ...existing,
      contact_details: {
        phone: existing.contact_details.phone ?? record.contact_details.phone,
        email: existing.contact_details.email ?? record.contact_details.email,
        website: existing.contact_details.website ?? record.contact_details.website,
        primary_contact_name:
          existing.contact_details.primary_contact_name ??
          record.contact_details.primary_contact_name,
      },
      services_provided: mergeServices(existing.services_provided, record.services_provided),
    });
  }
  return [...byKey.values()];
}
