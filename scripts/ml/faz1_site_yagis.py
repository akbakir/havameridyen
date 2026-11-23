"""Faz 1 ek — sitedeki günlük yağış kuralının testi (aynı eğitim/test ayrımı).

Sitedeki kural (lib/consensus.js daily → packWet, RAIN_DAY_DEFAULT = 0,2 mm):
  1. Gün = TSİ takvim günü; her modelin günlük toplamı = o günün model saatlerinin (yerel 00 … 23) toplamı,
     en az 12 saat varsa (DAY_MIN_HOURS).
  2. Gün toplamı ≥ 0,2 mm olan (yağış veren) modeller varsa onların ortancası, yoksa bütün modellerin ortancası.
Gözlem: YEREL saatlik, `ts_model` ile hizalı; aynı yerel günün 24 saati de dolu olmalı.

Yöntemler (öncü günü 0–7, test yılı Kas 2025 – Eki 2026):
  site5, site8         sitedeki kural (varsayılan 5 model / 8 model)
  ortanca5, ortanca8   gün toplamlarının düz ortancası
  ortalama8            gün toplamlarının ortalaması
  kantil8, olcekli8    ortanca8'e istasyon başına kantil eşleme / istasyon × mevsim katsayısı (eğitim yılından)
Ölçütler: toplam oranı (tahmin/gözlem), ıslak günlerde MAE, 0,2 / 1 / 5 / 10 / 20 mm eşiklerinde ETS ve sıklık sapması.
Çıktı: ml-data/faz1/site_yagis.csv, site_yagis_ozet.txt
Kullanım: python scripts/ml/faz1_site_yagis.py [--test]
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
DEF5 = [0, 1, 2, 3, 4]
NL = 8
T0 = np.datetime64("2024-01-01T00:00")
NH = int((np.datetime64("2026-12-01T00:00") - T0) / np.timedelta64(1, "h"))
OFF = 21                                  # yerel (UTC+3) 2 Oca 2024 00.00 = UTC 1 Oca 21.00
ND = (NH - OFF) // 24
DSTART = OFF + 24 * np.arange(ND)         # her yerel günün ilk model saati (indeks)
def hix(s): return int((np.datetime64(s) - T0) / np.timedelta64(1, "h"))
TR_END, TE_END = hix("2025-11-01T00:00") - 3, hix("2026-11-01T00:00") - 3     # yerel gece yarısı
DSPLIT = np.where(DSTART < TR_END, 0, np.where(DSTART < TE_END, 1, 2))
DMONTH = pd.DatetimeIndex(np.datetime64("2024-01-02") + np.arange(ND).astype("timedelta64[D]")).month.values - 1
SEASON = np.array([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0])[DMONTH]
THR = [0.2, 1.0, 5.0, 10.0, 20.0]
METH = ["site5", "site8", "ortanca5", "ortanca8", "ortalama8", "kantil8", "olcekli8"]

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
    c = np.sum(~np.isnan(y), -1); s = np.nansum(y, -1)
    s[c < min_hours] = np.nan
    return s

def site_rule(T):                         # T: (m, ND) model gün toplamları
    wet = np.where(T >= 0.2 - 1e-9, T, np.nan)
    has = np.sum(~np.isnan(wet), 0) > 0
    return np.where(has, np.nanmedian(wet, 0), np.nanmedian(T, 0))

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

A = np.zeros((len(METH), NL, 5 + 4 * len(THR)))   # n, Σo, Σf, Σ|f-o| ıslak, n ıslak, (h, m, fa, cn) × eşik
t0 = time.time()
for si, s in enumerate(stations):
    no = int(s["yerel"]) if s.get("yerel") else None
    if no not in OR: continue
    O = days(OR[no], 24)
    T = days(np.stack([load(m, s["id"]) for m in MODELS]), 12)     # (8, NL, ND)
    for n in range(NL):
        Tn = T[:, n]
        c5 = np.sum(~np.isnan(Tn[DEF5]), 0); c8 = np.sum(~np.isnan(Tn), 0)
        F = {"site5": np.where(c5 >= 3, site_rule(Tn[DEF5]), np.nan), "site8": np.where(c8 >= 3, site_rule(Tn), np.nan),
             "ortanca5": np.where(c5 >= 3, np.nanmedian(Tn[DEF5], 0), np.nan), "ortanca8": np.where(c8 >= 3, np.nanmedian(Tn, 0), np.nan),
             "ortalama8": np.where(c8 >= 3, np.nanmean(Tn, 0), np.nan)}
        med = F["ortanca8"]; tr = (DSPLIT == 0) & ~np.isnan(O) & ~np.isnan(med)
        if tr.sum() < 200: continue
        q = np.linspace(0, 1, 201); km = np.interp(med, np.quantile(med[tr], q), np.quantile(O[tr], q)); km[med <= 0] = 0
        F["kantil8"] = km
        k = np.ones(4)
        for s_ in range(4):
            m_ = tr & (SEASON == s_); so, sm = O[m_].sum(), med[m_].sum()
            k[s_] = np.clip(so / sm, 0.5, 3.0) if sm > 5 else 1.0
        F["olcekli8"] = med * k[SEASON]
        te = (DSPLIT == 1) & ~np.isnan(O)
        for key in METH: te &= ~np.isnan(F[key])
        if te.sum() == 0: continue
        o = O[te]
        for j, key in enumerate(METH):
            f = F[key][te]; wet = (o >= 0.1) | (f >= 0.1)
            row = [o.size, o.sum(), f.sum(), np.abs(f - o)[wet].sum(), wet.sum()]
            for th in THR:
                a, b = o >= th, f >= th
                row += [np.sum(a & b), np.sum(a & ~b), np.sum(~a & b), np.sum(~a & ~b)]
            A[j, n] += row
    el = time.time() - t0
    print(f"[{si+1}/{NS}] {s['id']} tamam · {el/60:.1f} dk · kalan ≈ {el/(si+1)*(NS-si-1)/60:.0f} dk", flush=True)

OUT.mkdir(parents=True, exist_ok=True)
rows = []
for j, key in enumerate(METH):
    for n in range(NL):
        r = A[j, n]
        if r[0] == 0: continue
        out = dict(yontem=key, oncu_gun=n, gun=int(r[0]), toplam_orani=round(r[2] / r[1], 3) if r[1] else None,
                   mae_islak=round(r[3] / r[4], 3) if r[4] else None)
        for t_i, th in enumerate(THR):
            h, m, fa, cn = r[5 + 4 * t_i: 9 + 4 * t_i]
            hr = (h + m) * (h + fa) / max(h + m + fa + cn, 1); den = h + m + fa - hr
            out[f"ets_{th:g}"] = round((h - hr) / den, 3) if den else None
            out[f"fb_{th:g}"] = round((h + fa) / (h + m), 3) if (h + m) else None
        rows.append(out)
df = pd.DataFrame(rows); df.to_csv(OUT / "site_yagis.csv", index=False)
with open(OUT / "site_yagis_ozet.txt", "w", encoding="utf-8") as fo:
    fo.write(f"Sitedeki günlük yağış kuralı testi ({NS} istasyon, {time.strftime('%Y-%m-%d %H:%M')}), test Kas 2025 – Eki 2026, TSİ günleri\n\n")
    for col, name in [("toplam_orani", "Toplam oranı (tahmin/gözlem)"), ("mae_islak", "Islak günlerde MAE (mm)"),
                      ("ets_0.2", "ETS ≥ 0,2 mm"), ("fb_0.2", "Sıklık sapması ≥ 0,2 mm"), ("ets_1", "ETS ≥ 1 mm"),
                      ("ets_10", "ETS ≥ 10 mm"), ("fb_10", "Sıklık sapması ≥ 10 mm"), ("ets_20", "ETS ≥ 20 mm"), ("fb_20", "Sıklık sapması ≥ 20 mm")]:
        fo.write(name + ":\n" + df.pivot(index="yontem", columns="oncu_gun", values=col).reindex(METH).to_string() + "\n\n")
print(open(OUT / "site_yagis_ozet.txt", encoding="utf-8").read())
print(f"Çıktılar: {OUT} · toplam {(time.time()-t0)/60:.1f} dk")
