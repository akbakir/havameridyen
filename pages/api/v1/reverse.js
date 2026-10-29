// Mobil uygulama için koordinattan yer adı (28 Ekim 2026, Ali Kemal: "Konumumu kullan" → "Konumum · İzmit").
// Kaynak OpenStreetMap (ODbL; uygulamada "© OpenStreetMap katkıda bulunanlar" yazar). Uygulama bu servisleri doğrudan
// çağırmaz: istek bu sunucudan, koordinat iki ondalığa (~1 km) yuvarlanarak ve CDN'de 30 gün önbelleğe alınarak gider.
//
// 29 Ekim ("istikrarlı çalışmıyor"): Nominatim paylaşımlı sunucu IP'lerinden gelen isteği zaman zaman yavaşlatıyor ya
// da reddediyor (429 / 403). Bu yüzden önce Nominatim (en çok 3,5 sn), olmazsa aynı OSM verisini kullanan Photon
// (komoot) denenir. İkisi de olmazsa 502 döner ve yalnız 60 sn önbelleğe alınır; uygulama "Konumum" yazar ve adı
// arka planda yeniden ister.
//
// GET /api/v1/reverse?lat=40.77&lon=29.94 → { name: "İzmit", admin1: "Kocaeli", src: "nominatim" | "photon" }

import { cors } from "../../../lib/apiCors";

const UA = "havameridyen/1.0 (+https://www.havameridyen.com)";

async function getJson(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr" }, signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// Nominatim: Türkiye'de ilçe çoğunlukla "town" ya da "county", il "province"; büyükşehirde "city" ili verebilir,
// o yüzden önce ilçe (zoom 12 = ilçe / kasaba düzeyi)
async function nominatim(la, lo) {
  const raw = await getJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${la}&lon=${lo}&zoom=12&addressdetails=1&accept-language=tr`, 3500);
  const a = raw.address || {};
  const name = a.town || a.county || a.city_district || a.city || a.municipality || a.village || a.suburb || null;
  return name ? { name, admin1: a.province || a.state || null } : null;
}

// Photon (OSM verisi, yerel adlar): ilçe "county" ya da "district", il "state" ya da "city"
async function photon(la, lo) {
  const raw = await getJson(`https://photon.komoot.io/reverse?lat=${la}&lon=${lo}&limit=1&lang=default`, 3500);
  const p = (raw.features && raw.features[0] && raw.features[0].properties) || {};
  const name = p.county || p.district || p.city || p.town || p.name || null;
  const admin1 = p.state || (p.city && p.city !== name ? p.city : null);
  return name ? { name, admin1 } : null;
}

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

  let out = null;
  let src = null;
  const errs = [];
  for (const [name, fn] of [
    ["nominatim", nominatim],
    ["photon", photon],
  ]) {
    try {
      out = await fn(la, lo);
      if (out) {
        src = name;
        break;
      }
      errs.push(`${name}: ad yok`);
    } catch (e) {
      errs.push(`${name}: ${e && e.name === "AbortError" ? "zaman aşımı" : e && e.message}`);
    }
  }

  if (out) {
    const admin1 = out.admin1 && out.admin1 !== out.name ? out.admin1 : null;
    res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=86400");
    return res.status(200).json({ name: out.name, admin1, lat: Number(la), lon: Number(lo), src });
  }
  res.setHeader("Cache-Control", "public, s-maxage=60");
  return res.status(502).json({ error: "Yer adı bulunamadı", detail: errs });
}
