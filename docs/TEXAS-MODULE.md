# Texas module (PassReady Finder)

Isolated US expansion — **does not share** the UK `leads` table or FSA pipeline.

## Stack note

PassReady Finder uses **Turso (SQLite)** + Express + React, not Prisma/PostgreSQL. Texas data lives in `texas_leads`.

## Routes

| Surface | URL |
|---------|-----|
| UK Command Center | `/dashboard/` |
| Texas Command Center | `/dashboard/texas` |

## API

| Method | Path |
|--------|------|
| GET | `/api/texas/leads?mobileOnly=1` |
| GET | `/api/texas/leads/:id` |
| GET | `/api/texas/stats` |
| POST | `/api/texas/jobs/find` (control auth) |

Job type: `find_texas` → `runTexasFindPipeline()`.

## Ingestion

`src/engine/texas/texasIngestionService.ts` fetches municipal open data (default: Austin Socrata). Maps:

- Inspection score, demerits, vehicle type
- `isMobileVendor` for trucks / trailers / mobile units
- HB 2844 tier (`TYPE_I` / `TYPE_II` / `TYPE_III`)
- Texas Risk Score — **≥ 79** → `CRITICAL_INTERVENTION`

Override feed URL: `TEXAS_AUSTIN_INSPECTIONS_URL`.

## HB 2844 mobile truck add-on (Phase 3)

- **Vendor tiers** (`TYPE_I` / `TYPE_II` / `TYPE_III`) — classified from business name, vehicle type, menu, and activity text when `isMobileVendor` is true.
- **Outreach template** — `texas_outreach_templates.hb2844_mobile_july_2026` + `draft_message` on each mobile lead.
- **Re-sync existing rows:** `npm run texas-reclassify` or `POST /api/texas/jobs/reclassify` (control auth). Runs automatically after each Texas ingest.

## Apollo enrichment (Texas leads)

- **Service:** `src/engine/texas/texas-enrichment-service.ts` — uses shared `findOwnerEmailViaApollo()` + `APOLLO_API_KEY`
- **Queue order:** `CRITICAL_INTERVENTION` first, then `risk_score DESC` (mid-70s+ before lower scores)
- **Matching fields:** `business_name`, address/city/county/zip, optional `website` (domain boost)
- **One-off run:** `npm run texas-enrich-apollo` or `npm run texas-enrich-apollo -- --limit=50`
- Respects UK `apolloDailyCap` (default 50 credits/day). Skips leads already attempted (`apollo_enriched_at` set).

## Mobile outreach send

- **API:** `POST /api/texas/leads/:id/send-outreach` (control auth)
- **Email path:** Resend (`RESEND_API_KEY`, `FROM_EMAIL`) using `draft_message` / HB 2844 pitch → status `EMAIL_SENT`
- **Form path:** Playwright contact form when no email but `website` is set → status `FORM_SUBMITTED` (requires `CONTACT_FORM_AUTO_SUBMIT=true` or `TEXAS_CONTACT_FORM_AUTO_SUBMIT=true`)
- **Apollo:** On send, attempts owner lookup when email is missing and `APOLLO_API_KEY` is set
- **Dashboard:** Texas lead modal — orange **Send Email** / **Submit Contact Form** button; corner **×** to dismiss

## Env

```env
TEXAS_AUSTIN_INSPECTIONS_URL=https://data.austintexas.gov/resource/ecmv-9xxi.json
TEXAS_SCORE_URL=https://score.passready.us
TEXAS_SITE_URL=https://passready.us
```
