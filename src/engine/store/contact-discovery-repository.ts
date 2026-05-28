import type { ChannelDrafts, ContactAiInsights, LeadContactDiscoveryRow } from "../contact-discovery/types.js";
import type { ContactDiscoveryResult } from "../contact-discovery/types.js";
import { getDb } from "./db.js";

export async function runContactDiscoveryMigrations(): Promise<void> {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS lead_contact_discovery (
      lead_id INTEGER PRIMARY KEY,
      website TEXT,
      website_source_url TEXT,
      email TEXT,
      email_source_url TEXT,
      contact_page_url TEXT,
      contact_form_detected INTEGER NOT NULL DEFAULT 0,
      contact_form_source_url TEXT,
      facebook_url TEXT,
      facebook_source_url TEXT,
      instagram_url TEXT,
      instagram_source_url TEXT,
      whatsapp TEXT,
      whatsapp_source_url TEXT,
      phone TEXT,
      phone_source_url TEXT,
      contact_score INTEGER NOT NULL DEFAULT 0,
      ai_summary TEXT,
      ai_recommended_pitch TEXT,
      draft_email TEXT,
      draft_contact_form TEXT,
      draft_facebook TEXT,
      draft_whatsapp TEXT,
      draft_phone_script TEXT,
      discovered_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_lead_contact_discovery_score ON lead_contact_discovery(contact_score DESC)`,
  );
}

export async function getContactDiscoveryByLeadId(
  leadId: number,
): Promise<LeadContactDiscoveryRow | null> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT * FROM lead_contact_discovery WHERE lead_id = ?`,
    args: [leadId],
  });
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0] as unknown as LeadContactDiscoveryRow;
}

function rowToApi(row: LeadContactDiscoveryRow) {
  return {
    leadId: row.lead_id,
    website: row.website,
    websiteSourceUrl: row.website_source_url,
    email: row.email,
    emailSourceUrl: row.email_source_url,
    contactPageUrl: row.contact_page_url,
    contactFormDetected: Boolean(row.contact_form_detected),
    contactFormSourceUrl: row.contact_form_source_url,
    facebookUrl: row.facebook_url,
    facebookSourceUrl: row.facebook_source_url,
    instagramUrl: row.instagram_url,
    instagramSourceUrl: row.instagram_source_url,
    whatsapp: row.whatsapp,
    whatsappSourceUrl: row.whatsapp_source_url,
    phone: row.phone,
    phoneSourceUrl: row.phone_source_url,
    contactScore: row.contact_score,
    aiSummary: row.ai_summary,
    aiRecommendedPitch: row.ai_recommended_pitch,
    drafts: {
      email: row.draft_email,
      contactForm: row.draft_contact_form,
      facebook: row.draft_facebook,
      whatsapp: row.draft_whatsapp,
      phoneScript: row.draft_phone_script,
    },
    discoveredAt: row.discovered_at,
    updatedAt: row.updated_at,
    contactable:
      Boolean(row.email?.trim()) ||
      Boolean(row.contact_form_detected) ||
      Boolean(row.facebook_url?.trim()) ||
      Boolean(row.whatsapp?.trim()) ||
      Boolean(row.phone?.trim()),
  };
}

export type ApiContactDiscovery = ReturnType<typeof rowToApi>;

export async function getContactDiscoveryApi(leadId: number): Promise<ApiContactDiscovery | null> {
  const row = await getContactDiscoveryByLeadId(leadId);
  if (!row) {
    return null;
  }
  return rowToApi(row);
}

export async function saveContactDiscovery(
  result: ContactDiscoveryResult,
  insights: ContactAiInsights | null,
  drafts: ChannelDrafts,
): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: `
      INSERT INTO lead_contact_discovery (
        lead_id,
        website, website_source_url,
        email, email_source_url,
        contact_page_url,
        contact_form_detected, contact_form_source_url,
        facebook_url, facebook_source_url,
        instagram_url, instagram_source_url,
        whatsapp, whatsapp_source_url,
        phone, phone_source_url,
        contact_score,
        ai_summary, ai_recommended_pitch,
        draft_email, draft_contact_form, draft_facebook, draft_whatsapp, draft_phone_script,
        discovered_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
      )
      ON CONFLICT(lead_id) DO UPDATE SET
        website = excluded.website,
        website_source_url = excluded.website_source_url,
        email = excluded.email,
        email_source_url = excluded.email_source_url,
        contact_page_url = excluded.contact_page_url,
        contact_form_detected = excluded.contact_form_detected,
        contact_form_source_url = excluded.contact_form_source_url,
        facebook_url = excluded.facebook_url,
        facebook_source_url = excluded.facebook_source_url,
        instagram_url = excluded.instagram_url,
        instagram_source_url = excluded.instagram_source_url,
        whatsapp = excluded.whatsapp,
        whatsapp_source_url = excluded.whatsapp_source_url,
        phone = excluded.phone,
        phone_source_url = excluded.phone_source_url,
        contact_score = excluded.contact_score,
        ai_summary = excluded.ai_summary,
        ai_recommended_pitch = excluded.ai_recommended_pitch,
        draft_email = excluded.draft_email,
        draft_contact_form = excluded.draft_contact_form,
        draft_facebook = excluded.draft_facebook,
        draft_whatsapp = excluded.draft_whatsapp,
        draft_phone_script = excluded.draft_phone_script,
        discovered_at = excluded.discovered_at,
        updated_at = datetime('now')
    `,
    args: [
      result.leadId,
      result.website.value,
      result.website.sourceUrl,
      result.email.value,
      result.email.sourceUrl,
      result.contactPageUrl.value,
      result.contactFormDetected ? 1 : 0,
      result.contactFormSourceUrl,
      result.facebook.value,
      result.facebook.sourceUrl,
      result.instagram.value,
      result.instagram.sourceUrl,
      result.whatsapp.value,
      result.whatsapp.sourceUrl,
      result.phone.value,
      result.phone.sourceUrl,
      result.contactScore,
      insights?.summary ?? null,
      insights?.recommendedPitch ?? null,
      drafts.email,
      drafts.contactForm,
      drafts.facebook,
      drafts.whatsapp,
      drafts.phoneScript,
      result.discoveredAt,
    ],
  });
}

export async function updateContactDiscoveryManual(
  leadId: number,
  patch: Partial<{
    website: string | null;
    email: string | null;
    contactPageUrl: string | null;
    contactFormDetected: boolean;
    facebookUrl: string | null;
    instagramUrl: string | null;
    whatsapp: string | null;
    phone: string | null;
    draftEmail: string | null;
    draftContactForm: string | null;
    draftFacebook: string | null;
    draftWhatsapp: string | null;
    draftPhoneScript: string | null;
  }>,
): Promise<void> {
  const existing = await getContactDiscoveryByLeadId(leadId);
  const db = getDb();

  const merged = {
    website: patch.website ?? existing?.website ?? null,
    email: patch.email ?? existing?.email ?? null,
    contact_page_url: patch.contactPageUrl ?? existing?.contact_page_url ?? null,
    contact_form_detected:
      patch.contactFormDetected !== undefined
        ? patch.contactFormDetected
          ? 1
          : 0
        : (existing?.contact_form_detected ?? 0),
    facebook_url: patch.facebookUrl ?? existing?.facebook_url ?? null,
    instagram_url: patch.instagramUrl ?? existing?.instagram_url ?? null,
    whatsapp: patch.whatsapp ?? existing?.whatsapp ?? null,
    phone: patch.phone ?? existing?.phone ?? null,
    draft_email: patch.draftEmail ?? existing?.draft_email ?? null,
    draft_contact_form: patch.draftContactForm ?? existing?.draft_contact_form ?? null,
    draft_facebook: patch.draftFacebook ?? existing?.draft_facebook ?? null,
    draft_whatsapp: patch.draftWhatsapp ?? existing?.draft_whatsapp ?? null,
    draft_phone_script: patch.draftPhoneScript ?? existing?.draft_phone_script ?? null,
  };

  const { calculateContactScore } = await import("../contact-discovery/contact-score.js");
  const score = calculateContactScore({
    hasEmail: Boolean(merged.email?.trim()),
    hasContactForm: Boolean(merged.contact_form_detected),
    hasPhone: Boolean(merged.phone?.trim()),
    hasFacebook: Boolean(merged.facebook_url?.trim()),
    hasInstagram: Boolean(merged.instagram_url?.trim()),
    hasWhatsApp: Boolean(merged.whatsapp?.trim()),
  });

  if (!existing) {
    await db.execute({
      sql: `
        INSERT INTO lead_contact_discovery (
          lead_id, website, email, contact_page_url, contact_form_detected,
          facebook_url, instagram_url, whatsapp, phone, contact_score,
          draft_email, draft_contact_form, draft_facebook, draft_whatsapp, draft_phone_script,
          discovered_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      args: [
        leadId,
        merged.website,
        merged.email,
        merged.contact_page_url,
        merged.contact_form_detected,
        merged.facebook_url,
        merged.instagram_url,
        merged.whatsapp,
        merged.phone,
        score,
        merged.draft_email,
        merged.draft_contact_form,
        merged.draft_facebook,
        merged.draft_whatsapp,
        merged.draft_phone_script,
      ],
    });
    return;
  }

  await db.execute({
    sql: `
      UPDATE lead_contact_discovery SET
        website = ?,
        email = ?,
        contact_page_url = ?,
        contact_form_detected = ?,
        facebook_url = ?,
        instagram_url = ?,
        whatsapp = ?,
        phone = ?,
        contact_score = ?,
        draft_email = ?,
        draft_contact_form = ?,
        draft_facebook = ?,
        draft_whatsapp = ?,
        draft_phone_script = ?,
        updated_at = datetime('now')
      WHERE lead_id = ?
    `,
    args: [
      merged.website,
      merged.email,
      merged.contact_page_url,
      merged.contact_form_detected,
      merged.facebook_url,
      merged.instagram_url,
      merged.whatsapp,
      merged.phone,
      score,
      merged.draft_email,
      merged.draft_contact_form,
      merged.draft_facebook,
      merged.draft_whatsapp,
      merged.draft_phone_script,
      leadId,
    ],
  });
}

/** Sync discovered email/phone/website back to leads table when empty or improved. */
export async function getContactDiscoverySummaries(
  leadIds: number[],
): Promise<Map<number, { contactScore: number; contactable: boolean }>> {
  const map = new Map<number, { contactScore: number; contactable: boolean }>();
  if (leadIds.length === 0) {
    return map;
  }
  const db = getDb();
  const placeholders = leadIds.map(() => "?").join(",");
  const result = await db.execute({
    sql: `
      SELECT lead_id, contact_score, email, contact_form_detected,
             facebook_url, whatsapp, phone
      FROM lead_contact_discovery
      WHERE lead_id IN (${placeholders})
    `,
    args: leadIds,
  });
  for (const row of result.rows) {
    const id = Number(row.lead_id);
    const contactable =
      Boolean((row.email as string)?.trim()) ||
      Boolean(row.contact_form_detected) ||
      Boolean((row.facebook_url as string)?.trim()) ||
      Boolean((row.whatsapp as string)?.trim()) ||
      Boolean((row.phone as string)?.trim());
    map.set(id, {
      contactScore: Number(row.contact_score ?? 0),
      contactable,
    });
  }
  return map;
}

export async function syncDiscoveryToLead(
  leadId: number,
  data: { email?: string | null; phone?: string | null; website?: string | null },
): Promise<void> {
  const db = getDb();
  const row = await db.execute({
    sql: `SELECT email, phone, website FROM leads WHERE id = ?`,
    args: [leadId],
  });
  if (row.rows.length === 0) {
    return;
  }
  const current = row.rows[0] as { email?: string; phone?: string; website?: string };

  const email =
    data.email?.trim() && !current.email?.trim() ? data.email.trim() : current.email ?? null;
  const phone =
    data.phone?.trim() && !current.phone?.trim() ? data.phone.trim() : current.phone ?? null;
  const website =
    data.website?.trim() && !current.website?.trim()
      ? data.website.trim()
      : current.website ?? null;

  await db.execute({
    sql: `
      UPDATE leads SET
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        website = COALESCE(?, website),
        updated_at = datetime('now')
      WHERE id = ?
    `,
    args: [email, phone, website, leadId],
  });
}
