"""App Store 用 1024px アイコンを作る(ライブ配信アプリらしい見た目)。

使い方: python mobile/scripts/build-live-icon.py
出力:   mobile/store-assets/appstore/app-icon-1024.png(CI はこれをそのまま使う)

キャラは正本の透過イラスト(app/images/yukkuri-charactore-english/link/)を使い、
動画のコマや部品から作り直さない。iOS が角を丸めるので四隅には何も置かない。
アルファは持たせない(App Store はアイコンの透過を受け付けない)。
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
CHARA = ROOT / 'app/images/yukkuri-charactore-english/link/link-yukkuri-smile-mouth-open.png'
OUT = ROOT / 'mobile/store-assets/appstore/app-icon-1024.png'
FONT = '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf'

S = 1024
SS = 2  # 2倍で描いて縮める(縁を滑らかにする)
W = S * SS


def gradient(top, bottom):
    g = Image.new('RGB', (1, W))
    for y in range(W):
        t = y / (W - 1)
        g.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return g.resize((W, W)).convert('RGBA')


def glow(size, xy, radius, color):
    layer = Image.new('RGBA', size, (0, 0, 0, 0))
    x, y = xy
    ImageDraw.Draw(layer).ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.45))


def shadow_of(img, offset, blur, alpha):
    a = img.getchannel('A').point(lambda v: v * alpha // 255)
    sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sh.putalpha(a)
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.alpha_composite(sh, offset)
    return out


def main():
    # 背景: 夜の配信画面を思わせる紺→マゼンタ
    canvas = gradient((28, 16, 58), (214, 40, 110))
    canvas.alpha_composite(glow(canvas.size, (W // 2, int(W * 0.62)), int(W * 0.42), (255, 120, 190, 150)))

    # 配信の電波(キャラの後ろに3本の弧)
    waves = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(waves)
    cx, cy = W // 2, int(W * 0.60)
    for i, r in enumerate((0.42, 0.50, 0.58)):
        rr = int(W * r)
        d.arc((cx - rr, cy - rr, cx + rr, cy + rr), 205, 335,
              fill=(255, 255, 255, 90 - i * 25), width=int(W * 0.014))
    canvas.alpha_composite(waves)

    # キャラ(正本の透過イラスト)
    chara = Image.open(CHARA).convert('RGBA')
    cw = int(W * 0.86)
    chara = chara.resize((cw, cw), Image.LANCZOS)
    pos = ((W - cw) // 2, int(W * 0.20))
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    layer.alpha_composite(chara, pos)
    canvas.alpha_composite(shadow_of(layer, (0, int(W * 0.012)), int(W * 0.015), 140))
    canvas.alpha_composite(layer)

    # 「● LIVE」の赤い札(左上・角丸に食われない位置)
    font = ImageFont.truetype(FONT, int(W * 0.105))
    text = 'LIVE'
    tb = font.getbbox(text)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    dot = int(W * 0.05)
    padx, pady, gap = int(W * 0.04), int(W * 0.026), int(W * 0.025)
    pw, ph = padx * 2 + dot + gap + tw, pady * 2 + th
    px, py = int(W * 0.09), int(W * 0.085)
    pill = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    pd.rounded_rectangle((px, py, px + pw, py + ph), radius=int(W * 0.03), fill=(235, 28, 48, 255),
                         outline=(255, 255, 255, 255), width=int(W * 0.008))
    dy = py + ph // 2
    pd.ellipse((px + padx, dy - dot // 2, px + padx + dot, dy + dot // 2), fill=(255, 255, 255, 255))
    pd.text((px + padx + dot + gap - tb[0], py + pady - tb[1]), text, font=font, fill=(255, 255, 255, 255))
    canvas.alpha_composite(shadow_of(pill, (0, int(W * 0.008)), int(W * 0.01), 120))
    canvas.alpha_composite(pill)

    # コメントの吹き出し(右上・ハート入り)
    bub = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(bub)
    bx, by, bw, bh = int(W * 0.66), int(W * 0.075), int(W * 0.25), int(W * 0.17)
    bd.rounded_rectangle((bx, by, bx + bw, by + bh), radius=int(W * 0.06), fill=(255, 255, 255, 255))
    tail = [(bx + int(bw * 0.22), by + bh - 2), (bx + int(bw * 0.46), by + bh - 2),
            (bx + int(bw * 0.12), by + bh + int(W * 0.06))]
    bd.polygon(tail, fill=(255, 255, 255, 255))
    # ハート(式で輪郭を作る=継ぎ目が出ない)
    hx, hy, hs = bx + bw // 2, by + bh // 2 + int(W * 0.004), W * 0.0042
    pts = []
    for k in range(200):
        t = 2 * math.pi * k / 200
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((hx + x * hs, hy - y * hs))
    bd.polygon(pts, fill=(240, 60, 130, 255))
    canvas.alpha_composite(shadow_of(bub, (0, int(W * 0.008)), int(W * 0.01), 120))
    canvas.alpha_composite(bub)

    canvas.resize((S, S), Image.LANCZOS).convert('RGB').save(OUT, optimize=True)
    print(f'wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
