import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { isFavorite, toggleFavorite } from "../lib/favorites";
import { CITY_CHIPS, cityHref, slugify } from "../lib/slugify";
import { MODELS } from "../lib/forecast";

const PERIODS = [
  { id: "hourly", label: "Saatlik" },
  { id: "3d", label: "3 gün" },
  { id: "7d", label: "7 gün" },
  { id: "16d", label: "16 gün" },
];

const CITY_NAV = [
  { href: "/", label: "Ana sayfa" },
  { href: "/modeller", label: "Modeller" },
  { href: "/favoriler", label: "Favoriler" },
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
  const [windUnit, setWindUnit] = useState("kmh");
  const [tableTimeIndex, setTableTimeIndex] = useState(24);
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

  useEffect(() => {
    setTableTimeIndex(24);
  }, [period]);

  useEffect(() => {
    if (!forecast) return;
    const max = Math.max(0, (forecast.models[0]?.series.length || 1) - 1);
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
  const tableStep = period === "hourly" ? 3 : 6;
  const safeTableIndex = Math.min(Math.max(0, tableTimeIndex), maxTableIndex);
  const formattedTableTime = formatTableTime(forecast, safeTableIndex);

  function goToPrevTime() {
    setTableTimeIndex((i) => Math.max(0, i - tableStep));
  }

  function goToNextTime() {
    setTableTimeIndex((i) => Math.min(maxTableIndex, i + tableStep));
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
    ? `${location.name} — model karşılaştırması · Meridyen`
    : "Model karşılaştırması · Meridyen";

  return (
    <Layout title={title} variant="city" nav={CITY_NAV}>
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
        {CITY_CHIPS.map((c) => (
          <button
            key={c.name}
            type="button"
            className={"chip" + (location && c.name === location.name ? " active" : "")}
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
        <div className="shared-legend-top">
          {MODELS.filter((m) => m.defaultActive).map((m) => (
            <div
              key={m.id}
              className={"legend-item-h" + (activeModels.has(m.id) ? "" : " inactive")}
              onClick={() => toggleModel(m.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleModel(m.id);
                }
              }}
            >
              <span className="legend-dot" style={{ background: m.color }} />
              {m.label}
            </div>
          ))}
          <span className="legend-divider" aria-hidden="true" />
          {MODELS.filter((m) => !m.defaultActive).map((m) => (
            <div
              key={m.id}
              className={"legend-item-h" + (activeModels.has(m.id) ? "" : " inactive")}
              onClick={() => toggleModel(m.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleModel(m.id);
                }
              }}
            >
              <span
                className="legend-dot"
                style={
                  activeModels.has(m.id)
                    ? { background: m.color }
                    : { background: "transparent", boxShadow: `inset 0 0 0 1.5px ${m.color}` }
                }
              />
              {m.label}
            </div>
          ))}
        </div>
        <div className="charts-stack">
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Sıcaklık</div>
              <div className="panel-sub">
                {status === "ok" && location
                  ? `°C · ${forecast.models.length} model · ${location.name}`
                  : "°C"}
              </div>
            </div>
            {status === "loading" && <div className="loading">Veri yükleniyor…</div>}
            {status === "error" && <div className="err">Veri alınamadı — bağlantını kontrol et.</div>}
            {status === "ok" && <Chart models={forecast.models} />}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Toplam Yağış Miktarı</div>
              <div className="panel-sub">
                {status === "ok" ? `mm · ${forecast.models.length} model` : "mm"}
              </div>
            </div>
            {status === "loading" && <div className="loading">Veri yükleniyor…</div>}
            {status === "error" && <div className="err">Veri alınamadı — bağlantını kontrol et.</div>}
            {status === "ok" && <PrecipBarChart models={forecast.models} />}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="panel-head-left">
                <div className="panel-title">Rüzgar</div>
                <div className="panel-sub">Ortalama yön ve hız (koyuluk)</div>
              </div>
              <div className="unit-toggle">
                <button
                  type="button"
                  className={windUnit === "kmh" ? "active" : ""}
                  onClick={() => setWindUnit("kmh")}
                >
                  km/s
                </button>
                <button
                  type="button"
                  className={windUnit === "kn" ? "active" : ""}
                  onClick={() => setWindUnit("kn")}
                >
                  knot
                </button>
              </div>
            </div>
            {status === "loading" && <div className="loading">Veri yükleniyor…</div>}
            {status === "error" && <div className="err">Veri alınamadı — bağlantını kontrol et.</div>}
            {status === "ok" && (
              <>
                <WindChart models={forecast.models} />
                <div className="speed-legend-row">
                  <div className="speed-legend-item"><span className="speed-dot" style={{ opacity: 0.25 }} /> {formatSpeedRange(0, 10, windUnit)}</div>
                  <div className="speed-legend-item"><span className="speed-dot" style={{ opacity: 0.5 }} /> {formatSpeedRange(10, 20, windUnit)}</div>
                  <div className="speed-legend-item"><span className="speed-dot" style={{ opacity: 0.75 }} /> {formatSpeedRange(20, 30, windUnit)}</div>
                  <div className="speed-legend-item"><span className="speed-dot" style={{ opacity: 1 }} /> {formatSpeedRange(30, null, windUnit)}</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Yağış — model uyumu (ilk 24 saat)</div>
          <div className="panel-sub">
            {status === "ok"
              ? `${forecast.agreement.agree_count}/${forecast.agreement.total_count} model yağış öngörüyor`
              : "—"}
          </div>
        </div>
        <div className="agree-row">
          <div className="agree-label">Uyum skoru</div>
          <div className="agree-track">
            <div className="agree-fill" style={{ width: (status === "ok" ? forecast.agreement.agree_pct : 0) + "%" }} />
          </div>
          <div className="agree-pct">%{status === "ok" ? forecast.agreement.agree_pct : "—"}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title-group">
            <div className="panel-title">Model detayları</div>
            <div className="panel-sub">{status === "ok" ? formattedTableTime : ""}</div>
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
              onClick={goToNextTime}
              disabled={status !== "ok" || safeTableIndex >= maxTableIndex}
              aria-label="Sonraki"
            >
              →
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Sıcaklık</th>
              <th>Yağış olasılığı</th>
              <th>Yağış (mm)</th>
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
                return (
                  <tr key={m.id}>
                    <td className="station">
                      <span className="dot" style={{ background: m.color }} />
                      {m.label}
                    </td>
                    <td>{point ? Math.round(point.temp) + "°C" : "—"}</td>
                    <td>{point && point.precip_prob != null ? "%" + point.precip_prob : "—"}</td>
                    <td>{formatPrecipMm(point?.precip_amount)}</td>
                    <td>
                      <WindCell speed={point?.wind_speed} direction={point?.wind_direction} />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
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

function formatPrecipMm(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return Number(amount).toFixed(1);
}

function WindCell({ speed, direction }) {
  if (speed == null && direction == null) return "—";
  const compass = degreesToCompass(direction);
  const speedText = speed == null ? "—" : `${Math.round(speed)} km/s`;
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

function formatTableTime(forecast, index) {
  const t = forecast?.models[0]?.series[index]?.time;
  if (!t) return "";
  const d = new Date(t);
  return d.toLocaleDateString("tr-TR", { weekday: "long" }) + " " + d.getHours() + ":00";
}

function Chart({ models }) {
  const w = 800,
    h = 300,
    padL = 34,
    padR = 10,
    padT = 14,
    padB = 26;
  const plotW = w - padL - padR,
    plotH = h - padT - padB;
  const tempH = plotH * 0.6;
  const tempBottom = padT + tempH;

  const n = models[0]?.series.length || 0;
  const allVals = models.flatMap((m) => m.series.map((s) => s.temp)).filter((v) => v != null);
  if (!allVals.length || n < 2) {
    return <div className="err">Bu modeller için veri yok.</div>;
  }
  const min = Math.floor(Math.min(...allVals) / 2) * 2;
  const max = Math.ceil(Math.max(...allVals) / 2) * 2;
  const span = max - min || 2;
  const x = (i) => padL + (i / (n - 1)) * plotW;
  const yTemp = (v) => padT + tempH - ((v - min) / span) * tempH;

  const tempTicks = [];
  for (let v = min; v <= max; v += 2) tempTicks.push(v);

  const dayStep = Math.max(1, Math.floor(n / 6));
  const xLabels = [];
  for (let i = 0; i < n; i += dayStep) {
    const d = new Date(models[0].series[i].time);
    xLabels.push({
      x: x(i) - 14,
      text: `${d.toLocaleDateString("tr-TR", { weekday: "short" })} ${d.getHours()}s`,
    });
  }

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`}>
      {tempTicks.map((v) => (
        <line
          key={`tgrid-${v}`}
          x1={padL}
          y1={yTemp(v)}
          x2={padL + plotW}
          y2={yTemp(v)}
          stroke="var(--line)"
          strokeWidth={v === 30 ? 1.25 : 1}
          opacity={v === 30 ? 0.55 : 0.25}
        />
      ))}
      {xLabels.map((l, i) => (
        <line
          key={`guide-${i}`}
          x1={l.x + 14}
          y1={padT}
          x2={l.x + 14}
          y2={h - padB}
          stroke="var(--line)"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity="0.6"
        />
      ))}
      {tempTicks.map((v) => (
        <text key={`tlab-${v}`} className="axis-label" x="4" y={yTemp(v) + 3}>
          {v}°
        </text>
      ))}
      <line
        x1={padL}
        y1={tempBottom}
        x2={padL + plotW}
        y2={tempBottom}
        stroke="var(--line)"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      {models.map((m) => {
        const pts = m.series
          .map((s, i) => (s.temp != null ? `${x(i)},${yTemp(s.temp)}` : null))
          .filter(Boolean)
          .join(" ");
        return (
          <polyline
            key={m.id}
            className={"model-line" + (m.dashed ? " dashed" : "")}
            stroke={m.color}
            points={pts}
          />
        );
      })}
      {xLabels.map((l, i) => (
        <text key={i} className="axis-label" x={l.x} y={h - 6}>
          {l.text}
        </text>
      ))}
    </svg>
  );
}

function formatMmTick(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function PrecipBarChart({ models }) {
  const w = 800,
    h = 196,
    padL = 34,
    padR = 10,
    padT = 14,
    padB = 26;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const n = models[0]?.series.length || 0;
  const allVals = models
    .flatMap((m) => m.series.map((s) => s.precip_amount))
    .filter((v) => v != null && !Number.isNaN(Number(v)))
    .map(Number);
  if (n < 2) {
    return <div className="err">Bu modeller için veri yok.</div>;
  }

  const rawMax = allVals.length ? Math.max(0, ...allVals) : 0;
  const max = rawMax <= 0 ? 1 : Math.ceil(rawMax / 2) * 2;
  const x = (i) => padL + (i / (n - 1)) * plotW;
  const yPrecip = (v) => padT + plotH - (v / max) * plotH;

  const mCount = models.length || 1;
  const slot = plotW / (n - 1);
  const groupW = slot * 0.75;
  const barW = groupW / mCount;

  const dots = [];
  for (let row = 0; row <= 3; row++) {
    const gy = padT + (row / 3) * plotH;
    for (let col = 0; col <= 10; col++) dots.push([padL + (col / 10) * plotW, gy]);
  }

  const dayStep = Math.max(1, Math.floor(n / 6));
  const xLabels = [];
  for (let i = 0; i < n; i += dayStep) {
    const d = new Date(models[0].series[i].time);
    xLabels.push({
      x: x(i) - 14,
      text: `${d.toLocaleDateString("tr-TR", { weekday: "short" })} ${d.getHours()}s`,
    });
  }

  const bars = [];
  models.forEach((m, mi) => {
    m.series.forEach((s, i) => {
      const v = s.precip_amount;
      if (v == null || Number.isNaN(Number(v)) || Number(v) <= 0) return;
      const bh = padT + plotH - yPrecip(Number(v));
      bars.push(
        <rect
          key={`${m.id}-${i}`}
          className="precip-bar"
          x={x(i) - groupW / 2 + mi * barW}
          y={yPrecip(Number(v))}
          width={barW}
          height={bh}
          fill={m.color}
        />
      );
    });
  });

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`}>
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1" fill="var(--line)" />
      ))}
      {xLabels.map((l, i) => (
        <line
          key={`guide-${i}`}
          x1={l.x + 14}
          y1={padT}
          x2={l.x + 14}
          y2={h - padB}
          stroke="var(--line)"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity="0.6"
        />
      ))}
      {[0, max / 2, max].map((v, idx) => (
        <text key={idx} className="axis-label" x="4" y={padT + plotH - (idx / 2) * plotH + 3}>
          {formatMmTick(v)}
        </text>
      ))}
      {bars}
      {xLabels.map((l, i) => (
        <text key={`t-${i}`} className="axis-label" x={l.x} y={h - 6}>
          {l.text}
        </text>
      ))}
    </svg>
  );
}

function circularMeanDirectionWeighted(degrees, weights) {
  let sumSin = 0,
    sumCos = 0;
  degrees.forEach((d, i) => {
    const rad = (d * Math.PI) / 180;
    const w = weights[i] || 0.01;
    sumSin += Math.sin(rad) * w;
    sumCos += Math.cos(rad) * w;
  });
  let mean = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
  return mean < 0 ? mean + 360 : mean;
}

function circularSpread(degrees, meanDeg) {
  const diffs = degrees.map((d) => {
    let diff = Math.abs(d - meanDeg) % 360;
    return diff > 180 ? 360 - diff : diff;
  });
  return Math.max(...diffs, 10);
}

function polarPoint(cx, cy, r, compassDeg) {
  const rad = (compassDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function arrowHead(tipX, tipY, compassDeg, size = 8) {
  const leftRad = ((compassDeg + 155) * Math.PI) / 180;
  const rightRad = ((compassDeg - 155) * Math.PI) / 180;
  return {
    left: { x: tipX + size * Math.sin(leftRad), y: tipY - size * Math.cos(leftRad) },
    right: { x: tipX + size * Math.sin(rightRad), y: tipY - size * Math.cos(rightRad) },
  };
}

function formatSpeedRange(kmhMin, kmhMax, unit) {
  const toKnot = (v) => Math.round(v * 0.539957);
  if (unit === "kn") {
    return kmhMax ? `${toKnot(kmhMin)}-${toKnot(kmhMax)} kt` : `${toKnot(kmhMin)}+ kt`;
  }
  return kmhMax ? `${kmhMin}-${kmhMax} km/s` : `${kmhMin}+ km/s`;
}

function sectorPath(cx, cy, r, startDeg, endDeg) {
  const p1 = polarPoint(cx, cy, r, startDeg);
  const p2 = polarPoint(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

function speedToOpacity(speed) {
  const clamped = Math.min(Math.max(speed, 0), 35);
  return 0.25 + (clamped / 35) * 0.75;
}

function WindChart({ models }) {
  const w = 800,
    h = 200,
    padL = 34,
    padR = 10,
    padT = 14,
    padB = 26;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const cy = padT + plotH / 2;
  const radius = 34;

  const n = models[0]?.series.length || 0;
  if (n < 2) {
    return <div className="err">Bu modeller için veri yok.</div>;
  }

  const x = (i) => padL + (i / (n - 1)) * plotW;
  const dayStep = Math.max(1, Math.floor(n / 6));
  const xLabels = [];
  for (let i = 0; i < n; i += dayStep) {
    const d = new Date(models[0].series[i].time);
    xLabels.push({
      x: x(i) - 14,
      text: `${d.toLocaleDateString("tr-TR", { weekday: "short" })} ${d.getHours()}s`,
    });
  }

  const dots = [];
  for (let row = 0; row <= 3; row++) {
    const gy = padT + (row / 3) * plotH;
    for (let col = 0; col <= 10; col++) dots.push([padL + (col / 10) * plotW, gy]);
  }

  const glyphs = [];
  for (let i = 0; i < n; i += dayStep) {
    const dirs = [];
    const weights = [];
    for (const m of models) {
      const d = m.series[i]?.wind_direction;
      if (d == null || Number.isNaN(Number(d))) continue;
      dirs.push(Number(d));
      const s = m.series[i]?.wind_speed;
      weights.push(s != null && !Number.isNaN(Number(s)) ? Number(s) : 0);
    }
    if (!dirs.length) continue;
    const meanDir = circularMeanDirectionWeighted(dirs, weights);
    const spread = circularSpread(dirs, meanDir);
    const avgSpeed = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0;
    const cx = x(i);
    const tip = polarPoint(cx, cy, radius, meanDir);
    const head = arrowHead(tip.x, tip.y, meanDir);
    glyphs.push({
      i,
      path: sectorPath(cx, cy, radius, meanDir - spread / 2, meanDir + spread / 2),
      opacity: speedToOpacity(avgSpeed),
      x1: cx,
      y1: cy,
      x2: tip.x,
      y2: tip.y,
      head,
    });
  }

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`}>
      {dots.map(([dx, dy], i) => (
        <circle key={i} cx={dx} cy={dy} r="1" fill="var(--line)" />
      ))}
      {xLabels.map((l, i) => (
        <line
          key={`guide-${i}`}
          x1={l.x + 14}
          y1={padT}
          x2={l.x + 14}
          y2={h - padB}
          stroke="var(--line)"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity="0.6"
        />
      ))}
      {glyphs.map((g) => (
        <g key={g.i}>
          <path d={g.path} fill="var(--navy)" fillOpacity={g.opacity} />
          <line
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            stroke="var(--navy)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d={`M ${g.x2} ${g.y2} L ${g.head.left.x} ${g.head.left.y} L ${g.head.right.x} ${g.head.right.y} Z`}
            fill="var(--navy)"
          />
        </g>
      ))}
      {xLabels.map((l, i) => (
        <text key={`t-${i}`} className="axis-label" x={l.x} y={h - 6}>
          {l.text}
        </text>
      ))}
    </svg>
  );
}
