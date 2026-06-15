# Market plugin architecture

PassFinder runs on a **Market Plugin** model: the core engine handles Find → Score → Enrich → Outreach, while each market plugin defines data sources, geography rules, and validation.

## Operational modes

| Mode | Layer | Markets |
|------|-------|---------|
| **Regulated compliance** | Revenue — official registers | `uk_fsa_food`, `us_texas_food`, `us_florida_food` |
| **Open search playground** | Discovery — free OSM + DDG | `open_search` |

API: `GET /api/markets`, `POST /api/markets/find` (job type `market_find`).

## Phase 2 — Open Search

- Market ID: `open_search`
- OSM Overpass + Nominatim geocode + DuckDuckGo website enrichment
- Results → `generic_leads`
- Env: `OPEN_SEARCH_RADIUS_METRES` (default 8000), `OPEN_SEARCH_RESULT_CAP` (default 150)
- **Google Places** (paid density): `GOOGLE_PLACES_ENABLED=false` by default; requires `GOOGLE_PLACES_API_KEY` when enabled

## Phase 3 — Florida DBPR

- Market ID: `us_florida_food`
- Requires `FLORIDA_DBPR_DATA_URL` from [DBPR public records](https://www2.myfloridalicense.com/hotels-restaurants/public-records/)
- Results → `florida_leads`

## Phase 4 — Radar dashboard

- `/dashboard/` — Command Panel + Leaflet radar + Action Desk (cards, CSV export)
- `/dashboard/uk` — legacy UK copilot
- `/dashboard/texas` — Texas command center

## Pulse telemetry (marketing + trials)

Mounted on the production server:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/pulse/dashboard` | Control secret | Aggregated traffic, trials, email quota, regions |
| `POST /api/pulse/trial-signup` | `PULSE_WEBHOOK_SECRET` or control secret | Record trial signups from passready.uk/us |
| `GET /api/marketing-traffic/pixel.gif` | Public (referer-checked) | 1×1 tracking pixel for flyer/NFC/web |
| `POST /api/marketing-traffic/hit` | Public | Explicit traffic hit |
| `GET /api/marketing-traffic/stats/today` | Control secret | Today's marketing counts |

Env: `PULSE_WEBHOOK_SECRET` (optional; falls back to `CONTROL_PANEL_SECRET`).
