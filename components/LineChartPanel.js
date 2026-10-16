// Çizgi grafik paneli — Sıcaklık, Nem, CAPE ve Basınç aynı bileşeni kullanır (Paket 2, Ekim 2026).
// Ortak yardımcılar (zaman, birlikte kaydırma, genişlik, anahtar çipi, ipucu konumu) buradan dışa açılır;
// Toplam yağış (PrecipPanel) ve model × zaman matrisleri (MatrixPanel) de bunları kullanır.
//
// Kurallar (web taslağı, 11 Ekim 2026 kararları):
// - Yatay çizgiler parametreye göre (sıcaklıkta 2 °C'de bir); eksen en düşük / en yüksek model değerinin
//   hemen dışından başlar (çift sayıya yuvarlanmaz). Çizgi kalınlığı 1,3.
// - Her grafiğin kendi 1s / 3s / 6s seçimi var (varsayılan: Saatlik 1s, 3 gün 3s, 7/16 gün 6s).
// - 06–18 arası gündüz bandı, 06 / 12 / 18 dikmeleri, "şimdi" çizgisi.
// - Saatte en az 4 px: 16 günde grafik yatay kaydırılır; sol eksen sabit kalır. Kaydırılan grafikler
//   saat üzerinden birlikte kayar.
// - Uyum şeridi saatlik veriden hesaplanır (seçilen aralıktan bağımsız); dilim uzunluğu aralıktan kısa
//   olmaz ve en az 24 px'tir; dilimi en ayrışık saat temsil eder; komşu aynı seviyeler birleşir.
//   Etiket bloğa sığarsa yazılır; üzerine gelince açıklama çıkar. Tek model seçiliyse şerit yok.
// - Grafik altında yalnız anahtar kalır; açıklama metinleri SSS'te. CAPE ve Basınç'ta anahtarın sonunda
//   Terimler sayfasına bağlantı var (Paket 5).
// - Verisi biten modelin çizgisi son noktasında küçük bir noktayla biter (taralı bölge yok).
// - Ortak seçili zaman (Paket 4): grafiğe tıklayınca Model detayları o dilime gider ve tablo aralığı bu
//   grafiğin aralığını alır; seçili dilim tüm grafiklerde kesikli koyu çerçeveyle gösterilir.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AgreeMark from "./AgreeMark";

export const DAY3 = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
export const MON3 = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
export const LABW = 56; // sabit sol eksen genişliği
export const MIN_PXH = 4; // saat başına en az piksel
export const X0 = 4;
const PT = 26; // çizim alanının üstü (gün etiketleri bunun üstünde)
export const STRIP_H = 18;
const STRIP_MIN_BLOCK = 24;
const STRIP_STEPS = [1, 3, 6, 12, 24];
export const MONO = '"IBM Plex Mono", Menlo, monospace';

export const AGREE_STYLE_LC = {
  ok: { bg: "#DDE0DB", ink: "#1F2A24", text: "hemfikir" },
  partial: { bg: "#F0C98A", ink: "#1F2A24", text: "kısmen" },
  split: { bg: "#D98E2B", ink: "#FFFFFF", text: "ayrışıyor" },
};

const TREND_HOURS = 3;
const TREND_FAST = 2;
const TREND_FLAT = 0.5;
const TREND = [
  { key: "fastDown", color: "#C2622A", ink: "#FFFFFF", text: "hızlı düşüş", legend: `hızlı düşüş (≤ −${TREND_FAST} hPa/${TREND_HOURS}s)` },
  { key: "down", color: "#E0B080", ink: "#1F2A24", text: "düşüş", legend: "düşüş" },
  { key: "flat", color: "#DDE0DB", ink: "#1F2A24", text: "sabit", legend: `sabit (±${TREND_FLAT})` },
  { key: "up", color: "#9CBFB6", ink: "#1F2A24", text: "yükseliş", legend: "yükseliş" },
  { key: "fastUp", color: "#1E7A6B", ink: "#FFFFFF", text: "hızlı yükseliş", legend: `hızlı yükseliş (≥ +${TREND_FAST} hPa/${TREND_HOURS}s)` },
];
const TREND_BY = Object.fromEntries(TREND.map((t) => [t.key, t]));

function trendKey(d) {
  if (d <= -TREND_FAST) return "fastDown";
  if (d < -TREND_FLAT) return "down";
  if (d >= TREND_FAST) return "fastUp";
  if (d > TREND_FLAT) return "up";
  return "flat";
}

export const f1 = (v) => (v == null ? "—" : (Math.round(v * 10) / 10).toFixed(1));
export const pad2 = (n) => String(n).padStart(2, "0");
const pickStep = (span, steps) => steps.find((k) => span / k <= 9) ?? steps[steps.length - 1];
const capeClass = (v) => (v > 1000 ? 2 : v > 500 ? 1 : 0);
const CAPE_CLASS_TEXT = ["500 J/kg altı", "500–1000 J/kg", "1000 J/kg üstü"];

export function trPossessive(n) {
  return { 0: "ı", 1: "i", 2: "si", 3: "ü", 4: "ü", 5: "i", 6: "sı", 7: "si", 8: "i", 9: "u" }[n % 10];
}

export function numOrNull(v) {
  return v != null && !Number.isNaN(Number(v)) ? Number(v) : null;
}

// "YYYY-MM-DDTHH:mm" (TSİ) → parçalar
export function parseTime(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})/.exec(t || "");
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return { day: +m[3], mon: +m[2] - 1, wd: d.getUTCDay(), hour: +m[4] };
}

export function timeText(t) {
  const p = parseTime(t);
  return p ? `${p.day} ${MON3[p.mon]} ${DAY3[p.wd]} ${pad2(p.hour)}:00` : "";
}

export function tsiNowKey() {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 13);
}

export function defaultStepFor(period) {
  if (period === "hourly") return 1;
  if (period === "3d") return 3;
  return 6;
}

// Parametre ayarları
export const LINE_CHARTS = {
  temp: {
    key: "temp",
    title: "Sıcaklık",
    unit: "°C",
    tick: (v) => `${v}°`,
    grid: () => 2,
    highlight: 30,
    agree: { type: "spread", partial: 2, split: 4, unit: "°", pair: "en sıcak ve en soğuk model" },
    fmt: (v) => `${f1(v)}°`,
  },
  humidity: {
    key: "humidity",
    title: "Nem",
    unit: "bağıl nem · %",
    tick: (v) => `%${v}`,
    grid: () => 10,
    clamp: [0, 100],
    bands: [
      { from: 85, to: 100, fill: "#2C4A6E", opacity: 0.09, label: "doygunluğa yakın — sis / çiy", color: "#2C4A6E" },
      { from: 0, to: 30, fill: "#D98E2B", opacity: 0.08, label: "kuru", color: "#B06F17" },
    ],
    agree: { type: "spread", partial: 10, split: 20, unit: " puan", pair: "en nemli ve en kuru model" },
    fmt: (v) => `%${Math.round(v)}`,
  },
  cape: {
    key: "cape",
    title: "CAPE",
    unit: "J/kg · konvektif enerji",
    tick: (v) => String(v),
    grid: (span) => pickStep(span, [50, 100, 200, 250, 500, 1000]),
    floorZero: true,
    minTop: 600,
    refs: [
      { v: 500, label: "500 J/kg — sağanak" },
      { v: 1000, label: "1000 J/kg — gök gürültülü" },
    ],
    agree: { type: "class" },
    fmt: (v) => `${Math.round(v)} J/kg`,
    term: { href: "/terimler#cape", label: "CAPE nedir?" },
  },
  pressure: {
    key: "pressure",
    title: "Basınç",
    unit: "deniz seviyesi · hPa",
    tick: (v) => String(v),
    grid: (span) => pickStep(span, [1, 2, 5, 10, 20, 25, 50]),
    refs: [{ v: 1013.25, label: "1013.25 hPa — standart atmosfer" }],
    trend: true,
    agree: { type: "spread", partial: 2, split: 4, unit: " hPa", pair: "en yüksek ve en düşük basınç veren model" },
    fmt: (v) => `${f1(v)} hPa`,
    term: { href: "/terimler#basinc", label: "Basınç eğilimi nedir?" },
  },
};

// --- Uyum hesapları ---
function spreadAt(cfg, models, i) {
  const pts = models
    .map((m) => ({ m, v: numOrNull(m.series[i]?.[cfg.key]) }))
    .filter((p) => p.v != null);
  if (pts.length < 2) return { level: "na", rank: -1, n: pts.length, i };
  let lo = pts[0];
  let hi = pts[0];
  for (const p of pts) {
    if (p.v < lo.v) lo = p;
    if (p.v > hi.v) hi = p;
  }
  const sp = hi.v - lo.v;
  const a = cfg.agree;
  const level = sp < a.partial ? "ok" : sp <= a.split ? "partial" : "split";
  return { level, rank: sp, spread: sp, lo, hi, n: pts.length, i };
}

// CAPE: sınıf yöntemi (< 500 · 500–1000 · > 1000 J/kg); ortanca sınıf sıralı sınıflardan seçilir.
function classAt(cfg, models, i) {
  const pts = models
    .map((m) => ({ m, v: numOrNull(m.series[i]?.[cfg.key]) }))
    .filter((p) => p.v != null);
  if (pts.length < 2) return { level: "na", rank: -1, n: pts.length, i };
  const ks = pts.map((p) => capeClass(p.v)).sort((a, b) => a - b);
  const mode = ks[Math.floor(ks.length / 2)];
  const inClass = pts.filter((p) => capeClass(p.v) === mode).length;
  const pct = inClass / pts.length;
  const level = pct >= 0.75 ? "ok" : pct >= 0.5 ? "partial" : "split";
  return { level, rank: 1 - pct, pct, inClass, mode, n: pts.length, i, pts };
}

function agreeAt(cfg, models, i) {
  return cfg.agree.type === "class" ? classAt(cfg, models, i) : spreadAt(cfg, models, i);
}

function trendAt(models, i) {
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

// Dilimler: uzunluk STRIP_STEPS'ten (aralıktan kısa değil, en az STRIP_MIN_BLOCK px); dilimi en belirgin
// saat temsil eder; aynı gruptaki komşu dilimler tek blokta birleşir.
function buildSegments(n, pxh, step, at, rank, group) {
  const k = STRIP_STEPS.find((s) => s >= step && s * pxh >= STRIP_MIN_BLOCK) ?? 24;
  const out = [];
  for (let i = 0; i < n; i += k) {
    const to = Math.min(n - 1, i + k - 1);
    let pk = null;
    for (let j = i; j <= to; j++) {
      const a = at(j);
      if (pk == null || rank(a) > rank(pk)) pk = a;
    }
    const last = out[out.length - 1];
    if (last && group(last.peak) === group(pk)) {
      last.to = to;
      if (rank(pk) > rank(last.peak)) last.peak = pk;
    } else out.push({ from: i, to, peak: pk });
  }
  return out;
}

// --- Saat üzerinden birlikte kaydırma ---
export const SYNC = new Set();
export function syncFrom(src) {
  const hr = src.el.scrollLeft / src.pxh;
  SYNC.forEach((o) => {
    if (o === src || !o.el) return;
    const want = Math.round(hr * o.pxh);
    if (Math.abs(o.el.scrollLeft - want) <= 1) return;
    o.el.scrollLeft = want;
    o.prog = o.el.scrollLeft;
    o.onMore && o.onMore();
  });
}

// Kutunun genişliği (kutu yükleme bittikten sonra oluştuğu için ref yerine öğenin kendisi izlenir)
export function useWidth(el) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el) return undefined;
    const update = () => setW(el.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return w;
}

// Birlikte kaydırma + açılışta "şimdi"nin gününe konumlanma (tüm grafik ve matris panelleri).
// geo: { pxh, W, x(i) } — pxh saat başına piksel; farklı hücre genişliğindeki paneller saat üzerinden eşlenir.
export function useSyncedScroll(scRef, geo, period, nowIdx) {
  const syncRef = useRef({ el: null, pxh: 1, prog: null, onMore: null });
  const scrollKeyRef = useRef("");
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = scRef.current;
    if (!el || !geo) return undefined;
    const me = syncRef.current;
    me.el = el;
    me.pxh = geo.pxh;
    me.onMore = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    SYNC.add(me);
    const key = `${period}|${geo.W}`;
    if (scrollKeyRef.current !== key) {
      scrollKeyRef.current = key;
      const dayStart = nowIdx >= 0 ? nowIdx - (nowIdx % 24) : 0;
      el.scrollLeft = geo.W > el.clientWidth ? Math.max(0, geo.x(dayStart) - 2) : 0;
    }
    me.onMore();
    return () => SYNC.delete(me);
  }, [scRef, geo, period, nowIdx]);

  function onScroll() {
    const me = syncRef.current;
    const el = scRef.current;
    if (!el) return;
    setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    if (me.prog != null && Math.abs(el.scrollLeft - me.prog) <= 1) {
      me.prog = null;
      return;
    }
    me.prog = null;
    syncFrom(me);
  }

  return { more, onScroll };
}

// "şimdi"nin serideki sırası (yoksa -1)
export function useNowIndex(times) {
  return useMemo(() => {
    const k = tsiNowKey();
    return times.findIndex((t) => typeof t === "string" && t.startsWith(k));
  }, [times]);
}

// Seçili dilim çerçevesi (tüm grafik ve matrislerde). selection: { i, step, reveal }
export function SelFrame({ geo, n, selection, y0, y1 }) {
  if (!geo || !selection || selection.i < 0 || selection.i >= n) return null;
  const x0 = geo.x(selection.i);
  const x1 = geo.x(Math.min(n, selection.i + selection.step));
  return (
    <rect
      x={x0 - 2}
      y={y0}
      width={Math.max(2, x1 - x0) + 4}
      height={y1 - y0}
      rx="3"
      fill="rgba(31,42,36,.035)"
      stroke="#1F2A24"
      strokeWidth="1.3"
      strokeDasharray="4 2"
      pointerEvents="none"
    />
  );
}

// Tablodaki ← Şimdi → / aralık değişince seçili dilim görünmüyorsa grafik onu gösterecek kadar kayar.
export function useRevealSelection(scRef, geo, selection) {
  const reveal = selection ? selection.reveal : 0;
  const doneRef = useRef(reveal);
  useEffect(() => {
    const el = scRef.current;
    if (!el || !geo || !selection || doneRef.current === reveal) return;
    doneRef.current = reveal;
    const x0 = geo.x(selection.i);
    const x1 = geo.x(selection.i + selection.step);
    if (x0 < el.scrollLeft + 8 || x1 > el.scrollLeft + el.clientWidth - 8) {
      el.scrollLeft = Math.max(0, x0 - el.clientWidth * 0.3);
    }
  }, [scRef, geo, selection, reveal]);
}

export function Chip({ bg, ink, level, children }) {
  return (
    <span className="lc-chip" style={{ background: bg, color: ink }}>
      {level && <AgreeMark level={level} size={10} color={ink} strokeWidth={1.9} />}
      {children}
    </span>
  );
}

export default function LineChartPanel({ cfg, models, period, status, extraTitle, selection, onSelect }) {
  const [step, setStep] = useState(defaultStepFor(period));
  useEffect(() => setStep(defaultStepFor(period)), [period]);

  const [boxEl, setBoxEl] = useState(null);
  const scRef = useRef(null);
  const width = useWidth(boxEl);
  const [hoverI, setHoverI] = useState(null);
  const [tip, setTip] = useState(null);

  const ok = status === "ok" && models && models.length > 0;
  const n = ok ? models[0].series.length : 0;
  const times = ok ? models[0].series.map((s) => s.time) : [];
  const hasAny = ok && models.some((m) => m.series.some((s) => numOrNull(s[cfg.key]) != null));

  const geo = useMemo(() => {
    if (!hasAny || !width) return null;
    const avail = Math.max(200, width - LABW);
    const pxh = Math.max((avail - 8) / n, MIN_PXH);
    const x = (i) => X0 + i * pxh;
    const W = Math.ceil(x(n) + 4);
    let lo = Infinity;
    let hi = -Infinity;
    for (const m of models)
      for (let i = 0; i < n; i += step) {
        const v = numOrNull(m.series[i]?.[cfg.key]);
        if (v != null) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
    if (!Number.isFinite(lo)) return null;
    const pad = Math.max(0.4, (hi - lo) * 0.04);
    lo -= pad;
    hi += pad;
    if (cfg.floorZero) {
      lo = 0;
      hi = Math.max(hi, cfg.minTop || 0);
    }
    if (cfg.clamp) {
      lo = Math.max(cfg.clamp[0], lo);
      hi = Math.min(cfg.clamp[1], hi);
    }
    const PH = 190;
    const PB = PT + PH;
    const y = (v) => PT + ((hi - v) / (hi - lo)) * PH;
    const g = cfg.grid(hi - lo);
    const ticks = [];
    for (let v = Math.ceil(lo / g) * g; v <= hi + 1e-9; v += g) ticks.push(Math.round(v * 100) / 100);
    const multi = models.length > 1;
    const strips = (multi ? 1 : 0) + (cfg.trend ? 1 : 0);
    const SY = PB + 22;
    const H = SY + strips * (STRIP_H + 4) + 2;
    const trendY = cfg.trend ? SY : null;
    const agreeY = multi ? SY + (cfg.trend ? STRIP_H + 4 : 0) : null;
    const ends = {};
    for (const m of models) {
      ends[m.id] = -1;
      for (let i = 0; i < n; i++) if (numOrNull(m.series[i]?.[cfg.key]) != null) ends[m.id] = i;
    }
    return { pxh, x, W, lo, hi, y, ticks, PH, PB, H, trendY, agreeY, ends, multi };
  }, [hasAny, width, n, step, models, cfg]);

  const segs = useMemo(() => {
    if (!geo || !geo.multi) return [];
    return buildSegments(n, geo.pxh, step, (i) => agreeAt(cfg, models, i), (a) => a.rank, (a) => a.level);
  }, [geo, n, step, models, cfg]);

  const trendSegs = useMemo(() => {
    if (!geo || !cfg.trend) return [];
    return buildSegments(
      n,
      geo.pxh,
      step,
      (i) => trendAt(models, i),
      (t) => (t ? Math.abs(t.med) : -1),
      (t) => (t ? `${trendKey(t.med)}|${t.same}` : "na")
    );
  }, [geo, n, step, models, cfg]);

  const nowIdx = useNowIndex(times);
  const { more, onScroll } = useSyncedScroll(scRef, geo, period, nowIdx);
  useRevealSelection(scRef, geo, selection);

  function showTip(e, content) {
    const pt = e.touches ? e.touches[0] : e;
    setTip({ x: pt.clientX, y: pt.clientY, content });
  }

  function onMove(e) {
    if (!geo) return;
    const seg = e.target.closest && e.target.closest("[data-seg]");
    if (seg) {
      setHoverI(null);
      const [kind, idx] = seg.getAttribute("data-seg").split(":");
      showTip(e, kind === "t" ? trendTip(trendSegs[+idx]) : agreeTip(segs[+idx]));
      return;
    }
    if (!(e.target.getAttribute && e.target.getAttribute("data-hit"))) {
      setHoverI(null);
      setTip(null);
      return;
    }
    const svg = e.currentTarget.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    let i = Math.round((pt.clientX - svg.left - X0) / geo.pxh / step) * step;
    i = Math.max(0, Math.min(n - 1, i));
    setHoverI(i);
    showTip(e, pointTip(i));
  }

  function onLeave() {
    setHoverI(null);
    setTip(null);
  }

  function onClick(e) {
    if (!geo || !onSelect || !(e.target.getAttribute && e.target.getAttribute("data-hit"))) return;
    const box = e.currentTarget.getBoundingClientRect();
    let i = Math.round((e.clientX - box.left - X0) / geo.pxh / step) * step;
    i = Math.max(0, Math.min(n - 1, i));
    onSelect(i, step);
  }

  function rangeText(b) {
    return `${timeText(times[b.from])} – ${timeText(times[b.to])} TSİ`;
  }

  function agreeTip(b) {
    const pk = b.peak;
    const st = AGREE_STYLE_LC[pk.level];
    const p = parseTime(times[pk.i]);
    const when = p ? `${pad2(p.hour)}:00, ${p.day} ${MON3[p.mon]}` : "";
    if (cfg.agree.type === "class") {
      const vals = pk.pts
        .slice()
        .sort((a, c) => c.v - a.v)
        .map((q) => `${q.m.label} ${Math.round(q.v)}`)
        .join(" · ");
      return (
        <>
          <b>Uyum: {st.text}</b>
          <div className="lc-mono">{rangeText(b)}</div>
          <div>
            En ayrışık saat {when} · {pk.n} modelin {pk.inClass}&apos;{trPossessive(pk.inClass)} aynı sınıfta:{" "}
            {CAPE_CLASS_TEXT[pk.mode]}
          </div>
          <div className="lc-mono">{vals}</div>
          <div className="lc-mono lc-rule">
            Ortanca sınıftaki modellerin oranı: % 75 ve üstü hemfikir, % 50–75 kısmen, altı ayrışıyor.
          </div>
        </>
      );
    }
    const a = cfg.agree;
    const rule = {
      ok: `hemfikir: ${a.pair} arasındaki fark ${a.partial}${a.unit} altında`,
      partial: `kısmen: fark ${a.partial}–${a.split}${a.unit} arasında`,
      split: `ayrışıyor: fark ${a.split}${a.unit} üstünde`,
    }[pk.level];
    return (
      <>
        <b>Uyum: {st.text}</b>
        <div className="lc-mono">{rangeText(b)}</div>
        <div>
          En büyük fark {cfg.fmt(pk.spread)} ({when})
        </div>
        <div>
          {pk.lo.m.label} {cfg.fmt(pk.lo.v)} ↔ {pk.hi.m.label} {cfg.fmt(pk.hi.v)}
          {pk.n < models.length ? ` (${pk.n} modelin verisi var)` : ""}
        </div>
        <div className="lc-mono lc-rule">{rule}. Dilimin rengi içindeki en büyük farka göre.</div>
      </>
    );
  }

  function trendTip(b) {
    const t = b.peak;
    const T = TREND_BY[trendKey(t.med)];
    const p = parseTime(times[t.i]);
    return (
      <>
        <b>Eğilim: {T.text}</b>
        <div className="lc-mono">{rangeText(b)}</div>
        <div>
          {TREND_HOURS} saatlik değişim (model ortancası), en belirgin {t.med > 0 ? "+" : ""}
          {f1(t.med)} hPa{p ? ` · ${pad2(p.hour)}:00` : ""}
        </div>
        {!t.same && <div>Modeller değişimin yönünde ayrışıyor (soluk renk).</div>}
      </>
    );
  }

  function pointTip(i) {
    const rows = models
      .map((m) => ({ m, v: numOrNull(m.series[i]?.[cfg.key]) }))
      .sort((a, b) => (b.v ?? -1e9) - (a.v ?? -1e9));
    const a = geo.multi ? agreeAt(cfg, models, i) : null;
    const tr = cfg.trend ? trendAt(models, i) : null;
    return (
      <>
        <b>{timeText(times[i])} TSİ</b>
        {rows.map((r) => (
          <div className="lc-row" key={r.m.id}>
            <span>
              <i style={{ background: r.m.color }} />
              {r.m.label}
            </span>
            <span>{r.v == null ? "veri yok" : cfg.fmt(r.v)}</span>
          </div>
        ))}
        {a && a.level !== "na" && (
          <div className="lc-row lc-dim">
            <span>{cfg.agree.type === "class" ? CAPE_CLASS_TEXT[a.mode] : "fark"}</span>
            <span>
              {cfg.agree.type === "class" ? `${a.inClass}/${a.n}` : cfg.fmt(a.spread)} · {AGREE_STYLE_LC[a.level].text}
            </span>
          </div>
        )}
        {tr && (
          <div className="lc-row lc-dim">
            <span>{TREND_HOURS} sa değişim</span>
            <span>
              {tr.med > 0 ? "+" : ""}
              {f1(tr.med)} · {TREND_BY[trendKey(tr.med)].text}
            </span>
          </div>
        )}
        {rows.some((r) => r.v == null) && <div className="lc-mono lc-rule">veri yok: modelin tahmin süresi bitti</div>}
      </>
    );
  }

  // --- çizim ---
  let body = null;
  let leftAxis = null;
  let overlay = [];
  if (geo) {
    const { x, W, y, ticks, PB, H, pxh, ends } = geo;
    const label = (txt, len) => (len >= txt.length * 5.7 + 20 ? txt : null);
    leftAxis = (
      <svg width={LABW} height={H} aria-hidden="true">
        {ticks.map((v) => (
          <text
            key={v}
            x={LABW - 8}
            y={y(v) + 3.5}
            textAnchor="end"
            fontFamily={MONO}
            fontSize="10"
            fontWeight={v === cfg.highlight ? 600 : 400}
            fill={v === cfg.highlight ? "var(--ink)" : "var(--ink-soft)"}
          >
            {cfg.tick(v)}
          </text>
        ))}
        {geo.trendY != null && (
          <text x={LABW - 8} y={geo.trendY + STRIP_H / 2 + 3.5} textAnchor="end" fontFamily={MONO} fontSize="10" fill="var(--ink-soft)">
            eğilim
          </text>
        )}
        {geo.agreeY != null && (
          <text x={LABW - 8} y={geo.agreeY + STRIP_H / 2 + 3.5} textAnchor="end" fontFamily={MONO} fontSize="10" fill="var(--ink-soft)">
            uyum
          </text>
        )}
      </svg>
    );
    for (const b of cfg.bands || []) {
      const A = Math.max(geo.lo, b.from);
      const B = Math.min(geo.hi, b.to);
      if (B > A && y(A) - y(B) >= 12)
        overlay.push(
          <span key={b.label} style={{ left: 6, top: (y(B) + y(A)) / 2 - 7, color: b.color }}>
            {b.label}
          </span>
        );
    }
    for (const r of cfg.refs || []) {
      if (r.v > geo.lo && r.v < geo.hi)
        overlay.push(
          <span key={r.label} style={{ right: 10, top: y(r.v) - 15, color: "var(--ink-soft)" }}>
            {r.label}
          </span>
        );
    }
    const days = [];
    for (let d = 0; d * 24 < n; d++) days.push(d);
    const hours = [];
    for (let i = 0; i < n; i += 6) hours.push(i);
    body = (
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={cfg.title}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={onClick}
        onTouchStart={(e) => {
          onMove(e);
          setTimeout(onLeave, 2600);
        }}
      >
        {/* gündüz bandı */}
        {days.map((d) => {
          const g0 = x(d * 24 + 6);
          const g1 = x(Math.min(n, d * 24 + 18));
          return g1 > g0 ? <rect key={`dn${d}`} x={g0} y={PT} width={g1 - g0} height={geo.PH} fill="#F3EAD3" opacity="0.55" /> : null;
        })}
        {(cfg.bands || []).map((b) => {
          const A = Math.max(geo.lo, b.from);
          const B = Math.min(geo.hi, b.to);
          return B > A ? (
            <rect key={`b${b.from}`} x={X0} y={y(B)} width={x(n) - X0} height={y(A) - y(B)} fill={b.fill} opacity={b.opacity} />
          ) : null;
        })}
        {ticks.map((v) => (
          <line
            key={`g${v}`}
            x1={X0}
            x2={x(n)}
            y1={y(v)}
            y2={y(v)}
            stroke={v === cfg.highlight ? "#A9B2A6" : "#DCE1D9"}
            strokeWidth={v === cfg.highlight ? 1.3 : 1}
          />
        ))}
        {(cfg.refs || []).map((r) =>
          r.v > geo.lo && r.v < geo.hi ? (
            <line key={`r${r.v}`} x1={X0} x2={x(n)} y1={y(r.v)} y2={y(r.v)} stroke="var(--ink-soft)" strokeWidth="1.3" opacity="0.7" />
          ) : null
        )}
        {/* zaman ekseni */}
        {hours.map((i) => {
          const p = parseTime(times[i]);
          const xx = x(i);
          if (!p) return null;
          if (p.hour === 0)
            return (
              <g key={`h${i}`}>
                <line x1={xx} x2={xx} y1={4} y2={PB} stroke="var(--line)" />
                <text x={xx + 4} y={14} fontFamily={MONO} fontSize="11" fontWeight="600" fill="var(--ink)">
                  {DAY3[p.wd]} {p.day} {MON3[p.mon]}
                </text>
              </g>
            );
          return (
            <g key={`h${i}`}>
              <line x1={xx} x2={xx} y1={PT} y2={PB} stroke="#E4E8E2" strokeDasharray={p.hour === 12 ? undefined : "2 3"} />
              <line x1={xx} x2={xx} y1={PB} y2={PB + 4} stroke="var(--ink-faint)" />
              {pxh * 6 >= 17 && (
                <text x={xx} y={PB + 14} textAnchor="middle" fontFamily={MONO} fontSize="9.5" fill="var(--ink-faint)">
                  {pad2(p.hour)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={X0} x2={x(n)} y1={PB} y2={PB} stroke="var(--line)" />
        {nowIdx >= 0 && (
          <g>
            <line x1={x(nowIdx)} x2={x(nowIdx)} y1={PT} y2={PB} stroke="var(--teal)" strokeWidth="1.2" />
            <text x={x(nowIdx) + 3} y={PT + 9} fontFamily={MONO} fontSize="9" fontWeight="600" fill="var(--teal)">
              şimdi
            </text>
          </g>
        )}
        {/* model çizgileri */}
        {models.map((m) => {
          let d = "";
          let pen = false;
          let lx = null;
          let ly = null;
          for (let i = 0; i < n; i += step) {
            const v = numOrNull(m.series[i]?.[cfg.key]);
            if (v == null) {
              pen = false;
              continue;
            }
            lx = x(i);
            ly = y(v);
            d += `${pen ? "L" : "M"}${lx.toFixed(1)},${ly.toFixed(1)}`;
            pen = true;
          }
          return (
            <g key={m.id}>
              <path d={d} fill="none" stroke={m.color} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
              {lx != null && ends[m.id] < n - 1 && <circle cx={lx} cy={ly} r="2.2" fill={m.color} />}
            </g>
          );
        })}
        {hoverI != null && (
          <g pointerEvents="none">
            <line x1={x(hoverI)} x2={x(hoverI)} y1={PT} y2={PB} stroke="var(--ink)" opacity="0.45" />
            {models.map((m) => {
              const v = numOrNull(m.series[hoverI]?.[cfg.key]);
              return v == null ? null : <circle key={m.id} cx={x(hoverI)} cy={y(v)} r="3" fill={m.color} stroke="#fff" strokeWidth="1" />;
            })}
          </g>
        )}
        {/* eğilim şeridi */}
        {geo.trendY != null &&
          trendSegs.map((b, bi) => {
            const t = b.peak;
            if (!t) return null;
            const T = TREND_BY[trendKey(t.med)];
            const x0 = x(b.from);
            const bw = x(b.to + 1) - x(b.from) - 1;
            if (bw <= 1) return null;
            const txt = label(`${T.text} ${t.med > 0 ? "+" : ""}${f1(t.med)}`, bw) || label(T.text, bw);
            return (
              <g key={`t${bi}`} data-seg={`t:${bi}`} style={{ cursor: "help" }}>
                <rect x={x0} y={geo.trendY} width={bw} height={STRIP_H} rx="3" fill={T.color} opacity={t.same ? 1 : 0.45} />
                {txt && (
                  <text
                    x={x0 + bw / 2}
                    y={geo.trendY + STRIP_H / 2 + 3.4}
                    textAnchor="middle"
                    fontFamily={MONO}
                    fontSize="9.5"
                    fill={t.same ? T.ink : "#1F2A24"}
                    pointerEvents="none"
                  >
                    {txt}
                  </text>
                )}
              </g>
            );
          })}
        {/* uyum şeridi */}
        {geo.agreeY != null &&
          segs.map((b, bi) => {
            const pk = b.peak;
            if (!pk || pk.level === "na") return null;
            const st = AGREE_STYLE_LC[pk.level];
            const x0 = x(b.from) + 1;
            const bw = x(b.to + 1) - x(b.from) - 2;
            if (bw <= 1) return null;
            const wide =
              cfg.agree.type === "class"
                ? `${st.text} · ${pk.inClass}/${pk.n} ${CAPE_CLASS_TEXT[pk.mode]}`
                : `${st.text} (en çok ${cfg.fmt(pk.spread)})`;
            const txt = label(wide, bw - 12) || label(st.text, bw - 12);
            const gw = txt ? 12 + txt.length * 5.7 : 9;
            const gx = x0 + bw / 2 - gw / 2;
            return (
              <g key={`a${bi}`} data-seg={`a:${bi}`} style={{ cursor: "help" }}>
                <rect x={x0} y={geo.agreeY} width={bw} height={STRIP_H} rx="3" fill={st.bg} />
                {bw >= 13 && <AgreeMark level={pk.level} x={gx} y={geo.agreeY + (STRIP_H - 9) / 2} size={9} color={st.ink} strokeWidth={1.9} />}
                {txt && (
                  <text x={gx + 12} y={geo.agreeY + STRIP_H / 2 + 3.4} fontFamily={MONO} fontSize="9.5" fill={st.ink} pointerEvents="none">
                    {txt}
                  </text>
                )}
              </g>
            );
          })}
        <SelFrame geo={geo} n={n} selection={selection} y0={PT - 2} y1={PB + 2} />
        <rect data-hit="1" x={X0} y={PT} width={x(n) - X0} height={geo.PH} fill="transparent" style={{ cursor: onSelect ? "pointer" : undefined }} />
      </svg>
    );
  }

  const scrollable = geo && scRef.current ? geo.W > scRef.current.clientWidth + 4 : false;
  const sub = ok
    ? `${cfg.unit} · ${step} saatlik nokta · ${models.length} model${scrollable ? " · yatay kaydırılabilir" : ""}`
    : cfg.unit;

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-head-left">
          <div className="panel-title">{cfg.title}</div>
          <div className="panel-sub" title={sub}>
            {sub}
            {extraTitle || ""}
          </div>
        </div>
        <div className="unit-toggle">
          {[1, 3, 6].map((h) => (
            <button key={h} type="button" className={step === h ? "active" : ""} onClick={() => setStep(h)}>
              {h}s
            </button>
          ))}
        </div>
      </div>
      {status === "loading" && <div className="loading">Veri yükleniyor…</div>}
      {status === "error" && <div className="err">Veri alınamadı — bağlantını kontrol et.</div>}
      {ok && !hasAny && <div className="err">Bu modeller için {cfg.title.toLocaleLowerCase("tr")} verisi yok.</div>}
      {ok && hasAny && (
        <>
          <div className={"lc" + (more ? " more" : "")} ref={setBoxEl}>
            <div className="lc-y">{leftAxis}</div>
            <div className="lc-sc" ref={scRef} onScroll={onScroll}>
              {body}
            </div>
            <div className="lc-ov">{overlay}</div>
          </div>
          <div className="lc-key">
            {cfg.trend && (
              <>
                <span className="lc-key-lab">eğilim:</span>
                {TREND.map((t) => (
                  <Chip key={t.key} bg={t.color} ink={t.ink}>
                    {t.legend}
                  </Chip>
                ))}
                {models.length > 1 && <span className="lc-br" />}
              </>
            )}
            {models.length > 1 &&
              ["ok", "partial", "split"].map((l) => (
                <Chip key={l} bg={AGREE_STYLE_LC[l].bg} ink={AGREE_STYLE_LC[l].ink} level={l}>
                  {AGREE_STYLE_LC[l].text}
                </Chip>
              ))}
            {cfg.term && (
              <Link className="lc-term" href={cfg.term.href}>
                {cfg.term.label}
              </Link>
            )}
          </div>
        </>
      )}
      {tip && (
        <div className="lc-tip" style={tipStyle(tip)}>
          {tip.content}
        </div>
      )}
    </div>
  );
}

export function tipStyle(t) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = t.x + 280 > vw - 8 ? Math.max(8, t.x - 274) : t.x + 14;
  const top = t.y + 220 > vh - 8 ? Math.max(8, t.y - 200) : t.y + 14;
  return { left, top };
}
