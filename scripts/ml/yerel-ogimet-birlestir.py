"""YEREL günlük maks/min boşluklarını Ogimet SYNOP ekstremleriyle, kalanını YEREL saatlik veriden tamamlar.

Öncelik: yerel (günlük, dakikalıktan) → ogimet (aynı istasyon) → ogimet_yakin → saatlik
(06–18 / 18–06 UTC saat başı değerlerinden; en az 12/13 saat; maks ortalama ~0,4 °C düşük, min ~0,2 °C yüksek).
Ayıklama her zaman uygulanır: aralık dışı (−40…50), maks < min, saatlikle çelişen, güvensiz istasyon.

Ogimet: no,yyyymmdd,hh,t  (hh=06 → 333 2snTnTnTn, o günün minimumu 18–06 UTC;
                          hh=18 → 333 1snTxTxTx, o günün maksimumu 06–18 UTC)
Kural:
  1. Aynı numaralı SYNOP önce; yoksa ≤ 10 km ve |Δz| ≤ 100 m olan en yakın SYNOP (kaynak=ogimet_yakin).
  2. İstasyon güveni: YEREL günlükle çakışan günlerde |fark| ≤ 0,5 °C oranı ≥ %90 olmalı; saatlikle çelişme oranı
     (maks ve min ayrı) %10'u aşarsa o istasyonun o parametresi tamamen atılır.
  3. Gün kontrolü: hedef istasyonun YEREL saatlik değeriyle — maks ∈ [saatlik maks − 1, + 8], min ∈ [saatlik min − 8, + 1];
     saatlik yoksa yalnız aralık (−40…50) ve maks ≥ min.
Çıktı: no, date, tmax, tmin, kaynak_max, kaynak_min (yerel / ogimet / ogimet_yakin), og_no
Kullanım: python scripts/ml/yerel-ogimet-birlestir.py ml-data/obs/yerel_gunluk.parquet ogimet_synop.csv \
          ml-data/obs/yerel_saatlik_qc.parquet yerel/istasyonlar.csv ml-data/obs/gunluk_ekstrem.parquet
"""
import sys, json, pathlib, numpy as np, pandas as pd
yg, ogf, hourly, reg, out = sys.argv[1:6]
root = pathlib.Path(__file__).resolve().parents[2]
st = json.load(open(root / 'data/ml/stations.json', encoding='utf-8'))
Y = pd.read_parquet(yg); Y['no'] = Y.no.astype(int)
Y.loc[Y.qc.fillna('') != '', ['tmax', 'tmin']] = np.nan          # bayraklı günler boşluk sayılır
O = pd.read_csv(ogf, header=None, names=['no', 'd', 'hh', 't'], dtype={'d': str})
O['date'] = pd.to_datetime(O.d); O = O[(O.t > -40) & (O.t < 50)]
O = O.pivot_table(index=['no', 'date'], columns='hh', values='t', aggfunc='first').rename(columns={6: 'omin', 18: 'omax'}).reset_index()
for c in ('omin', 'omax'):
    if c not in O: O[c] = np.nan
# istasyon güveni
c = O.merge(Y, on=['no', 'date'])
ok = pd.concat([(c.omax - c.tmax).abs().le(0.5).where(c.tmax.notna() & c.omax.notna()),
                (c.omin - c.tmin).abs().le(0.5).where(c.tmin.notna() & c.omin.notna())]).groupby(pd.concat([c.no, c.no])).agg(['mean', 'count'])
bad = set(ok.index[(ok['count'] >= 30) & (ok['mean'] < 0.9)])
print('güvensiz Ogimet istasyonu:', sorted(bad), '\n', ok.loc[sorted(bad)].round(3).to_string() if bad else '')
O = O[~O.no.isin(bad)]
# eşleme
R = pd.read_csv(reg, sep=';', encoding='utf-8-sig').drop_duplicates('istNo').set_index('istNo')
ogs = sorted(set(O.no) & set(R.index)); G = R.loc[ogs]
def hav(a, b, A, B):
    a, b, A, B = map(np.radians, (a, b, A, B))
    return 6371 * 2 * np.arcsin(np.sqrt(np.sin((A - a) / 2) ** 2 + np.cos(a) * np.cos(A) * np.sin((B - b) / 2) ** 2))
M = []
for s in st:
    y = int(s['yerel'])
    if y in set(O.no): M.append((y, y, 'ogimet')); continue
    dist = hav(s['lat'], s['lon'], G.enlem.values, G.boylam.values); k = dist.argmin()
    if dist[k] <= 10 and abs(G.yukseklik.values[k] - (s['elev'] or 0)) <= 100: M.append((y, int(G.index[k]), 'ogimet_yakin'))
M = pd.DataFrame(M, columns=['no', 'og_no', 'okaynak'])
# saatlik sınırlar
h = pd.read_parquet(hourly, columns=['no', 't', 'ts', 'qc']); h = h[h.qc.fillna('') == '']
h['no'] = h.no.astype(int); h['ts'] = h.ts.dt.tz_convert(None); hr = h.ts.dt.hour
hx = h[(hr >= 6) & (hr <= 18)].assign(date=lambda x: x.ts.dt.normalize()).groupby(['no', 'date']).t.agg(hmax='max', nx='count')
hn = h[(hr >= 18) | (hr <= 6)].assign(date=lambda x: (x.ts + pd.Timedelta(hours=6)).dt.normalize()).groupby(['no', 'date']).t.agg(hmin='min', nn='count')
F = M.merge(O.rename(columns={'no': 'og_no'}), on='og_no').drop(columns='og_no').merge(M[['no', 'og_no']], on='no')
F = F.merge(hx, on=['no', 'date'], how='left').merge(hn, on=['no', 'date'], how='left')
rx = (F.nx >= 10) & F.omax.notna() & ((F.omax < F.hmax - 1) | (F.omax > F.hmax + 8))
rn = (F.nn >= 10) & F.omin.notna() & ((F.omin > F.hmin + 1) | (F.omin < F.hmin - 8))
# istasyon-parametre güveni: saatlikle çelişme oranı > %10 ise o istasyonun o parametresi tamamen atılır
for r, o, n in ((rx, 'omax', 'nx'), (rn, 'omin', 'nn')):
    chk = (F[n] >= 10) & F[o].notna()
    key = F.no.astype(str) + '<' + F.og_no.astype(str)          # hedef<ogimet çifti
    rate = r[chk].groupby(key[chk]).agg(['mean', 'count'])
    drop = rate.index[(rate['count'] >= 30) & (rate['mean'] > 0.10)]
    if len(drop): print(f'{o}: güvensiz (hedef<ogimet)', {k: round(float(rate.loc[k, "mean"]), 2) for k in drop})
    F.loc[r | key.isin(drop), o] = np.nan
F.loc[F.omax < F.omin, ['omax', 'omin']] = np.nan
# birleştir
days = pd.date_range('2024-01-01', max(Y.date.max(), O.date.max()))
B = pd.MultiIndex.from_product([[int(s['yerel']) for s in st], days], names=['no', 'date']).to_frame(index=False)
B = B.merge(Y[['no', 'date', 'tmax', 'tmin']], on=['no', 'date'], how='left').merge(F[['no', 'date', 'omax', 'omin', 'okaynak', 'og_no']], on=['no', 'date'], how='left')
for v, o in (('tmax', 'omax'), ('tmin', 'omin')):
    k = 'kaynak_' + v[1:]
    B[k] = np.where(B[v].notna(), 'yerel', np.where(B[o].notna(), B.okaynak, ''))
    B[v] = B[v].fillna(B[o])
# 4. kaynak: saatlik
B = B.merge(hx, on=['no', 'date'], how='left').merge(hn, on=['no', 'date'], how='left')
for v, hv, n in (('tmax', 'hmax', 'nx'), ('tmin', 'hmin', 'nn')):
    k = 'kaynak_' + v[1:]; m = B[v].isna() & (B[n] >= 12)
    B.loc[m, v] = B.loc[m, hv]; B.loc[m, k] = 'saatlik'
B = B.drop(columns=['hmax', 'nx', 'hmin', 'nn'])
# son ayıklama (bütün kaynaklar)
bad = (B.tmax > 50) | (B.tmax < -40) | (B.tmin > 50) | (B.tmin < -40) | (B.tmax < B.tmin)
B.loc[bad, ['tmax', 'tmin']] = np.nan; B.loc[bad, ['kaynak_max', 'kaynak_min']] = ''
print('son ayıklamada atılan gün:', int(bad.sum()))
B = B[(B.kaynak_max != '') | (B.kaynak_min != '')].drop(columns=['omax', 'omin', 'okaynak'])
B.to_parquet(out, index=False)
n = len(days)
print(f'{len(B):,} istasyon-gün, {B.no.nunique()} istasyon (243 içinden), {days[0].date()} – {days[-1].date()}')
print(pd.crosstab(B.kaynak_max, 'maks').join(pd.crosstab(B.kaynak_min, 'min')).to_string())
cov = B.groupby('no').tmax.count() / n
print('kapsam ≥ %90:', (cov >= .9).sum(), ' %50–90:', ((cov >= .5) & (cov < .9)).sum(), ' < %50:', (cov < .5).sum(), ' hiç:', 243 - B.no.nunique())
