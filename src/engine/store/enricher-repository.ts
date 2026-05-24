import { getDb } from "./db.js";

export interface LeadNeedingPhone {
  id: number;
  business_name: string;
  postcode: string;
  address: string;
}

export async function getLeadsNeedingPhone(): Promise<LeadNeedingPhone[]> {
  const db = getDb();
  const result = await db.execute(`
    SELECT id, business_name, postcode, address
    FROM leads
    WHERE phone IS NULL
    ORDER BY lead_score DESC
  `);
  return result.rows as unknown as LeadNeedingPhone[];
}

export async function updateLeadContact(
  leadId: number,
  phone: string | null,
  website: string | null,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads
      SET
        phone = COALESCE(?, phone),
        website = COALESCE(?, website),
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [phone, website, leadId],
  });
}
