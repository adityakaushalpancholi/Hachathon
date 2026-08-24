const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in km between two [lng, lat] pairs. */
export function haversineKm([lng1, lat1], [lng2, lat2]) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Travel-time estimate. Indian urban traffic averages well below the crow-flies
 * speed, so we apply a detour factor and a fixed pickup overhead rather than
 * pretending the worker teleports in a straight line.
 */
export function estimateEtaMins(distanceKm, { avgSpeedKmph = 18, detourFactor = 1.3, overheadMins = 4 } = {}) {
  const roadKm = distanceKm * detourFactor;
  return Math.max(3, Math.round((roadKm / avgSpeedKmph) * 60 + overheadMins));
}

/** GeoJSON point from loose input — accepts {lat,lng}, [lng,lat] or a GeoJSON point. */
export function toPoint(input) {
  if (!input) return null;
  if (Array.isArray(input)) return { type: 'Point', coordinates: [Number(input[0]), Number(input[1])] };
  if (input.type === 'Point' && Array.isArray(input.coordinates)) {
    return { type: 'Point', coordinates: input.coordinates.map(Number) };
  }
  const lng = input.lng ?? input.longitude ?? input.lon;
  const lat = input.lat ?? input.latitude;
  if (lng === undefined || lat === undefined) return null;
  return { type: 'Point', coordinates: [Number(lng), Number(lat)] };
}

export const kmToRadians = (km) => km / EARTH_RADIUS_KM;
export const kmToMeters = (km) => km * 1000;
