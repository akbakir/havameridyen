"""YEREL günlük maks/min sıcaklık (dakikalık veriden) → Parquet + kalite bayrakları.

Girdi: istasyon;yıl;ay;gün;maks;min (başlıksız, ; ayraçlı).
Pencere: maks 06–18 UTC (tarih d), min 18 UTC (d-1) – 06 UTC (d).
Bayraklar: YINELENEN (aynı gün farklı değer), ARALIK (maks > 50 / min < -40),
TERS (maks < min), SAATLIK (saatlik veriyle çelişki: maks < saatlik maks - 1
ya da min > saatlik min + 1, ya da fark > 8 °C).
Kullanım: python scripts/ml/yerel-gunluk.py yerel/gunlukmaxminsck.csv ml-data/obs/yerel_saatlik_qc.parquet ml-data/obs/yerel_gunluk.parquet
"""
import sys, pandas as pd, numpy as np
src, hourly, out = sys.argv[1:4]
d = pd.read_csv(src, sep=';', header=None, names=['no','y','m','g','tmax','tmin'])
d['date'] = pd.to_datetime(dict(year=d.y, month=d.m, day=d.g)); d = d.drop(columns=['y','m','g'])
d = d.drop_duplicates()
g = d.groupby(['no','date'])
conf = g.tmax.transform('nunique').gt(1) | g.tmin.transform('nunique').gt(1)
d['qc'] = np.where(conf, 'YINELENEN', '')
d = d.drop_duplicates(['no','date'])  # çelişkilide ilk satır kalır, bayraklı
h = pd.read_parquet(hourly, columns=['no','t','ts','qc'])
h = h[h.qc.fillna('') == '']; h['ts'] = h.ts.dt.tz_convert(None); hr = h.ts.dt.hour
mx = h[(hr>=6)&(hr<=18)].assign(date=lambda x: x.ts.dt.normalize()).groupby(['no','date']).t.agg(hmax='max', nmax='count')
m = h[(hr>=18)|(hr<=6)].assign(date=lambda x: (x.ts+pd.Timedelta(hours=6)).dt.normalize())
mn = m.groupby(['no','date']).t.agg(hmin='min', nmin='count')
d['no'] = d.no.astype(h.no.dtype)
d = d.merge(mx, on=['no','date'], how='left').merge(mn, on=['no','date'], how='left')
def add(mask, tag):
    d.loc[mask, 'qc'] = d.loc[mask, 'qc'].str.cat(np.repeat(tag, mask.sum()), sep=',').str.strip(',')
add((d.tmax > 50) | (d.tmin < -40), 'ARALIK')
add(d.tmax < d.tmin, 'TERS')
okx = d.nmax >= 10; okn = d.nmin >= 10
add(okx & ((d.tmax < d.hmax - 1) | (d.tmax - d.hmax > 8)) | okn & ((d.tmin > d.hmin + 1) | (d.hmin - d.tmin > 8)), 'SAATLIK')
d = d.sort_values(['no','date']).reset_index(drop=True)
d.to_parquet(out, index=False)
print(f"{len(d):,} istasyon-gün, {d.no.nunique()} istasyon, {d.date.min().date()} – {d.date.max().date()}; "
      f"bayraklı {(d.qc!='').sum():,} ({(d.qc!='').mean():.2%})")
print(d.qc[d.qc!=''].str.split(',').explode().value_counts().to_string())
