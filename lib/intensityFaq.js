// SSS 10 ve 11 — yağış ve kar şiddeti (8 Kas 2026, Ali Kemal onaylı metin: "SSS-10-11-taslak"). Web (/sss) ve mobil
// (ⓘ › SSS) aynı içeriği bu dosyadan gösterir; her taraf blokları kendi biçimiyle çizer (components/IntensityFaq.js,
// apps/mobile/src/views/IntensityFaq.jsx). Eşikler lib/agreement.js INTENSITY ile aynıdır; ikonlar lib/wxicons.js.
// Blok: { t: "p" | "h" | "ul" | "table" | "icons" | "svg" | "refs", … } · metinlerde <b>…</b> kalın yazılır.

import { INTENSITY } from "./agreement";

const tr = (v) => String(v).replace(".", ",");
const PERIODS = [
  [1, "1 saat"],
  [3, "3 saat"],
  [6, "6 saat"],
  [12, "12 saat"],
  [24, "Gün"],
];

// MGM şiddetli yağış eşikleri (Maksimum Yağışlar sayfası): süre (dk) → mm
export const MGM_CURVE = [
  [5, 5.0], [10, 7.1], [15, 8.6], [30, 12.2], [60, 17.1], [120, 24.0], [180, 29.0], [240, 33.2], [300, 36.7], [360, 39.7], [480, 44.7], [720, 52.0], [1080, 58.1], [1440, 60.0],
];
const RATIO = { 1: 17.1 / 52, 3: 29 / 52, 6: 39.7 / 52, 12: 1, 24: 60 / 52 };

// İkon tablosu (tür × kademe): [ad, [ikon, ifade] × 4 (< 1, hafif, normal, kuvvetli)]
export const ICON_ROWS = [
  ["Yağmur", [["rainT", "Hafif Yağmurlu"], ["rainL", "Hafif Yağmurlu"], ["rain", "Yağmurlu"], ["rainH", "Kuvvetli Yağmurlu"]]],
  ["Sağanak", [["showerT", "Hafif Sağanak Yağış"], ["showerL", "Hafif Sağanak Yağış"], ["shower", "Sağanak Yağış"], ["showerH", "Kuvvetli Sağanak Yağış"]]],
  ["Gök gürültülü sağanak", [["storm", "Gök Gürültülü Sağanak Yağış"], ["storm", "aynı"], ["storm", "aynı"], ["stormH", "Kuvvetli Gök Gürültülü Sağanak Yağış"]]],
  ["Kar", [["snowT", "Hafif Kar"], ["snowL", "Hafif Kar"], ["snow", "Kar Yağışlı"], ["snowH", "Yoğun Kar Yağışlı"]]],
  ["Kar sağanağı", [["snowshowerT", "Hafif Kar Sağanağı"], ["snowshowerL", "Hafif Kar Sağanağı"], ["snowshower", "Kar Sağanağı"], ["snowshowerH", "Kuvvetli Kar Sağanağı"]]],
  ["Gök gürültülü kar", [["snowstorm", "Gök Gürültülü Kar Sağanağı"], ["snowstorm", "aynı"], ["snowstorm", "aynı"], ["snowstormH", "Kuvvetli Gök Gürültülü Kar Sağanağı"]]],
];
export const ICON_COLS = ["1'in altı", "Hafif", "Normal", "Kuvvetli"];

const LEVEL_TABLE = {
  t: "table",
  head: ["Kademe", ...PERIODS.map((p) => p[1])],
  rows: [
    ["Hafif", ...PERIODS.map(([h]) => `≤ ${tr(INTENSITY[h][0])}`)],
    ["Normal", ...PERIODS.map(([h]) => `${tr(INTENSITY[h][0])} – ${tr(INTENSITY[h][1])}`)],
    ["Kuvvetli", ...PERIODS.map(([h]) => `> ${tr(INTENSITY[h][1])}`)],
  ],
};

const REF = {
  hadSid: { text: "MGM — Meteorolojik Hadiselerin Şiddetlerine Ait Sınıflandırma", url: "https://www.mgm.gov.tr/site/yardim1.aspx?=HadSid" },
  simge: { text: "MGM — Hadise simgeleri (WMO ww 00–99)", url: "https://www.mgm.gov.tr/site/yardim1.aspx?=Simgeler99" },
  maks: { text: "MGM — Maksimum Yağışlar (şiddetli yağış eşikleri)", url: "https://www.mgm.gov.tr/veridegerlendirme/maksimum-yagislar.aspx" },
  ams: { text: "AMS Glossary of Meteorology — Rain", url: "https://glossary.ametsoc.org/wiki/Rain" },
  manobs: {
    text: "Environment and Climate Change Canada — MANOBS (8. baskı)",
    url: "https://www.canada.ca/en/environment-climate-change/services/weather-manuals-documentation/manobs-surface-observations.html",
  },
};

export const FAQ_INTENSITY = {
  q: "Yağış ve kar şiddeti nasıl sınıflandırılıyor, ikonlar ne anlama geliyor?",
  blocks: [
    {
      t: "p",
      text: "Yağışı üç kademede gösteriyoruz: <b>hafif</b>, <b>normal</b> ve <b>kuvvetli</b>. Kademe, o periyotta düşen toplam yağışa (mm), karda ise yeni yağan kar kalınlığına (cm) göre belirlenir. 12 saatlik sınırlar MGM'nin resmî sınıflandırmasından [1] gelir; 1, 3 ve 6 saatlik periyotlar ile gün bu sınırlardan uyarlanmıştır (hesabı 11. soruda).",
    },
    LEVEL_TABLE,
    { t: "p", text: "Sınırlar yağış (mm) ve kar (cm) için aynıdır. 1 mm / 1 cm'nin altındaki yağış da \"Hafif\" yazılır; ikonda bir damla, çizgi ya da yıldız eksik çizilir." },
    { t: "h", text: "Yağışın türü" },
    {
      t: "ul",
      items: [
        "Karın su eşdeğeri yağışın en az yarısıysa yağış kardır.",
        "Türü atmosferin kararsızlığı (CAPE) belirler: 500 J/kg'a kadar yağmur ya da kar; 500–1000 arası sağanak ya da kar sağanağı; 1000'in üstünde gök gürültülü.",
        "AIFS modeli CAPE vermediği için türü yağışın sağanak payına göre belirlenir.",
      ],
    },
    { t: "h", text: "İkonlar" },
    { t: "icons" },
    {
      t: "p",
      text: "Yağmurda açık bulut ve damla, sağanakta koyu bulut ve eğik çizgi, karda yıldız kullanılır. Gök gürültülü türlerde yalnız kuvvetli kademe ayrı çizilir. Kar türlerinin karşılığı WMO hadise kodlarında 70–75 (kar yağışı) ve 85–86'dır (kar sağanağı) [2].",
    },
    { t: "p", text: "Ortak tahminde yağış miktarı, yağış veren modellerin ortancasıdır; kademe bu miktara göre seçilir." },
    { t: "refs", items: [REF.hadSid, REF.simge] },
  ],
};

const r2 = (v) => tr(Math.round(v * 100) / 100);
export const FAQ_THRESHOLDS = {
  q: "Şiddet eşikleri nasıl hesaplandı?",
  blocks: [
    {
      t: "p",
      text: "MGM'nin yağış ve kar şiddeti sınıflandırması [1] yalnız 12 saatlik periyot için verilmiştir. Biz ise yağışı 1, 3 ve 6 saatlik periyotlarda ve gün olarak gösteriyoruz; bu periyotların sınırlarını 12 saatlik sınırlardan türettik.",
    },
    { t: "h", text: "Neden doğrudan bölmedik?" },
    {
      t: "p",
      text: "12 saatlik sınırı süreyle orantılı bölmek (1 saat için ÷ 12), yağışın 12 saate eşit yayıldığını varsayar. Gerçekte yağış kısa sürede daha yoğun düşer. Doğrudan bölmeyle saatte 2 mm \"kuvvetli\" çıkardı; oysa uluslararası gözlem standartlarında (AMS [3], Kanada MANOBS [4]) saatte 2,5 mm'ye kadar yağış hafif sayılır.",
    },
    { t: "h", text: "MGM'nin süre eğrisi" },
    {
      t: "p",
      text: "MGM, şiddetli yağışı süreye bağlı eşiklerle tanımlar [2]. Süre 1 saatten 12 saate 12 kat uzarken eşik yalnız 3 kat artar (17,1 → 52 mm). Bu eğri, yağış miktarının süreyle nasıl büyüdüğünü MGM'nin kendi verisiyle gösterir.",
    },
    { t: "svg", which: "curve", caption: "MGM şiddetli yağış eşiği (mavi) ve doğrudan bölme varsayımı (kesikli)." },
    { t: "h", text: "Katsayılar ve sınırlar" },
    { t: "p", text: "Her periyodun eşiği 12 saatlik eşiğe bölünerek bir katsayı bulundu:" },
    {
      t: "table",
      head: ["Süre", "MGM eşiği", "12 saate oran", "Katsayı"],
      rows: [
        ["1 saat", "17,1 mm", "17,1 / 52", "0,33"],
        ["3 saat", "29,0 mm", "29,0 / 52", "0,56"],
        ["6 saat", "39,7 mm", "39,7 / 52", "0,76"],
        ["12 saat", "52,0 mm", "52,0 / 52", "1,00"],
        ["24 saat (gün)", "60,0 mm", "60,0 / 52", "1,15"],
      ],
    },
    { t: "p", text: "MGM'nin 12 saatlik sınırları (5 ve 20) bu katsayılarla çarpılıp yuvarlandı (10'un altında en yakın 0,5'e, üstünde tam sayıya):" },
    {
      t: "table",
      head: ["MGM 12 saat sınırı", ...PERIODS.map((p) => p[1])],
      rows: [
        ["5 (hafif üst)", ...PERIODS.map(([h]) => (h === 12 ? "5" : `${r2(5 * RATIO[h])} → ${tr(INTENSITY[h][0])}`))],
        ["20 (normal üst)", ...PERIODS.map(([h]) => (h === 12 ? "20" : `${r2(20 * RATIO[h])} → ${tr(INTENSITY[h][1])}`))],
      ],
    },
    { t: "svg", which: "bounds", caption: "Periyotlara uyarlanmış kademe sınırları (yuvarlamadan önce)." },
    { t: "p", text: "Sonuç tablosu 10. sorudadır. 1 mm / 1 cm sınırı ölçeklenmedi; MGM'de hafif sınıfı bu değerden başlar." },
    { t: "h", text: "Bilmeniz gerekenler" },
    {
      t: "ul",
      items: [
        "Bu tablo MGM'nin yayımladığı bir sınıflandırma değil, MGM'nin iki tablosundan türetilmiş bir uyarlamadır.",
        "MGM'nin şiddetli yağış için verdiği süre ilişkisinin daha hafif yağışlar için de geçerli olduğu varsayılmıştır; kar için de aynı eğri kullanılmıştır.",
        "MGM eşikleri istasyon ölçümüne göredir. Model değerleri birkaç kilometrelik bir alanın ortalamasıdır ve uç yağışları yumuşatır; kuvvetli kademe bu yüzden istasyondakinden seyrek görünebilir.",
        "MGM'nin notu: sınıflandırma bölgeler arası topografik farklılıklar dikkate alınmadan yapılmıştır.",
      ],
    },
    { t: "refs", items: [REF.hadSid, REF.maks, REF.ams, REF.manobs] },
  ],
};

// --- Grafikler (SVG metni; renkler: çizgi #168BA0, vurgu #E8A23A, metin currentColor) ---
const W = 340;
const H = 200;
const PAD = { l: 34, r: 22, t: 12, b: 28 };
const fx = (v) => +v.toFixed(1);

function frame(yMax, yTicks, xTicks, xOf, body) {
  const yOf = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / yMax);
  const grid = yTicks
    .map((v) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${fx(yOf(v))}" y2="${fx(yOf(v))}" stroke="currentColor" stroke-opacity=".12"/><text x="${PAD.l - 5}" y="${fx(yOf(v) + 3.5)}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity=".7">${v}</text>`)
    .join("");
  const xs = xTicks
    .map(([v, t], k, a) => `<line x1="${fx(xOf(v))}" x2="${fx(xOf(v))}" y1="${PAD.t}" y2="${H - PAD.b}" stroke="currentColor" stroke-opacity=".08"/><text x="${fx(xOf(v))}" y="${H - PAD.b + 14}" text-anchor="${k === 0 ? "start" : "middle"}" font-size="10" fill="currentColor" fill-opacity=".7">${t}</text>`)
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" style="max-width:520px;display:block">${grid}${xs}${body(yOf)}</svg>`;
}

// Şekil 1: MGM şiddetli yağış eşiği (logaritmik süre ekseni) + doğrudan bölme varsayımı
export function curveSvg() {
  const lx = (m) => Math.log(m);
  const x0 = lx(5);
  const x1 = lx(1440);
  const xOf = (m) => PAD.l + ((W - PAD.l - PAD.r) * (lx(m) - x0)) / (x1 - x0);
  const ticks = [[5, "5 dk"], [30, "30 dk"], [60, "1 sa"], [180, "3 sa"], [360, "6 sa"], [720, "12"], [1440, "24 sa"]];
  return frame(70, [0, 20, 40, 60], ticks, xOf, (yOf) => {
    const line = MGM_CURVE.map(([m, v], k) => `${k ? "L" : "M"}${fx(xOf(m))} ${fx(yOf(v))}`).join("");
    const lin = MGM_CURVE.filter(([m]) => (m / 720) * 52 <= 70).map(([m], k) => `${k ? "L" : "M"}${fx(xOf(m))} ${fx(yOf((m / 720) * 52))}`).join("");
    const pts = [60, 180, 360, 720, 1440]
      .map((m) => {
        const v = MGM_CURVE.find((c) => c[0] === m)[1];
        return `<circle cx="${fx(xOf(m))}" cy="${fx(yOf(v))}" r="3.5" fill="#E8A23A"/><text x="${fx(xOf(m) - 4)}" y="${fx(yOf(v) - 7)}" text-anchor="end" font-size="9.5" fill="currentColor">${tr(v)} · ×${tr((v / 52).toFixed(2))}</text>`;
      })
      .join("");
    return `<path d="${lin}" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.3" stroke-dasharray="4 3"/><path d="${line}" fill="none" stroke="#168BA0" stroke-width="2.2"/>${pts}`;
  });
}

// Şekil 2: periyotlara uyarlanmış sınırlar (hafif / normal / kuvvetli alanları; yuvarlamadan önce)
export function boundsSvg() {
  const P = [1, 3, 6, 12, 24];
  const lx = (h) => Math.log(h);
  const xOf = (h) => PAD.l + 8 + ((W - PAD.l - PAD.r - 16) * (lx(h) - lx(1))) / (lx(24) - lx(1));
  const ticks = [[1, "1 sa"], [3, "3 sa"], [6, "6 sa"], [12, "12 sa"], [24, "Gün"]];
  return frame(30, [0, 5, 10, 15, 20, 25, 30], ticks, xOf, (yOf) => {
    const lo = P.map((h) => [xOf(h), 5 * RATIO[h]]);
    const hi = P.map((h) => [xOf(h), 20 * RATIO[h]]);
    const path = (a) => a.map(([x, v], k) => `${k ? "L" : "M"}${fx(x)} ${fx(yOf(v))}`).join("");
    const area = (top, bot) => `${path(top)}L${[...bot].reverse().map(([x, v]) => `${fx(x)} ${fx(yOf(v))}`).join("L")}Z`;
    const one = P.map((h) => [xOf(h), 1]);
    const ceil = P.map((h) => [xOf(h), 30]);
    const lab = (a, dy) => a.map(([x, v]) => `<text x="${fx(x)}" y="${fx(yOf(v) + dy)}" text-anchor="middle" font-size="9" fill="currentColor">${r2(v)}</text>`).join("");
    return (
      `<path d="${area(ceil, hi)}" fill="#2F6F86" fill-opacity=".55"/><path d="${area(hi, lo)}" fill="#8CC4D6" fill-opacity=".6"/><path d="${area(lo, one)}" fill="#CFE6EE" fill-opacity=".8"/>` +
      `<path d="${path(hi)}" fill="none" stroke="#1E3A3A" stroke-width="1.6"/><path d="${path(lo)}" fill="none" stroke="#168BA0" stroke-width="1.6"/>` +
      `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${fx(yOf(1))}" y2="${fx(yOf(1))}" stroke="#E8A23A" stroke-dasharray="4 3"/>` +
      lab(hi, -5) +
      lab(lo, -5) +
      `<text x="${fx(xOf(24) - 2)}" y="${fx(yOf(27))}" text-anchor="end" font-size="10" fill="#fff">kuvvetli</text>` +
      `<text x="${fx(xOf(12))}" y="${fx(yOf(13))}" text-anchor="middle" font-size="10" fill="currentColor">normal</text>` +
      `<text x="${fx(xOf(12))}" y="${fx(yOf(2.6))}" text-anchor="middle" font-size="10" fill="currentColor">hafif</text>` +
      `<text x="${fx(xOf(24) - 2)}" y="${fx(yOf(1) - 3)}" text-anchor="end" font-size="9" fill="#B07413">&lt; 1 (sabit)</text>`
    );
  });
}
