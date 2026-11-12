// havameridyen mobil uygulaması — iskelet (sunucu madde 5, Ekim 2026; Prototip 9).
// Akış (28 Ekim): Konum sayfası → Günlük sayfa (16 gün) → Saatlik (iki ve daha çok model seçiliyse Sayfa 1, tek
// modelse tek model ekranı) · Modeller (Sayfa 2) · Grafikler (Sayfa 3). Sayfalar alttaki düğmelerle birbirine bağlı.
// Seçili saat üç sayfada ortak. Tahmin sayfalarının üst çubuğunda konum + favori yıldızı; altında (29 Ekim, stil
// birliği) dört sayfada aynı tahmin kaynağı çubuğu, Saatlik / Modeller / tek model ekranında Günlük'teki gün şeridi.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { MODELS } from "@lib/forecast";
import { buildConsensus } from "@lib/consensus";
import { FAV_MODEL_IDS, fetchForecast, fetchForecast16, fetchLi } from "./api";
import { parseT, tsiNowHour } from "./format";
import { dayIndexOf, daysOf, mergeLi, nowIndex, toModels } from "./data";
import { loadPrefs, placeKey, savePrefs } from "./store";
import { syncWidgetPlace } from "./widget";
import { setSunPlace } from "./icons";
import { TabBar } from "./views/common";
import Loc from "./views/Loc";
import Gunluk, { DayStrip, dailyOf } from "./views/Gunluk";
import { SrcBar, SrcSheet } from "./views/Kaynak";
import Single from "./views/Single";
import P1 from "./views/P1";
import P2 from "./views/P2";
import P3 from "./views/P3";
import Sheet from "./views/Sheet";

const ALL = MODELS.map(({ id, label, color }) => ({ id, label, color }));
const MON_S = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
// Çevrimdışı notu: kaydın TSİ tarihi ve saati ("31 Eki 00:30")
function staleText(ms) {
  const d = new Date(ms + 3 * 3600e3);
  return `${d.getUTCDate()} ${MON_S[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export default function App() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [view, setView] = useState("loc"); // loc · fc (tahmin)
  const [data, setData] = useState({ status: "idle" });
  const [idx, setIdx] = useState(0);
  const [sheet, setSheet] = useState(null);
  const [page, setPage] = useState("day"); // day (günlük) · p1 · p2 · p3
  const [dayKey, setDayKey] = useState(null); // günlük sayfada seçili gün ("YYYY-MM-DD"; null = bugün)
  const [srcOpen, setSrcOpen] = useState(false); // tahmin kaynağı listesi
  const [snack, setSnack] = useState(null); // alttaki kısa bildirim { text, undo }
  const snackT = useRef(null);
  const [long, setLong] = useState({ status: "idle" }); // Sayfa 3 "16 gün" verisi
  const top = useRef(null);

  const update = useCallback((patch) => {
    setPrefs((p) => {
      const n = { ...p, ...patch };
      savePrefs(n);
      return n;
    });
  }, []);

  const { place, selected, unit, favorites } = prefs;
  setSunPlace(place.lat, place.lon); // gündüz / gece ve gökyüzü evresi bu konumun gün doğumu / batımından (31 Ekim)

  // Ana ekran widget'ı son bakılan konumu gösterir
  useEffect(() => syncWidgetPlace(place), [place]);

  // Konum değişince tahmin (8 model) bir kerede alınır. Hız (5 Kas): temel tahmin ve hesaplanan LI (part=li) aynı anda
  // istenir; temel gelince ekranlar hemen çizilir, LI gelince modellere eklenir (Kararsızlık satırı sonradan dolar).
  const load = useCallback(() => {
    const key = placeKey(place);
    setData({ status: "loading", key });
    const liP = fetchLi(place.lat, place.lon).catch(() => null);
    fetchForecast(place.lat, place.lon)
      .then((resp) => {
        const models = toModels(resp);
        const times = resp.time || [];
        const now = nowIndex(times, tsiNowHour());
        setData((d) => (d.key === key ? { status: "ok", key, models, times, days: daysOf(times), nowIdx: now, stale: resp._stale || null, at: Date.now() } : d));
        setIdx(now);
        liP.then((li) => li && setData((d) => (d.key === key && d.status === "ok" ? { ...d, models: mergeLi(d.models, li, d.times) } : d)));
      })
      .catch(() => setData((d) => (d.key === key ? { status: "error", key } : d)));
  }, [place]);
  // Her konum bir kez istenir; hata olursa "Yeniden dene" ile
  useEffect(() => {
    if (view === "fc" && data.key !== placeKey(place)) load();
  }, [view, place, data.key, load]);

  // 16 günlük veri: günlük sayfada ve Sayfa 3'te "16 gün" seçilince, konum başına bir kez
  const load16 = useCallback(() => {
    const key = placeKey(place);
    if (long.key === key && long.status !== "error") return;
    setLong({ status: "loading", key });
    fetchForecast16(place.lat, place.lon)
      .then((resp) => {
        const times = resp.time || [];
        setLong((d) => (d.key === key ? { status: "ok", key, models: toModels(resp), times } : d));
        // Hesaplanan LI (5 Kas): aynı adres, uygulama içi önbellekten gelir
        fetchLi(place.lat, place.lon, 16)
          .then((li) => setLong((d) => (d.key === key && d.status === "ok" ? { ...d, models: mergeLi(d.models, li, d.times) } : d)))
          .catch(() => {});
      })
      .catch(() => setLong((d) => (d.key === key ? { status: "error", key } : d)));
  }, [place, long.key, long.status]);

  // Alttaki kısa bildirim (favori ekle / çıkar · Geri al)
  const notify = useCallback((text, undo) => {
    clearTimeout(snackT.current);
    setSnack({ text, undo });
    snackT.current = setTimeout(() => setSnack(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(snackT.current), []);

  // Yenileme (8 Kas 2026, Ali Kemal: "saatlik güncellemeyle ek kullanıcı aşağı indirerek de güncelleme yapabilsin"):
  // ekran boşaltılmadan aynı konumun verisi yeniden alınır (uygulama içi 10 dk'lık kopya atlanır; sunucunun 1 saatlik
  // önbelleği aynen geçerli). Seçili saat korunur; yalnız "şimdi" güncellenir. 16 günlük veri yüklüyse o da yenilenir
  // (aynı adres; ikinci istek gitmez). manual: aşağı çekme — bağlantı yoksa kısa uyarı.
  const refreshing = useRef(false);
  const refresh = useCallback(
    (manual = false) => {
      const key = placeKey(place);
      if (refreshing.current || data.key !== key || data.status !== "ok") {
        if (data.status === "error") load();
        return Promise.resolve();
      }
      refreshing.current = true;
      const liP = fetchLi(place.lat, place.lon, undefined, true).catch(() => null);
      return fetchForecast(place.lat, place.lon, true)
        .then((resp) => {
          if (resp._stale) {
            if (manual) notify("Bağlantı yok, son veri gösteriliyor");
            return;
          }
          const models = toModels(resp);
          const times = resp.time || [];
          const now = nowIndex(times, tsiNowHour());
          setData((d) => (d.key === key ? { ...d, models, times, days: daysOf(times), nowIdx: now, stale: null, at: Date.now() } : d));
          liP.then((li) => li && setData((d) => (d.key === key && d.status === "ok" ? { ...d, models: mergeLi(d.models, li, d.times) } : d)));
          if (long.key === key && long.status === "ok") {
            setLong((d) => (d.key === key ? { ...d, models: toModels(resp), times } : d));
            liP.then((li) => li && setLong((d) => (d.key === key && d.status === "ok" ? { ...d, models: mergeLi(d.models, li, d.times) } : d)));
          }
        })
        .catch(() => {
          if (manual) notify("Bağlantı yok, son veri gösteriliyor");
        })
        .finally(() => {
          refreshing.current = false;
        });
    },
    [place, data.key, data.status, long.key, long.status, load, notify]
  );

  // Otomatik yenileme: veri 1 saatten eskiyse uygulama ön plana gelince ve açık dururken (5 dakikada bir bakılır)
  const REFRESH_AGE = 3600e3;
  const auto = useRef(null);
  auto.current = () => {
    if (view === "fc" && data.status === "ok" && data.at && Date.now() - data.at > REFRESH_AGE && document.visibilityState !== "hidden") refresh(false);
  };
  useEffect(() => {
    const h = CapApp.addListener("appStateChange", ({ isActive }) => isActive && auto.current());
    const onVis = () => document.visibilityState === "visible" && auto.current();
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(() => auto.current(), 5 * 60e3);
    return () => {
      h.then((x) => x.remove()).catch(() => {});
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(t);
    };
  }, []);

  // Aşağı çekip yenileme: sayfanın en üstündeyken parmak aşağı ~70 px çekilip bırakılınca. Yatay kaydırmalar
  // (saat şeridi, model kartları, grafikler) tetiklemez. pull: gösterge için çekme miktarı (px) · ptr: yenileniyor.
  const [pull, setPull] = useState(0);
  const [ptr, setPtr] = useState(false);
  const pullRef = useRef({ y: null, x: 0, d: 0 });
  const canPull = view === "fc" && !sheet && !srcOpen && data.status === "ok";
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!canPull) return undefined;
    const P = pullRef.current;
    const start = (e) => {
      if (window.scrollY > 0 || e.touches.length !== 1) return;
      P.y = e.touches[0].clientY;
      P.x = e.touches[0].clientX;
      P.d = 0;
    };
    const move = (e) => {
      if (P.y == null) return;
      const dy = e.touches[0].clientY - P.y;
      const dx = Math.abs(e.touches[0].clientX - P.x);
      if (dy <= 0 || dx > dy) {
        if (P.d) setPull(0);
        P.d = 0;
        if (dx > 12) P.y = null; // yatay kaydırma: bu dokunuşta çekme yok
        return;
      }
      P.d = Math.min(110, dy * 0.55);
      setPull(P.d);
    };
    const end = () => {
      if (P.y == null) return;
      const go = P.d >= 60;
      P.y = null;
      P.d = 0;
      setPull(0);
      if (go) {
        setPtr(true);
        refreshRef.current(true).finally(() => setPtr(false));
      }
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [canPull]);

  const multi = selected.length > 1;
  // Günlük sayfa açılınca 16 günlük veri istenir (gelene kadar 7 günlük veriyle çizilir)
  useEffect(() => {
    if (view === "fc" && page === "day") load16();
  }, [view, page, load16]);

  // Android geri tuşu: alttaki sayfa → Saatlik / Modeller / Grafikler'den günlük sayfa → konum sayfası → çık
  const back = useRef(null);
  back.current = () => {
    if (sheet) setSheet(sheet.page === "menu" ? null : { page: "menu" });
    else if (srcOpen) setSrcOpen(false);
    else if (view === "fc" && page !== "day") goPage("day");
    else if (view === "fc") setView("loc");
    else CapApp.exitApp();
  };
  useEffect(() => {
    const h = CapApp.addListener("backButton", () => back.current());
    return () => {
      h.then((x) => x.remove()).catch(() => {});
    };
  }, []);

  const selModels = useMemo(() => (data.models || []).filter((m) => selected.includes(m.id)), [data.models, selected]);
  const selLong = useMemo(() => (long.models || []).filter((m) => selected.includes(m.id)), [long.models, selected]);
  const cons = useMemo(() => (selModels.length > 1 ? buildConsensus(selModels) : null), [selModels]);
  // Günlük sayfa: 16 günlük veri geldiyse onunla, gelmediyse 7 günlükle (tek model de aynı kurallarla)
  const has16 = long.key === placeKey(place) && long.status === "ok" && selLong.length > 0;
  const dayModels = has16 ? selLong : selModels;
  const dayTimes = has16 ? long.times : data.times;
  const dayCons = useMemo(() => (page === "day" && dayModels.length ? buildConsensus(dayModels) : null), [page, dayModels]);


  // Favori: tahmin sayfalarının üst çubuğundaki yıldız ve ana sayfadaki × (28 Ekim, Ali Kemal)
  const isFav = favorites.some((f) => placeKey(f) === placeKey(place));
  const setFavs = (f) => update({ favorites: f });
  const toggleFav = () => {
    setFavPulse(false);
    const before = favorites;
    if (isFav) {
      setFavs(favorites.filter((f) => placeKey(f) !== placeKey(place)));
      notify(`${place.name} favorilerden çıkarıldı`, () => setFavs(before));
    } else {
      setFavs([...favorites, place]);
      notify(`★ ${place.name} favorilere eklendi`, () => setFavs(before));
    }
  };
  // "Konumumu kullan": ilçe adı sonradan gelince konum ve aynı noktadaki "Konumum" favorisi yeniden adlandırılır
  const renamePlace = (pt, name, admin1) => {
    const k = placeKey(pt);
    setPrefs((p) => {
      const ren = (x) => (placeKey(x) === k && String(x.name).startsWith("Konumum") ? { ...x, name, admin1: admin1 || null } : x);
      const n = { ...p, place: ren(p.place), favorites: p.favorites.map(ren) };
      savePrefs(n);
      return n;
    });
  };
  // Son bakılan kartındaki "☆ Favorilere ekle" (12 Kas 2026)
  const addFav = (p) => {
    if (favorites.some((f) => placeKey(f) === placeKey(p))) return;
    const before = favorites;
    setFavs([...favorites, { name: p.name, admin1: p.admin1 || null, lat: p.lat, lon: p.lon }]);
    notify(`★ ${p.name} favorilere eklendi`, () => setFavs(before));
  };
  // "Konumumu kullan" arka planda daha yeni bir konum bulursa: kullanıcı hâlâ eski konumdaysa yeni konuma geçilir
  const movePlace = (from, to) => {
    setPrefs((p) => {
      if (placeKey(p.place) !== placeKey(from)) return p;
      const n = { ...p, place: to };
      savePrefs(n);
      return n;
    });
  };
  const removeFav = (f) => {
    const before = favorites;
    setFavs(favorites.filter((x) => placeKey(x) !== placeKey(f)));
    notify(`${f.name} favorilerden çıkarıldı`, () => setFavs(before));
  };

  // Tahmin kaynağı penceresi (Kaynak.jsx): Ortak tahmin → işaretli modeller (en az 2, "Uygula"), Tek model → [id].
  // Tek modele geçilirken Modeller'deysek Saatlik'e (tek model ekranı) geçilir; Modeller tek modelde kapalı. Grafikler
  // 12 Kas 2026'dan beri tek modelde de açık (yalnız o modelin çizgileri; Ali Kemal).
  const applySrc = (ids) => {
    setSrcOpen(false);
    update({ selected: ids });
    if (ids.length === 1 && page === "p2") goPage("p1");
  };

  // Gün şeridi (Saatlik, Modeller, tek model ekranı): 7 günlük veriden, en uzun modelin menziline kadar. Güne
  // dokununca saat aynı kalır (ör. Pazar 14:00 → Salı 14:00), sayfalardaki eski ‹ › oklarıyla aynı kural.
  const cons1 = useMemo(() => (page !== "day" && selModels.length === 1 ? buildConsensus(selModels) : null), [page, selModels]);
  const hzSel = selModels.length ? Math.max(...selModels.map((m) => m.hz)) : 0;
  const stripDays = useMemo(() => {
    const c = cons || cons1;
    if (!c || !data.days || !hzSel) return [];
    const last = dayIndexOf(data.days, hzSel - 1);
    const keys = new Set(data.days.slice(0, last + 1).map((d) => d.key));
    return dailyOf(c).filter((d) => keys.has(d.date));
  }, [cons, cons1, data.days, hzSel]);
  const curDay = data.days && hzSel ? data.days[dayIndexOf(data.days, Math.min(idx, hzSel - 1))] : null;
  const jumpDay = (key) => {
    const days = data.days;
    const nd = days.findIndex((x) => x.key === key);
    if (nd < 0 || !curDay) return;
    const h = Math.min(idx, hzSel - 1) - curDay.h0;
    setIdx(Math.min(hzSel - 1, days[nd].h0 + Math.min(h, days[nd].h1 - days[nd].h0 - 1)));
  };

  // Günlük sayfadan Saatlik / Modeller / Grafikler: seçili gün 7 günlük verideyse o gün (bugünse şimdiki saat,
  // değilse 12:00), değilse son gün
  const todayKey = tsiNowHour().slice(0, 10);
  const selDay = dayKey || todayKey;
  const days7 = data.days || [];
  const beyond = page === "day" && days7.length > 0 && !days7.some((d) => d.key === selDay);
  const openAt = (key, p) => {
    if (data.status === "ok") {
      const d = days7.find((x) => x.key === key) || days7[days7.length - 1];
      if (key === todayKey) setIdx(data.nowIdx);
      else if (d) {
        const noon = data.times.findIndex((t, i) => i >= d.h0 && i < d.h1 && parseT(t).h === 12);
        setIdx(noon >= 0 ? noon : d.h0);
      }
    }
    goPage(p);
  };

  // Favori ipucu (12 Kas 2026, Ali Kemal: "kullanıcı tekrar tekrar arama yapmayayım diyor"): favori olmayan bir konum
  // açılınca üst çubuktaki ☆ birkaç saniye belirginleşir; ilk 3 seferde altta kısa bir ipucu da çıkar.
  const [favPulse, setFavPulse] = useState(false);
  const pulseT = useRef(null);
  useEffect(() => () => clearTimeout(pulseT.current), []);
  const pick = (p, note) => {
    update({ place: { name: p.name, admin1: p.admin1 || null, lat: p.lat, lon: p.lon } });
    setView("fc");
    setPage("day");
    setDayKey(null);
    window.scrollTo(0, 0);
    const fav = favorites.some((f) => placeKey(f) === placeKey(p));
    clearTimeout(pulseT.current);
    setFavPulse(!fav);
    if (!fav) pulseT.current = setTimeout(() => setFavPulse(false), 6000);
    if (note) notify(note);
    else if (!fav && (prefs.favTips || 0) < 3) {
      update({ favTips: (prefs.favTips || 0) + 1 });
      notify("☆ ile favorilere ekle; bir dahaki sefere aramadan açılır");
    }
  };
  const goPage = (p) => {
    setPage(p);
    window.scrollTo(0, 0);
  };

  return (
    <div ref={top} className={view === "fc" ? "has-tabs" : ""}>
      <div className="appbar">
        <div className="ab-l">
          <button type="button" className="infobtn" aria-label="Bilgi menüsü: Modeller, Terimler, SSS, Hakkında, Yasal" onClick={() => setSheet({ page: "menu" })}>
            i
          </button>
          <div className="brand">
            hava<span className="m">meridyen</span>
          </div>
        </div>
        {view === "fc" && (
          <div className="ab-r">
            <button type="button" className="placebtn" onClick={() => setView("loc")}>
              📍 {place.name} <small>değiştir</small>
            </button>
            <button type="button" className={"favstar" + (favPulse && !isFav ? " pulse" : "")} aria-pressed={isFav} aria-label={isFav ? `${place.name} favorilerden çıkar` : `${place.name} favorilere ekle`} onClick={toggleFav}>
              <svg viewBox="0 0 24 24">
                <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {view === "loc" && (
        <Loc
          place={place}
          favorites={favorites}
          onPick={pick}
          onMove={movePlace}
          onRemove={removeFav}
          onAddFav={addFav}
          onRename={renamePlace}
          onSheet={(p) => setSheet({ page: p })}
        />
      )}

      {view === "fc" && (
        <>
          {(pull > 0 || ptr) && (
            <div className="ptr" style={{ height: ptr ? 44 : pull }} aria-live="polite">
              <span className={"ptr-ic" + (ptr ? " spin" : pull >= 60 ? " ready" : "")} style={ptr ? undefined : { transform: `rotate(${Math.round(pull * 3)}deg)`, opacity: Math.min(1, pull / 60) }}>
                ↻
              </span>
              {ptr && <span className="sr">Yenileniyor</span>}
            </div>
          )}
          <div className="srcw">
            <SrcBar models={ALL.filter((m) => selected.includes(m.id))} single={!multi} onOpen={() => setSrcOpen(true)} />
          </div>
          {/* Çevrimdışı (31 Ekim): sunucuya ulaşılamadı, cihazdaki son tahmin gösteriliyor */}
          {data.status === "ok" && data.stale && (
            <div className="offline" role="status">
              <span>
                Çevrimdışı · son veri {staleText(data.stale)}
              </span>
              <button type="button" onClick={load}>
                Yeniden dene
              </button>
            </div>
          )}
          {data.status === "ok" && (page === "p1" || page === "p2") && stripDays.length > 0 && (
            <div className="stripw">
              <DayStrip daily={stripDays} k={stripDays.findIndex((d) => d.date === curDay?.key)} single={!multi} onPick={jumpDay} compact />
            </div>
          )}
          {data.status === "loading" && <div className="loading">Tahmin yükleniyor…</div>}
          {data.status === "error" && (
            <div className="err">
              Veri alınamadı — bağlantını kontrol et.
              <br />
              <button type="button" onClick={load}>
                Yeniden dene
              </button>
            </div>
          )}
          {data.status === "ok" && page === "day" && dayCons && (
            <Gunluk
              src={{ single: !multi, models: dayModels.length ? dayModels : selModels }}
              cons={dayCons}
              times={dayTimes}
              models={dayModels}
              dayKey={selDay}
              onDay={setDayKey}
              onHourly={(key) => openAt(key, "p1")}
              unit={unit}
              onUnit={(u) => update({ unit: u })}
              listOpen={prefs.listOpen}
              listSeen={prefs.listSeen}
              onListOpen={(v) => update(v ? { listOpen: true, listSeen: true } : { listOpen: false })}
              loading16={long.key === placeKey(place) && long.status === "loading"}
              beyond={beyond}
            />
          )}
          {data.status === "ok" && page !== "day" && page !== "p3" && selModels.length === 1 && (
            <Single
              m={selModels[0]}
              times={data.times}
              days={data.days}
              idx={idx}
              nowIdx={data.nowIdx}
              unit={unit}
              onUnit={(u) => update({ unit: u })}
              onIdx={setIdx}
              onTerm={(term) => setSheet({ page: "terimler", term })}
            />
          )}
          {data.status === "ok" && selModels.length > 1 && cons && page === "p1" && (
            <P1
              models={selModels}
              cons={cons}
              times={data.times}
              days={data.days}
              idx={idx}
              nowIdx={data.nowIdx}
              unit={unit}
              onUnit={(u) => update({ unit: u })}
              onIdx={setIdx}
              onGo={goPage}
            />
          )}
          {data.status === "ok" && selModels.length > 1 && cons && page === "p2" && (
            <P2
              models={selModels}
              cons={cons}
              times={data.times}
              days={data.days}
              idx={idx}
              nowIdx={data.nowIdx}
              unit={unit}
              onUnit={(u) => update({ unit: u })}
              onIdx={setIdx}
              onGo={goPage}
            />
          )}
          {data.status === "ok" && selModels.length > 0 && page === "p3" && (
            <P3
              models={selModels}
              times={data.times}
              long={{ status: long.key === placeKey(place) ? long.status : "idle", models: selLong, times: long.times }}
              onNeed16={load16}
              idx={idx}
              nowIdx={data.nowIdx}
              unit={unit}
              onUnit={(u) => update({ unit: u })}
              onIdx={setIdx}
              onGo={goPage}
              chartsOff={prefs.chartsOff || []}
              onToggleChart={(id) => {
                const cur = prefs.chartsOff || [];
                update({ chartsOff: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
              }}
            />
          )}
        </>
      )}

      {/* Alt sekme çubuğu: Günlük · Saatlik · Modeller · Grafikler (tek model seçiliyken Modeller soluk; Grafikler 12 Kas
          2026'dan beri tek modelde de açık) */}
      {view === "fc" && data.status === "ok" && (
        <TabBar
          current={page}
          off={multi ? [] : ["p2"]}
          onGo={(p) => {
            if (!multi && p === "p2") return notify("Modeller birden çok modelle çalışır: üstten Ortak tahmin'i seç.");
            if (p === "day") return goPage("day");
            if (page === "day" && p !== "p3") return openAt(selDay, p);
            goPage(p);
          }}
        />
      )}
      {srcOpen && <SrcSheet all={ALL} selected={selected} recommended={FAV_MODEL_IDS} onApply={applySrc} onClose={() => setSrcOpen(false)} />}
      {snack && (
        <div className="snack" role="status">
          <span>{snack.text}</span>
          {snack.undo && (
            <button
              type="button"
              onClick={() => {
                snack.undo();
                setSnack(null);
              }}
            >
              Geri al
            </button>
          )}
        </div>
      )}
      <Sheet sheet={sheet} allModels={ALL} loaded={data.models || []} onSheet={setSheet} />
    </div>
  );
}
