"""
og-live-compose.py — 配信ごとの OGP カード画像(1200x630)を「plan の文字列を描くだけ」で焼く。

    python3 tools/og-live-compose.py plan.json outdir

■ 役割分担(設計 §8・正本 1 つ)
  - 数字の整形・0 省略・名前の切り詰め・時刻ラベルは【Node(scripts/live-og-bake.mjs)が
    src/lib/liveOgStats.js で決めて plan.json に書く】。
  - このスクリプトは plan の【文字列をそのまま描くだけ】。数字を計算し直さない・ネットに出ない。
    ★配信サムネの取得も Node がやる(plan.thumbPath = すでにローカルに落ちた画像)。

■ plan.json の形(Node が書く)
  {
    "lives": [
      {
        "lv": "lvNNN",
        "thumbPath": "<ローカルに落とした配信サムネの絶対パス>",  # 無ければ描かない側で判定済み
        "outPath": "<出力 JPEG の絶対パス>",
        "streamerLine": "<配信者名> の配信",   # 名前は Node が SHARE_NAME_MAX で切り済み
        "timeLabel": "HH:MM 時点",             # JST・Node が組み立て済み
        "statLines": ["来場 8,368   コメント 12,324", "ギフト 117,280pt   広告 1,275,956pt"],
        "pillText": "追憶のきらめき ランキング"
      }
    ]
  }

■ 出力
  各 live の outPath に JPEG(quality 80)を書く。1 枚が 300KB を超えたら quality 70 で焼き直し、
  それでも超えたら【焼かない】(その配信は Node が hash に入れない=サムネ直へ fail-soft・設計 §6)。
  1 行 JSON を stdout に出す({kind:'og-compose', baked, skipped, results:[{lv, bytes, ok}]})。

■ フォント
  BIZ UDGothic Bold。環境変数 OG_FONT_PATH があればそれ、無ければ Windows 同梱パス。
  取れなければ全件 skip(exit 1)。★リポにコミットしない(5MB 門・AGENTS §13)。
  ★絵文字は描かない(BIZ UD に無く豆腐になる=gen-og-live-ranking.py:134 の実測)。

★配色定数・pill() は tools/gen-og-live-ranking.py から【複製】する(import しない)。
  理由: 向こうは FONT_BOLD が Windows 固定パスで、import すると CI(Linux)で読み込み時に
  壊れる。定数と 1 関数だけ写し、フォントパスはこちらで環境変数から決める。
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── tools/gen-og-live-ranking.py から複製した配色(import しない理由は冒頭コメント) ──
W, H = 1200, 630
NAVY_TOP = (8, 15, 34)
CREAM = (255, 250, 244)
GOLD = (246, 196, 83)
INK = (26, 18, 8)

# 下部の数字帯(設計 §8)。
BAND_TOP = 440
BAND_ALPHA = 215

# JPEG 1 枚の上限(設計 §6・§8)。超えたら quality を落とし、それでも超えたら焼かない。
MAX_BYTES = 300_000


def _font_path():
    """BIZ UDGothic Bold のパス。OG_FONT_PATH 優先、無ければ Windows 同梱。読めなければ None。"""
    env = os.environ.get("OG_FONT_PATH", "").strip()
    candidates = [env] if env else []
    candidates.append(r"C:\Windows\Fonts\BIZ-UDGothicB.ttc")
    for p in candidates:
        if p and os.path.exists(p):
            return p
    return None


def _load_font(path, size):
    return ImageFont.truetype(path, size)


def pill(d, x, y, text, fnt, fill, color):
    """tools/gen-og-live-ranking.py:112 から複製(pill を写す・冒頭コメント参照)。"""
    tw = d.textlength(text, font=fnt)
    h = fnt.size + 22
    d.rounded_rectangle([x, y, x + tw + 44, y + h], radius=h // 2, fill=fill)
    d.text((x + 22, y + 10), text, font=fnt, fill=color)
    return x + tw + 44


def _cover_crop(img, w, h):
    """配信サムネを cover(縦横比を保って埋め、はみ出しをセンタークロップ)で w x h に。"""
    iw, ih = img.size
    if iw <= 0 or ih <= 0:
        return Image.new("RGB", (w, h), NAVY_TOP)
    scale = max(w / iw, h / ih)
    nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
    resized = img.resize((nw, nh), Image.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    return resized.crop((left, top, left + w, top + h))


def compose_one(live, font_path):
    """1 枚焼く。焼けた bytes を返す(焼かなかった/失敗は 0)。"""
    thumb_path = str(live.get("thumbPath") or "")
    out_path = str(live.get("outPath") or "")
    if not out_path:
        return 0
    # 背景 = 配信サムネを cover-crop。取れていなければ濃紺ベタ(Node 側で通常は skip 済み)。
    if thumb_path and os.path.exists(thumb_path):
        try:
            base = Image.open(thumb_path).convert("RGB")
        except Exception:
            base = Image.new("RGB", (W, H), NAVY_TOP)
        canvas = _cover_crop(base, W, H)
    else:
        canvas = Image.new("RGB", (W, H), NAVY_TOP)

    # 下部の帯(半透明の濃紺)を重ねる。
    band = Image.new("RGBA", (W, H - BAND_TOP), NAVY_TOP + (BAND_ALPHA,))
    canvas_rgba = canvas.convert("RGBA")
    canvas_rgba.paste(band, (0, BAND_TOP), band)
    img = canvas_rgba.convert("RGB")
    d = ImageDraw.Draw(img)

    f_name = _load_font(font_path, 32)
    f_stat = _load_font(font_path, 44)
    f_time = _load_font(font_path, 22)
    f_pill = _load_font(font_path, 24)

    # 左上ピル(設計 §8)。
    pill_text = str(live.get("pillText") or "")
    if pill_text:
        pill(d, 40, 32, pill_text, f_pill, CREAM, INK)

    # 行1: 配信者名 の配信(左)＋ HH:MM 時点(右)。
    streamer_line = str(live.get("streamerLine") or "")
    if streamer_line:
        d.text((40, 454), streamer_line, font=f_name, fill=CREAM)
    time_label = str(live.get("timeLabel") or "")
    if time_label:
        tw = d.textlength(time_label, font=f_time)
        d.text((W - 40 - tw, 460), time_label, font=f_time, fill=(190, 205, 235))

    # 行2・行3: 数字(GOLD)。Node が 0 省略・整形済みの文字列をそのまま描く。
    stat_lines = live.get("statLines") or []
    ys = [496, 550]
    for i, line in enumerate(stat_lines[:2]):
        if line:
            d.text((40, ys[i]), str(line), font=f_stat, fill=GOLD)

    # JPEG で書く。上限を超えたら quality を落とし、それでも超えたら焼かない。
    for q in (80, 70):
        img.save(out_path, "JPEG", quality=q, optimize=True)
        size = os.path.getsize(out_path)
        if size <= MAX_BYTES:
            return size
    # 70 でも超えた: 焼かない(残った巨大ファイルは消す)。
    try:
        os.remove(out_path)
    except OSError:
        pass
    return 0


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"kind": "og-compose", "error": "usage: og-live-compose.py plan.json outdir"}))
        sys.exit(2)
    plan_path = sys.argv[1]
    outdir = sys.argv[2]
    os.makedirs(outdir, exist_ok=True)

    font_path = _font_path()
    if not font_path:
        print(json.dumps({"kind": "og-compose", "error": "font not found (set OG_FONT_PATH)"}))
        sys.exit(1)

    try:
        with open(plan_path, "r", encoding="utf-8") as fh:
            plan = json.load(fh)
    except Exception as e:
        print(json.dumps({"kind": "og-compose", "error": f"plan read: {e}"}))
        sys.exit(1)

    lives = plan.get("lives") if isinstance(plan, dict) else None
    if not isinstance(lives, list):
        print(json.dumps({"kind": "og-compose", "error": "plan.lives missing"}))
        sys.exit(1)

    results = []
    baked = 0
    skipped = 0
    for live in lives:
        if not isinstance(live, dict):
            skipped += 1
            continue
        lv = str(live.get("lv") or "")
        try:
            bytes_written = compose_one(live, font_path)
        except Exception as e:
            results.append({"lv": lv, "bytes": 0, "ok": False, "error": str(e)})
            skipped += 1
            continue
        if bytes_written > 0:
            baked += 1
            results.append({"lv": lv, "bytes": bytes_written, "ok": True})
        else:
            skipped += 1
            results.append({"lv": lv, "bytes": 0, "ok": False})

    print(json.dumps({"kind": "og-compose", "baked": baked, "skipped": skipped, "results": results}))


if __name__ == "__main__":
    main()
