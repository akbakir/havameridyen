// /api/v1 yanıtını web'in model biçimine çevirir ({ id, label, color, series: [{ time, temp, precip_amount, … }] });
// böylece durum ifadesi, ortanca ve uyum kuralları web ile aynı dosyadan (lib/agreement.js, lib/consensus.js) gelir.

import { groupDays, numOrNull } from "@lib/agreement";

// API alan adı → web seri alanı
const FIELDS = [
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
];

export function toModels(resp) {
  const time = resp.time || [];
  return (resp.models || []).map((m) => {
    const series = time.map((t, i) => {
      const s = { time: t };
      for (const [api, key] of FIELDS) s[key] = m.hourly?.[api]?.[i] ?? null;
      return s;
    });
    let hz = 0;
    series.forEach((s, i) => {
      if (s.temp != null) hz = i + 1;
    });
    return { id: m.id, label: m.label, color: m.color, calculated: m.calculated || [], series, hz };
  });
}

export const val = (m, key, i) => numOrNull(m?.series[i]?.[key]);

// Hamle ortalama rüzgardan düşükse gösterilmez (23 Eylül kararı)
export function gust(m, i) {
  const g = val(m, "wind_gust", i);
  const w = val(m, "wind_speed", i);
  return g == null || (w != null && g < w) ? null : g;
}

export const daysOf = (times) => groupDays(times);
export const dayIndexOf = (days, i) => Math.max(0, days.findIndex((d) => i >= d.h0 && i < d.h1));

export function dayVals(m, key, day) {
  const a = [];
  for (let i = day.h0; i < day.h1; i++) {
    const v = val(m, key, i);
    if (v != null) a.push(v);
  }
  return a;
}
const sum = (a) => a.reduce((s, v) => s + v, 0);

// Günlük değerler en az 12 saat veriyle (web ve /api/v1 ile aynı)
export const dayMin = (m, day) => {
  const a = dayVals(m, "temp", day);
  return a.length >= 12 ? Math.min(...a) : null;
};
export const dayMax = (m, day) => {
  const a = dayVals(m, "temp", day);
  return a.length >= 12 ? Math.max(...a) : null;
};
export const dayTotal = (m, day) => {
  const a = dayVals(m, "precip_amount", day);
  return a.length >= 12 ? sum(a) : null;
};
export const daySnow = (m, day) => {
  const a = dayVals(m, "snowfall", day);
  return a.length ? sum(a) : null;
};
export function hasSnowDay(m, day) {
  for (let i = day.h0; i < day.h1; i++) {
    const s = val(m, "snowfall", i);
    const sd = val(m, "snow_depth", i);
    if ((s != null && s >= 0.05) || (sd != null && sd >= 0.05)) return true;
  }
  return false;
}

// Son 12 saatin toplam yağışı (MGM şiddet sınıfı için)
export function sum12(m, i, key = "precip_amount") {
  let s = 0;
  let c = 0;
  for (let j = Math.max(0, i - 11); j <= i; j++) {
    const v = val(m, key, j);
    if (v != null) {
      s += v;
      c++;
    }
  }
  return c ? s : null;
}

// Kararsızlık verisinin kaynağı: own (modelin kendi değeri) · calc (sunucuda hesaplanan) · no (yok)
export function sourceOf(m, key) {
  if (m.calculated.includes(key)) return "calc";
  return m.series.some((s) => s[key] != null) ? "own" : "no";
}

export function nowIndex(times, nowHour) {
  const i = times.findIndex((t) => t.slice(0, 13) === nowHour);
  if (i >= 0) return i;
  return times.length && nowHour > times[times.length - 1] ? times.length - 1 : 0;
}

export const avg = (a) => (a.length ? sum(a) / a.length : null);

// Hakim rüzgar yönü (Sayfa 2): 8 yöne sayım, 2 km/s altı sayılmaz; en sık yön saatlerin % 40'ına ulaşmazsa
// "VRB" (değişken yön)
export const DIR8 = ["K", "KD", "D", "GD", "G", "GB", "B", "KB"];
export function hakim(m, day) {
  const cnt = new Array(8).fill(0);
  let tot = 0;
  for (let i = day.h0; i < day.h1; i++) {
    const w = val(m, "wind_speed", i);
    const d = val(m, "wind_direction", i);
    if (w == null || d == null || w < 2) continue;
    cnt[Math.round(d / 45) % 8]++;
    tot++;
  }
  if (!tot) return { txt: "VRB", vrb: true, deg: null };
  const mx = Math.max(...cnt);
  const k = cnt.indexOf(mx);
  return mx / tot >= 0.4 ? { txt: DIR8[k], vrb: false, deg: k * 45 } : { txt: "VRB", vrb: true, deg: null };
}

// Günün en yüksek hamlesi ve saati (indeks)
export function dayGust(m, day) {
  let g = null;
  let at = null;
  for (let i = day.h0; i < day.h1; i++) {
    const v = gust(m, i);
    if (v != null && (g == null || v > g)) {
      g = v;
      at = i;
    }
  }
  return { g, i: at };
}

// Günde en az bir saat verisi var mı (Sayfa 2 kartı)
export const hasDay = (m, day) => dayVals(m, "temp", day).length > 0;
