// lightSupplyRecheckAfterAwait.wiring.test.js
// ★タイル消失(39→3)の根治を固定する。
//
// ■ 実機で確定したこと(2026-08-12・複数配信で再現)
//     ★減った1回(最大39→3枚=36枚減・直前の供給元light_summary)
//     shrinkCulprit: { origin:'light_summary', prevTiles:39, nextTiles:3, provisional:1 }
//     ⚠ 縮小しているのにガードが素通り(provisional=false)
//
// ■ 真因(コードで確定・実データ不要)
//   renderStoryUserLaneFromLightCommentsForCurrentLive は冒頭で
//   「既に描けているなら何もしない」と判定するが、その判定は
//   【storage read の await より前】にある。await 中に heavy_refresh が
//   39枚を描き切ると、復帰した軽い経路は「まだ0枚だった頃の判定」のまま
//   短い候補(3枚)を書き込み、完全描画を潰す。
//   ★入口で1回見ただけの判定は、await をまたいだ時点で古い。
//   ★速報の「provisional=false」は heavy が共有フラグを上書きした後の値で、
//     shrinkCulprit の provisional:1 と食い違っていた=これが時間差の指紋
//     ([[instrument-can-name-the-wrong-culprit-2026-08-10]]: 報告内の矛盾は判定の穴のサイン)。
//
// ■ 直し: 書き込む直前に同じ判定をやり直す(冪等・加法のみ)。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatLightSupplyGuardLine, shouldSkipLightSupplyAfterAwait } from './lightSupplyOverwriteGuard.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(HERE, '../extension/popup-entry.js'), 'utf8');

/** 軽い供給の関数本体だけを切り出す(他の同名判定を誤検出しないため)。 */
function lightSupplyFnBody() {
  const start = src.indexOf('async function renderStoryUserLaneFromLightCommentsForCurrentLive(');
  expect(start).toBeGreaterThan(0);
  const end = src.indexOf('\n}', src.indexOf('LANE_SUPPLY_ORIGIN.LIGHT', start));
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('★軽い供給は「書く直前」にもう一度描画済みかを見る', () => {
  const body = lightSupplyFnBody();

  // ★v0.1.1359: 判定本体は lib(shouldSkipLightSupplyAfterAwait)へ抽出した
  //   (popup-entry.js は max-lines 上限に張り付いており、増やせない=抽出が正しい)。
  //   ここでは「await の後・書き込みの前に、その判定を通しているか」だけを見る。

  it('★await をまたいだ後に再判定を通している', () => {
    const awaitIdx = body.indexOf('await chrome.storage.local.get');
    expect(awaitIdx).toBeGreaterThan(0);
    const afterAwait = body.slice(awaitIdx);
    expect(afterAwait).toContain('shouldSkipLightSupplyAfterAwait(');
  });

  it('★再判定は syncStorySourceEntries より【前】にある(書いた後では遅い)', () => {
    const writeIdx = body.indexOf('syncStorySourceEntries(live, entries, entries');
    expect(writeIdx).toBeGreaterThan(0);
    const beforeWrite = body.slice(0, writeIdx);
    const awaitIdx = beforeWrite.indexOf('await chrome.storage.local.get');
    const recheckIdx = beforeWrite.lastIndexOf('shouldSkipLightSupplyAfterAwait(');
    expect(recheckIdx).toBeGreaterThan(awaitIdx);
  });

  it('再判定には【今の】DOM枚数と liveId を渡す(古い値を渡さない)', () => {
    const idx = body.lastIndexOf('shouldSkipLightSupplyAfterAwait(');
    const call = body.slice(idx, idx + 260);
    expect(call).toContain('countStoryUserLaneDomTiles(els)');
    expect(call).toContain('STORY_SOURCE_STATE.liveId');
    expect(call).toContain('liveId: live');
  });

  it('true なら書かずに降りる(return する)', () => {
    const idx = body.lastIndexOf('shouldSkipLightSupplyAfterAwait(');
    expect(body.slice(idx, idx + 300)).toContain('return;');
  });

  it('降りた回数を計器に残す(効いている証拠が速報に出る)', () => {
    expect(src).toContain('paintedDuringAwaitCount');
  });
});

describe('shouldSkipLightSupplyAfterAwait: 判定本体', () => {
  it('★既に描かれている同一配信なら降りる(39→3を止める)', () => {
    const diag = { skipCount: 0, paintedDuringAwaitCount: 0 };
    const skip = shouldSkipLightSupplyAfterAwait(diag, {
      domTiles: 39, stateLiveId: 'lv1', liveId: 'lv1'
    });
    expect(skip).toBe(true);
    expect(diag.paintedDuringAwaitCount).toBe(1);
    expect(diag.skipCount).toBe(1);
  });

  it('まだ描かれていなければ書いてよい', () => {
    expect(shouldSkipLightSupplyAfterAwait(null, { domTiles: 0, stateLiveId: 'lv1', liveId: 'lv1' })).toBe(false);
  });

  it('★配信切替なら降りない(前の配信の描画を守る理由が無い)', () => {
    expect(shouldSkipLightSupplyAfterAwait(null, { domTiles: 39, stateLiveId: 'lv1', liveId: 'lv2' })).toBe(false);
  });

  it('liveId が空なら降りない(不明を「守る」と解釈しない)', () => {
    expect(shouldSkipLightSupplyAfterAwait(null, { domTiles: 39, stateLiveId: '', liveId: '' })).toBe(false);
  });

  it('大文字/空白は正規化して比較する', () => {
    expect(shouldSkipLightSupplyAfterAwait(null, { domTiles: 5, stateLiveId: ' LV1 ', liveId: 'lv1' })).toBe(true);
  });

  it('計器が無くても落ちない', () => {
    expect(() => shouldSkipLightSupplyAfterAwait(undefined, { domTiles: 5, stateLiveId: 'lv1', liveId: 'lv1' })).not.toThrow();
  });
});

describe('速報の行に「降りた回数」が出る', () => {
  it('降りた回数が0なら注記を出さない(正常時のノイズにしない)', () => {
    const line = formatLightSupplyGuardLine({ skipCount: 0, observedCount: 3, paintedDuringAwaitCount: 0 });
    expect(line).not.toContain('降りた');
  });

  it('★降りた回数が出る(observed=0 でも出す=別経路だから)', () => {
    const line = formatLightSupplyGuardLine({ skipCount: 0, observedCount: 0, paintedDuringAwaitCount: 2 });
    expect(line).toContain('降りた2回');
    expect(line).toContain('完全描画を守った');
  });

  it('見送りありの行にも併記される', () => {
    const line = formatLightSupplyGuardLine({
      skipCount: 1,
      observedCount: 5,
      worst: { roster: 39, next: 3 },
      paintedDuringAwaitCount: 4
    });
    expect(line).toContain('降りた4回');
    expect(line).toContain('1回見送り');
  });
});
