// Toplam yağış paneli (Paket 3, Ekim 2026) — çizgi grafiklerle aynı düzen:
// sabit sol eksen, 06–18 gündüz bandı, 06 / 12 / 18 dikmeleri, "şimdi" çizgisi, 16 günde yatay kaydırma
// (diğer grafiklerle saat üzerinden birlikte kayar), altta yalnız anahtar.
// - Çubuk: seçilen dilimdeki (1s / 3s / 6s) toplam yağış, her model kendi renginde yan yana.
// - Uyum şeridi günlüktür: her modelin o günkü toplamı eşiğe (varsayılan 0.2 mm) göre "yağış var / yok"
//   sayılır; modellerin en az % 75'i aynı taraftaysa "yağışta uzlaşı" ya da "yağış yok", değilse
//   "modeller bölünmüş". Eşik anahtardaki düğmelerle değiştirilebilir.
//   (Yağış olasılığı kullanılmaz: UKMO ve ARPEGE bu değeri sunmuyor.)
// - Tıklanan dilim ortak seçili zamandır (Model detayları oraya gider; bkz. LineChartPanel SelFrame).

import { useEffect, useMemo, useRef, useState } from "react";
import { RAIN_DAY_DEFAULT, groupDays, rainDayAgreement } from "../lib/agreement";
import {
  Chip,
  DAY3,
  SelFrame,
  LABW,
  MIN_PXH,
  MON3,
  MONO,
  STRIP_H,
  X0,
  defaultStepFor,
  numOrNull,
  pad2,
  parseTime,
  tipStyle,
  trPossessive,
  useNowIndex,
  useRevealSelection,
  useSyncedScroll,
  useWidth,
} from "./LineChartPanel";

const PT = 26;
const PH = 150;
const RAIN_THRESHOLD_OPTIONS = [0.2, 0.5, 1, 2, 5];
const RAIN_GRID = [0.2, 0.5, 1, 2, 5, 10, 20, 50];

const RAIN_STATE = {
  wet: { bg: "#3B6FB6", ink: "#FFFFFF", text: "yağışta uzlaşı" },
  dry: { bg: "#DDE0DB", ink: "#1F2A24", text: "yağış yok" },
  mixed: { bg: "#D98E2B", ink: "#FFFFFF", text: "modeller bölünmüş" },
};

const mm = (v) => (Math.round(v * 10) / 10).toFixed(1);

// Günlük uyum kuralı (eşik, % 75) ve günlere bölme: lib/agreement.js (rainDayAgreement, groupDays)

function slotText(times, s0, step) {
  const p = parseTime(times[s0]);
  if (!p) return "";
  const day = `${p.day} ${MON3[p.mon]} ${DAY3[p.wd]}`;
  if (step === 1) return `${day} ${pad2(p.hour)}:00 TSİ`;
  const e = parseTime(times[Math.min(times.length - 1, s0 + step - 1)]);
  return `${day} ${pad2(p.hour)}:00–${pad2(e ? e.hour : p.hour)}:59 TSİ`;
}

export default function PrecipPanel({ models, period, status, selection, onSelect }) {
  const [step, setStep] = useState(defaultStepFor(period));
  useEffect(() => setStep(defaultStepFor(period)), [period]);
  const [threshold, setThreshold] = useState(RAIN_DAY_DEFAULT);

  const [boxEl, setBoxEl] = useState(null);
  const scRef = useRef(null);
  const width = useWidth(boxEl);
  const [hoverC, setHoverC] = useState(null);
  const [tip, setTip] = useState(null);

  const ok = status === "ok" && models && models.length > 0;
  const n = ok ? models[0].series.length : 0;
  const times = ok ? models[0].series.map((s) => s.time) : [];
  const hasAny = ok && models.some((m) => m.series.some((s) => numOrNull(s.precip_amount) != null));
  const multi = ok && models.length > 1;

  const geo = useMemo(() => {
    if (!hasAny || !width) return null;
    const avail = Math.max(200, width - LABW);
    const pxh = Math.max((avail - 8) / n, MIN_PXH);
    const x = (i) => X0 + i * pxh;
    const W = Math.ceil(x(n) + 4);
    const cols = Math.ceil(n / step);
    const sums = [];
    let mx = 0;
    for (let c = 0; c < cols; c++) {
      const row = models.map((m) => {
        let a = 0;
        let any = false;
        for (let i = c * step; i < c * step + step && i < n; i++) {
          const v = numOrNull(m.series[i]?.precip_amount);
          if (v != null) {
            a += v;
            any = true;
          }
        }
        return any ? a : null;
      });
      row.forEach((v) => {
        if (v != null) mx = Math.max(mx, v);
      });
      sums.push(row);
    }
    const g = RAIN_GRID.find((k) => Math.max(mx, 0.5) / k <= 5) ?? 50;
    const top = Math.max(g, Math.ceil(mx / g - 1e-9) * g);
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += g) ticks.push(Math.round(v * 100) / 100);
    const PB = PT + PH;
    const y = (v) => PT + (1 - v / top) * PH;
    const SY = PB + 22;
    const H = multi ? SY + STRIP_H + 6 : PB + 20;
    return { pxh, x, W, cols, sums, ticks, y, PB, SY, H, cw: step * pxh };
  }, [hasAny, width, n, step, models, multi]);

  const days = useMemo(() => {
    if (!geo || !multi) return [];
    return groupDays(models[0].series.map((s) => s.time)).map((d) => rainDayAgreement(models, d, threshold));
  }, [geo, multi, models, threshold]);

  const nowIdx = useNowIndex(times);
  const { more, onScroll } = useSyncedScroll(scRef, geo, period, nowIdx);
  useRevealSelection(scRef, geo, selection);

  function showTip(e, content) {
    const pt = e.touches ? e.touches[0] : e;
    setTip({ x: pt.clientX, y: pt.clientY, content });
  }

  function onLeave() {
    setHoverC(null);
    setTip(null);
  }

  function onMove(e) {
    if (!geo) return;
    const seg = e.target.closest && e.target.closest("[data-seg]");
    if (seg) {
      setHoverC(null);
      showTip(e, dayTip(days[+seg.getAttribute("data-seg")]));
      return;
    }
    if (!(e.target.getAttribute && e.target.getAttribute("data-hit"))) {
      onLeave();
      return;
    }
    const box = e.currentTarget.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    const c = Math.max(0, Math.min(geo.cols - 1, Math.floor((pt.clientX - box.left - X0) / geo.cw)));
    setHoverC(c);
    showTip(e, slotTip(c));
  }

  function onClick(e) {
    if (!geo || !onSelect || !(e.target.getAttribute && e.target.getAttribute("data-hit"))) return;
    const box = e.currentTarget.getBoundingClientRect();
    const c = Math.max(0, Math.min(geo.cols - 1, Math.floor((e.clientX - box.left - X0) / geo.cw)));
    onSelect(c * step, step);
  }

  function slotTip(c) {
    const rows = models.map((m, mi) => ({ m, v: geo.sums[c][mi] })).sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
    return (
      <>
        <b>{slotText(times, c * step, step)}</b>
        {step > 1 && <div className="lc-mono">{step} saatlik toplam</div>}
        {rows.map((r) => (
          <div className="lc-row" key={r.m.id}>
            <span>
              <i style={{ background: r.m.color }} />
              {r.m.label}
            </span>
            <span>{r.v == null ? "veri yok" : r.v < 0.05 ? "yok" : `${mm(r.v)} mm`}</span>
          </div>
        ))}
        {rows.some((r) => r.v == null) && <div className="lc-mono lc-rule">veri yok: modelin tahmin süresi bitti</div>}
      </>
    );
  }

  function dayTip(r) {
    const R = RAIN_STATE[r.st];
    const p = parseTime(times[r.h0]);
    const when = p ? `${p.day} ${MON3[p.mon]} ${DAY3[p.wd]}` : r.key;
    return (
      <>
        <b>Uyum: {R.text}</b>
        <div className="lc-mono">
          {when} · günlük toplam, eşik ≥ {threshold} mm
        </div>
        {r.per
          .slice()
          .sort((a, b) => b.sum - a.sum)
          .map((q) => (
            <div className="lc-row" key={q.m.id}>
              <span>
                <i style={{ background: q.m.color }} />
                {q.m.label}
              </span>
              <span>
                {mm(q.sum)} mm · {q.wet ? "yağış" : "yok"}
              </span>
            </div>
          ))}
        <div className="lc-mono lc-rule">
          {r.n} modelin {r.wet}&apos;{trPossessive(r.wet)} yağış bekliyor. Modellerin en az % 75&apos;i aynı
          taraftaysa uzlaşı, değilse bölünmüş.
        </div>
      </>
    );
  }

  // --- çizim ---
  let body = null;
  let leftAxis = null;
  if (geo) {
    const { x, W, y, ticks, PB, SY, H, pxh, cw, sums } = geo;
    leftAxis = (
      <svg width={LABW} height={H} aria-hidden="true">
        {ticks.map((v) => (
          <text key={v} x={LABW - 8} y={y(v) + 3.5} textAnchor="end" fontFamily={MONO} fontSize="10" fill="var(--ink-soft)">
            {v}
          </text>
        ))}
        {multi && (
          <text x={LABW - 8} y={SY + STRIP_H / 2 + 3.5} textAnchor="end" fontFamily={MONO} fontSize="10" fill="var(--ink-soft)">
            uyum
          </text>
        )}
      </svg>
    );
    const dayIdx = [];
    for (let d = 0; d * 24 < n; d++) dayIdx.push(d);
    const hours = [];
    for (let i = 0; i < n; i += 6) hours.push(i);
    const bw = Math.max(0.8, (cw - 1.5) / models.length);
    const label = (txt, len) => (len >= txt.length * 5.7 + 8 ? txt : null);
    body = (
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Toplam yağış"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={onClick}
        onTouchStart={(e) => {
          onMove(e);
          setTimeout(onLeave, 2600);
        }}
      >
        {dayIdx.map((d) => {
          const g0 = x(d * 24 + 6);
          const g1 = x(Math.min(n, d * 24 + 18));
          return g1 > g0 ? <rect key={`dn${d}`} x={g0} y={PT} width={g1 - g0} height={PH} fill="#F3EAD3" opacity="0.55" /> : null;
        })}
        {ticks.map((v) => (
          <line key={`g${v}`} x1={X0} x2={x(n)} y1={y(v)} y2={y(v)} stroke="#DCE1D9" />
        ))}
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
        {/* çubuklar: dilim toplamı, modeller yan yana */}
        {sums.map((row, c) =>
          row.map((v, mi) =>
            v == null || v < 0.05 ? null : (
              <rect
                key={`${c}-${mi}`}
                x={(x(c * step) + 0.75 + mi * bw).toFixed(2)}
                y={y(v).toFixed(1)}
                width={Math.max(0.6, bw - 0.4).toFixed(2)}
                height={(PB - y(v)).toFixed(1)}
                fill={models[mi].color}
              />
            )
          )
        )}
        {hoverC != null && (
          <rect pointerEvents="none" x={x(hoverC * step)} y={PT} width={cw} height={PH} fill="var(--ink)" opacity="0.07" />
        )}
        {/* günlük uyum şeridi */}
        {multi &&
          days.map((r, di) => {
            if (!r.st) return null;
            const R = RAIN_STATE[r.st];
            const x0 = x(r.h0) + 1;
            const w = x(r.h1) - x(r.h0) - 2;
            if (w <= 1) return null;
            const maj = r.st === "dry" ? r.n - r.wet : r.wet;
            const txt =
              label(`${R.text} ${maj}/${r.n}`, w) || label(R.text, w) || (r.st === "mixed" ? label("bölünmüş", w) : null);
            return (
              <g key={`d${di}`} data-seg={di} style={{ cursor: "help" }}>
                <rect x={x0} y={SY} width={w} height={STRIP_H} rx="3" fill={R.bg} />
                {txt && (
                  <text
                    x={x0 + w / 2}
                    y={SY + STRIP_H / 2 + 3.4}
                    textAnchor="middle"
                    fontFamily={MONO}
                    fontSize="9.5"
                    fill={R.ink}
                    pointerEvents="none"
                  >
                    {txt}
                  </text>
                )}
              </g>
            );
          })}
        <SelFrame geo={geo} n={n} selection={selection} y0={PT - 2} y1={PB + 2} />
        <rect data-hit="1" x={X0} y={PT} width={x(n) - X0} height={PH} fill="transparent" style={{ cursor: onSelect ? "pointer" : undefined }} />
      </svg>
    );
  }

  const scrollable = geo && scRef.current ? geo.W > scRef.current.clientWidth + 4 : false;
  const sub = ok
    ? `mm / ${step} saat (dilim toplamı) · ${models.length} model${scrollable ? " · yatay kaydırılabilir" : ""}`
    : "mm";

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-head-left">
          <div className="panel-title">Toplam yağış</div>
          <div className="panel-sub" title={sub}>
            {sub}
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
      {ok && !hasAny && <div className="err">Bu modeller için yağış verisi yok.</div>}
      {ok && hasAny && (
        <>
          <div className={"lc" + (more ? " more" : "")} ref={setBoxEl}>
            <div className="lc-y">{leftAxis}</div>
            <div className="lc-sc" ref={scRef} onScroll={onScroll}>
              {body}
            </div>
          </div>
          {multi && (
            <div className="lc-key">
              {["wet", "dry", "mixed"].map((k) => (
                <Chip key={k} bg={RAIN_STATE[k].bg} ink={RAIN_STATE[k].ink}>
                  {RAIN_STATE[k].text}
                </Chip>
              ))}
              <span className="lc-thr">
                uyum eşiği: günlük toplam ≥
                <span className="unit-toggle">
                  {RAIN_THRESHOLD_OPTIONS.map((t) => (
                    <button key={t} type="button" className={threshold === t ? "active" : ""} onClick={() => setThreshold(t)}>
                      {t}
                    </button>
                  ))}
                </span>
                mm
              </span>
            </div>
          )}
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
