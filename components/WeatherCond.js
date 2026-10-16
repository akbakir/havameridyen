// Hava durumu ifadesi ve ikonları (Paket 4, Ekim 2026) — Hava durumu matrisi ve Model detayları tablosu kullanır.
//
// Kural (web + mobil genel kuralları, 8–11 Ekim 2026):
// - Modelin o günkü toplam yağışı ≥ 0.2 mm ve o saatteki yağış ≥ 0.1 mm ise yağış ifadesi;
//   sağanak ayrımı o saatin CAPE'iyle: ≤ 500 Yağmurlu · > 500 Sağanak Yağışlı · > 1000 Gök Gürültülü Sağanak Yağışlı.
//   (JMA CAPE vermez → JMA'da yağış "Yağmurlu".)
// - Yağış yoksa MGM bulut sınıfı (üst sınır dahil): ≤ %10 Açık · ≤ %30 Az Bulutlu · ≤ %50 Parçalı Bulutlu ·
//   ≤ %90 Çok Bulutlu · > %90 Kapalı. Gece (20:00–06:00) açık / az / parçalı bulutlu ikonlarında ay.
// - Dilimde (3s / 6s) en belirgin durum: yağış bulut sınıfından önce gelir, bulutta daha kapalı olan.
// - Uyum (mobil Sayfa 1 kuralı): modellerin en az yarısı o saatte yağış veriyorsa yağış verenlerin oranı,
//   değilse ortanca bulut sınıfındaki yağışsız modellerin oranı; % 75 ve üstü hemfikir, % 50–75 kısmen.
//   Ortanca sınıf sıralı sınıflardan ortadaki (çift sayıda modelde üstteki) — her zaman bir modelin sınıfı.

import { numOrNull, parseTime } from "./LineChartPanel";

export const COND_CLASSES = ["Açık", "Az Bulutlu", "Parçalı Bulutlu", "Çok Bulutlu", "Kapalı"];
const CLASS_ICON = ["clear", "few", "part", "cloud", "over"];
const DAY_RAIN = 0.2;
const HOUR_RAIN = 0.1;

export function condClass(c) {
  return c <= 10 ? 0 : c <= 30 ? 1 : c <= 50 ? 2 : c <= 90 ? 3 : 4;
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
    if (e != null && e > 1000) return { wet: true, rank: 13, ic: "storm", text: "Gök Gürültülü Sağanak Yağışlı" };
    if (e != null && e > 500) return { wet: true, rank: 12, ic: "shower", text: "Sağanak Yağışlı" };
    return { wet: true, rank: 11, ic: "rain", text: "Yağmurlu" };
  }
  const o = condClass(c);
  const p = parseTime(s?.time);
  const night = p ? p.hour < 6 || p.hour >= 20 : false;
  return { wet: false, rank: o, cls: o, ic: CLASS_ICON[o] + (night && o < 3 ? "N" : ""), text: COND_CLASSES[o] };
}

// Dilimdeki en belirgin durum (+ hangi saatte olduğu)
export function slotCond(m, s0, step) {
  let best = null;
  const n = m.series.length;
  for (let i = s0; i < s0 + step && i < n; i++) {
    const c = condAt(m, i);
    if (c && (!best || c.rank > best.rank)) best = { ...c, i };
  }
  return best;
}

export function wxAgreeAt(models, i) {
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
    const ks = models
      .map((m) => numOrNull(m.series[i]?.cloud_cover))
      .filter((v) => v != null)
      .map(condClass)
      .sort((a, b) => a - b);
    const mc = ks[Math.floor(ks.length / 2)];
    inn = cs.filter((c) => !c.wet && c.cls === mc).length;
    pct = inn / cs.length;
    mode = COND_CLASSES[mc];
  }
  return { level: pct >= 0.75 ? "ok" : pct >= 0.5 ? "partial" : "split", rank: 1 - pct, pct, inClass: inn, n: cs.length, mode, i };
}

// --- ikonlar (36 × 36) ---
function Cloud({ dark }) {
  const c = dark ? ["#7F8C97", "#A9B4BD", "#B9C3CB", "#98A4AE"] : ["#B7C2CC", "#E6EBEF", "#EEF2F5", "#D3DBE1"];
  return (
    <>
      <ellipse cx="13" cy="20" rx="7.5" ry="5.8" fill={c[0]} />
      <rect x="12" y="17" width="18" height="8" rx="4" fill={c[1]} />
      <ellipse cx="21" cy="15" rx="9.5" ry="7.5" fill={c[2]} />
      <ellipse cx="28" cy="19.5" rx="6.5" ry="5.2" fill={c[3]} />
    </>
  );
}

function Sun() {
  return (
    <>
      <circle cx="18" cy="18" r="7" fill="#F2B640" />
      <g stroke="#F2B640" strokeWidth="2" strokeLinecap="round">
        <path d="M18 5v3M18 28v3M5 18h3M28 18h3M8.8 8.8l2.1 2.1M25.1 25.1l2.1 2.1M8.8 27.2l2.1-2.1M25.1 10.9l2.1-2.1" />
      </g>
    </>
  );
}

function Moon() {
  return <path d="M22 6a11 11 0 1 0 8 18 9.5 9.5 0 0 1-8-18z" fill="#8FA3BF" />;
}

const DROP_LINES = [
  [12, 27, 10, 33],
  [19, 27, 17, 33],
  [26, 27, 24, 33],
  [15, 30, 13, 35],
];

function Drops({ n }) {
  return DROP_LINES.slice(0, n).map((p) => (
    <line key={p.join()} x1={p[0]} y1={p[1]} x2={p[2]} y2={p[3]} stroke="#3B6FB6" strokeWidth="2" strokeLinecap="round" />
  ));
}

function IconBody({ ic }) {
  switch (ic) {
    case "clear":
      return <Sun />;
    case "clearN":
      return <Moon />;
    case "few":
    case "fewN":
      return (
        <>
          <g transform={ic === "few" ? "translate(-5,-5) scale(.85)" : "translate(-4,-4) scale(.8)"}>{ic === "few" ? <Sun /> : <Moon />}</g>
          <g transform="translate(6,8) scale(.75)">
            <Cloud />
          </g>
        </>
      );
    case "part":
    case "partN":
      return (
        <>
          <g transform={ic === "part" ? "translate(-3,-5) scale(.8)" : "translate(-2,-4) scale(.75)"}>{ic === "part" ? <Sun /> : <Moon />}</g>
          <g transform="translate(1,4)">
            <Cloud />
          </g>
        </>
      );
    case "cloud":
      return (
        <g transform="translate(0,1)">
          <Cloud />
        </g>
      );
    case "over":
      return (
        <>
          <g transform="translate(-3,-3) scale(.9)" opacity=".9">
            <Cloud dark />
          </g>
          <g transform="translate(2,3)">
            <Cloud dark />
          </g>
        </>
      );
    case "rain":
      return (
        <>
          <g transform="translate(0,-3)">
            <Cloud />
          </g>
          <Drops n={3} />
        </>
      );
    case "shower":
      return (
        <>
          <g transform="translate(0,-3)">
            <Cloud dark />
          </g>
          <Drops n={4} />
        </>
      );
    case "storm":
      return (
        <>
          <g transform="translate(0,-3)">
            <Cloud dark />
          </g>
          <line x1="11" y1="27" x2="9" y2="33" stroke="#3B6FB6" strokeWidth="2" strokeLinecap="round" />
          <line x1="27" y1="27" x2="25" y2="33" stroke="#3B6FB6" strokeWidth="2" strokeLinecap="round" />
          <path d="M20 22l-5 7h4l-3 6 8-9h-4.5z" fill="#F2B640" />
        </>
      );
    default:
      return null;
  }
}

// HTML içinde: <WxIcon ic="rain" size={22} /> · SVG içinde: <WxIcon ic="rain" size={26} x={..} y={..} />
export function WxIcon({ ic, size = 22, x, y }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" x={x} y={y} aria-hidden="true" style={x == null ? { flexShrink: 0 } : undefined}>
      <IconBody ic={ic} />
    </svg>
  );
}

export const WX_KEY = [
  ["clear", "Açık"],
  ["few", "Az Bulutlu"],
  ["part", "Parçalı Bulutlu"],
  ["cloud", "Çok Bulutlu"],
  ["over", "Kapalı"],
  ["rain", "Yağmurlu"],
  ["shower", "Sağanak Yağışlı"],
  ["storm", "Gök Gürültülü Sağanak"],
];
