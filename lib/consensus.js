// Modellerin ortak özeti (/api/v1 için; sunucu madde 2b, Ekim 2026).
// Mobil Sayfa 1'deki değerler: her parametrede seçili modellerin ORTANCASI ve uyum oranı. Kurallar
// lib/agreement.js'ten gelir; burada yalnız saat ve gün bazında toplanır. Widget ve uyarılar da bunu kullanır.

import {
  bandAgreement,
  CLASS_ICON,
  cloudClass,
  COND_CLASSES,
  condAt,
  condRank,
  consensusCond,
  dirMean,
  groupDays,
  levelOf,
  median,
  midClass,
  numOrNull,
  KN_PER_KMH,
  RAIN_DAY_DEFAULT,
  thresholdAgreement,
  windBandAgreement,
} from "./agreement";

// Sayfa 1 eşikleri
export const BANDS = { temp: 2, feels_like: 2, humidity: 10, snow_depth: 5 }; // °C, °C, puan, cm
export const HOUR_PRECIP = 0.1; // mm — o saat yağış veriyor
export const HOUR_SNOW = 0.1; // cm — o saat kar veriyor
export const DAY_MIN_HOURS = 12; // günlük min / maks / toplam için gereken en az saat

const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

// { v, level, in, n } — v ortanca (tek ondalık), level ok (hemfikir) / partial (kısmen) / split (ayrışıyor) /
// na (karşılaştıracak model yok)
function pack(v, ag) {
  return { v: r1(v), level: levelOf(ag.pct), in: ag.in, n: ag.n };
}

// Eşik kuralı (yağış, kar): uyum = eşiği aşan modellerin oranı (V04 P2). Hiçbir model aşmıyorsa
// level "none": uygulamada o satır gösterilmez (ör. "yağış yok").
function packThreshold(v, ag) {
  return { v: r1(v), level: ag.n >= 2 && ag.in === 0 ? "none" : levelOf(ag.pct), in: ag.in, n: ag.n };
}

function col(models, i, key) {
  return models.map((m) => numOrNull(m.series[i]?.[key]));
}

function hourly(models, i) {
  const cond = consensusCond(models, i);
  const temp = col(models, i, "temp");
  const feels = col(models, i, "feels_like");
  const hum = col(models, i, "humidity");
  const pr = col(models, i, "precip_amount");
  const sf = col(models, i, "snowfall");
  const sd = col(models, i, "snow_depth");
  const ws = col(models, i, "wind_speed");
  const wd = models.map((m, k) => {
    const s = ws[k];
    return s != null && s * KN_PER_KMH >= 3 ? numOrNull(m.series[i]?.wind_direction) : null;
  });
  const gust = col(models, i, "wind_gust").filter((v) => v != null);
  return {
    cond: cond
      ? { text: cond.text, ic: cond.ic, wet: cond.wet, snow: !!cond.snow, level: levelOf(cond.agree.pct), in: cond.agree.in, n: cond.agree.n }
      : null,
    temp: pack(median(temp), bandAgreement(temp, BANDS.temp)),
    feels_like: pack(median(feels), bandAgreement(feels, BANDS.feels_like)),
    humidity: pack(median(hum), bandAgreement(hum, BANDS.humidity)),
    precip: packThreshold(median(pr), thresholdAgreement(pr, HOUR_PRECIP)),
    snowfall: packThreshold(median(sf), thresholdAgreement(sf, HOUR_SNOW)),
    snow_depth: pack(median(sd), bandAgreement(sd, BANDS.snow_depth)),
    wind: {
      ...pack(median(ws), windBandAgreement(models, i)),
      dir: r1(dirMean(wd)),
    },
    gust: { v: r1(median(gust)), n: gust.length },
  };
}

// Modelin günlük değeri: en az DAY_MIN_HOURS saat verisi varsa
function dayValue(m, day, key, fn) {
  const a = [];
  for (let i = day.h0; i < day.h1; i++) {
    const v = numOrNull(m.series[i]?.[key]);
    if (v != null) a.push(v);
  }
  return a.length >= DAY_MIN_HOURS ? fn(a) : null;
}
const sum = (a) => a.reduce((s, v) => s + v, 0);

// Günün ortak durumu (widget; Ali Kemal kararı 25 Ekim): önce her modelin kendi günü, sonra modeller.
// - Model günü: günün herhangi bir saatinde (00–24) miktar bırakan yağış (condAt yağış: gün ≥ 0,2 mm ve saat ≥ 0,1 mm)
//   varsa yağışlı; türü o modelin en etkili yağış saati. Yağış yoksa 07:00–20:59 saatlerinin en kapalı bulut sınıfı.
// - Gün: modellerin en az yarısının günü yağışlıysa yağış. Tür ayrımı yapılmaz (yağmur, sağanak, kar, gök gürültülü
//   tek aile); ikon yağışlı modellerin en etkili türü, uyum yağışlı model oranı. Değilse modellerin gün bulut
//   sınıflarının ortancası; uyum o sınıftaki yağışsız modellerin oranı.
// - Gündüzün (07–21) en az yarısında verisi olmayan model sayılmaz. 3/6/12 saatlik dilimler bu kuralı kullanmaz.
export const DAY_COND_H0 = 7;
export const DAY_COND_H1 = 21;
const hourOfT = (t) => +String(t || "").slice(11, 13);

// Bir zaman penceresinin ortak durumu (gün ve 3 saatlik dilim aynı kural): önce her modelin penceresi, sonra modeller.
// dryHour(h): yağışsız modelin bulut sınıfına giren saatler · minSeen: modelin sayılması için bu saatlerde gereken
// en az veri · nightHour: yağışsız ikonun gece (ay) biçimi için bakılacak saat (gün için null).
function windowCond(models, i0, i1, dryHour, minSeen, nightHour) {
  const per = [];
  for (const m of models) {
    let wet = null;
    let cls = null;
    let seen = 0;
    for (let i = i0; i < i1; i++) {
      const c = condAt(m, i);
      if (!c) continue;
      if (c.wet && (!wet || condRank(c) > condRank(wet))) wet = { ...c, i };
      if (dryHour(hourOfT(m.series[i]?.time))) {
        seen++;
        const k = cloudClass(numOrNull(m.series[i]?.cloud_cover));
        if (cls == null || k > cls) cls = k;
      }
    }
    if (seen < minSeen) continue;
    per.push({ wet, cls });
  }
  if (!per.length) return null;
  const n = per.length;
  const lv = (inn) => levelOf(n < 2 ? null : inn / n);
  const wets = per.filter((p) => p.wet);
  if (wets.length >= n / 2) {
    const best = wets.reduce((b, p) => (!b || condRank(p.wet) > condRank(b) ? p.wet : b), null);
    const at = models.find((m) => m.series[best.i])?.series[best.i]?.time;
    return {
      text: best.text,
      ic: best.ic,
      wet: true,
      snow: !!best.snow,
      level: lv(wets.length),
      in: wets.length,
      n,
      at: String(at || "").slice(11, 16),
    };
  }
  const k = midClass(per.map((p) => p.cls));
  const inn = per.filter((p) => !p.wet && p.cls === k).length;
  const night = nightHour != null && (nightHour < 6 || nightHour >= 20);
  return {
    text: COND_CLASSES[k],
    ic: CLASS_ICON[k] + (night && k < 3 ? "N" : ""),
    wet: false,
    snow: false,
    level: lv(inn),
    in: inn,
    n,
    at: null,
  };
}

function dayCond(models, day) {
  return windowCond(models, day.h0, day.h1, (h) => h >= DAY_COND_H0 && h < DAY_COND_H1, (DAY_COND_H1 - DAY_COND_H0) / 2, null);
}

// 3 saatlik dilimler (00, 03, … 21 TSİ; widget saat dilimleri, 25 Ekim): durum gün kuralıyla aynı (pencere 3 saat,
// yağışsız modelde 3 saatin en kapalı bulut sınıfı), yağış = modellerin 3 saatlik toplamlarının ortancası.
function slots3(models, times) {
  const out = [];
  for (let i0 = 0; i0 < times.length; i0++) {
    if (hourOfT(times[i0]) % 3) continue;
    const i1 = Math.min(i0 + 3, times.length);
    const tot = models.map((m) => {
      const a = [];
      for (let i = i0; i < i1; i++) {
        const v = numOrNull(m.series[i]?.precip_amount);
        if (v != null) a.push(v);
      }
      return a.length >= 2 ? sum(a) : null;
    });
    out.push({
      start: times[i0],
      cond: windowCond(models, i0, i1, () => true, 2, hourOfT(times[Math.min(i0 + 1, i1 - 1)])),
      precip: packThreshold(median(tot), thresholdAgreement(tot, HOUR_PRECIP)),
    });
  }
  return out;
}

// "Hafif" (Ali Kemal, 26 Ekim): yalnız günün ifadesinde; günün ortanca toplam yağışı ≤ 0,5 mm ise Yağmurlu → Hafif Yağmurlu,
// Sağanak Yağış → Hafif Sağanak Yağış (ikon rainL / showerL: damlası az). Kar ve gök gürültülü türlerde kullanılmaz.
export const LIGHT_DAY_MM = 0.5;
function lightDay(cond, mm) {
  if (!cond || !cond.wet || mm == null || mm > LIGHT_DAY_MM + 1e-9) return cond;
  if (cond.ic !== "rain" && cond.ic !== "shower") return cond;
  return { ...cond, ic: cond.ic + "L", text: "Hafif " + cond.text, light: true };
}

function daily(models, day) {
  const mins = models.map((m) => dayValue(m, day, "temp", (a) => Math.min(...a)));
  const maxs = models.map((m) => dayValue(m, day, "temp", (a) => Math.max(...a)));
  const tot = models.map((m) => dayValue(m, day, "precip_amount", sum));
  const snow = models.map((m) => dayValue(m, day, "snowfall", sum));
  const gust = models.map((m) => dayValue(m, day, "wind_gust", (a) => Math.max(...a)));
  const precip_total = packThreshold(median(tot), thresholdAgreement(tot, RAIN_DAY_DEFAULT));
  return {
    date: day.key,
    cond: lightDay(dayCond(models, day), precip_total.v),
    temp_min: pack(median(mins), bandAgreement(mins, BANDS.temp)),
    temp_max: pack(median(maxs), bandAgreement(maxs, BANDS.temp)),
    precip_total,
    snowfall_total: packThreshold(median(snow), thresholdAgreement(snow, HOUR_SNOW)),
    gust_max: { v: r1(median(gust)), n: gust.filter((v) => v != null).length },
  };
}

export function buildConsensus(models) {
  if (!models.length) return { hourly: [], daily: [], slots3: [] };
  const times = models[0].series.map((s) => s.time);
  return {
    hourly: times.map((_, i) => hourly(models, i)),
    daily: groupDays(times).map((d) => daily(models, d)),
    slots3: slots3(models, times),
  };
}
