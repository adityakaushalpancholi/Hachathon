/**
 * The areas this deployment serves.
 *
 * Operating config, not fixture data — it decides where customers can put an
 * address and which bucket their demand is counted in, both of which are true
 * whether or not anything was ever seeded. It previously lived in the seed
 * fixtures, which meant the only way to learn the service area was to read the
 * demo data generator.
 *
 * `center` is [longitude, latitude] — GeoJSON order, matching what Mongo's
 * 2dsphere indexes expect. The API converts to {lat, lng} at the boundary
 * because that is the order people read, and every mix-up between the two ends
 * up as a booking dispatched to the wrong hemisphere.
 */
export const SERVICE_AREAS = [
  { zone: 'Andheri West',  city: 'Mumbai', pincode: '400058', center: [72.8296, 19.1364] },
  { zone: 'Bandra West',   city: 'Mumbai', pincode: '400050', center: [72.8296, 19.0596] },
  { zone: 'Powai',         city: 'Mumbai', pincode: '400076', center: [72.9051, 19.1176] },
  { zone: 'Dadar',         city: 'Mumbai', pincode: '400028', center: [72.8420, 19.0176] },
  { zone: 'Malad West',    city: 'Mumbai', pincode: '400064', center: [72.8484, 19.1868] },
  { zone: 'Chembur',       city: 'Mumbai', pincode: '400071', center: [72.8998, 19.0522] },
  { zone: 'Goregaon East', city: 'Mumbai', pincode: '400063', center: [72.8656, 19.1663] },
  { zone: 'Thane West',    city: 'Thane',  pincode: '400601', center: [72.9781, 19.2183] },
];

/** Shaped for the browser: {lat, lng}, grouped-friendly, no GeoJSON ordering trap. */
export const areasForClient = () =>
  SERVICE_AREAS.map(({ zone, city, pincode, center }) => ({
    zone,
    city,
    pincode,
    lat: center[1],
    lng: center[0],
  }));

/**
 * Nearest serviceable area to a coordinate, used to bucket an address captured
 * by GPS. Plain squared euclidean distance on degrees: over a metro-sized area
 * the error against a proper haversine is far smaller than the gap between
 * neighbouring zones, and this never has to be right to the metre — it only has
 * to pick the correct neighbourhood.
 */
export const nearestArea = (lat, lng) =>
  SERVICE_AREAS.reduce((best, area) => {
    const d = (area.center[1] - lat) ** 2 + (area.center[0] - lng) ** 2;
    return !best || d < best.d ? { ...area, d } : best;
  }, null);
