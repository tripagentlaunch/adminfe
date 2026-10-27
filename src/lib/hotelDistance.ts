/* Distance of each hotel from a place the advisor picks (hotel desk). Drive
   time + road km come from Google (POST /hotels/distances) for the nearest
   hotels; the rest show a straight-line estimate, which costs nothing. */

export type DistOrigin = { place_id: string; label: string; lat: number; lng: number };
export type Drive = { meters: number; seconds: number };

/** Straight-line km between two points (haversine). */
export function straightKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat), dLng = r(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function fmtKm(km: number): string {
  return km < 10 ? km.toFixed(1) + " km" : Math.round(km) + " km";
}

export function fmtMinutes(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60 ? (m % 60) + " min" : "");
}

/** What a hotel card / itinerary item says about the distance. */
export function distanceText(origin: DistOrigin | null, drive: Drive | null | undefined, lat?: number | null, lng?: number | null): string | null {
  if (!origin) return null;
  if (drive && drive.seconds != null) return fmtMinutes(drive.seconds) + " by car · " + fmtKm(drive.meters / 1000) + " from " + origin.label;
  if (lat == null || lng == null) return null;
  return "≈ " + fmtKm(straightKm(origin.lat, origin.lng, lat, lng)) + " from " + origin.label + " (straight line)";
}
