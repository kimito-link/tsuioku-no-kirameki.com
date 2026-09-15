import { describe, expect, it } from 'vitest';
import { liveOgStatItems, liveOgStatsSentence, liveOgDescription } from './liveOgStats.js';

/** 保存形の抜粋(数字入り)。 */
function liveWith(over = {}) {
  return {
    streamer: { name: 'テスト配信者' },
    title: 'テスト配信',
    watchCount: 8368,
    commentCount: 12324,
    giftTotal: 117280,
    adTotal: 1275956,
    ...over
  };
}

describe('liveOgStatItems', () => {
  it('4 つ揃うと来場・コメント・ギフト(pt)・広告(pt)を整形して返す', () => {
    const items = liveOgStatItems(liveWith());
    expect(items).toEqual([
      { key: 'watch', label: '来場', text: '8,368', unit: '' },
      { key: 'comment', label: 'コメント', text: '12,324', unit: '' },
      { key: 'gift', label: 'ギフト', text: '117,280', unit: 'pt' },
      { key: 'ad', label: '広告', text: '1,275,956', unit: 'pt' }
    ]);
  });

  it('0・NaN・欠落の項目は省く(ギフト 0・広告欠落 → 来場とコメントだけ)', () => {
    const items = liveOgStatItems(liveWith({ giftTotal: 0, adTotal: undefined }));
    expect(items.map((i) => i.key)).toEqual(['watch', 'comment']);
  });

  it('負の値・数にならない値も省く', () => {
    const items = liveOgStatItems(liveWith({ watchCount: -5, commentCount: 'x', giftTotal: NaN }));
    expect(items.map((i) => i.key)).toEqual(['ad']);
  });

  it('全部 0/欠落なら空配列', () => {
    expect(liveOgStatItems(liveWith({ watchCount: 0, commentCount: 0, giftTotal: 0, adTotal: 0 }))).toEqual([]);
    expect(liveOgStatItems(null)).toEqual([]);
  });
});

describe('liveOgStatsSentence', () => {
  it('項目を「・」で連結し、pt は単位付き', () => {
    expect(liveOgStatsSentence(liveOgStatItems(liveWith()))).toBe(
      '来場8,368・コメント12,324・ギフト117,280pt・広告1,275,956pt'
    );
  });

  it('空配列は空文字', () => {
    expect(liveOgStatsSentence([])).toBe('');
  });
});

describe('liveOgDescription', () => {
  it('数字あり: liveShareText。 + 数字文。', () => {
    const desc = liveOgDescription(liveWith());
    expect(desc).toBe(
      'テスト配信者の配信「テスト配信」を、いま支えている人。来場8,368・コメント12,324・ギフト117,280pt・広告1,275,956pt。'
    );
  });

  it('数字が全部 0/欠落: 数字文を出さず補いの一言を付ける', () => {
    const desc = liveOgDescription(liveWith({ watchCount: 0, commentCount: 0, giftTotal: 0, adTotal: 0 }));
    expect(desc).toContain('テスト配信者の配信「テスト配信」を、いま支えている人。');
    expect(desc).toContain('追憶のきらめき ランキングで、支えている人を配信ごとに。');
    expect(desc).not.toContain('来場');
    expect(desc).not.toContain('pt');
  });

  it('live なし: 現行の汎用 description(配信で変えない)', () => {
    const desc = liveOgDescription(null);
    expect(desc).toBe(
      'いまこの瞬間、この配信をギフト・広告・コメントで支えている人を、配信サムネ・配信者つきでリアルタイムに。主役は配信者ではなく「応援した人」。'
    );
  });

  it('最大長: 前半 57 + 数字 4 項目(各 7 桁)でも 115 コードポイント以内', () => {
    // 前半(liveShareText)を実測上限(57)へ: 名前18字+番組名24字。
    const name = 'あ'.repeat(18);
    const title = 'い'.repeat(24);
    const desc = liveOgDescription({
      streamer: { name },
      title,
      watchCount: 8368000,
      commentCount: 12324000,
      giftTotal: 1172800,
      adTotal: 1275956
    });
    expect(Array.from(desc).length).toBeLessThanOrEqual(115);
    // 数字 4 項目が全部載っていること(省略されていない)。
    expect(desc).toContain('来場');
    expect(desc).toContain('広告');
  });
});
