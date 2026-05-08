import { describe, expect, it } from 'vitest';
import {
  STORY_SUPPORT_GROWTH_GAUGE_HELP,
  SUPPORT_VISUAL_DEV_MONITOR_SUMMARY_LABEL,
  buildStoryGaugeMeterLabelText,
  buildStoryUserLaneStackAriaLabel
} from './supportVisualStoryCopy.js';

describe('supportVisualStoryCopy', () => {
  it('開発向け折りたたみラベルは固定文言', () => {
    expect(SUPPORT_VISUAL_DEV_MONITOR_SUMMARY_LABEL).toBe(
      '詳しい状況（開発・切り分け用）'
    );
  });

  it('グリッド案内文は固定（HTML #sceneStoryGaugeLabel と一致）', () => {
    expect(STORY_SUPPORT_GROWTH_GAUGE_HELP).toContain('ホバーでプレビュー');
    expect(STORY_SUPPORT_GROWTH_GAUGE_HELP).toContain('クリックで詳細');
  });

  it('メーターラベルは件数に応じて案内全文を含む', () => {
    expect(buildStoryGaugeMeterLabelText(0)).toContain(STORY_SUPPORT_GROWTH_GAUGE_HELP);
    expect(buildStoryGaugeMeterLabelText(915)).toContain(STORY_SUPPORT_GROWTH_GAUGE_HELP);
    expect(buildStoryGaugeMeterLabelText(915)).toContain('915');
    expect(buildStoryGaugeMeterLabelText(915)).toContain('Esc');
  });

  it('stack aria-label は非負整数に正規化する', () => {
    expect(buildStoryUserLaneStackAriaLabel(34)).toContain('合計34件');
    expect(buildStoryUserLaneStackAriaLabel(-1)).toContain('合計0件');
    expect(buildStoryUserLaneStackAriaLabel(NaN)).toContain('合計0件');
  });
});
