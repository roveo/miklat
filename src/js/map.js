let mapInstance = null;
let clusterGroup = null;
let userMarker = null;
const shelterMarkersById = new Map();
let sheltersCache = [];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPopupHtml(shelter, options) {
  const safeName = escapeHtml(shelter.name || "Shelter");
  const safeDescription = shelter.description ? escapeHtml(shelter.description) : "";
  const safeDistance = options.distanceLabel ? escapeHtml(options.distanceLabel) : "";
  const safeDistanceValue = options.distanceValue ? escapeHtml(options.distanceValue) : "";
  const mapsLabel = escapeHtml(options.openInMapsLabel || "Open in Maps");
  const mapsUrl = options.mapsUrl || `https://www.google.com/maps/dir/?api=1&destination=${shelter.lat},${shelter.lng}`;

  return [
    `<h3 class="popup-title">${safeName}</h3>`,
    safeDescription ? `<p class="popup-description">${safeDescription}</p>` : "",
    safeDistanceValue ? `<p class="popup-distance">${safeDistance}: ${safeDistanceValue}</p>` : "",
    `<a class="popup-link" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">${mapsLabel}</a>`,
  ].join("");
}

function parseShelters(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.shelters)) {
    return payload.shelters;
  }
  return [];
}

export async function initMap(options = {}) {
  if (mapInstance) {
    return { map: mapInstance, shelters: sheltersCache };
  }

  mapInstance = L.map("map", {
    zoomControl: true,
    minZoom: 7,
  }).setView([32.0, 34.8], 8);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapInstance);

  clusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    disableClusteringAtZoom: 15,
    maxClusterRadius: 55,
  });

  const response = await fetch("./data/shelters.json");
  if (!response.ok) {
    throw new Error("Failed to fetch shelters data");
  }

  const payload = await response.json();
  sheltersCache = parseShelters(payload);

  for (const shelter of sheltersCache) {
    if (typeof shelter.lat !== "number" || typeof shelter.lng !== "number") {
      continue;
    }

    const marker = L.marker([shelter.lat, shelter.lng]);
    marker.bindPopup(
      buildPopupHtml(shelter, {
        openInMapsLabel: options.openInMapsLabel,
      })
    );

    shelterMarkersById.set(shelter.id, marker);
    clusterGroup.addLayer(marker);
  }

  mapInstance.addLayer(clusterGroup);
  return { map: mapInstance, shelters: sheltersCache };
}

export function addUserMarker(lat, lng) {
  if (!mapInstance) {
    return;
  }

  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
    return;
  }

  userMarker = L.circleMarker([lat, lng], {
    radius: 8,
    color: "#0e5a8a",
    fillColor: "#22a6f2",
    fillOpacity: 0.95,
    weight: 2,
  });

  userMarker.addTo(mapInstance);
}

export function panTo(lat, lng, zoom = 16) {
  if (!mapInstance) {
    return;
  }

  mapInstance.setView([lat, lng], zoom, {
    animate: true,
    duration: 0.8,
  });
}

export function highlightShelter(shelter, options = {}) {
  if (!mapInstance || !shelter) {
    return;
  }

  const marker = shelterMarkersById.get(shelter.id);
  if (!marker) {
    return;
  }

  if (clusterGroup) {
    clusterGroup.zoomToShowLayer(marker, () => {
      marker.setPopupContent(
        buildPopupHtml(shelter, {
          distanceLabel: options.distanceLabel,
          distanceValue: options.distanceValue,
          openInMapsLabel: options.openInMapsLabel,
          mapsUrl: options.mapsUrl,
        })
      );
      marker.openPopup();
    });
  }
}

export function getShelters() {
  return sheltersCache;
}
