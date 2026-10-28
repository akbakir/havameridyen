// havameridyen mobil uygulaması — iskelet (sunucu madde 5, Ekim 2026; Prototip 9).
// Akış (28 Ekim): Konum sayfası → Günlük sayfa (16 gün) → Saatlik (iki ve daha çok model seçiliyse Sayfa 1, tek
// modelse tek model ekranı) · Modeller (Sayfa 2) · Grafikler (Sayfa 3). Sayfalar alttaki düğmelerle birbirine bağlı.
// Seçili saat üç sayfada ortak. Tahmin sayfalarının üst çubuğunda konum + favori yıldızı.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { MODELS } from "@lib/forecast";
import { buildConsensus } from "@lib/consensus";
import { FAV_MODEL_IDS, fetchForecast, fetchForecast16 } from "./api";
import { parseT, tsiNowHour } from "./format";
import { daysOf, nowIndex, toModels } from "./data";
import { loadPrefs, placeKey, placeLabel, savePrefs } from "./store";
import { syncWidgetPlace } from "./widget";
import { ModelChips, TabBar } from "./views/common";
import Loc from "./views/Loc";
import Gunluk, { SrcSheet } from "./views/Gunluk";
import Single from "./views/Single";
import P1 from "./views/P1";
import P2 from "./views/P2";
import P3 from "./views/P3";
import Sheet from "./views/Sheet";

const ALL = MODELS.map(({ id, label, color }) => ({ id, label, color }));

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

  // Ana ekran widget'ı son bakılan konumu gösterir
  useEffect(() => syncWidgetPlace(place), [place]);

  // Konum değişince tahmin (7 model, 7 gün) bir kerede alınır
  const load = useCallback(() => {
    const key = placeKey(place);
    setData({ status: "loading", key });
    fetchForecast(place.lat, place.lon)
      .then((resp) => {
        const models = toModels(resp);
        const times = resp.time || [];
        const now = nowIndex(times, tsiNowHour());
        setData((d) => (d.key === key ? { status: "ok", key, models, times, days: daysOf(times), nowIdx: now } : d));
        setIdx(now);
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
      })
      .catch(() => setLong((d) => (d.key === key ? { status: "error", key } : d)));
  }, [place, long.key, long.status]);

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

  // Alttaki kısa bildirim (favori ekle / çıkar · Geri al)
  const notify = useCallback((text, undo) => {
    clearTimeout(snackT.current);
    setSnack({ text, undo });
    snackT.current = setTimeout(() => setSnack(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(snackT.current), []);

  // Favori: tahmin sayfalarının üst çubuğundaki yıldız ve ana sayfadaki × (28 Ekim, Ali Kemal)
  const isFav = favorites.some((f) => placeKey(f) === placeKey(place));
  const setFavs = (f) => update({ favorites: f });
  const toggleFav = () => {
    const before = favorites;
    if (isFav) {
      setFavs(favorites.filter((f) => placeKey(f) !== placeKey(place)));
      notify(`${place.name} favorilerden çıkarıldı`, () => setFavs(before));
    } else {
      setFavs([...favorites, place]);
      notify(`★ ${place.name} favorilere eklendi`, () => setFavs(before));
    }
  };
  const removeFav = (f) => {
    const before = favorites;
    setFavs(favorites.filter((x) => placeKey(x) !== placeKey(f)));
    notify(`${f.name} favorilerden çıkarıldı`, () => setFavs(before));
  };

  // Tahmin kaynağı: "ortak" → (tek model seçiliyse) varsayılan 5 model; model kimliği → yalnız o model
  const chooseSrc = (c) => {
    setSrcOpen(false);
    if (c === "ortak") {
      if (!multi) update({ selected: FAV_MODEL_IDS });
    } else update({ selected: [c] });
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

  const pick = (p) => {
    update({ place: { name: p.name, admin1: p.admin1 || null, lat: p.lat, lon: p.lon } });
    setView("fc");
    setPage("day");
    setDayKey(null);
    window.scrollTo(0, 0);
  };
  const toggle = (id) => {
    const on = selected.includes(id);
    if (on && selected.length === 1) return; // en az bir model seçili kalır
    update({ selected: on ? selected.filter((x) => x !== id) : ALL.map((m) => m.id).filter((x) => x === id || selected.includes(x)) });
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
            <button type="button" className="favstar" aria-pressed={isFav} aria-label={isFav ? `${place.name} favorilerden çıkar` : `${place.name} favorilere ekle`} onClick={toggleFav}>
              <svg viewBox="0 0 24 24">
                <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {view === "loc" && <Loc place={place} favorites={favorites} onPick={pick} onRemove={removeFav} onSheet={(p) => setSheet({ page: p })} />}

      {view === "fc" && (
        <>
          {page !== "day" && <ModelChips all={ALL} selected={selected} onToggle={toggle} />}
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
              onPicker={() => setSrcOpen(true)}
              loading16={long.key === placeKey(place) && long.status === "loading"}
              beyond={beyond}
            />
          )}
          {data.status === "ok" && page !== "day" && selModels.length === 1 && (
            <Single
              m={selModels[0]}
              times={data.times}
              days={data.days}
              idx={idx}
              nowIdx={data.nowIdx}
              place={placeLabel(place)}
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
          {data.status === "ok" && selModels.length > 1 && page === "p3" && (
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
            />
          )}
        </>
      )}

      {/* Alt sekme çubuğu: Günlük · Saatlik · Modeller · Grafikler (tek model seçiliyken Modeller / Grafikler soluk) */}
      {view === "fc" && data.status === "ok" && (
        <TabBar
          current={page}
          off={multi ? [] : ["p2", "p3"]}
          onGo={(p) => {
            if (!multi && (p === "p2" || p === "p3")) return notify("Modeller ve Grafikler birden çok modelle çalışır: Günlük'te üstten Ortak tahmin'i seç.");
            if (p === "day") return goPage("day");
            if (page === "day" && p !== "p3") return openAt(selDay, p);
            goPage(p);
          }}
        />
      )}
      {srcOpen && <SrcSheet all={ALL} selected={selected} ortak={multi ? ALL.filter((m) => selected.includes(m.id)) : ALL.filter((m) => FAV_MODEL_IDS.includes(m.id))} onChoose={chooseSrc} onClose={() => setSrcOpen(false)} />}
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
