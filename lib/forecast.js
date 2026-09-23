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
];

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
  return `${lat.toFixed(2)},${lon.toFixed(2)},${period},${modelIds.slice().sort().join("+")},wx7`;
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

export async function getForecast(lat, lon, period, activeModelIds) {
  const selected = resolveModelIds(activeModelIds);
  const ids = selected.map((m) => m.id);
  const key = cacheKey(lat, lon, period, ids);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    return { ...cached.data, cached: true };
  }

  const days = PERIOD_TO_DAYS[period] ?? 3;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=${HOURLY_VARS.join(",")}` +
    `&models=${ids.join(",")}` +
    `&forecast_days=${days}&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo hatası: ${res.status}`);
  const raw = await res.json();

  const data = normalize(raw, period, selected);
  cache.set(key, { savedAt: Date.now(), data });
  return { ...data, cached: false };
}

function normalize(raw, period, selectedModels) {
  const times = toTsiTimes(raw.hourly?.time || [], raw.utc_offset_seconds);
  const hourly = raw.hourly || {};
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
      return {
        id: m.id,
        label: m.label,
        color: m.color,
        dashed: m.dashed,
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
