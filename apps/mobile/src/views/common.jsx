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

const LINK_ICON = {
  p1: (
    <svg viewBox="0 0 24 24" fill="none" stroke="#2C5E8C" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  ),
  p2: (
    <svg viewBox="0 0 24 24" fill="none" stroke="#2C5E8C" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3" y="5" width="7.5" height="14" rx="2" />
      <rect x="13.5" y="5" width="7.5" height="14" rx="2" />
    </svg>
  ),
  p3: (
    <svg viewBox="0 0 24 24" fill="none" stroke="#2C5E8C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18l5-6 4 3 5-8 4 5" />
      <path d="M3 21h18" />
    </svg>
  ),
};
const LINK_TEXT = {
  p1: ["Model verilerini saatlik gör", "Karşılaştırmalı · ortanca ve uyum"],
  p2: ["Model verilerini ayrı ayrı gör", "Günlük · her model kendi kartında"],
  p3: ["Model verilerini grafiksel gör", "Saatlik / 3 / 7 / 16 gün · tüm parametreler"],
};

// Sayfalar arası bağlantı kartları (Sayfa 1 · 2 · 3)
export function PageLinks({ pages, onGo }) {
  return (
    <div className="links">
      {pages.map((p) => (
        <button key={p} type="button" className="link" onClick={() => onGo(p)}>
          <span className="li">{LINK_ICON[p]}</span>
          <span>
            <b>{LINK_TEXT[p][0]}</b>
            <small>{LINK_TEXT[p][1]}</small>
          </span>
          <span className="ch">
            <svg viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 2.5 L9.5 7 L5 11.5" />
            </svg>
          </span>
        </button>
      ))}
    </div>
  );
}

export const hourOf = (t) => parseT(t).h;
