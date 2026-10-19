// Mobil uygulama için konum arama, sürüm 1 (sunucu madde 5, Ekim 2026). Web'in /api/locations ucuyla aynı
// kaynak (Open-Meteo geocoding); fark yalnız CORS (Capacitor) ve CDN önbelleği. Mobil uygulama Open-Meteo'yu
// doğrudan çağırmaz.
//
// GET /api/v1/locations?q=izmit → { results: [{ name, admin1, country, lat, lon }] } (en çok 8 sonuç)

import { cors } from "../../../lib/apiCors";

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "yalnız GET" });
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) {
    res.setHeader("Cache-Control", "public, s-maxage=86400");
    return res.status(200).json({ results: [] });
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=tr&format=json`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`geocoding ${r.status}`);
    const raw = await r.json();
    const results = (raw.results || []).map((loc) => ({
      name: loc.name,
      admin1: loc.admin1 || null,
      country: loc.country || null,
      lat: Math.round(loc.latitude * 100) / 100,
      lon: Math.round(loc.longitude * 100) / 100,
    }));
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=86400");
    return res.status(200).json({ results });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "Konum araması başarısız" });
  }
}
