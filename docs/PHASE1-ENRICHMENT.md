# Phase 1 — Lead filtering & email enrichment

PassFinder uses **Turso (SQLite)** + TypeScript — not Prisma/PostgreSQL. Schema changes run via `outreach-migrations.ts` on startup.

## Step 1 — Guardrails

- Skips leads whose **business name** matches: Cafe, Coffee, Roasters, Bakery, Tea Room, Sandwich Bar.
- FSA types fetched: Takeaway/sandwich shop, Restaurant/Cafe/Caterer, Mobile caterer (cafes dropped by name).

## Step 2 — Apollo.io

- Set `APOLLO_API_KEY` in Render.
- Free-tier daily cap: `product.config.enrichment.apolloDailyCap` (default 50).
- Flow: website scrape → Apollo `mixed_people/search` (+ optional `people/match`) → owner titles.
- On email found: `enrichment_status=EMAIL_FOUND`, `status=ready_to_review`.

## Step 3 — Contact forms (Playwright)

- **Off by default** on Find runs (too slow for Render cron).
- Batch CLI: `npm run enrich-phase1 -- --forms` with `CONTACT_FORM_AUTO_SUBMIT=true`.
- Dry-run finds forms without submitting unless auto-submit enabled.
- On submit: `status=form_submitted`, `contact_method=CONTACT_FORM`.

## Commands

```bash
npm run enrich-phase1              # Apollo + scrape, no forms
npm run enrich-phase1 -- --forms   # Include Playwright (local)
npm run enrich-phase1 -- --limit=50
```

## Env

See `.env.example` — `APOLLO_API_KEY`, `CONTACT_FORM_*`, `PHASE1_CONTACT_FORM`.
