import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import LineChartPanel, { LINE_CHARTS, defaultStepFor, numOrNull } from "../components/LineChartPanel";
import PrecipPanel from "../components/PrecipPanel";
import MatrixPanel, { MATRICES } from "../components/MatrixPanel";
import ModelDetails from "../components/ModelDetails";
import { isFavorite, toggleFavorite } from "../lib/favorites";
import { CITY_CHIPS, cityHref, slugify } from "../lib/slugify";
import { MODELS } from "../lib/forecast";

const PERIODS = [
  { id: "hourly", label: "Saatlik" },
  { id: "3d", label: "3 gün" },
  { id: "7d", label: "7 gün" },
  { id: "16d", label: "16 gün" },
];

export default function SehirPage() {
  const router = useRouter();
  const [location, setLocation] = useState(null);
  const [period, setPeriod] = useState("3d");
  const [forecast, setForecast] = useState(null);
  const [status, setStatus] = useState("loading");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [fav, setFav] = useState(false);
  // Ortak seçili zaman (Paket 4): i = dilimin ilk saati, step = aralık (1/3/6 saat), reveal = tablodan
  // gezinince artar → grafikler seçili dilimi görünür yapacak kadar kayar.
  const [selection, setSelection] = useState({ i: 0, step: defaultStepFor("3d"), reveal: 0 });
  const [activeModels, setActiveModels] = useState(
    () => new Set(MODELS.filter((m) => m.defaultActive).map((m) => m.id))
  );
  const searchTimer = useRef(null);
  const activeModelsKey = Array.from(activeModels).sort().join(",");

  useEffect(() => {
    if (!router.isReady) return;
    const { sehir, lat, lon, name } = router.query;
    if (lat && lon) {
      setLocation({
        name: typeof name === "string" ? name : String(sehir || ""),
        lat: parseFloat(lat),
        lon: parseFloat(lon),
      });
      return;
    }
    if (!sehir) return;
    let cancelled = false;
    fetch(`/api/locations?q=${encodeURIComponent(sehir)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const hit = data.results?.[0];
        if (hit) setLocation({ name: hit.name, lat: hit.lat, lon: hit.lon });
        else setStatus("error");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.sehir, router.query.lat, router.query.lon, router.query.name]);

  useEffect(() => {
    if (!location) return;
    setFav(isFavorite(location.name));
    let cancelled = false;
    setStatus("loading");
    const url = `/api/forecast?lat=${location.lat}&lon=${location.lon}&period=${period}&name=${encodeURIComponent(location.name)}&models=${encodeURIComponent(activeModelsKey)}`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("hata");
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setForecast(data);
        setStatus("ok");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [location, period, activeModelsKey]);

  // Şehir veya periyot değişince seçili zaman "şimdi"ye konumlanır; periyot değişince aralık varsayılana döner
  // (Saatlik 1s, 3 gün 3s, 7/16 gün 6s). Model aç/kapa gibi yeniden yüklemelerde seçilen zaman korunur.
  // Veri 00:00 TSİ'den başlar; ← ile geriye gidilebilir.
  const jumpToNowRef = useRef(true);
  useEffect(() => {
    jumpToNowRef.current = true;
  }, [period, location]);
  useEffect(() => {
    setSelection((s) => ({ ...s, step: defaultStepFor(period) }));
  }, [period]);

  useEffect(() => {
    if (!forecast) return;
    const series = forecast.models[0]?.series || [];
    const max = Math.max(0, series.length - 1);
    const jump = jumpToNowRef.current;
    jumpToNowRef.current = false;
    const now = findNowIndex(series);
    setSelection((s) => {
      if (jump) return { ...s, i: now < 0 ? 0 : now - (now % s.step) };
      return { ...s, i: Math.min(Math.max(0, s.i), max) };
    });
  }, [forecast]);

  function onSearchChange(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/locations?q=${encodeURIComponent(q.trim())}`);
        const data = await r.json();
        setResults(data.results || []);
      } catch {
        setResults("error");
      }
    }, 350);
  }

  function goToLocation(loc) {
    setQuery("");
    setResults(null);
    router.push(cityHref(loc));
  }

  function onToggleFav() {
    if (!location) return;
    toggleFavorite(location);
    setFav(isFavorite(location.name));
  }

  const seriesLen = forecast?.models[0]?.series.length || 0;
  const nowIndex = status === "ok" && forecast ? findNowIndex(forecast.models[0]?.series || []) : -1;

  // Grafiğe / matrise tıklama: tablo o dilime ve o grafiğin aralığına gider
  function selectAt(i, step) {
    setSelection((s) => ({ ...s, i: i - (i % step), step }));
  }

  function setTableStep(step) {
    setSelection((s) => ({ i: s.i - (s.i % step), step, reveal: s.reveal + 1 }));
  }

  function goToPrevTime() {
    setSelection((s) => ({ ...s, i: Math.max(0, s.i - s.step), reveal: s.reveal + 1 }));
  }

  function goToNextTime() {
    setSelection((s) => ({ ...s, i: Math.min(Math.max(0, seriesLen - 1), s.i + s.step), reveal: s.reveal + 1 }));
  }

  function goToNow() {
    if (nowIndex < 0) return;
    setSelection((s) => ({ ...s, i: nowIndex - (nowIndex % s.step), reveal: s.reveal + 1 }));
  }

  const panelProps = { models: forecast?.models, period, status, selection, onSelect: selectAt };
  // Kar panelleri (30 Ekim): ayrı koşullarla (kar3) — Taze kar yalnız aralıkta yeni kar varsa, Toplam kar kalınlığı
  // yalnız yerde kar varsa (seçili modellerden biri ≥ 0.05 cm)
  const anySnow = (key) => (forecast?.models || []).some((m) => m.series.some((x) => (numOrNull(x[key]) ?? 0) >= 0.05));
  const hasSnowfall = anySnow("snowfall");
  const hasSnowDepth = anySnow("snow_depth");

  function resetModels() {
    setActiveModels(new Set(MODELS.filter((m) => m.defaultActive).map((m) => m.id)));
  }

  function toggleModel(id) {
    setActiveModels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const title = location
    ? `${location.name} — model karşılaştırması · havameridyen`
    : "Model karşılaştırması · havameridyen";

  return (
    <Layout title={title} variant="city">
      <div className="search-row">
        <input
          className="search-input"
          placeholder="Şehir veya ilçe ara (örn. Bodrum)…"
          autoComplete="off"
          value={query}
          onChange={onSearchChange}
        />
        {results === "error" && (
          <div className="search-results">
            <div>Arama başarısız</div>
          </div>
        )}
        {Array.isArray(results) && results.length === 0 && (
          <div className="search-results">
            <div>Sonuç yok</div>
          </div>
        )}
        {Array.isArray(results) && results.length > 0 && (
          <div className="search-results">
            {results.map((r, i) => (
              <div key={`${r.name}-${r.lat}-${i}`} onClick={() => goToLocation(r)}>
                {r.name}
                {r.admin1 ? `, ${r.admin1}` : ""} — {r.country}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="location-row">
        <div className="loc-tag">
          📍 <span>{location ? location.name : slugify(String(router.query.sehir || ""))}</span>
          <button
            className={"fav-btn" + (fav ? " active" : "")}
            type="button"
            aria-label="Favorilere ekle"
            title="Favorilere ekle"
            onClick={onToggleFav}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        </div>
        {/* Bulunulan şehir 📍 etiketinde zaten yazdığı için hızlı seçim çiplerinde tekrar gösterilmez. */}
        {CITY_CHIPS.filter((c) => !(location && c.name === location.name)).map((c) => (
          <button
            key={c.name}
            type="button"
            className="chip"
            onClick={() => goToLocation(c)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="period-row">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={"period-tab" + (p.id === period ? " active" : "")}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="charts-block">
        <ModelPicker
          activeModels={activeModels}
          onToggle={toggleModel}
          onReset={resetModels}
        />
        <div className="charts-stack">
          {/* Paket 4: Hava durumu matrisi en üstte; tüm panellerde ortak seçili zaman */}
          <MatrixPanel cfg={MATRICES.wx} {...panelProps} />

          <LineChartPanel cfg={LINE_CHARTS.temp} {...panelProps} />

          <PrecipPanel {...panelProps} />

          {hasSnowfall && <PrecipPanel kind="snow" {...panelProps} />}

          {hasSnowDepth && <LineChartPanel cfg={LINE_CHARTS.snowDepth} {...panelProps} />}

          <MatrixPanel cfg={MATRICES.cloud} {...panelProps} />

          <MatrixPanel cfg={MATRICES.wind} {...panelProps} />

          <LineChartPanel cfg={LINE_CHARTS.humidity} {...panelProps} />

          <LineChartPanel cfg={LINE_CHARTS.cape} {...panelProps} />

          <LineChartPanel cfg={LINE_CHARTS.pressure} {...panelProps} />
        </div>
      </div>

      <ModelDetails
        models={forecast?.models}
        status={status}
        selection={selection}
        nowIndex={nowIndex}
        onStep={setTableStep}
        onPrev={goToPrevTime}
        onNext={goToNextTime}
        onNow={goToNow}
      />

      <Link href="/modeller" className="explain-link">
        <div>
          <div className="el-title">Bu modeller ne anlama geliyor?</div>
          <div className="el-sub">ECMWF, GFS, ICON, UKMO, ARPEGE ve diğer modeller arasındaki farkları öğren</div>
        </div>
        <div className="el-arrow">→</div>
      </Link>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Model seçimi: işaret kutulu düğmeler. Renkler modelin kendi rengi; açık = dolu kutu + ✓,
// kapalı = boş kutu (çerçeve model renginde). En az bir model açık kalır.
// ---------------------------------------------------------------------------

function ModelCheck({ color, checked }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 14,
        height: 14,
        borderRadius: 3,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        border: `1.5px solid ${color}`,
        background: checked ? color : "transparent",
      }}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2 L5 8.6 L9.5 3.6" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function ModelChip({ m, checked, onToggle, optional }) {
  const lastActive = checked === "last";
  const isOn = !!checked;
  const title = lastActive
    ? "En az bir model açık kalmalı"
    : `${m.label} modelini ${isOn ? "gizle" : "göster"}`;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isOn}
      title={title}
      onClick={() => onToggle(m.id)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 10px 5px 8px",
        borderRadius: 999,
        border: `1px solid ${isOn ? "var(--ink-faint)" : "var(--line)"}`,
        background: isOn ? "var(--paper)" : "transparent",
        color: isOn ? "var(--ink)" : "var(--ink-faint)",
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 12,
        cursor: lastActive ? "default" : "pointer",
        lineHeight: 1.2,
      }}
    >
      <ModelCheck color={m.color} checked={isOn} />
      {optional && !isOn ? `+ ${m.label}` : m.label}
    </button>
  );
}

function ModelPicker({ activeModels, onToggle, onReset }) {
  const defaults = MODELS.filter((m) => m.defaultActive);
  const optionals = MODELS.filter((m) => !m.defaultActive);
  const isDefault =
    activeModels.size === defaults.length && defaults.every((m) => activeModels.has(m.id));
  const state = (id) => (activeModels.has(id) ? (activeModels.size === 1 ? "last" : true) : false);
  return (
    <div className="shared-legend-top" style={{ gap: 8, alignItems: "center" }}>
      <div style={{ width: "100%", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>Modeller</span>
        <span className="panel-sub" style={{ fontSize: 11 }}>
          göstermek / gizlemek için dokun
        </span>
        {!isDefault && (
          <button
            type="button"
            onClick={onReset}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--teal)",
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11,
              textDecoration: "underline",
            }}
          >
            Varsayılana dön
          </button>
        )}
      </div>
      {defaults.map((m) => (
        <ModelChip key={m.id} m={m} checked={state(m.id)} onToggle={onToggle} />
      ))}
      <span className="legend-divider" aria-hidden="true" />
      {optionals.map((m) => (
        <ModelChip key={m.id} m={m} checked={state(m.id)} onToggle={onToggle} optional />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ortak yardımcı: TSİ "şimdi"
// ---------------------------------------------------------------------------

// TSİ sabit UTC+3 (Türkiye 2016'dan beri yaz/kış saati uygulamıyor).
function tsiNowKey() {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
}

function findNowIndex(series) {
  const key = tsiNowKey();
  return (series || []).findIndex((s) => typeof s.time === "string" && s.time.startsWith(key));
}

// Grafikler, matrisler ve tablo:
// - Sıcaklık, Nem, CAPE, Basınç: components/LineChartPanel.js
// - Toplam yağış: components/PrecipPanel.js
// - Taze kar (PrecipPanel kind="snow") ve Toplam kar kalınlığı (LINE_CHARTS.snowDepth): yalnız kar varken
// - Hava durumu, Bulutluluk ve Rüzgar (model × zaman matrisleri): components/MatrixPanel.js
// - Hava durumu ifadesi ve ikonları: components/WeatherCond.js
// - Model detayları: components/ModelDetails.js
