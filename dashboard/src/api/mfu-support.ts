import { fetchWithTimeout } from "../lib/fetch-with-timeout.js";

export type MfuSupportFacility = {
  id: number;
  state: "TX" | "FL";
  facility_name: string;
  legal_term_used: "Central Preparation Facility" | "Commissary";
  governing_authority: string;
  license_number: string | null;
  contact_details: {
    phone: string | null;
    email: string | null;
    website: string | null;
    primary_contact_name: string | null;
  };
  address: {
    street: string;
    city: string;
    county: string;
    state: "TX" | "FL";
    zip_code: string;
  };
  services_provided: {
    potable_water_fill: boolean | null;
    greywater_dump: boolean | null;
    grease_disposal: boolean | null;
    commercial_kitchen_access: boolean | null;
    dry_cold_storage: boolean | null;
  };
  outreachReady: boolean;
};

export async function fetchMfuSupportFacilities(
  options?: { state?: "TX" | "FL"; location?: string; limit?: number },
): Promise<MfuSupportFacility[]> {
  const params = new URLSearchParams();
  if (options?.state) {
    params.set("state", options.state);
  }
  if (options?.location?.trim()) {
    params.set("location", options.location.trim());
  }
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  const res = await fetchWithTimeout(`/api/mfu-support/facilities?${params}`);
  if (!res.ok) {
    throw new Error("Failed to load MFU support facilities");
  }
  const body = (await res.json()) as { facilities: MfuSupportFacility[] };
  return body.facilities;
}
