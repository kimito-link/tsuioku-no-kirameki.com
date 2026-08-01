import { describe, expect, it } from 'vitest';
import {
  STORY_GROWTH_MAX_CELLS,
  buildStoryGrowthGaugeLabel,
  buildSupportSameUserBlurb
} from './storyGrowthLimits.js';

/**
 * 2026-07-31 ユーザー報告「応援レーンには居るのにアイコングリッドに居ない人がいる」の根治。
 *
 * 真因はバグではなく告知漏れだった: グリッドは直近 STORY_GROWTH_MAX_CELLS(360)件だけを描く
 * ウィンドウ表示なのに、ラベルは全件数(2,716)だけを出していた。その真下にアイコンが360個
 * しか無いため「2,716人ぶん並んでいる=探している人も居るはず」と読め、実際には窓の外に
 * 落ちていた人を「居ない」と誤解させていた(実例: 43分前に1件だけ発言した人)。
 *
 * 応援レーン側は「いま N 件を表示中（ほか M人・直近アクティブ順）」と既に誠実に併記しており
 * (storyUserLaneGuideHtml.js)、「黙って切らない」は明示された設計方針(popup-entry.js:6898)。
 * グリッドだけこの手当てが漏れていたので揃える。
 */
describe('buildStoryGrowthGaugeLabel', () => {
  it('0件は「応援 0 コメント」だけ(操作ヒントも出さない)', () => {
    expect(buildStoryGrowthGaugeLabel(0)).toBe('応援 0 コメント');
    expect(buildStoryGrowthGaugeLabel(-5)).toBe('応援 0 コメント');
    expect(buildStoryGrowthGaugeLabel(NaN)).toBe('応援 0 コメント');
  });

  it('上限以下なら切り捨ての告知を出さない(従来どおり・後方互換)', () => {
    const label = buildStoryGrowthGaugeLabel(100);
    expect(label).toContain('応援 100 コメント');
    expect(label).toContain('ホバーでプレビュー');
    expect(label).not.toContain('表示枠の外');
  });

  it('上限ちょうども告知を出さない(切り捨てが起きていないため)', () => {
    const label = buildStoryGrowthGaugeLabel(STORY_GROWTH_MAX_CELLS);
    expect(label).not.toContain('表示枠の外');
  });

  it('上限超過なら「表示中の件数」と「枠外の件数」を明記する', () => {
    const label = buildStoryGrowthGaugeLabel(STORY_GROWTH_MAX_CELLS + 1);
    expect(label).toContain(`いま直近 ${STORY_GROWTH_MAX_CELLS.toLocaleString('ja-JP')} 件を表示中`);
    expect(label).toContain('ほか 1 件は表示枠の外');
  });

  it('実例(2,716件)で「360件表示中・2,356件が枠外」と出る', () => {
    const label = buildStoryGrowthGaugeLabel(2716);
    expect(label).toContain('応援 2,716 コメント');
    expect(label).toContain('いま直近 360 件を表示中');
    expect(label).toContain('ほか 2,356 件は表示枠の外');
  });

  it('桁区切りは日本語ロケール(全件・枠外の両方)', () => {
    const label = buildStoryGrowthGaugeLabel(12345, 1000);
    expect(label).toContain('応援 12,345 コメント');
    expect(label).toContain('いま直近 1,000 件を表示中');
    expect(label).toContain('ほか 11,345 件は表示枠の外');
  });

  it('maxCells を明示できる(既定は STORY_GROWTH_MAX_CELLS)', () => {
    expect(buildStoryGrowthGaugeLabel(500, 100)).toContain('いま直近 100 件を表示中');
    // 未指定時は既定値で判定される
    expect(buildStoryGrowthGaugeLabel(500)).toContain(
      `いま直近 ${STORY_GROWTH_MAX_CELLS.toLocaleString('ja-JP')} 件を表示中`
    );
  });
});

/**
 * 上と同じ「黙って切らない」問題の、セル注記側(v0.1.1209)。
 *
 * ゲージラベルは v0.1.1202 で直したが、各セルの aria-label / title は
 * 「一覧に同ユーザー計N件」のまま残っていた。この N は buildSupportAccentIndex が
 * 表示ウィンドウ内だけを数えた値なので、窓の外にも発言があるのに「一覧はこれで全部」と
 * 読める。さらに窓外へ落ちた瞬間 ordinal が黙って巻き戻る。
 *
 * 枠外の件数を数字で出さないのは意図的: それにはセルごとの全件走査が要り、
 * userSupportGridAccent.js:189 が「ページが応答しません」の真因として撤去した O(N²) が復活する。
 */
describe('buildSupportSameUserBlurb', () => {
  it('単独ユーザーなら注記を出さない(空文字)', () => {
    expect(buildSupportSameUserBlurb({ ordinal: 1, total: 1 })).toBe('');
    expect(buildSupportSameUserBlurb({ ordinal: 1, total: 0 })).toBe('');
    expect(buildSupportSameUserBlurb({ ordinal: 1, total: -3 })).toBe('');
    expect(buildSupportSameUserBlurb({ ordinal: 1, total: NaN })).toBe('');
    // 引数なしでも落ちない(呼び出し側のガード漏れで例外を出さない)
    expect(buildSupportSameUserBlurb()).toBe('');
  });

  it('窓が全件を覆っているときは従来文言とバイト一致(後方互換)', () => {
    expect(buildSupportSameUserBlurb({ ordinal: 2, total: 5, windowed: false })).toBe(
      '同一ユーザー2件目、一覧に同ユーザー計5件。'
    );
    // windowed 省略時も従来どおり
    expect(buildSupportSameUserBlurb({ ordinal: 2, total: 5 })).toBe(
      '同一ユーザー2件目、一覧に同ユーザー計5件。'
    );
  });

  it('切り捨てが起きているときは「枠内での数え」と明示し、誤読源の「一覧に」を使わない', () => {
    const s = buildSupportSameUserBlurb({ ordinal: 2, total: 5, windowed: true });
    expect(s).toBe('同一ユーザー2件目、表示中の枠内で計5件（枠外にもある場合あり）。');
    expect(s).not.toContain('一覧に');
    expect(s).toContain('枠外にもある場合あり');
  });

  it('枠外の件数は数字で出さない(全件走査 O(N²) を復活させないため)', () => {
    const s = buildSupportSameUserBlurb({ ordinal: 3, total: 4, windowed: true });
    // 出てよい数字は ordinal と 枠内 total だけ。「ほか N 件」の形は作らない。
    expect(s).not.toMatch(/ほか\s*[\d,]+\s*件/);
    expect(s).not.toContain('表示枠の外');
  });

  it('ordinal が不正でも 1 以上に丸める(NaN で「NaN件目」を出さない)', () => {
    expect(buildSupportSameUserBlurb({ ordinal: NaN, total: 3 })).toContain('同一ユーザー1件目');
    expect(buildSupportSameUserBlurb({ ordinal: 0, total: 3 })).toContain('同一ユーザー1件目');
    expect(buildSupportSameUserBlurb({ ordinal: -2, total: 3 })).toContain('同一ユーザー1件目');
  });

  it('ツールチップとして短く保つ(title 属性に出るため長文化させない)', () => {
    // 実配信で起こりうる大きめの値でも、注記が肥大しないことを契約として固定する。
    const s = buildSupportSameUserBlurb({ ordinal: 120, total: 360, windowed: true });
    expect(s.length).toBeLessThanOrEqual(60);
  });
});
