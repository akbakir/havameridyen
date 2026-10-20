// Sayfa 3 — grafikler (Prototip 9): Saatlik / 3 / 7 / 16 gün; aralık 1 / 3 / 6 / 12 saat (16 günde 1 saat yok).
// Paneller: hava durumu (her model, dilimdeki en belirgin durumun ikonu — web'deki tablo gibi; 20 Ekim), sıcaklık, toplam yağış (+ uzlaşı şeridi), karlı dönemde taze kar ve kar kalınlığı, rüzgar hızı ve yönü,
// hamle, nem, CAPE, basınç (+ eğilim), bulutluluk; her birinin altında uyum şeridi. Uyum ve eğilim kuralları web ile
// aynı dosyadan (lib/agreement.js). Grafiğe dokununca seçili dilim, yanında o dilimdeki model değerleri ve altta
// "Model verileri detay" tablosu.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LEVEL_ORDER,
  SPREAD_RULES,
  STORM_KMH,
  capeClass,
  classAgreement,
  cloudClass,
  groupDays,
  median,
  pressureTrend,
  slotCond,
  spreadAgreement,
  trendKey,
  weatherAgreement,
  windAgreement,
} from "@lib/agreement";
import { MODELS } from "@lib/forecast";
import { CLS_RNG, CLS_TXT, Mark, SKY_SOLID, condView, iconSvgAt } from "../icons";
import { MON, dir16, fmt, pad, parseT, speed, tsuf, unitLabel } from "../format";
import { DIR8, dayGust, gust, val } from "../data";
import { PageLinks, UnitToggle } from "./common";

const PER = {
  hourly: { n: 48, px: 13, def: 1, lbl: "Saatlik" },
  "3d": { n: 72, px: 9, def: 3, lbl: "3 gün" },
  "7d": { n: 168, px: 5, def: 6, lbl: "7 gün" },
  "16d": { n: 384, px: 3, def: 12, lbl: "16 gün" },
};
const SLOTS = [1, 3, 6, 12];
const RAIN_TH = [0.2, 0.5, 1, 2, 5];
const slotOK = (period, s) => period !== "16d" || s !== 1; // V05 P2: 16 günde 1 saat seçilemez
const DAY3 = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const DASHED = Object.fromEntries(MODELS.map((m) => [m.id, !!m.dashed]));

const AG_TXT = { ok: "hemfikir", partial: "kısmen", split: "ayrışıyor", na: "veri yok" };
const AG_COL = { ok: "#C9CEC6", partial: "#F0C98A", split: "#D98E2B" };
const TR = {
  fastDown: { c: "#C2622A", ink: "#fff", tx: "hızlı düşüş" },
  down: { c: "#E0B080", ink: "#1F2A24", tx: "düşüş" },
  flat: { c: "#DDE0DB", ink: "#1F2A24", tx: "sabit" },
  up: { c: "#9CBFB6", ink: "#1F2A24", tx: "yükseliş" },
  fastUp: { c: "#1E7A6B", ink: "#fff", tx: "hızlı yükseliş" },
};
const SP_U = { temp: ["°", 1], humidity: [" puan", 0], pressure: [" hPa", 1] };
const CAPE_N = ["< 500", "500–1000", "> 1000"];
const dir8 = (d) => DIR8[Math.round(d / 45) % 8];

// Sayfadan çıkıp dönünce periyot, aralık ve eşik korunur (oturum içinde)
const saved = { period: "3d", slot: 3, rainTh: 0.2 };

// --- uyum şeridi bilgileri (kural lib/agreement.js; burada yalnız açıklama metni) ---
function spreadInfo(ms, key, i) {
  const r = spreadAgreement(ms, i, key);
  if (r.level === "na") return r;
  const [u, dd] = SP_U[key];
  const { partial: a, split: b } = SPREAD_RULES[key];
  return {
    ...r,
    txt: `en büyük fark ${fmt(r.spread, dd)}${u}: ${r.lo.m.label} ${fmt(r.lo.v, dd)} ↔ ${r.hi.m.label} ${fmt(r.hi.v, dd)}`,
    rule: `hemfikir < ${a}${u} · kısmen ${a}–${b} · ayrışıyor > ${b}`,
  };
}
function windInfo(ms, i) {
  const r = windAgreement(ms, i);
  if (r.level === "na") return r;
  const pr = r.pair;
  return {
    ...r,
    txt: `${pr ? `yön ${pr[0].m.label} ${dir8(pr[0].dir)} ↔ ${pr[1].m.label} ${dir8(pr[1].dir)} (${Math.round(r.ds)}°)` : "yön: rüzgar sakin"} · hız ${r.slow.m.label} ${Math.round(r.slow.kt)} ↔ ${r.fast.m.label} ${Math.round(r.fast.kt)} kt`,
    rule: "kısmen: yön ≥ 90° veya hız ≥ 10 kt · ayrışıyor: ikisi birden ya da ≥ 135° / 20 kt",
  };
}
// Hava durumu uyumu (web ile aynı kural): modellerin en az yarısı yağış veriyorsa yağış verenlerin oranı, değilse
// ortanca bulut sınıfındaki yağışsız modellerin oranı
function wxInfo(ms, i) {
  const r = weatherAgreement(ms, i);
  if (r.level === "na") return r;
  return {
    ...r,
    txt: `${r.n} modelin ${r.inClass}'${tsuf(r.inClass)} ${r.mode === "yağış" ? "yağış veriyor" : `aynı sınıfta: ${r.mode}`}`,
    rule: "en az yarısı yağış veriyorsa yağış verenlerin, değilse ortanca bulut sınıfındaki yağışsızların oranı: % 75 ve üstü hemfikir · % 50–75 kısmen",
  };
}
function classInfo(ms, key, i) {
  const r = classAgreement(ms, i, key, key === "cape" ? capeClass : cloudClass);
  if (r.level === "na") return r;
  return {
    ...r,
    txt: `${r.n} modelin ${r.inClass}'${tsuf(r.inClass)} aynı sınıfta: ${key === "cape" ? CAPE_N[r.mode] + " J/kg" : `${CLS_TXT[r.mode]} (${CLS_RNG[r.mode]})`}`,
    rule: "ortanca sınıftaki modellerin oranı: % 75 ve üstü hemfikir · % 50–75 kısmen",
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Bütün grafikler tek SVG (yatay kaydırılır); eksen, başlık ve zaman şeridi ayrı katmanlarda sabit kalır
function buildChart({ ms, times, n, px, step, rainTh, unit, nowIdx }) {
  const W = n * px;
  const x = (i) => i * px + px / 2;
  const cnt = `${ms.length} model`;
  const U = unitLabel(unit);
  const spd = (v) => speed(v, unit);
  const days = groupDays(times.slice(0, n));
  const today = days.findIndex((d) => nowIdx >= d.h0 && nowIdx < d.h1);
  const hasGust = (m) => m.series.some((s, i) => i < n && s.wind_gust != null);
  const gm = ms.filter(hasGust);
  const snowOn = ms.some((m) => m.series.some((s, i) => i < n && ((s.snowfall ?? 0) >= 0.05 || (s.snow_depth ?? 0) >= 0.05)));
  const WX_ROW = 22;
  const panels = [
    { id: "x", h: ms.length * WX_ROW + 4, title: "Hava durumu", unit: `dilimde en belirgin · ${cnt}` },
    { id: "xs", h: 13 },
    { id: "t", h: 104, title: "Sıcaklık", unit: "°C · " + cnt },
    { id: "ts", h: 13 },
    { id: "r", h: 74, title: "Toplam yağış", unit: `mm/${step} sa`, ctl: "rain" },
    { id: "rs", h: 10 },
    ...(snowOn
      ? [
          { id: "sn", h: 58, title: "Taze kar", unit: `cm/${step} sa · ${cnt}` },
          { id: "sd", h: 64, title: "Toplam kar kalınlığı", unit: "cm · " + cnt },
        ]
      : []),
    { id: "w", h: 62, title: "Rüzgar hızı", unit: U, ctl: "unit" },
    { id: "ws", h: 13 },
    { id: "d", h: 56, title: "Rüzgar yönü", unit: "nokta/model · " + cnt },
    { id: "g", h: 84, title: "Hamle", unit: `${U} · ${gm.length} model · ● günün en yükseği` },
    { id: "h", h: 72, title: "Nem", unit: "% · " + cnt },
    { id: "hs", h: 13 },
    { id: "e", h: 62, title: "CAPE", unit: "J/kg · " + cnt },
    { id: "es", h: 13 },
    { id: "p", h: 72, title: "Basınç", unit: "hPa · deniz seviyesi · " + cnt },
    { id: "pt", h: 13 },
    { id: "ps", h: 13 },
    { id: "c", h: ms.length * 12 + 6, title: "Bulutluluk", unit: "% · " + cnt + " · ", rainDot: true },
    { id: "cs", h: 13 },
  ];
  let y = 4;
  for (const p of panels) {
    if (p.title) y += 18;
    p.y = y;
    y += p.h + 3;
  }
  const H = y + 6;
  const segs = [];
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Mono,monospace">`;
  for (const day of days) {
    const h0 = parseT(times[day.h0]).h;
    const a = x(day.h0 + Math.max(0, 7 - h0)) - px / 2;
    const b = Math.min(x(day.h0 + 19 - h0) - px / 2, W);
    if (b > a) svg += `<rect x="${a}" y="0" width="${b - a}" height="${H}" fill="#F4F1DC" opacity=".7"/>`;
    svg += `<line x1="${day.h0 * px}" y1="0" x2="${day.h0 * px}" y2="${H}" stroke="#C9D0C6"/>`;
  }
  // yapışkan zaman ekseni
  let ax = `<svg width="${W}" height="22" viewBox="0 0 ${W} 22" font-family="IBM Plex Mono,monospace">`;
  days.forEach((day, k) => {
    const X = day.h0 * px;
    const t = parseT(times[day.h0]);
    ax += `<line x1="${X}" y1="0" x2="${X}" y2="22" stroke="#C9D0C6"/><text x="${X + 4}" y="10" font-size="10" font-weight="600" fill="#1F2A24">${k === today ? "Bugün" : DAY3[t.w]} ${t.d}</text>`;
    for (const hh of px >= 9 ? [6, 12, 18] : [12]) {
      const j = day.h0 + hh - t.h;
      if (j >= day.h0 && j < day.h1) ax += `<text x="${x(j)}" y="20" font-size="8" fill="#8B948B" text-anchor="middle">${pad(hh)}</text>`;
    }
  });
  ax += `<line data-cur2="1" x1="0" x2="0" y1="12" y2="22" stroke="#1E7A6B" stroke-width="2"/></svg>`;
  const axes = [];
  const titles = [];

  const lineSet = (p, key, lo, hi, ticks, withMed, map = (v) => v) => {
    const yy = (v) => p.y + p.h - ((v - lo) / (hi - lo)) * (p.h - 10) - 4;
    for (const tk of ticks) {
      svg += `<line x1="0" x2="${W}" y1="${yy(tk)}" y2="${yy(tk)}" stroke="#E1E6DE" stroke-dasharray="2 3"/>`;
      axes.push(`<text x="32" y="${yy(tk) + 3}" text-anchor="end" font-size="8.5" fill="#5B665D">${tk}</text>`);
    }
    for (const m of ms) {
      let d = "";
      let pen = false;
      for (let i = 0; i < n; i++) {
        const v0 = val(m, key, i);
        const v = v0 == null ? null : map(v0);
        if (v == null) {
          pen = false;
          continue;
        }
        d += (pen ? "L" : "M") + x(i).toFixed(1) + "," + yy(v).toFixed(1);
        pen = true;
      }
      svg += `<path d="${d}" fill="none" stroke="${m.color}" stroke-width="1.4" ${DASHED[m.id] ? 'stroke-dasharray="3 2"' : ""} opacity=".9"/>`;
    }
    if (withMed) {
      let d = "";
      let pen = false;
      for (let i = 0; i < n; i++) {
        const vs = ms.map((m) => val(m, key, i)).filter((v) => v != null).map(map);
        if (vs.length < 2) {
          pen = false;
          continue;
        }
        d += (pen ? "L" : "M") + x(i).toFixed(1) + "," + yy(median(vs)).toFixed(1);
        pen = true;
      }
      svg += `<path d="${d}" fill="none" stroke="#111" stroke-width="1.6"/><path d="${d}" fill="none" stroke="#fff" stroke-width=".8" stroke-dasharray="3 3"/>`;
    }
  };
  // V07 C4: şerit dilimleri (aralık kadar), dilimi en kötü saat temsil eder; komşu aynı seviyeler birleşir
  const block = (x0, w, yb, h, fill, op, txt, ink, seg) => {
    let g = `<g data-seg="${seg}" style="cursor:pointer"><rect x="${x0.toFixed(1)}" y="${yb}" width="${w.toFixed(1)}" height="${h}" rx="2" fill="${fill}" opacity="${op}"/>`;
    if (txt && w >= txt.length * 4.6 + 8)
      g += `<text x="${(x0 + w / 2).toFixed(1)}" y="${yb + h / 2 + 2.7}" font-size="7.5" text-anchor="middle" fill="${ink}" pointer-events="none">${txt}</text>`;
    return g + "</g>";
  };
  const stripX = (p, info, name) => {
    const sl = [];
    for (let s0 = 0; s0 < n; s0 += step) {
      let w = null;
      for (let i = s0; i < s0 + step && i < n; i++) {
        const a = info(i);
        if (!a || a.level === "na") continue;
        if (!w || LEVEL_ORDER[a.level] > LEVEL_ORDER[w.level] || (LEVEL_ORDER[a.level] === LEVEL_ORDER[w.level] && a.rank > w.rank)) w = { ...a, i };
      }
      sl.push(w);
    }
    const bl = [];
    sl.forEach((w, c) => {
      const L = w ? w.level : "na";
      const last = bl[bl.length - 1];
      if (last && last.L === L) {
        last.to = c;
        if (w && w.rank > last.pk.rank) last.pk = w;
      } else bl.push({ L, from: c, to: c, pk: w });
    });
    for (const b of bl) {
      if (b.L === "na") continue;
      const x0 = b.from * step * px + 0.5;
      const w = Math.min(n, (b.to + 1) * step) * px - b.from * step * px - 1;
      segs.push({ kind: "agree", name, b, step });
      svg += block(x0, w, p.y + 1, p.h - 2, AG_COL[b.L], 1, AG_TXT[b.L], b.L === "split" ? "#fff" : "#1F2A24", segs.length - 1);
    }
    axes.push(`<text x="32" y="${p.y + p.h - 3}" text-anchor="end" font-size="7.5" fill="#8B948B">uyum</text>`);
  };
  const trendStrip = (p) => {
    const sl = [];
    for (let s0 = 0; s0 < n; s0 += step) {
      let w = null;
      for (let i = s0; i < s0 + step && i < n; i++) {
        const a = pressureTrend(ms, i);
        if (a && (!w || Math.abs(a.med) > Math.abs(w.med))) w = a;
      }
      sl.push(w);
    }
    const key = (t) => (t ? trendKey(t.med) + "|" + t.same : "na");
    const bl = [];
    sl.forEach((w, c) => {
      const last = bl[bl.length - 1];
      if (last && key(last.pk) === key(w)) {
        last.to = c;
        if (w && Math.abs(w.med) > Math.abs(last.pk.med)) last.pk = w;
      } else bl.push({ from: c, to: c, pk: w });
    });
    for (const b of bl) {
      if (!b.pk) continue;
      const T = TR[trendKey(b.pk.med)];
      const x0 = b.from * step * px;
      const w = Math.min(n, (b.to + 1) * step) * px - x0 - 0.5;
      segs.push({ kind: "trend", b, step });
      svg += block(x0, w, p.y + 1, p.h - 2, T.c, b.pk.same ? 1 : 0.45, T.tx, b.pk.same ? T.ink : "#1F2A24", segs.length - 1);
    }
    axes.push(`<text x="32" y="${p.y + p.h - 3}" text-anchor="end" font-size="7.5" fill="#8B948B">eğilim</text>`);
  };
  const range = (key, pd, map = (v) => v) => {
    let lo = 1e9;
    let hi = -1e9;
    for (const m of ms)
      for (let i = 0; i < n; i++) {
        const v0 = val(m, key, i);
        if (v0 == null) continue;
        const v = map(v0);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    if (lo > hi) return [0, 1];
    return [Math.floor(lo - pd), Math.ceil(hi + pd)];
  };
  const ticksOf = (lo, hi, st) => {
    const a = [];
    for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) a.push(v);
    return a;
  };
  const yTick = (yy, tk, txt = String(tk)) => {
    svg += `<line x1="0" x2="${W}" y1="${yy}" y2="${yy}" stroke="#E1E6DE" stroke-dasharray="2 3"/>`;
    axes.push(`<text x="32" y="${yy + 3}" text-anchor="end" font-size="8.5" fill="#5B665D">${txt}</text>`);
  };
  const bars = (p, key, opacity, titleOf) => {
    const sums = [];
    let mx = 0;
    for (let s = 0; s < n; s += step) {
      const row = ms.map((m) => {
        let a = 0;
        let c = 0;
        for (let i = s; i < s + step && i < n; i++) {
          const v = val(m, key, i);
          if (v != null) {
            a += v;
            c++;
          }
        }
        return c ? a : null;
      });
      sums.push(row);
      row.forEach((v) => {
        if (v != null) mx = Math.max(mx, v);
      });
    }
    const top = Math.max(1, Math.ceil(mx));
    const yy = (v) => p.y + p.h - (v / top) * (p.h - 10);
    for (const tk of [0, top / 2, top].map((v) => +v.toFixed(1))) yTick(yy(tk), tk, String(tk).replace(".", ","));
    const bw = Math.max(0.8, (step * px - 2) / ms.length);
    sums.forEach((row, si) =>
      row.forEach((v, mi) => {
        if (v == null || v < 0.05) return;
        svg += `<rect x="${(si * step * px + 1 + mi * bw).toFixed(2)}" y="${yy(v).toFixed(1)}" width="${Math.max(0.6, bw - 0.4).toFixed(2)}" height="${(p.y + p.h - yy(v)).toFixed(1)}" fill="${ms[mi].color}"${opacity ? ` opacity="${opacity}"` : ""}>${titleOf ? `<title>${esc(titleOf(ms[mi], v))}</title>` : ""}</rect>`;
      })
    );
    return { sums, yy, top };
  };

  for (const p of panels) {
    if (p.title) titles.push({ y: p.y - 17, title: p.title, unit: p.unit, ctl: p.ctl, rainDot: p.rainDot });
    if (p.id === "x") {
      const cw = step * px;
      const sz = Math.max(9, Math.min(cw - 2, WX_ROW - 4));
      ms.forEach((m, mi) => {
        const yy = p.y + 2 + mi * WX_ROW;
        axes.push(`<text x="33" y="${yy + WX_ROW / 2 + 2}" text-anchor="end" font-size="7.5" font-weight="600" fill="${m.color}">${esc(m.label.slice(0, 4))}</text>`);
        for (let s = 0; s < n; s += step) {
          const c = slotCond(m, s, Math.min(step, n - s));
          if (!c) continue;
          const v = condView(c, parseT(times[c.i]).h);
          const w = Math.min(cw, (n - s) * px);
          svg += `<rect x="${(s * px + 0.5).toFixed(1)}" y="${yy}" width="${Math.max(1, w - 1).toFixed(1)}" height="${WX_ROW - 2}" rx="3" fill="${SKY_SOLID[v.sky]}"/>`;
          svg += iconSvgAt(v.icon, s * px + w / 2 - sz / 2, yy + (WX_ROW - 2) / 2 - sz / 2, sz);
        }
      });
    }
    if (p.id === "xs") stripX(p, (i) => wxInfo(ms, i), "Hava durumu");
    if (p.id === "t") {
      const [lo, hi] = range("temp", 1);
      lineSet(p, "temp", lo, hi, ticksOf(lo, hi, hi - lo > 12 ? 4 : 2), true);
    }
    if (p.id === "ts") stripX(p, (i) => spreadInfo(ms, "temp", i), "Sıcaklık");
    if (p.id === "h") {
      const yy = (v) => p.y + p.h - (v / 100) * (p.h - 10) - 4;
      const dw = 24 * px;
      svg += `<rect x="0" y="${yy(100)}" width="${W}" height="${yy(85) - yy(100)}" fill="#2C4A6E" opacity=".09"/><rect x="0" y="${yy(30)}" width="${W}" height="${yy(0) - yy(30)}" fill="#D98E2B" opacity=".09"/>`;
      for (let d = 0; d * 24 < n; d += dw < 80 ? 2 : 1)
        svg += `<text x="${d * dw + 3}" y="${yy(85) - 2}" font-size="6.8" fill="#2C4A6E" opacity=".85">doygunluğa yakın</text><text x="${d * dw + 3}" y="${yy(0) - 2}" font-size="6.8" fill="#B06F17">kuru</text>`;
      lineSet(p, "humidity", 0, 100, [25, 50, 75, 100], true);
    }
    if (p.id === "hs") stripX(p, (i) => spreadInfo(ms, "humidity", i), "Nem");
    if (p.id === "p") {
      const [lo, hi] = range("pressure", 1);
      lineSet(p, "pressure", lo, hi, ticksOf(lo, hi, hi - lo > 16 ? 6 : hi - lo > 8 ? 4 : 2), true);
      if (1013.25 > lo && 1013.25 < hi) {
        const yy = (v) => p.y + p.h - ((v - lo) / (hi - lo)) * (p.h - 10) - 4;
        const dw = 24 * px;
        svg += `<line x1="0" x2="${W}" y1="${yy(1013.25)}" y2="${yy(1013.25)}" stroke="#5B665D" stroke-width="1.1" opacity=".7"/>`;
        for (let d = 0; d * 24 < n; d += dw < 80 ? 2 : 1) svg += `<text x="${d * dw + 3}" y="${yy(1013.25) - 2}" font-size="6.8" fill="#5B665D">1013,25 standart</text>`;
      }
    }
    if (p.id === "pt") trendStrip(p);
    if (p.id === "ps") stripX(p, (i) => spreadInfo(ms, "pressure", i), "Basınç");
    if (p.id === "w") {
      const [, hi] = range("wind_speed", 0, spd);
      const top = Math.max(10, Math.ceil(hi / 10) * 10);
      lineSet(p, "wind_speed", 0, top, ticksOf(0, top, top > 30 ? 20 : 10), false, spd);
    }
    if (p.id === "ws") stripX(p, (i) => windInfo(ms, i), "Rüzgar");
    if (p.id === "g") {
      let hi = 0;
      for (const m of gm)
        for (let i = 0; i < n; i++) {
          const g = gust(m, i);
          if (g != null) hi = Math.max(hi, spd(g));
        }
      // V04 P4: 62 km/s çizgisi yalnız hamle 50 km/s'ye yaklaşınca, ince kırmızı noktalı
      const storm = spd(STORM_KMH);
      const near = hi >= spd(50);
      const top = Math.max(unit === "kt" ? 20 : 40, Math.ceil((hi * 1.15) / 10) * 10, near ? Math.ceil((storm * 1.1) / 10) * 10 : 0);
      const yy = (v) => p.y + p.h - (v / top) * (p.h - 22) - 3;
      for (const tk of ticksOf(0, top, top > 40 ? 20 : 10)) yTick(yy(tk), tk);
      if (near)
        svg += `<line x1="0" x2="${W}" y1="${yy(storm)}" y2="${yy(storm)}" stroke="#C0392B" stroke-width=".9" stroke-dasharray="1.2 2" opacity=".85"/><text x="4" y="${yy(storm) - 2}" font-size="7.5" fill="#C0392B">fırtına 62 km/s</text>`;
      for (const m of gm) {
        let d = "";
        let pen = false;
        for (let i = 0; i < n; i++) {
          const g = gust(m, i);
          if (g == null) {
            pen = false;
            continue;
          }
          d += (pen ? "L" : "M") + x(i).toFixed(1) + "," + yy(spd(g)).toFixed(1);
          pen = true;
        }
        svg += `<path d="${d}" fill="none" stroke="${m.color}" stroke-width="1.3" ${DASHED[m.id] ? 'stroke-dasharray="3 2"' : ""} opacity=".85"/>`;
      }
      for (const day of days) {
        let best = null;
        for (const m of gm) {
          const r = dayGust(m, day);
          if (r.g == null) continue;
          const X = x(r.i);
          const Y = yy(spd(r.g));
          const hh = pad(parseT(times[r.i]).h);
          svg += `<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="2.6" fill="${m.color}" stroke="#fff" stroke-width=".9"><title>${esc(m.label)}: ${fmt(spd(r.g))} ${U} · ${hh}:00 TSİ</title></circle>`;
          if (!best || r.g > best.g) best = { g: r.g, i: r.i, X, m };
        }
        // V04 P4: en yüksek hamleyi veren modelin rengiyle "KB 41 km/s", saati hemen altında
        if (best) {
          const dB = val(best.m, "wind_direction", best.i);
          const lab = `${dB == null ? "" : dir8(dB) + " "}${Math.round(spd(best.g))} ${U}`;
          const half = 26;
          const lx = Math.max(day.h0 * px + half, Math.min(day.h1 * px - half, best.X));
          svg += `<text x="${lx.toFixed(1)}" y="${p.y + 7}" font-size="7.5" font-weight="600" text-anchor="middle" fill="${best.m.color}">${lab}</text><text x="${lx.toFixed(1)}" y="${p.y + 14.5}" font-size="6.8" text-anchor="middle" fill="${best.m.color}">${pad(parseT(times[best.i]).h)}:00</text>`;
        }
      }
    }
    if (p.id === "e") {
      const [, hi] = range("cape", 0);
      const top = Math.max(600, Math.ceil(hi / 200) * 200);
      const yy = (v) => p.y + p.h - (v / top) * (p.h - 10) - 4;
      svg += `<line x1="0" x2="${W}" y1="${yy(500)}" y2="${yy(500)}" stroke="#D98E2B" stroke-dasharray="4 3" opacity=".7"/>`;
      if (top >= 1000) svg += `<line x1="0" x2="${W}" y1="${yy(1000)}" y2="${yy(1000)}" stroke="#C2622A" stroke-dasharray="4 3" opacity=".7"/>`;
      lineSet(p, "cape", 0, top, top >= 1000 && top !== 1000 ? [0, 500, 1000, top] : [0, 500, top], true);
    }
    if (p.id === "es") stripX(p, (i) => classInfo(ms, "cape", i), "CAPE");
    if (p.id === "d") {
      const yy = (v) => p.y + 4 + (v / 360) * (p.h - 8);
      for (const [v, l] of [
        [0, "K"],
        [90, "D"],
        [180, "G"],
        [270, "B"],
        [360, "K"],
      ])
        yTick(yy(v), v, l);
      const st = px >= 9 ? 1 : 2;
      for (const m of ms)
        for (let i = 0; i < n; i += st) {
          const v = val(m, "wind_direction", i);
          const w = val(m, "wind_speed", i);
          if (v == null || w == null) continue;
          svg += `<circle cx="${x(i).toFixed(1)}" cy="${yy(v).toFixed(1)}" r="1.6" fill="${m.color}" opacity="${w < 3 ? 0.3 : 0.85}"/>`;
        }
    }
    if (p.id === "r") {
      const { sums, yy, top } = bars(p, "precip_amount", null, null);
      if (rainTh <= top) svg += `<line x1="0" x2="${W}" y1="${yy(rainTh)}" y2="${yy(rainTh)}" stroke="#2C5E8C" stroke-dasharray="1 2" opacity=".6"/>`;
      const rs = panels.find((q) => q.id === "rs");
      sums.forEach((row, si) => {
        const got = row.filter((v) => v != null);
        const wet = got.filter((v) => v >= rainTh).length;
        const sh = got.length ? wet / got.length : 0;
        if (got.length) {
          const col = sh === 0 ? "#EEF3F6" : `rgb(${Math.round(210 - 170 * sh)},${Math.round(232 - 160 * sh)},${Math.round(247 - 80 * sh)})`;
          svg += `<rect x="${si * step * px + 0.5}" y="${rs.y + 1}" width="${step * px - 1}" height="${rs.h - 2}" rx="2" fill="${col}"><title>${got.length} modelin ${wet}'${tsuf(wet)} ≥ ${String(rainTh).replace(".", ",")} mm</title></rect>`;
        }
      });
      axes.push(`<text x="32" y="${rs.y + 8}" text-anchor="end" font-size="7.5" fill="#8B948B">uzlaşı</text>`);
    }
    if (p.id === "sn") bars(p, "snowfall", ".85", (m, v) => `${m.label}: ${fmt(v, 1)} cm`);
    if (p.id === "sd") {
      let hi = 0;
      for (const m of ms)
        for (let i = 0; i < n; i++) {
          const v = val(m, "snow_depth", i);
          if (v != null) hi = Math.max(hi, v);
        }
      const top = Math.max(5, Math.ceil(hi / 5) * 5);
      lineSet(p, "snow_depth", 0, top, ticksOf(0, top, top > 20 ? 10 : 5), false);
    }
    if (p.id === "c") {
      ms.forEach((m, mi) => {
        const yy = p.y + 3 + mi * 12;
        axes.push(`<text x="33" y="${yy + 8}" text-anchor="end" font-size="7.5" font-weight="600" fill="${m.color}">${esc(m.label.slice(0, 4))}</text>`);
        for (let s = 0; s < n; s += step) {
          let c = 0;
          let cn = 0;
          let r = 0;
          for (let i = s; i < s + step && i < n; i++) {
            const cv = val(m, "cloud_cover", i);
            const rv = val(m, "precip_amount", i);
            if (cv != null) {
              c += cv;
              cn++;
            }
            if (rv != null) r += rv;
          }
          if (!cn) continue;
          c /= cn;
          const k = cloudClass(c);
          const g = [242, 212, 178, 140, 104][k];
          svg += `<rect x="${s * px + 0.5}" y="${yy}" width="${step * px - 1}" height="10" rx="2" fill="rgb(${g},${g + 3},${g + 2})"><title>${esc(m.label)}: ${CLS_TXT[k]} (% ${Math.round(c)})</title></rect>`;
          if (r >= 0.2) svg += `<circle cx="${((s + step / 2) * px).toFixed(1)}" cy="${yy + 5}" r="${r >= 5 ? 3.6 : r >= 2 ? 2.9 : r >= 1 ? 2.3 : 1.7}" fill="#3F83BF" stroke="#fff" stroke-width=".6"/>`;
        }
      });
    }
    if (p.id === "cs") stripX(p, (i) => classInfo(ms, "cloud_cover", i), "Bulutluluk");
  }
  const nowX = nowIdx < n ? x(nowIdx) : null;
  svg += `<rect data-cur="1" x="0" y="0" width="${px}" height="${H}" fill="rgba(30,122,107,.10)" stroke="#1E7A6B" stroke-width="1.2" pointer-events="none"/>`;
  if (nowX != null) svg += `<line x1="${nowX}" x2="${nowX}" y1="0" y2="${H}" stroke="#1F2A24" stroke-width="1" stroke-dasharray="3 3" opacity=".5" pointer-events="none"/>`;
  svg += "</svg>";
  return { svg, ax: ax, axes: `<svg width="36" height="${H}">${axes.join("")}</svg>`, titles, panels, H, segs, x };
}

const VP_IDS = new Set(["t", "r", "sn", "sd", "w", "g", "d", "h", "e", "p", "c"]);

// Değer penceresi (V09 D5): dokunulan paneldeki o dilimin bütün model değerleri, büyükten küçüğe
function valueRows(pid, ms, a, z, unit) {
  const spd = (v) => (v == null ? null : speed(v, unit));
  const sumOf = (m, key) => {
    let s = null;
    for (let i = a; i <= z; i++) {
      const v = val(m, key, i);
      if (v != null) s = (s || 0) + v;
    }
    return s;
  };
  const VP = {
    t: ["°C", (m) => fmt(val(m, "temp", a), 1), (m) => val(m, "temp", a)],
    r: ["mm", (m) => { const s = sumOf(m, "precip_amount"); return s == null ? "—" : s < 0.05 ? "0" : fmt(s, 1); }, (m) => sumOf(m, "precip_amount") || 0],
    sn: ["cm", (m) => { const s = sumOf(m, "snowfall"); return s == null ? "—" : fmt(s, 1); }, (m) => sumOf(m, "snowfall") || 0],
    sd: ["cm", (m) => fmt(val(m, "snow_depth", a), 1), (m) => val(m, "snow_depth", a)],
    w: [unitLabel(unit), (m) => fmt(spd(val(m, "wind_speed", a))), (m) => val(m, "wind_speed", a)],
    g: [unitLabel(unit), (m) => { const g = gust(m, a); return g == null ? "—" : fmt(spd(g)); }, (m) => gust(m, a)],
    d: ["yön", (m) => { const d = val(m, "wind_direction", a); return d == null ? "—" : dir8(d); }, null],
    h: ["%", (m) => fmt(val(m, "humidity", a)), (m) => val(m, "humidity", a)],
    e: ["J/kg", (m) => fmt(val(m, "cape", a)), (m) => val(m, "cape", a)],
    p: ["hPa", (m) => fmt(val(m, "pressure", a), 1), (m) => val(m, "pressure", a)],
    c: ["%", (m) => fmt(val(m, "cloud_cover", a)), (m) => val(m, "cloud_cover", a)],
  };
  const spec = VP[pid];
  if (!spec) return null;
  const [u, txt, num] = spec;
  const list = pid === "g" ? ms.filter((m) => m.series.some((s) => s.wind_gust != null)) : ms;
  const rows = list.map((m) => ({ m, t: txt(m), n: num ? num(m) : null })).sort((p, q) => (q.n ?? -1e9) - (p.n ?? -1e9));
  return { u, rows };
}

function rangeTx(times, a, b) {
  const A = parseT(times[a]);
  const B = parseT(times[b]);
  const da = `${A.d} ${MON[A.m].slice(0, 3)}`;
  return a === b ? `${da} ${pad(A.h)}:00` : `${da} ${pad(A.h)}:00–${A.key === B.key ? "" : `${B.d} ${MON[B.m].slice(0, 3)} `}${pad(B.h)}:59`;
}

// V07 C4: tablo seçili aralığı gösterir — mm dilim toplamı, diğer değerler dilimin ilk saati, uyum satırı dilimdeki en
// kötü saat
function Table({ ms, times, a, z, slot, unit }) {
  const worst = (fn) => {
    let w = "na";
    for (let i = a; i <= z; i++) {
      const l = fn(i).level;
      if (LEVEL_ORDER[l] > LEVEL_ORDER[w]) w = l;
    }
    return w;
  };
  const ag = [
    worst((i) => spreadAgreement(ms, i, "temp")),
    "",
    worst((i) => windAgreement(ms, i)),
    worst((i) => spreadAgreement(ms, i, "humidity")),
    worst((i) => classAgreement(ms, i, "cape", capeClass)),
    worst((i) => spreadAgreement(ms, i, "pressure")),
    worst((i) => classAgreement(ms, i, "cloud_cover", cloudClass)),
  ];
  const spd = (v) => (v == null ? null : speed(v, unit));
  return (
    <table className="mtable">
      <thead>
        <tr>
          <th>Model</th>
          <th>°C</th>
          <th>
            mm{slot > 1 && <span className="u">{slot}s top.</span>}
          </th>
          <th className="wh">
            <span className="wl">
              <span>Yön</span>
              <span>
                Hız/Hamle<span className="u">({unitLabel(unit)})</span>
              </span>
            </span>
          </th>
          <th>Nem</th>
          <th>CAPE</th>
          <th>hPa</th>
          <th>Bulut</th>
        </tr>
      </thead>
      <tbody>
        {ms.map((m) => {
          const tv = val(m, "temp", a);
          const name = (
            <td>
              <span className="sw" style={{ background: m.color }} /> {m.label}
            </td>
          );
          if (tv == null)
            return (
              <tr key={m.id}>
                {name}
                <td className="na" colSpan={7}>
                  veri yok
                </td>
              </tr>
            );
          let rs = null;
          for (let i = a; i <= z; i++) {
            const r = val(m, "precip_amount", i);
            if (r != null) rs = (rs || 0) + r;
          }
          const g = gust(m, a);
          const e = val(m, "cape", a);
          const c = val(m, "cloud_cover", a);
          return (
            <tr key={m.id}>
              {name}
              <td>{fmt(tv, 1)}</td>
              <td>{rs == null ? "—" : rs < 0.05 ? <span className="na">yok</span> : fmt(rs, 1)}</td>
              <td>
                {dir16(val(m, "wind_direction", a))} {fmt(spd(val(m, "wind_speed", a)))}
                <span className="gust">/{g == null ? "—" : fmt(spd(g))}</span>
              </td>
              <td>{fmt(val(m, "humidity", a))}</td>
              <td>{e == null ? <span className="na">—</span> : fmt(e)}</td>
              <td>{fmt(val(m, "pressure", a), 1)}</td>
              <td>{c == null ? "—" : fmt(c)}</td>
            </tr>
          );
        })}
        <tr>
          <td style={{ color: "var(--s-soft)" }}>uyum</td>
          {ag.map((l, k) => (
            <td key={k}>
              {l && l !== "na" && (
                <span className={`pill p-${l}`} style={{ padding: "3px 5px" }}>
                  <Mark level={l} />
                </span>
              )}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

export default function P3({ models, times: times7, long, onNeed16, idx, nowIdx, unit, onUnit, onIdx, onGo }) {
  const [period, setPeriod] = useState(saved.period);
  const [slot, setSlot] = useState(saved.slot);
  const [rainTh, setRainTh] = useState(saved.rainTh);
  const [vpop, setVpop] = useState(null);
  const [sinfo, setSinfo] = useState(null);
  const scRef = useRef(null);
  const axRef = useRef(null);
  const chartsRef = useRef(null);
  const tm = useRef({});
  useEffect(() => () => Object.values(tm.current).forEach(clearTimeout), []);
  saved.period = period;
  saved.slot = slot;
  saved.rainTh = rainTh;

  const P = PER[period];
  const is16 = period === "16d";
  // 16 günlük veri yalnız bu görünüm ilk açılınca istenir; hata olursa "Yeniden dene" ile
  useEffect(() => {
    if (is16 && long.status === "idle") onNeed16();
  }, [is16, long.status, onNeed16]);
  const ready = !is16 || long.status === "ok";
  const ms = is16 ? long.models || [] : models;
  const times = is16 ? long.times || [] : times7;
  const n = Math.min(P.n, times.length);
  const step = slotOK(period, slot) ? slot : P.def;

  const chart = useMemo(
    () => (ready && ms.length && n ? buildChart({ ms, times, n, px: P.px, step, rainTh, unit, nowIdx }) : null),
    [ready, ms, times, n, P.px, step, rainTh, unit, nowIdx]
  );

  const cur = Math.min(idx, Math.max(0, n - 1));
  const a = cur - (cur % step);
  const z = Math.min(n - 1, a + step - 1);

  // Seçili dilim çerçevesi (SVG yeniden çizilmeden)
  useLayoutEffect(() => {
    const sc = scRef.current;
    if (!sc || !chart) return;
    const r = sc.querySelector("[data-cur]");
    if (r) {
      r.setAttribute("x", a * P.px);
      r.setAttribute("width", step * P.px);
    }
    const l = axRef.current && axRef.current.querySelector("[data-cur2]");
    if (l) {
      const X = a * P.px + (step * P.px) / 2;
      l.setAttribute("x1", X);
      l.setAttribute("x2", X);
    }
  }, [chart, a, step, P.px]);

  // Periyot / aralık değişince açık açıklamalar kapanır, seçili dilim ekranın üçte birine gelir
  useEffect(() => {
    setVpop(null);
    setSinfo(null);
  }, [period, step]);
  useLayoutEffect(() => {
    const sc = scRef.current;
    if (!sc || !chart) return;
    sc.scrollLeft = Math.max(0, chart.x(a) - sc.clientWidth * 0.35);
    syncAx();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, step, !!chart]);

  function syncAx() {
    const sc = scRef.current;
    const s = axRef.current && axRef.current.querySelector("svg");
    if (sc && s) s.style.transform = `translateX(${-sc.scrollLeft}px)`;
  }
  const fade = (key, set, ms) => {
    clearTimeout(tm.current[key]);
    clearTimeout(tm.current[key + "2"]);
    tm.current[key] = setTimeout(() => {
      set((v) => v && { ...v, off: true });
      tm.current[key + "2"] = setTimeout(() => set(null), 500);
    }, ms);
  };

  const showSeg = (S) => {
    const b = S.b;
    const s0 = b.from * S.step;
    const s1 = Math.min(n, (b.to + 1) * S.step) - 1;
    const pk = b.pk;
    let node;
    if (S.kind === "trend") {
      const T = TR[trendKey(pk.med)];
      node = (
        <>
          <b>Basınç eğilimi · {T.tx}</b> · {rangeTx(times, s0, s1)}
          <br />3 saatlik değişim (ortanca) en belirgin {pk.med > 0 ? "+" : ""}
          {fmt(pk.med, 1)} hPa{pk.same ? "" : " · modeller yönde ayrışıyor"}
        </>
      );
    } else {
      node = (
        <>
          <b>
            {S.name} · {AG_TXT[b.L]}
          </b>{" "}
          · {rangeTx(times, s0, s1)}
          <br />
          {pad(parseT(times[pk.i]).h)}:00 {pk.txt}
          <br />
          <span style={{ opacity: 0.75 }}>{pk.rule}</span>
        </>
      );
    }
    setSinfo({ node, off: false });
    fade("si", setSinfo, 5000);
  };

  const onChartClick = (e) => {
    const g = e.target.closest("[data-seg]");
    if (g) {
      showSeg(chart.segs[+g.dataset.seg]);
      return;
    }
    const svg = e.currentTarget.querySelector("svg");
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / P.px)));
    const na = i - (i % step);
    onIdx(na);
    const yy = e.clientY - r.top;
    const pnl = chart.panels.find((p) => VP_IDS.has(p.id) && yy >= p.y - 3 && yy <= p.y + p.h + 3);
    const box = chartsRef.current;
    if (!pnl || !box) return;
    const nz = Math.min(n - 1, na + step - 1);
    const vr = valueRows(pnl.id, ms, na, nz, unit);
    const head = pnl.id === "r" || pnl.id === "sn" ? `${pad(parseT(times[na]).h)}–${pad(parseT(times[nz]).h)}` : `${pad(parseT(times[na]).h)}:00`;
    const ch = box.getBoundingClientRect();
    setVpop({ head: `${head} · ${vr.u}`, rows: vr.rows, cx: e.clientX - ch.left, cy: e.clientY - ch.top, off: false });
    fade("vp", setVpop, 4000);
  };

  // Değer penceresi grafiğin dışına taşmasın
  const vpRef = useRef(null);
  useLayoutEffect(() => {
    const v = vpRef.current;
    const box = chartsRef.current;
    if (!v || !box || !vpop) return;
    const w = v.offsetWidth;
    const h = v.offsetHeight;
    let left = vpop.cx + 10;
    if (left + w > box.clientWidth - 4) left = vpop.cx - w - 10;
    const top = Math.max(2, Math.min(box.clientHeight - h - 2, vpop.cy - h / 2));
    v.style.left = left + "px";
    v.style.top = top + "px";
  }, [vpop]);

  const t0 = times[a] ? parseT(times[a]) : null;
  return (
    <>
      <div className="periods" role="group" aria-label="Periyot">
        {Object.entries(PER).map(([k, p]) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === period}
            onClick={() => {
              setPeriod(k);
              setSlot(PER[k].def);
            }}
          >
            {p.lbl}
          </button>
        ))}
      </div>
      <div className="periods sm" role="group" aria-label="Aralık">
        {SLOTS.map((s) => (
          <button key={s} type="button" aria-pressed={s === step} disabled={!slotOK(period, s)} title={slotOK(period, s) ? undefined : "16 günde 1 saat seçilemez"} onClick={() => setSlot(s)}>
            {s} saat
          </button>
        ))}
      </div>
      {!ready && (
        <div className={long.status === "error" ? "err" : "loading"}>
          {long.status === "error" ? (
            <>
              16 günlük veri alınamadı — bağlantını kontrol et.
              <br />
              <button type="button" onClick={onNeed16}>
                Yeniden dene
              </button>
            </>
          ) : (
            "16 günlük tahmin yükleniyor…"
          )}
        </div>
      )}
      {chart && (
        <>
          <div className="sticky">
            <div className="ro">
              <span>{rangeTx(times, a, z)} TSİ</span>
              <span>dokun: dilim / açıklama</span>
            </div>
            {sinfo && <div className={"sinfo" + (sinfo.off ? " off" : "")}>{sinfo.node}</div>}
            <div className="ax" ref={axRef} dangerouslySetInnerHTML={{ __html: chart.ax }} />
          </div>
          <div className="charts" ref={chartsRef}>
            {vpop && (
              <div className={"vpop" + (vpop.off ? " off" : "")} ref={vpRef}>
                <div className="h">{vpop.head}</div>
                {vpop.rows.map((r) => (
                  <div key={r.m.id}>
                    <i style={{ background: r.m.color }} />
                    {r.t}
                  </div>
                ))}
              </div>
            )}
            <div className="axes" style={{ height: chart.H }} dangerouslySetInnerHTML={{ __html: chart.axes }} />
            <div className="titles">
              {chart.titles.map((tt) => (
                <div key={tt.title} className="tt" style={{ top: tt.y }}>
                  <span>
                    {tt.title}{" "}
                    <small>
                      {tt.unit}
                      {tt.rainDot && (
                        <>
                          <i className="rdot" /> yağış
                        </>
                      )}
                    </small>
                  </span>
                  {tt.ctl === "rain" && (
                    <span className="ctl">
                      <span className="lab">
                        <span className="lw">eşik </span>≥
                      </span>
                      {RAIN_TH.map((v) => (
                        <button key={v} type="button" className="thr" aria-pressed={v === rainTh} onClick={() => setRainTh(v)}>
                          {String(v).replace(".", ",")}
                        </button>
                      ))}
                    </span>
                  )}
                  {tt.ctl === "unit" && (
                    <span className="ctl">
                      <UnitToggle unit={unit} onUnit={onUnit} />
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div
              className="scroller"
              ref={scRef}
              style={{ height: chart.H }}
              onScroll={() => {
                syncAx();
                if (vpop) setVpop(null);
              }}
              onClick={onChartClick}
              dangerouslySetInnerHTML={{ __html: chart.svg }}
            />
          </div>
          <div className="readout">
            <div className="sec" style={{ margin: "10px 4px 6px" }}>
              <span>
                Model verileri detay · {rangeTx(times, a, z)} TSİ{step > 1 && t0 ? ` · anlık ${pad(t0.h)}:00` : ""}
              </span>
              <span />
            </div>
            <div className="card" style={{ padding: "8px 6px 4px" }}>
              <div className="tablewrap">
                <Table ms={ms} times={times} a={a} z={z} slot={step} unit={unit} />
              </div>
            </div>
          </div>
        </>
      )}
      <PageLinks pages={["p1", "p2"]} onGo={onGo} />
      <div className="foot">
        Değerler model tahminidir, ölçüm değildir.
        <br />
        Siyah-beyaz kesik çizgi: ortanca; modellerin yerine geçmez.
        <br />
        Veri: Open-Meteo (CC BY 4.0)
      </div>
    </>
  );
}
