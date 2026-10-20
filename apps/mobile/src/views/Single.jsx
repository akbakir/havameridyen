// Tek model ekranı (yalnız bir model seçiliyken; Prototip 9). Durum ifadesi web ile aynı kuraldan (condAt).

import { useEffect, useRef, useState } from "react";
import { condAt } from "@lib/agreement";
import { SKY, WxIcon, condView } from "../icons";
import { dir16, fmt, fmtS, parseT, speed, unitLabel, whenText } from "../format";
import { dayIndexOf, dayMax, dayMin, dayTotal, gust, sourceOf, val } from "../data";
import { HourStrip, UnitToggle, useDaySwipe } from "./common";
import { PrecipGrid } from "./precip";
// NOAA SPC kademesi
function capeL(v) {
  if (!(v > 0)) return ["Kararlı", "b-none", "konvektif (kararsızlık kaynaklı) yağış potansiyeli yok"];
  if (v < 1000) return ["Zayıf kararsızlık", "b-weak", "hafif kümülüs, hafif sağanak ihtimali"];
  if (v < 2500) return ["Orta kararsızlık", "b-mod", "kümülonimbüs, kuvvetli sağanak, gök gürültülü sağanak"];
  if (v < 4000) return ["Kuvvetli kararsızlık", "b-strong", "şiddetli fırtına, dolu ihtimali"];
  return ["Aşırı kararsızlık", "b-ext", "çok şiddetli fırtına, hortum riski"];
}
function liL(v) {
  if (v > 0) return ["Kararlı", "b-none", "kararlı hava; konveksiyon için güçlü bir tetik gerekir"];
  if (v > -3) return ["Zayıf kararsızlık", "b-weak", "gök gürültülü fırtına mümkün, tetikleyici gerekir"];
  if (v > -6) return ["Orta kararsızlık", "b-mod", "gök gürültülü fırtına olası"];
  if (v > -9) return ["Kuvvetli kararsızlık", "b-strong", "kuvvetli ya da şiddetli fırtına olası"];
  return ["Aşırı kararsızlık", "b-ext", "şiddetli fırtına ve hortum riski"];
}
function cinL(v) {
  if (!(v > 0)) return ["Engel yok", "b-none", "yükselen havayı tutan bir katman yok; kararsızlık varsa konveksiyon kolay başlar"];
  if (v < 50) return ["Zayıf engel", "b-l1", "yüzey ısınmasıyla kolayca aşılır"];
  if (v <= 200) return ["Orta engel", "b-l2", "kuvvetli ısınma ya da sistem tetiklemesiyle aşılabilir"];
  return ["Güçlü engel", "b-l3", "fırtına gelişimini çoğunlukla engeller"];
}

function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

function Gauges({ m, i, unit, onUnit }) {
  const hv = val(m, "humidity", i);
  const wd = val(m, "wind_direction", i);
  const ww = val(m, "wind_speed", i);
  const wg = gust(m, i);
  const pv = val(m, "pressure", i);
  const fr = (v) => Math.max(0, Math.min(1, (v - 990) / 45));
  let sector = null;
  if (wd != null) {
    const pts = [];
    for (let q = 0; q <= 10; q++) {
      const a = ((wd - 16 + 3.2 * q) * Math.PI) / 180;
      pts.push(`${(32 + 28.5 * Math.sin(a)).toFixed(1)},${(32 - 28.5 * Math.cos(a)).toFixed(1)}`);
    }
    sector = <path className="sector" d={`M32,32 L${pts.join(" L")} Z`} />;
  }
  const fy = pv != null ? 50 - fr(pv) * 36 : 50;
  return (
    <div className="gauges">
      <div className="g">
        <svg className="dial" viewBox="0 0 64 64">
          <circle className="track" cx="32" cy="32" r="26" />
          {hv != null && <path className="prog" d={arcPath(32, 32, 26, 0, Math.max(1, Math.min(359.9, hv * 3.6)))} />}
          <path className="core" transform="translate(32,31)" d="M0,-8c4.2,4.5 7.3,8 7.3,11.3a7.3,7.3 0 1 1-14.6,0c0-3.3 3.1-6.8 7.3-11.3z" />
        </svg>
        <span className="gl">Nem</span>
        <span className="gv">{hv == null ? "—" : "% " + Math.round(hv)}</span>
      </div>
      <div className="g">
        <svg className="dial" viewBox="0 0 64 64">
          <circle className="track" cx="32" cy="32" r="26" />
          <line className="tick" x1="32" y1="3" x2="32" y2="8" />
          <line className="tick" x1="32" y1="56" x2="32" y2="61" />
          <line className="tick" x1="3" y1="32" x2="8" y2="32" />
          <line className="tick" x1="56" y1="32" x2="61" y2="32" />
          {sector}
          <circle className="core" cx="32" cy="32" r="2.6" />
        </svg>
        <span className="gl">Rüzgar</span>
        <span className="gv">{ww == null ? "—" : `${dir16(wd)} ${Math.round(speed(ww, unit))} ${unitLabel(unit)}`}</span>
        <span className="gs">{ww == null ? "" : wg == null ? "hamle —" : "hamle " + Math.round(speed(wg, unit))}</span>
        <UnitToggle unit={unit} onUnit={onUnit} ghost />
      </div>
      <div className="g">
        <svg className="dial" viewBox="0 0 64 64">
          <circle className="track" cx="32" cy="32" r="26" />
          {pv != null && <path className="prog" d={arcPath(32, 32, 26, 0, Math.max(1, fr(pv) * 359.9))} />}
          <rect className="tube" x="26" y="14" width="12" height="36" rx="6" />
          <rect className="fill" x="26" y={fy.toFixed(1)} width="12" height={(50 - fy).toFixed(1)} rx="6" />
          <circle className="fill" cx="32" cy="50" r="6" />
        </svg>
        <span className="gl">Basınç</span>
        <span className="gv">{pv == null ? "—" : Math.round(pv) + " hPa"}</span>
      </div>
    </div>
  );
}

// Etikete dokununca 3 sn "Beklenen" (V04 A4)
function useExpect() {
  const [open, setOpen] = useState(null);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  return [
    open,
    (key) => {
      setOpen(key);
      clearTimeout(t.current);
      t.current = setTimeout(() => setOpen(null), 3000);
    },
  ];
}

const SRC_NONE = { cape: "vermiyor", cin: "verisi yok", lifted_index: "verisi yok" };

function InstRow({ m, i, k, term, name, unit, label, dec, offText, exp, onExp, onTerm }) {
  const src = sourceOf(m, k);
  let v = val(m, k, i);
  if (k === "cin" && v != null) v = Math.abs(v);
  const calc = src === "calc";
  const lab = v == null ? null : label(v);
  return (
    <>
      <span
        className="lbl term-link"
        role="button"
        tabIndex={0}
        onClick={() => onTerm(term)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTerm(term);
          }
        }}
      >
        {name}
        {calc && <small className="calc">hesaplanan</small>}
      </span>
      <span className="am">
        {v == null || offText || src === "no" ? (
          "—"
        ) : (
          <>
            {fmtS(v, dec)}
            {unit && <small> {unit}</small>}
          </>
        )}
      </span>
      <span className="bd">
        {src === "no" ? (
          <span className="badge b-none">{k === "cape" ? `${m.label} ${SRC_NONE.cape}` : SRC_NONE[k]}</span>
        ) : v == null ? (
          <span className="badge b-none">veri yok</span>
        ) : offText ? (
          <span className="badge b-none">{offText}</span>
        ) : (
          <button type="button" className={"badge " + lab[1]} aria-label={`${lab[0]}, beklenen etkiyi göster`} onClick={() => onExp(k)}>
            {lab[0]}
          </button>
        )}
      </span>
      {exp === k && lab && (
        <div className="binfo">
          <b>Beklenen:</b> {lab[2]}
        </div>
      )}
    </>
  );
}

export default function Single({ m, times, days, idx, nowIdx, place, unit, onUnit, onIdx, onTerm }) {
  const i = Math.min(idx, Math.max(0, m.hz - 1));
  const t = times[i];
  const d = dayIndexOf(days, i);
  const day = days[d];
  const lastDay = dayIndexOf(days, Math.max(0, m.hz - 1));
  const view = condView(condAt(m, i), parseT(t).h);
  const tv = val(m, "temp", i);
  const [exp, onExp] = useExpect();

  const goDay = (dd) => {
    const nd = d + dd;
    if (nd < 0 || nd > lastDay) return;
    const h = i - day.h0;
    onIdx(Math.min(m.hz - 1, days[nd].h0 + Math.min(h, days[nd].h1 - days[nd].h0 - 1)));
  };
  const swipe = useDaySwipe(goDay);

  const hours = [];
  for (let j = day.h0; j < day.h1 && j < m.hz; j++) {
    hours.push({ i: j, h: parseT(times[j]).h, temp: val(m, "temp", j), view: condView(condAt(m, j), parseT(times[j]).h) });
  }
  const rd = dayTotal(m, day);
  const cape = val(m, "cape", i);

  return (
    <>
      <div className="hero" style={{ background: SKY[view.sky] }} {...swipe}>
        <div className="hnav">
          <button type="button" aria-label="Önceki gün" disabled={d <= 0} onClick={() => goDay(-1)}>
            ‹
          </button>
          <div className="mid">
            <div className="pl">{place}</div>
            <div className="when">{whenText(t)}</div>
          </div>
          <button type="button" aria-label="Sonraki gün" disabled={d >= lastDay} onClick={() => goDay(1)}>
            ›
          </button>
        </div>
        <div className="cond">
          <WxIcon name={view.icon} className="ic" />
          <span>{view.text}</span>
        </div>
        <div style={{ height: 11 }} aria-hidden="true" />
        <div className="temp">
          <span className="num">{tv == null ? "--" : Math.round(tv)}</span>
          <span className="deg">°C</span>
        </div>
        <div className="sub">
          Min <span className="mn">{fmt(dayMin(m, day))}°</span> · Maks <span className="mx">{fmt(dayMax(m, day))}°</span>
        </div>
        <div className="sub hs">
          Hissedilen<span className="lbv">{fmt(val(m, "feels_like", i), 1)} °C</span>
        </div>
        <Gauges m={m} i={i} unit={unit} onUnit={onUnit} />
      </div>
      <HourStrip hours={hours} idx={i} nowIdx={nowIdx} onPick={onIdx} stripKey={`single|${m.id}|${d}`} />
      <div className="wrap">
        <div className="sec">
          <span>Yağış</span>
          <span>MGM şiddet sınıfı</span>
        </div>
        <div className="card">
          <div className="row">
            <span className="lbl">Günlük toplam yağış</span>
            {rd == null ? (
              <span className="big">—</span>
            ) : rd < 0.05 ? (
              <span className="yy">yağış yok</span>
            ) : (
              <span className="big">
                {fmt(rd, 1)} <small>mm</small>
              </span>
            )}
          </div>
          <div className="psep" />
          <PrecipGrid m={m} i={i} day={day} times={times} />
        </div>
        <div className="sec">
          <span>Kararsızlık</span>
          <span>dokun: ad / etiket</span>
        </div>
        <div className="card">
          <div className="igrid">
            <InstRow m={m} i={i} k="cape" term="cape" name="CAPE" unit="J/kg" label={capeL} dec={0} exp={exp} onExp={onExp} onTerm={onTerm} />
            <InstRow
              m={m}
              i={i}
              k="cin"
              term="cin"
              name="CIN"
              unit="J/kg"
              label={cinL}
              dec={0}
              offText={cape != null && !(cape > 0) ? "CAPE yok" : ""}
              exp={exp}
              onExp={onExp}
              onTerm={onTerm}
            />
            <InstRow m={m} i={i} k="lifted_index" term="li" name="Lifted Index" unit="" label={liL} dec={1} exp={exp} onExp={onExp} onTerm={onTerm} />
          </div>
        </div>
        <div className="foot">
          İkinci bir model seçince karşılaştırmalı görünüm açılır.
          <br />
          Değerler tahmindir, ölçüm değildir.
          <br />
          Veri: Open-Meteo (CC BY 4.0)
        </div>
      </div>
    </>
  );
}
