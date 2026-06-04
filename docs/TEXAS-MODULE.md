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

## HB 2844 outreach

Template id `hb2844_mobile_july_2026` in `texas_outreach_templates`. Builder: `buildHb2844MobileOutreachMessage()`.

## Env

```env
TEXAS_AUSTIN_INSPECTIONS_URL=https://data.austintexas.gov/resource/ecmv-9xxi.json
TEXAS_SCORE_URL=https://score.passready.us
TEXAS_SITE_URL=https://passready.us
```
