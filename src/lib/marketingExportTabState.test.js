import { describe, it, expect } from 'vitest';
import { withMarketingExportState, isMarketingExportTabFinished } from './marketingExportTabState.js';

const base = 'chrome-extension://abc/marketing-export.html?lv=lv351735139';

describe('marketingExportTabState', () => {
  it('処理中(state なし)のタブは作り直さない', () => {
    expect(isMarketingExportTabFinished(base)).toBe(false);
  });
  it('完了・エラーのタブは作り直す(前回の完了画面のまま止まらない)', () => {
    expect(isMarketingExportTabFinished(withMarketingExportState(base, 'done'))).toBe(true);
    expect(isMarketingExportTabFinished(withMarketingExportState(base, 'error'))).toBe(true);
  });
  it('state を付けても lv は残る', () => {
    const u = new URL(withMarketingExportState(base, 'done'));
    expect(u.searchParams.get('lv')).toBe('lv351735139');
    expect(u.searchParams.get('state')).toBe('done');
  });
  it('読めない URL は作り直す側に倒す', () => {
    expect(isMarketingExportTabFinished('')).toBe(true);
  });
});
