# Market plugin architecture

See [MARKET-PLUGINS.md](./MARKET-PLUGINS.md) for Phase 1.

## Phase 2 — Open Search

- Market ID: `open_search`
- OSM Overpass area query + Nominatim geocode + DDG website enrichment
- Results → `generic_leads` table
- Env: `OPEN_SEARCH_RADIUS_METRES` (default 8000), `OPEN_SEARCH_RESULT_CAP` (default 150)

## Phase 3 — Florida DBPR

- Market ID: `us_florida_food`
- Requires `FLORIDA_DBPR_DATA_URL` — district CSV from [DBPR public records](https://www2.myfloridalicense.com/hotels-restaurants/public-records/)
- Results → `florida_leads` table
- Filter by city/county via `location` param

## Phase 4 — Radar dashboard

- Default UI: `/dashboard/` → PassFinder Radar (Command Panel + Leaflet map + Action Desk)
- Legacy UK: `/dashboard/uk`
- Texas: `/dashboard/texas`
