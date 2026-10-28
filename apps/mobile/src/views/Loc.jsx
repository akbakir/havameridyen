// Konum sayfası (Prototip 9; web ana sayfasına sadık): arama, "Konumumu kullan", hızlı şehirler, favoriler (ECMWF kartı).

import { useEffect, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { condAt } from "@lib/agreement";
import { HOME_CITIES } from "@lib/slugify";
import { fetchFavorite, searchLocations } from "../api";
import { fmt, tsiNowHour } from "../format";
import { dayMax, dayMin, nowIndex, toModels, val } from "../data";
import { placeKey, placeLabel } from "../store";
import { MENU } from "./Sheet";

// Favori kartı: yalnız ECMWF, şimdiki saat (23 Eylül kararı: favoriler kartı ECMWF kalır)
function FavCard({ place, onOpen }) {
  const [st, setSt] = useState({ status: "loading" });
  useEffect(() => {
    let live = true;
    fetchFavorite(place.lat, place.lon)
      .then((r) => {
        if (!live) return;
        const [m] = toModels(r);
        if (!m) return setSt({ status: "error" });
        const times = m.series.map((s) => s.time);
        const i = nowIndex(times, tsiNowHour());
        const day = { h0: 0, h1: times.length };
        setSt({ status: "ok", t: val(m, "temp", i), mn: dayMin(m, day), mx: dayMax(m, day), cond: condAt(m, i) });
      })
      .catch(() => live && setSt({ status: "error" }));
    return () => {
      live = false;
    };
  }, [place.lat, place.lon]);
  return (
    <button type="button" className="favcard" onClick={onOpen}>
      <span className="n">{placeLabel(place)}</span>
      <span className="t">{st.status === "ok" ? `${fmt(st.t)}°` : "—"}</span>
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

export default function Loc({ place, favorites, onPick, onFavorites, onSheet }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [toast, setToast] = useState("");
  const isFav = favorites.some((f) => placeKey(f) === placeKey(place));

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

  // "Konumumu kullan" (28 Ekim: telefonda "Konum alınamadı" — izin önce açıkça istenir, zaman aşımı uzatıldı,
  // ağ konumu yetmezse GPS ile bir kez daha denenir; hata kodu mesajın sonunda görünür)
  const [locating, setLocating] = useState(false);
  const gps = async () => {
    setToast("");
    setLocating(true);
    try {
      let perm = await Geolocation.checkPermissions().catch(() => null);
      if (perm && perm.location !== "granted" && perm.coarseLocation !== "granted") {
        perm = await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] });
      }
      if (perm && perm.location !== "granted" && perm.coarseLocation !== "granted") {
        setToast("Konum izni verilmedi. Ayarlar › Uygulamalar › havameridyen › İzinler › Konum'dan açabilir ya da şehir arayarak devam edebilirsin.");
        return;
      }
      let pos;
      try {
        pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 });
      } catch (e) {
        if (String(e?.code || e?.message || "").includes("0010")) {
          pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
        } else throw e;
      }
      const lat = Math.round(pos.coords.latitude * 100) / 100;
      const lon = Math.round(pos.coords.longitude * 100) / 100;
      onPick({ name: "Konumum", admin1: null, lat, lon });
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
        <span>ECMWF · şimdi</span>
      </div>
      {favorites.map((f) => (
        <div className="favrow" key={placeKey(f)}>
          <FavCard place={f} onOpen={() => onPick(f)} />
          <button type="button" className="favdel" aria-label={`${placeLabel(f)} favorilerden çıkar`} onClick={() => onFavorites(favorites.filter((x) => placeKey(x) !== placeKey(f)))}>
            ×
          </button>
        </div>
      ))}
      {!isFav && (
        <button type="button" className="favadd" onClick={() => onFavorites([...favorites, place])}>
          ☆ {placeLabel(place)} favorilere ekle
        </button>
      )}
      <button type="button" className="mlink" style={{ marginTop: 16 }} onClick={() => onSheet("modeller")}>
        <span>
          <b>Modeller hakkında</b>
          <small>kurum, çözünürlük, güncelleme, kararsızlık verisi</small>
        </span>
        <span className="ch">›</span>
      </button>
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
        Veri: Open-Meteo (CC BY 4.0)
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
