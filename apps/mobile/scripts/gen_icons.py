# havameridyen Android ikon ve açılış kaynakları (A6 ikon, A5 açılış): vektör XML üretir.
# Tasarım tuvali: https://claude.ai/artifact/46r2Aedy2u1Rfq24oXy68D (Harman.dc.html, AcilisA5.dc.html)
#
# Yalnız ikon değişirse yeniden çalıştırılır (apps/mobile klasöründen):
#   pip install skia-pathops fonttools brotli uharfbuzz
#   python scripts/gen_icons.py android/app/src/main/res node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2
# Üretilenler: drawable/ic_launcher_foreground.xml, ic_launcher_monochrome.xml, splash_icon.xml, splash_brand.xml;
# mipmap-anydpi-v26/ic_launcher(_round).xml; mipmap/ic_launcher(_round).xml (Android 7.0–7.1).
import math, sys, os, io
import pathops
from pathops import Path, PathOp, LineCap, LineJoin, ArcSize, Direction
from fontTools.pens.svgPathPen import SVGPathPen

OUT = sys.argv[1]  # .../android/app/src/main/res
# Renk R2 (25 Ekim, Ali Kemal): turkuaz gökyüzü zemini + sarı-turuncu güneş ve halka (ilk sürüm: #1E7A6B + #D98E2B)
TEAL, CREAM, AMBER, INK, BG = "#168BA0", "#F7F9F5", "#F5B83D", "#1F2A24", "#EEF1EC"

def circle(cx, cy, r):
    p = Path(); p.moveTo(cx - r, cy)
    p.arcTo(r, r, 0, ArcSize.SMALL, Direction.CW, cx + r, cy)
    p.arcTo(r, r, 0, ArcSize.SMALL, Direction.CW, cx - r, cy)
    p.close(); return p

def ellipse(cx, cy, rx, ry):
    p = Path(); p.moveTo(cx - rx, cy)
    p.arcTo(rx, ry, 0, ArcSize.SMALL, Direction.CW, cx + rx, cy)
    p.arcTo(rx, ry, 0, ArcSize.SMALL, Direction.CW, cx - rx, cy)
    p.close(); return p

def line(x1, y1, x2, y2):
    p = Path(); p.moveTo(x1, y1); p.lineTo(x2, y2); return p

def arc(x1, y1, rx, ry, large, sweep, x2, y2):
    p = Path(); p.moveTo(x1, y1)
    p.arcTo(rx, ry, 0, ArcSize.LARGE if large else ArcSize.SMALL, Direction.CW if sweep else Direction.CCW, x2, y2)
    return p

def poly(pts):
    p = Path(); p.moveTo(*pts[0])
    for q in pts[1:]: p.lineTo(*q)
    p.close(); return p

def stroke(p, w, cap=LineCap.BUTT_CAP, join=LineJoin.MITER_JOIN):
    q = Path(); q.addPath(p); q.stroke(w, cap, join, 4); return q

def rot(p, deg, cx, cy):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    return p.transform(c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy)

def Q(p):
    q = Path(); q.addPath(p); q.convertConicsToQuads(); return q

def U(*ps):
    r = Path()
    for p in ps: r = pathops.op(r, Q(p), PathOp.UNION)
    return r

def D(a, b): return pathops.op(Q(a), Q(b), PathOp.DIFFERENCE)

def d(p):
    q = Path(); q.addPath(p); q.convertConicsToQuads()
    pen = SVGPathPen(None, ntos=lambda v: ("%.2f" % v).rstrip("0").rstrip("."))
    q.draw(pen); return pen.getCommands()

# --- A5/A6 geometrisi (108 birimlik tuval, görünen orta 72) ---
CX, CY, ROT = 52, 56, 18
cream = U(stroke(circle(CX, CY, 20), 3.5), stroke(ellipse(CX, CY, 9, 20), 3), stroke(line(52, 36, 52, 76), 3))
ARROW = [(82.6, 58.5), (77.9, 64.1), (75.3, 57.7)]
front_gap = rot(U(stroke(arc(23.8, 58.9, 30, 8.5, 0, 0, 76.6, 60.9), 7),
                  U(poly(ARROW), stroke(poly(ARROW), 4, LineCap.ROUND_CAP, LineJoin.ROUND_JOIN))), ROT, CX, CY)
front = rot(U(stroke(arc(22, 56, 30, 8.5, 0, 0, 76.6, 60.9), 3, LineCap.ROUND_CAP),
              U(poly(ARROW), stroke(poly(ARROW), 1, LineCap.ROUND_CAP, LineJoin.ROUND_JOIN))), ROT, CX, CY)
back = rot(stroke(arc(22, 56, 30, 8.5, 0, 1, 82, 56), 3, LineCap.ROUND_CAP), ROT, CX, CY)
globe_gap = circle(CX, CY, 24)

RAYS = [((77.5, 38), (79.8, 38)), ((75.01, 44.01), (76.64, 45.64)), ((69, 46.5), (69, 48.8)),
        ((62.99, 44.01), (61.36, 45.64)), ((60.5, 38), (58.2, 38)), ((62.99, 31.99), (61.36, 30.36)),
        ((69, 29.5), (69, 27.2)), ((75.01, 31.99), (76.64, 30.36))]

def glyph(rays):
    sun = U(circle(69, 38, 6), *[stroke(line(*a, *b), 2.6, LineCap.ROUND_CAP) for a, b in RAYS]) if rays else circle(69, 38, 7.5)
    amber_back = D(D(U(sun, back), globe_gap), front_gap)
    cr = D(cream, front_gap)
    am = U(amber_back, front)
    return cr, am

ic_cream, ic_amber = glyph(False)   # A6: ikon
sp_cream, sp_amber = glyph(True)    # A5: açılış

HDR = '<?xml version="1.0" encoding="utf-8"?>\n<!-- havameridyen: üretildi (Claude, ikon1). Elle düzenlemeyin; kaynak: tasarım tuvali ve gen_icons.py. -->\n'

def vector(w, h, vw, vh, body, extra=""):
    return (HDR + f'<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            f'    android:width="{w}dp"\n    android:height="{h}dp"\n'
            f'    android:viewportWidth="{vw}"\n    android:viewportHeight="{vh}"{extra}>\n{body}</vector>\n')

def pth(path, color, indent="    "):
    return f'{indent}<path\n{indent}    android:fillColor="{color}"\n{indent}    android:pathData="{d(path)}" />\n'

def write(rel, text):
    fp = os.path.join(OUT, rel); os.makedirs(os.path.dirname(fp), exist_ok=True)
    open(fp, "w", encoding="utf-8", newline="\n").write(text)
    print(rel, len(text))

# Uyarlanabilir ikon katmanları (API 26+)
write("drawable/ic_launcher_foreground.xml", vector(108, 108, 108, 108, pth(ic_cream, CREAM) + pth(ic_amber, AMBER)))
write("drawable/ic_launcher_monochrome.xml", vector(108, 108, 108, 108, pth(U(ic_cream, ic_amber), "#FFFFFF")))
adaptive = (HDR + '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@color/ic_launcher_background" />\n'
            '    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n'
            '    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />\n'
            '</adaptive-icon>\n')
write("mipmap-anydpi-v26/ic_launcher.xml", adaptive)
write("mipmap-anydpi-v26/ic_launcher_round.xml", adaptive)

# Eski Android (API 24–25): tek parça vektör ikon, görünen orta 72 birim
def legacy(shape):
    g = (f'    <path\n        android:fillColor="{TEAL}"\n        android:pathData="{shape}" />\n'
         f'    <group android:translateX="-18" android:translateY="-18">\n'
         + pth(ic_cream, CREAM, "        ") + pth(ic_amber, AMBER, "        ") + '    </group>\n')
    return vector(48, 48, 72, 72, g)
rr = Path(); r = 14
rr.moveTo(r, 0); rr.lineTo(72 - r, 0); rr.arcTo(r, r, 0, ArcSize.SMALL, Direction.CW, 72, r); rr.lineTo(72, 72 - r)
rr.arcTo(r, r, 0, ArcSize.SMALL, Direction.CW, 72 - r, 72); rr.lineTo(r, 72); rr.arcTo(r, r, 0, ArcSize.SMALL, Direction.CW, 0, 72 - r)
rr.lineTo(0, r); rr.arcTo(r, r, 0, ArcSize.SMALL, Direction.CW, r, 0); rr.close()
write("mipmap/ic_launcher.xml", legacy(d(rr)))
write("mipmap/ic_launcher_round.xml", legacy(d(circle(36, 36, 36))))

# Açılış ikonu (A5 glif; zemin dairesini sistem çizer: windowSplashScreenIconBackgroundColor)
write("drawable/splash_icon.xml", vector(240, 240, 108, 108, pth(sp_cream, CREAM) + pth(sp_amber, AMBER)))

# Marka yazısı (Android 12+ açılışın altı, 200×80 dp): Space Grotesk 700, "hava" koyu + "meridyen" yeşil
from fontTools.ttLib import TTFont
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
import uharfbuzz as hb
FONT = sys.argv[2]
tt = TTFont(FONT); buf = io.BytesIO(); tt.flavor = None; tt.save(buf); data = buf.getvalue()
face = hb.Face(data); font = hb.Font(face); upem = face.upem
b = hb.Buffer(); b.add_str("havameridyen"); b.guess_segment_properties(); hb.shape(font, b, {"kern": True})
gs = tt.getGlyphSet(); order = tt.getGlyphOrder()
SIZE = 24.0; sc = SIZE / upem; track = -0.02 * upem
x = 0; parts = []
for i, (info, pos) in enumerate(zip(b.glyph_infos, b.glyph_positions)):
    parts.append((order[info.codepoint], x + pos.x_offset)); x += pos.x_advance + track
width = (x - track) * sc
x0 = (200 - width) / 2; base = 40 + 0.36 * SIZE
def textpath(rng):
    p = Path(); pen = DecomposingRecordingPen(gs)
    for name, gx in [parts[i] for i in rng]:
        gs[name].draw(TransformPen(pen, (sc, 0, 0, -sc, x0 + gx * sc, base)))
    pen.replay(p.getPen())
    return pathops.simplify(p)
write("drawable/splash_brand.xml", vector(200, 80, 200, 80, pth(textpath(range(0, 4)), INK) + pth(textpath(range(4, 12)), TEAL)))
print("yazı genişliği %.1f dp" % width)
