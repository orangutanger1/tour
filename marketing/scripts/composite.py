#!/usr/bin/env python3
"""Composite crisp on-slide typography onto a cinematic photo.
Beacon brand typography (Plus Jakarta Sans, the app's actual font).
Placed in the TikTok text-safe zone (above bottom UI, left of right-side buttons).

Usage: composite.py <base.jpg> <out.jpg> <headline> [kicker]
"""

import sys
from PIL import Image, ImageDraw, ImageFont

BASE = "/home/myen/tour/mobile/node_modules/@expo-google-fonts/plus-jakarta-sans"
W, H = 1080, 1920

# Brand palette
INK = (18, 14, 11)  # deep warm ink
AMBER = (232, 168, 124)  # warm accent
CREAM = (250, 244, 234)  # off-white headline
SCRIM_INK = (12, 9, 7)


def font(weight, size):
    return ImageFont.truetype(f"{BASE}/{weight}/PlusJakartaSans_{weight}.ttf", size)


def text_size(draw, txt, fnt):
    bbox = draw.textbbox((0, 0), txt, font=fnt)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def wrap(draw, txt, fnt, max_w):
    words = txt.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if text_size(draw, t, fnt)[0] <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def main():
    base_p, out_p, headline = sys.argv[1], sys.argv[2], sys.argv[3]
    kicker = sys.argv[4] if len(sys.argv) > 4 else None

    img = Image.open(base_p).convert("RGB").resize((W, H), Image.Resampling.LANCZOS)

    # 1. Bottom gradient scrim for legibility (covers ~lower 42%, stays above TikTok bottom UI)
    scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    scrim_start = int(H * 0.55)
    for y in range(scrim_start, H):
        t = (y - scrim_start) / (H - scrim_start)
        # ease-in for a natural falloff
        a = int(225 * (t**1.6))
        sd.rectangle([0, y, W, y + 1], fill=(*SCRIM_INK, a))
    img = Image.alpha_composite(img.convert("RGBA"), scrim)

    d = ImageDraw.Draw(img)

    # 2. Kicker (small amber label, letter-spaced, uppercase)
    max_w = W - 160  # 80px side padding
    y = int(H * 0.70)
    if kicker:
        kf = font("500Medium", 30)
        ktxt = kicker.upper()
        # letter-spacing
        spaced = "  ".join(list(ktxt))
        kw, kh = text_size(d, spaced, kf)
        d.text(((W - kw) / 2, y), spaced, font=kf, fill=AMBER)
        y += kh + 28

    # 3. Headline (Plus Jakarta 700, cream, wrapped, centered)
    hf = font("700Bold", 64)
    # auto-shrink if too long
    for sz in (64, 58, 52):
        hf = font("700Bold", sz)
        lines = wrap(d, headline, hf, max_w)
        if len(lines) <= 2:
            break
    line_h = text_size(d, "Ag", hf)[1] + 14
    for line in lines:
        lw, lh = text_size(d, line, hf)
        d.text(((W - lw) / 2, y), line, font=hf, fill=CREAM)
        y += line_h

    img.convert("RGB").save(out_p, "JPEG", quality=92)
    print(f"✓ composited {out_p}")


if __name__ == "__main__":
    main()
