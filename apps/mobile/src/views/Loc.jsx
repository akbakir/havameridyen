// Konum sayfası (Prototip 9; web ana sayfasına sadık): arama, "Konumumu kullan", hızlı şehirler, favoriler (beş modelin ortak tahmini).

import { useEffect, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { HOME_CITIES } from "@lib/slugify";
import { fetchFavorite, reverseName, searchLocations } from "../api";
import { fmt, parseT, tsiNowHour } from "../format";
import { WxIcon, condView } from "../icons";
import { nowIndex } from "../data";
import { placeKey, placeLabel } from "../store";
import { MENU } from "./Sheet";

// Favori kartı (28 Ekim, Ali Kemal: "uygulamadaki kartları da 5 modelin ortak tahminine geçirip sitedeki ve
// widget'taki tahminle aynı hale getirelim"): beş modelin ortak tahmini (/api/v1 consensus; site favorileri ve widget'la
// aynı istek, aynı önbellek). Şimdiki saatin ortak durumu, ikonu ve ortanca sıcaklığı; bugünün en düşük / en yüksek
// ortancası; gün yağışlıysa bugünün toplam yağışı.
const pv = (p) => (p && p.v != null ? p.v : null);
function mmText(x) {
  if (x == null || x < 0.05) return null;
  return `${x < 9.95 ? x.toFixed(1).replace(".", ",") : Math.round(x)} mm`;
}
function FavCard({ place, onOpen }) {
  const [st, setSt] = useState({ status: "loading" });
  useEffect(() => {
    let live = true;
    fetchFavorite(place.lat, place.lon)
      .then((r) => {
        if (!live) return;
        const times = r.time || [];
        const cons = r.consensus || {};
        const i = nowIndex(times, tsiNowHour());
        const h = i >= 0 ? cons.hourly?.[i] : null;
        if (!h || pv(h.temp) == null) return setSt({ status: "error" });
        const today = (cons.daily || []).find((d) => d.date === String(times[i]).slice(0, 10));
        setSt({
          status: "ok",
          t: pv(h.temp),
          mn: today ? pv(today.temp_min) : null,
          mx: today ? pv(today.temp_max) : null,
          mm: today && today.cond?.wet ? mmText(pv(today.precip_total)) : null,
          cond: h.cond || null,
          h: parseT(times[i]).h,
        });
      })
      .catch(() => live && setSt({ status: "error" }));
    return () => {
      live = false;
    };
  }, [place.lat, place.lon]);
  return (
    <button type="button" className="favcard" onClick={onOpen}>
      {/* hava ikonu (28 Ekim, Ali Kemal: "Favorilerde hava durumu ikonu sayfayı renklendirdi güzel") */}
      <WxIcon name={st.status === "ok" ? condView(st.cond, st.h).icon : "cloud"} className={"ic" + (st.status === "ok" ? "" : " off")} />
      <span className="n">{placeLabel(place)}</span>
      <span className="t">
        {st.status === "ok" ? `${fmt(st.t)}°` : "—"}
        {st.mm && <small className="mm">{st.mm}</small>}
      </span>
      <span className="s">
        {st.status === "ok" ? (
          <>
            bugün <span className="tmin">{fmt(st.mn)}°</span> / <span className="tmax">{fmt(st.mx)}°</span>
            {st.cond ? ` · ${st.cond.text.toLocaleLowerCase("tr")}` : ""}
          </>
        ) : st.status === "loading" ? (
          "yükleniyor…"
        ) : (
          "veri alınamadı"
        )}
      </span>
    </button>
  );
}

export default function Loc({ place, favorites, onPick, onRemove, onSheet }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [toast, setToast] = useState("");

  const search = async (e) => {
    e.preventDefault();
    setToast("");
    if (q.trim().length < 2) return setToast("En az iki harf yaz.");
    try {
      const r = await searchLocations(q);
      setResults(r);
      if (!r.length) setToast("Sonuç bulunamadı.");
    } catch {
      setToast("Arama yapılamadı — bağlantını kontrol et.");
    }
  };

  // "Konumumu kullan" (28 Ekim): yalnız yaklaşık konum istenir ve yalnız uygulama kullanılırken (Ali Kemal: "tam konum
  // şeklinde bir daha sorulmasın"); hassas konum izni manifestte de yok. Bekleme 20 sn, gelmezse 30 sn ile bir kez
  // daha. Bulunan noktanın ilçe adı sunucudan alınır: "Konumum · İzmit" (bulunamazsa "Konumum").
  const [locating, setLocating] = useState(false);
  const gps = async () => {
    setToast("");
    setLocating(true);
    try {
      let perm = await Geolocation.checkPermissions().catch(() => null);
      if (perm && perm.coarseLocation !== "granted") {
        perm = await Geolocation.requestPermissions({ permissions: ["coarseLocation"] });
      }
      if (perm && perm.coarseLocation !== "granted") {
        setToast("Konum izni verilmedi. Ayarlar › Uygulamalar › havameridyen › İzinler › Konum'dan açabilir ya da şehir arayarak devam edebilirsin.");
        return;
      }
      let pos;
      try {
        pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 });
      } catch (e) {
        if (String(e?.code || e?.message || "").includes("0010")) {
          pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 30000, maximumAge: 1800000 });
        } else throw e;
      }
      const lat = Math.round(pos.coords.latitude * 100) / 100;
      const lon = Math.round(pos.coords.longitude * 100) / 100;
      const nm = await reverseName(lat, lon);
      onPick({ name: nm ? `Konumum · ${nm.name}` : "Konumum", admin1: nm ? nm.admin1 : null, lat, lon });
    } catch (e) {
      const code = String(e?.code || "");
      const msg = String(e?.message || "");
      const has = (c) => code.includes(c) || msg.includes(c);
      let t = "Konum alınamadı. Şehir arayarak devam edebilirsin.";
      if (has("0003")) t = "Konum izni verilmedi. Ayarlar › Uygulamalar › havameridyen › İzinler › Konum'dan açabilirsin.";
      else if (has("0007") || has("0009") || has("0017")) t = "Telefonun konum hizmeti kapalı. Hızlı ayarlardan Konum'u açıp yeniden dene.";
      else if (has("0010")) t = "Konum zamanında bulunamadı. Açık alanda ya da bir süre sonra yeniden dene.";
      setToast(`${t}${code || msg ? ` (${code || msg})` : ""}`);
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="loc">
      <h2>
        Türkiye için çoklu model, <em>tek ekran.</em>
      </h2>
      <p>ECMWF, GFS, ICON, UKMO, ARPEGE, GEM ve JMA tahminlerini yan yana karşılaştır.</p>
      <form className="search" role="search" onSubmit={search}>
        <input type="search" placeholder="Şehir veya ilçe ara" aria-label="Konum ara" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit">Ara</button>
      </form>
      {results && results.length > 0 && (
        <div className="results">
          {results.map((r, i) => (
            <button key={`${r.lat},${r.lon},${i}`} type="button" onClick={() => onPick(r)}>
              <span>{r.name}</span>
              <small>{[r.admin1, r.country].filter(Boolean).join(", ")}</small>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="gps" onClick={gps} disabled={locating}>
        {locating ? "📍 Konum alınıyor…" : "📍 Konumumu kullan"}
      </button>
      <div className="cities">
        {HOME_CITIES.map((c) => (
          <button key={c.name} type="button" className={placeKey(c) === placeKey(place) ? "on" : ""} onClick={() => onPick(c)}>
            {c.name}
          </button>
        ))}
      </div>
      {toast && <div className="toast">{toast}</div>}
      <div className="sec">
        <span>Favoriler</span>
        <span>{favorites.length ? "5 model · şimdi" : ""}</span>
      </div>
      {/* Favori ekleme tahmin sayfasının üst çubuğundaki ☆ ile (28 Ekim, Ali Kemal); çıkarma × ile (altta "Geri al") */}
      {!favorites.length && (
        <div className="favempty">
          Henüz favori yok. Bir konumu açıp üstteki <b>☆</b>'a dokun; burada şimdiki durumuyla görünür.
        </div>
      )}
      {favorites.map((f) => (
        <div className="favrow" key={placeKey(f)}>
          <FavCard place={f} onOpen={() => onPick(f)} />
          <button type="button" className="favdel" aria-label={`${placeLabel(f)} favorilerden çıkar`} onClick={() => onRemove(f)}>
            ×
          </button>
        </div>
      ))}
      <div className="sec" style={{ marginTop: 16 }}>
        <span>Üç adımda karşılaştır</span>
        <span />
      </div>
      <div className="steps">
        <div>
          <b>1</b>Konum seç
        </div>
        <div>
          <b>2</b>Modelleri seç
        </div>
        <div>
          <b>3</b>Karşılaştır: saatlik, günlük ya da grafik
        </div>
      </div>
      <div className="foot">
        Veri: Open-Meteo (CC BY 4.0) · Konum adları © OpenStreetMap katkıcıları
        <div className="infolinks">
          {MENU.map(([k, t]) => (
            <button key={k} type="button" onClick={() => onSheet(k)}>
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
