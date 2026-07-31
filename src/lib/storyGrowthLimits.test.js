import { describe, expect, it } from 'vitest';
import { STORY_GROWTH_MAX_CELLS, buildStoryGrowthGaugeLabel } from './storyGrowthLimits.js';

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
