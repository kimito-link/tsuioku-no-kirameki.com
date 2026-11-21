#!/usr/bin/env python3
"""紅白の共有カード(1200×630 JPEG)を描く。順位の計算はしない。文字列を受け取るだけ。"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
CREAM = (255, 247, 236)
INK = (74, 59, 52)
NAVY = (20, 55, 92)
ROSE = (196, 71, 106)
GOLD = (201, 142, 43)
SOFT = (255, 241, 244)

FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKjp-Regular.otf",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
]


def font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    raise SystemExit("japanese font not found")


def main() -> None:
    spec = json.loads(sys.stdin.read())
    out = Path(sys.argv[1])
    team = spec.get("teamId") or "aka"
    band = GOLD if team == "shiro" else ROSE if team == "aka" else NAVY
    image = Image.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 28, H), fill=band)
    draw.rounded_rectangle((64, 48, 1136, 582), radius=28, fill=(255, 253, 249), outline=(227, 201, 181), width=2)
    title_font = font(36)
    team_font = font(32)
    rank_font = font(92)
    name_font = font(54)
    body_font = font(32)
    foot_font = font(26)
    draw.text((96, 78), spec.get("title") or "", font=title_font, fill=NAVY)
    pill = spec.get("team") or ""
    draw.rounded_rectangle((820, 70, 1104, 128), radius=24, fill=SOFT if team == "aka" else (255, 247, 230))
    draw.text((848, 84), pill, font=team_font, fill=band)
    draw.text((96, 150), spec.get("rank") or "", font=rank_font, fill=NAVY)
    draw.text((96, 270), spec.get("name") or "", font=name_font, fill=INK)
    draw.text((96, 360), spec.get("score") or "", font=body_font, fill=INK)
    draw.text((96, 414), spec.get("gap") or "", font=body_font, fill=INK)
    draw.text((96, 468), spec.get("delta") or "", font=body_font, fill=INK)
    draw.text((96, 530), spec.get("updated") or "", font=foot_font, fill=(138, 117, 104))
    draw.text((96, 566), spec.get("footer") or "", font=foot_font, fill=(138, 117, 104))
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out, "JPEG", quality=86, optimize=True)


if __name__ == "__main__":
    main()
