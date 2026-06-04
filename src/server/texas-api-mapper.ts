import { buildHb2844MobileOutreachMessage } from "../engine/texas/hb2844.js";
import {
  isTexasOutreachComplete,
  resolveTexasOutreachChannel,
  texasOutreachButtonLabel,
  texasStatusDisplayLabel,
  type TexasOutreachChannel,
} from "../engine/texas/texas-outreach-channel.js";
import type { TexasLeadRow } from "../engine/store/texas-leads-repository.js";

export interface ApiTexasLead {
  id: number;
  region: string;
  businessName: string;
  address: string | null;
  city: string | null;
  county: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  ownerName: string | null;
  inspectionScore: number | null;
  demerits: number | null;
  vehicleType: string | null;
  isMobileVendor: boolean;
  vendorTier: string | null;
  dshsLicenseStatus: string;
  texasRiskScore: number;
  interventionLevel: string | null;
  isCritical: boolean;
  lastInspectionDate: string | null;
  status: string;
  statusLabel: string;
  website: string | null;
  outreachChannel: TexasOutreachChannel;
  outreachButtonLabel: string;
  outreachComplete: boolean;
  hb2844DraftPreview: string | null;
}

export function mapTexasLeadRowToApi(row: TexasLeadRow): ApiTexasLead {
  const isMobile = row.is_mobile_vendor === 1;
  const owner = row.owner_name ?? "";
  const hb2844DraftPreview = isMobile
    ? row.draft_message?.trim() ||
      buildHb2844MobileOutreachMessage({
        ownerName: owner || "there",
        businessName: row.business_name,
      })
    : null;

  const outreachChannel = resolveTexasOutreachChannel(row);

  return {
    id: row.id,
    region: row.region,
    businessName: row.business_name,
    address: row.address,
    city: row.city,
    county: row.county,
    zip: row.zip,
    phone: row.phone,
    email: row.email,
    website: row.website ?? null,
    ownerName: row.owner_name,
    inspectionScore: row.inspection_score,
    demerits: row.demerits,
    vehicleType: row.vehicle_type,
    isMobileVendor: isMobile,
    vendorTier: row.vendor_tier,
    dshsLicenseStatus: row.dshs_license_status,
    texasRiskScore: row.risk_score,
    interventionLevel: row.intervention_level,
    isCritical: row.intervention_level === "CRITICAL_INTERVENTION",
    lastInspectionDate: row.last_inspection_date,
    status: row.status,
    statusLabel: texasStatusDisplayLabel(row.status),
    outreachChannel,
    outreachButtonLabel: texasOutreachButtonLabel(outreachChannel),
    outreachComplete: isTexasOutreachComplete(row.status),
    hb2844DraftPreview,
  };
}
