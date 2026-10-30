// Widget hava ikonları: lib/wxicons.js'teki ortak çizimlerden Android vektörleri (res/drawable/wx_*.xml, 36 × 36,
// hareketsiz). İkonlar değişirse yeniden çalıştırılır (apps/mobile klasöründen):
//   node --no-warnings scripts/gen_widget_icons.mjs android/app/src/main/res
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { WX_ICONS, pathDataOf } from "../../../lib/wxicons.js";

const OUT = process.argv[2];
const HDR = '<?xml version="1.0" encoding="utf-8"?>\n<!-- havameridyen: üretildi (scripts/gen_widget_icons.mjs, lib/wxicons.js). Elle düzenlemeyin. -->\n';

// lib/wxicons.js adı → widget drawable adı (eski adlar korunur; dört yeni ad)
const NAMES = {
  clear: "wx_sun",
  clearN: "wx_moon",
  few: "wx_sun_few",
  fewN: "wx_moon_few",
  part: "wx_sun_cloud",
  partN: "wx_moon_cloud",
  cloud: "wx_cloud",
  over: "wx_overcast",
  rainL: "wx_rain_light",
  rain: "wx_rain",
  showerL: "wx_shower_light",
  shower: "wx_rain_heavy",
  storm: "wx_storm",
  snow: "wx_snow",
  snowshower: "wx_snow_heavy",
  snowstorm: "wx_snow_storm",
  fog: "wx_fog", // 30 Ekim: Sisli
  haze: "wx_haze", // Puslu (gündüz)
  hazeN: "wx_haze_night", // Puslu (gece)
};

function node(n, ind, op) {
  const p = " ".repeat(ind);
  if (n.t === "g") {
    const o = n.op != null ? (op ?? 1) * n.op : op;
    const kids = n.kids.map((k) => node(k, ind + 4, o)).join("");
    if (!n.tr) return kids;
    const [dx, dy, s] = n.tr;
    const a = [`${p}<group`];
    if (dx) a.push(`${p}    android:translateX="${dx}"`);
    if (dy) a.push(`${p}    android:translateY="${dy}"`);
    if (s !== 1) a.push(`${p}    android:scaleX="${s}"`, `${p}    android:scaleY="${s}"`);
    return a.join("\n") + ">\n" + kids + `${p}</group>\n`;
  }
  const a = [`${p}<path`];
  if (n.fill) a.push(`${p}    android:fillColor="${n.fill}"`);
  if (n.fill && op != null && op !== 1) a.push(`${p}    android:fillAlpha="${op}"`);
  if (n.stroke) {
    a.push(`${p}    android:strokeColor="${n.stroke}"`, `${p}    android:strokeWidth="${n.sw}"`);
    if (op != null && op !== 1) a.push(`${p}    android:strokeAlpha="${op}"`);
    if (n.t === "path" && !n.fill) a.push(`${p}    android:strokeLineCap="round"`);
    if (n.join) a.push(`${p}    android:strokeLineJoin="${n.join}"`);
  }
  a.push(`${p}    android:pathData="${pathDataOf(n)}" />`);
  return a.join("\n") + "\n";
}

for (const [ic, name] of Object.entries(NAMES)) {
  const body = WX_ICONS[ic].map((n) => node(n, 4, null)).join("");
  const xml =
    HDR +
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="36dp"\n    android:height="36dp"\n' +
    '    android:viewportWidth="36"\n    android:viewportHeight="36">\n' +
    body +
    "</vector>\n";
  writeFileSync(join(OUT, "drawable", name + ".xml"), xml, { encoding: "utf8" });
  console.log(`drawable/${name}.xml (${ic})`);
}
