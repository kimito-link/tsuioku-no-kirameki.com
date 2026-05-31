#!/usr/bin/env python3
"""ローディング幕で使う3キャラのサムネ（128px）を生成する。

フルサイズPNG（1枚 約510KB）を 58px の丸に縮小表示していたため、
読み込みが遅く「空丸」が見えていた。表示は最大 68px なので 128px(2x相当)
の軽量サムネを同じフォルダに書き出す。WAR の glob (images/.../*/*.png) で
そのまま配信される。再生成可能なようにスクリプト化しておく。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "extension" / "images" / "yukkuri-charactore-english"

# 元ファイル一覧（同名 + .thumb128.png を同じフォルダに出力）。
#   ローディングの瞬き(half/blink)・口パク(mouth-open/closed)・完了(smile)に使う全フレーム。
SOURCES = [
    # りんく
    "link/link-yukkuri-normal-mouth-closed.png",
    "link/link-yukkuri-normal-mouth-open.png",
    "link/link-yukkuri-half-eyes-mouth-closed.png",
    "link/link-yukkuri-blink-mouth-closed.png",
    "link/link-yukkuri-smile-mouth-open.png",
    # こん太（きつね）— normal-mouth-open が無いので talk/happy は smile-mouth-open を使う
    "konta/kitsune-yukkuri-normal.png",
    "konta/kitsune-yukkuri-half-eyes-mouth-closed.png",
    "konta/kitsune-yukkuri-blink-mouth-closed.png",
    "konta/kitsune-yukkuri-smile-mouth-open.png",
    # たぬ姉（たぬき）
    "tanunee/tanuki-yukkuri-normal-mouth-closed.png",
    "tanunee/tanuki-yukkuri-normal-mouth-open.png",
    "tanunee/tanuki-yukkuri-half-eyes-mouth-closed.png",
    "tanunee/tanuki-yukkuri-blink-mouth-closed.png",
    "tanunee/tanuki-yukkuri-smile-mouth-open.png",
]


def _thumb_name(rel: str) -> str:
    return rel[:-4] + ".thumb128.png" if rel.endswith(".png") else rel + ".thumb128.png"


# (元ファイル, 出力ファイル)
TARGETS = [(rel, _thumb_name(rel)) for rel in SOURCES]

SIZE = 128


def main() -> None:
    for src_rel, dst_rel in TARGETS:
        src = BASE / src_rel
        dst = BASE / dst_rel
        img = Image.open(src).convert("RGBA")
        img.thumbnail((SIZE, SIZE), Image.LANCZOS)
        img.save(dst, format="PNG", optimize=True)
        kb = dst.stat().st_size / 1024
        print(f"{dst_rel}: {kb:.1f} KB")


if __name__ == "__main__":
    main()
