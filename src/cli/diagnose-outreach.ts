#!/usr/bin/env node
/**
 * Outreach funnel health check — run: npm run diagnose
 * Does not print secrets; reads Turso/local DB only.
 */
import "dotenv/config";
import { getDeliverabilityStatus } from "../engine/deliverability.js";
import { buildOutboundWaMeLink } from "../engine/whatsapp-link.js";
import { getLeadStatusCounts, getFunnelStats, auditPostboxLeads } from "../engine/store/stats-repository.js";
import { closeDb, getDb, runMigrations } from "../engine/store/db.js";

function pct(n: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function line(label: string, value: number | string, note?: string): void {
  const pad = label.padEnd(28);
  console.log(`  ${pad} ${value}${note ? `  — ${note}` : ""}`);
}

async function main(): Promise<void> {
  await runMigrations();
  const db = getDb();

  const counts = await getLeadStatusCounts();
  const funnel = await getFunnelStats();
  const postbox = await auditPostboxLeads();
  const deliverability = await getDeliverabilityStatus();

  const rowsForWa = await db.execute(`
    SELECT business_name, phone, status, replied_at
    FROM leads
  `);
  let whatsappReady = 0;
  for (const row of rowsForWa.rows) {
    const url = buildOutboundWaMeLink({
      businessName: String(row.business_name ?? ""),
      phone: row.phone as string | null,
    });
    if (url) {
      whatsappReady++;
    }
  }

  const contact = await db.execute(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN email IS NOT NULL AND TRIM(email) != '' THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN phone IS NOT NULL AND TRIM(phone) != '' THEN 1 ELSE 0 END) AS with_phone,
      SUM(CASE WHEN website IS NOT NULL AND TRIM(website) != '' THEN 1 ELSE 0 END) AS with_website,
      SUM(CASE WHEN draft_message IS NOT NULL AND TRIM(draft_message) != '' THEN 1 ELSE 0 END) AS with_draft,
      SUM(CASE WHEN status IN ('approved', 'ready_to_contact') AND draft_message IS NOT NULL
          AND email IS NOT NULL AND TRIM(email) != '' THEN 1 ELSE 0 END) AS send_ready
    FROM leads
  `);
  const c = contact.rows[0] ?? {};
  const total = Number(c.total ?? 0);
  const withEmail = Number(c.with_email ?? 0);
  const withPhone = Number(c.with_phone ?? 0);
  const withWebsite = Number(c.with_website ?? 0);
  const withDraft = Number(c.with_draft ?? 0);
  const sendReady = Number(c.send_ready ?? 0);

  const emailEvents = await db.execute(`
    SELECT event_type, COUNT(*) AS n
    FROM email_events
    GROUP BY event_type
  `);
  const eventMap = new Map<string, number>();
  for (const row of emailEvents.rows) {
    eventMap.set(String(row.event_type), Number(row.n));
  }

  const trialUrl =
    process.env.TRIAL_URL?.trim() ||
    process.env.SCORE_URL?.trim() ||
    "(not set — defaults to https://score.passready.uk)";
  const testFallback = process.env.ALLOW_TEST_EMAIL_FALLBACK?.trim().toLowerCase() === "true";
  const subject =
    process.env.OUTREACH_EMAIL_SUBJECT?.trim() || "Quick question about your kitchen records";

  console.log("\n=== PassFinder outreach diagnose ===\n");

  console.log("Leads in database");
  line("Total leads", total);
  line("With business email", withEmail, pct(withEmail, total));
  line("With phone (OSM)", withPhone, pct(withPhone, total));
  line("WhatsApp-ready (wa.me)", whatsappReady, pct(whatsappReady, total));
  line("With website", withWebsite, pct(withWebsite, total));
  const websiteNoEmail = await db.execute(`
    SELECT COUNT(*) AS n FROM leads
    WHERE website IS NOT NULL AND TRIM(website) != ''
      AND (email IS NULL OR TRIM(email) = '')
  `);
  line(
    "Website but no email (run enrich-emails)",
    Number(websiteNoEmail.rows[0]?.n ?? 0),
  );
  const enrichStats = await db.execute(`
    SELECT enrichment_status, COUNT(*) AS n FROM leads GROUP BY enrichment_status
  `);
  console.log("\nEnrichment status");
  for (const row of enrichStats.rows) {
    line(String(row.enrichment_status ?? "null"), Number(row.n ?? 0));
  }
  const rtr = await db.execute(`SELECT COUNT(*) AS n FROM leads WHERE status = 'ready_to_review'`);
  line("ready_to_review leads", Number(rtr.rows[0]?.n ?? 0));
  const forms = await db.execute(`SELECT COUNT(*) AS n FROM leads WHERE status = 'form_submitted'`);
  line("form_submitted leads", Number(forms.rows[0]?.n ?? 0));
  line("With draft text", withDraft);
  line("Send-ready (approved+email)", sendReady);

  console.log("\nPostbox (approved queue)");
  line("Queued (approved + draft)", postbox.queued);
  line("Send-ready (valid email)", postbox.sendReady);
  line("Blocked (invalid/missing email)", postbox.blocked);

  console.log("\nStatus breakdown");
  line("new", counts.new);
  line("drafted", counts.drafted);
  line("approved (postbox)", counts.approved);
  line("contacted (email sent)", counts.contacted);
  line("replied", counts.replied);
  line("trial_started", counts.trial_started);
  line("opted_in", counts.opted_in);
  line("nurture", counts.nurture);
  line("suppressed", counts.suppressed);

  console.log("\nLegacy funnel counters");
  line("identified", funnel.identified);
  line("drafted (broad)", funnel.drafted);
  line("approved", funnel.approved);
  line("contacted+opted_in", funnel.converted, "not the same as trial_started");

  console.log("\nEmail events (Resend log)");
  for (const [type, n] of [...eventMap.entries()].sort()) {
    line(type, n);
  }
  if (eventMap.size === 0) {
    line("(none)", 0, "no sends logged yet");
  }

  console.log("\nDeliverability");
  line("Send locked", deliverability.sendLocked ? "YES" : "no");
  line("Bounce rate", `${(deliverability.bounceRate * 100).toFixed(1)}%`);
  line("Threshold", `${(deliverability.bounceThreshold * 100).toFixed(0)}%`);

  console.log("\nConfig (non-secret)");
  line("Outreach landing (TRIAL_URL / SCORE_URL)", trialUrl);
  line("Test email fallback", testFallback ? "ON — risky in prod" : "off");
  line("Email subject", subject);
  line(
    "First-touch links",
    "stripped until reply",
    "trial URL only after they reply",
  );

  console.log("\nInbox vs app");
  line(
    "Auto-detect Gmail replies",
    "no",
    "open Sent tab → Replied button when you get a reply",
  );

  console.log("\n--- What to do next ---\n");
  const tips: string[] = [];

  if (total === 0) {
    tips.push("Run `npm run find` for your target area (product.config.ts).");
  }
  if (total > 0 && withEmail < total * 0.25) {
    tips.push(
      `Only ${pct(withEmail, total)} have email — run \`npm run enrich-emails\`, Discover contacts on high leads, or Call tab. Changing town in Find only adds FSA rows with recent rating changes unless you tick Full rescan.`,
    );
  }
  if (sendReady === 0 && counts.approved > 0) {
    tips.push(
      `Postbox has ${counts.approved} queued but only ${postbox.sendReady} send-ready — run npm run diagnose-postbox and fix invalid emails.`,
    );
  }
  if (postbox.blocked > 0) {
    tips.push(
      `${postbox.blocked} postbox lead(s) blocked by email validation — remove from postbox or fix addresses.`,
    );
  }
  if (counts.approved > 0 && counts.contacted === 0 && !deliverability.sendLocked && postbox.sendReady > 0) {
    tips.push("Postbox has approvals but nothing sent — run `npm run send` or check 2pm cron.");
  }
  if (deliverability.sendLocked) {
    tips.push("Sending is LOCKED due to bounces — fix domain/DKIM in Resend before more sends.");
  }
  if (testFallback) {
    tips.push("ALLOW_TEST_EMAIL_FALLBACK=true — real owners may never get mail. Turn off for live sends.");
  }
  if (counts.contacted > 0 && counts.replied === 0) {
    tips.push(
      "Emails went out but no replies — try softer subject (OUTREACH_EMAIL_SUBJECT), phone top 10 leads, shorter personal edit to drafts.",
    );
  }
  if (counts.replied > 0 && counts.trial_started === 0) {
    tips.push(
      "You have replies — regenerate follow-up (SafeScore link) and mark trial_started when they sign up on PassReady.",
    );
  }
  if (counts.trial_started === 0 && counts.replied === 0 && counts.contacted === 0) {
    tips.push("Pipeline stuck before send — draft → approve → postbox → send.");
  }

  if (tips.length === 0) {
    tips.push("Funnel looks active — keep reply-first follow-up; mark conversions when trials start.");
  }

  for (const t of tips) {
    console.log(`• ${t}`);
  }
  console.log("");
}

main()
  .then(() => closeDb())
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
