# Repository Guidelines

## Project Structure & Module Organization
- `index.html` hosts the Leaflet map shell, filter controls, and fetch triggers; keep new UI blocks lightweight and mounted under existing containers to avoid layout regressions.
- `main.js` is the single-page controller: data ingest (`loadData`, `ingestDataset`), filtering, map/list sync, and metadata refresh. Split new logic into helper functions near related sections (e.g., filtering, rendering).
- `styles.css` defines the two-column layout and card styles; prefer extending existing utility classes before introducing new globals.
- `data/aed.geojson` stores the cached dataset used offline; the app loads this first, then the remote ArcGIS feed.
- `vendor/` contains pinned Leaflet and marker-cluster builds; update by swapping the entire directory to keep licenses intact.

## Build, Test, and Development Commands
- `python -m http.server 8000` (run from repo root) serves the static bundle locally; visit `http://localhost:8000`.
- `npm install --global serve && serve .` is an alternative when HTTPS or custom ports are required.
- `curl -o data/aed.geojson <GeoJSON URL>` refreshes the offline dataset; ensure the schema remains compatible with `normalizeFeature`.

## Coding Style & Naming Conventions
- JavaScript uses 2-space indentation, `const`/`let` appropriately, and early returns for error paths; follow existing patterns in `main.js`.
- Functions are camelCase (`buildCityCountMap`), DOM ids/classes are kebab-case, and GeoJSON property mirrors Japanese labels for clarity.
- Keep strings user-facing and localized (Japanese) where the UI already does so; technical logs can remain English.
- Before committing, format edits by running `npx prettier@latest main.js styles.css index.html` if you introduce structural changes.

## Testing Guidelines
- There is no automated test harness; rely on manual verification in desktop Chrome and mobile Safari (responsive DevTools) after each change.
- Validate filters and map/list synchronization by switching cities, searching, and clicking markers to ensure `markerStore` and list highlighting stay in sync.
- When touching data ingestion, load both `data/aed.geojson` and the remote feed to verify timestamps update and errors surface in the banner.

## Commit & Pull Request Guidelines
- Follow the existing Conventional Commits style (`feat:`, `chore:`, `style:`) as seen in `git log`.
- Each PR should describe the user-facing change, outline manual test steps, and link related issues. Include screenshots/GIFs whenever the UI shifts.
- Reference any data or vendor updates explicitly (e.g., “refresh data/aed.geojson to 2024-01 snapshot”) so reviewers can diff large files confidently.

## Data & Configuration Notes
- Keep API endpoints centralized at the top of `main.js`; if you add secrets or alternate feeds, place them behind environment-specific flags rather than hardcoding credentials.
- For deployments in restricted networks, confirm `vendor/` versions match the CDN versions expected by the Leaflet plugins you consume.
