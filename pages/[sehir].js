import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import LineChartPanel, { LINE_CHARTS } from "../components/LineChartPanel";
import PrecipPanel from "../components/PrecipPanel";
import MatrixPanel, { MATRICES } from "../components/MatrixPanel";
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
  const [tableTimeIndex, setTableTimeIndex] = useState(0);
  const [tableInterval, setTableInterval] = useState(1);
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

  // Şehir veya periyot değişince tablo "şimdi"ye konumlanır. Model aç/kapa gibi yeniden
  // yüklemelerde kullanıcının seçtiği saat korunur. Veri yine 00:00 TSİ'den başlar; ← ile geriye gidilebilir.
  const jumpToNowRef = useRef(true);
  useEffect(() => {
    jumpToNowRef.current = true;
  }, [period, location]);

  useEffect(() => {
    if (!forecast) return;
    const series = forecast.models[0]?.series || [];
    const max = Math.max(0, series.length - 1);
    if (jumpToNowRef.current) {
      jumpToNowRef.current = false;
      setTableTimeIndex(nowTargetIndex(series, tableInterval));
      return;
    }
    setTableTimeIndex((i) => Math.min(Math.max(0, i), max));
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

  const tableSeriesLen = forecast?.models[0]?.series.length || 0;
  const maxTableIndex = Math.max(0, tableSeriesLen - 1);
  const safeTableIndex = Math.min(Math.max(0, tableTimeIndex), maxTableIndex);
  const formattedTableTime = formatTableTime(forecast, safeTableIndex);
  const nowTarget = forecast ? nowTargetIndex(forecast.models[0]?.series || [], tableInterval) : -1;
  const nowAvailable = forecast ? findNowIndex(forecast.models[0]?.series || []) >= 0 : false;
  const noProbLabels = forecast ? forecast.models.filter((m) => !modelHasPrecipProb(m)).map((m) => m.label) : [];

  function goToNow() {
    if (!forecast) return;
    setTableTimeIndex(nowTargetIndex(forecast.models[0]?.series || [], tableInterval));
  }

  function goToPrevTime() {
    setTableTimeIndex((i) => Math.max(0, i - tableInterval));
  }

  function goToNextTime() {
    setTableTimeIndex((i) => Math.min(maxTableIndex, i + tableInterval));
  }

  function changeTableInterval(hrs) {
    setTableInterval(hrs);
    // Pencereler hizalı kalsın diye mevcut indeksi yeni aralığın katına yuvarla.
    setTableTimeIndex((i) => Math.floor(i / hrs) * hrs);
  }

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
          <LineChartPanel cfg={LINE_CHARTS.temp} models={forecast?.models} period={period} status={status} />

          {/* Paket 3: Toplam yağış, Bulutluluk ve Rüzgar da aynı düzende (Bulutluluk yağış ile rüzgar arasında) */}
          <PrecipPanel models={forecast?.models} period={period} status={status} />

          <MatrixPanel cfg={MATRICES.cloud} models={forecast?.models} period={period} status={status} />

          <MatrixPanel cfg={MATRICES.wind} models={forecast?.models} period={period} status={status} />

          <LineChartPanel cfg={LINE_CHARTS.humidity} models={forecast?.models} period={period} status={status} />

          <LineChartPanel cfg={LINE_CHARTS.cape} models={forecast?.models} period={period} status={status} />

          <LineChartPanel cfg={LINE_CHARTS.pressure} models={forecast?.models} period={period} status={status} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title-group">
            <div className="panel-title">Model detayları</div>
            <div className="panel-sub">
              {status === "ok" ? formattedTableTime : ""}
              {status === "ok" && nowAvailable && safeTableIndex === nowTarget && (
                <span style={NOW_BADGE_STYLE}>şimdi</span>
              )}
            </div>
          </div>
          <div className="table-controls">
            <div className="unit-toggle">
              {[1, 3, 6].map((hrs) => (
                <button
                  key={hrs}
                  type="button"
                  className={tableInterval === hrs ? "active" : ""}
                  onClick={() => changeTableInterval(hrs)}
                >
                  {hrs}s
                </button>
              ))}
            </div>
            <div className="time-nav">
              <button
                type="button"
                onClick={goToPrevTime}
                disabled={status !== "ok" || safeTableIndex <= 0}
                aria-label="Önceki"
              >
                ←
              </button>
              <button
                type="button"
                onClick={goToNow}
                disabled={status !== "ok" || !nowAvailable}
                aria-label="Şimdiki saate git"
                style={{ width: "auto", padding: "0 10px", fontSize: 12 }}
              >
                Şimdi
              </button>
              <button
                type="button"
                onClick={goToNextTime}
                disabled={status !== "ok" || safeTableIndex >= maxTableIndex}
                aria-label="Sonraki"
              >
                →
              </button>
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Sıcaklık</th>
              <th>Yağış olasılığı</th>
              <th>Yağış ({tableInterval}s toplam, mm)</th>
              <th>Rüzgar</th>
            </tr>
          </thead>
          <tbody>
            {status === "loading" && (
              <tr>
                <td colSpan={5} className="loading">
                  Veri yükleniyor…
                </td>
              </tr>
            )}
            {status === "error" && (
              <tr>
                <td colSpan={5} className="err">
                  Veri alınamadı
                </td>
              </tr>
            )}
            {status === "ok" &&
              forecast.models.map((m) => {
                const point = m.series[safeTableIndex];
                const precipSum = sumPrecipWindow(m.series, safeTableIndex, tableInterval);
                return (
                  <tr key={m.id}>
                    <td className="station">
                      <span className="dot" style={{ background: m.color }} />
                      {m.label}
                    </td>
                    <td>{point && point.temp != null ? formatOneDecimal(point.temp) + "°C" : "—"}</td>
                    <td>
                      {point && point.precip_prob != null ? (
                        "%" + point.precip_prob
                      ) : modelHasPrecipProb(m) ? (
                        "—"
                      ) : (
                        <span title={`${m.label} yağış olasılığı sunmuyor`}>—*</span>
                      )}
                    </td>
                    <td>{formatPrecipMm(precipSum)}</td>
                    <td>
                      <WindCell speed={point?.wind_speed} direction={point?.wind_direction} />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        {status === "ok" && noProbLabels.length > 0 && (
          <div className="panel-sub" style={{ marginTop: 8, fontSize: 11 }}>
            * {joinTr(noProbLabels)} yağış olasılığı sunmuyor.
          </div>
        )}
      </div>

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

const COMPASS_8 = ["K", "KD", "D", "GD", "G", "GB", "B", "KB"];

function degreesToCompass(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return null;
  const normalized = ((Number(deg) % 360) + 360) % 360;
  return COMPASS_8[Math.round(normalized / 45) % 8];
}

// Tablolarda sıcaklık ve rüzgar tek ondalıkla gösterilir (örn. 23.4°C, 12.6 km/s).
function formatOneDecimal(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(1);
}

function formatPrecipMm(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return Number(amount).toFixed(1);
}

function WindCell({ speed, direction }) {
  if (speed == null && direction == null) return "—";
  const compass = degreesToCompass(direction);
  const speedText = speed == null ? "—" : `${formatOneDecimal(speed)} km/s`;
  return (
    <span className="wind-cell">
      {direction != null && (
        <span
          className="wind-arrow"
          style={{ transform: `rotate(${direction}deg)` }}
          title={`${Math.round(direction)}°${compass ? ` ${compass}` : ""}`}
          aria-hidden="true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20 V6" />
            <path d="M6 12 l6-6 6 6" />
          </svg>
        </span>
      )}
      <span>
        {speedText}
        {compass ? ` ${compass}` : ""}
      </span>
    </span>
  );
}

// API'den gelen zamanlar TSİ duvar saatidir ("YYYY-MM-DDTHH:mm", ek/offset yok; bkz. lib/forecast.js).
// Tarayıcının kendi saat diliminden etkilenmemek için metin doğrudan ayrıştırılır; tarih/gün
// hesapları için UTC tabanlı bir Date üretilir ve yalnızca getUTC* / timeZone:"UTC" ile okunur.
function parseTsiTime(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(t || "");
  if (!m) return null;
  const hour = +m[4];
  return { hour, date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], hour, +m[5])) };
}

function formatHourLabel(hour) {
  return String(hour).padStart(2, "0") + ":00";
}

function formatTableTime(forecast, index) {
  const p = parseTsiTime(forecast?.models[0]?.series[index]?.time);
  if (!p) return "";
  const tarih = p.date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" });
  const gun = formatWeekdayAbbr3(p.date);
  return `${tarih} ${gun} ${formatHourLabel(p.hour)} TSİ`;
}

// Seçilen tablo aralığı (1/3/6 saat) için, endIndex dahil olmak üzere geriye doğru toplam yağış.
function sumPrecipWindow(series, endIndex, interval) {
  const start = Math.max(0, endIndex - interval + 1);
  let sum = 0;
  let any = false;
  for (let i = start; i <= endIndex; i++) {
    const v = series[i]?.precip_amount;
    if (v != null && !Number.isNaN(Number(v))) {
      sum += Number(v);
      any = true;
    }
  }
  return any ? sum : null;
}

// Sabit 3 harfli Türkçe gün kısaltmaları (Intl'in "short" biçimi bazı günlerde 3'ten uzun
// dönebiliyor, örn. "Çarş"). getUTCDay(): 0=Pazar, 1=Pazartesi, ... 6=Cumartesi.
// (Date, parseTsiTime ile UTC tabanlı üretildiği için getUTCDay kullanılır.)
const WEEKDAY_ABBR_3 = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

function formatWeekdayAbbr3(d) {
  return WEEKDAY_ABBR_3[d.getUTCDay()];
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
// Ortak yardımcılar: TSİ "şimdi", Türkçe liste
// ---------------------------------------------------------------------------

const NOW_BADGE_STYLE = {
  marginLeft: 8,
  padding: "1px 6px",
  borderRadius: 4,
  background: "var(--teal)",
  color: "#FFFFFF",
  fontSize: 10,
};

// TSİ sabit UTC+3 (Türkiye 2016'dan beri yaz/kış saati uygulamıyor).
function tsiNowKey() {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
}

function findNowIndex(series) {
  const key = tsiNowKey();
  return (series || []).findIndex((s) => typeof s.time === "string" && s.time.startsWith(key));
}

// Tablonun "şimdi" konumu: şimdiki saat, seçili aralığın (1/3/6 saat) katına yuvarlanır.
function nowTargetIndex(series, interval) {
  const idx = findNowIndex(series);
  if (idx < 0) return 0;
  const step = interval || 1;
  return Math.floor(idx / step) * step;
}

function modelHasPrecipProb(m) {
  return (m.series || []).some((s) => s.precip_prob != null);
}

function joinTr(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ve ${items[items.length - 1]}`;
}

// Grafikler ve matrisler:
// - Sıcaklık, Nem, CAPE, Basınç: components/LineChartPanel.js
// - Toplam yağış: components/PrecipPanel.js
// - Bulutluluk ve Rüzgar (model × zaman matrisleri): components/MatrixPanel.js
