import { fetchEmailFromWebsite } from "./email-from-website.js";
import { getLeadById } from "../store/leads-repository.js";
import { getDb } from "../store/db.js";

export async function updateLeadEmail(leadId: number, email: string | null): Promise<void> {
  const normalized = email?.trim().toLowerCase() ?? null;
  const db = getDb();
  await db.execute({
    sql: `
      UPDATE leads
      SET email = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [normalized, leadId],
  });
}

/** Try to discover a business email from the lead's website (no-op if email already set). */
export async function tryEnrichLeadEmailFromWebsite(
  leadId: number,
  website: string | null,
): Promise<string | null> {
  const row = await getLeadById(leadId);
  if (!row) {
    return null;
  }
  if (row.email?.trim()) {
    return row.email.trim();
  }
  if (!website?.trim()) {
    return null;
  }

  const discovered = await fetchEmailFromWebsite(website);
  if (!discovered) {
    return null;
  }

  await updateLeadEmail(leadId, discovered);
  return discovered;
}
