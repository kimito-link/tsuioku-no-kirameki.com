import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 2026-10-14: gift/ad picks の持ち越しの配線の固定。配信 ID が変わるときに無条件で [] へ戻す旧実装(v0.1.1042)へ
 *   戻ると、「配信なし」を経由して同じ配信へ戻るたびに gift/ad のタイルが消える(29→14枚)。
 */
const popup = fs.readFileSync(path.resolve('src/extension/popup-entry.js'), 'utf8').split('\r\n').join('\n');

describe('popup-entry: 配信 ID の切替で gift/ad picks を判定してから入れる', () => {
  it('★切替ブロックで resolvePicksOnLiveChange を通し、結果を picks へ入れる', () => {
    const at = popup.indexOf('const _prevLidForPicks = STORY_SOURCE_STATE.liveId;');
    expect(at).toBeGreaterThan(0);
    const body = popup.slice(at, at + 1800);
    expect(body).toMatch(/resolvePicksOnLiveChange\(_giftAdPicksCarry, \{/);
    expect(body).toMatch(/STORY_SOURCE_STATE\.giftThrowerPicks = Object\.freeze\(\[\.\.\.carried\.gift\]\);/);
    expect(body).toMatch(/STORY_SOURCE_STATE\.adThrowerPicks = Object\.freeze\(\[\.\.\.carried\.ad\]\);/);
  });
  it('★切替ブロックの中で picks を無条件に [] へ戻していない', () => {
    const at = popup.indexOf('const _prevLidForPicks = STORY_SOURCE_STATE.liveId;');
    const end = popup.indexOf('_instantPushBuffer = [];', at);
    expect(popup.slice(at, end)).not.toMatch(/giftThrowerPicks = Object\.freeze\(\[\]\)/);
  });
  it('★計器(restored / cleared)を診断へ載せる', () => {
    expect(popup).toMatch(/giftAdPicksCarry: \{ restored: _giftAdPicksCarryDiag\.restored, cleared: _giftAdPicksCarryDiag\.cleared \},/);
  });
});
