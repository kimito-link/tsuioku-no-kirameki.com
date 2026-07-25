import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const popupEntrySrc = fs.readFileSync(path.join(here, 'popup-entry.js'), 'utf8');

/**
 * story-diag-realtime-sync-DESIGN.md §E: STORY_AVATAR_DIAG_STATE.total の正本統合
 *   (popup-entry.js内3箇所)が resolveStoryDiagTotal 経由に差し替わっていること、
 *   直代入(`= arr.length;`)が残っていないことをソース文字列で断言する。
 *   ②venueBar側のMVP(panel summary直接購読)は既に実装済み(v0.1.1171)で本テストの対象外。
 */
describe('story diag total source wiring (popup-entry.js §E)', () => {
  it('resolveStoryDiagTotal が storyDiagTotalSource.js から import されている', () => {
    expect(popupEntrySrc).toContain(
      "import { resolveStoryDiagTotal } from '../lib/storyDiagTotalSource.js';"
    );
  });

  it('STORY_AVATAR_DIAG_STATE.total への旧来の直代入(= arr.length;)が残っていない', () => {
    expect(popupEntrySrc).not.toContain('STORY_AVATAR_DIAG_STATE.total = arr.length;');
  });

  it('resolveStoryDiagTotal の呼び出しが2箇所ある(箇所2・箇所3)', () => {
    const matches = popupEntrySrc.match(/resolveStoryDiagTotal\(\{/g) || [];
    expect(matches.length).toBe(2);
  });

  it('resetStoryAvatarDiagState はtotalSource/panelAgeSecも初期化する(配信切替の持ち越し防止)', () => {
    const start = popupEntrySrc.indexOf('function resetStoryAvatarDiagState()');
    const end = popupEntrySrc.indexOf('\n}', start);
    expect(start).toBeGreaterThanOrEqual(0);
    const block = popupEntrySrc.slice(start, end);
    expect(block).toContain('STORY_AVATAR_DIAG_STATE.total = 0;');
    expect(block).toContain("STORY_AVATAR_DIAG_STATE.totalSource = 'fallback';");
    expect(block).toContain('STORY_AVATAR_DIAG_STATE.panelAgeSec = null;');
  });

  it('paintWatchPopupUi内の解決結果は単調化ゲートを経由してからtotalへ入る(ゲート位置不変)', () => {
    const start = popupEntrySrc.indexOf('function paintWatchPopupUi() {');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = popupEntrySrc.slice(start, start + 2000);
    const resolveIdx = block.indexOf('resolveStoryDiagTotal({');
    const monotonicIdx = block.indexOf('applyStoryDiagMonotonic(_storyDiagMonotonicState, lv, { total: _paintTotal.total })');
    expect(resolveIdx).toBeGreaterThanOrEqual(0);
    expect(monotonicIdx).toBeGreaterThan(resolveIdx);
  });

  it('状態速報用のstoryDiagTotalSource計器(totalSource/panelAgeSec)がpopup固有診断JSONに乗っている', () => {
    const idx = popupEntrySrc.indexOf('storyDiagTotalSource: (() => {');
    expect(idx).toBeGreaterThanOrEqual(0);
    const after = popupEntrySrc.slice(idx, idx + 300);
    expect(after).toContain('STORY_AVATAR_DIAG_STATE.totalSource');
    expect(after).toContain('STORY_AVATAR_DIAG_STATE.panelAgeSec');
  });
});
