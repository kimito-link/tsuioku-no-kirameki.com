import { describe, it, expect } from 'vitest';
import { judgeAndRecordLightSupply } from './lightSupplyOverwriteGuard.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');

/**
 * ★配線テスト。純関数が正しくても、呼ばれていなければ実配信では何も直らない。
 *   [[wiring-test-mutation-check-2026-08-01]]: 「無条件に実行される文」であることまで
 *   断言する(`if (false)` 前置や走査混入で緑のまま通る穴を塞ぐ)。
 */
describe('lightSupplyOverwriteGuard の配線', () => {
  const popup = read('src/extension/popup-entry.js');

  /*
   * ★v0.1.1370: 呼び口を judgeAndRecordLightSupply(判定+記録の統合入口)に変更した。
   *   理由: 旧実装は呼び出し側が observedCount/skipCount を手で数えており、
   *   【通した理由を記録する場所が無かった】=素通りの原因が永久に分からなかった。
   *   生の shouldSkipLightSupplyOverwrite を直接呼ぶと passReasons が欠けるので、
   *   ここで「直接呼びに戻っていないこと」まで断言する。
   */
  it('popup-entry が判定関数を import している', () => {
    expect(popup).toMatch(
      /import\s*\{[^}]*judgeAndRecordLightSupply[^}]*\}\s*from\s*'\.\.\/lib\/lightSupplyOverwriteGuard\.js'/
    );
  });

  it('★軽い供給の経路で判定を呼び、skip なら return している(無条件の文であること)', () => {
    const fn = popup.slice(popup.indexOf('async function renderStoryUserLaneFromLightCommentsForCurrentLive'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('judgeAndRecordLightSupply(');
    // 呼び出しが条件付き(if (false) 等)で無効化されていないこと=直前行が素の文であること。
    const call = body.slice(body.indexOf('judgeAndRecordLightSupply('));
    expect(call).toMatch(/_verdict\.skip/);
    expect(call).toMatch(/return;/);
  });

  it('★生の判定関数を直接呼んでいない(通した理由の記録漏れを防ぐ)', () => {
    expect(popup).not.toContain('shouldSkipLightSupplyOverwrite(');
  });

  it('★判定に DOM 由来の値を渡していない(DOM は消える側=判断材料にできない)', () => {
    const fn = popup.slice(popup.indexOf('async function renderStoryUserLaneFromLightCommentsForCurrentLive'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    const argsStart = body.indexOf('judgeAndRecordLightSupply(_lightSupplyGuardDiag, {');
    const argsEnd = body.indexOf('});', argsStart);
    const argsBlock = body.slice(argsStart, argsEnd);
    expect(argsBlock).not.toContain('countStoryUserLaneDomTiles');
    expect(argsBlock).toContain('rosterEverSeen');
  });

  it('★通した理由(passReasons)を速報のスナップショットに載せている', () => {
    // 計算しても snapshot に載せ忘れれば画面に出ない=無いのと同じ。
    expect(popup).toMatch(/passReasons:\s*\{\s*\.\.\._lightSupplyGuardDiag\.passReasons\s*\}/);
  });

  it('名簿スナップショットが配信ID(lastLid)を出している(別配信の名簿で縛らないため)', () => {
    expect(read('src/lib/laneRosterDelta.js')).toMatch(/lastLid:\s*String\(s\.lastLid/);
  });

  it('診断オブジェクトに lightSupplyGuard を載せている', () => {
    expect(popup).toMatch(/lightSupplyGuard:\s*\{/);
    expect(popup).toContain('formatLightSupplyGuardLine(_lightSupplyGuardDiag)');
  });

  it('★状態速報の本文に1行出している(通さないとコピペに永久に出ない)', () => {
    // 速報は popup 側で整形済みの line を読む(この経路の他計器と同型)。
    //   整形関数の import は popup-entry 側にあり、ここで再importすると未使用lintで赤になる。
    const report = read('src/lib/aiShareFullText.js');
    expect(report).toContain('lightSupplyGuard?.line');
    expect(report).toMatch(/if \(lightLine\) \{ lines\.push\(lightLine\)/);
  });

  it('観測回数(observedCount)を必ず数えている(0の意味を区別するため)', () => {
    /*
     * ★v0.1.1370: 数える場所を呼び出し側から judgeAndRecordLightSupply へ移した。
     *   呼び出し側で手で数える方式は「数え忘れ」を構造的に許すため、
     *   判定と同じ関数の中で必ず数える形にする。
     *   ここでは【純関数側が数えていること】を断言する(popup 側の文字列ではなく実挙動)。
     */
    const diag = { observedCount: 0, skipCount: 0, passReasons: {} };
    judgeAndRecordLightSupply(diag, {
      provisional: true,
      nextSupplyCount: 3,
      rosterEverSeen: 19,
      currentLiveId: 'lv1',
      rosterLiveId: 'lv1'
    });
    expect(diag.observedCount).toBe(1);
  });
});
