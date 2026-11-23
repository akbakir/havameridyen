"""Faz 1 ek — arayüzde (web + mobil) gösterilen günlük yağışın birebir testi, farklı model seçimleriyle.

Arayüz kuralı (lib/consensus.js dayCond → windowCond, lib/agreement.js condAt, packWet):
  - Model "yağışlı": TSİ gün toplamı ≥ 0,2 mm VE günün en az bir saati ≥ 0,1 mm (gün toplamı için ≥ 12 saat).
  - Gün "yağışlı": seçili (verisi olan) modellerin EN AZ YARISI yağışlıysa (≥ n/2; 5'te 3, 6'da 3, 8'de 4).
  - Gösterilen miktar: gün yağışlıysa yağış veren modellerin gün toplamlarının ortancası; değilse gösterilmez (= 0).
Ağırlıklı sürüm (aynı kural, eşit oy yerine ağırlıklı oy ve ağırlıklı ortanca):
  - Ağırlık = istasyon × öncü günü başına, eğitim yılında modelin "yağışlı gün" Brier hatasının tersi
    (w = 1 / (BS + 0,02)); gün yağışlı ⇔ yağışlı modellerin ağırlık payı ≥ 0,5; miktar = yağış verenlerin ağırlıklı ortancası.
  - Ağırlıklar genişleyen pencereyle kurulur: her test ayı için o aydan ÖNCEKİ bütün günler (Oca 2024'ten başlayarak).
    Previous Runs arşivinde öncü ≥ 1 verisi geç başlar (UKMO Ağu 2024, AIFS Şub 2025, IFS Eki 2025); geçmişte
    100 günden az verisi olan model, setteki öteki modellerin ağırlıklarının ortancasını alır (nötr).
Model setleri: V5 (varsayılan: IFS, GFS, ICON, UKMO, ARPEGE), V5−ARPEGE, IFS+ICON+UKMO, V5+GEM, V5+AIFS, V5+JMA, 8 model.
  ARPEGE ~4. günden, ICON ve UKMO 7. günden sonra yok: arayüz gibi verisi olan modeller kullanılır.
Ortak örneklem: gözlem dolu ve bütün setlerde en az 3 model verisi olan günler. Test: Kas 2025 – Eki 2026.
Gözlemde yağışlı gün = gün toplamı ≥ 0,2 mm.
Çıktı: ml-data/faz1/arayuz_yagis.csv, arayuz_yagis_ozet.txt
Kullanım: python scripts/ml/faz1_arayuz_yagis.py [--test]
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
ML = ROOT / "ml-data"; OUT = ML / "faz1"
TEST = "--test" in sys.argv
MODELS = ["ecmwf_ifs", "gfs_seamless", "icon_seamless", "ukmo_seamless", "meteofrance_seamless",
          "gem_seamless", "jma_gsm", "ecmwf_aifs025_single"]
IFS, GFS, ICON, UKMO, ARP, GEM, JMA, AIFS = range(8)
SETS = {"V5": [IFS, GFS, ICON, UKMO, ARP], "V5-ARPEGE": [IFS, GFS, ICON, UKMO], "IFS+ICON+UKMO": [IFS, ICON, UKMO],
        "V5+GEM": [IFS, GFS, ICON, UKMO, ARP, GEM], "V5+AIFS": [IFS, GFS, ICON, UKMO, ARP, AIFS],
        "V5+JMA": [IFS, GFS, ICON, UKMO, ARP, JMA], "8 model": list(range(8))}
NL = 8
T0 = np.datetime64("2024-01-01T00:00")
NH = int((np.datetime64("2026-12-01T00:00") - T0) / np.timedelta64(1, "h"))
OFF = 21; ND = (NH - OFF) // 24; DSTART = OFF + 24 * np.arange(ND)
def hix(s): return int((np.datetime64(s) - T0) / np.timedelta64(1, "h"))
TR_END, TE_END = hix("2025-11-01T00:00") - 3, hix("2026-11-01T00:00") - 3
DSPLIT = np.where(DSTART < TR_END, 0, np.where(DSTART < TE_END, 1, 2))
_dd = (T0 + (DSTART + 3).astype("timedelta64[h]")).astype("datetime64[M]")          # TSİ günün ayı
DMON = (_dd - np.datetime64("2024-01", "M")).astype(int)                            # 0 = Oca 2024
TEST_MONTHS = sorted(set(DMON[DSPLIT == 1].tolist()))
MIN_TR = 100
THR = [1.0, 5.0, 10.0, 20.0]
NV = 2  # 0 eşit oy, 1 ağırlıklı

def hidx(t):
    return ((np.array(t, dtype="datetime64[m]") - T0) / np.timedelta64(1, "h")).astype(np.int64)

def load(model, sid):
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

def days(x, min_hours):
    y = x[..., OFF:OFF + ND * 24].reshape(*x.shape[:-1], ND, 24)
    c = np.sum(~np.isnan(y), -1); s = np.nansum(y, -1); mx = np.nanmax(np.where(np.isnan(y), -1, y), -1)
    s[c < min_hours] = np.nan; mx[c < min_hours] = np.nan
    return s, mx

def wmedian(vals, w):
    """sütun başına ağırlıklı ortanca; vals, w: (m, D), NaN = yok"""
    out = np.full(vals.shape[1], np.nan)
    for d in np.where(np.any(~np.isnan(vals), 0))[0]:
        k = ~np.isnan(vals[:, d]); v = vals[k, d]; ww = w[k, d]
        o = np.argsort(v); v, ww = v[o], ww[o]; c = np.cumsum(ww) / ww.sum()
        out[d] = v[np.searchsorted(c, 0.5)]
    return out

stations = json.load(open(ROOT / "data/ml/stations.json", encoding="utf-8"))
if TEST: stations = stations[:5]
NS = len(stations)
obsf = next((p for p in [ML / "obs/yerel_saatlik_qc.parquet", ML / "obs/mgm_saatlik_qc.parquet"] if p.exists()), None)
if obsf is None: sys.exit("Gözlem dosyası yok")
ob = pd.read_parquet(obsf, columns=["no", "rr", "ts_model", "qc"])
ob = ob[ob.rr.notna() & (ob.rr >= 0) & (ob.rr <= 120) & ~ob.qc.fillna("").str.contains("YSABIT")]
tm = ob.ts_model.dt.tz_convert(None) if ob.ts_model.dt.tz is not None else ob.ts_model
ob["i"] = ((tm.values.astype("datetime64[m]") - T0) / np.timedelta64(1, "h")).astype(np.int64)
ob = ob[(ob.i >= 0) & (ob.i < NH)]
OR = {}
for no, g in ob.groupby("no"):
    a = np.full(NH, np.nan, np.float32); a[g.i.values] = g.rr.values
    v = np.nan_to_num(a, nan=-1); ch = np.r_[True, v[1:] != v[:-1]]; rid = np.cumsum(ch)
    a[(np.bincount(rid)[rid] >= 6) & (v > 0)] = np.nan
    OR[int(no)] = a
del ob

SN = list(SETS)
# toplayıcı: set × sürüm × öncü × [n, yağışlı gün h/m/fa/cn, Σo, Σf, Σ|f-o| ıslak, n ıslak, (h,m,fa,cn)×THR]
A = np.zeros((len(SN), NV, NL, 4 + 4 + 4 * len(THR) + 1))
WSUM = np.zeros((NL, 8)); WCNT = np.zeros((NL, 8))       # ortalama ağırlıklar (rapor için; yalnız kendi verisiyle kurulanlar)
WNEU = np.zeros((NL, 8)); WTOT = np.zeros(NL)            # nötr ağırlık alan ay sayısı
t0 = time.time()
for si, s in enumerate(stations):
    no = int(s["yerel"]) if s.get("yerel") else None
    if no not in OR: continue
    O, _ = days(OR[no], 24)
    P = np.stack([load(m, s["id"]) for m in MODELS])
    T, MX = days(P, 12)                                     # (8, NL, ND)
    for n in range(NL):
        Tn, Mn = T[:, n], MX[:, n]
        avail = ~np.isnan(Tn)
        wet = avail & (Tn >= 0.2 - 1e-9) & (Mn >= 0.1 - 1e-9)
        # ağırlıklar: genişleyen pencere, her test ayı için o aydan önceki günler; istasyon × öncü
        ow = (O >= 0.2); okO = ~np.isnan(O)
        WM = np.zeros((8, ND))                              # günün (test ayının) model ağırlıkları; -1 = nötr
        for mi in TEST_MONTHS:
            past = okO & (DMON < mi); here = DMON == mi
            w = np.full(8, np.nan)
            for m in range(8):
                k = past & avail[m]
                if k.sum() >= MIN_TR: w[m] = 1.0 / (np.mean(wet[m, k] != ow[k]) + 0.02)
            WTOT[n] += 1; WNEU[n] += np.isnan(w)
            if not np.all(np.isnan(w)):
                WSUM[n] += np.where(np.isnan(w), 0, w / np.nanmax(w)); WCNT[n] += ~np.isnan(w)
            WM[:, here] = np.where(np.isnan(w), -1.0, w)[:, None]
        te = (DSPLIT == 1) & ~np.isnan(O)
        for idx in SETS.values(): te &= avail[idx].sum(0) >= 3
        if te.sum() == 0: continue
        o = O[te]; ow_te = o >= 0.2
        for j, idx in enumerate(SN):
            ids = SETS[idx]
            av, wt, tt = avail[ids][:, te], wet[ids][:, te], Tn[ids][:, te]
            nn = av.sum(0)
            for v_ in range(NV):
                if v_ == 0:
                    daywet = wt.sum(0) >= nn / 2
                    vals = np.where(wt, tt, np.nan)
                    amt = np.nanmedian(vals, 0)
                else:
                    W0 = WM[ids][:, te]
                    neu = np.nanmedian(np.where(W0 > 0, W0, np.nan), 0); neu = np.where(np.isnan(neu), 1.0, neu)
                    W = np.where(av, np.where(W0 > 0, W0, neu[None, :]), 0.0)
                    share = np.where(W.sum(0) > 0, (W * wt).sum(0) / W.sum(0), 0)
                    daywet = share >= 0.5
                    vals = np.where(wt, tt, np.nan); amt = wmedian(vals, np.where(wt, W, 0) + 1e-9)
                f = np.where(daywet, np.nan_to_num(amt), 0.0)
                h = np.sum(daywet & ow_te); m_ = np.sum(~daywet & ow_te); fa = np.sum(daywet & ~ow_te); cn = np.sum(~daywet & ~ow_te)
                wetd = (o >= 0.1) | (f >= 0.1)
                row = [o.size, h, m_, fa, cn, o.sum(), f.sum(), np.abs(f - o)[wetd].sum(), wetd.sum()]
                for th in THR:
                    a, b = o >= th, f >= th
                    row += [np.sum(a & b), np.sum(a & ~b), np.sum(~a & b), np.sum(~a & ~b)]
                A[j, v_, n] += row
    el = time.time() - t0
    print(f"[{si+1}/{NS}] {s['id']} tamam · {el/60:.1f} dk · kalan ≈ {el/(si+1)*(NS-si-1)/60:.0f} dk", flush=True)

def ets(h, m, fa, cn):
    hr = (h + m) * (h + fa) / max(h + m + fa + cn, 1); den = h + m + fa - hr
    return (h - hr) / den if den else np.nan

OUT.mkdir(parents=True, exist_ok=True)
rows = []
for j, sn in enumerate(SN):
    for v_ in range(NV):
        for n in range(NL):
            r = A[j, v_, n]
            if r[0] == 0: continue
            h, m_, fa, cn = r[1:5]
            out = dict(set=sn, surum=["esit", "agirlikli"][v_], oncu_gun=n, gun=int(r[0]),
                       yagisli_gun_ets=round(ets(h, m_, fa, cn), 3), yagisli_gun_pod=round(h / (h + m_), 3),
                       yagisli_gun_far=round(fa / (h + fa), 3) if h + fa else None, yagisli_gun_siklik=round((h + fa) / (h + m_), 3),
                       toplam_orani=round(r[6] / r[5], 3) if r[5] else None, mae_islak=round(r[7] / r[8], 3) if r[8] else None)
            for t_i, th in enumerate(THR):
                hh, mm, ff, cc = r[9 + 4 * t_i: 13 + 4 * t_i]
                out[f"ets_{th:g}"] = round(ets(hh, mm, ff, cc), 3); out[f"fb_{th:g}"] = round((hh + ff) / (hh + mm), 3) if hh + mm else None
            rows.append(out)
df = pd.DataFrame(rows); df.to_csv(OUT / "arayuz_yagis.csv", index=False)
wavg = pd.DataFrame(np.where(WCNT > 0, WSUM / np.maximum(WCNT, 1), np.nan), columns=MODELS).round(2); wavg.index.name = "oncu_gun"
wneu = pd.DataFrame(100 * WNEU / np.maximum(WTOT[:, None], 1), columns=MODELS).round(0); wneu.index.name = "oncu_gun"
with open(OUT / "arayuz_yagis_ozet.txt", "w", encoding="utf-8") as fo:
    fo.write(f"Arayüz günlük yağış kuralı, model setleri ({NS} istasyon, {time.strftime('%Y-%m-%d %H:%M')}), test Kas 2025 – Eki 2026\n\n")
    for col, name in [("yagisli_gun_ets", "Yağışlı gün ETS (≥ 0,2 mm)"), ("yagisli_gun_siklik", "Yağışlı gün sıklık sapması"),
                      ("toplam_orani", "Gösterilen toplam / gözlem"), ("mae_islak", "Islak günlerde MAE (mm)"),
                      ("ets_1", "ETS ≥ 1 mm"), ("ets_10", "ETS ≥ 10 mm"), ("fb_10", "Sıklık sapması ≥ 10 mm"), ("ets_20", "ETS ≥ 20 mm")]:
        for v in ["esit", "agirlikli"]:
            x = df[df.surum == v].pivot(index="set", columns="oncu_gun", values=col).reindex(SN)
            fo.write(f"{name} — {'eşit oy' if v == 'esit' else 'ağırlıklı'}:\n" + x.to_string() + "\n\n")
    fo.write("Ortalama ağırlık (en iyi model = 1), öncü günü × model:\n" + wavg.to_string() + "\n")
    fo.write("\nNötr ağırlık alan test ayı oranı (%; geçmişte < 100 gün veri), öncü günü × model:\n" + wneu.to_string() + "\n")
print(open(OUT / "arayuz_yagis_ozet.txt", encoding="utf-8").read())
print(f"Çıktılar: {OUT} · toplam {(time.time()-t0)/60:.1f} dk")
