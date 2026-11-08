// Open-Meteo kullanım sayacı (8 Kas 2026, Ali Kemal). Sunucunun Open-Meteo'ya attığı her istek, Open-Meteo'nun kendi
// "API çağrısı" ağırlığıyla günlük toplama eklenir; ücretsiz katman sınırları (10 000 / gün, 300 000 / ay) bununla
// izlenir. Sayaç Upstash Redis'te (Vercel Storage, Frankfurt): KV_REST_API_URL ve KV_REST_API_TOKEN yoksa (yerel
// geliştirme) sessizce kapalıdır; sayaç hatası tahmini asla bozmaz.
//
// Ağırlık (open-meteo.com/en/pricing hesaplayıcısıyla doğrulandı): max(1, değişken / 10) × max(1, gün / 14) × model
// sayısı × konum sayısı. Ör. 17 değişken · 16 gün · 8 model = 15,5 çağrı; 17 · 16 · 5 = 9,7.

import { Redis } from "@upstash/redis";

export const FREE_DAY = 10000;
export const FREE_MONTH = 300000;
const KEEP_DAYS = 40; // anahtarlar 40 gün sonra kendiliğinden silinir

let redis = null;
function client() {
  if (redis) return redis;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

// TSİ takvim günü (YYYY-MM-DD)
export function tsiDate(d = new Date()) {
  return new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 10);
}

const listLen = (s) => (s ? String(s).split(",").filter(Boolean).length : 0);

// Bir Open-Meteo adresinin çağrı ağırlığı
export function callWeight(url) {
  let q;
  try {
    q = new URL(url).searchParams;
  } catch {
    return 1;
  }
  const vars = listLen(q.get("hourly")) + listLen(q.get("daily")) + listLen(q.get("current")) + listLen(q.get("minutely_15"));
  let days = Number(q.get("forecast_days")) || 0;
  if (!days && q.get("start_date") && q.get("end_date")) {
    days = (Date.parse(q.get("end_date")) - Date.parse(q.get("start_date"))) / 864e5 + 1;
  }
  if (!days) days = 7; // Open-Meteo varsayılanı
  const models = Math.max(1, listLen(q.get("models")));
  const locs = Math.max(1, listLen(q.get("latitude")));
  return Math.max(1, vars / 10) * Math.max(1, days / 14) * models * locs;
}

// Bir isteği say. kind: "forecast" | "li" | "geocoding" …; place: "40.77,29.94" (en çok istenen konumlar için)
export async function countCall(url, kind = "forecast", place = null) {
  const r = client();
  if (!r) return;
  const day = tsiDate();
  const w = Math.round(callWeight(url) * 100) / 100;
  try {
    const p = r.pipeline();
    p.incrbyfloat(`om:calls:${day}`, w);
    p.incr(`om:req:${day}`);
    p.hincrbyfloat(`om:kind:${day}`, kind, w);
    if (place) p.zincrby(`om:loc:${day}`, 1, place);
    for (const k of [`om:calls:${day}`, `om:req:${day}`, `om:kind:${day}`, `om:loc:${day}`]) p.expire(k, KEEP_DAYS * 86400);
    // Sayaç tahmini geciktirmesin: en çok 400 ms beklenir
    await Promise.race([p.exec(), new Promise((res) => setTimeout(res, 400))]);
  } catch {
    // sayaç kapalı ya da ulaşılamıyor: yoksay
  }
}

// Son n günün özeti (en yeni önce)
export async function usageSummary(n = 30) {
  const r = client();
  if (!r) return null;
  const days = [];
  const now = Date.now();
  for (let k = 0; k < n; k++) days.push(tsiDate(new Date(now - k * 864e5)));
  const p = r.pipeline();
  for (const d of days) {
    p.get(`om:calls:${d}`);
    p.get(`om:req:${d}`);
    p.hgetall(`om:kind:${d}`);
  }
  const res = await p.exec();
  const rows = days.map((d, k) => ({
    date: d,
    calls: Math.round((Number(res[3 * k]) || 0) * 10) / 10,
    requests: Number(res[3 * k + 1]) || 0,
    kinds: res[3 * k + 2] || {},
  }));
  const month = days[0].slice(0, 7);
  const monthCalls = rows.filter((x) => x.date.startsWith(month)).reduce((s, x) => s + x.calls, 0);
  const top = await r.zrange(`om:loc:${days[0]}`, 0, 9, { rev: true, withScores: true });
  const topToday = [];
  for (let k = 0; k < top.length; k += 2) topToday.push({ place: top[k], requests: Number(top[k + 1]) });
  return {
    limits: { day: FREE_DAY, month: FREE_MONTH },
    today: { ...rows[0], pctOfDay: Math.round((rows[0].calls / FREE_DAY) * 1000) / 10 },
    month: { month, calls: Math.round(monthCalls * 10) / 10, pctOfMonth: Math.round((monthCalls / FREE_MONTH) * 1000) / 10 },
    days: rows,
    topToday,
  };
}
