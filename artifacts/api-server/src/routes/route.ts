import { Router } from "express";

const router = Router();

async function brouterFetch(lonlats: string, timeoutMs = 14000): Promise<any> {
  const url = `https://brouter.de/brouter?lonlats=${encodeURIComponent(lonlats)}&profile=car-fast&alternativeidx=0&format=geojson`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SafeNode-Dashboard/2.0", Accept: "application/json, */*" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function parseBRouterFeature(feat: any) {
  return {
    coords: (feat.geometry?.coordinates ?? []) as [number, number, number][],
    distance: parseInt(feat.properties?.["track-length"] ?? "0", 10),
    duration: parseInt(feat.properties?.["total-time"] ?? "0", 10),
  };
}

/**
 * GET /api/route?coords=lng,lat;lng,lat;...
 * Uses BRouter for real road-following routes (works from cloud IPs).
 * Strategy:
 *   1. Try full multi-waypoint route at once.
 *   2. If that fails, route segment by segment and concatenate.
 */
router.get("/route", async (req, res) => {
  const { coords } = req.query;
  if (!coords || typeof coords !== "string") {
    return res.status(400).json({ error: "coords required (lng,lat;lng,lat;...)" });
  }

  const points = coords.split(";");
  if (points.length < 2) {
    return res.status(400).json({ error: "At least 2 points required" });
  }

  // ── Attempt 1: full route ──
  const fullLonlats = points.join("|");
  const fullData = await brouterFetch(fullLonlats);
  const fullFeat = fullData?.features?.[0];

  if (fullFeat?.geometry?.coordinates?.length) {
    const { coords: c, distance, duration } = parseBRouterFeature(fullFeat);
    return res.json({
      provider: "brouter",
      geojson: { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: c }, properties: { "track-length": String(distance), "total-time": String(duration) } }] },
    });
  }

  // ── Attempt 2: route segment by segment ──
  let allCoords: [number, number, number][] = [];
  let totalDist = 0;
  let totalTime = 0;
  let anySuccess = false;

  for (let i = 0; i < points.length - 1; i++) {
    const segLonlats = `${points[i]}|${points[i + 1]}`;
    const segData = await brouterFetch(segLonlats, 12000);
    const segFeat = segData?.features?.[0];

    if (segFeat?.geometry?.coordinates?.length) {
      const { coords: segCoords, distance: segDist, duration: segTime } = parseBRouterFeature(segFeat);
      // Skip duplicate junction point between segments
      const toAdd = i === 0 ? segCoords : segCoords.slice(1);
      allCoords = [...allCoords, ...toAdd];
      totalDist += segDist;
      totalTime += segTime;
      anySuccess = true;
    } else {
      // Interpolate straight-line fallback for this segment
      const [aLng, aLat] = points[i].split(",").map(Number);
      const [bLng, bLat] = points[i + 1].split(",").map(Number);
      const steps = 8;
      for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
        const t = s / steps;
        allCoords.push([aLng + (bLng - aLng) * t, aLat + (bLat - aLat) * t, 0]);
      }
      // Estimate distance using haversine for this segment
      const R = 6371000;
      const dLat = (bLat - aLat) * Math.PI / 180;
      const dLon = (bLng - aLng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      const segDist = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      totalDist += segDist;
      totalTime += segDist / (60000 / 3600);
    }
  }

  if (!anySuccess && allCoords.length < 2) {
    return res.status(502).json({ error: "No route data available" });
  }

  return res.json({
    provider: "brouter",
    geojson: {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "LineString", coordinates: allCoords },
        properties: { "track-length": String(Math.round(totalDist)), "total-time": String(Math.round(totalTime)) },
      }],
    },
  });
});

export default router;
