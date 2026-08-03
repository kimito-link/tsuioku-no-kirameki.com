import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 診断ページ(status.html)の初回コストを増やさない配線ガード(v0.1.1237)。
 *
 * 【なぜ必要か】
 * 司令塔がブラウザで実測: 初回 refresh が **12,610ms**(extras 12,607ms / **render 3ms**)。
 * 2回目は 5ms。つまり描画は極めて軽く、重いのは extras(データ収集)の初回だけだった。
 *
 * 真因は「計算」ではなく **順番待ち**:
 *   - `setupMyCustomSoundPanel` が init 時に無条件で `renderList()`/`renderStats()` を発火
 *   - この2つは IndexedDB を**全件走査**(listSoundBlobs=Blob本体込み / getAssignment の直列ループ)
 *   - 同じ DB を軽量 count で読む extras(loadCustomSoundDiag)がその後ろで待たされる
 *   - さらに manifest.json を2箇所が独立に fetch していた
 *
 * ★開発用パネル(release非表示)なので、開いたときだけ読めば十分。
 *
 * 正本: ~/.claude/plans/groovy-doodling-russell.md (Patch 3)
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const statusSrc = read('src/extension/status-entry.js');

describe('診断ページ初回コストの配線(初回12秒の再発防止=CI赤)', () => {
  it('★マイ効果音パネルの全件走査を init 時に無条件発火しない(details を開いた時だけ)', () => {
    // 旧: 関数末尾で `void renderList(); void renderStats();` を無条件実行していた。
    expect(statusSrc).toMatch(/myCustomSoundPanel/);
    expect(statusSrc).toMatch(/addEventListener\('toggle'/);
    // ★判定: init 経路(details 判定)を通らずに描く旧構造が残っていないこと。
    //   renderPanelOnce の中身と、取込完了後の再描画(正当)は対象外。
    expect(statusSrc).toMatch(/const renderPanelOnce = \(\) => \{/);
    expect(statusSrc).toMatch(/if \(panelEl\.open\) renderPanelOnce\(\)/);
    // 旧構造: 関数末尾で details を見ずに直接2行を並べていた形。
    expect(
      /void renderList\(\);\s*\n\s*void renderStats\(\);\s*\n\}/.test(statusSrc),
      '旧構造(関数末尾で無条件に renderList/renderStats)が残っている=初回12秒が再発する'
    ).toBe(false);
  });

  it('★manifest.json の fetch は共有1本(二重取得しない)', () => {
    // 静的ファイルなので実行中に変わらない。Promise を共有する。
    expect(statusSrc).toMatch(/_localSoundManifestPromise/);
    expect(statusSrc).toMatch(/function loadLocalSoundManifestShared/);
    // 直接呼び出しは共有関数の中の1回だけ。
    const direct = statusSrc.match(/loadLocalBundledSoundManifest\(\{/g) || [];
    expect(direct.length, 'loadLocalBundledSoundManifest の直接呼び出しは1箇所であるべき').toBe(1);
  });

  it('extras は1回のバッチ get に統合されている(単一キー get の復活を防ぐ)', () => {
    // 「重さ根治 P2」で確立済みの構造。ここが崩れると初回コストが跳ね上がる。
    expect(statusSrc).toMatch(/EXTRAS_BATCH_KEYS/);
  });
});
