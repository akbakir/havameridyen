// Mobil uygulama için koordinattan yer adı (28 Ekim 2026, Ali Kemal: "Konumumu kullan" → "Konumum · İzmit").
// Kaynak OpenStreetMap Nominatim (ODbL; uygulamada "© OpenStreetMap katkıcıları" yazar). Uygulama Nominatim'i
// doğrudan çağırmaz: istek bu sunucudan, koordinat iki ondalığa (~1 km) yuvarlanarak ve CDN'de 30 gün önbelleğe
// alınarak gider (Nominatim kullanım kuralı: tanıtıcı User-Agent, önbellek, saniyede en çok 1 istek).
//
// GET /api/v1/reverse?lat=40.77&lon=29.94 → { name: "İzmit", admin1: "Kocaeli" } (bulunamazsa name null)

import { cors } from "../../../lib/apiCors";

const UA = "havameridyen/1.0 (+https://www.havameridyen.com)";

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "yalnız GET" });
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: "lat / lon geçersiz" });
  }
  const la = (Math.round(lat * 100) / 100).toFixed(2);
  const lo = (Math.round(lon * 100) / 100).toFixed(2);

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${la}&lon=${lo}&zoom=12&addressdetails=1&accept-language=tr`;
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr" } });
    if (!r.ok) throw new Error(`nominatim ${r.status}`);
    const raw = await r.json();
    const a = raw.address || {};
    // Türkiye'de ilçe çoğunlukla "town" ya da "county", il "province"; büyükşehirde "city" ili verebilir, o yüzden
    // önce ilçe. zoom 12 = ilçe / kasaba düzeyi.
    const name = a.town || a.county || a.city_district || a.city || a.municipality || a.village || a.suburb || null;
    const admin1 = a.province || a.state || null;
    res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=86400");
    return res.status(200).json({ name, admin1: admin1 && admin1 !== name ? admin1 : null, lat: Number(la), lon: Number(lo) });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "Yer adı bulunamadı" });
  }
}
