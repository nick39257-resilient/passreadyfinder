/** Phase 1 lead enrichment tracking (Turso columns — not Prisma). */
export type EnrichmentStatus =
  | "PENDING"
  | "EMAIL_FOUND"
  | "NO_EMAIL_FALLBACK"
  | "FAILED";

export type ContactMethod = "EMAIL" | "CONTACT_FORM" | "WHATSAPP";

/** Lead workflow statuses introduced in Phase 1 */
export const LEAD_STATUS_READY_TO_REVIEW = "ready_to_review" as const;
export const LEAD_STATUS_FORM_SUBMITTED = "form_submitted" as const;
