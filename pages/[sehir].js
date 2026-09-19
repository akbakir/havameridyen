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
  const [tableTimeIndex, setTableTimeIndex] = useState(0);
  const [tableInterval, setTableInterval] = useState(1);
  const [precipInterval, setPrecipInterval] = useState(1);
  const [rainThreshold, setRainThreshold] = useState(RAIN_THRESHOLD_DEFAULT);
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
        <ModelPicker
          activeModels={activeModels}
          onToggle={toggleModel}
          onReset={resetModels}
        />
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
            {status === "ok" && (
              <>
                <Chart models={forecast.models} />
                <CoverageNote models={forecast.models} />
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="panel-head-left">
                <div className="panel-title">Toplam Yağış Miktarı</div>
                <div className="panel-sub">
                  {status === "ok" ? `mm · ${forecast.models.length} model` : "mm"}
                </div>
              </div>
              <div className="unit-toggle">
                {[1, 3, 6].map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    className={precipInterval === hrs ? "active" : ""}
                    onClick={() => setPrecipInterval(hrs)}
                  >
                    {hrs}s
                  </button>
                ))}
              </div>
            </div>
            {status === "loading" && <div className="loading">Veri yükleniyor…</div>}
            {status === "error" && <div className="err">Veri alınamadı — bağlantını kontrol et.</div>}
            {status === "ok" && (
              <>
                <PrecipBarChart
                  models={forecast.models.map((m) => ({ ...m, series: bucketPrecipSeries(m.series, precipInterval) }))}
                  interval={precipInterval}
                  rawModels={forecast.models}
                  rainThreshold={rainThreshold}
                />
                <AgreementLegend threshold={rainThreshold} onChange={setRainThreshold} />
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="panel-head-left">
                <div className="panel-title">Rüzgar</div>
                <div className="panel-sub">Günlük hakim yön, yön aralığı, ortalama hız ve hamle</div>
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
                <WindChart models={forecast.models} unit={windUnit} />
                <WindLegend unit={windUnit} />
              </>
            )}
          </div>
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

function Chart({ models }) {
  const w = 800,
    h = 260,
    padL = 34,
    padR = 10,
    padT = 14,
    padB = 44;
  const plotW = w - padL - padR,
    plotH = h - padT - padB;
  // Eski birleşik grafikten kalan alt boşluk kaldırıldı: sıcaklık tüm çizim alanını kullanır.
  const tempH = plotH;

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

  const timeAxis = buildTimeAxis(models[0].series, x);
  const cov = computeCoverage(models, "temp");

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`}>
      {cov && (
        <rect
          x={x(cov.firstEnd)}
          y={padT}
          width={Math.max(0, x(n - 1) - x(cov.firstEnd))}
          height={plotH}
          fill="var(--line)"
          opacity={0.22}
        />
      )}
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
      {renderTimeAxis(timeAxis, padT, h - padB, h - 30, h - 17, h - 5)}
      {tempTicks.map((v) => (
        <text key={`tlab-${v}`} className="axis-label" x="4" y={yTemp(v) + 3}>
          {v}°
        </text>
      ))}
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
    </svg>
  );
}

function formatMmTick(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// Üç grafikte de (sıcaklık, yağış, rüzgar) ortak kullanılan zaman ekseni: gün değişimini (00:00 TSİ)
// ve öğleni (12:00 TSİ) işaretler. Seri sıkışıksa (uzun periyotlarda) 12:00 etiketleri elenir, sadece
// gün sınırları kalır; gün etiketleri de sıkışıksa tarih dikey yazılır.
function buildTimeAxis(series, xFn) {
  const n = series.length;
  if (n < 2) return { marks: [], rotateDate: false };
  const raw = [];
  series.forEach((s, i) => {
    const p = parseTsiTime(s.time);
    if (!p) return;
    if (p.hour === 0 || p.hour === 12) raw.push({ i, x: xFn(i), hour: p.hour, date: p.date });
  });
  const dayMarks = raw.filter((m) => m.hour === 0);
  const noonMarks = raw.filter((m) => m.hour === 12);
  const totalSpan = xFn(n - 1) - xFn(0);
  const avgSpacingCombined = raw.length > 1 ? totalSpan / (raw.length - 1) : Infinity;
  const showNoon = noonMarks.length === 0 || avgSpacingCombined >= 30;
  const marks = (showNoon ? raw : dayMarks).slice().sort((a, b) => a.i - b.i);
  let minDayGap = Infinity;
  for (let k = 1; k < dayMarks.length; k++) minDayGap = Math.min(minDayGap, dayMarks[k].x - dayMarks[k - 1].x);
  const rotateDate = Number.isFinite(minDayGap) && minDayGap < 46;
  return { marks, rotateDate };
}

function formatAxisDate(d) {
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });
}

// Sabit 3 harfli Türkçe gün kısaltmaları (Intl'in "short" biçimi bazı günlerde 3'ten uzun
// dönebiliyor, örn. "Çarş"). getUTCDay(): 0=Pazar, 1=Pazartesi, ... 6=Cumartesi.
// (Date, parseTsiTime ile UTC tabanlı üretildiği için getUTCDay kullanılır.)
const WEEKDAY_ABBR_3 = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

function formatWeekdayAbbr3(d) {
  return WEEKDAY_ABBR_3[d.getUTCDay()];
}

// buildTimeAxis()'in ürettiği marks'i SVG'ye çizen ortak yardımcı: gün sınırında noktalı dikey
// çizgi + "00:00" + altına tarih + altına 3 harfli gün kısaltması, öğlende daha soluk kesikli
// çizgi + "12:00". Saatler TSİ'dir (sonlarına "Z" eklenmez).
// Sıkışıklıkta (rotateDate) tarih+gün tek satırda birleşip dikey yazılır.
// row1Y saat etiketinin, row2Y tarihin, row3Y gün kısaltmasının y konumu.
function renderTimeAxis({ marks, rotateDate }, padT, plotBottom, row1Y, row2Y, row3Y) {
  return (
    <>
      {marks.map((m) => (
        <line
          key={`axis-line-${m.i}`}
          x1={m.x}
          y1={padT}
          x2={m.x}
          y2={plotBottom}
          stroke="var(--line)"
          strokeWidth="1"
          strokeDasharray={m.hour === 0 ? "1 4" : "2 3"}
          strokeLinecap={m.hour === 0 ? "round" : "butt"}
          opacity={m.hour === 0 ? 0.5 : 0.25}
        />
      ))}
      {marks.map((m) => (
        <text key={`axis-hour-${m.i}`} className="axis-label" x={m.x} y={row1Y} textAnchor="middle">
          {formatHourLabel(m.hour)}
        </text>
      ))}
      {marks
        .filter((m) => m.hour === 0)
        .map((m) =>
          rotateDate ? (
            <text
              key={`axis-date-${m.i}`}
              className="axis-label"
              x={m.x}
              y={row2Y}
              textAnchor="start"
              transform={`rotate(-90 ${m.x} ${row2Y})`}
            >
              {`${formatAxisDate(m.date)} ${formatWeekdayAbbr3(m.date)}`}
            </text>
          ) : (
            <g key={`axis-date-${m.i}`}>
              <text className="axis-label" x={m.x} y={row2Y} textAnchor="middle">
                {formatAxisDate(m.date)}
              </text>
              <text className="axis-label" x={m.x} y={row3Y} textAnchor="middle">
                {formatWeekdayAbbr3(m.date)}
              </text>
            </g>
          )
        )}
    </>
  );
}

// Saatlik yağış serisini seçilen aralığa (1/3/6 saat) göre toplar. Kova sınırları gün içi
// saat % interval === 0 noktalarına hizalanır (örn. 6 saatlik: 00, 06, 12, 18), böylece kova
// başlangıçları her zaman 00:00/12:00 (TSİ) eksen işaretleriyle çakışır.
function bucketPrecipSeries(series, interval) {
  if (interval <= 1) return series.map((s) => ({ time: s.time, precip_amount: s.precip_amount }));
  const buckets = [];
  let current = null;
  series.forEach((s) => {
    const p = parseTsiTime(s.time);
    const hour = p ? p.hour : 0;
    const isBoundary = hour % interval === 0;
    if (!current || isBoundary) {
      if (current) buckets.push(current);
      current = { time: s.time, precip_amount: 0, hasValue: false };
    }
    const v = s.precip_amount;
    if (v != null && !Number.isNaN(Number(v))) {
      current.precip_amount += Number(v);
      current.hasValue = true;
    }
  });
  if (current) buckets.push(current);
  return buckets.map((b) => ({ time: b.time, precip_amount: b.hasValue ? b.precip_amount : null }));
}

// Yağış grafiği + altında ince "günlük model uyumu" şeridi. Çizim alanı eskisiyle aynı (h=196);
// şerit bunun altına STRIP_EXTRA kadar ek yükseklikte çizilir.
const STRIP_EXTRA = 30;

function PrecipBarChart({ models, interval = 1, rawModels, rainThreshold = RAIN_THRESHOLD_DEFAULT }) {
  const w = 800,
    h = 196,
    padL = 34,
    padR = 10,
    padT = 14,
    padB = 44;
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

  // 0.2mm'de bir ince çizgi; 0.5mm ve 1mm belirgin referans çizgileri.
  const fineTicks = new Set();
  for (let v = 0.2; v <= max + 1e-9; v += 0.2) fineTicks.add(Math.round(v * 10) / 10);
  if (max >= 0.5) fineTicks.add(0.5);
  const fineTickList = Array.from(fineTicks).sort((a, b) => a - b);

  const timeAxis = buildTimeAxis(models[0].series, x);
  const cov = computeCoverage(models, "precip_amount");

  // Günlük uyum şeridi (saatlik ham seriden hesaplanır, kovalı eksene hizalanır)
  const daily = rawModels ? computeDailyAgreement(rawModels, rainThreshold) : [];
  const xHour = (hIdx) => padL + (hIdx / interval / (n - 1)) * plotW;
  const stripY = h + 4;
  const stripH = 18;
  const strip = daily.map((d, di) => {
    if (!d.n) return null;
    const x0 = Math.max(padL, xHour(d.h0));
    const x1 = di === daily.length - 1 ? padL + plotW : Math.min(padL + plotW, xHour(d.h1));
    const cw = x1 - x0 - 3;
    if (cw <= 2) return null;
    const agree = Math.max(d.wet, d.n - d.wet) / d.n;
    const pct = Math.round(agree * 100);
    const split = agree < AGREE_SPLIT_BELOW;
    const isWet = !split && d.wet > d.n / 2;
    const fill = split ? "var(--amber)" : isWet ? RAIN_BLUE : DRY_GRAY;
    const ink = isWet ? "#FFFFFF" : "var(--ink)";
    let label = "";
    if (cw >= 96) label = split ? `${d.wet}/${d.n} belirsiz %${pct}` : isWet ? `${d.wet}/${d.n} yağış %${pct}` : `yağış yok %${pct}`;
    else if (cw >= 30) label = split || isWet ? `${d.wet}/${d.n}` : "yok";
    const p = parseTsiTime(rawModels[0].series[d.h0]?.time);
    const dayText = p ? `${formatAxisDate(p.date)} ${formatWeekdayAbbr3(p.date)}` : d.key;
    return (
      <g key={`agree-${d.key}`}>
        <title>{`${dayText}: ${d.wet}/${d.n} model yağış bekliyor (günlük ≥ ${rainThreshold} mm) · uyum %${pct}`}</title>
        <rect x={x0 + 1.5} y={stripY} width={cw} height={stripH} rx={3} fill={fill} />
        {label && (
          <text
            x={x0 + 1.5 + cw / 2}
            y={stripY + 12.5}
            textAnchor="middle"
            className="axis-label"
            style={{ fill: ink, fontSize: 9.5 }}
          >
            {label}
          </text>
        )}
      </g>
    );
  });

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
    <svg className="chart" viewBox={`0 0 ${w} ${h + (rawModels ? STRIP_EXTRA : 0)}`}>
      {cov && (
        <rect
          x={x(cov.firstEnd)}
          y={padT}
          width={Math.max(0, x(n - 1) - x(cov.firstEnd))}
          height={plotH}
          fill="var(--line)"
          opacity={0.22}
        />
      )}
      {fineTickList.map((v) => {
        const strong = Math.abs(v - 0.5) < 0.01 || Math.abs(v - 1) < 0.01;
        return (
          <line
            key={`pgrid-${v}`}
            x1={padL}
            y1={yPrecip(v)}
            x2={padL + plotW}
            y2={yPrecip(v)}
            stroke="var(--line)"
            strokeWidth={strong ? 1.25 : 1}
            opacity={strong ? 0.55 : 0.18}
          />
        );
      })}
      {renderTimeAxis(timeAxis, padT, h - padB, h - 30, h - 17, h - 5)}
      {[0, max / 2, max].map((v, idx) => (
        <text key={idx} className="axis-label" x="4" y={padT + plotH - (idx / 2) * plotH + 3}>
          {formatMmTick(v)}
        </text>
      ))}
      {bars}
      {rawModels && (
        <text className="axis-label" x="4" y={stripY + 12.5}>
          uyum
        </text>
      )}
      {strip}
    </svg>
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
// Ortak yardımcılar: TSİ "şimdi", model kapsaması, günlere bölme, Türkçe liste
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

// Modellerin tahmin süreleri farklıysa: en erken biten modelin son verisi (firstEnd), erken
// biten modeller ve sonuna kadar süren modeller. Süreler kodda sabit değil, veriden hesaplanır.
function computeCoverage(models, key) {
  const ends = models
    .map((m) => {
      let last = -1;
      m.series.forEach((s, i) => {
        if (s[key] != null && !Number.isNaN(Number(s[key]))) last = i;
      });
      return { m, last };
    })
    .filter((o) => o.last >= 0);
  if (ends.length < 2) return null;
  const maxLast = Math.max(...ends.map((o) => o.last));
  const early = ends.filter((o) => o.last < maxLast).sort((a, b) => a.last - b.last);
  if (!early.length) return null;
  return {
    firstEnd: early[0].last,
    early,
    full: ends.filter((o) => o.last === maxLast).map((o) => o.m.label),
  };
}

function CoverageNote({ models }) {
  const cov = computeCoverage(models, "temp");
  if (!cov) return null;
  const groups = [];
  cov.early.forEach((o) => {
    const p = parseTsiTime(o.m.series[o.last]?.time);
    const day = p ? formatAxisDate(p.date) : "?";
    const g = groups.find((x) => x.day === day);
    if (g) g.ids.push(o.m.label);
    else groups.push({ day, ids: [o.m.label] });
  });
  const parts = groups.map((g) => `${joinTr(g.ids)} ${g.day}`).join("; ");
  return (
    <div className="panel-sub" style={{ marginTop: 6, fontSize: 11 }}>
      ⓘ Model tahmin süreleri farklı — son veri: {parts}. Taralı bölgede yalnızca {joinTr(cov.full)} var.
    </div>
  );
}

// Saatlik seriyi TSİ takvim günlerine böler: [{ key:"YYYY-MM-DD", h0, h1 }] (h1 hariç).
function groupDays(series) {
  const days = [];
  (series || []).forEach((s, i) => {
    const k = String(s.time || "").slice(0, 10);
    const last = days[days.length - 1];
    if (!last || last.key !== k) days.push({ key: k, h0: i, h1: i + 1 });
    else last.h1 = i + 1;
  });
  return days;
}

// ---------------------------------------------------------------------------
// Günlük yağış uyumu (yağış grafiğinin altındaki ince şerit)
// Her model için günlük toplam yağış >= eşik ise "yağış bekliyor" sayılır. Eşik varsayılan 0.2 mm,
// kullanıcı RAIN_THRESHOLD_OPTIONS arasından artırabilir.
// Uyum = çoğunluktaki model sayısı / o gün verisi olan model sayısı.
// (Yağış olasılığı kullanılmaz: UKMO ve ARPEGE bu değeri sunmuyor.)
// ---------------------------------------------------------------------------

const RAIN_THRESHOLD_DEFAULT = 0.2;
const RAIN_THRESHOLD_OPTIONS = [0.2, 0.5, 1, 2, 5];
const AGREE_SPLIT_BELOW = 0.75; // uyum bunun altındaysa "belirsiz" (amber)
const RAIN_BLUE = "#3B6FB6";
const DRY_GRAY = "#DDE0DB";

function computeDailyAgreement(models, threshold = RAIN_THRESHOLD_DEFAULT) {
  const days = groupDays(models[0]?.series);
  return days.map((d) => {
    let n = 0;
    let wet = 0;
    models.forEach((m) => {
      let sum = 0;
      let any = false;
      for (let i = d.h0; i < d.h1; i++) {
        const v = m.series[i]?.precip_amount;
        if (v != null && !Number.isNaN(Number(v))) {
          sum += Number(v);
          any = true;
        }
      }
      if (!any) return;
      n++;
      if (sum >= threshold - 1e-9) wet++;
    });
    return { ...d, n, wet };
  });
}

function AgreementLegend({ threshold, onChange }) {
  const items = [
    [RAIN_BLUE, "yağışta uzlaşı"],
    [DRY_GRAY, "yağış yok"],
    ["var(--amber)", "modeller bölünmüş"],
  ];
  return (
    <div
      className="panel-sub"
      style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 6, fontSize: 11 }}
    >
      {items.map(([c, t]) => (
        <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: "inline-block" }} />
          {t}
        </span>
      ))}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
        uyum eşiği: günlük toplam ≥
        <span className="unit-toggle">
          {RAIN_THRESHOLD_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              className={threshold === t ? "active" : ""}
              onClick={() => onChange(t)}
            >
              {t}
            </button>
          ))}
        </span>
        mm
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rüzgar — günlük grafik
// Her gün kendi sütununda: taralı dilim = yön aralığı (saatlerin %80'i), koyu çizgi = hakim yön
// (rüzgarın geldiği yön, hızla ağırlıklı), renk = günlük ortalama hız (Beaufort/MGM),
// çubuk = ortalama hız (dolu) + gün içi en yüksek hamle (taralı uzantı).
// ---------------------------------------------------------------------------

const KN_PER_KMH = 0.539957;
const STORM_MS = 17.2; // MGM: 8 bofor (fırtına) alt sınırı — 17.2 m/s ≈ 62 km/s ≈ 34 knot
const STORM_RED = "#B8322A";

// MGM Beaufort rüzgâr ıskalası (10 m, açık ve düz alan) — m/s alt sınırları.
// Renkler griden koyu kahveye: 0–4 bofor yavaş (gri→kum), turuncu tonlar 5 bofordan sonra.
const BEAUFORT = [
  { ms: 0, color: "#D2D5D1", label: "0–1 sakin/esinti", kmh: "0–5", kn: "0–3" },
  { ms: 1.6, color: "#D2C4B3", label: "2 hafif", kmh: "6–11", kn: "4–6" },
  { ms: 3.4, color: "#D0B296", label: "3 tatlı", kmh: "12–19", kn: "7–10" },
  { ms: 5.5, color: "#CEA177", label: "4 orta", kmh: "20–28", kn: "11–16" },
  { ms: 8.0, color: "#CB8F57", label: "5 sert", kmh: "29–38", kn: "17–21" },
  { ms: 10.8, color: "#BF6B2D", label: "6 kuvvetli", kmh: "39–49", kn: "22–27" },
  { ms: 13.9, color: "#9C5625", label: "7 fırtınamsı", kmh: "50–61", kn: "28–33" },
  { ms: 17.2, color: "#7A431F", label: "8 fırtına", kmh: "62–74", kn: "34–40" },
  { ms: 20.8, color: "#593017", label: "9 kuvvetli fırtına", kmh: "75–88", kn: "41–47" },
  { ms: 24.5, color: "#3A1E10", label: "10+ tam fırtına", kmh: "89+", kn: "48+" },
];

function beaufortIndex(kmh) {
  const ms = kmh / 3.6;
  let k = 0;
  BEAUFORT.forEach((b, i) => {
    if (ms >= b.ms) k = i;
  });
  return k;
}

function toWindUnit(kmh, unit) {
  return unit === "kn" ? kmh * KN_PER_KMH : kmh;
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

// Hakim yöne göre saatlerin %80'ini kapsayan yön aralığı (10.–90. yüzdelik). En az 14° genişlik.
function directionRange80(degrees, meanDeg) {
  if (!degrees.length) return [meanDeg - 7, meanDeg + 7];
  const diffs = degrees.map((d) => ((d - meanDeg + 540) % 360) - 180).sort((a, b) => a - b);
  let lo = diffs[Math.floor(diffs.length * 0.1)];
  let hi = diffs[Math.max(0, Math.ceil(diffs.length * 0.9) - 1)];
  if (hi - lo < 14) {
    const mid = (hi + lo) / 2;
    lo = mid - 7;
    hi = mid + 7;
  }
  return [meanDeg + lo, meanDeg + hi];
}

function polarPoint(cx, cy, r, compassDeg) {
  const rad = (compassDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function sectorPath(cx, cy, r, startDeg, endDeg) {
  const p1 = polarPoint(cx, cy, r, startDeg);
  const p2 = polarPoint(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

function computeDailyWind(models) {
  const days = groupDays(models[0]?.series);
  return days.map((d) => {
    const dirs = [];
    const weights = [];
    const speeds = [];
    let gustMax = null;
    models.forEach((m) => {
      for (let i = d.h0; i < d.h1; i++) {
        const s = m.series[i];
        if (!s) continue;
        const sp = s.wind_speed != null && !Number.isNaN(Number(s.wind_speed)) ? Number(s.wind_speed) : null;
        const dir = s.wind_direction != null && !Number.isNaN(Number(s.wind_direction)) ? Number(s.wind_direction) : null;
        if (sp != null) speeds.push(sp);
        if (dir != null) {
          dirs.push(dir);
          weights.push(sp ?? 0);
        }
        const g = s.wind_gust != null && !Number.isNaN(Number(s.wind_gust)) ? Number(s.wind_gust) : null;
        if (g != null) gustMax = gustMax == null ? g : Math.max(gustMax, g);
      }
    });
    if (!speeds.length) return { ...d, empty: true };
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const hd = dirs.length ? circularMeanDirectionWeighted(dirs, weights) : null;
    const range = hd != null ? directionRange80(dirs, hd) : null;
    return { ...d, mean, gustMax: gustMax != null && gustMax > mean ? gustMax : null, hd, range };
  });
}

function WindChart({ models, unit = "kmh" }) {
  const w = 800,
    h = 330,
    padL = 34,
    padR = 10,
    padT = 8;
  const plotW = w - padL - padR;
  const days = computeDailyWind(models).filter((d) => d.h1 - d.h0 > 0);
  const D = days.length;
  if (!D || days.every((d) => d.empty)) {
    return <div className="err">Bu modeller için rüzgar verisi yok.</div>;
  }

  const colW = plotW / D;
  const narrow = colW < 70;
  const R = Math.max(12, Math.min(34, colW * 0.4));
  const glyphY = padT + 36;
  const compassY = glyphY + 34 + 16;
  const barTop = compassY + 44;
  const barBot = h - 34;

  const unitLabel = unit === "kn" ? "kt" : "km/s";
  const step = unit === "kn" ? 10 : 20;
  const stormU = unit === "kn" ? 34 : 62;
  const dataMax = Math.max(
    0,
    ...days.filter((d) => !d.empty).map((d) => toWindUnit(d.gustMax ?? d.mean, unit))
  );
  let vmax = Math.max(step * 2, Math.ceil(dataMax / step) * step);
  if (dataMax >= stormU * 0.6) vmax = Math.max(vmax, Math.ceil((stormU + 1) / step) * step);
  const showStorm = stormU <= vmax;
  const yv = (v) => barBot - (Math.min(v, vmax) / vmax) * (barBot - barTop);
  const ticks = [];
  for (let v = 0; v <= vmax; v += step) ticks.push(v);

  const usedIdx = new Set(days.filter((d) => !d.empty).map((d) => beaufortIndex(d.mean)));
  const haloStyle = { paintOrder: "stroke", stroke: "var(--paper)", strokeWidth: 3 };

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        {Array.from(usedIdx).map((k) => (
          <pattern
            key={k}
            id={`wgust-${k}`}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="5" height="5" fill={BEAUFORT[k].color} fillOpacity="0.25" />
            <line x1="0" y1="0" x2="0" y2="5" stroke={BEAUFORT[k].color} strokeWidth="2" />
          </pattern>
        ))}
      </defs>

      {days.map((d, i) => (
        <line
          key={`wday-${d.key}`}
          x1={padL + i * colW}
          y1={padT}
          x2={padL + i * colW}
          y2={barBot}
          stroke="var(--line)"
          strokeDasharray="1 4"
          strokeLinecap="round"
          opacity={0.6}
        />
      ))}

      {ticks.map((v) => (
        <g key={`wtick-${v}`}>
          <line x1={padL} y1={yv(v)} x2={padL + plotW} y2={yv(v)} stroke="var(--line)" opacity={v ? 0.35 : 1} />
          <text className="axis-label" x="4" y={yv(v) + 3}>
            {v}
          </text>
        </g>
      ))}
      <text className="axis-label" x="4" y={barTop - 10}>
        {unitLabel}
      </text>

      {showStorm && (
        <line
          x1={padL}
          y1={yv(stormU)}
          x2={padL + plotW}
          y2={yv(stormU)}
          stroke={STORM_RED}
          strokeWidth="1.2"
          strokeDasharray="5 4"
          opacity={0.8}
        />
      )}

      {days.map((d, i) => {
        const cx = padL + colW * (i + 0.5);
        const p = parseTsiTime(models[0].series[d.h0]?.time);
        const dateText = p ? formatAxisDate(p.date) : d.key;
        const dayText = p ? formatWeekdayAbbr3(p.date) : "";
        const dayLabels = (
          <>
            <text className="axis-label" x={cx} y={h - 20} textAnchor="middle">
              {dateText}
            </text>
            <text className="axis-label" x={cx} y={h - 7} textAnchor="middle">
              {dayText}
            </text>
          </>
        );
        if (d.empty) return <g key={`wd-${d.key}`}>{dayLabels}</g>;

        const k = beaufortIndex(d.mean);
        const col = BEAUFORT[k].color;
        const meanU = toWindUnit(d.mean, unit);
        const gustU = d.gustMax != null ? toWindUnit(d.gustMax, unit) : null;
        const topU = gustU ?? meanU;
        const bw = Math.min(22, colW * 0.45);
        const storm = Math.max(d.mean, d.gustMax ?? 0) / 3.6 >= STORM_MS;
        const tip = polarPoint(cx, glyphY, R + 4, d.hd ?? 0);
        const meanTxt = Math.round(meanU);
        const gustTxt = gustU != null ? Math.round(gustU) : "—";
        const title =
          `${dateText} ${dayText}\n` +
          `Kademe: ${BEAUFORT[k].label} bofor\n` +
          (d.hd != null
            ? `Hakim yön: ${degreesToCompass(d.hd)} (${Math.round(d.hd)}°)\n` +
              `Yön aralığı: ${degreesToCompass(d.range[0])} – ${degreesToCompass(d.range[1])}\n`
            : "") +
          `Ortalama: ${formatOneDecimal(meanU)} ${unitLabel}\n` +
          `En yüksek hamle: ${gustU != null ? formatOneDecimal(gustU) + " " + unitLabel : "veri yok"}` +
          (storm ? "\n⚠ MGM fırtına eşiği (8 bofor) aşılıyor" : "");

        return (
          <g key={`wd-${d.key}`}>
            <title>{title}</title>
            <circle cx={cx} cy={glyphY} r={R} fill="none" stroke="var(--line)" strokeDasharray="2 3" />
            {d.hd != null && (
              <>
                <path
                  d={sectorPath(cx, glyphY, R, d.range[0], d.range[1])}
                  fill={col}
                  fillOpacity={0.9}
                  stroke="var(--paper)"
                  strokeWidth={1.5}
                />
                <line
                  x1={cx}
                  y1={glyphY}
                  x2={tip.x}
                  y2={tip.y}
                  stroke="var(--ink)"
                  strokeWidth={narrow ? 1.5 : 2}
                  strokeLinecap="round"
                />
              </>
            )}
            <circle cx={cx} cy={glyphY} r={narrow ? 1.8 : 2.5} fill="var(--ink)" />
            <text
              className="axis-label"
              x={cx}
              y={compassY}
              textAnchor="middle"
              style={{ fill: "var(--ink)", fontWeight: 500, fontSize: narrow ? 9 : 11 }}
            >
              {d.hd != null ? degreesToCompass(d.hd) : "—"}
            </text>

            {gustU != null && (
              <rect
                x={cx - bw / 2}
                y={yv(gustU)}
                width={bw}
                height={Math.max(0, yv(meanU) - yv(gustU))}
                fill={`url(#wgust-${k})`}
                rx={3}
              />
            )}
            <rect
              x={cx - bw / 2}
              y={yv(meanU) + (gustU != null ? 2 : 0)}
              width={bw}
              height={Math.max(1, barBot - yv(meanU) - (gustU != null ? 2 : 0))}
              fill={col}
              rx={3}
            />
            <text
              className="axis-label"
              x={cx}
              y={yv(topU) - 5}
              textAnchor="middle"
              style={{ ...haloStyle, fill: "var(--ink)", fontSize: narrow ? 9 : 11 }}
            >
              <tspan style={{ fontWeight: 500 }}>{meanTxt}</tspan>
              <tspan style={{ fill: "var(--ink-soft)" }}>{narrow ? `/${gustTxt}` : ` / ${gustTxt}`}</tspan>
            </text>
            {storm && (
              <text
                x={cx}
                y={yv(topU) - (narrow ? 17 : 20)}
                textAnchor="middle"
                className="axis-label"
                style={{ ...haloStyle, fill: STORM_RED, fontWeight: 600, fontSize: narrow ? 10 : 11 }}
              >
                {narrow ? "⚠" : "⚠ fırtına"}
              </text>
            )}
            {dayLabels}
          </g>
        );
      })}
    </svg>
  );
}

function WindLegend({ unit = "kmh" }) {
  const unitLabel = unit === "kn" ? "knot" : "km/s";
  return (
    <div style={{ marginTop: 10 }}>
      <div className="panel-sub" style={{ fontSize: 10, marginBottom: 4 }}>
        Günlük ortalama hız — bofor · {unitLabel} · çubuk: dolu = ortalama, taralı = en yüksek hamle
      </div>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {BEAUFORT.map((b) => (
          <div
            key={b.label}
            className="panel-sub"
            style={{ flex: "1 1 64px", textAlign: "center", fontSize: 9.5, lineHeight: 1.35, padding: "0 1px" }}
          >
            <div style={{ height: 10, borderRadius: 2, background: b.color, marginBottom: 3 }} />
            {b.label}
            <br />
            {unit === "kn" ? b.kn : b.kmh}
          </div>
        ))}
      </div>
      <div className="panel-sub" style={{ fontSize: 10, marginTop: 8 }}>
        <span style={{ color: STORM_RED }}>- - -</span> MGM fırtına eşiği: 8 bofor · 17.2 m/s ≈ 62 km/s ≈ 34 knot
        (kaynak: MGM Beaufort rüzgâr ıskalası)
      </div>
    </div>
  );
}
