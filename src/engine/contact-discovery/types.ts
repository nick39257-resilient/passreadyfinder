/** A discovered field with provenance for admin review. */
export interface SourcedValue {
  value: string | null;
  sourceUrl: string | null;
  confidence: number;
}

export interface ContactDiscoveryResult {
  leadId: number;
  website: SourcedValue;
  email: SourcedValue;
  contactPageUrl: SourcedValue;
  contactFormDetected: boolean;
  contactFormSourceUrl: string | null;
  facebook: SourcedValue;
  instagram: SourcedValue;
  whatsapp: SourcedValue;
  phone: SourcedValue;
  contactScore: number;
  discoveredAt: string;
}

export interface ContactAiInsights {
  summary: string;
  recommendedPitch: string;
}

export interface ChannelDrafts {
  email: string | null;
  contactForm: string | null;
  facebook: string | null;
  whatsapp: string | null;
  phoneScript: string | null;
}

export interface LeadContactDiscoveryRow {
  lead_id: number;
  website: string | null;
  website_source_url: string | null;
  email: string | null;
  email_source_url: string | null;
  contact_page_url: string | null;
  contact_form_detected: number;
  contact_form_source_url: string | null;
  facebook_url: string | null;
  facebook_source_url: string | null;
  instagram_url: string | null;
  instagram_source_url: string | null;
  whatsapp: string | null;
  whatsapp_source_url: string | null;
  phone: string | null;
  phone_source_url: string | null;
  contact_score: number;
  ai_summary: string | null;
  ai_recommended_pitch: string | null;
  draft_email: string | null;
  draft_contact_form: string | null;
  draft_facebook: string | null;
  draft_whatsapp: string | null;
  draft_phone_script: string | null;
  discovered_at: string | null;
  updated_at: string;
}
