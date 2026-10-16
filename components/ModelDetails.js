// Model detayları tablosu (Paket 4, Ekim 2026).
// - Sütunlar grafiklerdeki parametrelere göre: Model · Durum · Sıcaklık · Yağış · Yön Hız/Hamle · Nem · CAPE ·
//   Basınç · Bulut. Yağış olasılığı kaldırıldı (UKMO ve ARPEGE vermiyor, grafiklerde de yok).
// - Seçili zaman sayfanın ortak durumudur: grafiklere tıklayınca tablo o dilime ve o grafiğin aralığına gider;
//   1s / 3s / 6s ve ← Şimdi → seçili dilimi tüm grafiklerde kaydırır.
// - Aralık > 1 saat: Durum = dilimdeki en belirgin durum (Hava durumu matrisindeki ikonla aynı),
//   Yağış = dilim toplamı, diğer değerler dilimin ilk saati ("… 06:00–08:59 TSİ · anlık 06:00").

import { DAY3, MON3, f1, numOrNull, pad2, parseTime } from "./LineChartPanel";
import { WxIcon, condAt, slotCond } from "./WeatherCond";

const COMPASS_8 = ["K", "KD", "D", "GD", "G", "GB", "B", "KB"];
const compass = (d) => COMPASS_8[Math.round((((d % 360) + 360) % 360) / 45) % 8];

const NOW_BADGE_STYLE = {
  marginLeft: 8,
  padding: "1px 6px",
  borderRadius: 4,
  background: "var(--teal)",
  color: "#FFFFFF",
  fontSize: 10,
};

function whenText(times, i, step) {
  const p = parseTime(times[i]);
  if (!p) return "";
  const day = `${p.day} ${MON3[p.mon]} ${DAY3[p.wd]}`;
  if (step === 1) return `${day} · ${pad2(p.hour)}:00 TSİ`;
  const e = parseTime(times[Math.min(times.length - 1, i + step - 1)]);
  return `${day} · ${pad2(p.hour)}:00–${pad2(e ? e.hour : p.hour)}:59 TSİ · anlık ${pad2(p.hour)}:00`;
}

const faint = { color: "var(--ink-faint)" };

export default function ModelDetails({ models, status, selection, nowIndex, onStep, onPrev, onNext, onNow }) {
  const ok = status === "ok" && models && models.length > 0;
  const n = ok ? models[0].series.length : 0;
  const times = ok ? models[0].series.map((s) => s.time) : [];
  const step = selection.step;
  const sel = Math.max(0, Math.min(n - 1, selection.i));
  const nowAligned = nowIndex >= 0 ? nowIndex - (nowIndex % step) : -1;

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title-group">
          <div className="panel-title">Model detayları</div>
          <div className="panel-sub">
            {ok ? whenText(times, sel, step) : ""}
            {ok && nowAligned >= 0 && sel === nowAligned && <span style={NOW_BADGE_STYLE}>şimdi</span>}
          </div>
        </div>
        <div className="table-controls">
          <div className="unit-toggle">
            {[1, 3, 6].map((h) => (
              <button key={h} type="button" className={step === h ? "active" : ""} onClick={() => onStep(h)}>
                {h}s
              </button>
            ))}
          </div>
          <div className="time-nav">
            <button type="button" onClick={onPrev} disabled={!ok || sel <= 0} aria-label="Önceki">
              ←
            </button>
            <button
              type="button"
              onClick={onNow}
              disabled={!ok || nowIndex < 0}
              aria-label="Şimdiki saate git"
              style={{ width: "auto", padding: "0 10px", fontSize: 12 }}
            >
              Şimdi
            </button>
            <button type="button" onClick={onNext} disabled={!ok || sel + step > n - 1} aria-label="Sonraki">
              →
            </button>
          </div>
        </div>
      </div>
      <div className="panel-sub" style={{ fontSize: 11 }}>
        Bir grafikte bir zamana tıklayınca tablo oraya gider.
      </div>
      <div className="md-wrap">
        <table className="md-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>
                Durum{step > 1 && <span className="u">dilimde en belirgin</span>}
              </th>
              <th>Sıcaklık</th>
              <th>
                Yağış<span className="u">{step}s toplam, mm</span>
              </th>
              <th>
                Yön Hız/Hamle<span className="u">(km/s)</span>
              </th>
              <th>Nem</th>
              <th>
                CAPE<span className="u">J/kg</span>
              </th>
              <th>
                Basınç<span className="u">hPa</span>
              </th>
              <th>Bulut</th>
            </tr>
          </thead>
          <tbody>
            {status === "loading" && (
              <tr>
                <td colSpan={9} className="loading">
                  Veri yükleniyor…
                </td>
              </tr>
            )}
            {status === "error" && (
              <tr>
                <td colSpan={9} className="err">
                  Veri alınamadı
                </td>
              </tr>
            )}
            {ok &&
              models.map((m) => {
                const c = step > 1 ? slotCond(m, sel, step) : condAt(m, sel);
                const name = (
                  <td className="station">
                    <span className="dot" style={{ background: m.color }} />
                    {m.label}
                  </td>
                );
                if (!c)
                  return (
                    <tr key={m.id}>
                      {name}
                      <td className="na" colSpan={8}>
                        veri yok — modelin tahmin süresi bitti
                      </td>
                    </tr>
                  );
                const s = m.series[sel] || {};
                let rs = 0;
                for (let i = sel; i < sel + step && i < n; i++) rs += numOrNull(m.series[i]?.precip_amount) || 0;
                const t = numOrNull(s.temp);
                const d = numOrNull(s.wind_direction);
                const w = numOrNull(s.wind_speed);
                const g = numOrNull(s.wind_gust);
                const h = numOrNull(s.humidity);
                const e = numOrNull(s.cape);
                const p = numOrNull(s.pressure);
                const cc = numOrNull(s.cloud_cover);
                return (
                  <tr key={m.id}>
                    {name}
                    <td className="cond">
                      <span>
                        <WxIcon ic={c.ic} size={22} />
                        {c.text}
                      </span>
                    </td>
                    <td>{t == null ? "—" : `${f1(t)}°C`}</td>
                    <td>{rs < 0.05 ? <span style={faint}>yok</span> : rs.toFixed(1)}</td>
                    <td>
                      {d == null ? "—" : compass(d)} {f1(w)}
                      <span style={faint}>/{g == null ? "—" : f1(g)}</span>
                    </td>
                    <td>{h == null ? "—" : `% ${Math.round(h)}`}</td>
                    <td>{e == null ? <span style={faint}>—</span> : Math.round(e)}</td>
                    <td>{f1(p)}</td>
                    <td>{cc == null ? "—" : `% ${Math.round(cc)}`}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
