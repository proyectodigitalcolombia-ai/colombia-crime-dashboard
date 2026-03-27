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
 * Returns 502 if any segment cannot be routed via roads — 
 * so the client falls back to haversine and shows a dashed "estimated" line
 * instead of a misleading solid straight line.
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

  // ── Attempt 1: full multi-waypoint route ──
  const fullLonlats = points.join("|");
  const fullData = await brouterFetch(fullLonlats);
  const fullFeat = fullData?.features?.[0];

  if (fullFeat?.geometry?.coordinates?.length) {
    const { coords: c, distance, duration } = parseBRouterFeature(fullFeat);
    return res.json({
      provider: "brouter",
      geojson: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "LineString", coordinates: c },
          properties: { "track-length": String(distance), "total-time": String(duration) },
        }],
      },
    });
  }

  // ── Attempt 2: segment-by-segment — ONLY if every segment succeeds ──
  const segResults: Array<{ coords: [number, number, number][]; distance: number; duration: number }> = [];

  for (let i = 0; i < points.length - 1; i++) {
    const segLonlats = `${points[i]}|${points[i + 1]}`;
    const segData = await brouterFetch(segLonlats, 12000);
    const segFeat = segData?.features?.[0];

    if (segFeat?.geometry?.coordinates?.length) {
      segResults.push(parseBRouterFeature(segFeat));
    } else {
      // One segment couldn't be road-routed — tell the client to use haversine
      return res.status(502).json({ error: "No road route available for one or more segments" });
    }
  }

  // All segments succeeded — concatenate
  let allCoords: [number, number, number][] = [];
  let totalDist = 0;
  let totalTime = 0;

  for (let i = 0; i < segResults.length; i++) {
    const { coords: segCoords, distance: segDist, duration: segTime } = segResults[i];
    allCoords = [...allCoords, ...(i === 0 ? segCoords : segCoords.slice(1))];
    totalDist += segDist;
    totalTime += segTime;
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
