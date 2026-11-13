// Hava durumu ikonları — site, uygulama ve widget'ların ORTAK tek kaynağı (26 Ekim 2026, Ali Kemal: "ikisini
// birleştirelim, zemin renklerine karışmasın"). 36 × 36 tuval.
//   Site:     components/WeatherCond.js (WxIcon) · stil ve hareket styles/globals.css (.wx-dr, .wx-sh, .wx-fl)
//   Uygulama: apps/mobile/src/icons.jsx · stil ve hareket apps/mobile/src/styles.css
//   Widget:   apps/mobile/scripts/gen_widget_icons.mjs bu dosyadan res/drawable/wx_*.xml üretir (hareketsiz)
// Zemine karışmasın diye: bulutların dış çizgisi var; damla ve kar taneleri iki katmanlı (koyu kenar + açık iç);
// güneşin koyu sarı kenarı, ayın kenar çizgisi var. Yağmur kısa damla, sağanak uzun eğik çizgi ve koyu bulut.
// Sisli (fog) ve Puslu (haze, gece hazeN; 31 Ekim: bulut sınıfı Kapalı ise hazeC): 30 Ekim.
// Yağışlı ikonlar 8 Kas 2026'dan beri 4 şiddet kademeli: ad + T (< 1) / L (hafif) / — (normal) / H (kuvvetli).

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
function flakes(pts, r = 2.6) {
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

// Yağış şiddeti ikonları (8 Kas 2026, Ali Kemal): her tür 4 kademe — T (< 1 mm / 1 cm) · L hafif · (ek yok) normal ·
// H kuvvetli; T ve L'nin ifadesi aynı ("Hafif …"), ikonda bir öğe eksik çizilir. Kademe eşikleri lib/agreement.js
// (INTENSITY). Yağmur DAMLA (1 / 2 / 3 / 4), sağanak koyu bulut ve uzun eğik ÇİZGİ (2 / 3 / 5 = 3+2 / 7 = 4+3),
// gök gürültülü 2 çizgi + şimşek (kuvvetli 4), kar YILDIZ açık bulut (1 / 2 / 3 / 4 = 2+2), kar sağanağı aynı yıldızlar
// koyu bulut, gök gürültülü kar 2 yıldız + şimşek (kuvvetli 4). 4 kademeli tablo: SSS 10.
const tearPath = (x, y, r = 2.15) =>
  `M${x} ${+(y - r * 1.75).toFixed(2)}C${+(x + r * 0.25).toFixed(2)} ${+(y - r * 0.9).toFixed(2)} ${+(x + r).toFixed(2)} ${+(y - r * 0.2).toFixed(2)} ${+(x + r).toFixed(2)} ${+(y + r * 0.45).toFixed(2)}` +
  `A${r} ${r} 0 0 1 ${+(x - r).toFixed(2)} ${+(y + r * 0.45).toFixed(2)}C${+(x - r).toFixed(2)} ${+(y - r * 0.2).toFixed(2)} ${+(x - r * 0.25).toFixed(2)} ${+(y - r * 0.9).toFixed(2)} ${x} ${+(y - r * 1.75).toFixed(2)}Z`;
const tears = (pts) => pts.map(([x, y], i) => g([{ t: "path", d: tearPath(x, y), fill: DROP, stroke: DROP_EDGE, sw: 0.9, join: "round" }], null, { cls: `wx-dr k${i}` }));
const TEAR = {
  T: [[18.5, 30]],
  L: [[13.5, 30], [23, 30]],
  N: [[10.5, 30], [18.5, 30], [26.5, 30]],
  H: [[11, 28], [21, 28], [16, 32.3], [26, 32.3]],
};
// Eğik çizgi kümesi: xs başlangıçları, y0 → y1, eğim dx
const slant = (xs, y0, y1, dx) => xs.map((x) => [x, y0, +(x - dx).toFixed(2), y1]);
const SHOWER_T = slant([15.5, 22.5], 26.5, 33, 2.3);
const SHOWER_L = slant([12, 19, 26], 26.5, 33, 2.3);
const SHOWER = [...slant([10, 18.5, 27], 25, 28.5, 1.3), ...slant([14.25, 22.75], 30, 33.5, 1.3)];
const SHOWER_H = [...slant([8, 15, 22, 29], 25, 28.5, 1.3), ...slant([11.5, 18.5, 25.5], 30, 33.5, 1.3)];
const STORM = [[10, 26.5, 7.5, 33.5], [28, 26.5, 25.5, 33.5]];
const STORM_H = [[9, 26.5, 6.5, 33.5], [13.5, 26.5, 11, 33.5], [27.5, 26.5, 25, 33.5], [32, 26.5, 29.5, 33.5]];
const FLK = {
  T: [[18.5, 30.5]],
  L: [[13.5, 30.5], [23, 30.5]],
  N: [[11, 30], [18.5, 31.5], [26, 30]],
  H: [[11, 28.3], [21, 28.3], [16, 32.8], [26, 32.8]],
};

// Karla karışık (13 Kas 2026, Ali Kemal; MGM simgelerindeki gibi damla ile kar tanesi bir arada): açık bulut + damla
// ve yıldız dönüşümlü (Karla Karışık Yağmurlu; < 1 ve hafif 2 öğe, normal 3, kuvvetli 4); koyu bulut + eğik çizgi ve
// yıldız (Karla Karışık Sağanak; 2 / 3 / üstte 3 çizgi + altta 2 yıldız / üstte 4 çizgi + altta 3 yıldız)
const tear1 = (x, y, i) => g([{ t: "path", d: tearPath(x, y), fill: DROP, stroke: DROP_EDGE, sw: 0.9, join: "round" }], null, { cls: `wx-dr k${i}` });
const flake1 = (x, y, i, r = 2.6) => ({ ...flakes([[x, y]], r)[0], cls: `wx-fl k${i}` });
const line1 = (seg, w, i) => drops([seg], w, "wx-sh").map((n) => ({ ...n, cls: `wx-sh k${i}` }))[0];
const MIX_L = () => [tear1(13.5, 30, 0), flake1(23, 30.5, 1)];
const MIX_N = () => [tear1(10.5, 30, 0), flake1(18.5, 31, 1), tear1(26.5, 30, 2)];
const MIX_H = () => [tear1(11, 28, 0), flake1(21, 28.3, 1, 2.4), flake1(16, 32.8, 2, 2.4), tear1(26, 32.3, 3)];
const MIXSH_L1 = () => [line1(slant([15.5], 26.5, 33, 2.3)[0], 2.2, 0), flake1(23, 30, 1)];
const MIXSH_L = () => [line1(slant([12], 26.5, 33, 2.3)[0], 2.2, 0), flake1(19.5, 30, 1), line1(slant([28], 26.5, 33, 2.3)[0], 2.2, 2)];
const MIXSH_N = () => [...slant([10, 18.5, 27], 25, 28.5, 1.3).map((s, i) => line1(s, 1.9, i)), flake1(14.25, 32, 3, 2.2), flake1(22.75, 32, 4, 2.2)];
const MIXSH_H = () => [
  ...slant([8, 15, 22, 29], 25, 28.5, 1.3).map((s, i) => line1(s, 1.9, i)),
  flake1(11.5, 32, 4, 2.1),
  flake1(18.5, 32, 5, 2.1),
  flake1(25.5, 32, 6, 2.1),
];

// Rüzgar (13 Kas 2026, Ali Kemal): ucu kıvrık yatay rüzgar çizgileri, sis çizgileri gibi iki katman (koyu kenar + açık
// iç); Fırtınamsı Rüzgar 3 çizgi, Fırtına 4 daha kalın çizgi. Gece / gündüz aynı.
const WINDY_D = ["M4 12.5h17.5a3.6 3.6 0 1 0-3.6-3.6", "M4 18.5h24a3.8 3.8 0 1 1-3.8 3.8", "M4 24.5h13"];
const GALE_D = ["M3.5 9.5h18a3.4 3.4 0 1 0-3.4-3.4", "M3.5 15.5h25a3.6 3.6 0 1 1-3.6 3.6", "M3.5 21.5h20", "M3.5 27.5h14a3.4 3.4 0 1 1-3.4 3.4"];

// Sis ve pus (30 Ekim 2026, Ali Kemal: "WMO/MGM'nin sisli'sini ve iOS'un puslu'sunu bizim stile uygulayalım"; S1 + P2):
// Sisli = MGM/WMO sis işareti gibi 4 dalgalı çizgi (gece / gündüz aynı); Puslu = ufukta doğan güneş + 3 eşit düz
// çizgi, gece ay + çizgi. Çizgiler damla gibi iki katman (koyu kenar + açık iç), her zeminde seçilsin diye.
const LINE_EDGE = "#7C8B98";
const LINE = "#E4EAEF";
const lines2 = (ds, w) => ds.flatMap((d) => [{ t: "path", d, stroke: LINE_EDGE, sw: w + 1.8 }, { t: "path", d, stroke: LINE, sw: w }]);
function wave(x0, x1, y, amp = 1.3, wl = 6) {
  let d = `M${x0} ${y}`;
  let up = true;
  for (let x = x0; x < x1 - 0.01; x += wl / 2) {
    const nx = Math.min(x1, x + wl / 2);
    d += `Q${+((x + nx) / 2).toFixed(2)} ${+(up ? y - amp : y + amp).toFixed(2)} ${+nx.toFixed(2)} ${y}`;
    up = !up;
  }
  return d;
}
const HZ = 20.5; // ufuk
const halfDisc = (r, f) => ({ t: "path", d: `M${18 - r} ${HZ}A${r} ${r} 0 0 1 ${18 + r} ${HZ}Z`, fill: f });
const UPRAYS = `M18 ${HZ - 14}v3M8.1 ${HZ - 9.9}l2.1 2.1M27.9 ${HZ - 9.9}l-2.1 2.1M4.5 ${HZ - 2.5}h3M28.5 ${HZ - 2.5}h3`;
const rising = () => [
  { t: "path", d: UPRAYS, stroke: SUN_EDGE, sw: 3.4 },
  halfDisc(8.2, SUN_EDGE),
  { t: "path", d: UPRAYS, stroke: SUN, sw: 2 },
  halfDisc(7.4, SUN),
];
const HAZE_LINES = () => lines2([`M5 ${HZ + 2.5}L31 ${HZ + 2.5}`, `M5 ${HZ + 7.5}L31 ${HZ + 7.5}`, `M5 ${HZ + 12.5}L31 ${HZ + 12.5}`], 2.4);

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
  rainT: [up(cloud(false)), ...tears(TEAR.T)],
  rainL: [up(cloud(false)), ...tears(TEAR.L)],
  rain: [up(cloud(false)), ...tears(TEAR.N)],
  rainH: [up(cloud(false)), ...tears(TEAR.H)],
  showerT: [up(cloud(true)), ...drops(SHOWER_T, 2.2, "wx-sh")],
  showerL: [up(cloud(true)), ...drops(SHOWER_L, 2.2, "wx-sh")],
  shower: [up(cloud(true)), ...drops(SHOWER, 1.9, "wx-sh")],
  showerH: [up(cloud(true)), ...drops(SHOWER_H, 1.9, "wx-sh")],
  storm: [up(cloud(true)), ...drops(STORM, 2.2, "wx-sh"), BOLT],
  stormH: [up(cloud(true)), ...drops(STORM_H, 2, "wx-sh"), BOLT],
  snowT: [up(cloud(false)), ...flakes(FLK.T)],
  snowL: [up(cloud(false)), ...flakes(FLK.L)],
  snow: [up(cloud(false)), ...flakes(FLK.N)],
  snowH: [up(cloud(false)), ...flakes(FLK.H)],
  snowshowerT: [up(cloud(true)), ...flakes(FLK.T)],
  snowshowerL: [up(cloud(true)), ...flakes(FLK.L)],
  snowshower: [up(cloud(true)), ...flakes(FLK.N)],
  snowshowerH: [up(cloud(true)), ...flakes(FLK.H)],
  mixT: [up(cloud(false)), ...MIX_L()],
  mixL: [up(cloud(false)), ...MIX_L()],
  mix: [up(cloud(false)), ...MIX_N()],
  mixH: [up(cloud(false)), ...MIX_H()],
  mixshowerT: [up(cloud(true)), ...MIXSH_L1()],
  mixshowerL: [up(cloud(true)), ...MIXSH_L()],
  mixshower: [up(cloud(true)), ...MIXSH_N()],
  mixshowerH: [up(cloud(true)), ...MIXSH_H()],
  snowstorm: [up(cloud(true)), ...flakes([[10, 30], [28, 30]]), BOLT],
  snowstormH: [up(cloud(true)), ...flakes([[7.5, 28.5], [11.5, 32.5], [27, 28.5], [31, 32.5]], 2.4), BOLT],
  windy: lines2(WINDY_D, 2.5),
  gale: lines2(GALE_D, 3),
  fog: lines2([wave(5, 31, 11), wave(5, 31, 16.5), wave(5, 31, 22), wave(5, 31, 27.5)], 2),
  haze: [...rising(), ...HAZE_LINES()],
  hazeN: [g(moon(), [1, -3, 0.75]), ...HAZE_LINES()],
  // Puslu + Kapalı (31 Ekim): güneş / ay yerine bulut, altında aynı 3 çizgi (gece ve gündüz aynı)
  hazeC: [g(cloud(false), [0, -3, 1]), ...HAZE_LINES()],
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
