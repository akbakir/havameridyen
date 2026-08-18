// Backend'in kalbi: Open-Meteo'dan çekilen ham veriyi normalize eder ve cache'ler.
// İleride veri kaynağı değişirse (kendi model pipeline'ına geçilirse) sadece bu dosya değişir.

export const MODELS = [
  { id: "ecmwf_ifs025", label: "ECMWF", color: "#D98E2B", dashed: false },
  { id: "gfs_seamless", label: "GFS", color: "#1E7A6B", dashed: false },
  { id: "icon_seamless", label: "ICON", color: "#2C4A6E", dashed: true },
  { id: "gem_seamless", label: "GEM", color: "#B4553B", dashed: true },
];

const PERIOD_TO_DAYS = { hourly: 2, "3d": 3, "7d": 7, "16d": 16 };
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat

// Basit in-memory cache. Not: serverless ortamlarda instance'lar arası paylaşılmaz,
// tek sunucu / uzun ömürlü process'te (örn. VPS, Docker) tam verim alınır.
// Ölçeklenirken Redis'e taşınabilir; arayüz (get/set) aynı kalır.
const cache = new Map();

function cacheKey(lat, lon, period) {
  return `${lat.toFixed(2)},${lon.toFixed(2)},${period},wx2`;
}

export async function getForecast(lat, lon, period) {
  const key = cacheKey(lat, lon, period);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    return { ...cached.data, cached: true };
  }

  const days = PERIOD_TO_DAYS[period] ?? 3;
  const modelParam = MODELS.map((m) => m.id).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m` +
    `&models=${modelParam}` +
    `&forecast_days=${days}&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo hatası: ${res.status}`);
  const raw = await res.json();

  const data = normalize(raw, period);
  cache.set(key, { savedAt: Date.now(), data });
  return { ...data, cached: false };
}

function normalize(raw, period) {
  const times = raw.hourly.time;
  const models = MODELS.map((m) => {
    const temp = raw.hourly[`temperature_2m_${m.id}`];
    const precip = raw.hourly[`precipitation_probability_${m.id}`];
    const precipAmount = raw.hourly[`precipitation_${m.id}`];
    const windSpeed = raw.hourly[`wind_speed_10m_${m.id}`];
    const windDir = raw.hourly[`wind_direction_10m_${m.id}`];
    if (!temp) return null;
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
      })),
    };
  }).filter(Boolean);

  const agreement = computeAgreement(models);

  return { period, generated_at: new Date().toISOString(), models, agreement };
}

function computeAgreement(models) {
  const n = 24;
  let agree = 0;
  const total = models.length;
  models.forEach((m) => {
    const window = m.series.slice(0, n).map((s) => s.precip_prob ?? 0);
    const avg = window.reduce((a, b) => a + b, 0) / (window.length || 1);
    if (avg > 30) agree++;
  });
  return {
    metric: "precip_24h",
    agree_count: agree,
    total_count: total,
    agree_pct: total ? Math.round((agree / total) * 100) : 0,
  };
}
