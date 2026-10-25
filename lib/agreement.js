// Uyum, durum ifadesi ve eğilim kuralları — tek kaynak (sunucu aşaması, madde 2a, Ekim 2026).
// Web grafikleri (components/*) ve mobil veri servisi (/api/v1) bu dosyadaki kuralları kullanır;
// bir kural değişince yalnız burası değişir. Bu dosyada çizim / renk / metin yok, yalnız hesap var.
//
// Veri biçimi: models = [{ id, label, series: [{ time, temp, precip_amount, wind_speed, ... }] }]
// (lib/forecast.js normalize çıktısı). Saat sırası i, tüm modellerde aynı zamana karşılık gelir.

// --- ortak yardımcılar ---
export function numOrNull(v) {
  return v != null && !Number.isNaN(Number(v)) ? Number(v) : null;
}

// Sayısal ortanca (çift sayıda değerde ortadaki ikisinin ortalaması)
export function median(values) {
  const s = values.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  const n = s.length;
  if (!n) return null;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// Ortanca sınıf: sıralı sınıflardan ortadaki (çift sayıda modelde üstteki). Ortalama alınmaz, böylece her
// zaman en az bir modelin sınıfı seçilir (hiçbir modelin bulunmadığı sınıfa düşülmez).
export function midClass(classes) {
  const s = classes.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Oran → seviye: % 75 ve üstü hemfikir, % 50–75 kısmen, altı ayrışıyor
export const AGREE_OK = 0.75;
export const AGREE_PARTIAL = 0.5;
export function levelOf(pct) {
  if (pct == null) return "na";
  return pct >= AGREE_OK ? "ok" : pct >= AGREE_PARTIAL ? "partial" : "split";
}
export const LEVEL_ORDER = { na: -1, ok: 0, partial: 1, split: 2 };

function points(models, i, key) {
  return models.map((m) => ({ m, v: numOrNull(m.series[i]?.[key]) })).filter((p) => p.v != null);
}

// --- fark yöntemi (sıcaklık, nem, basınç): en yüksek ve en düşük model arasındaki fark ---
export const SPREAD_RULES = {
  temp: { partial: 2, split: 4 }, // °C
  humidity: { partial: 10, split: 20 }, // puan
  pressure: { partial: 2, split: 4 }, // hPa
};

export function spreadAgreement(models, i, key, rule = SPREAD_RULES[key]) {
  const pts = points(models, i, key);
  if (pts.length < 2) return { level: "na", rank: -1, n: pts.length, i };
  let lo = pts[0];
  let hi = pts[0];
  for (const p of pts) {
    if (p.v < lo.v) lo = p;
    if (p.v > hi.v) hi = p;
  }
  const sp = hi.v - lo.v;
  const level = sp < rule.partial ? "ok" : sp <= rule.split ? "partial" : "split";
  return { level, rank: sp, spread: sp, lo, hi, n: pts.length, i };
}

// --- sınıf yöntemi (bulutluluk, CAPE): ortanca sınıftaki modellerin oranı ---
// MGM bulut sınıfları (üst sınır dahil): ≤ %10 açık · ≤ %30 az bulutlu · ≤ %50 parçalı bulutlu ·
// ≤ %90 çok bulutlu · > %90 kapalı
export const CLOUD_LIMITS = [10, 30, 50, 90];
export function cloudClass(v) {
  for (let k = 0; k < CLOUD_LIMITS.length; k++) if (v <= CLOUD_LIMITS[k]) return k;
  return CLOUD_LIMITS.length;
}

// CAPE sınıfları: ≤ 500 · 500–1000 (sağanak) · > 1000 J/kg (gök gürültülü)
export const CAPE_SHOWER = 500;
export const CAPE_THUNDER = 1000;
export function capeClass(v) {
  return v > CAPE_THUNDER ? 2 : v > CAPE_SHOWER ? 1 : 0;
}

export function classAgreement(models, i, key, classFn) {
  const pts = points(models, i, key);
  if (pts.length < 2) return { level: "na", rank: -1, n: pts.length, i };
  const mode = midClass(pts.map((p) => classFn(p.v)));
  const inClass = pts.filter((p) => classFn(p.v) === mode).length;
  const pct = inClass / pts.length;
  return { level: levelOf(pct), rank: 1 - pct, pct, inClass, mode, n: pts.length, i, pts };
}

// --- rüzgar: yön ve hız birlikte (knot) ---
export const KN_PER_KMH = 0.539957;
export const WIND_CALM_KT = 3; // altındaki modeller yön karşılaştırmasına katılmaz
export const WIND_DIR_PARTIAL = 90;
export const WIND_DIR_SPLIT = 135;
export const WIND_SPD_PARTIAL = 10;
export const WIND_SPD_SPLIT = 20;

export function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function windAgreement(models, i) {
  const pts = models
    .map((m) => {
      const spd = numOrNull(m.series[i]?.wind_speed);
      return spd == null ? null : { m, kt: spd * KN_PER_KMH, dir: numOrNull(m.series[i]?.wind_direction) };
    })
    .filter(Boolean);
  if (pts.length < 2) return { level: "na", rank: -1, i };
  let slow = pts[0];
  let fast = pts[0];
  for (const p of pts) {
    if (p.kt < slow.kt) slow = p;
    if (p.kt > fast.kt) fast = p;
  }
  const sp = fast.kt - slow.kt;
  const dirPts = pts.filter((p) => p.kt >= WIND_CALM_KT && p.dir != null);
  const calm = pts.filter((p) => !(p.kt >= WIND_CALM_KT && p.dir != null));
  let ds = 0;
  let pair = null;
  for (let a = 0; a < dirPts.length; a++)
    for (let b = a + 1; b < dirPts.length; b++) {
      const d = angleDiff(dirPts[a].dir, dirPts[b].dir);
      if (d > ds) {
        ds = d;
        pair = [dirPts[a], dirPts[b]];
      }
    }
  const dirBad = ds >= WIND_DIR_PARTIAL;
  const spdBad = sp >= WIND_SPD_PARTIAL;
  const split = (dirBad && spdBad) || ds >= WIND_DIR_SPLIT || sp >= WIND_SPD_SPLIT;
  return {
    level: split ? "split" : dirBad || spdBad ? "partial" : "ok",
    rank: ds / WIND_DIR_SPLIT + sp / WIND_SPD_SPLIT,
    ds,
    sp,
    slow,
    fast,
    pair,
    calm,
    i,
  };
}

// MGM Beaufort ıskalası (10 m) — m/s alt sınırları; 8 bofor (17,2 m/s ≈ 62 km/s) fırtına eşiği
export const BEAUFORT_MS = [0, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5];
export const STORM_KMH = 17.2 * 3.6;
export function beaufortIndex(kmh) {
  const ms = kmh / 3.6;
  let k = 0;
  BEAUFORT_MS.forEach((b, i) => {
    if (ms >= b) k = i;
  });
  return k;
}

// --- basınç eğilimi: son 3 saatteki değişimin model ortancası ---
export const TREND_HOURS = 3;
export const TREND_FAST = 2; // hPa / 3 saat
export const TREND_FLAT = 0.5;

export function trendKey(d) {
  if (d <= -TREND_FAST) return "fastDown";
  if (d < -TREND_FLAT) return "down";
  if (d >= TREND_FAST) return "fastUp";
  if (d > TREND_FLAT) return "up";
  return "flat";
}

// { med, same, i } ya da veri yoksa null. same=false: modeller değişimin yönünde ayrışıyor.
export function pressureTrend(models, i) {
  const j = Math.max(0, i - TREND_HOURS);
  const ds = models
    .map((m) => {
      const a = numOrNull(m.series[i]?.pressure);
      const b = numOrNull(m.series[j]?.pressure);
      return a == null || b == null ? null : a - b;
    })
    .filter((v) => v != null)
    .sort((a, b) => a - b);
  if (!ds.length) return null;
  const med = ds[Math.floor(ds.length / 2)];
  const same = ds[0] > 0 || ds[ds.length - 1] < 0 || Math.abs(med) < TREND_FLAT;
  return { med, same, i };
}

// --- günlük yağış uyumu (web şeridi): modelin günlük toplamı eşiği aşıyor mu ---
export const RAIN_DAY_DEFAULT = 0.2; // mm
export const RAIN_AGREE = 0.75;

// Saatleri TSİ takvim günlerine böler: [{ key:"YYYY-MM-DD", h0, h1 }] (h1 hariç)
export function groupDays(times) {
  const days = [];
  times.forEach((t, i) => {
    const k = String(t || "").slice(0, 10);
    const last = days[days.length - 1];
    if (!last || last.key !== k) days.push({ key: k, h0: i, h1: i + 1 });
    else last.h1 = i + 1;
  });
  return days;
}

// st: "wet" (en az % 75 yağış veriyor) · "dry" (en az % 75 vermiyor) · "mixed" · null (< 2 model)
export function rainDayAgreement(models, day, threshold = RAIN_DAY_DEFAULT) {
  let n = 0;
  let wet = 0;
  const per = [];
  for (const m of models) {
    let sum = 0;
    let any = false;
    for (let i = day.h0; i < day.h1; i++) {
      const v = numOrNull(m.series[i]?.precip_amount);
      if (v != null) {
        sum += v;
        any = true;
      }
    }
    if (!any) continue;
    n++;
    const w = sum >= threshold - 1e-9;
    if (w) wet++;
    per.push({ m, sum, wet: w });
  }
  const st = n < 2 ? null : wet / n >= RAIN_AGREE ? "wet" : (n - wet) / n >= RAIN_AGREE ? "dry" : "mixed";
  return { ...day, n, wet, per, st };
}

// --- durum ifadesi (web + mobil genel kuralları, 8–11 Ekim 2026; kar: sunucu madde 4, 17 Ekim) ---
// Modelin o günkü toplam yağışı ≥ 0,2 mm ve o saatteki yağış ≥ 0,1 mm ise yağış ifadesi; sağanak ayrımı
// o saatin CAPE'iyle (> 500 sağanak, > 1000 gök gürültülü; JMA CAPE vermez → yağmur). O saatin yağışının
// en az yarısı kar ise (taze kar ÷ 0,7 ≥ yağış ÷ 2; Open-Meteo 1 mm su ≈ 0,7 cm kar) yağışın kar karşılığı:
// Kar Yağışlı / Kar Sağanağı / Gök Gürültülü Kar Sağanağı (17 Ekim kararı; C1'deki 0,1 cm eşiği 0,1 mm'lik
// hafif kar saatini — 0,07 cm — yakalamadığı için).
// Yağış yoksa MGM bulut sınıfı; gece (20:00–06:00) açık / az / parçalı bulutlu ikonlarında ay.
export const COND_CLASSES = ["Açık", "Az Bulutlu", "Parçalı Bulutlu", "Çok Bulutlu", "Kapalı"];
export const CLASS_ICON = ["clear", "few", "part", "cloud", "over"];
export const DAY_RAIN = 0.2;
export const HOUR_RAIN = 0.1;
export const SNOW_CM_PER_MM = 0.7; // Open-Meteo'nun su eşdeğerinden taze kara çevirme oranı
export const SNOW_SHARE = 0.5; // yağışın en az bu kadarı kar ise kar ifadesi

// Yağış ifadeleri: CAPE kademesi (0 yağmur, 1 sağanak, 2 gök gürültülü) × kar. Dilimde en belirgin seçilirken
// kademe önce gelir; aynı kademede kar yağmurdan önce. Terim (25 Ekim, Ali Kemal): "Sağanak Yağış",
// "Gök Gürültülü Sağanak Yağış" ("Sağanak" / "Gök Gürültülü Sağanak" tek başına kullanılmaz).
const WET = [
  [
    { rank: 11, ic: "rain", text: "Yağmurlu" },
    { rank: 11.5, ic: "snow", text: "Kar Yağışlı" },
  ],
  [
    { rank: 12, ic: "shower", text: "Sağanak Yağış" },
    { rank: 12.5, ic: "snowshower", text: "Kar Sağanağı" },
  ],
  [
    { rank: 13, ic: "storm", text: "Gök Gürültülü Sağanak Yağış" },
    { rank: 13.5, ic: "snowstorm", text: "Gök Gürültülü Kar Sağanağı" },
  ],
];
// Durumun belirginlik sırası (dilimde ya da günde "en belirgin" seçilirken): yağışsızda bulut sınıfı (0–4),
// yağışta yukarıdaki sıra. condAt ve consensusCond sonuçlarının ikisiyle de çalışır.
export function condRank(c) {
  if (!c) return -1;
  if (c.wet) {
    for (const tier of WET) for (const w of tier) if (w.ic === c.ic) return w.rank;
    return 11;
  }
  return c.cls ?? 0;
}
function capeTier(e) {
  return e != null && e > CAPE_THUNDER ? 2 : e != null && e > CAPE_SHOWER ? 1 : 0;
}
function wetCond(e, snow) {
  return { wet: true, snow, ...WET[capeTier(e)][snow ? 1 : 0] };
}

function hourOf(t) {
  const m = /T(\d{2})/.exec(t || "");
  return m ? +m[1] : null;
}

// Modelin her saati için o günün toplam yağışı (TSİ takvim günü); seri başına bir kez hesaplanır.
const DAY_SUMS = new WeakMap();
function daySums(series) {
  let out = DAY_SUMS.get(series);
  if (out) return out;
  out = new Array(series.length).fill(null);
  let i = 0;
  while (i < series.length) {
    const key = String(series[i]?.time || "").slice(0, 10);
    let j = i;
    let sum = 0;
    let any = false;
    while (j < series.length && String(series[j]?.time || "").slice(0, 10) === key) {
      const v = numOrNull(series[j]?.precip_amount);
      if (v != null) {
        sum += v;
        any = true;
      }
      j++;
    }
    for (let k = i; k < j; k++) out[k] = any ? sum : null;
    i = j;
  }
  DAY_SUMS.set(series, out);
  return out;
}

// Bir modelin bir saatteki durumu: { wet, rank, ic, text, cls? } ya da veri yoksa null
export function condAt(m, i) {
  const s = m.series[i];
  const c = numOrNull(s?.cloud_cover);
  if (c == null) return null;
  const r = numOrNull(s?.precip_amount);
  const e = numOrNull(s?.cape);
  const ds = daySums(m.series)[i];
  if (ds != null && ds >= DAY_RAIN - 1e-9 && r != null && r >= HOUR_RAIN - 1e-9) {
    const sf = numOrNull(s?.snowfall);
    return wetCond(e, sf != null && sf > 0 && sf / SNOW_CM_PER_MM >= r * SNOW_SHARE - 1e-9);
  }
  const o = cloudClass(c);
  const h = hourOf(s?.time);
  const night = h != null ? h < 6 || h >= 20 : false;
  return { wet: false, rank: o, cls: o, ic: CLASS_ICON[o] + (night && o < 3 ? "N" : ""), text: COND_CLASSES[o] };
}

// Dilimdeki en belirgin durum (+ hangi saatte olduğu): yağış bulut sınıfından önce, bulutta daha kapalı olan
export function slotCond(m, s0, step) {
  let best = null;
  const n = m.series.length;
  for (let i = s0; i < s0 + step && i < n; i++) {
    const c = condAt(m, i);
    if (c && (!best || c.rank > best.rank)) best = { ...c, i };
  }
  return best;
}

// Hava durumu uyumu: modellerin en az yarısı yağış veriyorsa yağış verenlerin oranı, değilse ortanca bulut
// sınıfındaki yağışsız modellerin oranı
export function weatherAgreement(models, i) {
  const cs = models.map((m) => condAt(m, i)).filter(Boolean);
  if (cs.length < 2) return { level: "na", rank: -1, i };
  const wet = cs.filter((c) => c.wet).length;
  let pct;
  let inn;
  let mode;
  if (wet >= cs.length / 2) {
    pct = wet / cs.length;
    inn = wet;
    mode = "yağış";
  } else {
    const mc = midClass(
      models
        .map((m) => numOrNull(m.series[i]?.cloud_cover))
        .filter((v) => v != null)
        .map(cloudClass)
    );
    inn = cs.filter((c) => !c.wet && c.cls === mc).length;
    pct = inn / cs.length;
    mode = COND_CLASSES[mc];
  }
  return { level: levelOf(pct), rank: 1 - pct, pct, inClass: inn, n: cs.length, mode, i };
}

// ---------------------------------------------------------------------------
// Mobil Sayfa 1 kuralları (ortanca + uyum çubukları; V04 P2, V05 B4) — /api/v1 ortak özeti kullanır.
// Uyum oranı { pct, in, n }: pct = in / n; n < 2 ise pct null (karşılaştıracak model yok).
// ---------------------------------------------------------------------------
function share(inn, n) {
  return { pct: n < 2 ? null : inn / n, in: inn, n };
}

// Bant: ortanca ± genişlik/2 içine düşen modellerin oranı (ör. sıcaklık 2 °C, nem 10 puan, kar kalınlığı 5 cm)
export function bandAgreement(values, width) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return share(0, v.length);
  const m = median(v);
  return share(v.filter((x) => Math.abs(x - m) <= width / 2 + 1e-9).length, v.length);
}

// Eşik: eşiği aşan (yağış / kar veren) modellerin oranı (ör. günlük yağış ≥ 0,2 mm, taze kar ≥ 0,1 cm)
export function thresholdAgreement(values, threshold) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return share(0, v.length);
  return share(v.filter((x) => x >= threshold - 1e-9).length, v.length);
}

// Yönlerin vektör ortalaması (derece); yönler birbirini götürüyorsa null
export function dirMean(dirs) {
  const v = dirs.filter((d) => d != null);
  if (!v.length) return null;
  let x = 0;
  let y = 0;
  v.forEach((d) => {
    x += Math.sin((d * Math.PI) / 180);
    y += Math.cos((d * Math.PI) / 180);
  });
  if (Math.hypot(x, y) < 1e-6) return null;
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

// Sayfa 1 rüzgar: ortanca hızın ± 5 kt'u ve ortalama yönün ± 45°'si içindeki modellerin oranı
// (3 kt altındaki rüzgarda yön sayılmaz)
export const WIND_BAND_KT = 5;
export const WIND_BAND_DIR = 45;
export function windBandAgreement(models, i) {
  const pts = models
    .map((m) => {
      const spd = numOrNull(m.series[i]?.wind_speed);
      return spd == null ? null : { kt: spd * KN_PER_KMH, d: numOrNull(m.series[i]?.wind_direction) };
    })
    .filter(Boolean);
  if (pts.length < 2) return share(0, pts.length);
  const mk = median(pts.map((p) => p.kt));
  const md = dirMean(pts.filter((p) => p.kt >= WIND_CALM_KT).map((p) => p.d));
  const inn = pts.filter(
    (p) =>
      Math.abs(p.kt - mk) <= WIND_BAND_KT + 1e-9 &&
      (p.kt < WIND_CALM_KT || md == null || p.d == null || angleDiff(p.d, md) <= WIND_BAND_DIR)
  ).length;
  return share(inn, pts.length);
}

// Ortak durum (V05 B4): modellerin en az yarısı yağış veriyorsa yağış ifadesi — türü yağış veren modellerin
// CAPE ortancasından (> 500 sağanak, > 1000 gök gürültülü); yağış verenlerin en az yarısı kar veriyorsa
// kar karşılığı (madde 4). Değilse modellerin ortanca bulut sınıfı.
// Uyum weatherAgreement ile aynı: yağışta yağış verenlerin, yağışsızda o sınıftaki yağışsızların oranı.
export function consensusCond(models, i) {
  const per = models.map((m) => ({ m, c: condAt(m, i) })).filter((p) => p.c);
  if (!per.length) return null;
  const wet = per.filter((p) => p.c.wet);
  if (wet.length >= per.length / 2) {
    const cape = median(wet.map((p) => numOrNull(p.m.series[i]?.cape) ?? 0));
    const snow = wet.filter((p) => p.c.snow).length >= wet.length / 2;
    const { ic, text } = wetCond(cape, snow);
    return { ic, text, wet: true, snow, agree: share(wet.length, per.length) };
  }
  const k = midClass(per.map((p) => cloudClass(numOrNull(p.m.series[i]?.cloud_cover))));
  const h = hourOf(per[0].m.series[i]?.time);
  const night = h != null ? h < 6 || h >= 20 : false;
  const inn = per.filter((p) => !p.c.wet && p.c.cls === k).length;
  return {
    ic: CLASS_ICON[k] + (night && k < 3 ? "N" : ""),
    text: COND_CLASSES[k],
    wet: false,
    cls: k,
    agree: share(inn, per.length),
  };
}
