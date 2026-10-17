// Modellerin ortak özeti (/api/v1 için; sunucu madde 2b, Ekim 2026).
// Mobil Sayfa 1'deki değerler: her parametrede seçili modellerin ORTANCASI ve uyum oranı. Kurallar
// lib/agreement.js'ten gelir; burada yalnız saat ve gün bazında toplanır. Widget ve uyarılar da bunu kullanır.

import {
  bandAgreement,
  consensusCond,
  dirMean,
  groupDays,
  levelOf,
  median,
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
      ? { text: cond.text, ic: cond.ic, wet: cond.wet, level: levelOf(cond.agree.pct), in: cond.agree.in, n: cond.agree.n }
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

function daily(models, day) {
  const mins = models.map((m) => dayValue(m, day, "temp", (a) => Math.min(...a)));
  const maxs = models.map((m) => dayValue(m, day, "temp", (a) => Math.max(...a)));
  const tot = models.map((m) => dayValue(m, day, "precip_amount", sum));
  const snow = models.map((m) => dayValue(m, day, "snowfall", sum));
  const gust = models.map((m) => dayValue(m, day, "wind_gust", (a) => Math.max(...a)));
  return {
    date: day.key,
    temp_min: pack(median(mins), bandAgreement(mins, BANDS.temp)),
    temp_max: pack(median(maxs), bandAgreement(maxs, BANDS.temp)),
    precip_total: packThreshold(median(tot), thresholdAgreement(tot, RAIN_DAY_DEFAULT)),
    snowfall_total: packThreshold(median(snow), thresholdAgreement(snow, HOUR_SNOW)),
    gust_max: { v: r1(median(gust)), n: gust.filter((v) => v != null).length },
  };
}

export function buildConsensus(models) {
  if (!models.length) return { hourly: [], daily: [] };
  const times = models[0].series.map((s) => s.time);
  return {
    hourly: times.map((_, i) => hourly(models, i)),
    daily: groupDays(times).map((d) => daily(models, d)),
  };
}
