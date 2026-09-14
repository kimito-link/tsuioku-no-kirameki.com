"""
`/live/`「追憶のきらめき ランキング」の OG カード画像(1200x630)を生成する。

出力: tsuioku-no-kirameki/images/og-live-ranking.png
      (+ 確認用のセーフ枠つき build/store-listing/og-live-ranking_guide.png)

★なぜ tools/ に置くか(2026-09-14)
  出力の PNG は git 追跡下に置く(サイトが配信する実体)。生成スクリプトが build/ にあると
  .gitignore で追跡されず、clone 先から「焼き直す手段」が消える。tools/render-og.js(既存・
  og-image.png を焼く)と同じ置き場にして、PNG と生成手段を常に対にする。
  ★build/store-listing/_gen_x_header_live_ranking.py(1500x500 の X ヘッダー)から関数・定数を
  コピーしてある(build/ は gitignore 下なので import できない)。

★方針(元スクリプトと同じ)
  - 素材は正本だけ(ロゴ = extension/images/logo/kimito-link-ginga-color.png、
    キャラ = extension/images/yukkuri-charactore-english)。
    LOGO-RULES.md: ロゴは主役・明るい地に置く(濃紺なので暗い地に直置きしない)→ クリームのカードに載せる。
  - 配色は LP の夜空(濃紺)＋ロゴの紺/オレンジ。文字は BIZ UDゴシック(Windows 同梱)。
  - 数字は書かない(実績値の出典が無い数字を載せない)。「⚡ リアルタイム」はページの
    .realtime-badge と同語。
  - セーフ枠は上下左右 8% 内側(x 96〜1104 / y 50〜580)。要素は全部この内側。
  - X の画像上限は 5MB。焼いた直後に寸法とバイト数を print する。
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAR_DIR = os.path.join(ROOT, "extension", "images", "yukkuri-charactore-english")
LOGO = os.path.join(ROOT, "extension", "images", "logo", "kimito-link-ginga-color.png")
OUT_DIR = os.path.join(ROOT, "tsuioku-no-kirameki", "images")
GUIDE_DIR = os.path.join(ROOT, "build", "store-listing")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(GUIDE_DIR, exist_ok=True)

FONT_BOLD = r"C:\Windows\Fonts\BIZ-UDGothicB.ttc"
FONT_REG = r"C:\Windows\Fonts\BIZ-UDGothicR.ttc"

W, H = 1200, 630
NAVY_TOP = (8, 15, 34)
NAVY_MID = (16, 34, 70)
NAVY_BOT = (20, 55, 92)
CREAM = (255, 250, 244)
ORANGE = (200, 114, 28)
GOLD = (246, 196, 83)
INK = (26, 18, 8)

# セーフ枠(上下左右 8% 内側)
SAFE = (96, 50, 1104, 580)


def f(path, size):
    return ImageFont.truetype(path, size)


def bg():
    img = Image.new("RGB", (W, H), NAVY_TOP)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        a, b = (NAVY_TOP, NAVY_MID) if t < 0.55 else (NAVY_MID, NAVY_BOT)
        tt = t / 0.55 if t < 0.55 else (t - 0.55) / 0.45
        c = tuple(int(a[i] + (b[i] - a[i]) * tt) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    # 天の川(ぼかした斜めの帯)
    band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    bd.polygon([(0, 480), (W, 50), (W, 250), (0, 630)], fill=(120, 150, 210, 46))
    band = band.filter(ImageFilter.GaussianBlur(60))
    img.paste(band, (0, 0), band)
    # 星
    rnd = random.Random(20260914)
    sd = ImageDraw.Draw(img)
    for _ in range(260):
        x, y = rnd.randrange(W), rnd.randrange(H)
        r = rnd.choice([1, 1, 1, 2, 2, 3])
        col = rnd.choice([(255, 255, 255), (220, 232, 255), (255, 236, 220)])
        alpha = rnd.randrange(90, 230)
        dot = Image.new("RGBA", (r * 2 + 1, r * 2 + 1), (0, 0, 0, 0))
        ImageDraw.Draw(dot).ellipse([0, 0, r * 2, r * 2], fill=col + (alpha,))
        img.paste(dot, (x, y), dot)
    return img


def logo_card(img, x, y, w, h):
    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, w - 1, h - 1], radius=28, fill=CREAM + (255,), outline=(255, 255, 255, 220), width=3)
    glow = Image.new("RGBA", (w + 80, h + 80), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle([0, 0, w + 79, h + 79], radius=60, fill=(140, 185, 255, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(30))
    img.paste(glow, (x - 40, y - 40), glow)
    lg = Image.open(LOGO).convert("RGBA")
    lw = w - 36
    lg = lg.resize((lw, int(lg.height * lw / lg.width)), Image.LANCZOS)
    card.paste(lg, ((w - lg.width) // 2, (h - lg.height) // 2), lg)
    img.paste(card, (x, y), card)


def char(img, folder, fn, box_h, xy):
    p = os.path.join(CHAR_DIR, folder, fn)
    c = Image.open(p).convert("RGBA")
    r = box_h / c.height
    c = c.resize((max(1, int(c.width * r)), box_h), Image.LANCZOS)
    # 影
    sh = Image.new("RGBA", c.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([c.width * 0.18, c.height * 0.82, c.width * 0.82, c.height * 0.98], fill=(0, 0, 0, 110))
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    img.paste(sh, (xy[0], xy[1] + 10), sh)
    img.paste(c, xy, c)


def pill(d, x, y, text, fnt, fill, color):
    tw = d.textlength(text, font=fnt)
    h = fnt.size + 22
    d.rounded_rectangle([x, y, x + tw + 44, y + h], radius=h // 2, fill=fill)
    d.text((x + 22, y + 10), text, font=fnt, fill=color)
    return x + tw + 44


def main():
    img = bg()
    d = ImageDraw.Draw(img)

    # 左: ロゴ(主役・明るい地)
    logo_card(img, 110, 150, 300, 236)

    # 右: 文言(セーフ枠 x<1104 の内側に収める)
    tx = 450
    d.text((tx, 150), "追憶のきらめき", font=f(FONT_BOLD, 64), fill=CREAM)
    d.text((tx, 228), "ランキング", font=f(FONT_BOLD, 54), fill=GOLD)
    d.text((tx, 310), "いま配信を支えている人が、リアルタイムで見える", font=f(FONT_BOLD, 28), fill=(232, 240, 255))
    d.text((tx, 352), "ニコニコ生放送 ／ ギフト・広告で応援した人を配信ごとに", font=f(FONT_REG, 22), fill=(190, 205, 235))
    # ピル: URL(オレンジ)と「リアルタイム」(クリーム地)。★数字は載せない。
    # ★⚡(U+26A1)は BIZ UDゴシックに無く豆腐(□)になる(_guide.png で実測)。絵文字は載せない。
    pill(d, tx, 392, "tsuioku-no-kirameki.com/live/", f(FONT_BOLD, 24), ORANGE, (255, 255, 255))
    pill(d, tx, 462, "リアルタイム更新", f(FONT_BOLD, 24), CREAM, INK)

    # 左下: 3キャラ(笑顔)。ロゴの下・ピル(x>=450)と重ねない位置に確定(_guide.png で目視調整)。
    char(img, "tanunee", "tanuki-yukkuri-smile-mouth-open.png", 132, (100, 448))
    char(img, "konta", "kitsune-yukkuri-smile-mouth-open.png", 132, (300, 448))
    char(img, "link", "link-yukkuri-smile-mouth-open.png", 156, (200, 424))

    out = os.path.join(OUT_DIR, "og-live-ranking.png")
    img.save(out, "PNG", optimize=True)

    # 確認用: セーフ枠(上下左右 8% 内側)
    g = img.copy()
    gd = ImageDraw.Draw(g)
    gd.rectangle(list(SAFE), outline=(255, 80, 80), width=3)
    g.save(os.path.join(GUIDE_DIR, "og-live-ranking_guide.png"), "PNG")

    im = Image.open(out)
    print(im.size, os.path.getsize(out))


if __name__ == "__main__":
    main()
