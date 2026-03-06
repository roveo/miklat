const VERSION = "v1";
const APP_SHELL_CACHE = `miklat-app-shell-${VERSION}`;
const TILE_CACHE = `miklat-tiles-${VERSION}`;
const DATA_CACHE = `miklat-data-${VERSION}`;
const TILE_CACHE_LIMIT = 500;

const APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/map.js",
  "./js/geolocation.js",
  "./js/i18n.js",
  "./js/sw-register.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./i18n/en.json",
  "./i18n/he.json",
  "./i18n/ru.json",
  "./i18n/fr.json",
  "./i18n/ar.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![APP_SHELL_CACHE, TILE_CACHE, DATA_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

async function trimTileCache() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();

  if (keys.length <= TILE_CACHE_LIMIT) {
    return;
  }

  const toDelete = keys.length - TILE_CACHE_LIMIT;
  for (let index = 0; index < toDelete; index += 1) {
    await cache.delete(keys[index]);
  }
}

function isTileRequest(requestUrl) {
  return requestUrl.hostname === "tile.openstreetmap.org";
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.pathname.endsWith("/data/shelters.json")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(DATA_CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (isTileRequest(requestUrl)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            const copy = response.clone();
            caches.open(TILE_CACHE).then(async (cache) => {
              await cache.put(event.request, copy);
              await trimTileCache();
            });
            return response;
          })
          .catch(() => cachedResponse);

        return cachedResponse || networkFetch;
      })
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cachedResponse) => cachedResponse || fetch(event.request)));
});
