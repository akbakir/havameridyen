"""Faz 1 — sapma düzeltme, ağırlıklı ortanca, EMOS (sıcaklık) ve yağış olasılığı / miktarı; zamana göre ayrılmış test.

Eğitim: 1 Oca 2024 – 31 Eki 2025 (22 ay) · Test: 1 Kas 2025 – 31 Eki 2026 (12 ay, bütün mevsimler)
Model verisi: Previous Runs (öncü günü 0–7). Gözlem: YEREL saatlik (kalite kontrollü).

SICAKLIK (saatlik, istasyon başına, öncü günü başına):
  ortanca5_ham, ortanca8_ham, icon_ham        sitedeki gibi / en iyi tek model
  ortanca5_sd, ortanca8_sd                    her modelden istasyon × saat × ay sapması çıkarılıp ortanca
                                              (sapma = Σhata / (n + 20); az örnekli hücreler sıfıra büzülür)
  agirlikli                                   sapması düzeltilmiş modellerin 1/MSE ağırlıklı ortalaması
  emos                                        μ = a + Σ bᵢ·modelᵢ (sapması düzeltilmiş, ridge), σ² = c + d·dağınıklık²
  Ölçütler: MAE, RMSE, sapma; EMOS için CRPS ve %80 aralığın kapsama oranı.
  Bütün yöntemler aynı saatlerde (hepsinin değeri olan) karşılaştırılır.

YAĞIŞ (24 saatlik toplam, 00–24 UTC; en az 5 model):
  Olasılık (≥ 1 mm, ≥ 10 mm): iklim (istasyonun eğitimdeki sıklığı), oy (eşiği aşan model oranı),
                              lojistik (oy, log ortanca/ortalama/maks, iklim; öncü başına, bütün istasyonlar)
                              → Brier, Brier beceri skoru (iklime göre), güvenilirlik tablosu
  Miktar: ortanca8, ortalama8, olcekli (ortanca × istasyon-mevsim katsayısı), kantil (ortanca → gözlem
          dağılımına kantil eşleme, istasyon başına) → toplam oranı, ıslak günlerde MAE, ≥10 mm ETS ve sıklık sapması

Çıktı: ml-data/faz1/  sicaklik.csv, sicaklik_istasyon.csv, yagis_olasilik.csv, yagis_guvenilirlik.csv,
                      yagis_miktar.csv, faz1_ozet.txt
Kullanım:  python scripts/ml/faz1.py [--test]     (tam çalışma ~30–60 dk)
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
NMOD, NL = len(MODELS), 8
T0 = np.datetime64("2024-01-01T00:00")
NH = int((np.datetime64("2026-12-01T00:00") - T0) / np.timedelta64(1, "h"))
def hix(s): return int((np.datetime64(s) - T0) / np.timedelta64(1, "h"))
TR_END, TE_END = hix("2025-11-01T00:00"), hix("2026-11-01T00:00")
DT = pd.date_range("2024-01-01", periods=NH, freq="h")
HOUR = DT.hour.values; MONTH = DT.month.values - 1
SPLIT = np.where(np.arange(NH) < TR_END, 0, np.where(np.arange(NH) < TE_END, 1, 2))   # 0 eğitim, 1 test, 2 dışarıda

def hidx(t):
    return ((np.array(t, dtype="datetime64[m]") - T0) / np.timedelta64(1, "h")).astype(np.int64)

def load(group, var, model, sid):
    g = np.full((NL, NH), np.nan, np.float32)
    d = ML / "prev" / group / model / sid
    if not d.exists(): return g
    for f in sorted(d.glob("*.json.gz")):
        h = json.load(gzip.open(f))["hourly"]
        ix = hidx(h["time"]); ok = (ix >= 0) & (ix < NH)
        for n in range(NL):
            v = h.get(var if n == 0 else f"{var}_previous_day{n}")
            if v is None: continue
            v = np.array([np.nan if x is None else x for x in v], np.float32)
            g[n, ix[ok]] = v[ok]
    return g

def erf(x):  # Abramowitz-Stegun 7.1.26
    s = np.sign(x); x = np.abs(x); t = 1 / (1 + 0.3275911 * x)
    y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * np.exp(-x * x)
    return s * y
def crps_normal(mu, sig, o):
    z = (o - mu) / sig
    return sig * (z * erf(z / np.sqrt(2)) + 2 * np.exp(-z * z / 2) / np.sqrt(2 * np.pi) - 1 / np.sqrt(np.pi))

# ---------- istasyonlar ve gözlem ----------
stations = json.load(open(ROOT / "data/ml/stations.json", encoding="utf-8"))
if TEST: stations = stations[:5]
NS = len(stations)
obsf = next((p for p in [ML / "obs/yerel_saatlik_qc.parquet", ML / "obs/mgm_saatlik_qc.parquet"] if p.exists()), None)
if obsf is None: sys.exit("Gözlem dosyası yok: ml-data/obs/yerel_saatlik_qc.parquet")
ob = pd.read_parquet(obsf, columns=["no", "t", "rr", "ts", "ts_model", "qc"])
qc = ob.qc.fillna("")
def to_idx(col):
    c = col.dt.tz_convert(None) if col.dt.tz is not None else col
    return ((c.values.astype("datetime64[m]") - T0) / np.timedelta64(1, "h")).astype(np.int64)
ob["it"] = to_idx(ob.ts); ob["ir"] = to_idx(ob.ts_model)
OT, OR = {}, {}
for no, g in ob[qc == ""].groupby("no"):
    k = (g.it >= 0) & (g.it < NH) & g.t.notna()
    a = np.full(NH, np.nan, np.float32); a[g.it[k].values] = g.t[k].values; OT[int(no)] = a
okr = ob.rr.notna() & (ob.rr >= 0) & (ob.rr <= 120) & ~qc.str.contains("YSABIT")
for no, g in ob[okr].groupby("no"):
    k = (g.ir >= 0) & (g.ir < NH)
    a = np.full(NH, np.nan, np.float32); a[g.ir[k].values] = g.rr[k].values
    v = np.nan_to_num(a, nan=-1); ch = np.r_[True, v[1:] != v[:-1]]; rid = np.cumsum(ch)
    a[(np.bincount(rid)[rid] >= 6) & (v > 0)] = np.nan
    OR[int(no)] = a
del ob, qc
print(f"Gözlem: {obsf.name} · sıcaklık {len(OT)}, yağış {len(OR)} istasyon")

# ---------- sıcaklık ----------
TM = ["ortanca5_ham", "ortanca8_ham", "icon_ham", "ortanca5_sd", "ortanca8_sd", "agirlikli", "emos"]
TA = np.zeros((len(TM), NL, 4))                      # n, Σe, Σ|e|, Σe²
TEX = np.zeros((NL, 3))                              # emos: Σcrps, kapsama80, n
TIST = np.zeros((NS, len(TM), 2))                    # öncü 1: n, Σ|e|
SHRINK = 20.0

def temp_station(si, P, obs):
    hm = HOUR * 12 + MONTH
    for n in range(NL):
        X = P[:, n]                                                   # (8, NH)
        tr = (SPLIT == 0) & ~np.isnan(obs); te = (SPLIT == 1) & ~np.isnan(obs)
        if te.sum() < 500 or tr.sum() < 2000: continue
        cov = np.array([np.mean(~np.isnan(X[m, tr])) for m in range(NMOD)])
        av = np.where(cov >= 0.8)[0]
        if len(av) < 3: continue
        # 1) istasyon × saat × ay sapması
        Xc = X.copy()
        for m in av:
            k = tr & ~np.isnan(X[m]); e = X[m, k] - obs[k]
            se = np.bincount(hm[k], e, 288); cn = np.bincount(hm[k], minlength=288)
            Xc[m] = X[m] - (se / (cn + SHRINK))[hm]
        F = {}
        with np.errstate(all="ignore"):
            c5 = np.sum(~np.isnan(X[:5]), 0); c8 = np.sum(~np.isnan(X), 0)
            F["ortanca5_ham"] = np.where(c5 >= 3, np.nanmedian(X[:5], 0), np.nan)
            F["ortanca8_ham"] = np.where(c8 >= 3, np.nanmedian(X, 0), np.nan)
            F["icon_ham"] = X[2]
            F["ortanca5_sd"] = np.where(c5 >= 3, np.nanmedian(Xc[:5], 0), np.nan)
            F["ortanca8_sd"] = np.where(c8 >= 3, np.nanmedian(Xc, 0), np.nan)
            # 2) 1/MSE ağırlıklı
            w = np.zeros(NMOD)
            for m in av:
                k = tr & ~np.isnan(Xc[m]); w[m] = 1 / max(np.mean((Xc[m, k] - obs[k]) ** 2), 0.05)
            W = np.where(np.isnan(Xc), 0, w[:, None]); num = np.nansum(np.where(np.isnan(Xc), 0, Xc) * W, 0); den = W.sum(0)
            F["agirlikli"] = np.where(den > 0, num / den, np.nan)
        # 3) EMOS (ridge + yayılım)
        Z = Xc[av]; full = ~np.isnan(Z).any(0)
        ktr = tr & full; kte = te & full
        if ktr.sum() > 1000:
            A = np.c_[np.ones(ktr.sum()), Z[:, ktr].T]; lam = np.eye(A.shape[1]) * 1.0; lam[0, 0] = 0
            coef = np.linalg.solve(A.T @ A + lam, A.T @ obs[ktr])
            mu = np.full(NH, np.nan); mu[full] = np.c_[np.ones(full.sum()), Z[:, full].T] @ coef
            S2 = np.var(Z, 0)
            r2 = (obs[ktr] - mu[ktr]) ** 2; B = np.c_[np.ones(ktr.sum()), S2[ktr]]
            c, d = np.linalg.lstsq(B, r2, rcond=None)[0]; c, d = max(c, 0.05), max(d, 0.0)
            sig = np.sqrt(c + d * S2)
            F["emos"] = mu
        else:
            F["emos"] = np.full(NH, np.nan); sig = np.ones(NH)
        common = te.copy()
        for k in TM: common &= ~np.isnan(F[k])
        if common.sum() == 0: continue
        o = obs[common]
        for j, k in enumerate(TM):
            e = F[k][common] - o
            TA[j, n] += [e.size, e.sum(), np.abs(e).sum(), (e * e).sum()]
            if n == 1: TIST[si, j] += [e.size, np.abs(e).sum()]
        s = sig[common]; mu_ = F["emos"][common]
        TEX[n] += [crps_normal(mu_, s, o).sum(), np.sum(np.abs(o - mu_) <= 1.2816 * s), o.size]

# ---------- yağış ----------
THR = [1.0, 10.0]
RM = ["ortanca8", "ortalama8", "olcekli", "kantil"]
RA = np.zeros((len(RM), NL, 9))                      # n, Σo, Σf, Σ|f-o| ıslak, n ıslak, (10 mm) h, m, fa, cn
LOG = []                                             # olasılık satırları (bütün istasyonlar)
SEASON = np.array([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0])      # Ara-Şub, Mar-May, Haz-Ağu, Eyl-Kas

def daysum(x):
    n = (NH - 1) // 24; y = x[..., 1:1 + n * 24].reshape(*x.shape[:-1], n, 24)
    s = y.sum(-1); s[np.isnan(y).any(-1)] = np.nan; return s

DAY_SPLIT = SPLIT[1:1 + ((NH - 1) // 24) * 24].reshape(-1, 24)[:, 0]
DAY_SEASON = SEASON[MONTH[1:1 + ((NH - 1) // 24) * 24].reshape(-1, 24)[:, 0]]

def rain_station(si, P, obs):
    O = daysum(obs); W = daysum(P)                                  # (ND,), (8, NL, ND)
    for n in range(NL):
        Wn = W[:, n]; cnt = np.sum(~np.isnan(Wn), 0)
        ok = (cnt >= 5) & ~np.isnan(O)
        tr = ok & (DAY_SPLIT == 0); te = ok & (DAY_SPLIT == 1)
        if tr.sum() < 200 or te.sum() < 100: continue
        med = np.nanmedian(Wn, 0); mean = np.nanmean(Wn, 0); mx = np.nanmax(Wn, 0)
        clim = {th: np.mean(O[tr] >= th) for th in THR}
        frac = {th: np.nanmean(np.where(np.isnan(Wn), np.nan, Wn >= th), 0) for th in THR}
        for d in np.where(tr | te)[0]:
            LOG.append((n, int(DAY_SPLIT[d]), frac[1.0][d], frac[10.0][d], med[d], mean[d], mx[d], clim[1.0], clim[10.0], O[d]))
        # miktar yöntemleri
        F = {"ortanca8": med, "ortalama8": mean}
        k = np.ones(4)
        for s_ in range(4):
            m = tr & (DAY_SEASON == s_)
            so, sm = O[m].sum(), med[m].sum()
            k[s_] = np.clip(so / sm, 0.5, 3.0) if sm > 5 else 1.0
        F["olcekli"] = med * k[DAY_SEASON]
        q = np.linspace(0, 1, 201)
        qm, qo = np.quantile(med[tr], q), np.quantile(O[tr], q)
        km = np.interp(med, qm, qo); km[med <= 0] = 0; F["kantil"] = km
        o = O[te]
        for j, key in enumerate(RM):
            f = F[key][te]; wet = (o >= 0.1) | (f >= 0.1)
            a, b = o >= 10, f >= 10
            RA[j, n] += [o.size, o.sum(), f.sum(), np.abs(f - o)[wet].sum(), wet.sum(),
                         np.sum(a & b), np.sum(a & ~b), np.sum(~a & b), np.sum(~a & ~b)]

# ---------- ana döngü ----------
t0 = time.time()
for si, s in enumerate(stations):
    no = int(s["yerel"]) if s.get("yerel") else None
    if no in OT:
        temp_station(si, np.stack([load("sicaklik-ruzgar", "temperature_2m", m, s["id"]) for m in MODELS]), OT[no])
    if no in OR:
        rain_station(si, np.stack([load("hava", "precipitation", m, s["id"]) for m in MODELS]), OR[no])
    el = time.time() - t0
    print(f"[{si+1}/{NS}] {s['id']} tamam · {el/60:.1f} dk · kalan ≈ {el/(si+1)*(NS-si-1)/60:.0f} dk", flush=True)

# ---------- yağış olasılığı: lojistik ----------
L = pd.DataFrame(LOG, columns=["oncu", "split", "oy1", "oy10", "ort", "ortalama", "maks", "iklim1", "iklim10", "gozlem"])
def logit(p): p = np.clip(p, 1e-3, 1 - 1e-3); return np.log(p / (1 - p))
def fit_logistic(X, y, lam=1.0, it=30):
    b = np.zeros(X.shape[1])
    for _ in range(it):
        p = 1 / (1 + np.exp(-(X @ b))); W = p * (1 - p)
        H = X.T @ (X * W[:, None]) + lam * np.eye(X.shape[1]); g = X.T @ (y - p) - lam * b
        step = np.linalg.solve(H, g); b += step
        if np.abs(step).max() < 1e-6: break
    return b
PROB, REL = [], []
for n in range(NL):
    d = L[L.oncu == n]
    if d.empty: continue
    for th, oy, ik in ((1.0, "oy1", "iklim1"), (10.0, "oy10", "iklim10")):
        X = np.c_[np.ones(len(d)), d[oy], np.log1p(d.ort), np.log1p(d.ortalama), np.log1p(d.maks), logit(d[ik])]
        y = (d.gozlem >= th).values.astype(float); tr = (d.split == 0).values; te = (d.split == 1).values
        if tr.sum() < 1000 or te.sum() < 500: continue
        b = fit_logistic(X[tr], y[tr])
        P = {"iklim": d[ik].values, "oy": d[oy].values, "lojistik": 1 / (1 + np.exp(-(X @ b)))}
        bs_clim = np.mean((P["iklim"][te] - y[te]) ** 2)
        for k_, p in P.items():
            bs = np.mean((p[te] - y[te]) ** 2)
            PROB.append((n, th, k_, int(te.sum()), round(float(bs), 5), round(1 - bs / bs_clim, 4)))
            if n == 1:
                bins = np.minimum((p[te] * 10).astype(int), 9)
                for bi in range(10):
                    m = bins == bi
                    if m.any(): REL.append((th, k_, bi / 10 + 0.05, int(m.sum()), round(float(p[te][m].mean()), 4), round(float(y[te][m].mean()), 4)))

# ---------- çıktılar ----------
OUT.mkdir(parents=True, exist_ok=True)
rows = []
for j, k in enumerate(TM):
    for n in range(NL):
        c, se, sae, see = TA[j, n]
        if c == 0: continue
        r = [k, n, int(c), round(se / c, 3), round(sae / c, 3), round(np.sqrt(see / c), 3)]
        if k == "emos" and TEX[n, 2]: r += [round(TEX[n, 0] / TEX[n, 2], 3), round(TEX[n, 1] / TEX[n, 2], 3)]
        else: r += [None, None]
        rows.append(r)
ts = pd.DataFrame(rows, columns=["yontem", "oncu_gun", "n", "sapma", "mae", "rmse", "crps", "kapsama80"])
ts.to_csv(OUT / "sicaklik.csv", index=False)
rows = [(s["id"], s.get("name", ""), s.get("elev"), TM[j], int(TIST[si, j, 0]), round(TIST[si, j, 1] / TIST[si, j, 0], 3))
        for si, s in enumerate(stations) for j in range(len(TM)) if TIST[si, j, 0]]
pd.DataFrame(rows, columns=["istasyon", "ad", "rakim", "yontem", "n", "mae_oncu1"]).to_csv(OUT / "sicaklik_istasyon.csv", index=False)
pr = pd.DataFrame(PROB, columns=["oncu_gun", "esik_mm", "yontem", "n", "brier", "bss_iklime_gore"]); pr.to_csv(OUT / "yagis_olasilik.csv", index=False)
pd.DataFrame(REL, columns=["esik_mm", "yontem", "kutu", "n", "tahmin_ort", "gozlenen_siklik"]).to_csv(OUT / "yagis_guvenilirlik.csv", index=False)
rows = []
for j, k in enumerate(RM):
    for n in range(NL):
        c, so, sf, sae, nw, h, m, fa, cn = RA[j, n]
        if c == 0: continue
        hr = (h + m) * (h + fa) / max(h + m + fa + cn, 1)
        ets = (h - hr) / (h + m + fa - hr) if (h + m + fa - hr) else np.nan
        rows.append((k, n, int(c), round(sf / so, 3) if so else None, round(sae / nw, 3) if nw else None,
                     round(ets, 3), round((h + fa) / (h + m), 3) if (h + m) else None))
rm = pd.DataFrame(rows, columns=["yontem", "oncu_gun", "gun", "toplam_orani", "mae_islak", "ets_10mm", "siklik_sapmasi_10mm"])
rm.to_csv(OUT / "yagis_miktar.csv", index=False)

with open(OUT / "faz1_ozet.txt", "w", encoding="utf-8") as fo:
    fo.write(f"Faz 1 ({NS} istasyon, {time.strftime('%Y-%m-%d %H:%M')}) · eğitim Oca 2024–Eki 2025, test Kas 2025–Eki 2026\n\n")
    fo.write("SICAKLIK MAE (°C), yöntem × öncü günü:\n" + ts.pivot(index="yontem", columns="oncu_gun", values="mae").reindex(TM).to_string() + "\n\n")
    fo.write("EMOS CRPS ve %80 aralık kapsama:\n" + ts[ts.yontem == "emos"][["oncu_gun", "crps", "kapsama80"]].to_string(index=False) + "\n\n")
    if len(pr):
        for th in THR:
            fo.write(f"YAĞIŞ ≥ {th} mm/gün — Brier beceri skoru (iklime göre; yüksek iyi):\n" +
                     pr[pr.esik_mm == th].pivot(index="yontem", columns="oncu_gun", values="bss_iklime_gore").to_string() + "\n\n")
    fo.write("YAĞIŞ MİKTARI — toplam oranı (model/gözlem):\n" + rm.pivot(index="yontem", columns="oncu_gun", values="toplam_orani").reindex(RM).to_string() + "\n\n")
    fo.write("YAĞIŞ ≥ 10 mm/gün — ETS:\n" + rm.pivot(index="yontem", columns="oncu_gun", values="ets_10mm").reindex(RM).to_string() + "\n")
print(open(OUT / "faz1_ozet.txt", encoding="utf-8").read())
print(f"Çıktılar: {OUT} · toplam {(time.time()-t0)/60:.1f} dk")
