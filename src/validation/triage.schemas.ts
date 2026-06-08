import { z } from "zod";

/** Machine-readable reasons written to leads.needs_eyes_reason. */
export const NEEDS_EYES_REASONS = [
  "STALLED_DRAFT_48H",
  "STALLED_APPROVED_48H",
  "STUCK_IN_POSTBOX_NO_EMAIL",
  "READY_TO_REVIEW_NO_EMAIL",
  "ENRICHMENT_PENDING_TIMEOUT",
  "NO_CONTACT_ROUTE_NURTURE",
  "WHATSAPP_FALLBACK_ROUTED",
] as const;

export const needsEyesReasonSchema = z.enum(NEEDS_EYES_REASONS);

export type NeedsEyesReason = z.infer<typeof needsEyesReasonSchema>;

export const contactMethodSchema = z.enum(["EMAIL", "CONTACT_FORM", "WHATSAPP"]);

export type TriageContactMethod = z.infer<typeof contactMethodSchema>;

export const leadTriageActionSchema = z.enum([
  "flag_for_review",
  "clear_pending_enrichment",
  "route_whatsapp",
  "move_to_nurture",
]);

export type LeadTriageAction = z.infer<typeof leadTriageActionSchema>;

export const leadTriageMutationSchema = z.object({
  leadId: z.number().int().positive(),
  action: leadTriageActionSchema,
  reason: needsEyesReasonSchema,
  contactMethod: contactMethodSchema.optional(),
  status: z
    .enum([
      "new",
      "drafted",
      "approved",
      "ready_to_review",
      "nurture",
      "suppressed",
      "contacted",
      "form_submitted",
    ])
    .optional(),
  enrichmentDetail: z.string().max(500).optional(),
});

export type LeadTriageMutation = z.infer<typeof leadTriageMutationSchema>;

export const leadTriageResultSchema = z.object({
  scanned: z.number().int().nonnegative(),
  flagged: z.number().int().nonnegative(),
  clearedPending: z.number().int().nonnegative(),
  routedWhatsapp: z.number().int().nonnegative(),
  movedToNurture: z.number().int().nonnegative(),
  actions: z.array(
    z.object({
      leadId: z.number().int().positive(),
      action: leadTriageActionSchema,
      reason: needsEyesReasonSchema,
    }),
  ),
});

export type LeadTriageResult = z.infer<typeof leadTriageResultSchema>;
