// havameridyen mobil uygulaması — iskelet (sunucu madde 5, Ekim 2026; Prototip 9).
// Akış: Konum sayfası → yalnız bir model seçiliyse tek model ekranı, iki ve daha çok model seçiliyse Sayfa 1;
// Sayfa 1 · 2 (modeller ayrı ayrı) · 3 (grafikler) birbirine bağlantı kartlarıyla bağlı. Seçili saat üç sayfada ortak.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { MODELS } from "@lib/forecast";
import { buildConsensus } from "@lib/consensus";
import { fetchForecast, fetchForecast16 } from "./api";
import { tsiNowHour } from "./format";
import { daysOf, nowIndex, toModels } from "./data";
import { loadPrefs, placeKey, placeLabel, savePrefs } from "./store";
import { syncWidgetPlace } from "./widget";
import { ModelChips } from "./views/common";
import Loc from "./views/Loc";
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
  const [page, setPage] = useState("p1"); // p1 · p2 · p3 (iki ve daha çok model)
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

  // 16 günlük veri yalnız Sayfa 3'te "16 gün" seçilince, konum başına bir kez
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
  // Android geri tuşu: alttaki sayfa → Sayfa 2 / 3'ten Sayfa 1 → konum sayfası → uygulamadan çık
  const back = useRef(null);
  back.current = () => {
    if (sheet) setSheet(sheet.page === "menu" ? null : { page: "menu" });
    else if (view === "fc" && multi && page !== "p1") setPage("p1");
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

  const pick = (p) => {
    update({ place: { name: p.name, admin1: p.admin1 || null, lat: p.lat, lon: p.lon } });
    setView("fc");
    setPage("p1");
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
    <div ref={top}>
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
          <button type="button" className="placebtn" onClick={() => setView("loc")}>
            📍 {place.name} <small>değiştir</small>
          </button>
        )}
      </div>

      {view === "loc" && <Loc allModels={ALL} place={place} favorites={favorites} onPick={pick} onFavorites={(f) => update({ favorites: f })} onSheet={(p) => setSheet({ page: p })} />}

      {view === "fc" && (
        <>
          <ModelChips all={ALL} selected={selected} onToggle={toggle} />
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
          {data.status === "ok" && selModels.length === 1 && (
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

      <Sheet sheet={sheet} allModels={ALL} loaded={data.models || []} onSheet={setSheet} />
    </div>
  );
}
