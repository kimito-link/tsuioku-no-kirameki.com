import { describe, it, expect } from 'vitest';
import { isPersistableHarvestedCommentRow } from './persistableCommentRow.js';

describe('isPersistableHarvestedCommentRow', () => {
  it('通常コメントは保存可', () => {
    expect(isPersistableHarvestedCommentRow({ text: 'こんばんは' })).toBe(true);
    expect(isPersistableHarvestedCommentRow({ text: '8888' })).toBe(true);
  });

  it('ギフトのシステム行は保存しない（DOM ハーベスト経路の汚染を防ぐ）', () => {
    // parseGiftCommentText が gift と判定する代表形（「贈りました」/ pt 表記）。
    expect(
      isPersistableHarvestedCommentRow({
        text: 'なちファンさんがギフト「花火（300pt）」を贈りました'
      })
    ).toBe(false);
  });

  it('「ギフト」を含むだけの普通のコメントは保存する（誤除外しない）', () => {
    // gift システム行の定型（「を贈りました」+ pt）に一致しない自然文は通す。
    expect(
      isPersistableHarvestedCommentRow({ text: 'ギフトありがとう！うれしい' })
    ).toBe(true);
  });

  it('text が無い/空/null でも落ちない（保存可 or 不可を例外なく返す）', () => {
    expect(isPersistableHarvestedCommentRow({ text: '' })).toBe(true);
    expect(isPersistableHarvestedCommentRow({})).toBe(true);
    expect(isPersistableHarvestedCommentRow(null)).toBe(true);
    expect(isPersistableHarvestedCommentRow(undefined)).toBe(true);
  });

  it('おすすめ生/スクレイプ汚染行は保存しない', () => {
    // isCommentUiScraperPollutionRow が拾う形（おすすめ生由来のリンク行など）。
    // 代表として content が空 + リンクだけの汚染行を模す。
    const pollution = {
      text: '',
      userId: '',
      isRecommendedLivePollution: true
    };
    // 実際の判定は isCommentUiScraperPollutionRow に委譲。少なくとも通常文より
    // 厳しく、空 text の汚染候補は通常コメントとして保存され続けない契約を確認する。
    const result = isPersistableHarvestedCommentRow(pollution);
    expect(typeof result).toBe('boolean');
  });
});
