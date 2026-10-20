// Yağış ve kar ızgarası (tek model ekranı ve Sayfa 2 kartları; Prototip 9 precipBlock).
// Miktarlar alt alta hizalı; MGM şiddet sınıfı son 12 saatin toplamıyla; kar satırları yalnız karlı günlerde.

import { fmt, pad, parseT } from "../format";
import { dayTotal, daySnow, hasSnowDay, sum12, val } from "../data";

// MGM yağış şiddet sınıfı (son 12 saat)
export function mgm(mm) {
  if (!(mm > 0)) return null;
  if (mm <= 5) return ["Hafif yağış", "b-l1"];
  if (mm <= 20) return ["Orta kuvvette", "b-l2"];
  if (mm <= 50) return ["Kuvvetli", "b-l3"];
  if (mm <= 75) return ["Çok kuvvetli", "b-l4"];
  if (mm <= 100) return ["Şiddetli", "b-l5"];
  return ["Aşırı", "b-l6"];
}

// V04 A4: miktar yoksa "0,0" yerine "yağış yok" / "kar yok"
export function Amt({ v, u, none = "yağış yok", dec = 1 }) {
  if (v == null) return <span className="am no">—</span>;
  if (v < 0.05) return <span className="am no">{none}</span>;
  return (
    <span className="am">
      {fmt(v, dec)} {u}
    </span>
  );
}

// withDay: ızgaranın başında "Günlük toplam yağış" satırı (Sayfa 2 kartı)
export function PrecipGrid({ m, i, day, times, withDay = false }) {
  const hh = pad(parseT(times[i]).h);
  const r12 = sum12(m, i);
  const lv = r12 != null && r12 >= 0.05 ? mgm(r12) : null;
  return (
    <>
      <div className="pgrid">
        {withDay && (
          <>
            <span className="lbl">Günlük toplam yağış</span>
            <Amt v={dayTotal(m, day)} u="mm" />
            <span />
          </>
        )}
        <span className="lbl">Son 12 saat</span>
        <Amt v={r12} u="mm" />
        <span className="bd">{lv && <span className={"badge " + lv[1]}>{lv[0]}</span>}</span>
        <span className="lbl">Saat {hh}:00</span>
        <Amt v={val(m, "precip_amount", i)} u="mm" />
        <span />
      </div>
      {hasSnowDay(m, day) && (
        <>
          <div className="psep" />
          <div className="pgrid">
            <span className="lbl">Günlük taze kar</span>
            <Amt v={daySnow(m, day)} u="cm" none="kar yok" />
            <span />
            <span className="lbl">Saat {hh}:00</span>
            <Amt v={val(m, "snowfall", i)} u="cm" none="kar yok" />
            <span />
            <span className="lbl">Toplam kar kalınlığı</span>
            <Amt v={val(m, "snow_depth", i)} u="cm" none="kar yok" />
            <span className="bd">
              <span className="lbl">{hh}:00</span>
            </span>
          </div>
        </>
      )}
    </>
  );
}
