// Sayfa 1 — saatlik karşılaştırma (iki ve daha çok model; Prototip 9). Her satırda seçili modellerin ortancası ve
// uyum çubuğu. Ortanca + uyum kuralları web ve /api/v1 ile ortak: lib/consensus.js (buildConsensus).

import { useEffect, useRef, useState } from "react";
import { median } from "@lib/agreement";
import { CLS_RNG, CLS_TXT, SKY, WxIcon, condView } from "../icons";
import { dir16, fmt, heroTitle, pad, parseT, speed, tsuf, unitLabel } from "../format";
import { dayIndexOf, gust, val } from "../data";
import { HourStrip, UnitToggle, useDaySwipe } from "./common";

const AG_COL = { ok: "#DDE0DB", partial: "#F0C98A", split: "#D98E2B" };
const STORM_KMH = 62;

const pctOf = (p) => (p && p.n >= 2 ? p.in / p.n : null);
const levelOf = (pct) => (pct == null ? "na" : pct >= 0.75 ? "ok" : pct >= 0.5 ? "partial" : "split");

function Bar({ p, thin, title, what = "uyumlu", onInfo }) {
  const pct = pctOf(p);
  const l = levelOf(pct);
  const info = (
    <>
      <div>{title}</div>
      <div>{pct == null ? "yeterli model yok" : `${p.n} modelin ${p.in}'${tsuf(p.in)} ${what}`}</div>
    </>
  );
  return (
    <button
      type="button"
      className={"abar" + (thin ? " thin" : "") + (l === "na" ? " na" : "")}
      aria-label={`Uyum ${pct == null ? "veri yok" : "% " + Math.round(pct * 100)}`}
      onClick={() => onInfo(info)}
    >
      {l !== "na" && <i style={{ width: `${Math.round(pct * 100)}%`, background: AG_COL[l] }} />}
      <span>{pct == null ? "—" : "% " + Math.round(pct * 100)}</span>
    </button>
  );
}

function Rose({ models, i }) {
  const parts = [];
  for (const [a, l] of [
    [0, "K"],
    [90, "D"],
    [180, "G"],
    [270, "B"],
  ]) {
    const x = 32 + 24 * Math.sin((a * Math.PI) / 180);
    const y = 32 - 24 * Math.cos((a * Math.PI) / 180);
    parts.push(
      <text key={l} x={x} y={y + 3} fontSize="7" textAnchor="middle" fill="rgba(255,255,255,.7)" fontFamily="IBM Plex Mono">
        {l}
      </text>
    );
  }
  for (const m of models) {
    const d = val(m, "wind_direction", i);
    const w = val(m, "wind_speed", i);
    if (d == null || w == null) continue;
    const r = 27;
    const p = (a) => `${(32 + r * Math.sin((a * Math.PI) / 180)).toFixed(1)},${(32 - r * Math.cos((a * Math.PI) / 180)).toFixed(1)}`;
    parts.push(<path key={m.id} d={`M32,32 L${p(d - 20)} A${r},${r} 0 0 1 ${p(d + 20)} Z`} fill={m.color} fillOpacity=".62" stroke="#fff" strokeWidth=".8" />);
  }
  return (
    <svg className="rose" viewBox="0 0 64 64" aria-label="Rüzgar yönü, model başına dilim">
      <circle cx="32" cy="32" r="28" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.35)" />
      {parts}
      <circle cx="32" cy="32" r="2.4" fill="#fff" />
    </svg>
  );
}

// Hamle: modellerin dağılımı; 62 km/s fırtına çizgisi yalnız hamle 50 km/s'ye ulaşınca (V04 P4)
function GustBar({ models, i, unit }) {
  const pts = models.map((m) => ({ m, g: gust(m, i) })).filter((p) => p.g != null);
  if (!pts.length) return { node: <div className="k">hamle verisi yok</div>, med: null };
  const gs = pts.map((p) => speed(p.g, unit));
  const lo = Math.min(...gs);
  const hi = Math.max(...gs);
  const med = median(gs);
  const storm = speed(STORM_KMH, unit);
  const near = Math.max(...pts.map((p) => p.g)) >= 50;
  const top = Math.max(hi * 1.15, unit === "kt" ? 20 : 40, near ? storm * 1.1 : 0);
  const X = (v) => 8 + (Math.min(v, top) / top) * 154;
  const node = (
    <>
      <svg className="gustbar" viewBox="0 0 170 22">
        <line x1="8" x2="162" y1="11" y2="11" stroke="rgba(255,255,255,.25)" strokeWidth="2" strokeLinecap="round" />
        <line x1={X(lo)} x2={X(hi)} y1="11" y2="11" stroke="rgba(255,255,255,.75)" strokeWidth="4" strokeLinecap="round" />
        {near && <line x1={X(storm)} x2={X(storm)} y1="2" y2="20" stroke="#FFB9A8" strokeWidth="1" strokeDasharray="1.2 1.6" />}
        {pts.map((p) => (
          <circle key={p.m.id} cx={X(speed(p.g, unit)).toFixed(1)} cy="11" r="3.4" fill={p.m.color} stroke="#fff" strokeWidth="1" />
        ))}
        <text x={X(med)} y="21.5" fontSize="6.5" textAnchor="middle" fill="#fff" fontFamily="IBM Plex Mono">
          ▲
        </text>
      </svg>
      <div className="k">
        modeller {Math.round(lo)}–{Math.round(hi)} {unitLabel(unit)}
      </div>
      {near && <div className="k">noktalı çizgi: 62 km/s fırtına eşiği</div>}
    </>
  );
  return { node, med };
}

// Görüş: 1 km altı metre (10 m'ye yuvarlı), 10 km'ye kadar tek ondalık km, üstü tam km
const visTxt = (v) => (v < 1000 ? `${Math.round(v / 10) * 10} m` : v < 10000 ? `${fmt(v / 1000, 1)} km` : `${Math.round(v / 1000)} km`);
const medTxt = (v, u, none) => (v == null ? "—" : v < 0.05 ? none : `${fmt(v, 1)} ${u}`);

export default function P1({ models, cons, times, days, idx, nowIdx, unit, onUnit, onIdx, onGo }) {
  const hz = Math.max(...models.map((m) => m.hz));
  const i = Math.min(idx, Math.max(0, hz - 1));
  const t = times[i];
  const hh = pad(parseT(t).h);
  const d = dayIndexOf(days, i);
  const day = days[d];
  const lastDay = dayIndexOf(days, Math.max(0, hz - 1));
  const H = cons.hourly[i];
  const D = cons.daily[d];
  const view = condView(H.cond, parseT(t).h);
  const miss = models.filter((m) => val(m, "temp", i) == null).map((m) => m.label);

  const [info, setInfo] = useState(null);
  const tm = useRef(null);
  useEffect(() => () => clearTimeout(tm.current), []);
  const showInfo = (node) => {
    setInfo({ node, off: false });
    clearTimeout(tm.current);
    tm.current = setTimeout(() => setInfo((x) => x && { ...x, off: true }), 3000);
  };

  const goDay = (dd) => {
    const nd = d + dd;
    if (nd < 0 || nd > lastDay) return;
    const h = i - day.h0;
    onIdx(Math.min(hz - 1, days[nd].h0 + Math.min(h, days[nd].h1 - days[nd].h0 - 1)));
  };
  const swipe = useDaySwipe(goDay);

  const condInfo = view.wet
    ? ["Hava durumu · yağış: modellerin en az yarısı o saat ≥ 0,1 mm", "yağış veriyor"]
    : view.obs
    ? [`Hava durumu · ${view.obs === 2 ? "sis: görüş ≤ 1 km" : "pus: görüş 1–5 km"} · görüş veren modeller`, view.obs === 2 ? "sisli" : "sisli ya da puslu"]
    : view.cls == null
    ? ["Hava durumu", "uyumlu"]
    : [`Hava durumu · ${CLS_TXT[view.cls]} (${CLS_RNG[view.cls]})`, "aynı sınıfta"];
  // Günlük toplam yağış satırı yalnız modellerin en az yarısı yağış veriyorsa (≥ 0,2 mm; gün kuralıyla aynı,
  // beraberlikte yağış). Yarıdan azı veriyorsa ortanca 0 çıkıp "yağış yok" ile "% 43 yağış veriyor" çelişiyordu
  // (Ali Kemal, 25 Ekim: satır gizlensin; model bazında yağış Sayfa 2'de).
  const rainAny = D.precip_total.n > 0 && D.precip_total.in * 2 >= D.precip_total.n;
  const snowAny = D.snowfall_total.in > 0;
  const sdAny = models.some((m) => (val(m, "snow_depth", i) ?? 0) >= 0.05);
  const gb = GustBar({ models, i, unit });

  const hours = [];
  for (let j = day.h0; j < day.h1 && j < hz; j++) {
    const h = parseT(times[j]).h;
    hours.push({ i: j, h, temp: cons.hourly[j].temp.v, view: condView(cons.hourly[j].cond, h) });
  }

  return (
    <>
      <div className="hero" style={{ background: SKY[view.sky] }} {...swipe}>
        {/* 29 Ekim (stil birliği): Günlük karttaki başlık düzeni; gün seçimi kartın üstündeki gün şeridinde (App),
            kartta sağa / sola kaydırma da gün değiştirir */}
        <div className="p1title">
          <span>{heroTitle(t)}</span>
          <span>{models.length} model</span>
        </div>
        {miss.length > 0 && <div className="miss">bu saat için veri yok: {miss.join(", ")}</div>}
        <div className="grid1">
          <span />
          <span className="hd">uyum</span>
          <div className="v">
            <div className="cond" style={{ marginTop: 0 }}>
              <WxIcon name={view.icon} className="ic" />
              <span>{view.text}</span>
            </div>
          </div>
          <Bar p={H.cond} title={condInfo[0]} what={condInfo[1]} onInfo={showInfo} />
          {rainAny && (
            <>
              <div className="v">
                <span className="k">Günlük toplam yağış</span>
                <span className="mid lbv">{medTxt(D.precip_total.v, "mm", "yağış yok")}</span>
              </div>
              <Bar p={D.precip_total} title="Günlük toplam yağış · eşik ≥ 0,2 mm" what="yağış veriyor" onInfo={showInfo} />
            </>
          )}
          {snowAny && (
            <>
              <div className="v">
                <span className="k">Taze kar · {hh}:00</span>
                <span className="mid lbv">{medTxt(H.snowfall.v, "cm", "kar yok")}</span>
              </div>
              <Bar p={H.snowfall} title={`Taze kar · saat ${hh}:00 · eşik ≥ 0,1 cm`} what="kar veriyor" onInfo={showInfo} />
            </>
          )}
          {sdAny && (
            <>
              <div className="v">
                <span className="k">Toplam kar kalınlığı</span>
                <span className="mid lbv">{medTxt(H.snow_depth.v, "cm", "kar yok")}</span>
              </div>
              <Bar p={H.snow_depth} title="Toplam kar kalınlığı · eşik 5 cm" onInfo={showInfo} />
            </>
          )}
          <div className="v">
            <div className="temp">
              <span className="num">{fmt(H.temp.v)}</span>
              <span className="deg">°C</span>
            </div>
          </div>
          <Bar p={H.temp} title="Sıcaklık · eşik 2 °C" onInfo={showInfo} />
          <div className="v" style={{ font: "500 13px var(--f-mono)" }}>
            Min <span className="mn">{fmt(D.temp_min.v)}°</span> &nbsp; Maks <span className="mx">{fmt(D.temp_max.v)}°</span>
          </div>
          <div className="astack">
            <Bar p={D.temp_min} thin title="Günlük minimum sıcaklık · eşik 2 °C" onInfo={showInfo} />
            <Bar p={D.temp_max} thin title="Günlük maksimum sıcaklık · eşik 2 °C" onInfo={showInfo} />
          </div>
          <div className="v">
            <span className="k">Hissedilen</span>
            <span className="mid lbv">{fmt(H.feels_like.v, 1)}°</span>
          </div>
          <Bar p={H.feels_like} title="Hissedilen sıcaklık · eşik 2 °C" onInfo={showInfo} />
          <div className="v">
            <span className="k">Nem</span>
            <span className="mid lbv">% {fmt(H.humidity.v)}</span>
          </div>
          <Bar p={H.humidity} title="Nem · eşik % 10" onInfo={showInfo} />
          {/* Görüş (30 Ekim, Ali Kemal): yalnız yağış yokken ve o saatte ortak durum sis ya da pus iken */}
          {view.obs && H.visibility && H.visibility.v != null && (
            <>
              <div className="v">
                <span className="k">Görüş</span>
                <span className="mid lbv">{visTxt(H.visibility.v)}</span>
              </div>
              <Bar p={H.visibility} title="Görüş · sınıf: sis ≤ 1 km · pus 1–5 km · açık 5 km ve üstü" what="aynı sınıfta" onInfo={showInfo} />
            </>
          )}
          <div className="sep" />
          <div className="v">
            <div className="windrow">
              <Rose models={models} i={i} />
              <div style={{ textAlign: "left" }}>
                <div className="k">Rüzgar {H.wind.v == null ? "—" : H.wind.dir == null ? "VRB" : dir16(H.wind.dir)}</div>
                <div className="mid">
                  {fmt(speed(H.wind.v, unit))} {unitLabel(unit)}
                </div>
                <div style={{ marginTop: 3 }}>
                  <UnitToggle unit={unit} onUnit={onUnit} ghost />
                </div>
              </div>
            </div>
          </div>
          <Bar p={H.wind} title="Rüzgar · eşik hız 10 kt, yön 90°" onInfo={showInfo} />
          <div className="v">
            <span className="k">Hamle (ortanca)</span>
            <span className="mid lbv">{gb.med == null ? "—" : `${fmt(gb.med)} ${unitLabel(unit)}`}</span>
            {gb.node}
          </div>
          <span />
        </div>
        <div className={"ainfo" + (info && info.off ? " off" : "")} aria-live="polite">
          {info ? info.node : (
            <>
              <div className="hint">Uyum çubuğuna dokun:</div>
              <div className="hint">eşik ve uyumlu model sayısı burada yazar.</div>
            </>
          )}
        </div>
      </div>
      <HourStrip hours={hours} idx={i} nowIdx={nowIdx} onPick={onIdx} stripKey={`p1|${d}`} />
      <div className="foot">
        Değerler seçili modellerin ortancasıdır, tahmindir, ölçüm değildir.
        <br />
        Veri: Open-Meteo (CC BY 4.0)
      </div>
    </>
  );
}
