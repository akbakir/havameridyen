// Model × zaman matrisleri — Hava durumu (Paket 4), Bulutluluk ve Rüzgar (Paket 3), Ekim 2026.
// Çizgi grafiklerle aynı düzen: sabit sol sütun (model adları), 1s / 3s / 6s, gün çizgileri, 06–18 gündüz
// şeridi, saat etiketleri, "şimdi" sütunu koyu turkuaz çerçeve, 16 günde yatay kaydırma ve diğer grafiklerle
// saat üzerinden birlikte kayma, altta yalnız anahtar (açıklamalar SSS'te).
// - Uyum satırı hücrede gösterilenin uyumu (26 Ekim): hava durumunda dilim ikonları, bulutlulukta dilim ortalaması,
//   rüzgarda dilimin ilk saati; komşu aynı seviyeler tek blokta birleşir, etiket sığarsa
//   yazılır, üzerine gelince açıklama çıkar. Tek model seçiliyse uyum satırı yok.
// - Bulutlulukta hücre genişliği çizgi grafiklerle aynı ölçektedir; rüzgarda okun ve sayıların sığması
//   için hücre en az 30 px'tir, hava durumunda ikon için en az 28 px (16 günde matris daha uzun kayar, saat
//   eşlemesi bozulmaz).
// - Hücreye ya da sütuna tıklayınca Model detayları o dilime gider (ortak seçili zaman, kesikli çerçeve).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AgreeMark from "./AgreeMark";
import { WX_KEY, WX_KEY_OBS, WX_KEY_SNOW, WxIcon } from "./WeatherCond";
import {
  KN_PER_KMH,
  LEVEL_ORDER,
  STORM_KMH,
  WIND_CALM_KT,
  WIND_DIR_PARTIAL,
  WIND_DIR_SPLIT,
  WIND_SPD_PARTIAL,
  WIND_SPD_SPLIT,
  beaufortIndex,
  classAgreement,
  cloudClass,
  condAt,
  slotClassAgreement,
  slotCond,
  slotWeatherAgreement,
  weatherAgreement,
  windAgreement,
} from "../lib/agreement";
import {
  AGREE_STYLE_LC,
  Chip,
  DAY3,
  LABW,
  MIN_PXH,
  MON3,
  MONO,
  STRIP_H,
  X0,
  defaultStepFor,
  f1,
  numOrNull,
  pad2,
  dayBands,
  parseTime,
  SelFrame,
  tipStyle,
  trPossessive,
  useNowIndex,
  useRevealSelection,
  useSyncedScroll,
  useWidth,
} from "./LineChartPanel";

const TOP = 40; // satırların başladığı y (üstte gün ve saat etiketleri)
const NOW_FRAME = "#14574C";
const CH = 5.7; // 9.5 px yazıda ortalama karakter genişliği

function slotText(times, s0, step) {
  const p = parseTime(times[s0]);
  if (!p) return "";
  const day = `${p.day} ${MON3[p.mon]} ${DAY3[p.wd]}`;
  if (step === 1) return `${day} ${pad2(p.hour)}:00 TSİ`;
  const e = parseTime(times[Math.min(times.length - 1, s0 + step - 1)]);
  return `${day} ${pad2(p.hour)}:00–${pad2(e ? e.hour : p.hour)}:59 TSİ`;
}

// Görüş: 1 km altı metre, 10 km'ye kadar tek ondalık km, üstü tam km
function visText(v) {
  if (v == null) return "—";
  if (v < 1000) return `${Math.round(v / 10) * 10} m`;
  return v < 10000 ? `${(v / 1000).toFixed(1)} km` : `${Math.round(v / 1000)} km`;
}

function hourText(times, i) {
  const p = parseTime(times[i]);
  return p ? `${pad2(p.hour)}:00` : "";
}

// Uyum ipucunun yeri: dilim uyumunda (3/6/12 saat) "dilim 06:00–08:59", saatlikte "saat 06:00"
function whereText(times, pk) {
  if (!pk.slot || pk.slot < 2) return `En ayrışık saat ${hourText(times, pk.i)}`;
  const e = parseTime(times[Math.min(times.length - 1, pk.i + pk.slot - 1)]);
  return `En ayrışık dilim ${hourText(times, pk.i)}–${e ? `${pad2(e.hour)}:59` : ""}`;
}

// ---------------------------------------------------------------------------
// Rüzgar: hücre o dilimin ilk saatinin değeri; renk ortalama hızın bofor kademesi (MGM ıskalası),
// ok rüzgarın estiği yön, üstte ortalama hız, altta hamle. 8 bofor (fırtına) ve üstü koyu kırmızı çerçeve.
// ---------------------------------------------------------------------------
// Eşikler (bofor, fırtına 8 bofor ≈ 62 km/s, uyum 90°/10 kt, 135°/20 kt, sakin 3 kt): lib/agreement.js
const STORM_RED = "#8F2420";
const COMPASS_8 = ["K", "KD", "D", "GD", "G", "GB", "B", "KB"];

// Renk ve adlar; sıra lib/agreement.js BEAUFORT_MS kademeleriyle aynı (beaufortIndex)
const BEAUFORT = [
  { color: "#D2D5D1", label: "0–1 sakin/esinti" },
  { color: "#D2C4B3", label: "2 hafif" },
  { color: "#D0B296", label: "3 tatlı" },
  { color: "#CEA177", label: "4 orta" },
  { color: "#CB8F57", label: "5 sert" },
  { color: "#BF6B2D", label: "6 kuvvetli" },
  { color: "#9C5625", label: "7 fırtınamsı" },
  { color: "#7A431F", label: "8 fırtına" },
  { color: "#593017", label: "9 kuvvetli fırtına" },
  { color: "#3A1E10", label: "10+ tam fırtına" },
];

const compass = (d) => COMPASS_8[Math.round((((d % 360) + 360) % 360) / 45) % 8];

const WIND = {
  key: "wind",
  title: "Rüzgar",
  term: { href: "/terimler#hamle", label: "Hamle nedir?" },
  rowH: 40,
  minCell: 30,
  field: "wind_speed",
  units: [
    { id: "kmh", label: "km/s", short: "km/s", f: 1 },
    { id: "kn", label: "knot", short: "kt", f: KN_PER_KMH },
  ],
  sub: (step, models, u) =>
    `${u.short} · üstte ortalama hız, altta hamle · ok estiği yön · ${step > 1 ? `${step} saatte bir` : "saatlik"}`,
  cell(m, s0, step, cw, RH, times, u) {
    const w = numOrNull(m.series[s0]?.wind_speed);
    if (w == null) return null;
    const d = numOrNull(m.series[s0]?.wind_direction);
    const g = numOrNull(m.series[s0]?.wind_gust);
    const k = beaufortIndex(w);
    const ink = k >= 5 ? "#FFFFFF" : "#1F2A24";
    const storm = Math.max(w, g ?? 0) >= STORM_KMH;
    const cx = cw / 2;
    const cv = (v) => v * u.f;
    return {
      svg: (
        <>
          <rect
            x="1"
            y="1"
            width={cw - 2}
            height={RH - 3}
            rx="4"
            fill={BEAUFORT[k].color}
            stroke={storm ? STORM_RED : undefined}
            strokeWidth={storm ? 2 : undefined}
          />
          {d != null && (
            <g transform={`translate(${cx},10) rotate(${d + 180})`}>
              <path d="M0 -5.5 L3.6 0.8 H1.1 V5.5 H-1.1 V0.8 H-3.6 Z" fill={ink} />
            </g>
          )}
          <text x={cx} y="25" textAnchor="middle" fontFamily={MONO} fontSize="10.5" fontWeight="500" fill={ink}>
            {Math.round(cv(w))}
          </text>
          <text x={cx} y="34" textAnchor="middle" fontFamily={MONO} fontSize="8.5" fill={ink} opacity="0.8">
            {g == null ? "—" : Math.round(cv(g))}
          </text>
          {storm && <rect x={cw - 9} y="2" width="7" height="7" rx="1.5" fill={STORM_RED} />}
        </>
      ),
      tip: (
        <>
          <b>{m.label}</b>
          <div className="lc-mono">{slotText(times, s0, 1)}</div>
          <div>
            Ortalama hız {f1(cv(w))} {u.short} ({BEAUFORT[k].label} bofor)
          </div>
          <div>Hamle {g == null ? "veri yok" : `${f1(cv(g))} ${u.short}`}</div>
          <div>Yön {d == null ? "veri yok" : `${compass(d)} (${Math.round(d)}°, geldiği yön)`}</div>
          {storm && <b>MGM fırtına eşiği (8 bofor) aşılıyor</b>}
          {step > 1 && <div className="lc-mono lc-rule">Hücre dilimin ilk saatini gösterir.</div>}
        </>
      ),
    };
  },
  agree: windAgreement,
  agreeLabels: (b) => [AGREE_STYLE_LC[b.level].text],
  agreeTip: (pk, times) => (
    <>
      <div>
        {pk.pair
          ? `Yön: ${pk.pair[0].m.label} ${compass(pk.pair[0].dir)} ↔ ${pk.pair[1].m.label} ${compass(pk.pair[1].dir)}, fark ${Math.round(pk.ds)}°`
          : "Yön: karşılaştırılacak yeterli model yok (sakin)"}
      </div>
      <div>
        Hız: {pk.slow.m.label} {Math.round(pk.slow.kt)} kt ↔ {pk.fast.m.label} {Math.round(pk.fast.kt)} kt, fark{" "}
        {Math.round(pk.sp)} kt
      </div>
      {pk.calm.length > 0 && (
        <div>
          {pk.calm.map((p) => p.m.label).join(", ")} sakin (&lt; {WIND_CALM_KT} kt), yön karşılaştırılmadı
        </div>
      )}
      <div className="lc-mono lc-rule">
        En ayrışık saat {hourText(times, pk.i)}. Kısmen: yön farkı ≥ {WIND_DIR_PARTIAL}° veya hız farkı ≥ {WIND_SPD_PARTIAL} kt.
        Ayrışıyor: ikisi birden ya da ≥ {WIND_DIR_SPLIT}° / ≥ {WIND_SPD_SPLIT} kt.
      </div>
    </>
  ),
  key: () => (
    <>
      {BEAUFORT.map((b, i) => (
        <Chip key={b.label} bg={b.color} ink={i >= 5 ? "#FFFFFF" : "#1F2A24"}>
          {b.label}
        </Chip>
      ))}
      <span className="lc-chip" style={{ background: "#FFFFFF", border: `2px solid ${STORM_RED}`, color: STORM_RED }}>
        fırtına (≥ 8 bofor)
      </span>
    </>
  ),
};

// ---------------------------------------------------------------------------
// Bulutluluk: hücre dilim ortalaması, renk MGM sınıfı; geniş hücrede yüzde yazılı.
// MGM sınıfları (üst sınır dahil): ≤ %10 açık · ≤ %30 az bulutlu · ≤ %50 parçalı bulutlu ·
// ≤ %90 çok bulutlu · > %90 kapalı. Uyum sınıf yöntemiyle: ortanca sınıftaki modellerin oranı.
// ---------------------------------------------------------------------------
// Renk ve adlar; sınıf sınırları lib/agreement.js CLOUD_LIMITS (cloudClass)
const CLOUD_SCALE = [
  { color: "#F1F4EF", ink: "#1F2A24", label: "açık", range: "%0–10" },
  { color: "#DDE3DE", ink: "#1F2A24", label: "az bulutlu", range: "%10–30" },
  { color: "#BFC8C3", ink: "#1F2A24", label: "parçalı bulutlu", range: "%30–50" },
  { color: "#8E9B96", ink: "#FFFFFF", label: "çok bulutlu", range: "%50–90" },
  { color: "#63706B", ink: "#FFFFFF", label: "kapalı", range: "%90–100" },
];

const cloudIndex = cloudClass;
const cloudAgreeAt = (models, i) => classAgreement(models, i, "cloud_cover", cloudClass);

const CLOUD = {
  key: "cloud",
  title: "Bulutluluk",
  rowH: 18,
  minCell: 0,
  field: "cloud_cover",
  sub: (step, models) =>
    `toplam kapalılık · ${step === 1 ? "saatlik" : `${step} saatlik dilim ortalaması`} · ${models.length} model`,
  cell(m, s0, step, cw, RH, times) {
    let a = 0;
    let c = 0;
    for (let i = s0; i < s0 + step && i < times.length; i++) {
      const v = numOrNull(m.series[i]?.cloud_cover);
      if (v != null) {
        a += v;
        c++;
      }
    }
    if (!c) return null;
    a /= c;
    const k = cloudIndex(a);
    const S = CLOUD_SCALE[k];
    return {
      svg: (
        <>
          <rect x="0.5" y="1" width={Math.max(0.6, cw - 1)} height={RH - 3} rx="2" fill={S.color} />
          {cw >= 24 && (
            <text x={cw / 2} y={RH / 2 + 2.5} textAnchor="middle" fontFamily={MONO} fontSize="9" fill={S.ink}>
              {Math.round(a)}
            </text>
          )}
        </>
      ),
      tip: (
        <>
          <b>
            {m.label} · {S.label}
          </b>
          <div className="lc-mono">{slotText(times, s0, step)}</div>
          <div>
            Bulut %{Math.round(a)}
            {step > 1 ? " (dilim ortalaması)" : ""}
          </div>
        </>
      ),
    };
  },
  agree: cloudAgreeAt,
  // 3/6/12 saat: hücredeki dilim ortalamasının uyumu (26 Ekim)
  slotAgree: (models, s0, step) => slotClassAgreement(models, s0, step, "cloud_cover", cloudClass),
  agreeLabels: (b) => {
    const t = AGREE_STYLE_LC[b.level].text;
    return b.peak ? [`${t} · ${b.peak.inClass}/${b.peak.n} ${CLOUD_SCALE[b.peak.mode].label}`, t] : [t];
  },
  agreeTip: (pk, times) => (
    <>
      <div>
        {whereText(times, pk)} · {pk.n} modelin {pk.inClass}&apos;{trPossessive(pk.inClass)} aynı sınıfta:{" "}
        {CLOUD_SCALE[pk.mode].label} ({CLOUD_SCALE[pk.mode].range})
      </div>
      <div className="lc-mono lc-rule">
        Ortanca bulut sınıfındaki modellerin oranı: % 75 ve üstü hemfikir, % 50–75 kısmen, altı ayrışıyor. 3 / 6 / 12 saatlik
        görünümde hücredeki dilim ortalaması karşılaştırılır.
      </div>
    </>
  ),
  key: () =>
    CLOUD_SCALE.map((c) => (
      <Chip key={c.label} bg={c.color} ink={c.ink}>
        {c.label} {c.range}
      </Chip>
    )),
};

// ---------------------------------------------------------------------------
// Hava durumu: hücrede dilimdeki en belirgin durumun ikonu (kurallar: components/WeatherCond.js).
// ---------------------------------------------------------------------------
const WX = {
  key: "wx",
  title: "Hava durumu",
  rowH: 34,
  minCell: 28,
  field: "cloud_cover",
  sub: (step, models) =>
    `${step === 1 ? "saatlik" : `${step} saatlik dilim · dilimdeki en belirgin durum`} · ${models.length} model`,
  cell(m, s0, step, cw, RH, times) {
    const sc = slotCond(m, s0, step);
    if (!sc) return null;
    const sz = Math.min(26, cw - 4);
    let rs = 0;
    for (let i = s0; i < s0 + step && i < times.length; i++) rs += numOrNull(m.series[i]?.precip_amount) || 0;
    const cc = numOrNull(m.series[sc.i]?.cloud_cover);
    const e = numOrNull(m.series[sc.i]?.cape);
    return {
      svg: (
        <>
          <rect x="1" y="1" width={cw - 2} height={RH - 2} fill="transparent" />
          <WxIcon ic={sc.ic} size={sz} x={(cw - sz) / 2} y={(RH - sz) / 2} />
        </>
      ),
      tip: (
        <>
          <b>
            {m.label} · {sc.text}
          </b>
          <div className="lc-mono">{slotText(times, s0, step)}</div>
          <div>
            Yağış {rs < 0.05 ? "yok" : `${rs.toFixed(1)} mm`}
            {step > 1 ? " (dilim toplamı)" : ""} · Bulut %{cc == null ? "—" : Math.round(cc)}
            {e != null ? ` · CAPE ${Math.round(e)} J/kg` : ""}
          </div>
          {numOrNull(m.series[sc.i]?.visibility) != null && (
            <div>
              Görüş {visText(numOrNull(m.series[sc.i]?.visibility))}
              {step > 1 ? ` (${hourText(times, sc.i)})` : ""}
            </div>
          )}
          {step > 1 && <div className="lc-mono">en belirgin saat {hourText(times, sc.i)}</div>}
        </>
      ),
    };
  },
  agree: weatherAgreement,
  // 3/6/12 saat: sütundaki ikonların uyumu (her modelin dilim durumu; 26 Ekim)
  slotAgree: slotWeatherAgreement,
  agreeLabels: (b) => {
    const t = AGREE_STYLE_LC[b.level].text;
    return b.peak ? [`${t} · ${b.peak.inClass}/${b.peak.n} ${b.peak.mode}`, t] : [t];
  },
  agreeTip: (pk, times) => (
    <>
      <div>
        {whereText(times, pk)} · {pk.n} modelin {pk.inClass}&apos;{trPossessive(pk.inClass)}{" "}
        {pk.mode === "yağış"
          ? "yağış veriyor"
          : pk.obs
          ? `görüş veren modeller içinde ${pk.mode.toLocaleLowerCase("tr")}`
          : `aynı sınıfta: ${pk.mode}`}
      </div>
      <div className="lc-mono lc-rule">
        Modellerin en az yarısı yağış veriyorsa yağış verenlerin oranı; değilse görüş veren modellerin (ECMWF, GFS, UKMO,
        ICON) en az yarısı sisli (≤ 1 km) ya da puslu (1–5 km) ise onların oranı; değilse ortanca bulut sınıfındaki
        modellerin oranı (yağış veren azınlık da bulut sınıfıyla sayılır): % 75 ve üstü hemfikir, % 50–75 kısmen, altı
        ayrışıyor. 3 / 6 / 12 saatlik görünümde sütundaki ikonlar, yani her modelin dilim durumu karşılaştırılır.
      </div>
    </>
  ),
  key: (models) =>
    [
      ...WX_KEY,
      ...(models.some((m) => m.series.some((_, i) => condAt(m, i)?.obs)) ? WX_KEY_OBS : []),
      ...(models.some((m) => m.series.some((_, i) => condAt(m, i)?.snow)) ? WX_KEY_SNOW : []),
    ].map(([ic, t]) => (
      <span key={ic} className="lc-ik">
        <WxIcon ic={ic} size={18} />
        {t}
      </span>
    )),
};

export const MATRICES = { wx: WX, wind: WIND, cloud: CLOUD };

export default function MatrixPanel({ cfg, models, period, status, selection, onSelect, sun }) {
  const [step, setStep] = useState(defaultStepFor(period));
  useEffect(() => setStep(defaultStepFor(period)), [period]);
  const [unitId, setUnitId] = useState(cfg.units ? cfg.units[0].id : null);
  const unit = cfg.units ? cfg.units.find((u) => u.id === unitId) : null;

  const [boxEl, setBoxEl] = useState(null);
  const scRef = useRef(null);
  const width = useWidth(boxEl);
  const [tip, setTip] = useState(null);

  const ok = status === "ok" && models && models.length > 0;
  const n = ok ? models[0].series.length : 0;
  const times = ok ? models[0].series.map((s) => s.time) : [];
  const hasAny = ok && models.some((m) => m.series.some((s) => numOrNull(s[cfg.field]) != null));
  const multi = ok && models.length > 1;

  const geo = useMemo(() => {
    if (!hasAny || !width) return null;
    const avail = Math.max(200, width - LABW);
    const pxh0 = Math.max((avail - 8) / n, MIN_PXH);
    const cols = Math.ceil(n / step);
    const cw = Math.max(step * pxh0, cfg.minCell || 0);
    const pxh = cw / step;
    const x = (i) => X0 + i * pxh;
    const W = Math.ceil(x(n) + 4);
    const RH = cfg.rowH;
    const BOT = TOP + models.length * RH;
    const AY = BOT + 6;
    const H = multi ? AY + STRIP_H + 4 : BOT + 4;
    return { pxh, x, W, cols, cw, RH, BOT, AY, H };
  }, [hasAny, width, n, step, models, multi, cfg]);

  // uyum: hücrede gösterilenin uyumu (Ali Kemal, 26 Ekim) — saatlikte o saat; 3/6/12 saatte hava durumunda sütundaki
  // ikonlar (dilim durumu), bulutlulukta dilim ortalaması, rüzgarda hücredeki dilimin ilk saati. Komşu aynı seviyeler tek blok.
  const blocks = useMemo(() => {
    if (!geo || !multi) return [];
    const out = [];
    for (let c = 0; c < geo.cols; c++) {
      const s0 = c * step;
      const r = step > 1 && cfg.slotAgree ? cfg.slotAgree(models, s0, Math.min(step, n - s0)) : cfg.agree(models, s0);
      const w = r.level === "na" ? null : r;
      const L = w ? w.level : "na";
      const last = out[out.length - 1];
      if (last && last.level === L) {
        last.to = c;
        if (w && (!last.peak || w.rank > last.peak.rank)) last.peak = w;
      } else out.push({ level: L, from: c, to: c, peak: w });
    }
    return out;
  }, [geo, multi, step, n, models, cfg]);

  const nowIdx = useNowIndex(times);
  const { more, onScroll } = useSyncedScroll(scRef, geo, period, nowIdx);
  useRevealSelection(scRef, geo, selection);

  const cells = useMemo(() => {
    if (!geo) return [];
    const ts = models[0].series.map((s) => s.time);
    const out = [];
    models.forEach((m, mi) => {
      for (let c = 0; c < geo.cols; c++) {
        const r = cfg.cell(m, c * step, step, geo.cw, geo.RH, ts, unit);
        out.push(r ? { ...r, c, mi } : { c, mi, empty: true });
      }
    });
    return out;
  }, [geo, models, step, cfg, unit]);

  function showTip(e, content) {
    const pt = e.touches ? e.touches[0] : e;
    setTip({ x: pt.clientX, y: pt.clientY, content });
  }

  function onMove(e) {
    const g = e.target.closest && e.target.closest("[data-cell],[data-seg]");
    if (!g) {
      setTip(null);
      return;
    }
    if (g.hasAttribute("data-cell")) {
      showTip(e, cells[+g.getAttribute("data-cell")].tip);
      return;
    }
    const b = blocks[+g.getAttribute("data-seg")];
    const st = AGREE_STYLE_LC[b.level];
    showTip(
      e,
      <>
        <b>Uyum: {st.text}</b>
        <div className="lc-mono">
          {slotText(times, b.from * step, 1).replace(" TSİ", "")} – {slotText(times, Math.min(n - 1, b.to * step + step - 1), 1)}
        </div>
        {cfg.agreeTip(b.peak, times)}
      </>
    );
  }

  // hücreye ya da sütuna tıklama → ortak seçili zaman (üstteki gün/saat başlığı hariç)
  function onClick(e) {
    if (!geo || !onSelect) return;
    const box = e.currentTarget.getBoundingClientRect();
    const g = e.target.closest && e.target.closest("[data-cell]");
    let c;
    if (g) c = cells[+g.getAttribute("data-cell")].c;
    else {
      if (e.clientY - box.top < TOP - 6) return;
      c = Math.floor((e.clientX - box.left - X0) / geo.cw);
    }
    if (c < 0 || c >= geo.cols) return;
    onSelect(c * step, step);
  }

  // --- çizim ---
  let body = null;
  let leftAxis = null;
  if (geo) {
    const { x, W, cols, cw, RH, BOT, AY, H, pxh } = geo;
    leftAxis = (
      <svg width={LABW} height={H} aria-hidden="true">
        <text x={LABW - 8} y={30} textAnchor="end" fontFamily={MONO} fontSize="10" fill="var(--ink-faint)">
          TSİ
        </text>
        {models.map((m, mi) => (
          <text
            key={m.id}
            x={LABW - 8}
            y={TOP + mi * RH + RH / 2 + 4}
            textAnchor="end"
            fontFamily='"IBM Plex Sans", "Segoe UI", sans-serif'
            fontSize="11.5"
            fontWeight="600"
            fill={m.color}
          >
            {m.label}
          </text>
        ))}
        {multi && (
          <text x={LABW - 8} y={AY + STRIP_H / 2 + 3.5} textAnchor="end" fontFamily={MONO} fontSize="10" fill="var(--ink-soft)">
            uyum
          </text>
        )}
      </svg>
    );
    const head = [];
    // gündüz şeridi: gün doğumundan gün batımına (31 Ekim)
    for (const [a, b] of dayBands(times, sun)) head.push(<rect key={`dn${a}`} x={x(a)} y={33} width={x(b) - x(a)} height={4} rx="1" fill="#E9D9B0" />);
    const nowCol = nowIdx >= 0 ? Math.floor(nowIdx / step) : -1;
    for (let c = 0; c < cols; c++) {
      const i = c * step;
      const p = parseTime(times[i]);
      if (!p) continue;
      const xx = x(i);
      if (p.hour === 0)
        head.push(
          <g key={`d${c}`}>
            <line x1={xx} x2={xx} y1={4} y2={BOT} stroke="var(--line)" />
            <text x={xx + 4} y={14} fontFamily={MONO} fontSize="11" fontWeight="600" fill="var(--ink)">
              {DAY3[p.wd]} {p.day} {MON3[p.mon]}
            </text>
          </g>
        );
      const showHour = cw >= 22 || (p.hour % 6 === 0 && p.hour !== 0 && pxh * 6 >= 17);
      if (showHour) {
        const isNow = c === nowCol;
        head.push(
          <text
            key={`t${c}`}
            x={cw >= 22 ? xx + cw / 2 : xx}
            y={29}
            textAnchor="middle"
            fontFamily={MONO}
            fontSize="9.5"
            fontWeight={isNow ? 600 : 400}
            fill={isNow ? "var(--teal)" : "var(--ink-faint)"}
          >
            {pad2(p.hour)}
          </text>
        );
      }
    }
    const label = (labels, bw) => labels.find((t) => bw >= 12 + t.length * CH + 8) || "";
    body = (
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={cfg.title}
        onMouseMove={onMove}
        onMouseLeave={() => setTip(null)}
        onClick={onClick}
        style={{ cursor: onSelect ? "pointer" : undefined }}
        onTouchStart={(e) => {
          onMove(e);
          setTimeout(() => setTip(null), 2600);
        }}
      >
        {head}
        {cells.map((r, k) =>
          r.empty ? (
            <text
              key={k}
              x={x(r.c * step) + cw / 2}
              y={TOP + r.mi * RH + RH / 2 + 3}
              textAnchor="middle"
              fontSize="10"
              fill="var(--ink-faint)"
            >
              ·
            </text>
          ) : (
            <g key={k} data-cell={k} transform={`translate(${x(r.c * step)},${TOP + r.mi * RH})`}>
              {r.svg}
            </g>
          )
        )}
        {nowCol >= 0 && nowCol < cols && (
          <rect
            x={x(nowCol * step) + 0.5}
            y={TOP - 1}
            width={cw - 1}
            height={models.length * RH + 1}
            rx="3"
            fill="none"
            stroke={NOW_FRAME}
            strokeWidth="2"
            pointerEvents="none"
          />
        )}
        {multi &&
          blocks.map((b, bi) => {
            if (b.level === "na") return null;
            const st = AGREE_STYLE_LC[b.level];
            const x0 = x(b.from * step) + 1;
            const bw = (b.to - b.from + 1) * cw - 2;
            if (bw <= 1) return null;
            const txt = label(cfg.agreeLabels(b), bw);
            const gw = (txt ? 12 : 9) + txt.length * CH;
            const gx = x0 + bw / 2 - gw / 2;
            return (
              <g key={`a${bi}`} data-seg={bi} style={{ cursor: "help" }}>
                <rect x={x0} y={AY} width={bw} height={STRIP_H} rx="3" fill={st.bg} />
                {bw >= 13 && <AgreeMark level={b.level} x={gx} y={AY + (STRIP_H - 9) / 2} size={9} color={st.ink} strokeWidth={1.9} />}
                {txt && (
                  <text x={gx + 12} y={AY + STRIP_H / 2 + 3.4} fontFamily={MONO} fontSize="9.5" fill={st.ink} pointerEvents="none">
                    {txt}
                  </text>
                )}
              </g>
            );
          })}
        <SelFrame geo={geo} n={n} selection={selection} y0={TOP - 4} y1={(multi ? AY + STRIP_H : BOT) + 3} />
      </svg>
    );
  }

  const scrollable = geo && scRef.current ? geo.W > scRef.current.clientWidth + 4 : false;
  const sub = ok ? `${cfg.sub(step, models, unit)}${scrollable ? " · yatay kaydırılabilir" : ""}` : "";

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-head-left">
          <div className="panel-title">{cfg.title}</div>
          <div className="panel-sub" title={sub}>
            {sub}
          </div>
        </div>
        <div className="mx-controls">
          <div className="unit-toggle">
            {[1, 3, 6].map((h) => (
              <button key={h} type="button" className={step === h ? "active" : ""} onClick={() => setStep(h)}>
                {h}s
              </button>
            ))}
          </div>
          {cfg.units && (
            <div className="unit-toggle">
              {cfg.units.map((u) => (
                <button key={u.id} type="button" className={unitId === u.id ? "active" : ""} onClick={() => setUnitId(u.id)}>
                  {u.label}
                </button>
              ))}
            </div>
          )}
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
          </div>
          <div className="lc-key">
            {cfg.key(models)}
            {multi && (
              <>
                <span className="lc-br" />
                {["ok", "partial", "split"].map((l) => (
                  <Chip key={l} bg={AGREE_STYLE_LC[l].bg} ink={AGREE_STYLE_LC[l].ink} level={l}>
                    {AGREE_STYLE_LC[l].text}
                  </Chip>
                ))}
              </>
            )}
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
