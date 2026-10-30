import { isDayHour, sunTimes } from "./sun";
import { PRESSURE_LEVELS, parcelIndices } from "./convection";

// Backend'in kalbi: Open-Meteo'dan çekilen ham veriyi normalize eder ve cache'ler.
// İleride veri kaynağı değişirse (kendi model pipeline'ına geçilirse) sadece bu dosya değişir.

export const MODELS = [
  { id: "ecmwf_ifs", label: "ECMWF", color: "#1F7A52", dashed: false, defaultActive: true },
  { id: "gfs_seamless", label: "GFS", color: "#B35900", dashed: false, defaultActive: true },
  { id: "icon_seamless", label: "ICON", color: "#2C4A6E", dashed: true, defaultActive: true },
  { id: "ukmo_seamless", label: "UKMO", color: "#4F6B7A", dashed: false, defaultActive: true },
  { id: "meteofrance_seamless", label: "ARPEGE", color: "#7A6C4F", dashed: true, defaultActive: true },
  { id: "gem_seamless", label: "GEM", color: "#B4553B", dashed: false, defaultActive: false },
  { id: "jma_gsm", label: "JMA", color: "#8A6FA3", dashed: true, defaultActive: false },
];

// Open-Meteo'dan istenen saatlik değişkenler. Not: ECMWF IFS 2 m bağıl nemi ham olarak
// yayınlamıyor; bu yüzden dew_point_2m de çekilir ve nem boş gelirse Magnus formülüyle
// sıcaklık + çiy noktasından hesaplanır (bkz. relativeHumidityFrom).
// CAPE (J/kg): sağanak ve gök gürültülü ifadesi ile CAPE grafiği için (JMA vermiyor).
// Sunucu aşaması, madde 1 (17 Ekim 2026) — ekranlar değişmeden yalnız veri eklenir:
// - apparent_temperature: hissedilen sıcaklık (7 modelin hepsi veriyor).
// - snowfall: saatlik taze kar, cm. Open-Meteo su eşdeğerini tüm modellerde 1 mm ≈ 0,7 cm ile çevirir.
// - snow_depth: toplam kar kalınlığı, metre gelir → cm'ye çevrilir. Her modelin kendi değeri; ECMWF'de
//   modelin kendi kar yoğunluğuyla hesaplanmış (su eşdeğeri ÷ yoğunluk). UKMO, ARPEGE, JMA vermiyor.
// - convective_inhibition (CIN, J/kg): ECMWF, GFS, ICON kendi değeri. UKMO değer veriyor ama işareti
//   ters (eksi) ve tanımı belirsiz → karar (V09 D1): UKMO CIN "verisi yok", sunucuda null'a çekilir.
//   ARPEGE, GEM, JMA vermiyor (hesaplanan CIN madde 3'te, ≥ % 70 kabul kuralıyla).
// - lifted_index (°C): yalnız GFS veriyor. Mobil serviste (/api/v1) ICON, UKMO, ARPEGE, GEM ve JMA için
//   modelin kendi yüzey ve basınç seviyesi verisinden hesaplanır (lib/convection.js; madde 3: GFS'in kendi
//   LI'siyle fark ortanca 0,4 °C). ECMWF'de hesaplanmaz: 9 km modelde basınç seviyesi yok, farklı
//   çözünürlükteki veriler birleştirilmez. Hesaplanan CIN şimdilik yok (17 Ekim kararı: bekliyor).
// Basınçta pressure_msl kullanılır: surface_pressure her modelin kendi yükselti haritasına
// bağlıdır, modeller arası karşılaştırmada rakım farkını basınç farkı gibi gösterir.
const HOURLY_VARS = [
  "temperature_2m",
  "precipitation_probability",
  "precipitation",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "relative_humidity_2m",
  "dew_point_2m",
  "pressure_msl",
  "cloud_cover",
  "cape",
  "apparent_temperature",
  "snowfall",
  "snow_depth",
  "convective_inhibition",
  "lifted_index",
  "visibility", // 30 Ekim (sis / pus): ECMWF, GFS, UKMO, ICON veriyor; ARPEGE, GEM, JMA null
];

// Basınç seviyesi verisi (yalnız mobil servis LI hesabı için istenir; web sayfası istemez)
const LEVEL_VARS = [
  "surface_pressure",
  ...PRESSURE_LEVELS.map((l) => `temperature_${l}hPa`),
  ...PRESSURE_LEVELS.map((l) => `relative_humidity_${l}hPa`),
];
const LI_CALC_MODELS = new Set(["icon_seamless", "ukmo_seamless", "meteofrance_seamless", "gem_seamless", "jma_gsm"]);

// CIN'i kullanılmayan modeller (karar V09 D1: UKMO işaret/tanım belirsiz → "verisi yok")
const CIN_EXCLUDED = new Set(["ukmo_seamless"]);

const PERIOD_TO_DAYS = { hourly: 2, "3d": 3, "7d": 7, "16d": 16 };
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat
const VALID_IDS = new Set(MODELS.map((m) => m.id));

// Basit in-memory cache. Not: serverless ortamlarda instance'lar arası paylaşılmaz,
// tek sunucu / uzun ömürlü process'te (örn. VPS, Docker) tam verim alınır.
// Ölçeklenirken Redis'e taşınabilir; arayüz (get/set) aynı kalır.
const cache = new Map();

export function defaultActiveModelIds() {
  return MODELS.filter((m) => m.defaultActive).map((m) => m.id);
}

export function resolveModelIds(ids) {
  const selected = (ids || []).filter((id) => VALID_IDS.has(id));
  const ordered = MODELS.filter((m) => selected.includes(m.id));
  return ordered.length ? ordered : MODELS.filter((m) => m.defaultActive);
}

function cacheKey(lat, lon, period, modelIds) {
  return `${lat.toFixed(2)},${lon.toFixed(2)},${period},${modelIds.slice().sort().join("+")},wx9`;
}

// --- Zaman normalizasyonu (TSİ) ---
// Open-Meteo saatleri ek/offset olmadan "YYYY-MM-DDTHH:mm" biçiminde döndürür. `&timezone=auto`
// ile istendiğinde bu saatler zaten konumun yerel saatidir (Türkiye: UTC+3, TSİ) ve olduğu gibi
// kullanılır. Yanıt yerel değil de UTC (veya başka bir dilim) ise, `utc_offset_seconds` kullanılarak
// saatler mutlaka TSİ'ye çevrilir. Böylece frontend her durumda TSİ duvar saati alır.
// Türkiye 2016'dan beri yaz/kış saati uygulamıyor: TSİ sabit UTC+3.
export const TSI_OFFSET_SECONDS = 3 * 3600;
export const TSI_TIMEZONE = "Europe/Istanbul";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toTsiTimes(times, utcOffsetSeconds) {
  const offset = Number.isFinite(utcOffsetSeconds) ? utcOffsetSeconds : 0;
  if (offset === TSI_OFFSET_SECONDS) return times; // zaten TSİ (timezone=auto, Türkiye)
  const shiftMs = (TSI_OFFSET_SECONDS - offset) * 1000;
  return times.map((t) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t || "");
    if (!m) return t;
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + shiftMs;
    const d = new Date(ms);
    return (
      `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` +
      `T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
    );
  });
}

function hourlyField(hourly, base, modelId) {
  return hourly[`${base}_${modelId}`] ?? hourly[base] ?? null;
}

// Hamle (ani rüzgar) tanım gereği 10 dakikalık ortalama hızdan küçük olamaz.
// Bazı modeller (ör. GFS) Open-Meteo üzerinden bunun tersini verebiliyor;
// böyle bir değer fiziksel olarak tutarsızdır, maskelenir ve kullanıcıya gösterilmez.
function maskGust(gust, speed) {
  if (gust == null) return null;
  if (speed != null && gust < speed) return null;
  return gust;
}

// Kar kalınlığı Open-Meteo'dan metre gelir; ekranlar cm kullanır (tek ondalık).
function metersToCm(v) {
  if (v == null || Number.isNaN(Number(v))) return null;
  return Math.round(Number(v) * 1000) / 10;
}

// Magnus-Tetens (WMO katsayıları). Modelin bağıl nemi yoksa sıcaklık + çiy noktasından
// hesaplanır; her ikisi de yoksa null döner.
function relativeHumidityFrom(tempC, dewC) {
  if (tempC == null || dewC == null) return null;
  const t = Number(tempC);
  const d = Number(dewC);
  if (Number.isNaN(t) || Number.isNaN(d)) return null;
  const A = 17.625;
  const B = 243.04;
  const rh = 100 * Math.exp((A * d) / (B + d) - (A * t) / (B + t));
  return Math.round(Math.max(0, Math.min(100, rh)) * 10) / 10;
}

// Web: periyot adıyla (hourly | 3d | 7d | 16d)
export async function getForecast(lat, lon, period, activeModelIds) {
  return fetchForecast(lat, lon, PERIOD_TO_DAYS[period] ?? 3, period, activeModelIds);
}

// Mobil servis (/api/v1): gün sayısıyla (1–16)
export const MAX_DAYS = 16;
// levels: true → basınç seviyeleri de istenir ve LI hesaplanır (yukarıdaki not)
export async function getForecastDays(lat, lon, days, activeModelIds, { levels = false } = {}) {
  const d = Math.max(1, Math.min(MAX_DAYS, Math.round(days) || 7));
  return fetchForecast(lat, lon, d, `${d}g`, activeModelIds, levels);
}

async function fetchForecast(lat, lon, days, period, activeModelIds, withLevels = false) {
  const selected = resolveModelIds(activeModelIds);
  const ids = selected.map((m) => m.id);
  const key = cacheKey(lat, lon, period, ids) + (withLevels ? "+lv" : "");
  const cached = cache.get(key);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    return { ...cached.data, cached: true };
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=${(withLevels ? HOURLY_VARS.concat(LEVEL_VARS) : HOURLY_VARS).join(",")}` +
    `&models=${ids.join(",")}` +
    `&forecast_days=${days}&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo hatası: ${res.status}`);
  const raw = await res.json();

  const data = normalize(raw, period, selected, withLevels);
  cache.set(key, { savedAt: Date.now(), data });
  return { ...data, cached: false };
}

// Modelin LI'si yoksa yüzey (2 m sıcaklık, çiy noktası, yüzey basıncı) ve basınç seviyelerinden hesaplanır
function calcLiftedIndex(hourly, modelId, temp, dewPoint, n) {
  const sp = hourlyField(hourly, "surface_pressure", modelId);
  const lt = PRESSURE_LEVELS.map((l) => hourlyField(hourly, `temperature_${l}hPa`, modelId));
  const lr = PRESSURE_LEVELS.map((l) => hourlyField(hourly, `relative_humidity_${l}hPa`, modelId));
  if (!sp || !dewPoint) return null;
  const out = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const levels = PRESSURE_LEVELS.map((p, k) => ({ p, t: lt[k] ? lt[k][i] ?? null : null, rh: lr[k] ? lr[k][i] ?? null : null }));
    const r = parcelIndices({ p: sp[i] ?? null, t: temp[i] ?? null, td: dewPoint[i] ?? null }, levels);
    out[i] = r ? r.li : null;
  }
  return out.some((v) => v != null) ? out : null;
}

function normalize(raw, period, selectedModels, withLevels = false) {
  const times = toTsiTimes(raw.hourly?.time || [], raw.utc_offset_seconds);
  const hourly = raw.hourly || {};
  // Gündüz / gece (31 Ekim): her saat için noktanın gün doğumu ve batımından (lib/sun.js); ay ikonu ve gökyüzü evresi
  const sunByDay = {};
  const isDay = times.map((t) => {
    const k = String(t).slice(0, 10);
    if (!(k in sunByDay)) sunByDay[k] = sunTimes(raw.latitude, raw.longitude, k);
    return isDayHour(+String(t).slice(11, 13), sunByDay[k]) ? 1 : 0;
  });
  const models = selectedModels
    .map((m) => {
      const temp = hourlyField(hourly, "temperature_2m", m.id);
      if (!temp) return null;
      const precip = hourlyField(hourly, "precipitation_probability", m.id);
      const precipAmount = hourlyField(hourly, "precipitation", m.id);
      const windSpeed = hourlyField(hourly, "wind_speed_10m", m.id);
      const windDir = hourlyField(hourly, "wind_direction_10m", m.id);
      const windGust = hourlyField(hourly, "wind_gusts_10m", m.id);
      const humidity = hourlyField(hourly, "relative_humidity_2m", m.id);
      const dewPoint = hourlyField(hourly, "dew_point_2m", m.id);
      const pressure = hourlyField(hourly, "pressure_msl", m.id);
      const cloud = hourlyField(hourly, "cloud_cover", m.id);
      const cape = hourlyField(hourly, "cape", m.id);
      const feels = hourlyField(hourly, "apparent_temperature", m.id);
      const snowfall = hourlyField(hourly, "snowfall", m.id);
      const snowDepth = hourlyField(hourly, "snow_depth", m.id);
      const visibility = hourlyField(hourly, "visibility", m.id);
      const cin = CIN_EXCLUDED.has(m.id) ? null : hourlyField(hourly, "convective_inhibition", m.id);
      const ownLi = hourlyField(hourly, "lifted_index", m.id);
      const hasOwnLi = ownLi && ownLi.some((v) => v != null);
      const calcLi =
        withLevels && !hasOwnLi && LI_CALC_MODELS.has(m.id)
          ? calcLiftedIndex(hourly, m.id, temp, dewPoint, times.length)
          : null;
      const li = hasOwnLi ? ownLi : calcLi;
      return {
        id: m.id,
        label: m.label,
        color: m.color,
        dashed: m.dashed,
        calculated: calcLi ? ["lifted_index"] : [],
        series: times.map((t, i) => ({
          time: t,
          temp: temp[i] ?? null,
          precip_prob: precip ? precip[i] ?? null : null,
          precip_amount: precipAmount ? precipAmount[i] ?? null : null,
          wind_speed: windSpeed ? windSpeed[i] ?? null : null,
          wind_direction: windDir ? windDir[i] ?? null : null,
          wind_gust: maskGust(windGust ? windGust[i] ?? null : null, windSpeed ? windSpeed[i] ?? null : null),
          humidity: humidity && humidity[i] != null
            ? humidity[i]
            : relativeHumidityFrom(temp[i] ?? null, dewPoint ? dewPoint[i] ?? null : null),
          dew_point: dewPoint ? dewPoint[i] ?? null : null,
          pressure: pressure ? pressure[i] ?? null : null,
          cloud_cover: cloud ? cloud[i] ?? null : null,
          cape: cape ? cape[i] ?? null : null,
          feels_like: feels ? feels[i] ?? null : null,
          snowfall: snowfall ? snowfall[i] ?? null : null,
          snow_depth: snowDepth ? metersToCm(snowDepth[i]) : null,
          visibility: visibility ? visibility[i] ?? null : null, // m
          is_day: isDay[i], // 1 gündüz · 0 gece (gün doğumu − 30 dk ile gün batımı + 30 dk arası gündüz)
          cin: cin ? cin[i] ?? null : null,
          lifted_index: li ? li[i] ?? null : null,
        })),
      };
    })
    .filter(Boolean);

  return {
    period,
    timezone: TSI_TIMEZONE,
    generated_at: new Date().toISOString(),
    models,
  };
}
