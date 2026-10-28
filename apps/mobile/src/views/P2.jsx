// Sayfa 2 — modeller ayrı ayrı (Prototip 9): gün sekmeleri, saat şeridi (ortak durum + ortanca sıcaklık) ve her
// model için yana kaydırılan bir kart. Kartta seçili saatin durumu ve sıcaklığı, günün min / maks, ortalama nem,
// hakim rüzgar yönü, ortalama rüzgar, en yüksek hamle ve yağış / kar ızgarası. Durum ifadesi web ile aynı kural
// (lib/agreement.js condAt).

import { useLayoutEffect, useRef, useState } from "react";
import { condAt } from "@lib/agreement";
import { SKY, WxIcon, condView } from "../icons";
import { DAYN, MON, fmt, pad, parseT, speed, unitLabel } from "../format";
import { avg, dayGust, dayIndexOf, dayMax, dayMin, dayVals, hakim, hasDay, val } from "../data";
import { HourStrip, UnitToggle } from "./common";
import { PrecipGrid } from "./precip";

function MiniRose({ deg, color }) {
  const p = (a) => `${(12 + 10 * Math.sin((a * Math.PI) / 180)).toFixed(1)},${(12 - 10 * Math.cos((a * Math.PI) / 180)).toFixed(1)}`;
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" style={{ verticalAlign: -5, marginRight: 4 }} aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="#C9D0C6" />
      {deg != null && <path d={`M12,12 L${p(deg - 22.5)} A10,10 0 0 1 ${p(deg + 22.5)} Z`} fill={color} fillOpacity=".7" />}
    </svg>
  );
}

// V04 P3: sekme şeridi her çizimde baştan kaymaz; seçili gün görünmüyorsa görünecek kadar kayar
function DayTabs({ days, d, today, lastDay, onDay }) {
  const ref = useRef(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    const act = el && el.querySelector('[aria-selected="true"]');
    if (!el || !act) return;
    el.style.scrollBehavior = "auto";
    if (first.current) el.scrollLeft = act.offsetLeft - 60;
    const a = act.offsetLeft;
    const b = a + act.offsetWidth;
    if (a < el.scrollLeft) el.scrollLeft = a - 4;
    else if (b > el.scrollLeft + el.clientWidth) el.scrollLeft = b - el.clientWidth + 4;
    el.style.scrollBehavior = "";
    first.current = false;
  });
  return (
    <div className="days">
      <button type="button" className="arr" aria-label="Önceki gün" disabled={d <= 0} onClick={() => onDay(d - 1)}>
        ‹
      </button>
      <div className="dtabs" role="tablist" ref={ref}>
        {days.slice(0, lastDay + 1).map((day, k) => {
          const q = parseT(day.key + "T00");
          return (
            <button key={day.key} type="button" className="dtab" role="tab" aria-selected={k === d} onClick={() => onDay(k)}>
              {k === today ? "Bugün" : DAYN[q.w]}
              <small>
                {q.d} {MON[q.m]}
              </small>
            </button>
          );
        })}
      </div>
      <button type="button" className="arr" aria-label="Sonraki gün" disabled={d >= lastDay} onClick={() => onDay(d + 1)}>
        ›
      </button>
    </div>
  );
}

function Card({ m, day, i, times, unit, vrbOpen, onVrb }) {
  if (!hasDay(m, day))
    return (
      <div className="mcard nodata">
        <div className="mh">
          <span className="sw" style={{ background: m.color }} />
          {m.label}
          <small>menzil {fmt(m.hz / 24, 1)} gün</small>
        </div>
        <div className="lbl">Bu gün için veri yok.</div>
      </div>
    );
  const q = parseT(times[i]);
  const view = condView(condAt(m, i), q.h);
  const hk = hakim(m, day);
  const dg = dayGust(m, day);
  const ws = dayVals(m, "wind_speed", day);
  const hs = dayVals(m, "humidity", day);
  const u = unitLabel(unit);
  return (
    <div className="mcard">
      <div className="mh">
        <span className="sw" style={{ background: m.color }} />
        {m.label}
        <small>
          {q.d} {MON[q.m].slice(0, 3)}
        </small>
      </div>
      <div className="cd">
        <WxIcon name={view.icon} className="tile" style={{ background: SKY[view.sky] }} />
        <span>{view.text}</span>
      </div>
      <div className="btr">
        <span className="bt">
          {fmt(val(m, "temp", i))} <small>°C</small>
        </span>
        <span className="tm">
          {pad(q.h)}:00 <span className="tsi">TSİ</span>
        </span>
      </div>
      {/* 20 Ekim: her satır kendi genişliğini kullanır (etiket solda, değer sağda); ortak değer sütunu en uzun değere
          ("45 km/s · 16:00 TSİ") göre daralıp "Hakim rüzgar yönü" gibi kısa değerli satırları da alt satıra itiyordu */}
      <dl className="kv2">
        <div className="r">
          <dt>Min</dt>
          <dd className="tmin">{fmt(dayMin(m, day))} °C</dd>
        </div>
        <div className="r">
          <dt>Maks</dt>
          <dd className="tmax">{fmt(dayMax(m, day))} °C</dd>
        </div>
        <div className="r">
          <dt>Ort. nem</dt>
          <dd>{fmt(avg(hs))} %</dd>
        </div>
        <div className="r">
          <dt>Hakim rüzgar yönü</dt>
          <dd>
            <MiniRose deg={hk.deg} color={m.color} />
            {hk.vrb ? (
              <>
                <button type="button" className="vrb" aria-expanded={vrbOpen} onClick={onVrb}>
                  VRB
                </button>
                {vrbOpen && <span className="lbl"> değişken yön</span>}
              </>
            ) : (
              hk.txt
            )}
          </dd>
        </div>
        <div className="r">
          <dt>Ort. rüzgar hızı</dt>
          <dd>
            {fmt(speed(avg(ws), unit), 1)} {u}
          </dd>
        </div>
        <div className="r">
          <dt>Maks. hamle</dt>
          <dd>
            {dg.g == null ? (
              "—"
            ) : (
              <>
                {fmt(speed(dg.g, unit))} {u} <span className="at">
                  · {pad(parseT(times[dg.i]).h)}:00 <span className="tsi">TSİ</span>
                </span>
              </>
            )}
          </dd>
        </div>
      </dl>
      <div className="psep" style={{ margin: "2px 0 1px" }} />
      <PrecipGrid m={m} i={i} day={day} times={times} withDay compact />
    </div>
  );
}

export default function P2({ models, cons, times, days, idx, nowIdx, unit, onUnit, onIdx, onGo }) {
  const hz = Math.max(...models.map((m) => m.hz));
  const lastDay = dayIndexOf(days, Math.max(0, hz - 1));
  const i = Math.min(idx, Math.max(0, hz - 1));
  const d = Math.min(dayIndexOf(days, i), lastDay);
  const day = days[d];
  const today = dayIndexOf(days, nowIdx);
  const [vrbOpen, setVrbOpen] = useState(null);

  // Gün değişince saat aynı kalır (ör. Salı 14:00 → Çarşamba 14:00); kartların yatay kaydırma yeri korunur
  const goDay = (nd) => {
    if (nd < 0 || nd > lastDay) return;
    const h = i - day.h0;
    onIdx(Math.min(hz - 1, days[nd].h0 + Math.min(h, days[nd].h1 - days[nd].h0 - 1)));
  };

  const hours = [];
  for (let j = day.h0; j < day.h1 && j < hz; j++) {
    const h = parseT(times[j]).h;
    hours.push({ i: j, h, temp: cons.hourly[j].temp.v, view: condView(cons.hourly[j].cond, h) });
  }

  return (
    <>
      <DayTabs days={days} d={d} today={today} lastDay={lastDay} onDay={goDay} />
      <HourStrip hours={hours} idx={i} nowIdx={nowIdx} onPick={onIdx} stripKey={`p2|${d}`} />
      <div className="sec" style={{ margin: "6px 14px 2px" }}>
        <span>
          Modeller · <span className="cnt2">{models.length} model</span>
        </span>
        <span>
          <UnitToggle unit={unit} onUnit={onUnit} />
        </span>
      </div>
      <div className="mcards">
        {models.map((m) => (
          <Card
            key={m.id}
            m={m}
            day={day}
            i={i}
            times={times}
            unit={unit}
            vrbOpen={vrbOpen === m.id}
            onVrb={() => setVrbOpen(vrbOpen === m.id ? null : m.id)}
          />
        ))}
      </div>
      <div className="foot">
        Değerler model tahminidir, ölçüm değildir.
        <br />
        Veri: Open-Meteo (CC BY 4.0)
      </div>
    </>
  );
}
