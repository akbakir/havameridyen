import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { isFavorite, toggleFavorite } from "../lib/favorites";
import { CITY_CHIPS, cityHref, slugify } from "../lib/slugify";

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
  const searchTimer = useRef(null);

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
    const url = `/api/forecast?lat=${location.lat}&lon=${location.lon}&period=${period}&name=${encodeURIComponent(location.name)}`;
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
  }, [location, period]);

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

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">Sıcaklık, yağış ve rüzgar</div>
          <div className="panel-sub">
            {status === "ok" && location
              ? `°C · mm · km/s · ${forecast.models.length} model · ${location.name}`
              : "°C · mm · km/s"}
          </div>
        </div>
        {status === "loading" && <div className="loading">Veri yükleniyor…</div>}
        {status === "error" && <div className="err">Veri alınamadı — bağlantını kontrol et.</div>}
        {status === "ok" && <Chart models={forecast.models} />}
        <div className="legend">
          {(status === "ok" ? forecast.models : [
            { id: "ecmwf", label: "ECMWF", color: "#D98E2B", dashed: false },
            { id: "gfs", label: "GFS", color: "#1E7A6B", dashed: false },
            { id: "icon", label: "ICON", color: "#2C4A6E", dashed: true },
            { id: "gem", label: "GEM", color: "#B4553B", dashed: true },
          ]).map((m) => (
            <div className="legend-item" key={m.id}>
              <span
                className="legend-swatch"
                style={
                  m.dashed
                    ? { borderTop: `2px dashed ${m.color}`, height: 0, background: "none" }
                    : { background: m.color }
                }
              />
              {m.label}
            </div>
          ))}
          <span className="legend-break" aria-hidden="true" />
          <div className="legend-item">
            <span className="legend-swatch legend-precip" />
            Yağış (ort.)
          </div>
          <div className="legend-item">
            <span className="legend-wind-icon" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20 V6" />
                <path d="M6 12 l6-6 6 6" />
              </svg>
            </span>
            Rüzgar yönü (ort.)
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
          <div className="panel-title">
            Model detayları {status === "ok" ? `— ${detailTimeLabel(forecast)}` : ""}
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
                const idx = detailIndex(forecast);
                const point = m.series[idx];
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
          <div className="el-sub">ECMWF, GFS, ICON ve GEM arasındaki farkları öğren</div>
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

function detailIndex(forecast) {
  const len = forecast.models[0]?.series.length || 0;
  return Math.min(24, Math.max(0, len - 1));
}

function detailTimeLabel(forecast) {
  const idx = detailIndex(forecast);
  const t = forecast.models[0]?.series[idx]?.time;
  if (!t) return "";
  const d = new Date(t);
  return d.toLocaleDateString("tr-TR", { weekday: "long" }) + " " + d.getHours() + ":00";
}

function meanAt(models, i, key) {
  let sum = 0,
    count = 0;
  for (const m of models) {
    const v = m.series[i]?.[key];
    if (v != null && !Number.isNaN(Number(v))) {
      sum += Number(v);
      count++;
    }
  }
  return count ? sum / count : null;
}

function meanDirection(models, i) {
  let sin = 0,
    cos = 0,
    count = 0;
  for (const m of models) {
    const v = m.series[i]?.wind_direction;
    if (v != null && !Number.isNaN(Number(v))) {
      const rad = (Number(v) * Math.PI) / 180;
      sin += Math.sin(rad);
      cos += Math.cos(rad);
      count++;
    }
  }
  if (!count) return null;
  const ang = (Math.atan2(sin / count, cos / count) * 180) / Math.PI;
  return ((ang % 360) + 360) % 360;
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
  const precipH = plotH * 0.22;
  const windH = plotH - tempH - precipH;
  const tempBottom = padT + tempH;
  const precipBottom = tempBottom + precipH;
  const windCy = precipBottom + windH / 2;

  const n = models[0]?.series.length || 0;
  const allVals = models.flatMap((m) => m.series.map((s) => s.temp)).filter((v) => v != null);
  if (!allVals.length || n < 2) {
    return <div className="err">Bu modeller için veri yok.</div>;
  }
  const min = Math.floor(Math.min(...allVals) / 2) * 2 - 2;
  const max = Math.ceil(Math.max(...allVals) / 2) * 2 + 2;
  const x = (i) => padL + (i / (n - 1)) * plotW;
  const yTemp = (v) => padT + tempH - ((v - min) / (max - min)) * tempH;

  const precipAvgs = Array.from({ length: n }, (_, i) => meanAt(models, i, "precip_amount"));
  const precipMax = Math.max(0, ...precipAvgs.filter((v) => v != null));
  const barW = Math.max(1.2, Math.min(5, (plotW / n) * 0.55));

  const speedAvgs = Array.from({ length: n }, (_, i) => meanAt(models, i, "wind_speed"));
  const speedMax = Math.max(0, ...speedAvgs.filter((v) => v != null));

  const dots = [];
  for (let row = 0; row <= 3; row++) {
    const gy = padT + (row / 3) * tempH;
    for (let col = 0; col <= 10; col++) dots.push([padL + (col / 10) * plotW, gy]);
  }

  const dayStep = Math.max(1, Math.floor(n / 6));
  const xLabels = [];
  const windMarks = [];
  for (let i = 0; i < n; i += dayStep) {
    const d = new Date(models[0].series[i].time);
    xLabels.push({
      x: x(i) - 14,
      text: `${d.toLocaleDateString("tr-TR", { weekday: "short" })} ${d.getHours()}s`,
    });
    const dir = meanDirection(models, i);
    const spd = speedAvgs[i];
    if (dir == null) continue;
    const opacity = speedMax ? 0.3 + 0.7 * Math.min(1, (spd ?? 0) / speedMax) : 0.3;
    windMarks.push({ x: x(i), dir, opacity });
  }

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`}>
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1" fill="var(--line)" />
      ))}
      {[min, (min + max) / 2, max].map((v, idx) => (
        <text key={idx} className="axis-label" x="4" y={padT + tempH - (idx / 2) * tempH + 3}>
          {Math.round(v)}°
        </text>
      ))}
      {precipAvgs.map((avg, i) => {
        if (avg == null || avg <= 0 || precipMax <= 0) return null;
        const bh = (avg / precipMax) * precipH * 0.92;
        return (
          <rect
            key={`p-${i}`}
            x={x(i) - barW / 2}
            y={precipBottom - bh}
            width={barW}
            height={bh}
            fill="var(--teal)"
            fillOpacity="0.4"
          />
        );
      })}
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
      {windMarks.map((m, i) => (
        <g
          key={`w-${i}`}
          transform={`translate(${m.x} ${windCy}) rotate(${m.dir})`}
          opacity={m.opacity}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M0 5.5 V-5.5" />
          <path d="M-3.4 0.5 L0 -5.5 L3.4 0.5" />
        </g>
      ))}
      {xLabels.map((l, i) => (
        <text key={i} className="axis-label" x={l.x} y={h - 6}>
          {l.text}
        </text>
      ))}
    </svg>
  );
}
