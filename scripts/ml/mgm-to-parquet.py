#!/usr/bin/env python3
"""MGM MEVBİS saatlik sunum çıktısını (SUNUM_YER_GOZLEMLERI) Parquet'e çevirir.

Girdi: noktalı virgülle ayrılmış, başlıksız metin; sütunlar sorgu sırasıyla:
  ISTAD;ISTNO;YIL;AY;GUN;SAAT;SICAKLIK;NEM;ORT_RUZGAR_YON_DER;RUZGAR_HIZI;MAKSIMUM_RUZGAR_YONU_DER;
  MAKSIMUM_RUZGAR_HIZI;AKTUEL_BASINC;YAGIS;TOPLAM_KAR;TAZE_KAR_KALINLIGI;YATAY_GORUS
Saatler UTC. Birimler: sıcaklık °C, nem %, rüzgâr m/s, yağış mm, basınç hPa, görüş km.

SAAT ETİKETİ (18 Kas 2026, Esenboğa 19 Oca 2024 METAR ve dakikalık hamle ile doğrulandı):
  ts           = SAAT başı (ör. 14:00 UTC)
  anlık        : t, rh, p                → ts anındaki ölçüm (14:00)
  ortalama     : ff, dd                  → ts'den önceki son 10 dakika (13:50–14:00)
  saat içi     : rr, gff, gdd            → ts ile ts+1 saat ARASI (14:00–14:59)
Open-Meteo'da precipitation / wind_gusts_10m önceki saati verir (15:00 → 14:00–15:00).
Bu yüzden rr ve gff için `ts_model` = ts + 1 saat sütunu yazılır; modelle bu sütun üzerinden eşleştirin.
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
df["ts_model"] = df["ts"] + pd.Timedelta(hours=1)  # rr, gff, gdd için modelle eşleşen saat
for c in vals:
    df[c] = df[c].astype("float32")
df.to_parquet(dst, index=False)
print(f"{len(df):,} satır, {df['no'].nunique()} istasyon, {df.ts.min()} – {df.ts.max()} → {dst}")
