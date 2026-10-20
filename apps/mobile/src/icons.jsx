// Uygulama ikonları ve gökyüzü renkleri (Prototip 9). Durum ifadesinin kuralları web ile ortak
// (lib/agreement.js condAt / consensusCond); burada yalnız o sonucun ekrandaki görünüşü seçilir.

const CL =
  '<ellipse cx="15" cy="19" rx="8.5" ry="6.5" fill="#B7C2CC"/><rect x="14" y="16" width="20" height="9" rx="4.5" fill="#EEF2F5"/><ellipse cx="24" cy="14" rx="11" ry="8.5" fill="#F3F6F8"/><ellipse cx="32" cy="18.5" rx="7.5" ry="6" fill="#DCE3E8"/>';
const CLd =
  '<ellipse cx="15" cy="19" rx="8.5" ry="6.5" fill="#8E9AA6"/><rect x="14" y="16" width="20" height="9" rx="4.5" fill="#C9D2DA"/><ellipse cx="24" cy="14" rx="11" ry="8.5" fill="#D3DAE1"/><ellipse cx="32" cy="18.5" rx="7.5" ry="6" fill="#B6C1CB"/>';

const ICON = {
  sun: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#FFD27A" opacity=".28"/><circle cx="20" cy="20" r="10" fill="#FFC857"/></svg>',
  moon: '<svg viewBox="0 0 40 40"><path d="M25 7a13 13 0 1 0 9 22 11 11 0 0 1-9-22z" fill="#EEF1F6"/></svg>',
  sunC: '<svg viewBox="0 0 40 40"><circle cx="14" cy="13" r="8" fill="#FFC857"/><g transform="translate(3,6)">' + CL + "</g></svg>",
  moonC: '<svg viewBox="0 0 40 40"><path d="M16 4a9 9 0 1 0 7 15 8 8 0 0 1-7-15z" fill="#EEF1F6"/><g transform="translate(3,7)">' + CL + "</g></svg>",
  cloud: '<svg viewBox="4 2 36 30">' + CL + "</svg>",
  rain:
    '<svg viewBox="4 2 36 36" class="rain">' +
    CL +
    '<line class="dr" x1="16" y1="27" x2="13" y2="34"/><line class="dr d2" x1="23" y1="27" x2="20" y2="34"/><line class="dr d3" x1="30" y1="27" x2="27" y2="34"/></svg>',
  rainH:
    '<svg viewBox="4 2 36 36" class="rain">' +
    CL +
    '<line class="dr" x1="13" y1="26" x2="10" y2="35"/><line class="dr d2" x1="19" y1="26" x2="16" y2="35"/><line class="dr d3" x1="25" y1="26" x2="22" y2="35"/><line class="dr d4" x1="31" y1="26" x2="28" y2="35"/></svg>',
  storm:
    '<svg viewBox="4 2 36 38" class="rain">' +
    CL +
    '<line class="dr" x1="14" y1="26" x2="11" y2="34"/><line class="dr d3" x1="30" y1="26" x2="27" y2="34"/><path d="M24 24l-6 9h5l-3.5 8 9-11h-5.5z" fill="#FFC857"/></svg>',
  snow:
    '<svg viewBox="4 2 36 36" class="rain">' +
    CL +
    '<circle class="fl" cx="15" cy="30" r="2"/><circle class="fl d2" cx="23" cy="31" r="2"/><circle class="fl d3" cx="31" cy="30" r="2"/></svg>',
  snowH:
    '<svg viewBox="4 2 36 36" class="rain">' +
    CL +
    '<circle class="fl" cx="12" cy="29" r="2"/><circle class="fl d2" cx="19" cy="32" r="2"/><circle class="fl d3" cx="26" cy="29" r="2"/><circle class="fl d4" cx="33" cy="32" r="2"/></svg>',
  snowStorm:
    '<svg viewBox="4 2 36 38" class="rain">' +
    CL +
    '<circle class="fl" cx="13" cy="30" r="2"/><circle class="fl d3" cx="31" cy="30" r="2"/><path d="M24 24l-6 9h5l-3.5 8 9-11h-5.5z" fill="#FFC857"/></svg>',
  overcast: '<svg viewBox="2 0 38 32"><g transform="translate(-3,-3)" opacity=".85">' + CLd + '</g><g transform="translate(2,3)">' + CLd + "</g></svg>",
};

export const SKY = {
  "day-clear": "linear-gradient(172deg,#1E6F8C 0%,#4E9DB0 52%,#E3C58E 100%)",
  "day-cloud": "linear-gradient(172deg,#4F6A75 0%,#7C939A 55%,#BDB8A2 100%)",
  "dawn-clear": "linear-gradient(172deg,#34466E 0%,#B77458 60%,#EAB56C 100%)",
  "dawn-cloud": "linear-gradient(172deg,#3B4760 0%,#8C7068 60%,#C7A27E 100%)",
  "dusk-clear": "linear-gradient(172deg,#2C3560 0%,#A35F5B 58%,#E39B5E 100%)",
  "dusk-cloud": "linear-gradient(172deg,#343B55 0%,#7A6068 60%,#B08C78 100%)",
  "night-clear": "linear-gradient(172deg,#0E1A24 0%,#1B3040 58%,#34495A 100%)",
  "night-cloud": "linear-gradient(172deg,#171D22 0%,#2B343B 58%,#454E55 100%)",
  rain: "linear-gradient(172deg,#2F3F4C 0%,#4E6170 55%,#7F919B 100%)",
  nodata: "linear-gradient(172deg,#3A423E 0%,#59625D 100%)",
  snow: "linear-gradient(172deg,#4D6070 0%,#8395A5 55%,#C3CFD8 100%)",
  overcast: "linear-gradient(172deg,#3E4A50 0%,#5E6B71 55%,#8E989B 100%)",
};

export const CLS_TXT = ["Açık", "Az Bulutlu", "Parçalı Bulutlu", "Çok Bulutlu", "Kapalı"];
export const CLS_RNG = ["% 0–10", "% 10–30", "% 30–50", "% 50–90", "% 90–100"];

// lib/agreement.js ikon adı → uygulama ikonu
const WET_ICON = { rain: "rain", shower: "rainH", storm: "storm", snow: "snow", snowshower: "snowH", snowstorm: "snowStorm" };
const DRY_CLASS = { clear: 0, few: 1, part: 2, cloud: 3, over: 4 };

// cond: condAt / consensusCond sonucu ({ text, ic, wet, snow }); h: saat (0–23)
export function condView(cond, h) {
  if (!cond) return { text: "Veri yok", icon: "cloud", sky: "nodata", wet: false, cls: null };
  if (cond.wet) return { text: cond.text, icon: WET_ICON[cond.ic] || "rain", sky: cond.snow ? "snow" : "rain", wet: true, snow: !!cond.snow, cls: null };
  const k = DRY_CLASS[String(cond.ic).replace(/N$/, "")] ?? 3;
  const ph = h >= 8 && h <= 17 ? "day" : h === 6 || h === 7 ? "dawn" : h === 18 || h === 19 ? "dusk" : "night";
  const night = ph === "night";
  const icon = k === 0 ? (night ? "moon" : "sun") : k <= 2 ? (night ? "moonC" : "sunC") : k === 3 ? "cloud" : "overcast";
  const sky = k === 4 ? "overcast" : k <= 1 ? `${ph}-clear` : `${ph}-cloud`;
  return { text: cond.text, icon, sky, wet: false, cls: k };
}

// Sayfa 3 hava durumu satırı: gökyüzü renginin düz karşılığı (SVG içinde degrade yerine) ve SVG içine yerleştirilen ikon
export const SKY_SOLID = {
  "day-clear": "#4E9DB0",
  "day-cloud": "#7C939A",
  "dawn-clear": "#B77458",
  "dawn-cloud": "#8C7068",
  "dusk-clear": "#A35F5B",
  "dusk-cloud": "#7A6068",
  "night-clear": "#1B3040",
  "night-cloud": "#2B343B",
  rain: "#4E6170",
  nodata: "#59625D",
  snow: "#8395A5",
  overcast: "#5E6B71",
};
export function iconSvgAt(name, x, y, size) {
  return (ICON[name] || ICON.cloud).replace("<svg ", `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size}" height="${size}" `);
}

export function WxIcon({ name, className, style }) {
  return <span className={className} style={style} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[name] || ICON.cloud }} />;
}

// Saat şeridindeki küçük ikon: gökyüzü renginde kare
export function HourIcon({ view }) {
  return (
    <span className="hic" style={{ background: SKY[view.sky] }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON[view.icon] || ICON.cloud }} />
  );
}

// Uyum işareti: hemfikir ✓ · kısmen ~ · ayrışıyor ≠
const MARK = {
  ok: <path d="M2.4 6.4 L5 9 L9.6 3.4" />,
  partial: <path d="M1.8 7.2 C3.1 4.6 4.7 4.6 6 6 C7.3 7.4 8.9 7.4 10.2 4.8" />,
  split: (
    <>
      <path d="M2.2 4.6 H9.8" />
      <path d="M2.2 7.4 H9.8" />
      <path d="M8.2 2 L3.8 10" />
    </>
  ),
  na: <circle cx="6" cy="6" r="1.2" fill="currentColor" stroke="none" />,
};
export function Mark({ level }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", overflow: "visible" }}>
      {MARK[level] || MARK.na}
    </svg>
  );
}
