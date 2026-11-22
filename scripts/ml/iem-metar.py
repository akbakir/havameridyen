"""IEM (Iowa Environmental Mesonet) ham METAR/SPECI indirme ve çözümleme — 56 havalimanı.

1. İndirme: her havalimanı × yıl için asos.py'den ham METAR (rutin + SPECI), UTC.
   ml-data/obs/metar/ham/<ICAO>_<YIL>.csv   (varsa atlanır; son yılı yenilemek için --yenile)
2. Çözümleme: ml-data/obs/metar.parquet
   icao, ts (UTC), speci, yon, ff_kt, hamle_kt, vrb, gorus_m, cavok, rvr_min_m,
   hadise (ham kodlar, ;), sinif (site hadise sınıfları, data/ml/wmo4677.json), siddet,
   yakin_gecmis (RE..), bulut_alt_ft (en alçak BKN/OVC/VV tabanı), bulut_max (0–4: yok..OVC),
   cb, t, td, qnh, metar (ham metin)

Kurallar: trend (TEMPO/BECMG/NOSIG) ve RMK sonrası okunmaz. BCFG/PRFG/MIFG/VCFG sis sayılmaz
(wmo4677.json). Görüş "9999" = ≥ 10 km; CAVOK → görüş 9999.

Kullanım:  python scripts/ml/iem-metar.py            (indir + çözümle)
           python scripts/ml/iem-metar.py --cozumle  (yalnız çözümle)
           python scripts/ml/iem-metar.py --yenile   (son yılı yeniden indir)
"""
import sys, json, re, time, pathlib, ssl, urllib.request

# Windows'ta python.org Python'u kök sertifikaları bulamayabiliyor (CERTIFICATE_VERIFY_FAILED).
# Önce Windows sertifika deposunu (truststore), yoksa certifi paketini kullan; doğrulama hiçbir zaman kapatılmaz.
try:
    import truststore; truststore.inject_into_ssl(); SSL_CTX = None
except ImportError:
    try:
        import certifi; SSL_CTX = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        SSL_CTX = None

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / "ml-data"
HAM = ML / "obs" / "metar" / "ham"
YILLAR = [2024, 2025, 2026]
SON = (2026, 11, 18)                      # 2026 için bitiş günü (dahil değil)
URL = ("https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station={s}&data=metar"
       "&year1={y}&month1=1&day1=1&year2={y2}&month2={m2}&day2={d2}&tz=Etc/UTC&format=onlycomma"
       "&latlon=no&missing=M&trace=T&direct=no&report_type=3&report_type=4")
UA = "havameridyen-ml-veri/1.0"

stations = json.load(open(ROOT / "data/ml/stations.json", encoding="utf-8"))
ICAO = [s["icao"] for s in stations if s.get("icao")]
args = sys.argv[1:]

# ---------- 1. indirme ----------
def indir():
    HAM.mkdir(parents=True, exist_ok=True)
    isler = [(s, y) for s in ICAO for y in YILLAR]
    for i, (s, y) in enumerate(isler, 1):
        f = HAM / f"{s}_{y}.csv"
        if f.exists() and f.stat().st_size > 0 and not ("--yenile" in args and y == YILLAR[-1]):
            continue
        y2, m2, d2 = (y + 1, 1, 1) if y < YILLAR[-1] else SON
        u = URL.format(s=s, y=y, y2=y2, m2=m2, d2=d2)
        for deneme in range(4):
            try:
                req = urllib.request.Request(u, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=180, context=SSL_CTX) as r:
                    data = r.read()
                if not data.startswith(b"station"):
                    raise ValueError(data[:120])
                tmp = f.with_suffix(".tmp"); tmp.write_bytes(data); tmp.replace(f)
                print(f"[{i}/{len(isler)}] {s} {y}: {data.count(b'\n') - 1} rapor", flush=True)
                break
            except Exception as e:
                if "CERTIFICATE_VERIFY_FAILED" in str(e):
                    sys.exit("Sertifika doğrulanamadı. Şunu çalıştırıp yeniden deneyin:  python -m pip install truststore certifi")
                bekle = 15 * (deneme + 1)
                print(f"[{i}/{len(isler)}] {s} {y}: hata ({e}); {bekle} sn sonra tekrar", flush=True)
                time.sleep(bekle)
        else:
            print(f"[{i}/{len(isler)}] {s} {y}: 4 denemede alınamadı, atlandı (yeniden çalıştırınca denenir)")
        time.sleep(2)                     # IEM'e nazik olmak için

# ---------- 2. çözümleme ----------
W = json.load(open(ROOT / "data/ml/wmo4677.json", encoding="utf-8"))
MAP, SID = W["metar"], W["metar_siddet"]
R_WIND = re.compile(r"^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$")
R_VIS = re.compile(r"^(\d{4})(NDV)?$")
R_RVR = re.compile(r"^R\d{2}[LCR]?/([PM]?)(\d{4})(?:V([PM]?)(\d{4}))?(?:FT)?[UDN]?$")
R_WX = re.compile(r"^(\+|-|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP)+|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)?$")
R_CLD = re.compile(r"^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU|///)?$|^VV(\d{3}|///)$")
R_TT = re.compile(r"^(M?\d{2})/(M?\d{2})?$")
R_Q = re.compile(r"^Q(\d{4})$")
R_SKIP = re.compile(r"^(METAR|SPECI|COR|AUTO|\d{6}Z|LT[A-Z]{2})$")
KAPLAMA = {"FEW": 1, "SCT": 2, "BKN": 3, "OVC": 4}

def sicak(x):
    return None if x is None else (-int(x[1:]) if x.startswith("M") else int(x))

def sinif_bul(kod):
    """'-SHRA' → ('saganak', 'hafif'); bilinmeyen birleşimde en uzun eşleşen önek"""
    siddet = SID[kod[0]] if kod[0] in "+-" else SID[""]
    ana = kod.lstrip("+-")
    if ana in MAP: return MAP[ana], (None if ana.startswith("VC") else siddet)
    for k in sorted(MAP, key=len, reverse=True):
        if ana.startswith(k): return MAP[k], siddet
    return "diger", siddet

def coz(metar):
    d = dict(speci=False, yon=None, ff_kt=None, hamle_kt=None, vrb=False, gorus_m=None, cavok=False,
             rvr_min_m=None, hadise=[], sinif=[], siddet=[], yakin_gecmis=[], bulut_alt_ft=None,
             bulut_max=0, cb=False, t=None, td=None, qnh=None)
    for tok in metar.replace("=", " ").split():
        if tok in ("RMK", "TEMPO", "BECMG", "NOSIG"): break
        if tok == "SPECI": d["speci"] = True; continue
        if R_SKIP.match(tok): continue
        m = R_WIND.match(tok)
        if m and d["ff_kt"] is None:
            k = 1.94384 if m.group(4) == "MPS" else 1.0
            d["vrb"] = m.group(1) == "VRB"; d["yon"] = None if d["vrb"] else int(m.group(1))
            d["ff_kt"] = round(int(m.group(2)) * k); d["hamle_kt"] = round(int(m.group(3)) * k) if m.group(3) else None
            continue
        if tok == "CAVOK": d["cavok"] = True; d["gorus_m"] = 9999; continue
        m = R_VIS.match(tok)
        if m and d["gorus_m"] is None: d["gorus_m"] = int(m.group(1)); continue
        m = R_RVR.match(tok)
        if m:
            v = int(m.group(2)); d["rvr_min_m"] = v if d["rvr_min_m"] is None else min(d["rvr_min_m"], v); continue
        if tok.startswith("RE") and len(tok) > 2: d["yakin_gecmis"].append(tok[2:]); continue
        m = R_CLD.match(tok)
        if m:
            if m.group(1):
                c = KAPLAMA[m.group(1)]; h = int(m.group(2)) * 100
                d["bulut_max"] = max(d["bulut_max"], c); d["cb"] |= m.group(3) == "CB"
                if c >= 3 and (d["bulut_alt_ft"] is None or h < d["bulut_alt_ft"]): d["bulut_alt_ft"] = h
            elif m.group(4) and m.group(4) != "///":
                h = int(m.group(4)) * 100; d["bulut_max"] = 4
                if d["bulut_alt_ft"] is None or h < d["bulut_alt_ft"]: d["bulut_alt_ft"] = h
            continue
        m = R_TT.match(tok)
        if m: d["t"], d["td"] = sicak(m.group(1)), sicak(m.group(2)); continue
        m = R_Q.match(tok)
        if m: d["qnh"] = int(m.group(1)); continue
        if tok in ("NSC", "NCD", "SKC", "CLR", "NSW"): continue
        m = R_WX.match(tok)
        if m and (m.group(2) or m.group(3)):
            s, sd = sinif_bul(tok); d["hadise"].append(tok); d["sinif"].append(s); d["siddet"].append(sd or "")
    for k in ("hadise", "sinif", "siddet", "yakin_gecmis"): d[k] = ";".join(d[k])
    return d

def cozumle():
    import pandas as pd
    parcalar = [pd.read_csv(f, dtype=str) for f in sorted(HAM.glob("*.csv"))]
    parcalar = [p for p in parcalar if not p.empty]
    if not parcalar: sys.exit("Ham METAR dosyası yok; önce indirin.")
    df = pd.concat(parcalar, ignore_index=True).drop_duplicates(["station", "valid", "metar"])
    df["ts"] = pd.to_datetime(df.valid, utc=True)
    rows = pd.DataFrame([coz(m) for m in df.metar.fillna("")])
    out = pd.concat([df[["station", "ts", "metar"]].rename(columns={"station": "icao"}).reset_index(drop=True), rows], axis=1)
    out = out.sort_values(["icao", "ts"]).reset_index(drop=True)
    # IEM metninde "SPECI" sözcüğü yok; rutin raporlar her meydanda hep aynı dakikalarda (Türkiye: :20 ve :50).
    rutin = out.groupby("icao").ts.transform(lambda s: s.dt.minute.isin(s.dt.minute.value_counts().index[:2]))
    out["speci"] = out.speci | ~rutin
    p = ML / "obs" / "metar.parquet"; out.to_parquet(p, index=False)
    print(f"\n{len(out):,} rapor, {out.icao.nunique()} havalimanı, {out.ts.min():%Y-%m-%d} – {out.ts.max():%Y-%m-%d} → {p}")
    print(f"SPECI %{100*out.speci.mean():.1f} · hamle %{100*out.hamle_kt.notna().mean():.1f} · "
          f"RVR %{100*out.rvr_min_m.notna().mean():.1f} · hadise %{100*(out.hadise != '').mean():.1f} · "
          f"görüş boş %{100*out.gorus_m.isna().mean():.1f}")
    s = out.sinif.str.split(";").explode(); s = s[s != ""]
    print("Hadise sınıfları:\n" + s.value_counts().head(20).to_string())
    print("\nHavalimanı başına rapor:\n" + out.groupby("icao").size().describe().round(0).to_string())

if __name__ == "__main__":
    try:
        import pandas, pyarrow  # noqa: F401
    except ImportError as e:
        sys.exit(f"Eksik paket: {e.name}. Kurmak için:  python -m pip install pandas pyarrow")
    if "--cozumle" not in args: indir()
    cozumle()
