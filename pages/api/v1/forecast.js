// Mobil uygulama ve widget'lar için tahmin servisi, sürüm 1 (sunucu madde 2b, Ekim 2026).
// Mobil uygulama Open-Meteo'yu doğrudan çağırmaz; bütün istekler bu servisten ve önbellekten geçer.
//
// GET /api/v1/forecast?lat=40.77&lon=29.92&days=7&models=ecmwf_ifs,gfs_seamless
//   lat, lon  zorunlu; 2 ondalığa yuvarlanır (~1 km). Yuvarlanmamış ya da model sırası farklı istek,
//             aynı içeriğin tek adreste önbelleğe alınması için kanonik adrese yönlendirilir (308).
//   days      1–16, varsayılan 7
//   models    virgülle model kimlikleri; yoksa varsayılan beş model (ECMWF, GFS, ICON, UKMO, ARPEGE)
//   part      (5 Kas, hız) yoksa temel yanıt: basınç seviyesi istenmez, LI yalnız modelin kendi değeri (GFS) — hızlı.
//             part=li → yalnız hesaplanan LI: { v, part: "li", time, models: [{ id, calculated, hourly: { lifted_index } }] }
//             (ICON, UKMO, ARPEGE, GEM, JMA; basınç seviyelerinden). Uygulama ikisini aynı anda ister, LI'yi sonradan ekler.
//
// Yanıt (saatler TSİ, "YYYY-MM-DDTHH:mm"):
//   { v: 1, location: {lat, lon}, days, timezone, generated_at, time: [...],
//     models: [{ id, label, color, calculated, hourly: { temp: [...], feels_like: [...], ... } }],
//     calculated: modelin kendi yayınlamadığı, bizim hesapladığımız alanlar (ör. ["lifted_index"]) —
//     uygulamada yanında "hesaplanan" yazar.
//     consensus: { hourly: [...], daily: [...] } }   ← ortanca + uyum (lib/consensus.js)
//     daily[].cond: günün ortak durumu (önce her modelin günü — 00–24 yağış, yoksa 07–21 bulut —, sonra modeller;
//     yağış tek aile, ikon en etkili tür; widget "günler" görünümü, lib/consensus.js dayCond)
//     günün ortanca toplam yağışı ≤ 0,5 mm ise yağmur / sağanak yağış "Hafif …" (ic rainL / showerL, light: true)
//     slots3[]: 3 saatlik dilimler (00, 03 … 21 TSİ) — { start, cond (gün kuralıyla aynı), precip (modellerin 3 saatlik
//     toplamlarının ortancası) }; widget saat dilimleri
// Uyum seviyeleri: ok (hemfikir) · partial (kısmen) · split (ayrışıyor) · na (karşılaştıracak model yok) ·
// none (yağış / kar: hiçbir model eşiği aşmıyor — satır gösterilmez).

import { LI_CALC_MODELS, MODELS, defaultActiveModelIds, getForecastDays, MAX_DAYS } from "../../../lib/forecast";
import { buildConsensus } from "../../../lib/consensus";
import { cors } from "../../../lib/apiCors";

const VALID_IDS = new Set(MODELS.map((m) => m.id));
const DEFAULT_DAYS = 7;

// Saatlik alanlar: API adı ← lib/forecast.js seri alanı
const HOURLY_FIELDS = [
  ["temp", "temp"],
  ["feels_like", "feels_like"],
  ["precip", "precip_amount"],
  ["precip_prob", "precip_prob"],
  ["snowfall", "snowfall"],
  ["snow_depth", "snow_depth"],
  ["wind_speed", "wind_speed"],
  ["wind_direction", "wind_direction"],
  ["wind_gust", "wind_gust"],
  ["humidity", "humidity"],
  ["dew_point", "dew_point"],
  ["pressure", "pressure"],
  ["cloud_cover", "cloud_cover"],
  ["cape", "cape"],
  ["cin", "cin"],
  ["lifted_index", "lifted_index"],
  ["visibility", "visibility"], // m (30 Ekim, sis / pus)
  ["is_day", "is_day"], // 1 / 0 (31 Ekim, gün doğumu / batımı)
  ["showers", "showers"], // mm, yalnız AIFS (5 Kas: sağanak payı; diğer modellerde null)
];

const round2 = (v) => Math.round(v * 100) / 100;

function canonical(query) {
  const lat = parseFloat(query.lat);
  const lon = parseFloat(query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const days = query.days == null ? DEFAULT_DAYS : parseInt(query.days, 10);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) return null;
  const asked =
    typeof query.models === "string" && query.models
      ? query.models.split(",").map((s) => s.trim()).filter((id) => VALID_IDS.has(id))
      : defaultActiveModelIds();
  const ids = MODELS.map((m) => m.id).filter((id) => asked.includes(id));
  const models = ids.length ? ids : defaultActiveModelIds();
  const part = query.part === "li" ? "li" : null;
  return { lat: round2(lat), lon: round2(lon), days, models, part };
}

// İstek kanonik biçimde mi: yalnız lat, lon, days, models; her biri kanonik yazımıyla
function isCanonical(query, c) {
  const keys = Object.keys(query).sort().join(",");
  return (
    keys === (c.part ? "days,lat,lon,models,part" : "days,lat,lon,models") &&
    (c.part ? query.part === c.part : true) &&
    query.lat === c.lat.toFixed(2) &&
    query.lon === c.lon.toFixed(2) &&
    query.days === String(c.days) &&
    query.models === c.models.join(",")
  );
}

function canonicalSearch(c) {
  return `lat=${c.lat.toFixed(2)}&lon=${c.lon.toFixed(2)}&days=${c.days}&models=${c.models.join(",")}` + (c.part ? `&part=${c.part}` : "");
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "yalnız GET" });
  }

  const c = canonical(req.query);
  if (!c) return res.status(400).json({ error: "lat (−90…90), lon (−180…180) gerekli; days 1–16" });

  // Kanonik adres: CDN aynı içeriği tek anahtarla saklasın. Ham adres yazısı değil, çözülmüş parametreler
  // karşılaştırılır: Vercel sorgudaki virgülü %2C'ye çevirebiliyor; ham karşılaştırmada çok modelli istek
  // kendine yönlenip döngüye giriyordu (18 Ekim düzeltmesi).
  const search = canonicalSearch(c);
  if (!isCanonical(req.query, c)) {
    res.setHeader("Cache-Control", "public, s-maxage=86400");
    res.redirect(308, `/api/v1/forecast?${search}`);
    return; // Next.js: API işleyicisi değer döndürmemeli (res.redirect nesne döndürür)
  }

  try {
    // part=li: yalnız LI'si hesaplanan modeller, basınç seviyeleriyle; yanıtta yalnız lifted_index
    if (c.part === "li") {
      const ids = c.models.filter((id) => LI_CALC_MODELS.has(id));
      const g = ids.length ? await getForecastDays(c.lat, c.lon, c.days, ids, { levels: true }) : { models: [] };
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=21600");
      return res.status(200).json({
        v: 1,
        part: "li",
        time: g.models[0]?.series.map((s) => s.time) || [],
        models: g.models.map((m) => ({ id: m.id, calculated: m.calculated, hourly: { lifted_index: m.series.map((s) => s.lifted_index ?? null) } })),
      });
    }
    // Temel yanıt (5 Kas, hız): basınç seviyesi istenmez → hızlı; hesaplanan LI part=li ile ayrıca gelir
    const f = await getForecastDays(c.lat, c.lon, c.days, c.models, { levels: false });
    const time = f.models[0]?.series.map((s) => s.time) || [];
    const models = f.models.map((m) => {
      const hourly = {};
      for (const [out, key] of HOURLY_FIELDS) hourly[out] = m.series.map((s) => s[key] ?? null);
      return { id: m.id, label: m.label, color: m.color, calculated: m.calculated, hourly };
    });
    // Hız (5 Kas): 1 saat taze; sonra 6 saate kadar eski yanıt hemen verilir, yenisi arka planda çekilir (modeller
    // zaten 6 saatte bir güncellenir)
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=21600");
    return res.status(200).json({
      v: 1,
      location: { lat: c.lat, lon: c.lon },
      days: c.days,
      timezone: f.timezone,
      generated_at: f.generated_at,
      time,
      models,
      consensus: buildConsensus(f.models),
    });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "Hava tahmin verisi alınamadı" });
  }
}
