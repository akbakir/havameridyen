"""Faz 0 — sıcaklık: modellerin ve ortancanın gözleme göre hatası + run birleştirme kontrolü.

Girdi (C:\\dev\\havameridyen\\ml-data):
  prev/sicaklik-ruzgar/<model>/<istasyon>/<YYYY-MM>.json.gz   Previous Runs (öncü günü 0–7)
  single/<model>/<istasyon>/<YYYY-MM>.json.gz                 Single Runs (her run 0–191 saat)
  obs/yerel_saatlik_qc.parquet  (yoksa obs/mgm_saatlik_qc.parquet)   YEREL saatlik, kalite kontrollü
  data/ml/stations.json

Çıktı: ml-data/faz0/
  prev_model_oncu.csv        model × öncü günü: n, sapma, MAE, RMSE
  prev_model_oncu_saat.csv   model × öncü günü × geçerli saat (UTC)
  prev_model_oncu_ay.csv     model × öncü günü × ay
  prev_istasyon.csv          istasyon × model × öncü günü
  single_oncu_saati.csv      model × run saati × öncü saati (0–191)
  birlestirme.csv            Previous Runs = Single Runs mı? model × öncü günü: karşılaştırılan, |fark| ≤ 0,15, > 0,5, en büyük fark
  faz0_ozet.txt              kısa özet
  faz0_dizi.npz              ham toplamlar (istasyon × model × öncü × saat × ay)

Sıcaklık anlık değer: YEREL SAAT h ↔ model saat h (kaydırma yok).
Ortanca: ortanca5 = varsayılan 5 model (ECMWF, GFS, ICON, UKMO, ARPEGE), ortanca8 = 8 model; en az 3 model varsa.

Kullanım:  python scripts/ml/faz0.py            (bütün istasyonlar, ~15–40 dk)
           python scripts/ml/faz0.py --test     (ilk 5 istasyon, deneme)
"""
import sys, json, gzip, base64, time, pathlib
import numpy as np
import warnings
warnings.filterwarnings("ignore", category=RuntimeWarning)

try:
    import pandas as pd
    import pyarrow  # noqa: F401  (parquet okumak için)
except ImportError as e:
    sys.exit(f"Eksik paket: {e.name}. Kurmak için:  python -m pip install pandas pyarrow")

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / "ml-data"
OUT = ML / "faz0"
TEST = "--test" in sys.argv

MODELS = ["ecmwf_ifs", "gfs_seamless", "icon_seamless", "ukmo_seamless", "meteofrance_seamless",
          "gem_seamless", "jma_gsm", "ecmwf_aifs025_single"]
DEFAULT5 = [0, 1, 2, 3, 4]
NAMES = MODELS + ["ortanca5", "ortanca8"]
NM, NL = len(NAMES), 8                    # 10 model satırı, öncü günü 0–7
SINGLE_MODELS = [m for m in MODELS if m != "gem_seamless"]
T0 = np.datetime64("2024-01-01T00:00")
NH = int((np.datetime64("2026-12-01T00:00") - T0) / np.timedelta64(1, "h"))   # saatlik ızgara uzunluğu
HOUR = (np.arange(NH) % 24).astype(np.int16)
MONTH = (pd.date_range("2024-01-01", periods=NH, freq="h").month.values - 1).astype(np.int16)

def hidx(times):
    """'YYYY-MM-DDTHH:MM' dizisi → saatlik ızgara indeksi"""
    return ((np.array(times, dtype="datetime64[m]") - T0) / np.timedelta64(1, "h")).astype(np.int64)

# ---------- istasyonlar ve gözlem ----------
stations = json.load(open(ROOT / "data/ml/stations.json", encoding="utf-8"))
if TEST: stations = stations[:5]
NS = len(stations)

obsf = next((p for p in [ML / "obs/yerel_saatlik_qc.parquet", ML / "obs/mgm_saatlik_qc.parquet"] if p.exists()), None)
if obsf is None: sys.exit("Gözlem dosyası bulunamadı: ml-data/obs/yerel_saatlik_qc.parquet")
print(f"Gözlem: {obsf.name}")
ob = pd.read_parquet(obsf, columns=["no", "t", "ts", "qc"])
ob = ob[ob.qc.fillna("") == ""]
ob["ts"] = ob.ts.dt.tz_convert(None) if ob.ts.dt.tz is not None else ob.ts
ob["i"] = ((ob.ts.values.astype("datetime64[m]") - T0) / np.timedelta64(1, "h")).astype(np.int64)
ob = ob[(ob.i >= 0) & (ob.i < NH) & ob.t.notna()]
OBS = {}
for no, g in ob.groupby("no"):
    a = np.full(NH, np.nan, np.float32); a[g.i.values] = g.t.values; OBS[int(no)] = a
del ob
print(f"Gözlem: {len(OBS)} istasyon")

# ---------- toplayıcılar ----------
SH = (NS, NM, NL, 24, 12)
A_n, A_e, A_ae, A_ee = (np.zeros(SH, np.float64) for _ in range(4))
NR = 4                                     # run saati 00/06/12/18
SB = (len(SINGLE_MODELS), NR, 192)
B_n, B_e, B_ae, B_ee = (np.zeros(SB, np.float64) for _ in range(4))
C_cmp = np.zeros((len(SINGLE_MODELS), NL), np.int64)
C_ok = np.zeros_like(C_cmp); C_big = np.zeros_like(C_cmp); C_max = np.zeros((len(SINGLE_MODELS), NL), np.float32)

def load_prev(model, sid):
    """Previous Runs → (NL, NH) dizisi; öncü günü N = previous_dayN"""
    g = np.full((NL, NH), np.nan, np.float32)
    d = ML / "prev" / "sicaklik-ruzgar" / model / sid
    if not d.exists(): return g
    for f in sorted(d.glob("*.json.gz")):
        h = json.load(gzip.open(f))["hourly"]
        ix = hidx(h["time"]); ok = (ix >= 0) & (ix < NH)
        for n in range(NL):
            v = h.get("temperature_2m" if n == 0 else f"temperature_2m_previous_day{n}")
            if v is None: continue
            v = np.array([np.nan if x is None else x for x in v], np.float32)
            g[n, ix[ok]] = v[ok]
    return g

t_start = time.time()
for si, s in enumerate(stations):
    obs = OBS.get(int(s["yerel"])) if s.get("yerel") else None
    if obs is None:
        print(f"[{si+1}/{NS}] {s['id']}: gözlem yok, atlandı"); continue
    # --- Previous Runs ---
    P = np.stack([load_prev(m, s["id"]) for m in MODELS])          # (8, NL, NH)
    with np.errstate(all="ignore"):
        cnt5 = np.sum(~np.isnan(P[DEFAULT5]), axis=0); cnt8 = np.sum(~np.isnan(P), axis=0)
        med5 = np.where(cnt5 >= 3, np.nanmedian(P[DEFAULT5], axis=0), np.nan)
        med8 = np.where(cnt8 >= 3, np.nanmedian(P, axis=0), np.nan)
    F = np.concatenate([P, med5[None], med8[None]])                  # (NM, NL, NH)
    E = F - obs[None, None, :]
    ok = ~np.isnan(E)
    for mi in range(NM):
        for n in range(NL):
            k = ok[mi, n]
            if not k.any(): continue
            e = E[mi, n, k].astype(np.float64); hh = HOUR[k]; mm = MONTH[k]
            key = hh * 12 + mm
            A_n[si, mi, n] += np.bincount(key, minlength=288).reshape(24, 12)
            A_e[si, mi, n] += np.bincount(key, e, 288).reshape(24, 12)
            A_ae[si, mi, n] += np.bincount(key, np.abs(e), 288).reshape(24, 12)
            A_ee[si, mi, n] += np.bincount(key, e * e, 288).reshape(24, 12)
    # --- Single Runs: öncü saatine göre hata + birleştirme kontrolü ---
    for bi, m in enumerate(SINGLE_MODELS):
        d = ML / "single" / m / s["id"]
        if not d.exists(): continue
        pm = P[MODELS.index(m)]
        for f in sorted(d.glob("*.json.gz")):
            meta = json.load(gzip.open(f)); H = meta["hours"]; sc = meta["scale"][0]
            for run, b64 in meta["runs"].items():
                if not b64: continue
                v = np.frombuffer(base64.b64decode(b64), dtype="<i2")[:H].astype(np.float32)
                v[v == -32768] = np.nan; v /= sc
                r0 = int(hidx([run])[0]); rh = int(run[11:13]) // 6
                ix = r0 + np.arange(H); inb = (ix >= 0) & (ix < NH)
                lead = np.arange(H)[inb]; ixs = ix[inb]; val = v[inb]
                e = val - obs[ixs]; k = ~np.isnan(e)
                if k.any():
                    B_n[bi, rh] += np.bincount(lead[k], minlength=192)[:192]
                    B_e[bi, rh] += np.bincount(lead[k], e[k], 192)[:192]
                    B_ae[bi, rh] += np.bincount(lead[k], np.abs(e[k]), 192)[:192]
                    B_ee[bi, rh] += np.bincount(lead[k], e[k] ** 2, 192)[:192]
                # Previous Runs öncü N = bu run'ın 24N … 24N+5. saatleri mi?
                for n in range(NL):
                    L = 24 * n + np.arange(6); L = L[L < H]
                    j = r0 + L; jj = (j >= 0) & (j < NH)
                    a = pm[n, j[jj]]; b = v[L[jj]]; c = ~np.isnan(a) & ~np.isnan(b)
                    if not c.any(): continue
                    df = np.abs(a[c] - b[c])
                    C_cmp[bi, n] += c.sum(); C_ok[bi, n] += (df <= 0.15).sum(); C_big[bi, n] += (df > 0.5).sum()
                    C_max[bi, n] = max(C_max[bi, n], float(df.max()))
    el = time.time() - t_start
    print(f"[{si+1}/{NS}] {s['id']} tamam · {el/60:.1f} dk · kalan ≈ {el/(si+1)*(NS-si-1)/60:.0f} dk", flush=True)

# ---------- çıktılar ----------
OUT.mkdir(parents=True, exist_ok=True)
np.savez_compressed(OUT / "faz0_dizi.npz", n=A_n, e=A_e, ae=A_ae, ee=A_ee,
                    stations=np.array([s["id"] for s in stations]), models=np.array(NAMES))

def stats(n, e, ae, ee):
    with np.errstate(all="ignore"):
        return n, e / n, ae / n, np.sqrt(ee / n)

def table(axes, cols):
    n, e, ae, ee = (x.sum(axis=axes) for x in (A_n, A_e, A_ae, A_ee))
    n, b, mae, rmse = stats(n, e, ae, ee)
    idx = np.array(np.meshgrid(*[np.arange(k) for k in n.shape], indexing="ij")).reshape(len(n.shape), -1).T
    df = pd.DataFrame(idx, columns=cols)
    df["n"] = n.ravel().astype(np.int64); df["sapma"] = b.ravel().round(3)
    df["mae"] = mae.ravel().round(3); df["rmse"] = rmse.ravel().round(3)
    if "model" in df: df["model"] = df.model.map(dict(enumerate(NAMES)))
    if "istasyon" in df: df["istasyon"] = df.istasyon.map(dict(enumerate(s["id"] for s in stations)))
    if "ay" in df: df["ay"] += 1
    return df[df.n > 0]

table((0, 3, 4), ["model", "oncu_gun"]).to_csv(OUT / "prev_model_oncu.csv", index=False)
table((0, 4), ["model", "oncu_gun", "saat_utc"]).to_csv(OUT / "prev_model_oncu_saat.csv", index=False)
table((0, 3), ["model", "oncu_gun", "ay"]).to_csv(OUT / "prev_model_oncu_ay.csv", index=False)
table((3, 4), ["istasyon", "model", "oncu_gun"]).to_csv(OUT / "prev_istasyon.csv", index=False)

n, b, mae, rmse = stats(B_n, B_e, B_ae, B_ee)
rows = [(SINGLE_MODELS[i], ["00", "06", "12", "18"][r], L, int(n[i, r, L]), round(b[i, r, L], 3), round(mae[i, r, L], 3), round(rmse[i, r, L], 3))
        for i in range(len(SINGLE_MODELS)) for r in range(NR) for L in range(192) if n[i, r, L] > 0]
pd.DataFrame(rows, columns=["model", "run", "oncu_saat", "n", "sapma", "mae", "rmse"]).to_csv(OUT / "single_oncu_saati.csv", index=False)

rows = [(SINGLE_MODELS[i], N, int(C_cmp[i, N]), int(C_ok[i, N]), round(C_ok[i, N] / C_cmp[i, N], 5) if C_cmp[i, N] else None,
         int(C_big[i, N]), round(float(C_max[i, N]), 2)) for i in range(len(SINGLE_MODELS)) for N in range(NL)]
bir = pd.DataFrame(rows, columns=["model", "oncu_gun", "karsilastirilan", "eslesen_0_15", "oran", "fark_0_5_ustu", "en_buyuk_fark"])
bir.to_csv(OUT / "birlestirme.csv", index=False)

pm = table((0, 3, 4), ["model", "oncu_gun"])
piv = pm.pivot(index="model", columns="oncu_gun", values="mae").reindex(NAMES).round(2)
with open(OUT / "faz0_ozet.txt", "w", encoding="utf-8") as fo:
    fo.write(f"Faz 0 — sıcaklık ({NS} istasyon, {time.strftime('%Y-%m-%d %H:%M')})\n\n")
    fo.write("MAE (°C), model × öncü günü (Previous Runs):\n" + piv.to_string() + "\n\n")
    fo.write("Run birleştirme (Previous Runs öncü N = run'ın 24N…24N+5. saati), eşleşme oranı (|fark| ≤ 0,15 °C; 0,1'lik farklar yuvarlamadan):\n")
    fo.write(bir.pivot(index="model", columns="oncu_gun", values="oran").round(3).to_string() + "\n")
print(open(OUT / "faz0_ozet.txt", encoding="utf-8").read())
print(f"Çıktılar: {OUT}  ·  toplam {(time.time()-t_start)/60:.1f} dk")
