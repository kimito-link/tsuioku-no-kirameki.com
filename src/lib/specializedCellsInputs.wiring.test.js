/**
 * ★v0.1.1395: 特化セル5種の【入力が実際に渡されている】ことを固定する。
 *   v1390 は registry 登録と healthCells 側の生成までやったのに、
 *   status-entry から入力を渡していなかった=実機で4つ出ていなかった。
 *   「登録した/作った」と「画面に出る」は別。ここが最後の穴になりやすい。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const status = readFileSync(join(here, '../extension/status-entry.js'), 'utf8');

const REQUIRED_INPUTS = [
  'commentPostDiag:',     // コメント送信
  'instantPushDiag:',     // 読み上げ⇄吹き出し(表示側)
  'mainThreadBlocker:',   // メインスレッド(黒くなる件)
  'liveElapsedMs:',       // ギフト/広告の「取得中」詰まり判定
  'venueOpen:',           // 会場モードの鮮度
  'venueMirrorAgeMs:',
  'venueTiers:'
];

describe('特化セルの入力が status から渡されている', () => {
  const call = status.slice(status.indexOf('renderHealthCells({'));
  for (const key of REQUIRED_INPUTS) {
    it(`★${key} を渡している`, () => {
      expect(call.slice(0, 2000)).toContain(key);
    });
  }

  it('★渡し元が実在する場所から取っている(null固定にしていない)', () => {
    expect(call).toContain('_extrasCache?.commentPostDiag');
    expect(call).toContain('_extrasCache?.instantPushDiag');
  });
});
