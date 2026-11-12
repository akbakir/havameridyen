// Grafik aç / kapa (12 Kas 2026, Ali Kemal: "web'teki grafiklere de mobildeki gibi göz şeklinde kapatma/açma"):
// panel başlığına (göz + ad) tıklayınca grafik kapanır; kapalı panelin yalnız başlığı kalır. Seçim bu tarayıcıda
// saklanır (localStorage "hm_charts_off"); depolama kapalıysa oturumla sınırlı.

import { useCallback, useEffect, useState } from "react";

const KEY = "hm_charts_off";

export function useChartsOff() {
  const [off, setOff] = useState(() => new Set());
  useEffect(() => {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (Array.isArray(a)) setOff(new Set(a.filter((x) => typeof x === "string")));
    } catch {
      /* depolama kapalı */
    }
  }, []);
  const toggle = useCallback((id) => {
    setOff((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        localStorage.setItem(KEY, JSON.stringify([...n]));
      } catch {
        /* depolama kapalı */
      }
      return n;
    });
  }, []);
  return [off, toggle];
}

export function Eye({ off }) {
  return (
    <svg className="eye" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.6" />
      {off && <path d="M4 20L20 4" />}
    </svg>
  );
}

// Panel başlığı: göz + ad; onToggle yoksa (kapatma desteklenmeyen yerde) düz başlık
export function PanelTitle({ title, off = false, onToggle }) {
  if (!onToggle) return <div className="panel-title">{title}</div>;
  return (
    <button
      type="button"
      className={"panel-title panel-eye" + (off ? " is-off" : "")}
      aria-expanded={!off}
      title={off ? "Grafiği aç" : "Grafiği kapat"}
      onClick={onToggle}
    >
      <Eye off={off} />
      {title}
    </button>
  );
}

// Kapalı panel: yalnız başlık satırı
export function ClosedPanel({ title, onToggle }) {
  return (
    <div className="panel panel-closed">
      <div className="panel-head">
        <div className="panel-head-left">
          <PanelTitle title={title} off onToggle={onToggle} />
          <div className="panel-sub">kapalı · açmak için başlığa tıkla</div>
        </div>
      </div>
    </div>
  );
}
