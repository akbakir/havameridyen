// Uygulama ikonları ve gökyüzü renkleri (Prototip 9). Durum ifadesinin kuralları web ile ortak
// (lib/agreement.js condAt / consensusCond); burada yalnız o sonucun ekrandaki görünüşü seçilir.
import { wxSvg } from "@lib/wxicons";

// Hava ikonları lib/wxicons.js'ten: site ve widget'larla ortak 16 ikon (26 Ekim). Adlar lib/agreement.js ic adlarıdır
// (clear, few, part + gece "N"; cloud, over; rain, rainL, shower, showerL, storm, snow, snowshower, snowstorm;
// 30 Ekim: fog, haze, hazeN; 31 Ekim: hazeC — puslu ve kapalı);
// wxSvg(ad) tam SVG metnini verir, bilinmeyen ad → Çok Bulutlu.
export const SKY = {
  "day-clear": "linear-gradient(172deg,#1E6F8C 0%,#4E9DB0 52%,#E3C58E 100%)",
  "day-cloud": "linear-gradient(172deg,#4F6A75 0%,#7C939A 55%,#BDB8A2 100%)",
  "dawn-clear": "linear-gradient(172deg,#34466E 0%,#A67B69 60%,#D4B282 100%)",
  "dawn-cloud": "linear-gradient(172deg,#3B4760 0%,#86736E 60%,#BAA28B 100%)",
  "dusk-clear": "linear-gradient(172deg,#2C3560 0%,#966A68 58%,#CC9D75 100%)",
  "dusk-cloud": "linear-gradient(172deg,#343B55 0%,#75656A 60%,#A68F82 100%)",
  "night-clear": "linear-gradient(172deg,#0E1A24 0%,#1B3040 58%,#34495A 100%)",
  "night-cloud": "linear-gradient(172deg,#171D22 0%,#2B343B 58%,#454E55 100%)",
  rain: "linear-gradient(172deg,#2F3F4C 0%,#4E6170 55%,#7F919B 100%)",
  nodata: "linear-gradient(172deg,#3A423E 0%,#59625D 100%)",
  snow: "linear-gradient(172deg,#4D6070 0%,#8395A5 55%,#C3CFD8 100%)",
  overcast: "linear-gradient(172deg,#3E4A50 0%,#5E6B71 55%,#8E989B 100%)",
  // Sis / pus (30 Ekim): soluk gri-mavi gökyüzü
  fog: "linear-gradient(172deg,#55636B 0%,#7E8C93 55%,#AEB7B9 100%)",
};

export const CLS_TXT = ["Açık", "Az Bulutlu", "Parçalı Bulutlu", "Çok Bulutlu", "Kapalı"];
export const CLS_RNG = ["% 0–10", "% 10–30", "% 30–50", "% 50–90", "% 90–100"];

// cond: condAt / consensusCond sonucu ({ text, ic, wet, snow }); h: saat (0–23)
export function condView(cond, h) {
  if (!cond) return { text: "Veri yok", icon: "cloud", sky: "nodata", wet: false, cls: null };
  if (cond.wet) return { text: cond.text, icon: cond.ic || "rain", sky: cond.snow ? "snow" : "rain", wet: true, snow: !!cond.snow, cls: null };
  // Sis / pus (30 Ekim): ikon kuraldan (fog · haze · gece hazeN)
  if (cond.obs) return { text: cond.text, icon: cond.ic, sky: "fog", wet: false, cls: null, obs: cond.obs };
  const base = String(cond.ic).replace(/N$/, "");
  const k = DRY_CLASS[base] ?? 3;
  const ph = h >= 8 && h <= 17 ? "day" : h === 6 || h === 7 ? "dawn" : h === 18 || h === 19 ? "dusk" : "night";
  const night = ph === "night";
  const icon = k <= 2 ? DRY_ICON[k] + (night ? "N" : "") : DRY_ICON[k];
  const sky = k === 4 ? "overcast" : k <= 1 ? `${ph}-clear` : `${ph}-cloud`;
  return { text: cond.text, icon, sky, wet: false, cls: k };
}

const DRY_CLASS = { clear: 0, few: 1, part: 2, cloud: 3, over: 4 };
const DRY_ICON = ["clear", "few", "part", "cloud", "over"];

// Sayfa 3 hava durumu satırı: gökyüzü renginin düz karşılığı (SVG içinde degrade yerine) ve SVG içine yerleştirilen ikon
export const SKY_SOLID = {
  "day-clear": "#4E9DB0",
  "day-cloud": "#7C939A",
  "dawn-clear": "#A67B69",
  "dawn-cloud": "#86736E",
  "dusk-clear": "#966A68",
  "dusk-cloud": "#75656A",
  "night-clear": "#1B3040",
  "night-cloud": "#2B343B",
  rain: "#4E6170",
  nodata: "#59625D",
  snow: "#8395A5",
  overcast: "#5E6B71",
  fog: "#7E8C93",
};
export function iconSvgAt(name, x, y, size) {
  return wxSvg(name).replace("<svg ", `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size}" height="${size}" `);
}

export function WxIcon({ name, className, style }) {
  return <span className={className} style={style} aria-hidden="true" dangerouslySetInnerHTML={{ __html: wxSvg(name) }} />;
}

// Saat şeridindeki küçük ikon: gökyüzü renginde kare
export function HourIcon({ view }) {
  return (
    <span className="hic" style={{ background: SKY[view.sky] }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: wxSvg(view.icon) }} />
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
