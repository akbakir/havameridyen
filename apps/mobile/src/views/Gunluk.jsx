// Günlük sayfa (28 Ekim 2026, Ali Kemal; tasarım tuvalinde "B kompakt"): konum seçilince ilk açılan tahmin sayfası.
// Üstte (App'te, tüm sayfalarda ortak) tahmin kaynağı çubuğu; burada 16 günlük kayan gün şeridi (‹ › bir gün kaydırır; seçili güne
// ikinci dokunuş Saatlik'i açar), seçili günün kartı (durum, en yüksek / en düşük, toplam yağış, rüzgar gülü + aralık
// + hamle, 3 saatlik dilimler). Sayfalar arası geçiş alttaki sekme çubuğuyla (App). Değerler lib/consensus.js'ten (günlük
// ortak durum, ortanca ve uyum; rüzgar 28 Ekim'de eklendi).

import { useLayoutEffect, useRef } from "react";
import { Mark, SKY, WxIcon, condView } from "../icons";
import { DAYN, MON, dir16, fmt, parseT, speed, unitLabel } from "../format";
import { UnitToggle } from "./common";

const GUN = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const pv = (p) => (p && p.v != null ? p.v : null);

// Yağış: 10 mm altı tek ondalık, üstü tam sayı; 0,05 altı yazılmaz
function mmTxt(v) {
  if (v == null || v < 0.05) return null;
  return v < 9.95 ? fmt(v, 1) : fmt(v, 0);
}

// Uyum dairesi (gün kartında): hemfikir ✓ · kısmen ~ · ayrışıyor ≠; karşılaştıracak model yoksa kesik çizgili boş daire
function AgreeDot({ cond, single }) {
  if (single || !cond) return <span className="gdot none" />;
  if (!["ok", "partial", "split"].includes(cond.level)) return <span className="gdot na" title="tek model · uyum yok" />;
  return (
    <span className={`gdot p-${cond.level}`} title={`${cond.in}/${cond.n} model`}>
      <Mark level={cond.level} />
    </span>
  );
}

// Rüzgar gülü (Sayfa 1'deki gibi): her model kendi renginde ±20° dilim; dilim = modelin günlük hakim yönü
function Rose({ dirs, colors }) {
  const p = (a, r) => `${(32 + r * Math.sin((a * Math.PI) / 180)).toFixed(1)},${(32 - r * Math.cos((a * Math.PI) / 180)).toFixed(1)}`;
  return (
    <svg className="gico" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.35)" />
      {[
        [0, "K"],
        [90, "D"],
        [180, "G"],
        [270, "B"],
      ].map(([a, l]) => (
        <text key={l} x={(32 + 24 * Math.sin((a * Math.PI) / 180)).toFixed(1)} y={(32 - 24 * Math.cos((a * Math.PI) / 180) + 3).toFixed(1)} fontSize="7" textAnchor="middle" fill="rgba(255,255,255,.7)" fontFamily="IBM Plex Mono">
          {l}
        </text>
      ))}
      {dirs.map((d) => (
        <path key={d.id} d={`M32,32 L${p(d.dir - 20, 27)} A27,27 0 0 1 ${p(d.dir + 20, 27)} Z`} fill={colors[d.id] || "#fff"} fillOpacity=".62" stroke="#fff" strokeWidth=".8" />
      ))}
      <circle cx="32" cy="32" r="2.4" fill="#fff" />
    </svg>
  );
}

// Toplam yağış: rüzgar gülüyle aynı çerçevede damla (ölçek yok, tek değer; Ali Kemal 28 Ekim)
function RainDisc() {
  return (
    <svg className="gico" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.35)" />
      <path transform="translate(32,30) scale(1.45)" d="M0,-8c4.2,4.5 7.3,8 7.3,11.3a7.3,7.3 0 1 1-14.6,0c0-3.3 3.1-6.8 7.3-11.3z" fill="#C4E2FF" stroke="#163A6B" strokeWidth="1" />
    </svg>
  );
}

// Sıcaklık rengi (soğuk mavi → ılık turkuaz → sıcak amber → çok sıcak kırmızı); aralık çubuğunun iki ucu
const TSTOPS = [
  [8, [61, 123, 196]],
  [14, [66, 156, 170]],
  [19, [227, 169, 59]],
  [25, [217, 96, 59]],
];
function tcol(t) {
  if (t <= TSTOPS[0][0]) return `rgb(${TSTOPS[0][1].join(",")})`;
  if (t >= TSTOPS[TSTOPS.length - 1][0]) return `rgb(${TSTOPS[TSTOPS.length - 1][1].join(",")})`;
  for (let i = 0; i < TSTOPS.length - 1; i++) {
    const [a, ca] = TSTOPS[i];
    const [b, cb] = TSTOPS[i + 1];
    if (t >= a && t <= b) {
      const f = (t - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * f)).join(",")})`;
    }
  }
  return "rgb(66,156,170)";
}

// 16 günlük liste: gün, ikon, yağış (yalnız yağışlı günde), en düşük, sıcaklık aralığı çubuğu, en yüksek, uyum
function DayList({ daily, k, single, onPick }) {
  const mins = daily.map((d) => pv(d.temp_min)).filter((v) => v != null);
  const maxs = daily.map((d) => pv(d.temp_max)).filter((v) => v != null);
  const LO = Math.min(...mins);
  const HI = Math.max(...maxs);
  const pc = (v) => (HI > LO ? ((v - LO) / (HI - LO)) * 100 : 50);
  return (
    <div className="glist">
      <div className="gl-h">
        <span>gün · yağış · en düşük — en yüksek</span>
        <span>{single ? "" : "uyum"}</span>
      </div>
      {daily.map((d, i) => {
        const p = parseT(d.date + "T12:00");
        const mn = pv(d.temp_min);
        const mx = pv(d.temp_max);
        const mm = d.cond?.wet ? mmTxt(pv(d.precip_total)) : null;
        return (
          <button key={d.date} type="button" className={"gl-r" + (i === k ? " on" : "")} onClick={() => onPick(d.date)}>
            <span className="gl-d">
              <b>{i === 0 ? "Bugün" : GUN[p.w]}</b>
              <small>
                {p.d} {MON[p.m].slice(0, 3)}
              </small>
            </span>
            <WxIcon name={condView(d.cond, 12).icon} className="gl-ic" />
            <span className="gl-mm">{mm ? `${mm} mm` : ""}</span>
            <span className="gl-mn">{mn == null ? "—" : `${Math.round(mn)}°`}</span>
            <span className="gl-bar">
              {mn != null && mx != null && (
                <i style={{ left: `${pc(mn)}%`, width: `${Math.max(2, pc(mx) - pc(mn))}%`, background: `linear-gradient(90deg,${tcol(mn)},${tcol(mx)})` }} />
              )}
            </span>
            <span className="gl-mx">{mx == null ? "—" : `${Math.round(mx)}°`}</span>
            <AgreeDot cond={d.cond} single={single} />
          </button>
        );
      })}
      <p className="gl-n">Bir satıra dokun → o gün yukarıdaki kartta açılır.</p>
    </div>
  );
}

const Arrow = ({ dir, onClick, disabled }) => (
  <button type="button" className="garr" aria-label={dir < 0 ? "Önceki gün" : "Sonraki gün"} disabled={disabled} onClick={onClick}>
    <svg viewBox="0 0 24 24">
      <path d={dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  </button>
);

// Gün şeridi (Günlük sayfa; 29 Ekim'den beri Saatlik, Modeller ve tek model ekranında da, orada "compact": yağış ve uyum
// dairesi yok, kartlar daha basık). daily: lib/consensus günlük dizisi. onAgain: seçili güne ikinci dokunuş.
export function DayStrip({ daily, k, single, onPick, onAgain, compact }) {
  const strip = useRef(null);
  // Seçili gün kartı şeritte görünür kalsın (ilk açılışta ve gün değişince)
  useLayoutEffect(() => {
    const el = strip.current;
    const act = el && el.querySelector('[aria-pressed="true"]');
    if (!act) return;
    const a = act.offsetLeft;
    const b = a + act.offsetWidth;
    if (a < el.scrollLeft) el.scrollLeft = a - 4;
    else if (b > el.scrollLeft + el.clientWidth) el.scrollLeft = b - el.clientWidth + 4;
  }, [k, daily.length]);
  return (
    <div className={"gstrip-w" + (compact ? " cmp" : "")}>
      <Arrow dir={-1} disabled={k <= 0} onClick={() => onPick(daily[k - 1].date)} />
      <div className="gstrip" ref={strip}>
        {daily.map((d, i) => {
          const p = parseT(d.date + "T12:00");
          const on = i === k;
          const mm = d.cond?.wet ? mmTxt(pv(d.precip_total)) : null;
          return (
            <button
              key={d.date}
              type="button"
              className="gchip"
              aria-pressed={on}
              aria-label={`${DAYN[p.w]} ${p.d} ${MON[p.m]}: ${d.cond?.text || ""}`}
              onClick={() => (on ? onAgain && onAgain(d.date) : onPick(d.date))}
            >
              <span className="gc-d">
                <b>{i === 0 ? "Bugün" : GUN[p.w]}</b>
                <small>
                  {p.d} {MON[p.m].slice(0, 3)}
                </small>
              </span>
              <WxIcon name={condView(d.cond, 12).icon} className="gc-ic" />
              {!compact && <span className="gc-mm">{mm || ""}</span>}
              <span className="gc-t">
                <b className="mx">{pv(d.temp_max) == null ? "—" : Math.round(pv(d.temp_max))}</b>
                <span className="sl">/</span>
                <span className="mn">{pv(d.temp_min) == null ? "—" : Math.round(pv(d.temp_min))}</span>
              </span>
              {!compact && <AgreeDot cond={d.cond} single={single} />}
            </button>
          );
        })}
      </div>
      <Arrow dir={1} disabled={k < 0 || k >= daily.length - 1} onClick={() => onPick(daily[k + 1].date)} />
    </div>
  );
}

export const dailyOf = (cons) => (cons.daily || []).filter((d) => pv(d.temp_max) != null || d.cond);

export default function Gunluk({ src, cons, times, models, dayKey, onDay, onHourly, unit, onUnit, loading16, beyond, listOpen, onListOpen }) {
  const daily = dailyOf(cons);
  const k = Math.max(0, daily.findIndex((d) => d.date === dayKey));
  const D = daily[k];
  const single = src.single;

  if (!D) return <div className="loading">Tahmin yükleniyor…</div>;

  const pt = parseT(D.date + "T12:00");
  const view = condView(D.cond, 12);
  const colors = Object.fromEntries(models.map((m) => [m.id, m.color]));
  const W = D.wind || {};
  const slots = (cons.slots3 || []).filter((s) => s.start.startsWith(D.date));
  const tIndex = (t) => times.indexOf(t);
  // Yağış miktarı yalnız yağışlı günde (gün kuralı: model günü ≥ 0,2 mm, modellerin yarısı; 28 Ekim, Ali Kemal:
  // "yağışsız bir günün altında 0.1mm yazılmasın")
  const rain = D.cond?.wet ? mmTxt(pv(D.precip_total)) : null;
  // Sis / pus gününde cond.n görüş veren model sayısıdır (30 Ekim); başlıkta seçili model sayısı kalır
  const nModels = D.cond?.obs ? W.n ?? models.length : D.cond?.n ?? W.n ?? models.length;

  return (
    <div className="gunluk">
      {/* 16 günlük şerit: ‹ › bir gün kaydırır; seçili güne ikinci dokunuş Saatlik'i açar */}
      <DayStrip daily={daily} k={k} single={single} onPick={onDay} onAgain={onHourly} />
      {loading16 && <div className="gnote">16 günlük veri yükleniyor…</div>}

      {/* Seçili günün kartı */}
      <div className="gday" style={{ background: SKY[view.sky] }}>
        <div className="gd-h">
          <span>
            {DAYN[pt.w].toLocaleUpperCase("tr")} · {pt.d} {MON[pt.m].toLocaleUpperCase("tr")}
          </span>
          <span>{single ? src.models[0]?.label : `${nModels} model`}</span>
        </div>
        <div className="gd-main">
          <WxIcon name={view.icon} className="gd-ic" />
          <span>
            <b>{view.text}</b>
            <span className="gd-t">
              <span className="mx">{pv(D.temp_max) == null ? "—" : `${Math.round(pv(D.temp_max))}°`}</span>
              <span className="sl"> / </span>
              <span className="mn">{pv(D.temp_min) == null ? "—" : `${Math.round(pv(D.temp_min))}°`}</span>
            </span>
          </span>
        </div>
        <div className="gd-g">
          <div className="gg">
            <RainDisc />
            <span>
              <small>Toplam yağış</small>
              <b>{rain ? `${rain} mm` : "yok"}</b>
            </span>
          </div>
          <div className="gg">
            <Rose dirs={W.dirs || []} colors={colors} />
            <span>
              <small>Rüzgar {dir16(W.dir)}</small>
              <b>{W.max == null ? "—" : `${Math.round(speed(W.min, unit))}–${Math.round(speed(W.max, unit))} ${unitLabel(unit)}`}</b>
              <small className="mono">{pv(D.gust_max) == null ? "hamle —" : `hamle ${Math.round(speed(pv(D.gust_max), unit))} ${unitLabel(unit)}`}</small>
            </span>
            <span className="gg-u">
              <UnitToggle unit={unit} onUnit={onUnit} ghost />
            </span>
          </div>
        </div>
        {slots.length > 0 && (
          <>
            <div className="gd-sep" />
            <div className="gd-slots">
              {slots.map((s) => {
                const h = parseT(s.start).h;
                const i = tIndex(s.start);
                const t = i >= 0 ? pv(cons.hourly[i]?.temp) : null;
                const mm = s.cond?.wet ? mmTxt(pv(s.precip)) : null;
                return (
                  <span key={s.start} className="gs">
                    <small>{String(h).padStart(2, "0")}</small>
                    <WxIcon name={condView(s.cond, h + 1).icon} className="gs-ic" />
                    <b>{t == null ? "—" : `${Math.round(t)}°`}</b>
                    <small className="gs-mm">{mm || ""}</small>
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>

      {beyond && <div className="gnote">Saatlik ve model sayfaları ilk 7 günü gösterir.</div>}

      {/* 16 günlük liste (29 Ekim, Ali Kemal: "boşluğu doldurmak adına … kullanıcı tıklayarak açarsa"): kapalı başlar,
          son tercih cihazda hatırlanır. Satıra dokununca o gün yukarıdaki kartta açılır ve sayfa başa kayar. */}
      <button type="button" className="glist-t" aria-expanded={!!listOpen} onClick={() => onListOpen(!listOpen)}>
        <svg viewBox="0 0 24 24" className="li">
          <path d="M8 6h12M8 12h12M8 18h12" />
          <circle cx="4" cy="6" r="1.2" />
          <circle cx="4" cy="12" r="1.2" />
          <circle cx="4" cy="18" r="1.2" />
        </svg>
        {/* 29 Ekim (Ali Kemal): "16 günü liste olarak gör" yerine "Liste Görünümü"; tarih aralığı ve ok kalır */}
        <b>Liste Görünümü</b>
        <small>{`${parseT(daily[0].date + "T12:00").d} ${MON[parseT(daily[0].date + "T12:00").m].slice(0, 3)} – ${parseT(daily[daily.length - 1].date + "T12:00").d} ${MON[parseT(daily[daily.length - 1].date + "T12:00").m].slice(0, 3)}`}</small>
        <svg viewBox="0 0 24 24" className="ch">
          <path d={listOpen ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
        </svg>
      </button>
      {listOpen && <DayList daily={daily} k={k} single={single} onPick={(date) => { onDay(date); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
    </div>
  );
}
