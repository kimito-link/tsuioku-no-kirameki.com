"""
CWS 提出用 ZIP を作るためのステージングスクリプト。

手順:
  1) extension/ から必要なランタイムファイルだけを build/submission-<version>/ へコピー
     （dist/ ビルド成果物と、manifest で参照しているアセットだけ）
  2) 提出用 manifest.json を差し替え（localhost / 127.0.0.1 を外し、description の
     「（開発識別子: nicolivelog）」サフィックスを落とす）
  3) Python の zipfile（ZIP_DEFLATED）でフォワードスラッシュ固定の ZIP を作る
     → build/tsuioku-no-kirameki-<version>.zip

使い方:
  python scripts/stage-submission.py 0.1.7
"""

from __future__ import annotations

import json
import shutil
import sys
import zipfile
from pathlib import Path

# scripts/ 直下に置くので parent.parent で repo root
REPO_ROOT = Path(__file__).resolve().parent.parent
EXT_DIR = REPO_ROOT / 'extension'
BUILD_DIR = REPO_ROOT / 'build'


def copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def copy_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def build_submission_manifest(dev_manifest: dict, version: str) -> dict:
    """extension/manifest.json から提出用 manifest を派生させる。"""
    m = json.loads(json.dumps(dev_manifest))
    m['version'] = version
    # description: 開発識別子サフィックスを落とす（CWS 掲載名は短い方で統一）
    m['description'] = 'ニコニコ生放送の応援コメントをこのPCに記録し、応援の可視化につなげます。'
    # hosts: localhost / 127.0.0.1 を外す
    m['host_permissions'] = [h for h in m['host_permissions']
                             if 'localhost' not in h and '127.0.0.1' not in h]
    for cs in m.get('content_scripts', []):
        cs['matches'] = [x for x in cs['matches']
                          if 'localhost' not in x and '127.0.0.1' not in x]
    for war in m.get('web_accessible_resources', []):
        war['matches'] = [x for x in war['matches']
                           if 'localhost' not in x and '127.0.0.1' not in x]
    return m


def stage(version: str) -> Path:
    dest = BUILD_DIR / f'submission-{version}'
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)

    # 1) dist/ と静的 HTML / background.js をコピー
    copy_file(EXT_DIR / 'background.js', dest / 'background.js')
    copy_file(EXT_DIR / 'popup.html', dest / 'popup.html')
    copy_file(EXT_DIR / 'sidepanel.html', dest / 'sidepanel.html')
    copy_tree(EXT_DIR / 'dist', dest / 'dist')
    # dist/.gitkeep は提出物に不要
    gitkeep = dest / 'dist' / '.gitkeep'
    if gitkeep.exists():
        gitkeep.unlink()

    # 2) 提出対象の画像ホワイトリスト。0.1.6 提出物の構成を踏襲する。
    #    extension/images/ には LP 用・マーケ用・アプリアイコンのマスター（大容量）も含まれるが、
    #    ランタイム（dist 成果物・manifest・popup/sidepanel HTML）から参照されないものはサイズ節約と
    #    「この拡張が読めるリソースが少ない＝審査ノイズが少ない」観点で提出物から落とす。
    included_images = [
        'toumeilink.png',
        'icon/kewXCUOt_400x400.jpg',
        'logo/kimito-link-color.png',
        'logo/kimito-maru-black.png',
        'logo/konta-yukkuri-icon-16.png',
        'logo/konta-yukkuri-icon-32.png',
        'logo/konta-yukkuri-icon-48.png',
        'logo/konta-yukkuri-icon-128.png',
    ]
    # yukkuri-charactore-english/ は 3 キャラ × 各 8 表情の PNG のみ（manifest の
    # "yukkuri-charactore-english/*/*.png" で読まれる範囲）。
    char_expressions = {
        'link': [
            'link-yukkuri-blink-mouth-closed.png',
            'link-yukkuri-blink-mouth-open.png',
            'link-yukkuri-half-eyes-mouth-closed.png',
            'link-yukkuri-half-eyes-mouth-open.png',
            'link-yukkuri-normal-mouth-closed.png',
            'link-yukkuri-normal-mouth-open.png',
            'link-yukkuri-smile-mouth-closed.png',
            'link-yukkuri-smile-mouth-open.png',
        ],
        'konta': [
            'kitsune-yukkuri-blink-mouth-closed.png',
            'kitsune-yukkuri-blink-mouth-open.png',
            'kitsune-yukkuri-half-eyes-mouth-closed.png',
            'kitsune-yukkuri-half-eyes-mouth-open.png',
            'kitsune-yukkuri-mouth-closed.png',
            'kitsune-yukkuri-normal.png',
            'kitsune-yukkuri-smile-mouth-closed.png',
            'kitsune-yukkuri-smile-mouth-open.png',
        ],
        'tanunee': [
            'tanuki-yukkuri-blink-mouth-closed.png',
            'tanuki-yukkuri-blink-mouth-open.png',
            'tanuki-yukkuri-half-eyes-mouth-closed.png',
            'tanuki-yukkuri-half-eyes-mouth-open.png',
            'tanuki-yukkuri-normal-mouth-closed.png',
            'tanuki-yukkuri-normal-mouth-open.png',
            'tanuki-yukkuri-smile-mouth-closed.png',
            'tanuki-yukkuri-smile-mouth-open.png',
        ],
    }
    for rel in included_images:
        copy_file(EXT_DIR / 'images' / rel, dest / 'images' / rel)
    for chara, files in char_expressions.items():
        for fname in files:
            copy_file(
                EXT_DIR / 'images' / 'yukkuri-charactore-english' / chara / fname,
                dest / 'images' / 'yukkuri-charactore-english' / chara / fname,
            )

    # 3) 提出用 manifest
    dev_manifest = json.loads((EXT_DIR / 'manifest.json').read_text(encoding='utf-8'))
    out_manifest = build_submission_manifest(dev_manifest, version)
    (dest / 'manifest.json').write_text(
        json.dumps(out_manifest, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8'
    )
    return dest


def make_zip(version: str, stage_dir: Path) -> Path:
    """Windows の Compress-Archive はバックスラッシュで固めてしまうので zipfile を使う。"""
    zip_path = BUILD_DIR / f'tsuioku-no-kirameki-{version}.zip'
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(stage_dir.rglob('*')):
            if path.is_dir():
                continue
            rel = path.relative_to(stage_dir).as_posix()
            zf.write(path, rel)
    return zip_path


def verify_zip(zip_path: Path) -> None:
    """ZIP 内のパス全てがフォワードスラッシュで、期待 top-level エントリがあることを確認。"""
    required = {
        'manifest.json',
        'background.js',
        'popup.html',
        'sidepanel.html',
        'dist/content.js',
        'dist/page-intercept.js',
        'dist/popup.js'
    }
    with zipfile.ZipFile(zip_path, 'r') as zf:
        names = set(zf.namelist())
        for n in zf.namelist():
            if '\\' in n:
                raise RuntimeError(f'bad separator in zip entry: {n!r}')
        missing = required - names
        if missing:
            raise RuntimeError(f'missing from zip: {sorted(missing)}')


def main() -> None:
    if len(sys.argv) != 2:
        print('usage: python build/stage_submission.py <version>', file=sys.stderr)
        sys.exit(2)
    version = sys.argv[1]
    stage_dir = stage(version)
    zip_path = make_zip(version, stage_dir)
    verify_zip(zip_path)
    print(f'staged:  {stage_dir}')
    print(f'zipped:  {zip_path} ({zip_path.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
