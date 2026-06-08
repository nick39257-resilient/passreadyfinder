/**
 * Generates PassReady Finder full architecture document (.docx)
 * Run: node scripts/generate-architecture-doc.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  PageBreak,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, "..", "docs", "PassReady-Finder-Architecture.docx");

function h1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } });
}
function h2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } });
}
function h3(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, ...opts })],
  });
}
function bullet(text, level = 0) {
  return new Paragraph({
    text,
    bullet: { level },
    spacing: { after: 80 },
  });
}
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function makeTable(headers, rows) {
  const headerRow = new TableRow({
    children: headers.map(
      (h) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
          shading: { fill: "E8E8E8" },
        }),
    ),
  });
  const dataRows = rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ text: String(cell) })],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
    rows: [headerRow, ...dataRows],
  });
}

const doc = new Document({
  creator: "PassReady",
  title: "PassReady Finder — Full System Architecture",
  description: "Complete architecture documentation for the passreadyfinder repository",
  sections: [
    {
      properties: {},
      children: [
        // Title page
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 2000, after: 400 },
          children: [new TextRun({ text: "PassReady Finder", bold: true, size: 56 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "Full System Architecture", size: 36 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
          children: [new TextRun({ text: "Predictive Compliance Intelligence Engine", italics: true, size: 24 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Repository: passreadyfinder", size: 22 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "Version: Phase A–D (current) + Phase 5 (target)", size: 22 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Generated: June 2026", size: 22 })],
        }),

        pageBreak(),

        // 1. Executive Summary
        h1("1. Executive Summary"),
        p(
          "PassReady Finder is a standalone outbound lead intelligence engine for PassReady — a predictive compliance intelligence product for food businesses. The system discovers food-safety-regulated establishments, scores them for compliance urgency, enriches contact data, drafts personalised outreach, and manages a human-in-the-loop send workflow.",
        ),
        p(
          "The engine is deliberately modular and independent from the main passready-app repository. It prioritises lean, free-tier-friendly data sources (FSA FHRS API, OpenStreetMap, municipal open data) and cost-efficient AI (Gemini Flash via OpenAI-compatible API).",
        ),
        h3("Core Philosophy: The Lean Intelligence Engine"),
        bullet("Objective: high-value business intelligence at minimal operational cost"),
        bullet("Priority: free-tier friendly solutions (FSA, OSM, Gemini Flash)"),
        bullet("Independence: strictly modular; never edits the main passready-app repo"),
        bullet("Fail-fast: missing configuration (API keys, tokens) causes immediate failure"),
        bullet("Runtime validation: Zod schemas validate all external API responses at boundaries"),

        pageBreak(),

        // 2. Technology Stack
        h1("2. Technology Stack"),
        h2("2.1 Current Implementation (Production)"),
        makeTable(
          ["Layer", "Technology", "Notes"],
          [
            ["Runtime", "Node.js 20 + TypeScript (ESM)", "tsx for dev/CLI; tsc for typecheck"],
            ["API Server", "Express 5", "src/server/createApp.ts"],
            ["Database", "Turso / libSQL (SQLite)", "@libsql/client — no Prisma"],
            ["AI / Drafting", "Gemini via OpenAI-compatible API", "OPENAI_BASE_URL → generativelanguage.googleapis.com"],
            ["Email Sending", "Nodemailer (SMTP) + Resend", "SMTP on Render; Resend for Texas/inbound"],
            ["Browser Automation", "Playwright (optional)", "Contact forms, email scraping"],
            ["Enrichment", "Apollo.io, OSM Overpass", "Owner email lookup, phone/website"],
            ["Frontend (Primary)", "React 18 + Vite + Tailwind", "dashboard/ — mobile command center"],
            ["Frontend (Legacy)", "Static HTML + Tailwind CDN", "public/control.html, public/review.html"],
            ["Validation", "Zod 4", "src/validation/ — API boundary schemas"],
            ["Deployment", "Render (primary) + Vercel (optional)", "render.yaml Blueprint"],
          ],
        ),
        new Paragraph({ spacing: { after: 200 } }),

        h2("2.2 Target Stack (Phase 5 — Not Yet Migrated)"),
        makeTable(
          ["Layer", "Target Technology"],
          [
            ["Frontend", "React + Tailwind CSS (mobile-first command center)"],
            ["Backend", "Node.js + Express (central orchestration)"],
            ["Database", "PostgreSQL + Prisma (single source of truth)"],
            ["AI", "OpenAI API (drafting, reply intelligence, risk scoring)"],
            ["Sync", "Delta-sync via FSA LastUpdatedDate (not full re-scrapes)"],
          ],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        p(
          "Note: Phase 5 represents the long-term target architecture. The current repo uses Turso/SQLite, Gemini, and client-side FSA delta-sync (RatingDate filtering). Migration to Prisma/PostgreSQL is an explicit future task.",
        ),

        pageBreak(),

        // 3. Repository Structure
        h1("3. Repository Structure"),
        p("The codebase follows a strict separation of concerns:"),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: `passreadyfinder/
├── src/
│   ├── config/              # Product-specific settings (product.config.ts)
│   ├── engine/              # Intelligence + pipeline (no React imports)
│   │   ├── finder/          # FSA API pagination, authorities
│   │   ├── enrich/          # OSM, email scraping, Apollo
│   │   ├── score/           # Lead scoring
│   │   ├── sync/            # FSA delta-sync state
│   │   ├── store/           # Turso repositories + migrations
│   │   ├── intelligence/    # Compliance tips, activity, system status
│   │   ├── texas/           # US expansion module (isolated)
│   │   ├── uk/              # UK autonomous outreach
│   │   ├── services/        # SMTP, Apollo, Playwright, contact forms
│   │   ├── drafter.ts       # AI outreach drafting
│   │   ├── sender.ts        # Email send orchestration
│   │   ├── pipeline.ts      # Find → score → enrich → store
│   │   └── risk-scorer.ts   # Weighted compliance risk (0–100)
│   ├── server/              # Express API + job runner
│   ├── validation/          # Zod schemas
│   ├── types/               # Shared TypeScript types
│   └── cli/                 # Command-line entry points
├── dashboard/               # React mobile command center (Vite)
│   └── src/
│       ├── components/      # UI components (ActionCard, LeadRow, etc.)
│       ├── api/             # API client modules
│       └── lib/             # Client-side utilities
├── public/                  # Legacy static control/review pages
├── docs/                    # Module documentation
├── scripts/                 # Build, smoke test, Playwright setup
└── render.yaml              # Render Blueprint (web + cron jobs)`,
              font: "Courier New",
              size: 18,
            }),
          ],
        }),
        h3("Architectural Rules"),
        bullet("Engine logic lives in src/engine/ — no React imports in engine files"),
        bullet("UI components live in dashboard/src/components/ — call API routes, never Turso directly"),
        bullet("Shared scoring: calculateRiskScore imported from engine path only in API/CLI, exposed to UI via JSON"),
        bullet("Product config: edit src/config/product.config.ts only for targeting (area, rating, business types)"),

        pageBreak(),

        // 4. Data Flow
        h1("4. End-to-End Data Flow"),
        h2("4.1 UK Pipeline (Primary)"),
        p("The core pipeline implements: Find → Score → Enrich → Store → Draft → Review → Send"),
        bullet("1. FIND: Paginate FSA FHRS /Establishments API per business type and local authority"),
        bullet("2. DELTA-SYNC: Filter client-side by RatingDate > last_sync_timestamp (stored in outreach_settings)"),
        bullet("3. GUARDRAILS: Exclude venue names matching Cafe, Coffee, Roasters, Bakery, Tea Room, Sandwich Bar"),
        bullet("4. SCORE: Calculate lead_score (legacy) and risk_score (weighted 0–100 compliance urgency)"),
        bullet("5. ENRICH: OSM Overpass lookups for phone/website on top N leads; Apollo for owner email"),
        bullet("6. STORE: Upsert to leads table on fsa_id; update outreach columns (status, draft_message, etc.)"),
        bullet("7. DRAFT: Gemini generates rating-aware outreach copy (≤125 words, no images)"),
        bullet("8. REVIEW: Human approves/rejects drafts via dashboard or legacy review.html"),
        bullet("9. SEND: SMTP sends approved emails with 5–15 min randomized delays; 4-touch cap"),

        h2("4.2 Lead Status Lifecycle"),
        makeTable(
          ["Status", "Meaning"],
          [
            ["new", "Discovered, not yet drafted"],
            ["drafted", "AI draft generated, awaiting review"],
            ["approved", "Human approved, queued for send"],
            ["contacted", "Email sent (touch_count incremented)"],
            ["replied", "Inbound reply received — sequence stopped"],
            ["converted", "Lead became a customer"],
            ["nurture", "4-touch cap reached — excluded from send/draft"],
            ["suppressed", "Unsubscribed or manually suppressed"],
            ["form_submitted", "Contact form submitted (no email on file)"],
            ["ready_to_review", "Enrichment found email, awaiting operator review"],
          ],
        ),
        new Paragraph({ spacing: { after: 200 } }),

        h2("4.3 Texas Pipeline (US Expansion)"),
        p(
          "The Texas module is fully isolated — it does not share the UK leads table or FSA pipeline. Data lives in texas_leads.",
        ),
        bullet("INGEST: Municipal open data (default: Austin Socrata inspections feed)"),
        bullet("CLASSIFY: HB 2844 vendor tiers (TYPE_I / TYPE_II / TYPE_III) for mobile vendors"),
        bullet("SCORE: Texas Risk Score — ≥79 → CRITICAL_INTERVENTION"),
        bullet("ENRICH: DuckDuckGo discovery → website scrape → Apollo owner email → Playwright contact forms"),
        bullet("OUTREACH: Resend email or Playwright form submission with HB 2844 pitch"),
        bullet("DASHBOARD: /dashboard/texas — Texas Command Center"),

        pageBreak(),

        // 5. Risk Scoring
        h1("5. Risk Scoring Engine"),
        p(
          "Implemented in src/engine/risk-scorer.ts. Higher score = greater compliance urgency. Used for dashboard prioritization, outreach ordering, and visual accent colors.",
        ),
        makeTable(
          ["Component", "Max Points", "Calculation"],
          [
            ["FSA rating pressure", "40", "((5 - clamp(rating,0,5)) / 5) × 40; unrated → 20"],
            ["Inspection staleness", "35", "min(daysSinceInspection / 730, 1) × 35"],
            ["Low-rating urgency", "15", "rating ≤1 → 15; rating 2 → 10; rating 3 → 5; else 0"],
            ["Contact gap", "10", "no phone AND no website → 10; one missing → 5; else 0"],
          ],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        h3("Risk Bands"),
        makeTable(
          ["Band", "Score Range", "Dashboard Treatment"],
          [
            ["Critical", "75–100", "Red accent — highest priority outreach"],
            ["High", "50–74", "Orange accent"],
            ["Medium", "25–49", "Yellow accent"],
            ["Low", "0–24", "Green accent"],
          ],
        ),

        pageBreak(),

        // 6. Database Schema
        h1("6. Database Schema (Turso / SQLite)"),
        p(
          "Schema is managed via incremental migrations in src/engine/store/. No Prisma. Migrations run on server startup via runMigrations().",
        ),

        h2("6.1 Core Tables"),
        h3("leads"),
        p("Primary UK lead store. Key columns:"),
        bullet("fsa_id (UNIQUE), business_name, business_type, address, postcode, lat/lng"),
        bullet("fsa_rating, fsa_last_inspection_date, lead_score"),
        bullet("phone, website, on_delivery_app, email, owner_name"),
        bullet("status, draft_message, touch_count, contacted_at, replied_at"),
        bullet("enrichment_status, contact_method, apollo_enriched_at"),
        bullet("fsa_score_hygiene, fsa_score_structural, fsa_score_management"),
        bullet("flag_for_review, needs_eyes_reason, unsubscribe_token"),

        h3("email_drafts"),
        bullet("lead_id, subject, body_html, body_text, status (pending/approved/rejected/sent)"),
        bullet("reviewed_at, sent_at, resend_id"),

        h3("outreach_settings"),
        bullet("Key-value store: last_sync_timestamp, sending_paused, and other runtime flags"),

        h3("suppression_list / email_events"),
        bullet("Unsubscribe tracking and deliverability event log (bounces, opens, etc.)"),

        h3("jobs"),
        bullet("Background job queue: find, draft, send, texas_find, autopilot, etc."),
        bullet("Status tracking with stale-job reclaim on startup"),

        h3("texas_leads"),
        bullet("Isolated US lead store with inspection scores, demerits, HB 2844 tier, risk_score"),
        bullet("draft_message, website, owner email, outreach status"),

        h3("osm_cache / contact_discovery / engine_log / score_traffic"),
        bullet("osm_cache: cached Overpass API responses per fsa_id"),
        bullet("contact_discovery: multi-channel contact route scoring"),
        bullet("engine_log: operational audit trail"),
        bullet("score_traffic: SafeScore landing page pixel tracking"),

        pageBreak(),

        // 7. API Surface
        h1("7. API Surface"),
        h2("7.1 UK Endpoints"),
        makeTable(
          ["Method", "Path", "Purpose"],
          [
            ["GET", "/health", "Health check"],
            ["GET", "/api/config", "Dashboard config (control secret, landing URL)"],
            ["GET", "/api/leads", "Dashboard lead list (risk-sorted, filtered)"],
            ["GET", "/api/leads/:id", "Lead detail with FSA scores + contact discovery"],
            ["GET", "/api/stats", "Funnel, deliverability, postbox counts"],
            ["GET", "/api/status", "System pulse (scraping, drafting, sending state)"],
            ["GET", "/api/activity", "Activity feed + compliance tip of day"],
            ["GET", "/api/sync/status", "FSA delta-sync timestamp"],
            ["GET", "/api/fsa/authorities", "Local authority list for area picker"],
            ["GET", "/api/deliverability", "Bounce rate + send lock status"],
            ["GET", "/api/drafts", "Pending drafts for review queue"],
            ["POST", "/api/drafts/:id/approve", "Approve draft for sending"],
            ["POST", "/api/drafts/:id/reject", "Reject draft"],
            ["POST", "/api/jobs/find", "Start find pipeline job"],
            ["POST", "/api/jobs/draft", "Start draft job (N leads)"],
            ["POST", "/api/jobs/draft-all", "Draft all eligible leads"],
            ["POST", "/api/jobs/send", "Start send job (with confirm token)"],
            ["GET", "/api/jobs/:id", "Poll job progress"],
            ["POST", "/api/leads/:id/quick-draft", "On-demand single-lead draft"],
            ["POST", "/api/leads/:id/postbox", "Queue lead to postbox"],
            ["POST", "/api/webhooks/resend", "Inbound email webhook (reply detection)"],
            ["GET", "/api/outreach/unsubscribe", "One-click unsubscribe handler"],
          ],
        ),
        new Paragraph({ spacing: { after: 200 } }),

        h2("7.2 Texas Endpoints"),
        makeTable(
          ["Method", "Path", "Purpose"],
          [
            ["GET", "/api/texas/leads", "Texas lead list (segment: all|mobile|hasEmail)"],
            ["GET", "/api/texas/leads/:id", "Texas lead detail"],
            ["GET", "/api/texas/stats", "Texas funnel stats"],
            ["GET", "/api/texas/status", "Texas system status"],
            ["POST", "/api/texas/jobs/find", "Run Texas ingestion pipeline"],
            ["POST", "/api/texas/jobs/autopilot", "DuckDuckGo + scrape + forms"],
            ["POST", "/api/texas/jobs/enrich-apollo", "Apollo owner email enrichment"],
            ["POST", "/api/texas/jobs/reclassify", "Re-run HB 2844 tier classification"],
            ["POST", "/api/texas/leads/:id/send-outreach", "Send email or submit contact form"],
          ],
        ),
        new Paragraph({ spacing: { after: 200 } }),

        h2("7.3 UK Autopilot & Score Traffic"),
        bullet("POST /api/uk/jobs/autopilot — UK autonomous contact discovery"),
        bullet("GET /api/uk/status — UK autopilot status"),
        bullet("GET /api/score-traffic/stats — SafeScore landing page visits"),
        bullet("GET /api/score-traffic/pixel.gif — Tracking pixel"),

        pageBreak(),

        // 8. Frontend Architecture
        h1("8. Frontend Architecture"),
        h2("8.1 React Dashboard (Primary)"),
        p("Built with Vite, served at /dashboard/ from dashboard/dist/ after npm run dashboard:build."),
        h3("UK Command Center (/dashboard/)"),
        bullet("SystemPulse — real-time scraping/drafting/sending status bar"),
        bullet("LeadFilters — area, postcode prefix, rating; persisted to localStorage"),
        bullet("LeadRow / LeadDetailDrawer — risk-sorted lead cards with deep-dive modal"),
        bullet("OutreachPipeline — funnel visualization"),
        bullet("PostboxStatus — send queue audit"),
        bullet("FixedActionBar — Find, Draft, Send action buttons with job polling"),
        bullet("SendConfirmModal — deliverability-gated send confirmation"),
        bullet("AutopilotHeartbeat — UK/Texas autopilot cron status"),
        bullet("ScoreTrafficCounter — SafeScore landing page visit counter"),

        h3("Texas Command Center (/dashboard/texas)"),
        bullet("TexasLeadCard — mobile vendor cards with HB 2844 tier badges"),
        bullet("TexasContactOptions — Call/Find (Maps), Search Social, Copy Script"),
        bullet("Multi-channel outreach: email send or Playwright contact form"),

        h2("8.2 Legacy Static Pages"),
        bullet("/control — control.html (operator panel)"),
        bullet("/review — review.html (draft approve/reject queue)"),
        bullet("Being replaced by React dashboard; retained for fallback"),

        pageBreak(),

        // 9. AI & Drafting
        h1("9. AI & Drafting Engine"),
        p("Located in src/engine/drafter.ts. Uses Gemini via OpenAI-compatible API endpoint."),
        h3("Rating-Aware Prompting"),
        bullet("2★ (recovery tone): emphasise turnaround, support, not punishment"),
        bullet("3★ (habits tone): routine improvement, small wins"),
        bullet("4–5★ (efficiency tone): optimisation, staying ahead of inspections"),
        h3("Draft Constraints (enforced by Zod)"),
        bullet("Maximum 125 words"),
        bullet("No images or attachments"),
        bullet("Lowercase subject line: 'upcoming fsa inspection'"),
        bullet("First touch: link-free; follow-ups include SafeScore URL after reply"),
        bullet("WhatsApp CTA via wa.me link when phone available"),
        h3("Models"),
        bullet("Default: gemini-3.1-flash-lite (GEMINI_DRAFT_MODEL env)"),
        bullet("Configurable via OPENAI_MODEL for other providers (DeepSeek, Mistral, etc.)"),

        pageBreak(),

        // 10. Deliverability & Outreach Rules
        h1("10. Deliverability & Outreach Rules"),
        h2("10.1 Sending Constraints"),
        bullet("Randomized 5–15 minute delays between individual emails (human-style sending)"),
        bullet("Daily send cap enforced (src/engine/daily-send-cap.ts)"),
        bullet("Send window: UK 2pm window (cron schedule in render.yaml)"),
        bullet("2% bounce rate lock — disables Send Approved button + UI banner"),
        bullet("4-touch maximum per lead → status moves to nurture"),
        bullet("No attachments ever — clean HTML links to landing page or WhatsApp CTA"),
        bullet("Unsubscribe token per lead — one-click suppression"),

        h2("10.2 Inbound Reply Handling"),
        bullet("Resend webhook at POST /api/webhooks/resend"),
        bullet("Reply detection stops sequence (stopSequenceForReply)"),
        bullet("Follow-up drafts include SafeScore link (https://score.passready.uk)"),

        h2("10.3 Phase 1 Enrichment Timeouts"),
        bullet("Playwright: 15s max per website; browser.close() always in finally"),
        bullet("Apollo: 15s per request, 30s per lead lookup"),
        bullet("Phase 1: 45s per lead; PENDING cleared in finally if stuck"),
        bullet("Find jobs: global timeout + finally so job status never stays 'running'"),

        pageBreak(),

        // 11. Background Jobs & Cron
        h1("11. Background Jobs & Cron Schedule"),
        p("Deployed via Render Blueprint (render.yaml). All cron jobs inherit Turso credentials from the web service."),
        makeTable(
          ["Cron Job", "Schedule", "Command", "Purpose"],
          [
            ["passreadyfinder-find", "03:00 UTC daily", "npm run find-cron", "FSA scrape + score + enrich (batched authorities)"],
            ["passreadyfinder-queue-draft", "Every 30 min", "npm run queue-draft", "Draft 2 leads per run via Gemini"],
            ["passreadyfinder-send", "13–14 UTC hourly", "npm run send-cron", "Send approved emails in UK window"],
            ["texas-autopilot-cron", "Every 12h", "npm run texas-autopilot", "DDG discovery + email scrape + forms"],
            ["uk-autopilot-cron", "Every 12h (+30min)", "npm run uk-autopilot", "UK contact discovery (forms off on cron)"],
          ],
        ),
        new Paragraph({ spacing: { after: 200 } }),
        h3("Job Runner"),
        p("src/server/job-runner.ts manages in-process job execution with progress reporting. Jobs are stored in Turso jobs table. Stale in-flight jobs are reclaimed on server startup."),

        pageBreak(),

        // 12. External Integrations
        h1("12. External Integrations"),
        makeTable(
          ["Service", "Purpose", "Auth / Config"],
          [
            ["FSA FHRS API v2", "UK food establishment data", "Free, no key (x-api-version: 2)"],
            ["Overpass API", "OSM phone/website enrichment", "Free, rate-limited"],
            ["Gemini (Google AI)", "Outreach draft generation", "OPENAI_API_KEY + OPENAI_BASE_URL"],
            ["Apollo.io", "Owner email enrichment", "APOLLO_API_KEY"],
            ["SMTP (PrivateEmail)", "UK email sending", "EMAIL_USER, EMAIL_PASS, EMAIL_HOST"],
            ["Resend", "Texas email + inbound webhooks", "RESEND_API_KEY, FROM_EMAIL"],
            ["Austin Socrata", "Texas inspection data", "TEXAS_AUSTIN_INSPECTIONS_URL"],
            ["DuckDuckGo HTML", "Website discovery (no API key)", "Scraped HTML results"],
            ["Playwright/Chromium", "Contact forms, email scraping", "Optional dep, 15s timeout"],
            ["Turso", "Cloud SQLite database", "TURSO_DATABASE_URL + TURSO_AUTH_TOKEN"],
          ],
        ),

        pageBreak(),

        // 13. Deployment
        h1("13. Deployment Architecture"),
        h2("13.1 Render (Primary)"),
        bullet("Web service: passreadyfinder — Node 20, starter plan"),
        bullet("Build: npm install && npm install --prefix dashboard && npm run build"),
        bullet("Start: npm start (tsx src/server/app.ts)"),
        bullet("Health check: GET /health"),
        bullet("5 cron jobs for find, draft, send, Texas autopilot, UK autopilot"),
        bullet("NODE_OPTIONS: --max-old-space-size=448 (512MB plan limit)"),

        h2("13.2 Vercel (Optional)"),
        bullet("Serverless deployment for dashboard + API"),
        bullet("Requires TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (no local SQLite)"),
        bullet("Use Vercel Deployment Protection (no built-in auth)"),

        h2("13.3 Local Development"),
        bullet("TURSO_LOCAL_PATH=./data/leads.db for offline SQLite"),
        bullet("npm run review — local server at http://localhost:3000"),
        bullet("npm run dashboard:dev — Vite dev server for React dashboard"),

        pageBreak(),

        // 14. Security & Auth
        h1("14. Security & Authentication"),
        bullet("CONTROL_PANEL_SECRET — optional header auth for control endpoints (X-Control-Secret)"),
        bullet("Dashboard has no built-in login — rely on deployment protection or secret header"),
        bullet("Unsubscribe tokens are per-lead, stored in leads.unsubscribe_token"),
        bullet("Suppression list prevents re-contact of unsubscribed emails"),
        bullet("Send confirm tokens prevent accidental bulk sends"),
        bullet("Inbound webhook validates Resend signature"),

        pageBreak(),

        // 15. CLI Commands
        h1("15. CLI Commands Reference"),
        makeTable(
          ["Command", "Description"],
          [
            ["npm run find", "Full pipeline: FSA → score → enrich → store"],
            ["npm run find-cron", "Batched find for Render cron (authority cursor)"],
            ["npm run list", "Print top leads from DB"],
            ["npm run draft", "LLM-draft outreach for top un-drafted leads"],
            ["npm run queue-draft", "Queue draft job (2 leads, cron-friendly)"],
            ["npm run review / npm start", "Start Express server + dashboard"],
            ["npm run send", "Email all approved leads via SMTP"],
            ["npm run send-cron", "Cron-friendly send (UK window check)"],
            ["npm run enrich-phase1", "Apollo + website scrape enrichment"],
            ["npm run texas-autopilot", "Texas autonomous outreach"],
            ["npm run uk-autopilot", "UK autonomous contact discovery"],
            ["npm run texas-reclassify", "Re-run HB 2844 tier classification"],
            ["npm run texas-enrich-apollo", "Apollo enrichment for Texas leads"],
            ["npm run diagnose", "Outreach pipeline diagnostics"],
            ["npm run typecheck", "TypeScript validation"],
            ["npm run build", "Typecheck + dashboard build"],
          ],
        ),

        pageBreak(),

        // 16. Delta-Sync
        h1("16. FSA Delta-Sync Strategy"),
        p(
          "FSA v2 API has no LastUpdatedDate query parameter. The system implements client-side delta-sync using establishment RatingDate as the best available change signal.",
        ),
        bullet("State: outreach_settings.last_sync_timestamp (no new Turso tables)"),
        bullet("Filter: only upsert establishments where RatingDate > last_sync_timestamp"),
        bullet("Upsert: existing upsertLead on fsa_id — update rating/address when changed"),
        bullet("Resilience: if find pipeline fails, do NOT update last_sync_timestamp"),
        bullet("Authority cursor: batched authority processing for Render memory limits (FIND_CRON_AUTHORITY_BATCH)"),
        bullet("Phase 5 target: migrate to true server-side LastUpdatedDate delta-sync"),

        pageBreak(),

        // 17. Configuration
        h1("17. Key Configuration"),
        h2("17.1 Product Config (src/config/product.config.ts)"),
        bullet("businessTypeNames — WHO to target (FSA type names)"),
        bullet("area — WHERE (localAuthorityName or lat/long radius)"),
        bullet("maxRating — keep ratings 0–N (default 2)"),
        bullet("enrichTopN — OSM lookups limited to top N by score"),

        h2("17.2 Environment Variables"),
        makeTable(
          ["Variable", "Purpose"],
          [
            ["TURSO_DATABASE_URL / TURSO_AUTH_TOKEN", "Cloud database"],
            ["TURSO_LOCAL_PATH", "Local SQLite (dev only)"],
            ["OPENAI_API_KEY", "Gemini / LLM API key"],
            ["OPENAI_BASE_URL", "Gemini OpenAI-compatible endpoint"],
            ["GEMINI_DRAFT_MODEL", "Draft model (default: gemini-3.1-flash-lite)"],
            ["EMAIL_USER / EMAIL_PASS / EMAIL_HOST", "SMTP sending credentials"],
            ["RESEND_API_KEY / FROM_EMAIL", "Resend for Texas + inbound"],
            ["APOLLO_API_KEY", "Owner email enrichment"],
            ["WHATSAPP_NUMBER", "WhatsApp CTA link generation"],
            ["CONTROL_PANEL_SECRET", "API control auth header"],
            ["TEXAS_AUSTIN_INSPECTIONS_URL", "Texas municipal data feed"],
            ["CONTACT_FORM_AUTO_SUBMIT", "Enable Playwright form submission"],
            ["FIND_CRON_AUTHORITY_BATCH", "Authorities per cron find run"],
          ],
        ),

        pageBreak(),

        // 18. Future Roadmap
        h1("18. Future Roadmap (Phase 5)"),
        bullet("Migrate database from Turso/SQLite to PostgreSQL + Prisma"),
        bullet("Implement true FSA delta-sync via LastUpdatedDate server-side filtering"),
        bullet("Consolidate legacy static pages into React dashboard fully"),
        bullet("Add authentication layer to dashboard"),
        bullet("Reply intelligence and automated follow-up sequencing"),
        bullet("Expand Texas to additional municipalities beyond Austin"),
        bullet("Integrate with main passready-app for conversion tracking"),

        new Paragraph({ spacing: { before: 400 } }),
        p("— End of Document —", { italics: true }),
      ],
    },
  ],
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
console.log(`Architecture document written to: ${outputPath}`);
