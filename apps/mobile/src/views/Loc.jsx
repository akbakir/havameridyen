// Ana sayfa / konum sayfası (Prototip 9). 12 Kas 2026 (Ali Kemal: "ana sayfa daha sade olsun"): favori varsa açılışta
// önce favori kartları (4x1, şimdi + 4 gün), son bakılan konum favori değilse en üstte "Son bakılan" kartı (☆ ile
// eklenir); sonra arama, "Konumumu kullan", şehir kısayolları; tanıtım cümlesi en altta "Üç adımda karşılaştır"ın üstünde.

import { useEffect, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { HOME_CITIES } from "@lib/slugify";
import { fetchFavorite, reverseName, searchLocations } from "../api";
import { parseT, tsiNowHour } from "../format";
import { SKY, WxIcon, condView, sunOf } from "../icons";
import { nowIndex } from "../data";
import { placeKey, placeLabel } from "../store";
import { MENU } from "./Sheet";

// Favori kartı (28 Ekim; site favorileri ve widget'la aynı istek, aynı önbellek: 5 gün, varsayılan 5 modelin ortak
// tahmini). 12 Kas 2026 (Ali Kemal: "ana sayfa daha sade olsun; favori kartları 4x1 widget gibi, şimdi ve 4 gün, Günlük
// stilinde"): üstte yer adı, solda şimdiki saatin ikonu + sıcaklığı + durumu, sağda bugün ve sonraki 3 gün (ikon, en
// düşük / en yüksek, yağışlı günde toplam yağış). Zemin şimdiki durumun gökyüzü rengi (Günlük kartı gibi). Karta dokununca
// o konumun Günlük sayfası açılır.
const pv = (p) => (p && p.v != null ? p.v : null);
const DAY3 = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const deg = (v) => (v == null ? "—" : `${Math.round(v)}°`);
function mmShort(x) {
  if (x == null || x < 0.05) return null;
  return `${x < 9.95 ? x.toFixed(1).replace(".", ",") : Math.round(x)} mm`;
}
function useFav(place) {
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
        const today = String(times[i]).slice(0, 10);
        const daily = (cons.daily || []).filter((d) => d.date >= today).slice(0, 4);
        setSt({ status: "ok", t: pv(h.temp), cond: h.cond || null, h: parseT(times[i]).h, today, daily });
      })
      .catch(() => live && setSt({ status: "error" }));
    return () => {
      live = false;
    };
  }, [place.lat, place.lon]);
  return st;
}
function FavCard({ place, label, onOpen, action }) {
  const st = useFav(place);
  const sun = sunOf(place.lat, place.lon);
  const now = st.status === "ok" ? condView(st.cond, st.h, sun) : null;
  return (
    <div
      className="fav4"
      role="button"
      tabIndex={0}
      style={{ background: SKY[now ? now.sky : "nodata"] }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="f4-h">
        <span className="f4-n">
          {label && <small>{label}</small>}
          {placeLabel(place)}
        </span>
        {action}
      </div>
      <div className="f4-b">
        <div className="f4-now">
          <WxIcon name={now ? now.icon : "cloud"} className={"f4-ic" + (now ? "" : " off")} />
          <span className="f4-t">{st.status === "ok" ? deg(st.t) : "—"}</span>
          <span className="f4-c">{now ? now.text : st.status === "loading" ? "yükleniyor…" : "veri alınamadı"}</span>
        </div>
        <div className="f4-days">
          {(st.daily || []).map((d) => {
            const v = condView(d.cond, 12, sun);
            const mm = d.cond?.wet ? mmShort(pv(d.precip_total)) : null;
            return (
              <span key={d.date} className="f4-d">
                <small>{d.date === st.today ? "Bugün" : DAY3[parseT(d.date + "T12:00").w]}</small>
                <WxIcon name={v.icon} className="f4-dic" />
                <span className="f4-mm">
                  <span className="mn">{deg(pv(d.temp_min))}</span> <span className="mx">{deg(pv(d.temp_max))}</span>
                </span>
                <small className="f4-p">{mm || ""}</small>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const LASTFIX = "hm_lastfix";
// Son bulunan konum (yalnız bu cihazda, iki ondalık); maxAge ms
function readLast(maxAge) {
  try {
    const x = JSON.parse(localStorage.getItem(LASTFIX) || "null");
    return x && Number.isFinite(x.lat) && Number.isFinite(x.lon) && Date.now() - x.at < maxAge ? x : null;
  } catch {
    return null;
  }
}
// İzin yok ya da telefonun konum hizmeti kapalıysa yeniden denemenin anlamı yok
const hard = (e) => /000[379]|0017/.test(String(e?.code || "") + String(e?.message || "")) || e?.code === 1;

export default function Loc({ place, favorites, onPick, onMove, onRemove, onAddFav, onRename, onSheet }) {
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

  // "Konumumu kullan" (28 Ekim): yalnız yaklaşık konum izni (hassas konum izni manifestte yok). 12 Kas 2026 (Ali Kemal:
  // "açık alanda bile çok yavaş"; ölçülen: 10 + 25 sn bekleyip OS-PLUG-GLOC-0010): eskiden yalnız Wi-Fi / baz istasyonu
  // ile aranıyordu (düşük doğruluk), açık alanda Wi-Fi olmadığından gecikiyordu. Şimdi:
  //   1) son 2 saatte bu cihazda bulunan konum varsa sayfa hemen onunla açılır; yeni konum arka planda aranır ve 3 km'den
  //      fazla uzaktaysa sayfa yeni konuma geçer;
  //   2) yoksa telefonun bütün kaynakları (GPS + Wi-Fi + baz istasyonu, yüksek doğruluk önceliği; izin yine yaklaşık
  //      konum, sonuç ~1 km'ye yuvarlanır) ile en çok 20 sn; telefonun hafızasındaki 2 saate kadar eski konum da kabul;
  //   3) gelmezse konum takibi (en çok 20 sn), 4) yine gelmezse son 6 saatte bulunan konum ve bunu söyleyen not.
  const [locating, setLocating] = useState(0); // 0 · 1 aranıyor · 2 uzun sürüyor (GPS bekleniyor)
  const save = (lat, lon) => {
    try {
      localStorage.setItem(LASTFIX, JSON.stringify({ lat, lon, at: Date.now() }));
    } catch {
      /* depolama kapalı */
    }
  };
  const firstFix = (ms) =>
    new Promise((resolve, reject) => {
      let id = null;
      let done = false;
      const end = (fn, v) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        if (id != null) Geolocation.clearWatch({ id }).catch(() => {});
        fn(v);
      };
      const t = setTimeout(() => end(reject, { code: "OS-PLUG-GLOC-0010", message: "takip zaman aşımı" }), ms);
      Geolocation.watchPosition({ enableHighAccuracy: true, timeout: ms, maximumAge: 7200000 }, (p, err) => {
        if (p) end(resolve, p);
        else if (err && hard(err)) end(reject, err);
      })
        .then((x) => {
          id = x;
          if (done) Geolocation.clearWatch({ id: x }).catch(() => {});
        })
        .catch((e) => end(reject, e));
    });
  const findFix = async () => {
    try {
      return await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 7200000 });
    } catch (e) {
      if (hard(e)) throw e;
      return firstFix(20000);
    }
  };
  const named = (lat, lon) => {
    // İlçe adı arka planda (en çok 2 deneme); gelince "Konumum · İzmit"
    (async () => {
      for (let k = 0; k < 2; k++) {
        const nm = await reverseName(lat, lon);
        if (nm) return onRename({ lat, lon }, `Konumum · ${nm.name}`, nm.admin1);
        await new Promise((r) => setTimeout(r, 3000));
      }
    })();
  };
  const r2 = (v) => Math.round(v * 100) / 100;
  const gps = async () => {
    setToast("");
    setLocating(1);
    const slow = setTimeout(() => setLocating(2), 5000);
    try {
      let perm = await Geolocation.checkPermissions().catch(() => null);
      if (perm && perm.coarseLocation !== "granted") {
        perm = await Geolocation.requestPermissions({ permissions: ["coarseLocation"] });
      }
      if (perm && perm.coarseLocation !== "granted") {
        setToast("Konum izni verilmedi. Ayarlar › Uygulamalar › havameridyen › İzinler › Konum'dan açabilir ya da şehir arayarak devam edebilirsin.");
        return;
      }
      // 1) son 2 saatteki konumla hemen aç, arka planda tazele
      const recent = readLast(2 * 3600e3);
      if (recent) {
        onPick({ name: "Konumum", admin1: null, lat: recent.lat, lon: recent.lon });
        named(recent.lat, recent.lon);
        findFix()
          .then((pos) => {
            const lat = r2(pos.coords.latitude);
            const lon = r2(pos.coords.longitude);
            save(lat, lon);
            // Kullanıcı bu arada başka bir konuma geçtiyse dokunulmaz (App.movePlace yalnız konum hâlâ aynıysa taşır)
            if (Math.abs(lat - recent.lat) > 0.03 || Math.abs(lon - recent.lon) > 0.03) {
              onMove(recent, { name: "Konumum", admin1: null, lat, lon });
              named(lat, lon);
            }
          })
          .catch(() => {});
        return;
      }
      let pos = null;
      let stale = false;
      try {
        pos = await findFix();
      } catch (e) {
        if (hard(e)) throw e;
        const last = readLast(6 * 3600e3);
        if (!last) throw e;
        pos = { coords: { latitude: last.lat, longitude: last.lon } };
        stale = true;
      }
      const lat = r2(pos.coords.latitude);
      const lon = r2(pos.coords.longitude);
      if (!stale) save(lat, lon);
      onPick({ name: "Konumum", admin1: null, lat, lon }, stale ? "Şu an konum bulunamadı; son bilinen konumun gösteriliyor." : null);
      named(lat, lon);
    } catch (e) {
      const code = String(e?.code || "");
      const msg = String(e?.message || "");
      const has = (c) => code.includes(c) || msg.includes(c);
      let t = "Konum alınamadı. Şehir arayarak devam edebilirsin.";
      if (has("0003")) t = "Konum izni verilmedi. Ayarlar › Uygulamalar › havameridyen › İzinler › Konum'dan açabilirsin.";
      else if (has("0007") || has("0009") || has("0017")) t = "Telefonun konum hizmeti kapalı. Hızlı ayarlardan Konum'u açıp yeniden dene.";
      else if (has("0010")) t = "Konum zamanında bulunamadı. Ayarlar › Konum › Google Konum Doğruluğu açıksa daha hızlı bulunur; biraz sonra yeniden dene.";
      setToast(`${t}${code || msg ? ` (${code || msg})` : ""}`);
    } finally {
      clearTimeout(slow);
      setLocating(0);
    }
  };

  const isFav = (p) => favorites.some((f) => placeKey(f) === placeKey(p));
  const recentCard = !isFav(place);
  const hasCards = favorites.length > 0 || recentCard;

  const cards = hasCards && (
    <div className="favs">
      {recentCard && (
        <FavCard
          place={place}
          label="Son bakılan"
          onOpen={() => onPick(place)}
          action={
            <button
              type="button"
              className="f4-add"
              aria-label={`${placeLabel(place)} favorilere ekle`}
              onClick={(e) => {
                e.stopPropagation();
                onAddFav(place);
              }}
            >
              ☆ Favorilere ekle
            </button>
          }
        />
      )}
      {favorites.map((f) => (
        <FavCard
          key={placeKey(f)}
          place={f}
          onOpen={() => onPick(f)}
          action={
            <button
              type="button"
              className="f4-del"
              aria-label={`${placeLabel(f)} favorilerden çıkar`}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(f);
              }}
            >
              ×
            </button>
          }
        />
      ))}
    </div>
  );

  return (
    <div className="loc">
      {cards}
      <form className={"search" + (hasCards ? " after" : "")} role="search" onSubmit={search}>
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
      <button type="button" className="gps" onClick={gps} disabled={!!locating}>
        {locating === 2 ? "📍 Konum aranıyor (GPS)…" : locating ? "📍 Konum alınıyor…" : "📍 Konumumu kullan"}
      </button>
      <div className="cities">
        {HOME_CITIES.map((c) => (
          <button key={c.name} type="button" className={placeKey(c) === placeKey(place) ? "on" : ""} onClick={() => onPick(c)}>
            {c.name}
          </button>
        ))}
      </div>
      {toast && <div className="toast">{toast}</div>}
      {!hasCards && <div className="favempty">Bir konumu açıp üstteki <b>☆</b>'a dokunursan burada şimdiki durumu ve 4 günüyle görünür.</div>}
      {/* 12 Kas 2026 (Ali Kemal): tanıtım cümlesi en üstten "Üç adımda karşılaştır"ın üstüne */}
      <div className="intro">
        <h2>
          Türkiye için çoklu model, <em>tek ekran.</em>
        </h2>
        <p>ECMWF, GFS, ICON, UKMO, ARPEGE, GEM, JMA ve AIFS tahminlerini yan yana karşılaştır.</p>
      </div>
      <div className="sec" style={{ marginTop: 12 }}>
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
        Veri: Open-Meteo (CC BY 4.0) · Konum adları © OpenStreetMap katkıda bulunanlar
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
