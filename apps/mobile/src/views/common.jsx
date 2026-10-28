// Ortak parçalar: model çipleri, saat şeridi, gün okları, rüzgar birimi, sayfa bağlantıları, uyum işareti.

import { useLayoutEffect, useRef } from "react";
import { HourIcon } from "../icons";
import { pad, parseT } from "../format";

export function ModelChips({ all, selected, onToggle }) {
  return (
    <div className="models" role="group" aria-label="Modeller">
      {all.map((m) => {
        const on = selected.includes(m.id);
        return (
          <button key={m.id} type="button" className="mchip" role="checkbox" aria-checked={on} style={{ "--c": m.color }} onClick={() => onToggle(m.id)}>
            <span className="box">
              {on && (
                <svg viewBox="0 0 12 12" width="10" height="10">
                  <path d="M2.4 6.4 L5 9 L9.6 3.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

// V09 P1–P3: şeride dokununca ortalanmaz, kaydırma yeri korunur; yeni gün / ekran açılınca seçili saat ortalanır,
// seçili saat görünmüyorsa yalnız görünecek kadar kayar.
export function HourStrip({ hours, idx, nowIdx, onPick, stripKey }) {
  const ref = useRef(null);
  const last = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const act = el.querySelector('[aria-pressed="true"]');
    el.style.scrollBehavior = "auto";
    if (last.current !== stripKey && act) el.scrollLeft = act.offsetLeft - el.clientWidth / 2 + act.clientWidth / 2;
    if (act) {
      const a = act.offsetLeft;
      const b = a + act.offsetWidth;
      if (a < el.scrollLeft) el.scrollLeft = a - 4;
      else if (b > el.scrollLeft + el.clientWidth) el.scrollLeft = b - el.clientWidth + 4;
    }
    el.style.scrollBehavior = "";
    last.current = stripKey;
  });
  return (
    <div className="hours" ref={ref}>
      {hours.map((h) => (
        <button
          key={h.i}
          type="button"
          className={"hchip" + (h.i === nowIdx ? " now" : "")}
          aria-pressed={h.i === idx}
          aria-label={`${pad(h.h)}:00 ${h.view.text}`}
          onClick={() => onPick(h.i)}
        >
          {pad(h.h)}
          <HourIcon view={h.view} />
          <b>{h.temp == null ? "—" : Math.round(h.temp) + "°"}</b>
        </button>
      ))}
    </div>
  );
}

// Gün okları + yatay kaydırma (hero üzerinde parmakla sağa / sola)
export function useDaySwipe(goDay) {
  const x0 = useRef(null);
  return {
    onTouchStart: (e) => {
      x0.current = e.touches[0].clientX;
    },
    onTouchEnd: (e) => {
      if (x0.current == null) return;
      const dx = e.changedTouches[0].clientX - x0.current;
      if (Math.abs(dx) > 50) goDay(dx < 0 ? 1 : -1);
      x0.current = null;
    },
  };
}

export function UnitToggle({ unit, onUnit, ghost }) {
  return (
    <span className={"unit" + (ghost ? " ghost" : "")} role="group" aria-label="Rüzgar birimi">
      {[
        ["kmh", "km/s"],
        ["kt", "kt"],
      ].map(([u, t]) => (
        <button
          key={u}
          type="button"
          aria-pressed={unit === u}
          onClick={(e) => {
            e.stopPropagation();
            onUnit(u);
          }}
        >
          {t}
        </button>
      ))}
    </span>
  );
}

// Alt sekme çubuğu (28 Ekim, Ali Kemal: "B", görünüm "B3"): Günlük · Saatlik · Modeller · Grafikler; ekranın altına
// sabit, açık zemin; bulunulan sekmenin üstünde lacivert çizgi.
const TAB_ICON = {
  day: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  ),
  p1: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  p2: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="3.5" y="5" width="7" height="14" rx="2" />
      <rect x="13.5" y="5" width="7" height="14" rx="2" />
    </svg>
  ),
  p3: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v16h16" />
      <path d="M7 15l4-5 3 3 5-6" />
    </svg>
  ),
};
const TAB_TEXT = { day: "Günlük", p1: "Saatlik", p2: "Modeller", p3: "Grafikler" };
export function TabBar({ current, onGo, off = [] }) {
  return (
    <nav className="tabbar" aria-label="Sayfalar">
      {["day", "p1", "p2", "p3"].map((p) => (
        <button
          key={p}
          type="button"
          className={"tab" + (off.includes(p) ? " off" : "")}
          aria-current={p === current ? "page" : undefined}
          onClick={() => p !== current && onGo(p)}
        >
          {TAB_ICON[p]}
          <span>{TAB_TEXT[p]}</span>
        </button>
      ))}
    </nav>
  );
}

export const hourOf = (t) => parseT(t).h;
