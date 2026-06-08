import { buildTexasOutreachMeta } from "../engine/texas/texas-outreach-meta.js";
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
  outreachDraftPreview: string | null;
  draftHasScoreLink: boolean;
  needsScoreLinkRefresh: boolean;
  trackedScoreUrl: string;
  lastPreviewedAt: string | null;
  outreachSentAt: string | null;
}

export function mapTexasLeadRowToApi(row: TexasLeadRow): ApiTexasLead {
  const meta = buildTexasOutreachMeta(row);
  const outreachChannel = resolveTexasOutreachChannel(row);
  const hb2844DraftPreview = meta.outreachDraftPreview;

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
    isMobileVendor: row.is_mobile_vendor === 1,
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
    outreachDraftPreview: meta.outreachDraftPreview,
    draftHasScoreLink: meta.draftHasScoreLink,
    needsScoreLinkRefresh: meta.needsScoreLinkRefresh,
    trackedScoreUrl: meta.trackedScoreUrl,
    lastPreviewedAt: meta.lastPreviewedAt,
    outreachSentAt: row.outreach_sent_at ?? null,
  };
}
