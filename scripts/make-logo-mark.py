#!/usr/bin/env python3
"""Turn the source logo (a JPEG on white) into the transparent PNG the navbar uses.

The navbar is translucent — rgba(255,255,255,.9) over a blurred backdrop — so a
JPEG's baked-in white background reads as a visible white rectangle whenever the
navy hero scrolls under it. This trims the whitespace and maps near-white to
alpha, leaving the ink colours untouched.

Re-run after replacing client/public/logo.jpeg:
    python3 scripts/make-logo-mark.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'client' / 'public' / 'logo.jpeg'
OUT = ROOT / 'client' / 'public' / 'logo-mark.png'

# Whiteness ramp. The source is JPEG, so the "white" field sits around 250-254
# and compression ringing dirties the edges into the 230s — a hard threshold
# would leave grey speckle around the artwork.
CLEAR = 248   # >= this is background: fully transparent
SOLID = 225   # <= this is ink: fully opaque
OUT_HEIGHT = 120  # ~3x the rendered navbar height, so it stays crisp on retina


def main() -> None:
    im = Image.open(SRC).convert('RGB')
    px = im.load()
    w, h = im.size

    alpha = Image.new('L', (w, h))
    ap = alpha.load()
    span = CLEAR - SOLID
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            whiteness = min(r, g, b)
            if whiteness >= CLEAR:
                ap[x, y] = 0
            elif whiteness <= SOLID:
                ap[x, y] = 255
            else:
                ap[x, y] = int(round((CLEAR - whiteness) * 255 / span))

    im.putalpha(alpha)
    box = im.getbbox()          # crop to the artwork itself
    if box:
        im = im.crop(box)

    scale = OUT_HEIGHT / im.height
    im = im.resize((max(1, round(im.width * scale)), OUT_HEIGHT), Image.LANCZOS)
    im.save(OUT, 'PNG', optimize=True)
    print(f'wrote {OUT.relative_to(ROOT)} — {im.width}x{im.height}, {OUT.stat().st_size / 1024:.1f} kB')


if __name__ == '__main__':
    main()
