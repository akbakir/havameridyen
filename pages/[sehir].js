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
  const [windStep, setWindStep] = useState(3);
  const [cloudStep, setCloudStep] = useState(3);
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

  // Rüzgar ve bulutluluk tablolarının adımı periyoda göre varsayılana döner
  // (Saatlik 1s, 3 gün 3s, 7/16 gün 6s)
  useEffect(() => {
    setWindStep(defaultWindStep(period));
    setCloudStep(defaultWindStep(period));
  }, [period]);

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
                <AgreeLegend models={forecast.models} param="temp" />
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
                <div className="panel-sub">
                  {status === "ok" ? `${forecast.models.length} model · saatlik ortalama hız, hamle ve yön` : "saatlik ortalama hız, hamle ve yön"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="unit-toggle">
                {WIND_STEPS.map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    className={windStep === hrs ? "active" : ""}
                    onClick={() => setWindStep(hrs)}
                  >
                    {hrs}s
                  </button>
                ))}
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
            </div>
            {status === "loading" && <div className="loading">Veri yükleniyor…</div>}
            {status === "error" && <div className="err">Veri alınamadı — bağlantını kontrol et.</div>}
            {status === "ok" && (
              <>
                <WindMatrix models={forecast.models} unit={windUnit} step={windStep} />
                <WindLegend unit={windUnit} />
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="panel-head-left">
                <div className="panel-title">Nem</div>
                <div className="panel-sub">
                  {status === "ok" ? `bağıl nem · % · ${forecast.models.length} model` : "bağıl nem · %"}
                </div>
              </div>
            </div>
            {status === "loading" && <div className="loading">Veri yükleniyor…</div>}
            {status === "error" && <div className="err">Veri alınamadı — bağlantını kontrol et.</div>}
            {status === "ok" && (
              <>
                <HumidityChart models={forecast.models} />
                <AgreeLegend models={forecast.models} param="humidity" />
                <CoverageNote models={forecast.models} field="humidity" />
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="panel-head-left">
                <div className="panel-title">Basınç</div>
                <div className="panel-sub">
                  {status === "ok"
                    ? `deniz seviyesi · hPa · ${forecast.models.length} model`
                    : "deniz seviyesi · hPa"}
                </div>
              </div>
            </div>
            {status === "loading" && <div className="loading">Veri yükleniyor…</div>}
            {status === "error" && <div className="err">Veri alınamadı — bağlantını kontrol et.</div>}
            {status === "ok" && (
              <>
                <PressureChart models={forecast.models} />
                <PressureLegend models={forecast.models} />
                <CoverageNote models={forecast.models} field="pressure" />
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="panel-head-left">
                <div className="panel-title">Bulutluluk</div>
                <div className="panel-sub">
                  {status === "ok" ? `${forecast.models.length} model · gökyüzünün kaplı oranı` : "gökyüzünün kaplı oranı"}
                </div>
              </div>
              <div className="unit-toggle">
                {WIND_STEPS.map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    className={cloudStep === hrs ? "active" : ""}
                    onClick={() => setCloudStep(hrs)}
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
                <CloudMatrix models={forecast.models} step={cloudStep} />
                <CloudLegend models={forecast.models} />
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

  const cellW = plotW / (n - 1);
  const showStrip = models.length > 1; // tek model seçiliyse karşılaştıracak bir şey yok

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h + (showStrip ? AGREE_STRIP_EXTRA : 0)}`}>
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
      <AgreeStrip models={models} param="temp" x={x} cellW={cellW} padL={padL} plotW={plotW} y={h + 4} />
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

function CoverageNote({ models, field = "temp" }) {
  const cov = computeCoverage(models, field);
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
// Rüzgar — model × saat tablosu
// Her satır bir model, her sütun bir saat (1/3/6 saatlik adım). Hücrede o saat için verilen
// ORTALAMA rüzgar hızı var (10 m; literatürde 10 dakikalık ortalama), hamle ise o saatteki en
// yüksek ani rüzgar. Hücre rengi = ortalama hızın bofor kademesi (MGM ıskalası),
// ok = rüzgarın estiği yön, büyük sayı = ortalama hız, küçük sayı = hamle. En alttaki "uyum" satırı modellerin o saatte
// yön ve hızda uyuşup uyuşmadığını gösterir.
// ---------------------------------------------------------------------------

const KN_PER_KMH = 0.539957;
const STORM_MS = 17.2; // MGM: 8 bofor (fırtına) alt sınırı — 17.2 m/s ≈ 62 km/s ≈ 34 knot
const STORM_KMH = STORM_MS * 3.6;
const STORM_RED = "#8F2420"; // uyarı çerçevesi ve rozeti
const NOW_TEAL = "#14574C"; // "şimdi" sütununun çerçevesi (turkuazın bir ton koyusu)

// Uyum kriterleri (knot cinsinden)
const WIND_CALM_KT = 3; // bu hızın altındaki modeller yön karşılaştırmasına katılmaz
const WIND_DIR_PARTIAL = 90; // en büyük yön farkı ≥ 90° → en az "kısmen"
const WIND_DIR_SPLIT = 135; // ≥ 135° → "ayrışıyor"
const WIND_SPD_PARTIAL = 10; // en büyük hız farkı ≥ 10 kt → en az "kısmen"
const WIND_SPD_SPLIT = 20; // ≥ 20 kt → "ayrışıyor"
const WIND_STEPS = [1, 3, 6];

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

function numOrNull(v) {
  return v != null && !Number.isNaN(Number(v)) ? Number(v) : null;
}

// İki yön arasındaki en küçük açı farkı (0–180°)
function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Varsayılan adım: Saatlik → 1s, 3 gün → 3s, 7/16 gün → 6s
function defaultWindStep(period) {
  if (period === "hourly") return 1;
  if (period === "3d") return 3;
  return 6;
}

// Bir saat için modeller arası uyum. Dönüş: { level: "ok"|"partial"|"split"|"na", reasons: [...] }
function computeWindAgreementAt(models, i) {
  const pts = models
    .map((m) => {
      const s = m.series[i];
      const spd = numOrNull(s?.wind_speed);
      if (spd == null) return null;
      return { label: m.label, kt: spd * KN_PER_KMH, dir: numOrNull(s?.wind_direction) };
    })
    .filter(Boolean);
  if (pts.length < 2) return { level: "na", reasons: ["Karşılaştırma için en az 2 modelin verisi gerekiyor."] };

  const reasons = [];

  // Hız farkı
  const slow = pts.reduce((a, b) => (b.kt < a.kt ? b : a));
  const fast = pts.reduce((a, b) => (b.kt > a.kt ? b : a));
  const spdSpread = fast.kt - slow.kt;

  // Yön farkı (sakin modeller hariç)
  const calm = pts.filter((p) => p.kt < WIND_CALM_KT || p.dir == null);
  const dirPts = pts.filter((p) => p.kt >= WIND_CALM_KT && p.dir != null);
  let dirSpread = 0;
  let pair = null;
  for (let a = 0; a < dirPts.length; a++) {
    for (let b = a + 1; b < dirPts.length; b++) {
      const d = angleDiff(dirPts[a].dir, dirPts[b].dir);
      if (d > dirSpread) {
        dirSpread = d;
        pair = [dirPts[a], dirPts[b]];
      }
    }
  }

  const dirBad = dirSpread >= WIND_DIR_PARTIAL;
  const spdBad = spdSpread >= WIND_SPD_PARTIAL;
  const split = (dirBad && spdBad) || dirSpread >= WIND_DIR_SPLIT || spdSpread >= WIND_SPD_SPLIT;
  const level = split ? "split" : dirBad || spdBad ? "partial" : "ok";

  if (pair) {
    reasons.push(
      `Yön: ${pair[0].label} ${degreesToCompass(pair[0].dir)} ↔ ${pair[1].label} ${degreesToCompass(pair[1].dir)}, fark ${Math.round(dirSpread)}°` +
        (dirBad ? ` (≥ ${WIND_DIR_PARTIAL}°)` : "")
    );
  } else {
    reasons.push("Yön: karşılaştırılacak yeterli model yok (rüzgar sakin).");
  }
  reasons.push(
    `Ortalama hız: ${slow.label} ${Math.round(slow.kt)} kt ↔ ${fast.label} ${Math.round(fast.kt)} kt, fark ${Math.round(spdSpread)} kt` +
      (spdBad ? ` (≥ ${WIND_SPD_PARTIAL} kt)` : "")
  );
  if (calm.length) {
    reasons.push(`${joinTr(calm.map((p) => p.label))} sakin (< ${WIND_CALM_KT} kt); yön karşılaştırmasına katılmadı.`);
  }
  return { level, reasons };
}

// Rüzgar tablosu, sıcaklık şeridi ve (ileride) diğer parametreler aynı uyum dilini kullanır.
const AGREE_STYLE = {
  ok: { bg: "#DDE0DB", ink: "var(--ink)", mark: "✓", text: "hemfikir" },
  partial: { bg: "#F0C98A", ink: "var(--ink)", mark: "~", text: "kısmen" },
  split: { bg: "var(--amber)", ink: "#FFFFFF", mark: "≠", text: "ayrışıyor" },
  na: { bg: "transparent", ink: "var(--ink-faint)", mark: "·", text: "veri yok" },
};

// ---------------------------------------------------------------------------
// Model uyumu — ortak altyapı
// Sıcaklık, nem, basınç ve bulutlulukta aynı soru sorulur: o saatte en düşük ve en yüksek
// modelin farkı ("aralık") ne kadar? Eşikler parametreye göre değişir, dil aynıdır:
// ✓ hemfikir · ~ kısmen · ≠ ayrışıyor. Ortalama/ortanca ALINMAZ — amaç tek bir değer
// üretmek değil, modellerin nerede ayrıştığını göstermektir.
// (Rüzgarda aralık yerine yön + hız birlikte değerlendirilir: computeWindAgreementAt.)
// ---------------------------------------------------------------------------

const AGREE_PARAMS = {
  temp: {
    key: "temp",
    partial: 2,
    split: 4,
    thPartial: "2 °C",
    thMid: "2–4 °C",
    thSplit: "4 °C",
    pair: "en sıcak ve en soğuk model",
    fmt: (v) => `${formatOneDecimal(v)}°`,
    fmtSpread: (v) => `${formatOneDecimal(v)}°`,
  },
  humidity: {
    key: "humidity",
    partial: 10,
    split: 20,
    thPartial: "%10",
    thMid: "%10–20",
    thSplit: "%20",
    pair: "en nemli ve en kuru model",
    fmt: (v) => `%${Math.round(v)}`,
    fmtSpread: (v) => `%${Math.round(v)}`,
  },
  pressure: {
    key: "pressure",
    partial: 2,
    split: 4,
    thPartial: "2 hPa",
    thMid: "2–4 hPa",
    thSplit: "4 hPa",
    pair: "en yüksek ve en düşük basınç veren model",
    fmt: (v) => `${formatOneDecimal(v)} hPa`,
    fmtSpread: (v) => `${formatOneDecimal(v)} hPa`,
  },
  cloud: {
    key: "cloud_cover",
    partial: 25,
    split: 50,
    thPartial: "%25",
    thMid: "%25–50",
    thSplit: "%50",
    pair: "en kapalı ve en açık model",
    fmt: (v) => `%${Math.round(v)}`,
    fmtSpread: (v) => `%${Math.round(v)}`,
  },
};

const STRIP_MIN_BLOCK = 24; // bir uyum dilimi en az bu kadar geniş çizilir (viewBox birimi)
const STRIP_STEPS = [1, 3, 6, 12, 24]; // dilim uzunluğu saat cinsinden; periyoda göre seçilir
const AGREE_STRIP_H = 18;
const AGREE_STRIP_EXTRA = 30; // şerit için viewBox'a eklenen yükseklik

// Şerit dilimleri — uyum şeridi ve basınç eğilim şeridi tarafından paylaşılır.
// Seri sabit uzunlukta dilimlere bölünür (STRIP_STEPS içinden, dilim en az STRIP_MIN_BLOCK
// genişliğinde olacak şekilde; dilimler 00:00 TSİ'ye hizalıdır çünkü seri 00:00'da başlar).
// Her dilimi rank()'i en yüksek olan saat temsil eder — yani en dikkat çekici değer
// ortalama alınarak yumuşatılmaz. Aynı groupKey()'e sahip komşu dilimler tek blokta birleşir.
function buildStripSegments(items, cellW, rank, groupKey) {
  const n = items.length;
  const step = STRIP_STEPS.find((k) => k * cellW >= STRIP_MIN_BLOCK) ?? STRIP_STEPS[STRIP_STEPS.length - 1];
  const out = [];
  for (let i = 0; i < n; i += step) {
    const to = Math.min(n - 1, i + step - 1);
    let peak = items[i];
    for (let k = i; k <= to; k++) {
      if (rank(items[k]) > rank(peak)) peak = items[k];
    }
    const last = out[out.length - 1];
    if (last && groupKey(last.peak) === groupKey(peak)) {
      last.to = to;
      if (rank(peak) > rank(last.peak)) last.peak = peak;
    } else {
      out.push({ from: i, to, peak });
    }
  }
  return out;
}

function computeSpreadAgreementAt(models, i, param) {
  const cfg = AGREE_PARAMS[param];
  const pts = models
    .map((m) => {
      const v = numOrNull(m.series[i]?.[cfg.key]);
      return v == null ? null : { label: m.label, v };
    })
    .filter(Boolean);
  if (pts.length < 2) return { level: "na", spread: 0, count: pts.length };
  const lo = pts.reduce((a, b) => (b.v < a.v ? b : a));
  const hi = pts.reduce((a, b) => (b.v > a.v ? b : a));
  const spread = hi.v - lo.v;
  const level = spread < cfg.partial ? "ok" : spread <= cfg.split ? "partial" : "split";
  return { level, spread, lo, hi, count: pts.length };
}

// Grafiklerin altındaki ince uyum şeridi (SVG parçası — çağıran <svg>'nin içine konur).
// Saat saat sınıflandırılsaydı aralık eşiğin iki yanında gidip gelir (1.9 °C ✓, 2.1 °C ~) ve
// şerit onlarca minik bloğa parçalanırdı; bunun yerine buildStripSegments kullanılır.
// Pratikte: 3 gün → 3 saatlik dilim, 7 gün → 6–12 saatlik, 16 gün → günlük.
function AgreeStrip({ models, param, x, cellW, padL, plotW, y, h = AGREE_STRIP_H }) {
  const cfg = AGREE_PARAMS[param];
  const n = models[0]?.series.length || 0;
  if (models.length < 2 || n < 2) return null; // tek model: karşılaştıracak bir şey yok

  const levels = models[0].series.map((_, i) => computeSpreadAgreementAt(models, i, param));
  const segments = buildStripSegments(
    levels,
    cellW,
    (l) => (l.level === "na" ? -1 : l.spread),
    (l) => l.level
  );

  return (
    <>
      <text className="axis-label" x="4" y={y + h / 2 + 3.4}>
        uyum
      </text>
      {segments.map((b) => {
        const x0 = Math.max(padL, x(b.from) - cellW / 2);
        const x1 = Math.min(padL + plotW, x(b.to) + cellW / 2);
        const bw = x1 - x0 - 2;
        if (bw <= 1) return null;
        const peak = b.peak;
        const st = AGREE_STYLE[peak.level];
        // Etiket bloğa sığdığı kadar uzun yazılır; sığmazsa yalnız işaret kalır.
        const wide = `${st.mark} ${st.text} (en çok ${cfg.fmtSpread(peak.spread)})`;
        const mid = `${st.mark} ${st.text}`;
        const fits = (t) => bw >= t.length * 5.2 + 10;
        const label = peak.lo && fits(wide) ? wide : fits(mid) ? mid : bw >= 13 ? st.mark : "";
        const from = parseTsiTime(models[0].series[b.from]?.time);
        const to = parseTsiTime(models[0].series[b.to]?.time);
        const range =
          from && to
            ? b.from === b.to
              ? `${formatAxisDate(from.date)} ${formatHourLabel(from.hour)}`
              : `${formatAxisDate(from.date)} ${formatHourLabel(from.hour)} – ${formatAxisDate(to.date)} ${formatHourLabel(to.hour)}`
            : "";
        const tip = peak.lo
          ? `${range} TSİ · modeller ${st.text}. En büyük aralık ${cfg.fmtSpread(peak.spread)}: ` +
            `${peak.lo.label} ${cfg.fmt(peak.lo.v)} ↔ ${peak.hi.label} ${cfg.fmt(peak.hi.v)}` +
            (peak.count < models.length ? ` (${peak.count} modelin verisi var)` : "")
          : `${range} TSİ · karşılaştırma için en az 2 modelin verisi gerekiyor.`;
        return (
          <g key={`agree-${param}-${b.from}`}>
            <title>{tip}</title>
            <rect x={x0 + 1} y={y} width={bw} height={h} rx={3} fill={st.bg} />
            {label && (
              <text
                x={x0 + 1 + bw / 2}
                y={y + h / 2 + 3.4}
                textAnchor="middle"
                className="axis-label"
                style={{ fill: st.ink, fontSize: 9.5 }}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

function AgreeLegend({ models, param }) {
  if (!models || models.length < 2) return null;
  const c = AGREE_PARAMS[param];
  return (
    <div className="panel-sub" style={{ marginTop: 6, fontSize: 11 }}>
      Uyum şeridi — {c.pair} arasındaki aynı saatteki fark: ✓ hemfikir ({"<"} {c.thPartial}) · ~ kısmen ({c.thMid}) ·
      ≠ ayrışıyor ({">"} {c.thSplit}). Her dilim o dilimdeki en büyük farka göre renklenir; şeridin üzerine gelince
      hangi modellerin ayrıştığı yazar.
    </div>
  );
}

function WindArrow({ dir, color }) {
  // Ok rüzgarın ESTİĞİ yönü gösterir (geldiği yön + 180°)
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ transform: `rotate(${dir + 180}deg)`, display: "block", margin: "0 auto" }} aria-hidden="true">
      <path d="M12 3 L18 13 H13.5 V21 H10.5 V13 H6 Z" fill={color} />
    </svg>
  );
}

// Fırtına eşiği aşılan hücrenin sağ üst köşesindeki uyarı rozeti
function StormBadge() {
  return (
    <span
      aria-label="Fırtına eşiği aşılıyor"
      style={{
        position: "absolute",
        top: 1,
        right: 1,
        width: 13,
        height: 13,
        borderRadius: 3,
        background: STORM_RED,
        color: "#FFFFFF",
        fontSize: 10,
        lineHeight: "13px",
        textAlign: "center",
        fontWeight: 700,
      }}
    >
      !
    </span>
  );
}

function WindMatrix({ models, unit = "kmh", step = 1 }) {
  const scrollRef = useRef(null);
  const [info, setInfo] = useState(null);
  const series0 = models[0]?.series || [];
  const cols = [];
  series0.forEach((s, i) => {
    const p = parseTsiTime(s.time);
    if (p && p.hour % step === 0) cols.push({ i, p });
  });
  const nowIdx = findNowIndex(series0);
  const nowCol = nowIdx >= 0 ? Math.floor(nowIdx / step) * step : -1;
  const unitLabel = unit === "kn" ? "kt" : "km/s";
  const agreement = cols.map((c) => computeWindAgreementAt(models, c.i));

  // Açılışta ve adım değişince tablo "şimdi"ye kaydırılır
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const el = box.querySelector('[data-now="1"]');
    if (el) box.scrollLeft = Math.max(0, el.offsetLeft - 110);
  }, [step, models.length, series0.length]);

  const cellW = 46;
  const stickyTd = {
    position: "sticky",
    left: 0,
    zIndex: 1,
    background: "var(--paper)",
    boxShadow: "3px 0 0 var(--paper)",
    textAlign: "left",
    padding: "0 8px 0 0",
    whiteSpace: "nowrap",
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: 11,
  };

  function timeText(p) {
    return `${formatAxisDate(p.date)} ${formatWeekdayAbbr3(p.date)} ${formatHourLabel(p.hour)}`;
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div ref={scrollRef} style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 2, fontFamily: '"IBM Plex Mono", monospace', width: "auto" }}>
          <thead>
            <tr>
              <th style={{ ...stickyTd, fontSize: 10, color: "var(--ink-soft)", fontWeight: 400 }}>TSİ</th>
              {cols.map((c, k) => {
                const newDay = k === 0 || c.p.hour < step || cols[k - 1].p.date.getUTCDate() !== c.p.date.getUTCDate();
                const isNow = c.i === nowCol;
                return (
                  <th
                    key={c.i}
                    style={{
                      minWidth: cellW,
                      fontSize: 10,
                      fontWeight: isNow ? 600 : 400,
                      color: isNow ? NOW_TEAL : "var(--ink-soft)",
                      textAlign: "center",
                      borderLeft: newDay && k > 0 ? "1px dashed var(--line)" : "none",
                      lineHeight: 1.25,
                      padding: "0 0 2px",
                      verticalAlign: "bottom",
                    }}
                  >
                    {newDay ? (
                      <>
                        {formatAxisDate(c.p.date)} {formatWeekdayAbbr3(c.p.date)}
                        <br />
                      </>
                    ) : (
                      <br />
                    )}
                    {String(c.p.hour).padStart(2, "0")}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td style={stickyTd}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: m.color, marginRight: 6 }} />
                  {m.label}
                </td>
                {cols.map((c) => {
                  const s = m.series[c.i];
                  const spd = numOrNull(s?.wind_speed);
                  const dir = numOrNull(s?.wind_direction);
                  const gust = numOrNull(s?.wind_gust);
                  const isNow = c.i === nowCol;
                  if (spd == null) {
                    return (
                      <td
                        key={c.i}
                        data-now={isNow ? "1" : undefined}
                        style={{ width: cellW, height: 44, textAlign: "center", borderRadius: 4, border: "1px dashed var(--line)", color: "var(--ink-faint)", fontSize: 10 }}
                        title={`${m.label} · ${timeText(c.p)}: veri yok`}
                      >
                        —
                      </td>
                    );
                  }
                  const k = beaufortIndex(spd);
                  const ink = k >= 5 ? "#FFFFFF" : "var(--ink)";
                  const storm = Math.max(spd, gust ?? 0) >= STORM_KMH;
                  const detail =
                    `${m.label} · ${timeText(c.p)} TSİ\n` +
                    `Ortalama hız: ${formatOneDecimal(toWindUnit(spd, unit))} ${unitLabel} (${BEAUFORT[k].label} bofor)\n` +
                    `Hamle (en yüksek ani rüzgar): ${gust != null ? formatOneDecimal(toWindUnit(gust, unit)) + " " + unitLabel : "veri yok"}\n` +
                    `Yön: ${dir != null ? `${degreesToCompass(dir)} (${Math.round(dir)}°, rüzgarın geldiği yön)` : "veri yok"}` +
                    (storm ? "\n⚠ MGM fırtına eşiği (8 bofor) aşılıyor" : "");
                  return (
                    <td
                      key={c.i}
                      data-now={isNow ? "1" : undefined}
                      title={detail}
                      onClick={() => setInfo(detail)}
                      style={{
                        width: cellW,
                        height: 44,
                        textAlign: "center",
                        verticalAlign: "middle",
                        borderRadius: 4,
                        background: BEAUFORT[k].color,
                        color: ink,
                        cursor: "pointer",
                        lineHeight: 1.1,
                        position: "relative",
                        boxShadow: storm
                          ? `inset 0 0 0 2px ${STORM_RED}`
                          : isNow
                          ? `inset 0 0 0 2px ${NOW_TEAL}`
                          : "none",
                      }}
                    >
                      {storm && <StormBadge />}
                      {dir != null && <WindArrow dir={dir} color={ink} />}
                      <div style={{ fontSize: 11, fontWeight: 500 }}>{Math.round(toWindUnit(spd, unit))}</div>
                      <div style={{ fontSize: 9, opacity: 0.8 }}>{gust != null ? Math.round(toWindUnit(gust, unit)) : "—"}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td style={{ ...stickyTd, color: "var(--ink-soft)" }}>uyum</td>
              {cols.map((c, k) => {
                const a = agreement[k];
                const st = AGREE_STYLE[a.level];
                const text = `${timeText(c.p)} TSİ — modeller ${st.text}\n` + a.reasons.join("\n");
                return (
                  <td
                    key={c.i}
                    title={text}
                    onClick={() => setInfo(text)}
                    style={{
                      width: cellW,
                      height: 22,
                      textAlign: "center",
                      borderRadius: 4,
                      background: st.bg,
                      color: st.ink,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {st.mark}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <div
        className="panel-sub"
        style={{ fontSize: 11, marginTop: 6, minHeight: 16, whiteSpace: "pre-line", color: info ? "var(--ink)" : "var(--ink-soft)" }}
      >
        {info || "Ayrıntı için bir hücrenin üzerine gel ya da dokun. Tablo yatay kaydırılabilir."}
      </div>
    </div>
  );
}

function WindLegend({ unit = "kmh" }) {
  const unitLabel = unit === "kn" ? "knot" : "km/s";
  return (
    <div style={{ marginTop: 10 }}>
      <div className="panel-sub" style={{ fontSize: 10, marginBottom: 4 }}>
        Hücre rengi — ortalama rüzgar hızı (bofor) · {unitLabel} · ok: rüzgarın estiği yön · üstte ortalama hız, altta hamle (o saatteki en yüksek ani rüzgar)
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
      <div className="panel-sub" style={{ fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>
        <strong style={{ fontWeight: 600 }}>Uyum:</strong> ✓ hemfikir · ~ kısmen (yön farkı ≥ {WIND_DIR_PARTIAL}° veya hız farkı ≥{" "}
        {WIND_SPD_PARTIAL} kt) · ≠ ayrışıyor (ikisi birden, ya da ≥ {WIND_DIR_SPLIT}° / ≥ {WIND_SPD_SPLIT} kt). {WIND_CALM_KT} kt
        altındaki sakin rüzgarda yön karşılaştırılmaz.
        <br />
        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, border: `2px solid ${NOW_TEAL}`, marginRight: 4, verticalAlign: -1 }} />
        Koyu turkuaz çerçeve: şu anki saat.
        <br />
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: 3,
            background: STORM_RED,
            color: "#FFFFFF",
            fontSize: 9,
            lineHeight: "12px",
            textAlign: "center",
            fontWeight: 700,
            marginRight: 4,
            verticalAlign: -1,
          }}
        >
          !
        </span>
        Kırmızı çerçeve ve uyarı rozeti: MGM fırtına eşiği aşılıyor — 8 bofor · 17.2 m/s ≈ 62 km/s ≈ 34 knot (kaynak: MGM
        Beaufort rüzgâr ıskalası)
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nem (bağıl nem, %)
// Eksen HER ZAMAN 0–100: otomatik ölçek nemde yanıltıcıdır (%58–%64 arası bir gün,
// dar eksende dramatik bir dalgalanma gibi görünür). Arka planda iki referans bant:
// %85 üstü doygunluğa yakın (sis / çiy / yoğuşma), %30 altı kuru.
// Not: ECMWF IFS 2 m bağıl nemi ham yayınlamıyor; değer sıcaklık + çiy noktasından
// hesaplanıyor (bkz. lib/forecast.js → relativeHumidityFrom).
// ---------------------------------------------------------------------------

const RH_WET = 85; // bu değerin üstü "doygunluğa yakın"
const RH_DRY = 30; // bu değerin altı "kuru"

function HumidityChart({ models }) {
  const w = 800,
    h = 236,
    padL = 34,
    padR = 10,
    padT = 14,
    padB = 44;
  const plotW = w - padL - padR,
    plotH = h - padT - padB;

  const n = models[0]?.series.length || 0;
  const hasAny = models.some((m) => m.series.some((s) => s.humidity != null));
  if (!hasAny || n < 2) {
    return <div className="err">Bu modeller için nem verisi yok.</div>;
  }

  const x = (i) => padL + (i / (n - 1)) * plotW;
  const y = (v) => padT + plotH - (v / 100) * plotH;
  const cellW = plotW / (n - 1);
  const timeAxis = buildTimeAxis(models[0].series, x);
  const cov = computeCoverage(models, "humidity");

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h + AGREE_STRIP_EXTRA}`}>
      <rect x={padL} y={y(100)} width={plotW} height={y(RH_WET) - y(100)} fill="var(--navy)" opacity={0.09} />
      <rect x={padL} y={y(RH_DRY)} width={plotW} height={y(0) - y(RH_DRY)} fill="var(--amber)" opacity={0.08} />
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
      {[0, 25, 50, 75, 100].map((v) => (
        <line
          key={`hgrid-${v}`}
          x1={padL}
          y1={y(v)}
          x2={padL + plotW}
          y2={y(v)}
          stroke="var(--line)"
          strokeWidth="1"
          opacity={0.3}
        />
      ))}
      {renderTimeAxis(timeAxis, padT, padT + plotH, h - 30, h - 17, h - 5)}
      {[0, 25, 50, 75, 100].map((v) => (
        <text key={`hlab-${v}`} className="axis-label" x="4" y={y(v) + 3}>
          %{v}
        </text>
      ))}
      <text className="axis-label" x={padL + 6} y={y(93)} style={{ fill: "var(--navy)" }}>
        doygunluğa yakın — sis / çiy
      </text>
      <text className="axis-label" x={padL + 6} y={y(12)} style={{ fill: "var(--amber)" }}>
        kuru
      </text>
      {models.map((m) => {
        const pts = m.series
          .map((s, i) => (s.humidity != null ? `${x(i)},${y(s.humidity)}` : null))
          .filter(Boolean)
          .join(" ");
        if (!pts) return null;
        return (
          <polyline
            key={m.id}
            className={"model-line" + (m.dashed ? " dashed" : "")}
            stroke={m.color}
            points={pts}
          />
        );
      })}
      <AgreeStrip models={models} param="humidity" x={x} cellW={cellW} padL={padL} plotW={plotW} y={h + 4} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Basınç (deniz seviyesine indirgenmiş, hPa)
// Kullanıcıyı ilgilendiren mutlak değer değil DEĞİŞİM HIZIDIR: 3 saatte 2 hPa'dan hızlı
// bir düşüş havanın bozulduğunu, hızlı yükseliş açtığını söyler (denizcilikte klasik eşik).
// Bu yüzden çizgilerin altında iki şerit var: üstte eğilim (3 saatlik değişimin model
// ortancası), altta her zamanki uyum şeridi.
// Neden pressure_msl: her modelin kendi yükselti haritası farklı; yüzey basıncını
// karşılaştırmak modelleri değil modellerin rakımını karşılaştırmak olurdu.
// ---------------------------------------------------------------------------

const PRESSURE_STD = 1013.25; // standart atmosfer
const PRESSURE_TICK_STEPS = [1, 2, 5, 10, 20, 25, 50];
const TREND_HOURS = 3;
const TREND_FAST = 2; // |değişim| ≥ 2 hPa / 3 saat → hızlı
const TREND_FLAT = 0.5; // |değişim| < 0.5 hPa / 3 saat → sabit
const TREND_SCALE = [
  { key: "fastDown", color: "#C2622A", label: `hızlı düşüş (≤ −${TREND_FAST} hPa/${TREND_HOURS}s)` },
  { key: "down", color: "#E0B080", label: "düşüş" },
  { key: "flat", color: "#DDE0DB", label: `sabit (±${TREND_FLAT})` },
  { key: "up", color: "#9CBFB6", label: "yükseliş" },
  { key: "fastUp", color: "#1E7A6B", label: `hızlı yükseliş (≥ +${TREND_FAST} hPa/${TREND_HOURS}s)` },
];
const TREND_COLOR = Object.fromEntries(TREND_SCALE.map((t) => [t.key, t.color]));

function trendKey(d) {
  if (d <= -TREND_FAST) return "fastDown";
  if (d < -TREND_FLAT) return "down";
  if (d >= TREND_FAST) return "fastUp";
  if (d > TREND_FLAT) return "up";
  return "flat";
}

// i. saatte modellerin 3 saatlik basınç değişimi: ortanca + modeller aynı yönde mi.
function pressureTrendAt(models, i) {
  const j = Math.max(0, i - TREND_HOURS);
  const ds = models
    .map((m) => {
      const a = numOrNull(m.series[i]?.pressure);
      const b = numOrNull(m.series[j]?.pressure);
      return a == null || b == null ? null : a - b;
    })
    .filter((v) => v != null)
    .sort((a, b) => a - b);
  if (!ds.length) return null;
  const median = ds[Math.floor(ds.length / 2)];
  // Yönde uzlaşı: ya hepsi aynı işaretli, ya da ortanca zaten "sabit" bandında.
  const sameWay = ds[0] > 0 || ds[ds.length - 1] < 0 || Math.abs(median) < TREND_FLAT;
  return { median, sameWay, n: ds.length };
}

function PressureChart({ models }) {
  const w = 800,
    h = 236,
    padL = 44, // 4 haneli hPa etiketleri + "eğilim" satır başlığı için diğer grafiklerden geniş
    padR = 10,
    padT = 14,
    padB = 44;
  const plotW = w - padL - padR,
    plotH = h - padT - padB;
  const trendY = h + 3,
    trendH = 16;
  const agreeY = trendY + trendH + 3;

  const n = models[0]?.series.length || 0;
  const allVals = models.flatMap((m) => m.series.map((s) => s.pressure)).filter((v) => v != null);
  if (!allVals.length || n < 2) {
    return <div className="err">Bu modeller için basınç verisi yok.</div>;
  }

  // Eksen adımı veri aralığına göre seçilir: sabit 2 hPa adım uzun periyotlarda eksen
  // etiketlerini üst üste bindiriyordu.
  const rawSpan = Math.max(2, Math.max(...allVals) - Math.min(...allVals));
  const tickStep =
    PRESSURE_TICK_STEPS.find((k) => rawSpan / k <= 9) ?? PRESSURE_TICK_STEPS[PRESSURE_TICK_STEPS.length - 1];
  const min = Math.floor(Math.min(...allVals) / tickStep) * tickStep;
  const max = Math.ceil(Math.max(...allVals) / tickStep) * tickStep;
  const span = max - min || tickStep;
  const x = (i) => padL + (i / (n - 1)) * plotW;
  const y = (v) => padT + plotH - ((v - min) / span) * plotH;
  const cellW = plotW / (n - 1);
  const ticks = [];
  for (let v = min; v <= max; v += tickStep) ticks.push(v);
  const timeAxis = buildTimeAxis(models[0].series, x);
  const cov = computeCoverage(models, "pressure");

  // Eğilim şeridi uyum şeridiyle aynı dilimleri kullanır; her dilimi o dilimdeki EN BELİRGİN
  // değişim temsil eder. Saat saat çizilseydi uzun periyotlarda ince çizgilerden bir tarama
  // deseni çıkardı.
  const trends = models[0].series.map((_, i) => pressureTrendAt(models, i));
  const trendRuns = buildStripSegments(
    trends,
    cellW,
    (t) => (t ? Math.abs(t.median) : -1),
    (t) => (t ? `${trendKey(t.median)}|${t.sameWay}` : "na")
  );

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${agreeY + AGREE_STRIP_H + 4}`}>
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
      {ticks.map((v) => (
        <line
          key={`pgrid-${v}`}
          x1={padL}
          y1={y(v)}
          x2={padL + plotW}
          y2={y(v)}
          stroke="var(--line)"
          strokeWidth="1"
          opacity={0.28}
        />
      ))}
      {PRESSURE_STD > min && PRESSURE_STD < max && (
        <>
          <line
            x1={padL}
            y1={y(PRESSURE_STD)}
            x2={padL + plotW}
            y2={y(PRESSURE_STD)}
            stroke="var(--ink-soft)"
            strokeWidth="1.25"
            opacity={0.6}
          />
          <text className="axis-label" x={padL + plotW - 4} y={y(PRESSURE_STD) - 4} textAnchor="end">
            1013.25 hPa — standart atmosfer
          </text>
        </>
      )}
      {renderTimeAxis(timeAxis, padT, padT + plotH, h - 30, h - 17, h - 5)}
      {ticks.map((v) => (
        <text key={`plab-${v}`} className="axis-label" x="2" y={y(v) + 3}>
          {v}
        </text>
      ))}
      {models.map((m) => {
        const pts = m.series
          .map((s, i) => (s.pressure != null ? `${x(i)},${y(s.pressure)}` : null))
          .filter(Boolean)
          .join(" ");
        if (!pts) return null;
        return (
          <polyline
            key={m.id}
            className={"model-line" + (m.dashed ? " dashed" : "")}
            stroke={m.color}
            points={pts}
          />
        );
      })}
      <text className="axis-label" x="4" y={trendY + trendH / 2 + 3.2}>
        eğilim
      </text>
      {trendRuns.map((r) => {
        const t = r.peak;
        if (!t) return null;
        const x0 = Math.max(padL, x(r.from) - cellW / 2);
        const x1 = Math.min(padL + plotW, x(r.to) + cellW / 2);
        if (x1 - x0 <= 0) return null;
        const from = parseTsiTime(models[0].series[r.from]?.time);
        const to = parseTsiTime(models[0].series[r.to]?.time);
        const range =
          from && to
            ? `${formatAxisDate(from.date)} ${formatHourLabel(from.hour)} – ${formatAxisDate(to.date)} ${formatHourLabel(to.hour)}`
            : "";
        const tip =
          `${range} TSİ · ${TREND_HOURS} saatlik değişim (model ortancası), en belirgin ` +
          `${t.median > 0 ? "+" : ""}${formatOneDecimal(t.median)} hPa` +
          (t.sameWay ? "" : " · modeller değişimin yönünde ayrışıyor");
        return (
          <g key={`trend-${r.from}`}>
            <title>{tip}</title>
            <rect
              x={x0}
              y={trendY}
              width={x1 - x0}
              height={trendH}
              fill={TREND_COLOR[trendKey(t.median)]}
              opacity={t.sameWay ? 1 : 0.45}
            />
          </g>
        );
      })}
      <AgreeStrip models={models} param="pressure" x={x} cellW={cellW} padL={padL} plotW={plotW} y={agreeY} />
    </svg>
  );
}

function PressureLegend({ models }) {
  return (
    <>
      <div
        className="panel-sub"
        style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "center", marginTop: 8, fontSize: 11 }}
      >
        <span style={{ color: "var(--ink-soft)" }}>eğilim:</span>
        {TREND_SCALE.map((t) => (
          <span key={t.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 10, borderRadius: 2, background: t.color, display: "inline-block" }} />
            {t.label}
          </span>
        ))}
      </div>
      <div className="panel-sub" style={{ marginTop: 4, fontSize: 11 }}>
        Eğilim şeridi son {TREND_HOURS} saatteki değişimin model ortancasıdır; modeller değişimin yönünde ayrışıyorsa
        renk soluklaşır. Değerler deniz seviyesine indirgenmiştir.
      </div>
      <AgreeLegend models={models} param="pressure" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Bulutluluk — model × saat matrisi
// 7 modeli %0 ile %100 arasında zıplayan çizgilerle göstermek okunmuyor; ECMWF kendi
// meteogramında bile bunu kutularla veriyor. Rüzgar tablosuyla aynı desen kullanılır:
// hücre rengi kapalılık kademesi (MGM'nin açık / az bulutlu / parçalı bulutlu / çok bulutlu /
// kapalı sınıflandırması), sayı yüzde, en altta uyum satırı.
// ---------------------------------------------------------------------------

const CLOUD_SCALE = [
  { min: 0, color: "#F1F4EF", ink: "var(--ink)", label: "açık", range: "%0–10" },
  { min: 10, color: "#DDE3DE", ink: "var(--ink)", label: "az bulutlu", range: "%10–30" },
  { min: 30, color: "#BFC8C3", ink: "var(--ink)", label: "parçalı bulutlu", range: "%30–60" },
  { min: 60, color: "#8E9B96", ink: "#FFFFFF", label: "çok bulutlu", range: "%60–90" },
  { min: 90, color: "#63706B", ink: "#FFFFFF", label: "kapalı", range: "%90–100" },
];

function cloudIndex(v) {
  let k = 0;
  CLOUD_SCALE.forEach((c, i) => {
    if (v >= c.min) k = i;
  });
  return k;
}

function CloudMatrix({ models, step = 1 }) {
  const scrollRef = useRef(null);
  const [info, setInfo] = useState(null);
  const series0 = models[0]?.series || [];
  const cols = [];
  series0.forEach((s, i) => {
    const p = parseTsiTime(s.time);
    if (p && p.hour % step === 0) cols.push({ i, p });
  });
  const nowIdx = findNowIndex(series0);
  const nowCol = nowIdx >= 0 ? Math.floor(nowIdx / step) * step : -1;
  const agreement = cols.map((c) => computeSpreadAgreementAt(models, c.i, "cloud"));

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const el = box.querySelector('[data-now="1"]');
    if (el) box.scrollLeft = Math.max(0, el.offsetLeft - 110);
  }, [step, models.length, series0.length]);

  const cellW = 42;
  const stickyTd = {
    position: "sticky",
    left: 0,
    zIndex: 1,
    background: "var(--paper)",
    boxShadow: "3px 0 0 var(--paper)",
    textAlign: "left",
    padding: "0 8px 0 0",
    whiteSpace: "nowrap",
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: 11,
  };

  function timeText(p) {
    return `${formatAxisDate(p.date)} ${formatWeekdayAbbr3(p.date)} ${formatHourLabel(p.hour)}`;
  }

  const hasAny = models.some((m) => m.series.some((s) => s.cloud_cover != null));
  if (!hasAny) return <div className="err">Bu modeller için bulutluluk verisi yok.</div>;

  return (
    <div style={{ marginTop: 14 }}>
      <div ref={scrollRef} style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 2, fontFamily: '"IBM Plex Mono", monospace', width: "auto" }}>
          <thead>
            <tr>
              <th style={{ ...stickyTd, fontSize: 10, color: "var(--ink-soft)", fontWeight: 400 }}>TSİ</th>
              {cols.map((c, k) => {
                const newDay = k === 0 || c.p.hour < step || cols[k - 1].p.date.getUTCDate() !== c.p.date.getUTCDate();
                const isNow = c.i === nowCol;
                return (
                  <th
                    key={c.i}
                    style={{
                      minWidth: cellW,
                      fontSize: 10,
                      fontWeight: isNow ? 600 : 400,
                      color: isNow ? NOW_TEAL : "var(--ink-soft)",
                      textAlign: "center",
                      borderLeft: newDay && k > 0 ? "1px dashed var(--line)" : "none",
                      lineHeight: 1.25,
                      padding: "0 0 2px",
                      verticalAlign: "bottom",
                    }}
                  >
                    {newDay ? (
                      <>
                        {formatAxisDate(c.p.date)} {formatWeekdayAbbr3(c.p.date)}
                        <br />
                      </>
                    ) : (
                      <br />
                    )}
                    {String(c.p.hour).padStart(2, "0")}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td style={stickyTd}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: m.color, marginRight: 6 }} />
                  {m.label}
                </td>
                {cols.map((c) => {
                  const v = numOrNull(m.series[c.i]?.cloud_cover);
                  const isNow = c.i === nowCol;
                  if (v == null) {
                    return (
                      <td
                        key={c.i}
                        data-now={isNow ? "1" : undefined}
                        style={{ width: cellW, height: 26, textAlign: "center", borderRadius: 4, border: "1px dashed var(--line)", color: "var(--ink-faint)", fontSize: 10 }}
                        title={`${m.label} · ${timeText(c.p)}: veri yok`}
                      >
                        —
                      </td>
                    );
                  }
                  const k = cloudIndex(v);
                  const detail = `${m.label} · ${timeText(c.p)} TSİ\nBulutluluk: %${Math.round(v)} — ${CLOUD_SCALE[k].label}`;
                  return (
                    <td
                      key={c.i}
                      data-now={isNow ? "1" : undefined}
                      title={detail}
                      onClick={() => setInfo(detail)}
                      style={{
                        width: cellW,
                        height: 26,
                        textAlign: "center",
                        verticalAlign: "middle",
                        borderRadius: 4,
                        background: CLOUD_SCALE[k].color,
                        color: CLOUD_SCALE[k].ink,
                        cursor: "pointer",
                        fontSize: 11,
                        boxShadow: isNow ? `inset 0 0 0 2px ${NOW_TEAL}` : "none",
                      }}
                    >
                      {Math.round(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td style={{ ...stickyTd, color: "var(--ink-soft)" }}>uyum</td>
              {cols.map((c, k) => {
                const a = agreement[k];
                const st = AGREE_STYLE[a.level];
                const cfg = AGREE_PARAMS.cloud;
                const text = a.lo
                  ? `${timeText(c.p)} TSİ — modeller ${st.text}\n` +
                    `${a.lo.label} ${cfg.fmt(a.lo.v)} ↔ ${a.hi.label} ${cfg.fmt(a.hi.v)}, fark ${cfg.fmtSpread(a.spread)}` +
                    (a.count < models.length ? `\n(${a.count} modelin verisi var)` : "")
                  : `${timeText(c.p)} TSİ — karşılaştırma için en az 2 modelin verisi gerekiyor.`;
                return (
                  <td
                    key={c.i}
                    title={text}
                    onClick={() => setInfo(text)}
                    style={{
                      width: cellW,
                      height: 22,
                      textAlign: "center",
                      borderRadius: 4,
                      background: st.bg,
                      color: st.ink,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {st.mark}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <div
        className="panel-sub"
        style={{ fontSize: 11, marginTop: 6, minHeight: 16, whiteSpace: "pre-line", color: info ? "var(--ink)" : "var(--ink-soft)" }}
      >
        {info || "Ayrıntı için bir hücrenin üzerine gel ya da dokun. Tablo yatay kaydırılabilir."}
      </div>
    </div>
  );
}

function CloudLegend({ models }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="panel-sub" style={{ fontSize: 10, marginBottom: 4 }}>
        Hücre rengi — gökyüzünün bulutla kaplı oranı · sayı: %
      </div>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {CLOUD_SCALE.map((c) => (
          <div
            key={c.label}
            className="panel-sub"
            style={{ flex: "1 1 62px", textAlign: "center", fontSize: 9.5, lineHeight: 1.35, padding: "0 1px" }}
          >
            <div style={{ height: 10, borderRadius: 2, background: c.color, marginBottom: 3, border: "1px solid var(--line)" }} />
            {c.label}
            <br />
            {c.range}
          </div>
        ))}
      </div>
      {models && models.length > 1 && (
        <div className="panel-sub" style={{ fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>
          <strong style={{ fontWeight: 600 }}>Uyum:</strong> ✓ hemfikir ({"<"} {AGREE_PARAMS.cloud.thPartial}) · ~ kısmen (
          {AGREE_PARAMS.cloud.thMid}) · ≠ ayrışıyor ({">"} {AGREE_PARAMS.cloud.thSplit}) — en kapalı ve en açık
          modelin farkı.
          <br />
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, border: `2px solid ${NOW_TEAL}`, marginRight: 4, verticalAlign: -1 }} />
          Koyu turkuaz çerçeve: şu anki saat.
        </div>
      )}
    </div>
  );
}