// geo.js — Haversine distance and bearing calculations

const R_EARTH = 6371; // km

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R_EARTH * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearing(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let deg = Math.atan2(y, x) * 180 / Math.PI;
  return (deg + 360) % 360;
}

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

export function compassArrow(fromLat, fromLon, toLat, toLon) {
  const b = bearing(fromLat, fromLon, toLat, toLon);
  const idx = Math.round(b / 45) % 8;
  return ARROWS[idx];
}

export function formatDistance(km) {
  if (km < 1) return '0 km';
  return Math.round(km).toLocaleString() + ' km';
}
