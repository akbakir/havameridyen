# havameridyen widget kaynakları: hava ikonları (src/icons.jsx'teki SVG'lerin vektör karşılığı) ve gökyüzü zeminleri
# (src/icons.jsx SKY). Uygulamadaki ikon ya da renkler değişirse yeniden çalıştırılır (apps/mobile klasöründen):
#   python scripts/gen_widget_res.py android/app/src/main/res
import os, sys

OUT = sys.argv[1]
HDR = '<?xml version="1.0" encoding="utf-8"?>\n<!-- havameridyen: üretildi (scripts/gen_widget_res.py, widget1). Elle düzenlemeyin. -->\n'


def f(v):
    t = ("%.2f" % v).rstrip("0").rstrip(".")
    return "0" if t == "-0" else t


def ell(cx, cy, rx, ry):
    return f"M{f(cx - rx)},{f(cy)} a{f(rx)},{f(ry)} 0 1,0 {f(2 * rx)},0 a{f(rx)},{f(ry)} 0 1,0 {f(-2 * rx)},0 Z"


def rrect(x, y, w, h, r):
    return (f"M{f(x + r)},{f(y)} h{f(w - 2 * r)} a{f(r)},{f(r)} 0 0,1 {f(r)},{f(r)} v{f(h - 2 * r)} "
            f"a{f(r)},{f(r)} 0 0,1 {f(-r)},{f(r)} h{f(-(w - 2 * r))} a{f(r)},{f(r)} 0 0,1 {f(-r)},{f(-r)} "
            f"v{f(-(h - 2 * r))} a{f(r)},{f(r)} 0 0,1 {f(r)},{f(-r)} Z")


def fill(d, color, alpha=None):
    a = f'\n        android:fillAlpha="{f(alpha)}"' if alpha is not None else ""
    return f'    <path\n        android:fillColor="{color}"{a}\n        android:pathData="{d}" />\n'


def stroke(d, color, w, fillc=None):
    fc = f'\n        android:fillColor="{fillc}"' if fillc else ""
    return (f'    <path{fc}\n        android:strokeColor="{color}"\n        android:strokeWidth="{f(w)}"\n'
            f'        android:strokeLineCap="round"\n        android:pathData="{d}" />\n')


def cloud(dx, dy, dark=False, alpha=None):
    c = ["#8E9AA6", "#C9D2DA", "#D3DAE1", "#B6C1CB"] if dark else ["#B7C2CC", "#EEF2F5", "#F3F6F8", "#DCE3E8"]
    return (fill(ell(15 + dx, 19 + dy, 8.5, 6.5), c[0], alpha) + fill(rrect(14 + dx, 16 + dy, 20, 9, 4.5), c[1], alpha)
            + fill(ell(24 + dx, 14 + dy, 11, 8.5), c[2], alpha) + fill(ell(32 + dx, 18.5 + dy, 7.5, 6), c[3], alpha))


def drops(pts):
    return "".join(stroke(f"M{f(a)},{f(b)} L{f(c)},{f(d)}", "#CFE4FA", 2.3) for a, b, c, d in pts)


def flakes(pts):
    return "".join(stroke(ell(x, y, 2, 2), "#8EA6BC", 0.6, "#F2F7FC") for x, y in pts)


BOLT = fill("M24,24 l-6,9 h5 l-3.5,8 l9,-11 h-5.5 Z", "#FFC857")
SUN = fill(ell(20, 20, 16, 16), "#FFD27A", 0.28) + fill(ell(20, 20, 10, 10), "#FFC857")
MOON = fill("M25,7 a13,13 0 1,0 9,22 a11,11 0 0,1 -9,-22 Z", "#EEF1F6")

# ad: (viewBox x, y, w, h, gövde) — src/icons.jsx ICON ile aynı çizimler
ICONS = {
    "wx_sun": (0, 0, 40, 40, SUN),
    "wx_moon": (0, 0, 40, 40, MOON),
    "wx_sun_cloud": (0, 0, 40, 40, fill(ell(14, 13, 8, 8), "#FFC857") + cloud(3, 6)),
    "wx_moon_cloud": (0, 0, 40, 40, fill("M16,4 a9,9 0 1,0 7,15 a8,8 0 0,1 -7,-15 Z", "#EEF1F6") + cloud(3, 7)),
    "wx_cloud": (4, 2, 36, 30, cloud(0, 0)),
    "wx_overcast": (2, 0, 38, 32, cloud(-3, -3, True, 0.85) + cloud(2, 3, True)),
    "wx_rain": (4, 2, 36, 36, cloud(0, 0) + drops([(16, 27, 13, 34), (23, 27, 20, 34), (30, 27, 27, 34)])),
    "wx_rain_heavy": (4, 2, 36, 36, cloud(0, 0) + drops([(13, 26, 10, 35), (19, 26, 16, 35), (25, 26, 22, 35), (31, 26, 28, 35)])),
    "wx_storm": (4, 2, 36, 38, cloud(0, 0) + drops([(14, 26, 11, 34), (30, 26, 27, 34)]) + BOLT),
    "wx_snow": (4, 2, 36, 36, cloud(0, 0) + flakes([(15, 30), (23, 31), (31, 30)])),
    "wx_snow_heavy": (4, 2, 36, 36, cloud(0, 0) + flakes([(12, 29), (19, 32), (26, 29), (33, 32)])),
    "wx_snow_storm": (4, 2, 36, 38, cloud(0, 0) + flakes([(13, 30), (31, 30)]) + BOLT),
}

# src/icons.jsx SKY: üstten alta renkler
SKY = {
    "day_clear": ("#1E6F8C", "#4E9DB0", "#E3C58E"),
    "day_cloud": ("#4F6A75", "#7C939A", "#BDB8A2"),
    "dawn_clear": ("#34466E", "#B77458", "#EAB56C"),
    "dawn_cloud": ("#3B4760", "#8C7068", "#C7A27E"),
    "dusk_clear": ("#2C3560", "#A35F5B", "#E39B5E"),
    "dusk_cloud": ("#343B55", "#7A6068", "#B08C78"),
    "night_clear": ("#0E1A24", "#1B3040", "#34495A"),
    "night_cloud": ("#171D22", "#2B343B", "#454E55"),
    "rain": ("#2F3F4C", "#4E6170", "#7F919B"),
    "nodata": ("#3A423E", "#4A524E", "#59625D"),
    "snow": ("#4D6070", "#8395A5", "#C3CFD8"),
    "overcast": ("#3E4A50", "#5E6B71", "#8E989B"),
}


def write(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8", newline="\n").write(text)
    print(rel)


for name, (x, y, w, h, body) in ICONS.items():
    write(f"drawable/{name}.xml",
          HDR + '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
          f'    android:width="{w}dp"\n    android:height="{h}dp"\n'
          f'    android:viewportWidth="{w}"\n    android:viewportHeight="{h}">\n'
          f'    <group\n        android:translateX="{-x}"\n        android:translateY="{-y}">\n'
          + body.replace("\n    ", "\n        ").replace("    <path", "        <path", 1)
          + '    </group>\n</vector>\n')

for name, (a, b, c) in SKY.items():
    write(f"drawable/wsky_{name}.xml",
          HDR + '<shape xmlns:android="http://schemas.android.com/apk/res/android"\n    android:shape="rectangle">\n'
          '    <corners android:radius="@dimen/hm_widget_radius" />\n'
          f'    <gradient\n        android:angle="270"\n        android:startColor="{a}"\n'
          f'        android:centerColor="{b}"\n        android:endColor="{c}"\n        android:type="linear" />\n</shape>\n')
