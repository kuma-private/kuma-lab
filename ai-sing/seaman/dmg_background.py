"""DMG background: indigo bg + white card + bold English text only.
Renders at 2x (1600x1000) for Retina, also saves 1x (800x500).
Usage: python dmg_background.py <output_1x.png> [output_2x.png]
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

SCALE = 2
W, H = 800 * SCALE, 500 * SCALE

# ── Indigo background ────────────────────────────────────────────────
bg = np.zeros((H, W, 3), dtype=np.uint8)
for y in range(H):
    t = y / H
    bg[y, :] = [int(62 + t*8), int(60 + t*8), int(200 + t*12)]
img = Image.fromarray(bg).convert('RGBA')

# ── Card shadow ──────────────────────────────────────────────────────
CX1, CY1, CX2, CY2, R = 80*SCALE, 48*SCALE, 720*SCALE, 385*SCALE, 28*SCALE
shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
for i in range(20, 0, -1):
    a = int(45 * (1 - i / 20) ** 2)
    ImageDraw.Draw(shadow).rounded_rectangle(
        [CX1+i, CY1+i, CX2+i, CY2+i], radius=R, fill=(20, 20, 70, a))
img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(10)))

# ── White card ───────────────────────────────────────────────────────
ImageDraw.Draw(img).rounded_rectangle([CX1, CY1, CX2, CY2], radius=R, fill=(248, 248, 252, 255))

# ── Simple arrow → between icon centers ──────────────────────────────
draw = ImageDraw.Draw(img)
AC = (68, 72, 200)
s = SCALE
draw.rectangle([290*s, 198*s, 470*s, 212*s], fill=AC)
draw.polygon([(470*s, 185*s), (510*s, 205*s), (470*s, 225*s)], fill=AC)

# ── "Drag Seaman to Applications" ────────────────────────────────────
def font(size):
    for p in ['/System/Library/Fonts/HelveticaNeue.ttc',
              '/System/Library/Fonts/Helvetica.ttc']:
        try:
            return ImageFont.truetype(p, size * SCALE)
        except Exception:
            pass
    return ImageFont.load_default()

draw.text((W // 2, 435*s), 'Drag Seaman to Applications',
          fill=(255, 255, 255), font=font(27), anchor='mm')

out1x = sys.argv[1] if len(sys.argv) > 1 else '/tmp/dmg_bg.png'
out2x = sys.argv[2] if len(sys.argv) > 2 else None

img2x = img.convert('RGB')
if out2x:
    img2x.save(out2x)
    print(f"=> {out2x}  ({W}x{H}  @2x)")

img1x = img2x.resize((W // SCALE, H // SCALE), Image.LANCZOS)
img1x.save(out1x)
print(f"=> {out1x}  ({W//SCALE}x{H//SCALE}  @1x)")
