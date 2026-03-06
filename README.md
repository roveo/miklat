# Miklat

Mobile-first PWA for finding the nearest shelter in Israel.

## Quick start

```bash
uv sync
make build
make dev
```

Then open `http://localhost:8000`.

## Data source

Place source KMZ files under `data/sources/`.

The build script merges all KMZ files found there and deduplicates shelters within 10 meters,
preferring records with richer metadata.

Deduplication strategy:
- Same-source records: 10m baseline (12m for low-information generic points)
- Cross-source records: up to 20m when one point has rich metadata and the other is generic
- Exact address match across sources: up to 35m

You can tune this at build time:

```bash
uv run python build/extract_kmz.py --dedupe-distance 10 --cross-source-dedupe-distance 20
```

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow at `.github/workflows/deploy-gh-pages.yml`.

1. In GitHub, open Settings -> Pages and set Source to `GitHub Actions`.
2. Push to `main`, or trigger manually from the Actions tab.
3. Optional CLI trigger:

```bash
make deploy
```
