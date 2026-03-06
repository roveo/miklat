# Miklat - Shelter Finder Web App

A mobile-first Progressive Web App that displays shelter locations on an interactive map, finds the nearest shelter to your current location, and works offline after the first visit.

## Overview

**Purpose:** Help users in Israel quickly find the nearest bomb shelter (miklat) from their current location.

**Key Features:**
- Display shelter locations from KMZ file on an interactive map
- Mobile-optimized interface
- Offline support (cached map tiles + shelter data)
- Find nearest shelter with one tap
- Multi-language support (Hebrew, English, Russian, French)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Build Time (Python)                   │
│  KMZ → Extract → Parse KML → Generate JSON              │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   Static Assets                          │
│  index.html, app.js, styles.css, shelters.json,         │
│  i18n/*.json, service-worker.js                         │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              Client (Browser/PWA)                        │
│  Leaflet Map + Geolocation + Offline Cache              │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Build/Data Processing | Python 3.11+ managed with `uv` + `fastkml`, `shapely` |
| Frontend | Vanilla JS (no bundler) |
| Mapping | Leaflet.js + Leaflet.markercluster |
| Tiles | OpenStreetMap (cached via Service Worker) |
| Offline | Service Worker + Cache API |
| i18n | JSON-based translation files |
| Hosting | GitHub Pages or Netlify (static) |

## Project Structure

```
miklat/
├── build/                    # Python build scripts
│   └── extract_kmz.py        # KMZ → KML → JSON converter
├── dist/                     # Generated static site (gitignored)
│   ├── index.html
│   ├── css/
│   ├── js/
│   ├── i18n/
│   └── data/
│       └── shelters.json
├── src/
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── app.js            # Main application entry
│   │   ├── map.js            # Leaflet map handling
│   │   ├── geolocation.js    # GPS + nearest shelter logic
│   │   ├── i18n.js           # Translation system
│   │   └── sw-register.js    # Service worker registration
│   ├── i18n/
│   │   ├── en.json
│   │   ├── he.json
│   │   ├── ru.json
│   │   └── fr.json
│   ├── service-worker.js     # Offline caching
│   └── manifest.json         # PWA manifest
├── data/
│   └── sources/
│       ├── miklat-isr-2026-03-06.kmz
│       └── miklat-tlv-2026-03-06.kmz
├── pyproject.toml            # Python project metadata (managed by uv)
├── uv.lock                   # Locked Python dependencies
├── Makefile                  # Build commands
└── README.md
```

## Implementation Phases

### Phase 1: Data Processing (Python)

**Goal:** Extract shelter data from KMZ file and generate JSON for the frontend.

**Tasks:**
1. Initialize Python dependencies with uv:
   - `uv init` (if project metadata does not exist)
   - `uv add fastkml lxml shapely`
   - Use `uv run ...` for Python script execution

2. Create `build/extract_kmz.py`:
   - Read all KMZ files from `data/sources/` (KMZ is a ZIP containing KML + assets)
   - Parse KML using fastkml
   - Extract placemarks: name, coordinates, description
   - Deduplicate shelter points within 10m radius, preferring richer metadata
   - Output `dist/data/shelters.json`:
     ```json
     {
       "shelters": [
         {
           "id": 1,
           "name": "Shelter Name",
           "lat": 32.0853,
           "lng": 34.7818,
           "description": "Optional description"
         }
       ],
       "metadata": {
         "count": 1234,
         "generated": "2026-03-07T12:00:00Z",
          "sources": ["miklat-isr-2026-03-06.kmz", "miklat-tlv-2026-03-06.kmz"]
        }
      }
      ```

### Phase 2: Core Frontend

**Goal:** Display shelters on an interactive map.

**Tasks:**

1. **HTML Structure (`src/index.html`):**
   - Mobile viewport meta tags
   - Full-screen map container (`#map`)
   - Floating action button for "Find Nearest"
   - Language selector dropdown
   - Offline status indicator
   - Include Leaflet CSS/JS from CDN
   - Include Leaflet.markercluster
   - PWA manifest link + theme color

2. **CSS Styling (`src/css/styles.css`):**
   - Mobile-first responsive design
   - Full viewport map
   - RTL support with `[dir="rtl"]` selectors
   - Floating UI elements positioned over map
   - Touch-friendly button sizes (min 44px tap targets)
   - Status indicators (online/offline)
   - Custom marker styles

3. **Map Module (`src/js/map.js`):**
   - Initialize Leaflet map centered on Israel (~32.0, 34.8)
   - Add OpenStreetMap tile layer
   - Fetch and parse `shelters.json`
   - Create marker cluster group
   - Add markers with popups showing:
     - Shelter name
     - Description (if available)
     - "Open in Maps" button
   - Export functions: `initMap()`, `addUserMarker()`, `panTo()`, `highlightShelter()`

### Phase 3: Geolocation & Nearest Shelter

**Goal:** Find and highlight the nearest shelter to the user.

**Tasks:**

1. **Geolocation Module (`src/js/geolocation.js`):**
   - `requestLocation()` - Get user's current position
   - Handle permission denied/unavailable gracefully
   - `watchPosition()` - Optional continuous tracking
   - `calculateDistance(lat1, lng1, lat2, lng2)` - Haversine formula
   - `findNearestShelter(userLat, userLng, shelters)` - Returns nearest + distance
   - Format distance for display (meters or km)

2. **Find Nearest UX:**
   - User taps "Find Nearest" button
   - Request geolocation permission (if not granted)
   - Calculate distances to all shelters
   - Pan map to nearest shelter
   - Open popup with distance info
   - Add "Open in Maps" button (Google Maps / Waze / Apple Maps)

3. **External Maps Integration:**
   - Detect platform (iOS vs Android vs Desktop)
   - Generate appropriate URL:
     - Google Maps: `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`
     - Apple Maps: `https://maps.apple.com/?daddr=LAT,LNG`
     - Waze: `https://waze.com/ul?ll=LAT,LNG&navigate=yes`

### Phase 4: Offline Support (PWA)

**Goal:** App works after first visit, even without internet.

**Tasks:**

1. **Service Worker (`src/service-worker.js`):**
   - **Install event:** Cache app shell (HTML, CSS, JS, icons)
   - **Activate event:** Clean up old caches
   - **Fetch event:**
     - Cache-first for static assets (app shell)
     - Network-first for `shelters.json` (with cache fallback)
     - Cache map tiles as loaded (stale-while-revalidate)
   - Limit tile cache to ~500 tiles to manage storage

2. **SW Registration (`src/js/sw-register.js`):**
   - Check for service worker support
   - Register service worker
   - Handle updates (prompt user to refresh)

3. **Offline Indicator:**
   - Listen to `online`/`offline` events
   - Show banner when offline
   - Hide when back online

4. **PWA Manifest (`src/manifest.json`):**
   ```json
   {
     "name": "Miklat - Shelter Finder",
     "short_name": "Miklat",
     "description": "Find the nearest shelter",
     "start_url": "/",
     "display": "standalone",
     "theme_color": "#1a73e8",
     "background_color": "#ffffff",
     "icons": [...]
   }
   ```

### Phase 5: Internationalization (i18n)

**Goal:** Support Hebrew, English, Russian, and French with easy extensibility.

**Tasks:**

1. **i18n Module (`src/js/i18n.js`):**
   - Load translation JSON on demand
   - Detect browser language (`navigator.language`)
   - Store preference in `localStorage`
   - `t(key)` function returns translated string
   - `setLanguage(lang)` switches language and updates UI
   - Set `document.dir = 'rtl'` for Hebrew
   - Update all `[data-i18n]` elements on language change

2. **Translation Files (`src/i18n/*.json`):**

   **`en.json` (English):**
   ```json
   {
     "app_name": "Shelter Finder",
     "find_nearest": "Find Nearest Shelter",
     "distance": "Distance",
     "meters": "m",
     "kilometers": "km",
     "open_in_maps": "Open in Maps",
     "offline": "You are offline",
     "location_denied": "Location access denied",
     "no_location": "Unable to get location",
     "loading": "Loading..."
   }
   ```

   **`he.json` (Hebrew - RTL):**
   ```json
   {
     "app_name": "מקלט",
     "find_nearest": "מצא מקלט קרוב",
     "distance": "מרחק",
     "meters": "מ׳",
     "kilometers": "ק״מ",
     "open_in_maps": "פתח במפות",
     "offline": "אתה במצב לא מקוון",
     "location_denied": "הגישה למיקום נדחתה",
     "no_location": "לא ניתן לקבל מיקום",
     "loading": "טוען..."
   }
   ```

   **`ru.json` (Russian):**
   ```json
   {
     "app_name": "Укрытие",
     "find_nearest": "Найти ближайшее укрытие",
     ...
   }
   ```

   **`fr.json` (French):**
   ```json
   {
     "app_name": "Abri",
     "find_nearest": "Trouver l'abri le plus proche",
     ...
   }
   ```

3. **Language Selector:**
   - Dropdown in header/toolbar
   - Show language name in native script (English, עברית, Русский, Français)
   - Persist selection in localStorage

### Phase 6: Build System & Deployment

**Goal:** Simple build process, easy deployment.

**Tasks:**

1. **Makefile:**
   ```makefile
    .PHONY: build clean dev install

    install:
        uv sync

   build: clean
       mkdir -p dist/data dist/css dist/js dist/i18n
        uv run python build/extract_kmz.py
       cp src/index.html dist/
       cp src/css/* dist/css/
       cp src/js/* dist/js/
       cp src/i18n/* dist/i18n/
       cp src/service-worker.js dist/
       cp src/manifest.json dist/

   dev:
        cd dist && uv run python -m http.server 8000

   clean:
       rm -rf dist
   ```

2. **GitHub Actions (optional):**
   - Build on push to main
   - Deploy to GitHub Pages

3. **Netlify (alternative):**
   - Connect repo
   - Build command: `make install && make build`
   - Publish directory: `dist`

## File Summary

| File | Purpose |
|------|---------|
| `pyproject.toml` | Python project metadata (managed by uv) |
| `uv.lock` | Locked Python dependencies |
| `build/extract_kmz.py` | KMZ → JSON converter |
| `src/index.html` | Main HTML page |
| `src/css/styles.css` | All styling + RTL |
| `src/js/app.js` | Main entry point, orchestrates modules |
| `src/js/map.js` | Leaflet map initialization and markers |
| `src/js/geolocation.js` | GPS and nearest shelter logic |
| `src/js/i18n.js` | Translation system |
| `src/js/sw-register.js` | Service worker registration |
| `src/service-worker.js` | Offline caching logic |
| `src/manifest.json` | PWA manifest |
| `src/i18n/en.json` | English translations |
| `src/i18n/he.json` | Hebrew translations (RTL) |
| `src/i18n/ru.json` | Russian translations |
| `src/i18n/fr.json` | French translations |
| `Makefile` | Build commands |

## UX Flow

1. **First Visit:**
   - App loads, shows map centered on Israel
   - Shelters load and display as clustered markers
   - Prompt for location permission (optional)
   - Service worker caches app for offline use

2. **Find Nearest Shelter:**
   - User taps "Find Nearest" FAB
   - If no permission: prompt for location access
   - Calculate distances, find nearest
   - Pan map to nearest shelter, open popup
   - Show distance and "Open in Maps" button

3. **Offline Use:**
   - App works from cache
   - Map tiles that were previously viewed are cached
   - Shelter data is cached
   - Geolocation still works (it's a device API)
   - Show "offline" indicator

4. **Language Change:**
   - User selects language from dropdown
   - All UI text updates immediately
   - Layout switches to RTL for Hebrew
   - Preference saved for next visit

## Performance Considerations

- **Marker Clustering:** Essential for potentially thousands of shelters
- **Lazy Loading:** Load shelter data after initial paint
- **Tile Caching:** Limit to ~500 tiles (~50MB) to avoid storage issues
- **Minimal JS:** No framework, vanilla JS keeps bundle tiny
- **Preconnect:** Hint for OSM tile servers

## Security Considerations

- **HTTPS Required:** For geolocation API and service workers
- **No User Data:** App doesn't collect or transmit user location
- **Static Hosting:** No server-side vulnerabilities

## Future Enhancements (Out of Scope)

- Walking directions within app (requires routing API)
- Accessibility ratings for shelters
- Crowd-sourced updates
- Push notifications for alerts
- Native app wrappers (Capacitor/Cordova)
