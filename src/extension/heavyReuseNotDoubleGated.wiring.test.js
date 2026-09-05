/**
 * heavy 全件 read の再利用判定を、呼び出し側が二重に絞っていないかの検査(v0.1.1344)。
 *
 * ★なぜ要るか(2026-08-12・コードだけで確定した真因)
 *   旧コード:
 *     const canReuseHeavyChunkRead =
 *       (idbMode || commentsChunked) && currentChunkTotal != null && … && heavyReuseDecision.reuse;
 *
 *   currentChunkTotal は `idbMode ? … : commentsChunked ? … : null` で作られるので、
 *   `currentChunkTotal != null` は **`idbMode || commentsChunked` と等価**＝同じ条件の二重掛け。
 *   実効は「非チャンク配信を締め出す」ことだけだった。
 *
 *   一方 decideHeavyChunkReadReuse は `currentChunkTotal == null` のとき
 *   **常に reuse:true(coverage)** を返す(実行して確認済み)。
 *   ＝非チャンク配信では【純関数が「再利用してよい」と言っているのに呼び出し側が必ず無視】し、
 *   毎 refresh で heavy 全件を読み直し → 次 refresh に追い越されて race →
 *   heavyEverSettled が永久に false になっていた(実測 race 26回 / freshReadReuse 0回)。
 *
 * ★同じ形(判定を lib に出したのに呼び出し側が独自条件を重ねて殺す)の再発を防ぐ。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(new URL('./popup-entry.js', import.meta.url), 'utf8');

describe('heavy 再利用判定の二重ゲート禁止', () => {
  /** canReuseHeavyChunkRead の宣言式だけを切り出す。 */
  function reuseExpr() {
    const start = SRC.indexOf('const canReuseHeavyChunkRead');
    expect(start).toBeGreaterThan(-1);
    const end = SRC.indexOf(';', start);
    return SRC.slice(start, end);
  }

  it('★純関数の判定をそのまま採る(呼び出し側で条件を重ねない)', () => {
    const expr = reuseExpr();
    expect(expr).toContain('heavyReuseDecision.reuse');
    // ★これが二重ゲートの正体。復活させない。
    expect(expr).not.toContain('idbMode');
    expect(expr).not.toContain('commentsChunked');
    expect(expr).not.toContain('currentChunkTotal');
  });

  it('lv一致・件数>0 の重複判定を呼び出し側に持たない(純関数が見ている)', () => {
    const expr = reuseExpr();
    expect(expr).not.toContain('cachedHeavy.lv === lv');
    expect(expr).not.toContain('cachedHeavy.arr.length > 0');
  });

  it('判定は純関数 decideHeavyChunkReadReuse から得ている', () => {
    expect(SRC).toContain('const heavyReuseDecision = decideHeavyChunkReadReuse({');
  });
});
