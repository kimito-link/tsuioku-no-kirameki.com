import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 会場を閉じたら DOM とデータを解放する配線ガード(v0.1.1237)。
 *
 * 【なぜ必要か】
 * 司令塔がブラウザで実測: 会場を開くとヒープが **+14.9MB**(48.2→63.1MB)。
 * ところが `setOpen(false)` はタイマーを止めるだけで `clearDisplay()` を呼ばず、
 * **228枚のタイル・画像・集計データがすべてDOMとメモリに残り続けていた**。
 *
 * `clearDisplay`(venueBar.js:4609-4618)は配信切替時(:5408)にしか呼ばれておらず、
 * 「閉じたのに解放されない」= 会場を1回開いたら閉じてもメモリが戻らない状態だった。
 *
 * ★このファイルは venueBar.js が content script でテスト困難なため、
 *   ソース文字列検査で配線の実在を断言する(laneNeverDrop.wiring.test.js と同型)。
 *
 * 正本: ~/.claude/plans/groovy-doodling-russell.md (Patch 1)
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

const venueSrc = read('src/extension/venueBar.js');

/** setOpen の else 節(=閉じるときの処理)を切り出す。 */
function closeBranch() {
  const at = venueSrc.indexOf('      removeEscapeListener();');
  if (at < 0) return '';
  return venueSrc.slice(at, at + 700);
}

describe('会場を閉じたら解放する配線(メモリリーク防止=CI赤)', () => {
  it('★setOpen(false) が clearDisplay() を呼ぶ(228タイルを残さない)', () => {
    const branch = closeBranch();
    expect(branch).toBeTruthy();
    expect(branch).toMatch(/clearDisplay\(\)/);
  });

  it('★閉じるときに集計データもクリアする(aggregatedCandidates が残ると次回開くまで保持され続ける)', () => {
    const branch = closeBranch();
    expect(branch).toMatch(/aggregatedCandidates\s*=\s*\[\]/);
  });

  it('既存の停止処理は残っている(タイマーを止めるのは従来どおり)', () => {
    const branch = closeBranch();
    for (const fn of ['stopAggregation', 'stopSpeechPolling', 'stopCrowdMotion', 'resetSpeechTracking']) {
      expect(branch).toContain(`${fn}()`);
    }
  });

  it('clearDisplay は空描画で lastGood も破棄する(次に開いたら再描画される)', () => {
    // 閉じたあと再度開いたときに空のままにならないことの根拠。
    const at = venueSrc.indexOf('const clearDisplay = () => {');
    expect(at).toBeGreaterThan(-1);
    const body = venueSrc.slice(at, at + 400);
    expect(body).toMatch(/lastGoodRows\s*=\s*\[\]/);
    expect(body).toMatch(/hasRenderedNonEmpty\s*=\s*false/);
    expect(body).toMatch(/renderSeats\(\[\]\)/);
  });
});

/**
 * 群衆canvasのバックストア解放(v0.1.1239)。
 *
 * `crowdCanvas` は 1200x350 = **1.68MB** のピクセルバッファを会場マウント時に確保する
 * (venueBar.js)。従来 `stopCrowdMotion` は rAF を止めるだけで、閉じても解放されなかった。
 *
 * ★width=0 で解放するが、**開き直したとき寸法を戻さないと群衆が描かれなくなる**ため、
 *   `startCrowdMotion` の先頭で `ensureCrowdCanvasSize()` を呼ぶ必要がある。
 *   この対称性が崩れると「閉じて開いたら群衆が消える」不具合になる。
 */
describe('群衆canvasのバックストア解放(1.68MB)', () => {
  it('★閉じるとき(stopCrowdMotion)にバックストアを解放する', () => {
    const at = venueSrc.indexOf('const stopCrowdMotion = () => {');
    expect(at).toBeGreaterThan(-1);
    const body = venueSrc.slice(at, at + 600);
    expect(body).toMatch(/crowdCanvas\.width = 0/);
  });

  it('★開くとき(startCrowdMotion)に寸法を復元する(復元漏れ=群衆が消える)', () => {
    const at = venueSrc.indexOf('const startCrowdMotion = () => {');
    expect(at).toBeGreaterThan(-1);
    const body = venueSrc.slice(at, at + 400);
    expect(body).toMatch(/ensureCrowdCanvasSize\(\)/);
  });

  it('寸法は定数で一元管理されている(作成時と復元時のズレを防ぐ)', () => {
    expect(venueSrc).toMatch(/const CROWD_CANVAS_W = 1200/);
    expect(venueSrc).toMatch(/crowdCanvas\.width = CROWD_CANVAS_W/);
    expect(venueSrc).toMatch(/crowdCanvas\.width !== CROWD_CANVAS_W/);
  });
});
