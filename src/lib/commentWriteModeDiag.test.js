import { describe, expect, it } from 'vitest';
import { buildCommentWriteModeDiagLine } from './commentWriteModeDiag.js';

/**
 * ★v0.1.1382: 書き込みモード計器の単体テスト。
 *   実測値(丸ごと=停止410ms / チャンク=63ms)を文言に焼き付けて「読んで直せる」ことを守る。
 */
describe('buildCommentWriteModeDiagLine', () => {
  const now = 1_700_000_000_000;

  it('★丸ごと書き戻しを 🔴 で名指しし、次の一手まで言う', () => {
    const r = buildCommentWriteModeDiagLine(
      { mode: 'whole', rows: 24000, wholeWrites: 7, chunkWrites: 0, at: now - 3000 },
      now
    );
    expect(r.ok).toBe(false);
    expect(r.line).toContain('🔴');
    expect(r.line).toContain('丸ごと書き戻し(7回');
    expect(r.line).toContain('24000件');
    // ★原因と次の一手(読み手に引き算をさせない)
    expect(r.line).toContain('パネル/診断を巻き込んで固める');
    expect(r.line).toContain('6.8倍');
  });

  it('チャンク追記なら ✅', () => {
    const r = buildCommentWriteModeDiagLine(
      { mode: 'chunk', rows: 24000, wholeWrites: 0, chunkWrites: 42, at: now - 1000 },
      now
    );
    expect(r.ok).toBe(true);
    expect(r.line).toContain('✅');
    expect(r.line).toContain('チャンク追記(42回');
  });

  it('★1回でも whole があれば異常(記録が伸びるほど重くなるので即座に言う)', () => {
    const r = buildCommentWriteModeDiagLine(
      { mode: 'chunk', rows: 100, wholeWrites: 1, chunkWrites: 500, at: now },
      now
    );
    expect(r.ok).toBe(false);
    expect(r.wholeWrites).toBe(1);
  });

  it('★未観測を「正常」と言わない(測っていないだけ)', () => {
    for (const v of [null, undefined, 'x', 123]) {
      const r = buildCommentWriteModeDiagLine(/** @type {any} */ (v), now);
      expect(r.line).toContain('未観測');
      expect(r.line).not.toContain('✅');
      expect(r.line).not.toContain('🔴');
    }
  });

  it('★フォールバック理由を捨てない(なぜチャンクに乗れなかったか)', () => {
    const r = buildCommentWriteModeDiagLine(
      { mode: 'whole', rows: 10, wholeWrites: 3, fallbackReason: 'index_broken', at: now },
      now
    );
    expect(r.line).toContain('理由=index_broken');
  });

  it('経過秒を併記する(いつの観測か)', () => {
    const r = buildCommentWriteModeDiagLine(
      { mode: 'chunk', rows: 5, chunkWrites: 1, at: now - 12_000 },
      now
    );
    expect(r.line).toContain('12秒前');
  });
});
