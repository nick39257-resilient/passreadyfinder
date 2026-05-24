# PassReady Finder (Phase A)

Standalone outbound lead engine for PassReady. **Find → enrich → score → store** — no messaging.

## Setup

1. **Turso** (free): create a database at [turso.tech](https://turso.tech), then:

```bash
cp .env.example .env
# Edit .env with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
```

For local-only dev without Turso cloud:

```bash
# .env
TURSO_LOCAL_PATH=./data/leads.db
```

2. Install and run:

```bash
npm install
npm run find
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run find` | Full pipeline: FSA → score → enrich top N → store |
| `npm run find -- --skip-enrichment` | FSA + score only (no OSM) |
| `npm run list` | Print top leads from DB |
| `npm run list -- -n 50` | Show top 50 |
| `npm run draft` | LLM-draft outreach for top 5 un-drafted leads (no sending) |
| `npm run review` | Local review dashboard at http://localhost:3000 |
| `npm run send` | Email all approved leads via Resend |

## Phase B — Drafter (draft only, no sending)

Generates hyper-personalized outreach copy via an OpenAI-compatible LLM and saves it to `leads.draft_message` for human review.

```bash
# Add to .env (see .env.example)
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
WHATSAPP_NUMBER=447000000000

npm run draft
```

Swap provider via `OPENAI_BASE_URL` (DeepSeek, Mistral, etc.). Each draft ends with a `wa.me` trapdoor link — the sole CTA.

## Phase C — Review dashboard

Approve or reject AI drafts in the browser before anything is sent.

```bash
npm run review
```

Open http://localhost:3000 on your phone or tablet. Edit the draft in the textarea, then tap **Approve** or **Reject**.

## Phase D — Sender (The Mailroom)

Sends approved drafts via Resend and marks leads as `contacted`.

```bash
# Add to .env (see .env.example)
RESEND_API_KEY=re_...
FROM_EMAIL=PassReady <hello@your-sending-domain.com>
TEST_EMAIL_ADDRESS=you@example.com

npm run send
```

Leads without an email on file are sent to `TEST_EMAIL_ADDRESS` so you can test safely.

## Config

Edit **`src/config/product.config.ts`** only:

- `businessTypeNames` — WHO to target (FSA type names)
- `area` — WHERE (`localAuthorityName: "Preston"` or lat/long radius)
- `maxRating` — keep ratings 0–N (default 2)
- `enrichTopN` — OSM lookups limited to top N by score

## Architecture

- **Engine** (`src/engine/`) — product-agnostic pipeline
- **Config** (`src/config/product.config.ts`) — PassReady-specific settings

## Data sources

- **FSA FHRS API** — free, no key (`x-api-version: 2`)
- **Overpass API** — free OSM lookups (phone/website); `on_delivery_app` always `unknown` unless OSM has explicit tags

## Phase B

Do not proceed to Phase B until you have opened the database and verified the lead list manually.
