"""產生 App 圖示（黑底 + 香檳金錢包）。

用法：python tools/make_icons.py（需要 Pillow）
"""
from pathlib import Path

from PIL import Image, ImageDraw

INK = (17, 17, 17)        # #111111
GOLD = (233, 196, 106)    # #E9C46A
GOLD_DARK = (190, 150, 62)
OUT = Path(__file__).resolve().parent.parent / 'icons'


def draw(size):
    s = 1024
    img = Image.new('RGB', (s, s), INK)
    d = ImageDraw.Draw(img)
    # 後面那張卡片（錢包裡露出的紙鈔）
    d.rounded_rectangle([250, 255, 720, 520], radius=56, fill=GOLD_DARK)
    # 錢包本體
    d.rounded_rectangle([200, 355, 824, 790], radius=88, fill=GOLD)
    # 扣環區
    d.rounded_rectangle([590, 490, 864, 655], radius=82, fill=INK)
    d.ellipse([655, 535, 730, 610], fill=GOLD)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    for size in (180, 192, 512):
        draw(size).save(OUT / f'icon-{size}.png', optimize=True)
        print('icon', size)
