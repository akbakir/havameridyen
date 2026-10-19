// Sunucu istemcisi. Uygulama Open-Meteo'yu doğrudan çağırmaz; bütün istekler havameridyen sunucusundan ve
// önbelleğinden geçer (/api/v1). Geliştirmede (npm run dev) istekler Vite üzerinden yerel Next sunucusuna
// aktarılır (vite.config.js).

import { MODELS } from "@lib/forecast";

export const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "" : "https://www.havameridyen.com");
export const ALL_MODEL_IDS = MODELS.map((m) => m.id);
export const FORECAST_DAYS = 7;

const memo = new Map(); // aynı oturumda 10 dakika
const TTL = 10 * 60 * 1000;

async function getJson(path) {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const r = await fetch(API_BASE + path);
  if (!r.ok) throw new Error(`${r.status}`);
  const data = await r.json();
  memo.set(path, { at: Date.now(), data });
  return data;
}

// Sunucunun kanonik adresiyle aynı yazım (koordinat 2 ondalık, modeller sabit sırada): yönlendirme (308)
// olmadan doğrudan CDN önbelleğine düşer.
export function forecastPath(lat, lon, days = FORECAST_DAYS, ids = ALL_MODEL_IDS) {
  const order = ALL_MODEL_IDS.filter((id) => ids.includes(id));
  return `/api/v1/forecast?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&days=${days}&models=${order.join(",")}`;
}

// Bütün modeller bir kerede istenir; model seçimi ve ortanca + uyum uygulamada hesaplanır (lib/consensus.js).
export const fetchForecast = (lat, lon) => getJson(forecastPath(lat, lon));

// Favori kartı: yalnız ECMWF, bugün
export const fetchFavorite = (lat, lon) => getJson(forecastPath(lat, lon, 1, ["ecmwf_ifs"]));

export async function searchLocations(q) {
  const d = await getJson(`/api/v1/locations?q=${encodeURIComponent(q.trim())}`);
  return d.results || [];
}
