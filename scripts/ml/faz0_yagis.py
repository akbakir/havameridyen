"""Faz 0 — yağış: modellerin ve ortancanın YEREL saatlik yağışa göre başarısı (6 ve 24 saatlik toplamlar).

Girdi:  ml-data/prev/hava/<model>/<istasyon>/<YYYY-MM>.json.gz   (precipitation, previous_day1…7)
        ml-data/obs/yerel_saatlik_qc.parquet (yoksa mgm_saatlik_qc.parquet) — rr, ts_model
Saat:   YEREL SAAT h (h:00–h:59) ↔ model saat h+1 → gözlem `ts_model` ile modele hizalanır.
Pencere: 6 saat = model saatleri 01–06, 07–12, 13–18, 19–24 (UTC; gözlemde 00–05 … 18–23).
         24 saat = gözlemde 00.00–23.59 UTC (model 01 … ertesi gün 00).
         Pencerenin bütün saatleri hem gözlemde hem modelde dolu olmalı.
Eşikler: 0,1 / 1 / 5 / 10 / 20 mm. Ortanca5 = ECMWF, GFS, ICON, UKMO, ARPEGE; ortanca8 = 8 model (en az 3 model).

Gözlem kalite kontrolü (bu betikte): rr < 0 ya da > 120 mm/sa → boş; YSABIT bayraklı satır → boş;
aynı sıfırdan büyük değer ≥ 6 saat üst üste → boş. İstasyon düzeyinde "kuşkulu ölçer" listesi:
24 saatlik yağışlı gün oranı ortanca8'in oranının 0,4 katından azsa (ölçer tıkalı/bozuk olabilir).

Çıktı: ml-data/faz0/
  yagis_tablo.csv        pencere × model × öncü × eşik: isabet, kaçan, yanlış alarm, doğru ret, POD, FAR, sıklık sapması, ETS
  yagis_miktar.csv       pencere × model × öncü: n, gözlem/model toplam, sapma oranı, MAE (ıslak pencerelerde)
  yagis_ay.csv           24 saat, öncü 1: model × ay — gözlem/model ıslak gün oranı ve toplam oranı
  yagis_saat.csv         öncü 1: saat (gözlem saati, UTC) × model — saatlik ≥ 0,1 mm sıklığı
  yagis_istasyon.csv     24 saat, öncü 1: istasyon × model — ıslak gün oranı, toplam oranı, ETS(1 mm)
  yagis_kuskulu.csv      kuşkulu ölçer listesi
  yagis_ozet.txt
Kullanım:  python scripts/ml/faz0_yagis.py [--test]
"""
import sys, json, gzip, time, pathlib, warnings
import numpy as np
warnings.filterwarnings("ignore", category=RuntimeWarning)
try:
    import pandas as pd
    import pyarrow  # noqa: F401
except ImportError as e:
    sys.exit(f"Eksik paket: {e.name}. Kurmak için:  python -m pip install pandas pyarrow")

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / "ml-data"; OUT = ML / "faz0"
TEST = "--test" in sys.argv
MODELS = ["ecmwf_ifs", "gfs_seamless", "icon_seamless", "ukmo_seamless", "meteofrance_seamless",
          "gem_seamless", "jma_gsm", "ecmwf_aifs025_single"]
NAMES = MODELS + ["ortanca5", "ortanca8"]; NM, NL = len(NAMES), 8
THR = [0.1, 1.0, 5.0, 10.0, 20.0]; NT = len(THR)
T0 = np.datetime64("2024-01-01T00:00")
NH = int((np.datetime64("2026-12-01T00:00") - T0) / np.timedelta64(1, "h"))
MONTH = (pd.date_range("2024-01-01", periods=NH, freq="h").month.values - 1)

def hidx(t):
    return ((np.array(t, dtype="datetime64[m]") - T0) / np.timedelta64(1, "h")).astype(np.int64)

stations = json.load(open(ROOT / "data/ml/stations.json", encoding="utf-8"))
if TEST: stations = stations[:5]
NS = len(stations)

# ---------- gözlem ----------
obsf = next((p for p in [ML / "obs/yerel_saatlik_qc.parquet", ML / "obs/mgm_saatlik_qc.parquet"] if p.exists()), None)
if obsf is None: sys.exit("Gözlem dosyası yok: ml-data/obs/yerel_saatlik_qc.parquet")
ob = pd.read_parquet(obsf, columns=["no", "rr", "ts_model", "qc"])
ob = ob[ob.rr.notna() & (ob.rr >= 0) & (ob.rr <= 120) & ~ob.qc.fillna("").str.contains("YSABIT")]
tm = ob.ts_model.dt.tz_convert(None) if ob.ts_model.dt.tz is not None else ob.ts_model
ob["i"] = ((tm.values.astype("datetime64[m]") - T0) / np.timedelta64(1, "h")).astype(np.int64)
ob = ob[(ob.i >= 0) & (ob.i < NH)]
OBS = {}; stuck_total = 0
for no, g in ob.groupby("no"):
    a = np.full(NH, np.nan, np.float32); a[g.i.values] = g.rr.values
    # takılı ölçer: aynı > 0 değer ≥ 6 saat üst üste
    v = np.nan_to_num(a, nan=-1); ch = np.r_[True, v[1:] != v[:-1]]; run_id = np.cumsum(ch)
    ln = np.bincount(run_id)[run_id]; bad = (ln >= 6) & (v > 0); stuck_total += int(bad.sum()); a[bad] = np.nan
    OBS[int(no)] = a
del ob
print(f"Gözlem: {obsf.name}, {len(OBS)} istasyon; takılı ölçer nedeniyle boşaltılan saat: {stuck_total}")

# ---------- pencereler ----------
# 6 saat: model saatleri 6k+1 … 6k+6  → indeks başlangıcı 1 (T0+1h); 24 saat: 24d+1 … 24d+24
def windows(x, w):
    """(…, NH) → (…, NW) toplam; eksik saat varsa NaN"""
    n = (NH - 1) // w
    y = x[..., 1:1 + n * w].reshape(*x.shape[:-1], n, w)
    s = y.sum(axis=-1); s[np.isnan(y).any(axis=-1)] = np.nan
    return s

WIN = {"6s": 6, "24s": 24}
CT = {k: np.zeros((NM, NL, NT, 4), np.int64) for k in WIN}           # hit, miss, fa, cn
AM = {k: np.zeros((NM, NL, 5), np.float64) for k in WIN}             # n, sum_o, sum_f, sum_abs(ıslak), n_ıslak
AYm = np.zeros((NM, 12, 5), np.float64)                              # n, wet_o, wet_f, sum_o, sum_f (24s, öncü1)
SAAT = np.zeros((NM + 1, 24, 2), np.int64)                           # (gözlem=son satır) n, ≥0,1
IST = np.zeros((NS, NM, 6), np.float64)                              # n, wet_o, wet_f, sum_o, sum_f, ets parçaları sonra
IST_CT = np.zeros((NS, NM, 4), np.int64)                             # 24s öncü1 1 mm tablosu
w24_month = MONTH[1:1 + ((NH - 1) // 24) * 24].reshape(-1, 24)[:, 0]
HOUR_OBS = (np.arange(NH) - 1) % 24                                  # model saati → gözlem saati

def load_prev(model, sid):
    g = np.full((NL, NH), np.nan, np.float32)
    d = ML / "prev" / "hava" / model / sid
    if not d.exists(): return g
    for f in sorted(d.glob("*.json.gz")):
        h = json.load(gzip.open(f))["hourly"]
        ix = hidx(h["time"]); ok = (ix >= 0) & (ix < NH)
        for n in range(NL):
            v = h.get("precipitation" if n == 0 else f"precipitation_previous_day{n}")
            if v is None: continue
            v = np.array([np.nan if x is None else x for x in v], np.float32)
            g[n, ix[ok]] = v[ok]
    return g

t0 = time.time()
for si, s in enumerate(stations):
    obs = OBS.get(int(s["yerel"])) if s.get("yerel") else None
    if obs is None: print(f"[{si+1}/{NS}] {s['id']}: gözlem yok"); continue
    P = np.stack([load_prev(m, s["id"]) for m in MODELS])
    cnt5 = np.sum(~np.isnan(P[:5]), 0); cnt8 = np.sum(~np.isnan(P), 0)
    F = np.concatenate([P, np.where(cnt5 >= 3, np.nanmedian(P[:5], 0), np.nan)[None],
                        np.where(cnt8 >= 3, np.nanmedian(P, 0), np.nan)[None]])          # (NM, NL, NH)
    # saatlik sıklık (öncü 1)
    ko = ~np.isnan(obs)
    SAAT[NM, :, 0] += np.bincount(HOUR_OBS[ko], minlength=24); SAAT[NM, :, 1] += np.bincount(HOUR_OBS[ko & (obs >= 0.1)], minlength=24)
    for mi in range(NM):
        f = F[mi, 1]; k = ~np.isnan(f) & ko
        SAAT[mi, :, 0] += np.bincount(HOUR_OBS[k], minlength=24); SAAT[mi, :, 1] += np.bincount(HOUR_OBS[k & (f >= 0.1)], minlength=24)
    for wk, w in WIN.items():
        O = windows(obs, w); FW = windows(F, w)                                          # (NW,), (NM, NL, NW)
        for mi in range(NM):
            for n in range(NL):
                f = FW[mi, n]; k = ~np.isnan(f) & ~np.isnan(O)
                if not k.any(): continue
                o, ff = O[k], f[k]
                for ti, th in enumerate(THR):
                    a, b = o >= th, ff >= th
                    CT[wk][mi, n, ti] += [np.sum(a & b), np.sum(a & ~b), np.sum(~a & b), np.sum(~a & ~b)]
                wet = (o >= 0.1) | (ff >= 0.1)
                AM[wk][mi, n] += [k.sum(), o.sum(), ff.sum(), np.abs(ff - o)[wet].sum(), wet.sum()]
                if wk == "24s" and n == 1:
                    mo = w24_month[:len(O)][k]
                    for c, val in enumerate([np.ones_like(o), o >= 0.1, ff >= 0.1, o, ff]):
                        AYm[mi, :, c] += np.bincount(mo, weights=val.astype(np.float64), minlength=12)
                    IST[si, mi, :5] += [k.sum(), (o >= 0.1).sum(), (ff >= 0.1).sum(), o.sum(), ff.sum()]
                    a, b = o >= 1, ff >= 1
                    IST_CT[si, mi] += [np.sum(a & b), np.sum(a & ~b), np.sum(~a & b), np.sum(~a & ~b)]
    el = time.time() - t0
    print(f"[{si+1}/{NS}] {s['id']} tamam · {el/60:.1f} dk · kalan ≈ {el/(si+1)*(NS-si-1)/60:.0f} dk", flush=True)

# ---------- çıktılar ----------
OUT.mkdir(parents=True, exist_ok=True)
def skor(h, m, fa, cn):
    n = h + m + fa + cn
    with np.errstate(all="ignore"):
        pod = h / (h + m); far = fa / (h + fa); fb = (h + fa) / (h + m)
        hr = (h + m) * (h + fa) / n; ets = (h - hr) / (h + m + fa - hr)
    return pod, far, fb, ets

rows = []
for wk in WIN:
    for mi in range(NM):
        for n in range(NL):
            for ti, th in enumerate(THR):
                h, m, fa, cn = CT[wk][mi, n, ti]
                if h + m + fa + cn == 0: continue
                pod, far, fb, ets = skor(h, m, fa, cn)
                rows.append((wk, NAMES[mi], n, th, h, m, fa, cn, round(pod, 3), round(far, 3), round(fb, 3), round(ets, 3)))
tab = pd.DataFrame(rows, columns=["pencere", "model", "oncu_gun", "esik_mm", "isabet", "kacan", "yanlis_alarm", "dogru_ret", "pod", "far", "siklik_sapmasi", "ets"])
tab.to_csv(OUT / "yagis_tablo.csv", index=False)

rows = []
for wk in WIN:
    for mi in range(NM):
        for n in range(NL):
            c, so, sf, sae, nw = AM[wk][mi, n]
            if c == 0: continue
            rows.append((wk, NAMES[mi], n, int(c), round(so, 1), round(sf, 1), round(sf / so, 3) if so else None, round(sae / nw, 3) if nw else None))
pd.DataFrame(rows, columns=["pencere", "model", "oncu_gun", "n", "gozlem_toplam", "model_toplam", "toplam_orani", "mae_islak"]).to_csv(OUT / "yagis_miktar.csv", index=False)

rows = [(NAMES[mi], a + 1, int(AYm[mi, a, 0]), round(AYm[mi, a, 1] / AYm[mi, a, 0], 3), round(AYm[mi, a, 2] / AYm[mi, a, 0], 3),
         round(AYm[mi, a, 4] / AYm[mi, a, 3], 3) if AYm[mi, a, 3] else None) for mi in range(NM) for a in range(12) if AYm[mi, a, 0]]
pd.DataFrame(rows, columns=["model", "ay", "n", "gozlem_islak_gun", "model_islak_gun", "toplam_orani"]).to_csv(OUT / "yagis_ay.csv", index=False)

rows = []
for h in range(24):
    rows.append((h, "gozlem", int(SAAT[NM, h, 0]), round(SAAT[NM, h, 1] / max(SAAT[NM, h, 0], 1), 4)))
    for mi in range(NM):
        rows.append((h, NAMES[mi], int(SAAT[mi, h, 0]), round(SAAT[mi, h, 1] / max(SAAT[mi, h, 0], 1), 4)))
pd.DataFrame(rows, columns=["gozlem_saati_utc", "kaynak", "n", "siklik_0_1mm"]).to_csv(OUT / "yagis_saat.csv", index=False)

rows = []
for si, s in enumerate(stations):
    for mi in range(NM):
        n, wo, wf, so, sf, _ = IST[si, mi]
        if n == 0: continue
        h, m, fa, cn = IST_CT[si, mi]; ets = skor(h, m, fa, cn)[3]
        rows.append((s["id"], s.get("name", ""), s.get("elev"), NAMES[mi], int(n), round(wo / n, 3), round(wf / n, 3), round(so, 1), round(sf, 1),
                     round(sf / so, 2) if so else None, round(float(ets), 3)))
ist = pd.DataFrame(rows, columns=["istasyon", "ad", "rakim", "model", "gun", "gozlem_islak", "model_islak", "gozlem_toplam", "model_toplam", "toplam_orani", "ets_1mm"])
ist.to_csv(OUT / "yagis_istasyon.csv", index=False)
o8 = ist[ist.model == "ortanca8"].copy()
o8["oran"] = o8.gozlem_islak / o8.model_islak
kus = o8[(o8.oran < 0.4) & (o8.gun >= 200)].sort_values("oran")
kus.to_csv(OUT / "yagis_kuskulu.csv", index=False)

t24 = tab[(tab.pencere == "24s")]
with open(OUT / "yagis_ozet.txt", "w", encoding="utf-8") as fo:
    fo.write(f"Faz 0 — yağış ({NS} istasyon, {time.strftime('%Y-%m-%d %H:%M')}); takılı ölçer boşaltılan saat: {stuck_total}\n\n")
    for th in (1.0, 10.0):
        x = t24[t24.esik_mm == th]
        fo.write(f"24 saat ≥ {th} mm — ETS (model × öncü günü):\n" + x.pivot(index="model", columns="oncu_gun", values="ets").reindex(NAMES).to_string() + "\n\n")
        fo.write(f"24 saat ≥ {th} mm — sıklık sapması (1 = doğru sıklık):\n" + x.pivot(index="model", columns="oncu_gun", values="siklik_sapmasi").reindex(NAMES).to_string() + "\n\n")
    fo.write(f"Kuşkulu ölçer (gözlenen ıslak gün < 0,4 × ortanca8): {len(kus)} istasyon\n" + kus[["istasyon", "ad", "gozlem_islak", "model_islak", "oran"]].to_string(index=False) + "\n")
print(open(OUT / "yagis_ozet.txt", encoding="utf-8").read())
print(f"Çıktılar: {OUT} · toplam {(time.time()-t0)/60:.1f} dk")
