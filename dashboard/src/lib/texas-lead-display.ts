import type { ApiTexasLead } from "../api/texas-leads";

/** Never render raw objects in JSX — coerce to display string. */
export function formatTexasField(value: unknown, fallback = "—"): string {
  if (value == null || value === "") {
    return fallback;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

export function formatTexasScore(value: unknown): string {
  if (value == null || typeof value === "object") {
    return "—";
  }
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "—";
}

export function normalizeTexasLead(raw: unknown): ApiTexasLead {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const intervention = formatTexasField(
    r.interventionLevel ?? r.intervention_level,
    "",
  );
  const riskScore = Number(r.texasRiskScore ?? r.risk_score ?? 0);

  return {
    id: Number(r.id ?? 0),
    region: formatTexasField(r.region, "TEXAS"),
    businessName: formatTexasField(r.businessName ?? r.business_name, "Unknown venue"),
    address: (r.address as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    county: (r.county as string | null) ?? null,
    zip: (r.zip as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    ownerName: (r.ownerName as string | null) ?? (r.owner_name as string | null) ?? null,
    inspectionScore:
      r.inspectionScore != null || r.inspection_score != null
        ? Number(r.inspectionScore ?? r.inspection_score)
        : null,
    demerits:
      r.demerits != null ? Number(r.demerits) : null,
    vehicleType: (r.vehicleType as string | null) ?? (r.vehicle_type as string | null) ?? null,
    isMobileVendor:
      r.isMobileVendor === true ||
      r.isMobileVendor === 1 ||
      r.is_mobile_vendor === 1 ||
      r.is_mobile_vendor === true,
    vendorTier: (r.vendorTier as string | null) ?? (r.vendor_tier as string | null) ?? null,
    dshsLicenseStatus: formatTexasField(
      r.dshsLicenseStatus ?? r.dshs_license_status,
      "PENDING_JULY_2026",
    ),
    texasRiskScore: Number.isFinite(riskScore) ? riskScore : 0,
    interventionLevel: intervention || null,
    isCritical:
      r.isCritical === true ||
      r.isCritical === 1 ||
      intervention === "CRITICAL_INTERVENTION",
    lastInspectionDate:
      (r.lastInspectionDate as string | null) ?? (r.last_inspection_date as string | null) ?? null,
    status: formatTexasField(r.status, "new"),
    hb2844DraftPreview:
      typeof r.hb2844DraftPreview === "string"
        ? r.hb2844DraftPreview
        : typeof r.hb2844_draft_preview === "string"
          ? r.hb2844_draft_preview
          : null,
  };
}

export function formatTexasLocation(lead: Pick<ApiTexasLead, "city" | "county" | "zip">): string {
  const parts = [
    formatTexasField(lead.city, ""),
    formatTexasField(lead.county, ""),
    formatTexasField(lead.zip, ""),
  ].filter((p) => p && p !== "—");
  return parts.length > 0 ? parts.join(", ") : "—";
}

export function formatVendorTier(tier: string | null | undefined): string {
  if (!tier) {
    return "—";
  }
  return tier.replace(/_/g, " ");
}
