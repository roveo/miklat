# Miklat

Mobile-first shelter finder PWA for Israel. Miklat shows nearby shelters on a fast map, helps users find the nearest one in one tap, and keeps working offline after first load.

Live site: https://roveo.github.io/miklat/

## Navigation

- [Features](#features)
- [Quick Start](#quick-start)
- [Local Network Testing](#local-network-testing)
- [Project Structure](#project-structure)
- [Data Pipeline](#data-pipeline)
- [Deployment (GitHub Pages)](#deployment-github-pages)
- [Troubleshooting](#troubleshooting)

## Features

- Interactive Leaflet map with marker clustering
- One-tap nearest-shelter lookup via geolocation
- Open-in-maps action for external navigation
- Offline-ready app shell + shelter data + viewed tiles
- i18n support: English, Hebrew, Russian, French, Arabic
- RTL layout for Hebrew and Arabic
- In-app install help popup for iOS/Android/Desktop

## Quick Start

```bash
uv sync
make build
make dev
```

Open `http://localhost:8000`.

## Local Network Testing

Serve to devices on the same network:

```bash
uv run python -m http.server 8000 --bind 0.0.0.0 --directory dist
```

Then open `http://<your-lan-ip>:8000` on mobile.

Note: geolocation requires HTTPS on iOS browsers.

## Project Structure

```text
miklat/
├── build/
│   └── extract_kmz.py
├── data/
│   └── sources/
├── src/
│   ├── css/
│   ├── i18n/
│   ├── icons/
│   ├── js/
│   ├── index.html
│   ├── manifest.json
│   └── service-worker.js
├── .github/workflows/
├── Makefile
├── pyproject.toml
└── uv.lock
```

## Data Pipeline

Place source KMZ files in `data/sources/`.

`build/extract_kmz.py` merges all sources and writes `dist/data/shelters.json`.

Current strategy:

- Parses placemarks and structured metadata
- Parses description HTML tables into proper metadata fields
- Deduplicates with source-aware rules:
  - Same source: 10m baseline (12m for low-information generic points)
  - Cross source: up to 20m when pairing rich vs generic points
  - Exact address match across sources: up to 35m

Tunable command:

```bash
uv run python build/extract_kmz.py --dedupe-distance 10 --cross-source-dedupe-distance 20
```

## Deployment (GitHub Pages)

Workflow file: `.github/workflows/deploy-gh-pages.yml`

Trigger modes:

- Push to `master` or `main`
- Manual run via Actions tab

Required one-time GitHub setting:

1. Repository Settings -> Pages
2. Source: `GitHub Actions`

Optional CLI trigger:

```bash
make deploy
```

## Troubleshooting

- Workflow not triggering on push:
  - Ensure you pushed to `master` or `main`
  - Ensure workflow file exists on that branch
  - Ensure Actions are enabled for the repository
- Pages not updating:
  - Check latest run in Actions tab
  - Confirm Pages source is `GitHub Actions`
