#!/usr/bin/env python3
"""Generate the PWA / favicon / apple-touch icon set from the FeeOptima logo.

    python3 scripts/make-icons.py path/to/logo.png

Why this isn't just a resize:

* The wordmark is dropped. A launcher icon renders around 48-64px on screen;
  "FeeOptima" at that size is an illegible smear that costs the mark its
  clarity. The script finds the band of blank rows between the mark and the
  wordmark and cuts there, so only the symbol survives.
* Maskable icons are cropped by the platform. Android applies a circle or
  squircle and can take ~20% off every edge, so the mark is scaled into the
  middle 60% and the background bleeds to all four edges. Feed it a full-bleed
  logo and the key and arrow lose their tips.
* Transparency is flattened. A PWA icon sits on the user's wallpaper and an
  apple-touch-icon with alpha gets composited on black by iOS.

Pass --bg '#1d63c4' to sit the mark on brand blue instead of white.
"""
import sys
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / 'client' / 'public'

# name, size, mark scale (fraction of canvas the mark spans)
TARGETS = [
    ('pwa-192x192.png',          192, 0.86),
    ('pwa-512x512.png',          512, 0.86),
    ('pwa-maskable-192x192.png', 192, 0.60),   # inside the safe zone
    ('pwa-maskable-512x512.png', 512, 0.60),
    ('apple-touch-icon.png',     180, 0.80),
    ('favicon-64.png',            64, 0.92),
]


def parse_bg(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def content_box(img, bg_tol=246):
    """Bounding box of everything that isn't near-white / transparent."""
    rgba = img.convert('RGBA')
    px = rgba.load()
    w, h = rgba.size
    xs0, ys0, xs1, ys1 = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 24 and not (r > bg_tol and g > bg_tol and b > bg_tol):
                if x < xs0: xs0 = x
                if y < ys0: ys0 = y
                if x > xs1: xs1 = x
                if y > ys1: ys1 = y
    if xs1 <= xs0 or ys1 <= ys0:
        sys.exit('✗ Could not find any artwork — is the image blank?')
    return xs0, ys0, xs1 + 1, ys1 + 1


def drop_wordmark(img, box):
    """Cut at the widest run of blank rows below the vertical midpoint.

    The gap between the symbol and the word is the largest horizontal band of
    empty pixels in the lower half of a stacked logo, which makes it a reliable
    split point without hardcoding this particular file's proportions.
    """
    x0, y0, x1, y1 = box
    rgba = img.convert('RGBA')
    px = rgba.load()

    blank = []
    for y in range(y0, y1):
        empty = True
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a > 24 and not (r > 246 and g > 246 and b > 246):
                empty = False
                break
        blank.append((y, empty))

    mid = y0 + (y1 - y0) // 2
    best_len, best_start, run_start = 0, None, None
    for y, empty in blank:
        if empty and y > mid:
            if run_start is None:
                run_start = y
        else:
            if run_start is not None and y - run_start > best_len:
                best_len, best_start = y - run_start, run_start
            run_start = None
    if run_start is not None and (y1 - run_start) > best_len:
        best_len, best_start = y1 - run_start, run_start

    # Only trust a gap that's a real separator, not inter-letter spacing.
    if best_start and best_len >= (y1 - y0) * 0.02:
        print(f'  wordmark split at y={best_start} (gap of {best_len}px) — dropping it')
        return (x0, y0, x1, best_start)
    print('  no clear wordmark gap found — using the whole image')
    return box


def render(mark, size, scale, bg):
    canvas = Image.new('RGB', (size, size), bg)
    target = int(size * scale)
    w, h = mark.size
    ratio = min(target / w, target / h)
    resized = mark.resize((max(1, round(w * ratio)), max(1, round(h * ratio))), Image.LANCZOS)
    x = (size - resized.size[0]) // 2
    y = (size - resized.size[1]) // 2
    canvas.paste(resized, (x, y), resized)   # alpha as the mask → flattened onto bg
    return canvas


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit(__doc__)
    src = Path(args[0]).expanduser()
    if not src.exists():
        sys.exit(f'✗ No such file: {src}')

    bg = parse_bg('#ffffff')
    for a in sys.argv[1:]:
        if a.startswith('--bg'):
            bg = parse_bg(a.split('=', 1)[1] if '=' in a else sys.argv[sys.argv.index(a) + 1])

    img = Image.open(src).convert('RGBA')
    print(f'→ {src.name}  {img.size[0]}x{img.size[1]}')
    box = content_box(img)
    print(f'  artwork bounds {box}')
    box = drop_wordmark(img, box)
    mark = img.crop(box)
    print(f'  mark {mark.size[0]}x{mark.size[1]}  ·  background #{bg[0]:02x}{bg[1]:02x}{bg[2]:02x}')

    for name, size, scale in TARGETS:
        render(mark, size, scale, bg).save(OUT / name, 'PNG', optimize=True)
        print(f'  ✓ {name:<28} {size}x{size}  mark at {int(scale * 100)}%')

    print(f'\nWritten to {OUT}')
    print('Check the maskable ones against a circle crop: https://maskable.app/editor')


if __name__ == '__main__':
    main()
