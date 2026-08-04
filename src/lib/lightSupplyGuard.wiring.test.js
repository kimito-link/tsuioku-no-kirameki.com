import { describe, it, expect } from 'vitest';
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

  it('popup-entry が判定関数を import している', () => {
    expect(popup).toMatch(
      /import\s*\{[^}]*shouldSkipLightSupplyOverwrite[^}]*\}\s*from\s*'\.\.\/lib\/lightSupplyOverwriteGuard\.js'/
    );
  });

  it('★軽い供給の経路で判定を呼び、skip なら return している(無条件の文であること)', () => {
    const fn = popup.slice(popup.indexOf('async function renderStoryUserLaneFromLightCommentsForCurrentLive'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('shouldSkipLightSupplyOverwrite(');
    // 呼び出しが条件付き(if (false) 等)で無効化されていないこと=直前行が素の文であること。
    const call = body.slice(body.indexOf('shouldSkipLightSupplyOverwrite('));
    expect(call).toMatch(/_verdict\.skip/);
    expect(call).toMatch(/return;/);
  });

  it('★判定に DOM 由来の値を渡していない(DOM は消える側=判断材料にできない)', () => {
    const fn = popup.slice(popup.indexOf('async function renderStoryUserLaneFromLightCommentsForCurrentLive'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    const argsStart = body.indexOf('shouldSkipLightSupplyOverwrite({');
    const argsEnd = body.indexOf('});', argsStart);
    const argsBlock = body.slice(argsStart, argsEnd);
    expect(argsBlock).not.toContain('countStoryUserLaneDomTiles');
    expect(argsBlock).toContain('rosterEverSeen');
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
    expect(popup).toContain('_lightSupplyGuardDiag.observedCount += 1;');
  });
});
