import type { MobileVendorTier } from "../../types/texas.js";
import {
  classifyMobileVendorTier,
  type MobileVendorClassificationInput,
} from "./hb2844.js";
import {
  getAllTexasLeads,
  updateTexasMobileLeadMetadata,
} from "../store/texas-leads-repository.js";
import { upsertHb2844MobileTemplate } from "../store/texas-outreach-repository.js";

export interface TexasTierResyncResult {
  scanned: number;
  mobileUpdated: number;
  tierCounts: Record<MobileVendorTier, number>;
}

function classificationInputFromRow(row: {
  business_name: string;
  vehicle_type: string | null;
}): MobileVendorClassificationInput {
  return {
    businessName: row.business_name,
    vehicleType: row.vehicle_type,
  };
}

/**
 * Re-process existing texas_leads rows: vendor tiers + HB 2844 draft_message for mobile units.
 */
export async function reclassifyExistingTexasMobileLeads(): Promise<TexasTierResyncResult> {
  await upsertHb2844MobileTemplate();

  const rows = await getAllTexasLeads();
  const tierCounts: Record<MobileVendorTier, number> = {
    TYPE_I: 0,
    TYPE_II: 0,
    TYPE_III: 0,
  };
  let mobileUpdated = 0;

  for (const row of rows) {
    if (row.is_mobile_vendor !== 1) {
      continue;
    }

    const input = classificationInputFromRow(row);
    const vendorTier =
      classifyMobileVendorTier(input, { assumeMobile: true }) ?? "TYPE_II";
    tierCounts[vendorTier]++;

    await updateTexasMobileLeadMetadata({
      leadId: row.id,
      isMobileVendor: true,
      vendorTier,
      ownerName: row.owner_name,
      businessName: row.business_name,
    });
    mobileUpdated++;
  }

  return {
    scanned: rows.length,
    mobileUpdated,
    tierCounts,
  };
}
