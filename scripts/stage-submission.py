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
import re
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
    # hosts: dev サーバ(localhost/127.0.0.1:3456)は外す。
    #   v0.1.698: VOICEVOX 連携(http://127.0.0.1:50021)はユーザー向け機能なので提出物にも残す
    #   (ローカル音声合成エンジン連携・理由書 cws-submission-texts.md に記載)。
    m['host_permissions'] = [h for h in m['host_permissions']
                             if ('localhost' not in h and '127.0.0.1' not in h)
                             or ':50021' in h]
    for cs in m.get('content_scripts', []):
        cs['matches'] = [x for x in cs['matches']
                          if 'localhost' not in x and '127.0.0.1' not in x]
    for war in m.get('web_accessible_resources', []):
        war['matches'] = [x for x in war['matches']
                           if 'localhost' not in x and '127.0.0.1' not in x]
    return m


def declared_resource_patterns(manifest: dict) -> list[str]:
    """manifest の web_accessible_resources が宣言する resources パターンを平坦化して返す。"""
    out: list[str] = []
    for block in manifest.get('web_accessible_resources') or []:
        for rel in block.get('resources') or []:
            out.append(str(rel))
    return out


def resolve_declared_files(pattern: str) -> list[Path]:
    """宣言パターン(glob 可)を extension/ 配下の実ファイルへ解決する。

    存在しないパターンはここでは落とさない(空リストを返す)。存在すべきかどうかの
    判定は verify_zip の突合に任せる=「宣言があるのに実体が無い」を見逃さないため。
    """
    if '*' in pattern:
        return [p for p in sorted(EXT_DIR.glob(pattern)) if p.is_file()]
    candidate = EXT_DIR / pattern
    return [candidate] if candidate.is_file() else []


def copy_declared_resources(manifest: dict, dest: Path) -> None:
    """manifest が宣言する web_accessible_resources の実体をステージングへコピーする。

    ★v0.1.1242: これが無いと「manifest だけ更新され staging スクリプトが追随しない」
      drift が起き、宣言済みリソースがZIPから丸ごと欠ける(実例=sound/・avatar-parts/)。
      dist/ は copy_tree 済みなのでスキップする。
      ★v0.1.1243: HTML はスキップしない。以前 `.html` を一括除外していたため
      venue.html / live-view.html / marketing-export.html が欠落した(下記 collect_* 参照)。
    """
    for pattern in declared_resource_patterns(manifest):
        if pattern.startswith('dist/'):
            continue  # copy_tree 済み(重複コピーを避ける)
        for src in resolve_declared_files(pattern):
            rel = src.relative_to(EXT_DIR).as_posix()
            copy_file(src, dest / rel)


# 実行時に参照されるページ/スクリプトを見つけるためのパターン。
#   manifest の web_accessible_resources に【宣言されない】経路がある:
#     - chrome.runtime.getURL('venue.html') のように拡張自身が開くページ
#     - HTML 内の <script src="status-guard.js"> のような同梱スクリプト
#   これらは宣言が無いので「宣言/実体の突合」では原理的に検出できない。
#   ★引用符3種(' " `)とクエリ/ワイルドカード付きに対応すること。テンプレートリテラル
#     (`marketing-export.html?lv=${lv}`)や getURL("marketing-export.html*") を取りこぼすと、
#     そのページが丸ごと欠落したまま通過する(v0.1.1243 で実際に踏んだ)。
RUNTIME_PAGE_RE = re.compile(r'getURL\(\s*[\'"`]([A-Za-z0-9_\-./]+\.html)(?:[?*#][^\'"`]*)?[\'"`]')
HTML_SCRIPT_SRC_RE = re.compile(r'<script[^>]*\ssrc=["\']([^"\']+)["\']')


def collect_runtime_referenced_pages(search_dirs: list[Path]) -> set[str]:
    """コードが getURL(...) で開く .html を列挙する(extension/ 相対パス)。

    ★v0.1.1243: venue.html / live-view.html / marketing-export.html は
      web_accessible_resources に無い(拡張自身が開くだけなので宣言不要)ため、
      manifest 起点の導出では拾えなかった。実際にZIPから丸ごと欠落し、
      会場モード・応援ライブビュー・マーケ分析のボタンが空白タブになる状態だった。
    """
    found: set[str] = set()
    for base in search_dirs:
        if not base.exists():
            continue
        for path in base.rglob('*.js'):
            try:
                text = path.read_text(encoding='utf-8', errors='ignore')
            except OSError:
                continue
            for rel in RUNTIME_PAGE_RE.findall(text):
                found.add(rel.lstrip('./'))
    return found


def collect_html_script_srcs(html_files: list[Path]) -> set[str]:
    """HTML が <script src> で読む同梱スクリプトを列挙する(extension/ 相対パス)。

    ★v0.1.1243: status.html は status-guard.js(「何があっても開く」保険)を読むが、
      これも manifest に宣言が無い。欠落すると **ページを開いた瞬間に 404** になる
      (クリック不要=審査員が最初に踏む)。http(s) の外部URLは対象外。
    """
    found: set[str] = set()
    for path in html_files:
        if not path.exists():
            continue
        text = path.read_text(encoding='utf-8', errors='ignore')
        for src in HTML_SCRIPT_SRC_RE.findall(text):
            if src.startswith(('http://', 'https://', '//', 'data:')):
                continue
            found.add(src.lstrip('./'))
    return found


def copy_runtime_referenced_files(dest: Path) -> None:
    """getURL 参照ページと、その HTML が読むスクリプトをコピーする(再帰1段)。"""
    pages = collect_runtime_referenced_pages([EXT_DIR / 'dist', EXT_DIR])
    for rel in sorted(pages):
        src = EXT_DIR / rel
        if src.is_file():
            copy_file(src, dest / rel)
    # ステージ済み HTML すべて(既存コピー分 + いま足したページ)の <script src> を回収する。
    html_files = sorted(dest.rglob('*.html'))
    for rel in sorted(collect_html_script_srcs(html_files)):
        if rel.startswith('dist/'):
            continue  # copy_tree 済み
        src = EXT_DIR / rel
        if src.is_file():
            copy_file(src, dest / rel)


def stage(version: str) -> Path:
    dest = BUILD_DIR / f'submission-{version}'
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)

    # 1) dist/ と静的 HTML / background.js をコピー
    copy_file(EXT_DIR / 'background.js', dest / 'background.js')
    copy_file(EXT_DIR / 'popup.html', dest / 'popup.html')
    copy_file(EXT_DIR / 'sidepanel.html', dest / 'sidepanel.html')
    # offscreen.html は chrome.offscreen.createDocument が読む常駐 IDB 書き手のページ
    #   （dist/offscreen.js を参照）。manifest には現れないが提出物に含める必要がある。
    copy_file(EXT_DIR / 'offscreen.html', dest / 'offscreen.html')
    # v0.1.629/652 で追加された固定URLページ。web_accessible_resources に記載があり
    #   ボタンから開くため提出物に必須(従来は漏れていてストア版で 404 になっていた)。
    copy_file(EXT_DIR / 'status.html', dest / 'status.html')
    copy_file(EXT_DIR / 'comeview.html', dest / 'comeview.html')
    copy_tree(EXT_DIR / 'dist', dest / 'dist')
    # dist/.gitkeep は提出物に不要
    gitkeep = dest / 'dist' / '.gitkeep'
    if gitkeep.exists():
        gitkeep.unlink()
    # dev ホットリロード用シグナル（build:watch の置き土産）は配布物から必ず除く
    dev_reload_signal = dest / 'dist' / 'dev-reload-id.txt'
    if dev_reload_signal.exists():
        dev_reload_signal.unlink()

    # 2) 提出対象の画像ホワイトリスト。0.1.6 提出物の構成を踏襲する。
    #    extension/images/ には LP 用・マーケ用・アプリアイコンのマスター（大容量）も含まれるが、
    #    ランタイム（dist 成果物・manifest・popup/sidepanel HTML）から参照されないものはサイズ節約と
    #    「この拡張が読めるリソースが少ない＝審査ノイズが少ない」観点で提出物から落とす。
    included_images = [
        'toumeilink.png',
        # icon/kewXCUOt_400x400.jpg は出自の不明な外部命名規則のファイルだったため
        # 0.1.10 で差し替え。STORY_RINK_COLLECTING_JPG は yukkuri-charactore-english/link/
        # 配下の既存オリキャラ画像（blink-mouth-closed）を参照する。
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

    # 2-b) ★v0.1.1242: manifest が web_accessible_resources で宣言したリソースを
    #      【manifest から導出して】コピーする。
    #
    #      上のホワイトリストは手書き列挙なので、manifest に新しいリソースを足しても
    #      追随せず、宣言だけがあって実体がZIPに入らない drift が起きる。実際 v0.1.1241 の
    #      提出ZIPでは sound/(9ファイル) と images/avatar-parts/(22ファイル) が
    #      manifest 宣言済みなのに 0 件で、効果音とアバター合成が審査員の実機で壊れる
    #      状態だった(同型事故は status.html で一度起きている=上の 75-77 行のコメント)。
    #      手書きに足すのではなく manifest を正本にすることで、以後の追加に自動で追随する。
    dev_manifest_for_assets = json.loads((EXT_DIR / 'manifest.json').read_text(encoding='utf-8'))
    copy_declared_resources(dev_manifest_for_assets, dest)
    # ★v0.1.1243: manifest に宣言が無い実行時参照(getURL のページ・HTMLのscript src)も回収する。
    #   宣言が無いので verify_zip の「宣言/実体の突合」では原理的に拾えない経路。
    copy_runtime_referenced_files(dest)

    # 3) 提出用 manifest
    dev_manifest = dev_manifest_for_assets
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
    """ZIP の健全性を検査する。フォワードスラッシュ・必須エントリ・宣言/実体の突合。

    ★v0.1.1242: 従来の required は手書き9件の固定リストで、manifest が何を宣言しているかを
      見ていなかった。そのため「manifest は宣言しているのにZIPに実体が無い」を素通りさせ、
      v0.1.1241 の提出ZIPで sound/(9) と images/avatar-parts/(22) が丸ごと欠けていた
      (審査員の実機で効果音が鳴らずアバター合成が壊れる=Broken Functionality の指摘対象)。
      **ZIP内 manifest の宣言を正本に突合する**ことで、手書きリストの更新忘れでは
      すり抜けられないようにする(fail-closed)。
    """
    required = {
        'manifest.json',
        'background.js',
        'popup.html',
        'sidepanel.html',
        'offscreen.html',
        'dist/content.js',
        'dist/page-intercept.js',
        'dist/popup.js',
        'dist/offscreen.js'
    }
    with zipfile.ZipFile(zip_path, 'r') as zf:
        names = set(zf.namelist())
        for n in zf.namelist():
            if '\\' in n:
                raise RuntimeError(f'bad separator in zip entry: {n!r}')
        missing = required - names
        if missing:
            raise RuntimeError(f'missing from zip: {sorted(missing)}')

        # 宣言/実体の突合: manifest が web_accessible_resources で宣言した各パターンに
        #   対して、ZIP 内に少なくとも1件の実体があること。glob は前方一致で照合する。
        #   (sound/custom/* のようにユーザー生成物のみを指す宣言は実体0でも正常なので除外。)
        manifest = json.loads(zf.read('manifest.json').decode('utf-8'))
        undeclared_ok = {'sound/custom/*'}  # 取込後に生成される=同梱しないのが正しい
        unmet: list[str] = []
        for pattern in declared_resource_patterns(manifest):
            if pattern in undeclared_ok:
                continue
            if '*' in pattern:
                prefix = pattern.split('*', 1)[0]
                suffix = pattern.rsplit('*', 1)[1]
                if not any(n.startswith(prefix) and n.endswith(suffix) for n in names):
                    unmet.append(pattern)
            elif pattern not in names:
                unmet.append(pattern)
        if unmet:
            raise RuntimeError(
                'manifest が宣言しているのに ZIP に実体が無いリソース: '
                f'{sorted(unmet)}'
            )

        verify_runtime_references(zf, names)
        verify_no_secrets(zf, names)


def verify_runtime_references(zf: zipfile.ZipFile, names: set) -> None:
    """ZIP 内のコードが参照するページ/スクリプトが、同じ ZIP に実在することを確認する。

    ★v0.1.1243: manifest の web_accessible_resources に【宣言されない】参照経路がある。
      - chrome.runtime.getURL('venue.html') 等、拡張自身が開くページ(宣言不要)
      - HTML の <script src="status-guard.js">(宣言不要)
      v0.1.1242 の「宣言/実体の突合」はこれらを原理的に検出できず、実際に
      venue.html / live-view.html / marketing-export.html / status-guard.js /
      marketing-export-guard.js の5件が欠落したまま通過していた。
      とくに status.html→status-guard.js は **ページを開いた瞬間に 404**
      (クリック不要=審査員が最初に踏む経路)で Broken Functionality に直結する。
      よって【ZIPの中身だけを見て】参照先の実在を突合する(fail-closed)。
    """
    missing: list[str] = []
    # (a) getURL('*.html') の参照先
    for name in sorted(n for n in names if n.endswith('.js')):
        text = zf.read(name).decode('utf-8', 'ignore')
        for rel in set(RUNTIME_PAGE_RE.findall(text)):
            target = rel.lstrip('./')
            if target not in names:
                missing.append(f'{name} が開く {target}')
    # (b) HTML の <script src>(外部URLは対象外)
    for name in sorted(n for n in names if n.endswith('.html')):
        text = zf.read(name).decode('utf-8', 'ignore')
        for src in set(HTML_SCRIPT_SRC_RE.findall(text)):
            if src.startswith(('http://', 'https://', '//', 'data:')):
                continue
            target = src.lstrip('./')
            if target not in names:
                missing.append(f'{name} が読む {target}')
    if missing:
        raise RuntimeError(
            'ZIP 内のコードが参照しているのに ZIP に実体が無いファイル: '
            + '; '.join(sorted(set(missing)))
        )


def verify_no_secrets(zf: zipfile.ZipFile, names: set) -> None:
    """公開キーがバンドルに焼き込まれていないことを確認する(fail-closed)。

    ★v0.1.1242(CWS提出ブロッカー BLOCKING-2): ingestKey は /api/status の【書き込み】
      認証。CRX は誰でも展開できるので、同梱したまま公開すると第三者が任意データを
      POST できるようになる。viewToken も同梱すると全ユーザー共通・公知となり、
      全利用者のスナップショットが誰でも閲覧可能になる。
      NL_STORE_BUILD=1 でビルドすれば空文字が焼かれる(scripts/build.mjs)。
      ここでは【実際に空であること】をZIPから読み直して確認する=ビルド手順の
      間違いを提出前に必ず止める。
    """
    leaked: list[str] = []
    for name in sorted(n for n in names if n.endswith('.js')):
        text = zf.read(name).decode('utf-8', 'ignore')
        for key_name in ('ingestKey', 'viewToken'):
            # getUploadConfig() が返すリテラルが空文字以外なら焼き込まれている。
            for m in re.finditer(rf'{key_name}\s*:\s*"([^"]*)"', text):
                if m.group(1):
                    leaked.append(f'{name}: {key_name} が空でない({len(m.group(1))}文字)')
    if leaked:
        raise RuntimeError(
            '公開キーが提出物に焼き込まれています。NL_STORE_BUILD=1 でビルドし直してください: '
            + '; '.join(leaked)
        )


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
