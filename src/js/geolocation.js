const IOS_PATTERN = /iPad|iPhone|iPod/;

export function requestLocation(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: options.timeout ?? 10000,
      maximumAge: options.maximumAge ?? 0,
    });
  });
}

export function watchPosition(onSuccess, onError, options = {}) {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported");
  }

  return navigator.geolocation.watchPosition(onSuccess, onError, {
    enableHighAccuracy: true,
    timeout: options.timeout ?? 10000,
    maximumAge: options.maximumAge ?? 1000,
  });
}

export function calculateDistance(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000;
  const toRadians = (deg) => (deg * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function findNearestShelter(userLat, userLng, shelters) {
  if (!Array.isArray(shelters) || shelters.length === 0) {
    return null;
  }

  let nearest = null;

  for (const shelter of shelters) {
    const distanceMeters = calculateDistance(userLat, userLng, shelter.lat, shelter.lng);

    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = {
        shelter,
        distanceMeters,
      };
    }
  }

  return nearest;
}

export function formatDistance(distanceMeters, t) {
  if (!Number.isFinite(distanceMeters)) {
    return "";
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} ${t("meters")}`;
  }

  return `${(distanceMeters / 1000).toFixed(2)} ${t("kilometers")}`;
}

export function getPlatformMapsUrl(lat, lng) {
  const destination = `${lat},${lng}`;
  const ua = navigator.userAgent || "";

  if (IOS_PATTERN.test(ua)) {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function getWazeUrl(lat, lng) {
  return `https://waze.com/ul?ll=${encodeURIComponent(`${lat},${lng}`)}&navigate=yes`;
}
