// Sunucu istemcisi. Uygulama Open-Meteo'yu doğrudan çağırmaz; bütün istekler havameridyen sunucusundan ve
// önbelleğinden geçer (/api/v1). Geliştirmede (npm run dev) istekler Vite üzerinden yerel Next sunucusuna
// aktarılır (vite.config.js).

import { MODELS } from "@lib/forecast";

export const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "" : "https://www.havameridyen.com");
export const ALL_MODEL_IDS = MODELS.map((m) => m.id);
export const FORECAST_DAYS = 16; // 29 Ekim (Ali Kemal: "16 GÜNE UZATALIM"): Saatlik ve Modeller de 16 gün

const memo = new Map(); // aynı oturumda 10 dakika
const TTL = 10 * 60 * 1000;

// Aynı adres aynı anda iki kez istenirse tek istek gider (29 Ekim: Saatlik de 16 gün olunca günlük sayfanın
// 16 günlük isteğiyle aynı adres)
async function getJson(path) {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = fetch(API_BASE + path).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });
  memo.set(path, { at: Date.now(), p });
  p.catch(() => memo.delete(path));
  return p;
}

// Sunucunun kanonik adresiyle aynı yazım (koordinat 2 ondalık, modeller sabit sırada): yönlendirme (308)
// olmadan doğrudan CDN önbelleğine düşer.
export function forecastPath(lat, lon, days = FORECAST_DAYS, ids = ALL_MODEL_IDS) {
  const order = ALL_MODEL_IDS.filter((id) => ids.includes(id));
  return `/api/v1/forecast?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&days=${days}&models=${order.join(",")}`;
}

// Bütün modeller bir kerede istenir; model seçimi ve ortanca + uyum uygulamada hesaplanır (lib/consensus.js).
export const fetchForecast = (lat, lon) => getJson(forecastPath(lat, lon));

// Sayfa 3 "16 gün": yalnız o görünüm açılınca, bütün modeller 16 gün
export const fetchForecast16 = (lat, lon) => getJson(forecastPath(lat, lon, 16));

// Favori kartı: beş modelin ortak tahmini (site favorileri ve widget'la aynı adres: 5 gün, varsayılan 5 model)
export const FAV_MODEL_IDS = ["ecmwf_ifs", "gfs_seamless", "icon_seamless", "ukmo_seamless", "meteofrance_seamless"];
export const fetchFavorite = (lat, lon) => getJson(forecastPath(lat, lon, 5, FAV_MODEL_IDS));

export async function searchLocations(q) {
  const d = await getJson(`/api/v1/locations?q=${encodeURIComponent(q.trim())}`);
  return d.results || [];
}

// "Konumumu kullan": koordinattan ilçe / il adı (sunucu /api/v1/reverse, OpenStreetMap). 5 sn içinde gelmezse null.
export async function reverseName(lat, lon) {
  try {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), 5000);
    const r = await fetch(`${API_BASE}/api/v1/reverse?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`, ctl ? { signal: ctl.signal } : undefined);
    clearTimeout(t);
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.name ? { name: d.name, admin1: d.admin1 || null } : null;
  } catch {
    return null;
  }
}
