#!/usr/bin/env python3
"""Gera o banner 320x180 exigido pelo launcher leanback de Android TV/
Google TV (android:banner no AndroidManifest.xml).

Reaproveita a mesma paleta e fonte já usadas no ícone adaptativo do app
(#C8F400 sobre #1a1a1a, Bebas Neue) — ver CLAUDE.md, 10ª/12ª decisões.
Margem de segurança de ~10% nas bordas porque alguns launchers de TV
cortam os cantos do banner.

Uso: python3 scripts/gen_tv_banner.py
"""
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 320, 180
DARK = (26, 26, 26, 255)  # #1a1a1a
YELLOW = (200, 244, 0, 255)  # #C8F400
FONT_PATH = "roku-standalone/fonts/BebasNeue-Regular.ttf"
OUT_PATH = "android/app/src/main/res/drawable/tv_banner.png"

img = Image.new("RGBA", (WIDTH, HEIGHT), DARK)
draw = ImageDraw.Draw(img)

title = "CT TIMER"
font_size = 54
font = ImageFont.truetype(FONT_PATH, font_size)
bbox = draw.textbbox((0, 0), title, font=font)
text_w = bbox[2] - bbox[0]
text_h = bbox[3] - bbox[1]

# Reduz a fonte até caber dentro da margem de segurança (~10% de cada lado).
safe_w = WIDTH * 0.8
while text_w > safe_w and font_size > 10:
    font_size -= 2
    font = ImageFont.truetype(FONT_PATH, font_size)
    bbox = draw.textbbox((0, 0), title, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

x = (WIDTH - text_w) / 2 - bbox[0]
y = (HEIGHT - text_h) / 2 - bbox[1]
draw.text((x, y), title, font=font, fill=YELLOW)

img.convert("RGB").save(OUT_PATH)
print(f"Banner salvo em {OUT_PATH} ({WIDTH}x{HEIGHT})")
