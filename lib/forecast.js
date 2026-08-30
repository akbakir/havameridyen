// Backend'in kalbi: Open-Meteo'dan çekilen ham veriyi normalize eder ve cache'ler.
// İleride veri kaynağı değişirse (kendi model pipeline'ına geçilirse) sadece bu dosya değişir.

export const MODELS = [
  { id: "ecmwf_ifs025", label: "ECMWF", color: "#D98E2B", dashed: false, defaultActive: true },
  { id: "gfs_seamless", label: "GFS", color: "#1E7A6B", dashed: false, defaultActive: true },
  { id: "icon_seamless", label: "ICON", color: "#2C4A6E", dashed: true, defaultActive: true },
  { id: "ukmo_seamless", label: "UKMO", color: "#4F6B7A", dashed: false, defaultActive: true },
  { id: "meteofrance_seamless", label: "ARPEGE", color: "#7A6C4F", dashed: true, defaultActive: true },
  { id: "gem_seamless", label: "GEM", color: "#B4553B", dashed: false, defaultActive: false },
  { id: "jma_gsm", label: "JMA", color: "#8A6FA3", dashed: true, defaultActive: false },
  { id: "knmi_seamless", label: "KNMI", color: "#5C8A5C", dashed: false, defaultActive: false },
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
  return `${lat.toFixed(2)},${lon.toFixed(2)},${period},${modelIds.slice().sort().join("+")},wx3`;
}

function hourlyField(hourly, base, modelId) {
  return hourly[`${base}_${modelId}`] ?? hourly[base] ?? null;
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
    `&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m` +
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
  const times = raw.hourly?.time || [];
  const hourly = raw.hourly || {};
  const models = selectedModels
    .map((m) => {
      const temp = hourlyField(hourly, "temperature_2m", m.id);
      if (!temp) return null;
      const precip = hourlyField(hourly, "precipitation_probability", m.id);
      const precipAmount = hourlyField(hourly, "precipitation", m.id);
      const windSpeed = hourlyField(hourly, "wind_speed_10m", m.id);
      const windDir = hourlyField(hourly, "wind_direction_10m", m.id);
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
    })
    .filter(Boolean);

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
