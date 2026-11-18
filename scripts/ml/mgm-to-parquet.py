#!/usr/bin/env python3
"""MGM MEVBİS saatlik sunum çıktısını (SUNUM_YER_GOZLEMLERI) Parquet'e çevirir.

Girdi: noktalı virgülle ayrılmış, başlıksız metin; sütunlar sorgu sırasıyla:
  ISTAD;ISTNO;YIL;AY;GUN;SAAT;SICAKLIK;NEM;ORT_RUZGAR_YON_DER;RUZGAR_HIZI;MAKSIMUM_RUZGAR_YONU_DER;
  MAKSIMUM_RUZGAR_HIZI;AKTUEL_BASINC;YAGIS;TOPLAM_KAR;TAZE_KAR_KALINLIGI;YATAY_GORUS
Saatler UTC (günlük sıcaklık en yüksek 12, en düşük 03 UTC). Rüzgâr m/s, yağış mm/saat, basınç hPa, görüş m.
Değeri olmayan gelecek saatler atılır.

Kullanım: python scripts/ml/mgm-to-parquet.py mgm/saatlik_sunum.txt ml-data/obs/mgm_saatlik.parquet
"""
import sys
import pandas as pd

COLS = ["ad", "no", "yil", "ay", "gun", "saat", "t", "rh", "dd", "ff", "gdd", "gff", "p", "rr", "kar", "taze", "vis"]
src, dst = sys.argv[1], sys.argv[2]
df = pd.read_csv(src, sep=";", header=None, names=COLS, dtype={"no": "int32"}, low_memory=False)
df["ts"] = pd.to_datetime(dict(year=df.yil, month=df.ay, day=df.gun, hour=df.saat), utc=True)
df = df.drop(columns=["yil", "ay", "gun", "saat"])
vals = ["t", "rh", "dd", "ff", "gdd", "gff", "p", "rr", "kar", "taze", "vis"]
df = df[df[vals].notna().any(axis=1)]
for c in vals:
    df[c] = df[c].astype("float32")
df.to_parquet(dst, index=False)
print(f"{len(df):,} satır, {df['no'].nunique()} istasyon, {df.ts.min()} – {df.ts.max()} → {dst}")
