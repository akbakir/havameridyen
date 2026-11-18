#!/usr/bin/env python3
"""YEREL saatlik gözlemleri için kalite kontrolü (18 Kas 2026).

Girdi : yerel-to-parquet.py çıktısı (ml-data/obs/yerel_saatlik.parquet)
Çıktı : <çıktı>.parquet  — temizlenmiş değerler + her satır için `qc` bayrak metni
        <çıktı>_rapor.csv — istasyon × kural sayımları

Kurallar (bulunan değer NaN yapılır, satır silinmez):
  KOD     9999 / -9999 / 8888 / -8888 / 999.9 / -999.9 gibi kodlanmış eksik değerler.
          Basınçta 999 ve 999.9 kod sayılmaz: bu değerler istasyonun ortancasından en fazla 16 hPa sapıyor, gerçek ölçüm.
  ARALIK  fiziksel sınır dışı (sıcaklık −45…50 °C, nem 1…100 %, rüzgâr 0…60 m/s, hamle 0…75 m/s,
          basınç 600…1050 hPa, yağış 0…150 mm/saat, görüş 0…100 km).
  NEM0    nem = 0 (fiziksel değil; sensör arızası).
  RUZ0    ≥48 saat kesintisiz 0 m/s rüzgâr → takılmış anemometre; o bloktaki rüzgâr ve yön NaN.
  TSABIT  ≥12 saat aynı sıcaklık → takılmış sensör; blok NaN.
  TSIVRI  tek saatlik sıcaklık sivrisi: önceki ve sonraki saatten aynı yönde > 8 °C fark ve 100 km içindeki
          hiçbir istasyonda aynı saatte > 5 °C benzer sıçrama yok. (Karadeniz föhn olayları komşularda da görüldüğü için korunur.)
  HAMLE   hamle < ortalama rüzgâr − 0,5 m/s → hamle NaN.
  YSABIT  ≥12 saat aynı pozitif yağış değeri → yalnız bayrak (zayıf, sürekli yağış gerçek olabilir; değer korunur).

Birimler: sıcaklık °C, nem %, rüzgâr ve hamle m/s, basınç hPa (istasyon seviyesi), yağış mm/saat,
kar cm, görüş km (YEREL görüşü km olarak veriyor; 20 = 20 km ve üstü).

Kullanım: python scripts/ml/yerel-qc.py ml-data/obs/yerel_saatlik.parquet ml-data/obs/yerel_saatlik_qc
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

src, dst = sys.argv[1], sys.argv[2]
root = Path(__file__).resolve().parents[2]
df = pd.read_parquet(src).sort_values(["no", "ts"]).reset_index(drop=True)
flags = pd.Series([""] * len(df), index=df.index, dtype=object)
counts = {}


def mark(mask, rule, cols):
    mask = mask.fillna(False)
    n = int(mask.sum())
    counts[rule] = counts.get(rule, 0) + n
    if n:
        for c in cols:
            df.loc[mask, c] = np.nan
        flags.loc[mask] = flags.loc[mask] + rule + " "
    return mask


VALS = ["t", "rh", "dd", "ff", "gdd", "gff", "p", "rr", "kar", "taze", "vis"]
CODES = [9999, -9999, 8888, -8888, 999.9, -999.9, 9999.9, -9999.9, 32767, -32768]
for c in VALS:
    codes = [x for x in CODES if not (c == "p" and x == 999.9)]
    mark(df[c].isin(codes), f"KOD_{c}", [c])

RANGE = {"t": (-45, 50), "rh": (1, 100), "ff": (0, 60), "gff": (0, 75), "p": (600, 1050),
         "rr": (0, 150), "vis": (0, 100), "dd": (0, 360), "gdd": (0, 360), "kar": (0, 500), "taze": (0, 200)}
for c, (lo, hi) in RANGE.items():
    if c == "rh":
        mark(df.rh.eq(0), "NEM0", ["rh"])
        mark((df.rh < 0) | (df.rh > hi), "ARALIK_rh", ["rh"])
    else:
        mark((df[c] < lo) | (df[c] > hi), f"ARALIK_{c}", [c])

g = df.groupby("no", sort=False)
contig = g.ts.diff().dt.total_seconds().eq(3600)


def runs(series_eq_prev, min_len, base_mask):
    """base_mask satırlarında, aynı değerin kesintisiz sürdüğü blokları bulur (≥ min_len saat)."""
    start = ~(series_eq_prev & contig)
    rid = start.cumsum()
    size = base_mask.groupby(rid).transform("sum")
    return base_mask & (size >= min_len)


zero = df.ff.eq(0)
mark(runs(zero & g.ff.shift().eq(0), 48, zero), "RUZ0", ["ff", "dd"])
tnot = df.t.notna()
mark(runs(df.t.eq(g.t.shift()), 12, tnot), "TSABIT", ["t"])

# tek saatlik sıcaklık sivrisi + komşu kontrolü
prev, nxt = g.t.shift(1), g.t.shift(-1)
cand = ((df.t - prev).abs() > 8) & ((df.t - nxt).abs() > 8) & (np.sign(df.t - prev) == np.sign(df.t - nxt)) & contig & g.ts.diff(-1).dt.total_seconds().eq(-3600)
st = json.load(open(root / "data/ml/stations.json", encoding="utf-8"))
pos = {int(s["yerel"]): (s["lat"], s["lon"]) for s in st if s.get("yerel")}
jump = (df.t - prev)
J = df.assign(j=jump).pivot_table(index="ts", columns="no", values="j")
bad = []
for i in df.index[cand.fillna(False)]:
    no, ts = int(df.at[i, "no"]), df.at[i, "ts"]
    if no not in pos:
        bad.append(i); continue
    la, lo = pos[no]
    neigh = [k for k, (a, b) in pos.items() if k != no and 111 * math.hypot(a - la, (b - lo) * math.cos(math.radians(la))) < 100]
    vals = J.loc[ts, [k for k in neigh if k in J.columns]] if ts in J.index else pd.Series(dtype=float)
    same = (np.sign(vals) == np.sign(jump.at[i])) & (vals.abs() > 5)
    if not same.any():
        bad.append(i)
mark(pd.Series(df.index.isin(bad), index=df.index), "TSIVRI", ["t"])

mark(df.gff < df.ff - 0.5, "HAMLE", ["gff", "gdd"])

pos_rr = df.rr > 0
f = runs(df.rr.eq(g.rr.shift()), 12, pos_rr)
counts["YSABIT"] = int(f.sum())
flags.loc[f] = flags.loc[f] + "YSABIT "

df["qc"] = flags.str.strip()
df.to_parquet(dst + ".parquet", index=False)
rep = df.assign(q=df.qc.str.split()).explode("q").dropna(subset=["q"]).groupby(["no", "ad", "q"]).size().unstack(fill_value=0)
rep.to_csv(dst + "_rapor.csv", encoding="utf-8-sig", sep=";")
print(f"{len(df):,} satır, {df['no'].nunique()} istasyon")
for k, v in sorted(counts.items(), key=lambda x: -x[1]):
    if v:
        print(f"  {k:12} {v:>8,}")
print(f"Bayraklı satır: {int((df.qc != '').sum()):,} ({(df.qc != '').mean() * 100:.2f}%) → {dst}.parquet, {dst}_rapor.csv")
