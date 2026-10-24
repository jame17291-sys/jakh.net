#!/usr/bin/env python3
"""Create the small committed WebP derivatives for illustrations and the logo.

Run from any directory: python3 scripts/generate-responsive-derivatives.py
Existing files are kept unless --force is given, so reruns are no-ops.

Requires Pillow with WebP support. The full-size sources stay the committed
960w illustrations and the supplied 1536x1024 logo; no original artwork is
needed. scripts/validate-responsive-images.mjs checks that every derivative
exists with the expected dimensions.

Illustrations (3:2): 240w and 640w from the 960w file
  (ILLUSTRATION_WIDTHS in site-illustrations.js).
Logo: 264w and 396w (2x and 3x of the 132px header box), keeping its sRGB
  ICC profile and dropping metadata.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ILLUSTRATIONS = ROOT / 'assets/illustrations'
LOGO = ROOT / 'assets/riddlearabia-logo.webp'
ILLUSTRATION_WIDTHS = (240, 640)
LOGO_WIDTHS = (264, 396)
FORCE = '--force' in sys.argv[1:]


def resized(image, width):
    height = round(width * image.height / image.width)
    if image.mode == 'RGBA':
        # Resample premultiplied colour so transparent edges do not darken.
        return image.convert('RGBa').resize((width, height), Image.LANCZOS).convert('RGBA')
    return image.convert('RGB').resize((width, height), Image.LANCZOS)


def write(target, image, **options):
    if target.exists() and not FORCE:
        return False
    image.save(target, 'WEBP', method=6, **options)
    return True


def main():
    written = 0
    sources = sorted(ILLUSTRATIONS.glob('*-960.webp'))
    if not sources:
        raise SystemExit('No 960w illustrations found')
    for source in sources:
        stem = source.name[:-len('-960.webp')]
        with Image.open(source) as image:
            image.load()
            for width in ILLUSTRATION_WIDTHS:
                written += write(ILLUSTRATIONS / f'{stem}-{width}.webp', resized(image, width), quality=82)
    with Image.open(LOGO) as logo:
        logo.load()
        profile = logo.info.get('icc_profile')
        for width in LOGO_WIDTHS:
            target = LOGO.with_name(f'{LOGO.stem}-{width}.webp')
            written += write(target, resized(logo, width), quality=90, **({'icc_profile': profile} if profile else {}))
    print(f'Wrote {written} responsive derivative(s) for {len(sources)} illustrations and the logo.')


if __name__ == '__main__':
    main()
