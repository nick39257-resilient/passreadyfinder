import type { MfuSupportFacilityRecord } from "../../types/mfu-support-facility.js";
import { getDb } from "./db.js";

export interface MfuSupportFacilityRow {
  id: number;
  external_id: string;
  state: string;
  facility_name: string;
  legal_term_used: string;
  governing_authority: string;
  license_number: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  primary_contact_name: string | null;
  street: string;
  city: string;
  county: string;
  zip_code: string;
  potable_water_fill: number | null;
  greywater_dump: number | null;
  grease_disposal: number | null;
  commercial_kitchen_access: number | null;
  dry_cold_storage: number | null;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

function boolToSql(value: boolean | null | undefined): number | null {
  if (value === true) {
    return 1;
  }
  if (value === false) {
    return 0;
  }
  return null;
}

function sqlToBool(value: number | null | undefined): boolean | null {
  if (value === 1) {
    return true;
  }
  if (value === 0) {
    return false;
  }
  return null;
}

function externalIdFor(record: MfuSupportFacilityRecord): string {
  if (record.license_number?.trim()) {
    return `${record.state}:lic:${record.license_number.trim()}`;
  }
  const slug = `${record.facility_name}:${record.address.street}:${record.address.zip_code}`
    .toLowerCase()
    .replace(/\s+/g, "_")
    .slice(0, 160);
  return `${record.state}:${slug}`;
}

export function rowToMfuRecord(row: MfuSupportFacilityRow): MfuSupportFacilityRecord {
  try {
    return JSON.parse(row.payload_json) as MfuSupportFacilityRecord;
  } catch {
    return {
      state: row.state as MfuSupportFacilityRecord["state"],
      facility_name: row.facility_name,
      legal_term_used: row.legal_term_used as MfuSupportFacilityRecord["legal_term_used"],
      governing_authority: row.governing_authority,
      license_number: row.license_number,
      contact_details: {
        phone: row.phone,
        email: row.email,
        website: row.website,
        primary_contact_name: row.primary_contact_name,
      },
      address: {
        street: row.street,
        city: row.city,
        county: row.county,
        state: row.state as MfuSupportFacilityRecord["state"],
        zip_code: row.zip_code,
      },
      services_provided: {
        potable_water_fill: sqlToBool(row.potable_water_fill),
        greywater_dump: sqlToBool(row.greywater_dump),
        grease_disposal: sqlToBool(row.grease_disposal),
        commercial_kitchen_access: sqlToBool(row.commercial_kitchen_access),
        dry_cold_storage: sqlToBool(row.dry_cold_storage),
      },
    };
  }
}

export async function upsertMfuSupportFacility(record: MfuSupportFacilityRecord): Promise<void> {
  const db = getDb();
  const externalId = externalIdFor(record);
  const services = record.services_provided;

  await db.execute({
    sql: `
      INSERT INTO mfu_support_facilities (
        external_id, state, facility_name, legal_term_used, governing_authority,
        license_number, phone, email, website, primary_contact_name,
        street, city, county, zip_code,
        potable_water_fill, greywater_dump, grease_disposal,
        commercial_kitchen_access, dry_cold_storage,
        payload_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(external_id) DO UPDATE SET
        facility_name = excluded.facility_name,
        legal_term_used = excluded.legal_term_used,
        governing_authority = excluded.governing_authority,
        license_number = COALESCE(excluded.license_number, mfu_support_facilities.license_number),
        phone = COALESCE(excluded.phone, mfu_support_facilities.phone),
        email = COALESCE(excluded.email, mfu_support_facilities.email),
        website = COALESCE(excluded.website, mfu_support_facilities.website),
        primary_contact_name = COALESCE(excluded.primary_contact_name, mfu_support_facilities.primary_contact_name),
        street = excluded.street,
        city = excluded.city,
        county = excluded.county,
        zip_code = excluded.zip_code,
        potable_water_fill = excluded.potable_water_fill,
        greywater_dump = excluded.greywater_dump,
        grease_disposal = excluded.grease_disposal,
        commercial_kitchen_access = excluded.commercial_kitchen_access,
        dry_cold_storage = excluded.dry_cold_storage,
        payload_json = excluded.payload_json,
        updated_at = datetime('now')
    `,
    args: [
      externalId,
      record.state,
      record.facility_name,
      record.legal_term_used,
      record.governing_authority,
      record.license_number,
      record.contact_details.phone,
      record.contact_details.email,
      record.contact_details.website,
      record.contact_details.primary_contact_name,
      record.address.street,
      record.address.city,
      record.address.county,
      record.address.zip_code,
      boolToSql(services.potable_water_fill),
      boolToSql(services.greywater_dump),
      boolToSql(services.grease_disposal),
      boolToSql(services.commercial_kitchen_access),
      boolToSql(services.dry_cold_storage),
      JSON.stringify(record),
    ],
  });
}

export async function listMfuSupportFacilities(filter?: {
  state?: "TX" | "FL";
  location?: string;
  limit?: number;
}): Promise<MfuSupportFacilityRow[]> {
  const db = getDb();
  const limit = Math.min(filter?.limit ?? 500, 500);
  const conditions: string[] = [];
  const args: string[] = [];

  if (filter?.state) {
    conditions.push("state = ?");
    args.push(filter.state);
  }

  if (filter?.location?.trim()) {
    const token = filter.location.trim().toLowerCase().replace(/\./g, "");
    const like = `%${token}%`;
    conditions.push("(LOWER(city) LIKE ? OR LOWER(county) LIKE ? OR LOWER(facility_name) LIKE ?)");
    args.push(like, like, like);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  args.push(String(limit));

  const result = await db.execute({
    sql: `
      SELECT * FROM mfu_support_facilities
      ${where}
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `,
    args,
  });

  return result.rows as unknown as MfuSupportFacilityRow[];
}
