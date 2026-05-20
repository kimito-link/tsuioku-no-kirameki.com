/**
 * contributionRankingListView.js のテスト。
 *
 * 目的（v0.1.287）:
 *   Antigravity §6.2 で導入した縦リスト UI の HTML 構造を、unit test で
 *   構造的に固定する。3 年後に CSS class 名を変えても test 経由で検出できる
 *   ようにし、SR-friendly な aria 属性も保護する。
 */

import { describe, it, expect } from 'vitest';
import {
  tierForRank,
  buildContributionRankingListHtml
} from './contributionRankingListView.js';

/**
 * テスト用 model factory。本物の topSupportRankLineModels() の戻りと同形に揃える。
 */
function model(placeNumber, nameLine, count, extra) {
  return {
    count,
    userKey: extra?.userKey || `__contrib_${placeNumber || 0}_${nameLine}`,
    isUnknown: extra?.isUnknown || false,
    placeNumber,
    hasAccent: false,
    accentColorCss: null,
    thumbSrc: extra?.thumbSrc || 'data:image/svg+xml,placeholder',
    thumbNeedsNoReferrer: false,
    idTitle: extra?.idTitle || '',
    idShort: extra?.idShort || '',
    nameLine,
    fullLabelForTitle: extra?.fullLabelForTitle || nameLine
  };
}

describe('tierForRank', () => {
  it('1 → gold, 2 → silver, 3 → bronze, 4+ → normal', () => {
    expect(tierForRank(1)).toBe('gold');
    expect(tierForRank(2)).toBe('silver');
    expect(tierForRank(3)).toBe('bronze');
    expect(tierForRank(4)).toBe('normal');
    expect(tierForRank(10)).toBe('normal');
    expect(tierForRank(100)).toBe('normal');
  });

  it('null / 0 / 負数 / NaN → empty', () => {
    expect(tierForRank(null)).toBe('empty');
    expect(tierForRank(0)).toBe('empty');
    expect(tierForRank(-1)).toBe('empty');
    expect(tierForRank(NaN)).toBe('empty');
    expect(tierForRank(undefined)).toBe('empty');
  });

  it('topTierThreshold で閾値を絞れる（拡張点）', () => {
    expect(tierForRank(2, { topTierThreshold: 1 })).toBe('normal');
    expect(tierForRank(3, { topTierThreshold: 2 })).toBe('normal');
    expect(tierForRank(1, { topTierThreshold: 0 })).toBe('normal');
  });
});

describe('buildContributionRankingListHtml — 全体構造', () => {
  const baseOpts = {
    noteText: '公式の貢献度ランキング',
    ariaLabel: '貢献度ランキング',
    unitSuffix: '貢',
    defaultThumbSrc: 'data:image/svg+xml,default'
  };

  it('空配列 → section + note + 空 rows コンテナを返す（崩れない）', () => {
    const html = buildContributionRankingListHtml([], baseOpts);
    expect(html).toContain('class="nl-contrib-ranking-list"');
    expect(html).toContain('role="list"');
    expect(html).toContain('aria-label="貢献度ランキング"');
    expect(html).toContain('公式の貢献度ランキング');
    expect(html).toContain('class="nl-contrib-ranking-list__rows"');
    // 行は無し
    expect(html).not.toContain('nl-contrib-ranking-list__row ');
  });

  it('noteText 空 → note要素を出さない（HTML を簡潔に保つ）', () => {
    const html = buildContributionRankingListHtml([], { ...baseOpts, noteText: '' });
    expect(html).not.toContain('nl-contrib-ranking-list__note');
  });

  it('models 件数 ≦ 配列長と一致、各行に tier クラスが付く', () => {
    const html = buildContributionRankingListHtml(
      [
        model(1, 'A', 5000),
        model(2, 'B', 2500),
        model(3, 'C', 600),
        model(4, 'D', 100)
      ],
      baseOpts
    );
    expect(html).toContain('nl-contrib-ranking-list__row--tier-gold');
    expect(html).toContain('nl-contrib-ranking-list__row--tier-silver');
    expect(html).toContain('nl-contrib-ranking-list__row--tier-bronze');
    expect(html).toContain('nl-contrib-ranking-list__row--tier-normal');
  });
});

describe('buildContributionRankingListHtml — 1 行の中身', () => {
  const baseOpts = {
    noteText: '',
    ariaLabel: '貢献度ランキング',
    unitSuffix: '貢',
    defaultThumbSrc: 'data:image/svg+xml,default'
  };

  it('順位・名前・「さん」suffix・カンマ区切り pt・unit suffix を含む', () => {
    const html = buildContributionRankingListHtml([model(1, 'フロア熱狂', 5105)], baseOpts);
    expect(html).toContain('>1<');
    expect(html).toContain('フロア熱狂 さん');
    expect(html).toContain('5,105 貢');
  });

  it('isUnknown 行は「さん」suffix を付けない', () => {
    const html = buildContributionRankingListHtml(
      [model(null, '—', 0, { isUnknown: true, userKey: '__unknown__' })],
      baseOpts
    );
    expect(html).toContain('>—<');
    expect(html).not.toContain('— さん');
  });

  it('「（未取得）」名でも「さん」suffix を付けない（誤付与防止）', () => {
    const html = buildContributionRankingListHtml(
      [model(5, '（未取得）', 50)],
      baseOpts
    );
    expect(html).not.toContain('（未取得） さん');
  });

  it('HTML エスケープが効く（XSS 防御）', () => {
    const html = buildContributionRankingListHtml(
      [model(1, '<script>alert(1)</script>', 100)],
      baseOpts
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('thumbSrc が http(s) URL なら referrerpolicy="no-referrer" を付ける', () => {
    const html = buildContributionRankingListHtml(
      [
        model(1, 'A', 100, {
          thumbSrc: 'https://example.com/avatar.png'
        })
      ],
      baseOpts
    );
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain('src="https://example.com/avatar.png"');
  });

  it('thumbSrc が data: URL なら referrerpolicy を付けない（不要なので省略）', () => {
    const html = buildContributionRankingListHtml(
      [model(1, 'A', 100, { thumbSrc: 'data:image/svg+xml,inline' })],
      baseOpts
    );
    expect(html).not.toContain('referrerpolicy="no-referrer"');
  });

  it('showThumb=false で thumb 列を出さない（拡張点）', () => {
    const html = buildContributionRankingListHtml(
      [model(1, 'A', 100)],
      { ...baseOpts, showThumb: false }
    );
    expect(html).not.toContain('nl-contrib-ranking-list__thumb');
  });

  it('aria-label に「第N位」が組み込まれる（スクリーンリーダー対応）', () => {
    const html = buildContributionRankingListHtml([model(1, 'A', 100)], baseOpts);
    expect(html).toContain('aria-label="第1位"');
  });

  it('data-tier 属性が付き、CSS テーマ切替に使える', () => {
    const html = buildContributionRankingListHtml(
      [model(1, 'A', 100), model(4, 'D', 10)],
      baseOpts
    );
    expect(html).toContain('data-tier="gold"');
    expect(html).toContain('data-tier="normal"');
  });

  it('count = 0 でも崩れず "0 貢" と出す', () => {
    const html = buildContributionRankingListHtml([model(10, 'Z', 0)], baseOpts);
    expect(html).toContain('0 貢');
  });

  it('count が大きくてもカンマ区切りで読みやすい（123,456,789）', () => {
    const html = buildContributionRankingListHtml(
      [model(1, 'B', 123456789)],
      baseOpts
    );
    expect(html).toContain('123,456,789 貢');
  });

  it('count が NaN/非数値でも 0 に正規化される（落ちない）', () => {
    // @ts-expect-error 不正入力の防御確認
    const html = buildContributionRankingListHtml([model(1, 'A', 'bogus')], baseOpts);
    expect(html).toContain('0 貢');
  });
});

describe('buildContributionRankingListHtml — opts 切替', () => {
  const m1 = model(1, 'A', 100);

  it('nameSuffix 上書きで「さん」以外を付けられる（拡張点）', () => {
    const html = buildContributionRankingListHtml([m1], {
      noteText: '',
      ariaLabel: 'L',
      unitSuffix: '貢',
      defaultThumbSrc: '',
      nameSuffix: '様'
    });
    expect(html).toContain('A様');
  });

  it('nameSuffix 空文字で suffix 無し', () => {
    const html = buildContributionRankingListHtml([m1], {
      noteText: '',
      ariaLabel: 'L',
      unitSuffix: '貢',
      defaultThumbSrc: '',
      nameSuffix: ''
    });
    // 'A さん' でも 'A様' でもなく素の 'A' で終わるか
    expect(html).toContain('>A<');
  });

  it('unitSuffix 空でも 後置 pt 単位は単に「100」と出る', () => {
    const html = buildContributionRankingListHtml([m1], {
      noteText: '',
      ariaLabel: 'L',
      unitSuffix: '',
      defaultThumbSrc: ''
    });
    expect(html).toContain('100 ');
  });

  it('opts 自体が undefined でも落ちず、ariaLabel default が効く', () => {
    // @ts-expect-error 不正入力の防御確認
    const html = buildContributionRankingListHtml([], undefined);
    expect(html).toContain('aria-label="貢献度ランキング"');
  });
});

describe('buildContributionRankingListHtml — §6.2 回帰検出ロック', () => {
  it('1 位は data-tier="gold" のまま固定（3 年後に誰かが silver に書き換えても落ちる）', () => {
    const html = buildContributionRankingListHtml(
      [model(1, 'A', 100)],
      {
        noteText: '',
        ariaLabel: 'L',
        unitSuffix: '貢',
        defaultThumbSrc: ''
      }
    );
    expect(html).toContain('data-tier="gold"');
    expect(html).not.toContain('data-tier="silver"');
  });

  it('1-10 位の連続表示でクラス suffix が正しく対応する', () => {
    const ms = Array.from({ length: 10 }, (_, i) => model(i + 1, `R${i + 1}`, 100 - i));
    const html = buildContributionRankingListHtml(ms, {
      noteText: '',
      ariaLabel: 'L',
      unitSuffix: '貢',
      defaultThumbSrc: ''
    });
    expect(html).toContain('data-tier="gold"');
    expect(html).toContain('data-tier="silver"');
    expect(html).toContain('data-tier="bronze"');
    // 4 位以降が tier-normal で 7 件
    const normalCount = (html.match(/data-tier="normal"/g) || []).length;
    expect(normalCount).toBe(7);
  });
});
