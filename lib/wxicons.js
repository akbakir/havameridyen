// Hava durumu ikonları — site, uygulama ve widget'ların ORTAK tek kaynağı (26 Ekim 2026, Ali Kemal: "ikisini
// birleştirelim, zemin renklerine karışmasın"). 36 × 36 tuval.
//   Site:     components/WeatherCond.js (WxIcon) · stil ve hareket styles/globals.css (.wx-dr, .wx-sh, .wx-fl)
//   Uygulama: apps/mobile/src/icons.jsx · stil ve hareket apps/mobile/src/styles.css
//   Widget:   apps/mobile/scripts/gen_widget_icons.mjs bu dosyadan res/drawable/wx_*.xml üretir (hareketsiz)
// Zemine karışmasın diye: bulutların dış çizgisi var; damla ve kar taneleri iki katmanlı (koyu kenar + açık iç);
// güneşin koyu sarı kenarı, ayın kenar çizgisi var. Yağmur kısa damla, sağanak uzun eğik çizgi ve koyu bulut.
// "Hafif" ikonları (rainL, showerL) yalnız günlük ifadede: günün ortanca toplam yağışı ≤ 0,5 mm (lib/consensus.js).

// --- çizim öğeleri: { t, ...nitelikler } · g: { t: "g", tr: [dx, dy, ölçek], op, cls, kids } ---
const g = (kids, tr, extra = {}) => ({ t: "g", tr, kids, ...extra });
const el = (cx, cy, rx, ry, fill) => ({ t: "ellipse", cx, cy, rx, ry, fill });
const rc = (x, y, w, h, r, fill) => ({ t: "rect", x, y, w, h, r, fill });
const ci = (cx, cy, r, fill) => ({ t: "ellipse", cx, cy, rx: r, ry: r, fill });
const ln = (x1, y1, x2, y2) => ({ t: "path", d: `M${x1} ${y1}L${x2} ${y2}` });

const SUN = "#F5B83D";
const SUN_EDGE = "#B9801A";
const MOON = "#DCE4F0";
const MOON_EDGE = "#7F93AE";
// Açık bulut 26 Ekim akşamı bir ton koyulaştı (Ali Kemal: "Yağmurlu ile Sağanak, Çok Bulutlu ile Kapalı arasındaki gri farkı çok fazla")
const CLOUD_L = ["#A2B0BD", "#D0DAE1", "#D8E1E8", "#BECAD3"];
const EDGE_L = "#72808D";
const CLOUD_D = ["#6F7C88", "#93A0AB", "#A3AEB8", "#84919C"];
const EDGE_D = "#46515C";
// Damla: açık iç + koyu kenar; küçük boyda (widget saat dilimi, Sayfa 1 saat şeridi) gri zeminde seçilsin diye
// 26 Ekim akşamı kalınlaştırıldı ve açıldı (Ali Kemal: "gri zeminde mavi damlacıklar belli olmuyor")
const DROP_EDGE = "#163A6B";
const DROP = "#C4E2FF";
const FLAKE_EDGE = "#2F5F99";
const FLAKE = "#FFFFFF";

const RAYS = "M18 5v3M18 28v3M5 18h3M28 18h3M8.8 8.8l2.1 2.1M25.1 25.1l2.1 2.1M8.8 27.2l2.1-2.1M25.1 10.9l2.1-2.1";
const sun = () => [
  { t: "path", d: RAYS, stroke: SUN_EDGE, sw: 3.4 },
  ci(18, 18, 7.6, SUN_EDGE),
  { t: "path", d: RAYS, stroke: SUN, sw: 2 },
  ci(18, 18, 7, SUN),
];
const moon = () => [{ t: "path", d: "M22 6a11 11 0 1 0 8 18 9.5 9.5 0 0 1-8-18z", fill: MOON, stroke: MOON_EDGE, sw: 1 }];

// Bulut: önce dış çizgi (aynı şekiller, kenar renginde dolgu + çizgi), sonra dolgular
function cloud(dark, edgeW = 1.8) {
  const c = dark ? CLOUD_D : CLOUD_L;
  const e = dark ? EDGE_D : EDGE_L;
  const shapes = (f) => [el(13, 20, 7.5, 5.8, f[0]), rc(12, 17, 18, 8, 4, f[1]), el(21, 15, 9.5, 7.5, f[2]), el(28, 19.5, 6.5, 5.2, f[3])];
  return [...shapes([e, e, e, e]).map((s) => ({ ...s, stroke: e, sw: edgeW })), ...shapes(c)];
}

// Damla / çizgi (iki katman) — cls hareket sınıfı (wx-dr yağmur, wx-sh sağanak), k sırası gecikme için
const drops = (pts, w, cls) =>
  pts.map(([x1, y1, x2, y2], i) =>
    g([{ ...ln(x1, y1, x2, y2), stroke: DROP_EDGE, sw: w + 1.6 }, { ...ln(x1, y1, x2, y2), stroke: DROP, sw: w }], null, { cls: `${cls} k${i}` })
  );

// Kar tanesi: altı kollu yıldız (iki katman)
function flakes(pts) {
  const r = 2.6;
  const a = r * 0.5;
  const b = +(r * 0.866).toFixed(3);
  return pts.map(([x, y], i) => {
    const d = `M${+(x - r).toFixed(2)} ${y}L${+(x + r).toFixed(2)} ${y}M${+(x - a).toFixed(2)} ${+(y - b).toFixed(2)}L${+(x + a).toFixed(2)} ${+(y + b).toFixed(2)}M${+(x - a).toFixed(2)} ${+(y + b).toFixed(2)}L${+(x + a).toFixed(2)} ${+(y - b).toFixed(2)}`;
    return g([{ t: "path", d, stroke: FLAKE_EDGE, sw: 2.6 }, { t: "path", d, stroke: FLAKE, sw: 1.2 }], null, { cls: `wx-fl k${i}` });
  });
}

const BOLT = { t: "path", d: "M20 22l-5 7h4l-3 6 8-9h-4.5z", fill: SUN, stroke: SUN_EDGE, sw: 0.8, join: "round" };
const few = (body) => [g(body, [-2.6, -2.6, 0.8]), g(cloud(false, 2.2), [6, 8, 0.75])];
const part = (body) => [g(body, [-2.4, -2.4, 0.75]), g(cloud(false), [1, 4, 1])];
const up = (kids) => g(kids, [0, -3, 1]);

// Yağmurlu 5 kısa damla (3 + 2 kaydırmalı; 26 Ekim: "3 damlacık az"), Hafif Yağmurlu 3
const RAIN = [[10.5, 27, 9.6, 29.8], [18, 27, 17.1, 29.8], [25.5, 27, 24.6, 29.8], [14.3, 31.3, 13.4, 34.1], [21.8, 31.3, 20.9, 34.1]];
const RAIN_L = [[12.5, 27.5, 11.5, 31], [19.5, 27.5, 18.5, 31], [26.5, 27.5, 25.5, 31]];
const SHOWER = [[11, 26.5, 8.5, 33.5], [17, 26.5, 14.5, 33.5], [23, 26.5, 20.5, 33.5], [29, 26.5, 26.5, 33.5]];
const SHOWER_L = [[15, 26.5, 12.5, 33.5], [23, 26.5, 20.5, 33.5]];
const STORM = [[10, 26.5, 7.5, 33.5], [28, 26.5, 25.5, 33.5]];

// ad (lib/agreement.js ic) → çizim
export const WX_ICONS = {
  clear: sun(),
  few: few(sun()),
  part: part(sun()),
  clearN: moon(),
  fewN: few(moon()),
  partN: part(moon()),
  cloud: [g(cloud(false), [0, 1, 1])],
  over: [g(cloud(true), [-3, -3, 0.9]), g(cloud(true), [2, 3, 1])],
  rainL: [up(cloud(false)), ...drops(RAIN_L, 2, "wx-dr")],
  rain: [up(cloud(false)), ...drops(RAIN, 2, "wx-dr")],
  showerL: [up(cloud(true)), ...drops(SHOWER_L, 2.2, "wx-sh")],
  shower: [up(cloud(true)), ...drops(SHOWER, 2.2, "wx-sh")],
  storm: [up(cloud(true)), ...drops(STORM, 2.2, "wx-sh"), BOLT],
  snow: [up(cloud(false)), ...flakes([[12, 30], [19.5, 31.5], [27, 30]])],
  snowshower: [up(cloud(true)), ...flakes([[9.5, 29.5], [16, 32.5], [22.5, 29.5], [29, 32.5]])],
  snowstorm: [up(cloud(true)), ...flakes([[10, 30], [28, 30]]), BOLT],
};

// --- SVG ---
function svgNode(n) {
  if (n.t === "g") {
    const a = [];
    if (n.tr) a.push(`transform="translate(${n.tr[0]},${n.tr[1]})${n.tr[2] !== 1 ? ` scale(${n.tr[2]})` : ""}"`);
    if (n.op != null) a.push(`opacity="${n.op}"`);
    if (n.cls) a.push(`class="${n.cls}"`);
    return `<g${a.length ? " " + a.join(" ") : ""}>${n.kids.map(svgNode).join("")}</g>`;
  }
  const paint =
    (n.fill ? ` fill="${n.fill}"` : ' fill="none"') +
    (n.stroke ? ` stroke="${n.stroke}" stroke-width="${n.sw}"${n.t === "path" && !n.fill ? ' stroke-linecap="round"' : ""}${n.join ? ` stroke-linejoin="${n.join}"` : ""}` : "");
  if (n.t === "ellipse") return `<ellipse cx="${n.cx}" cy="${n.cy}" rx="${n.rx}" ry="${n.ry}"${paint}/>`;
  if (n.t === "rect") return `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.r}"${paint}/>`;
  return `<path d="${n.d}"${paint}/>`;
}

const BODY = {};
for (const k of Object.keys(WX_ICONS)) BODY[k] = WX_ICONS[k].map(svgNode).join("");

// SVG gövdesi (viewBox 0 0 36 36); bilinmeyen ad → Çok Bulutlu
export function wxBody(ic) {
  return BODY[ic] || BODY.cloud;
}

// Tam SVG metni
export function wxSvg(ic, attrs = "") {
  return `<svg viewBox="0 0 36 36" class="wx"${attrs ? " " + attrs : ""}>${wxBody(ic)}</svg>`;
}

// --- Android vektör (widget) için yol verisi: elips ve yuvarlak köşeli dikdörtgen yola çevrilir ---
const fx = (v) => {
  const t = (+v).toFixed(3).replace(/\.?0+$/, "");
  return t === "-0" ? "0" : t;
};
export function pathDataOf(n) {
  if (n.t === "ellipse") {
    const { cx, cy, rx, ry } = n;
    return `M${fx(cx - rx)},${fx(cy)}a${fx(rx)},${fx(ry)} 0 1,0 ${fx(2 * rx)},0a${fx(rx)},${fx(ry)} 0 1,0 ${fx(-2 * rx)},0Z`;
  }
  if (n.t === "rect") {
    const { x, y, w, h, r } = n;
    return (
      `M${fx(x + r)},${fx(y)}h${fx(w - 2 * r)}a${fx(r)},${fx(r)} 0 0,1 ${fx(r)},${fx(r)}v${fx(h - 2 * r)}` +
      `a${fx(r)},${fx(r)} 0 0,1 ${fx(-r)},${fx(r)}h${fx(-(w - 2 * r))}a${fx(r)},${fx(r)} 0 0,1 ${fx(-r)},${fx(-r)}` +
      `v${fx(-(h - 2 * r))}a${fx(r)},${fx(r)} 0 0,1 ${fx(r)},${fx(-r)}Z`
    );
  }
  return n.d;
}
