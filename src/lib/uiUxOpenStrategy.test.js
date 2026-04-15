import { describe, it, expect } from 'vitest';
import { resolveToolbarPopupIntent } from './uiUxOpenStrategy.js';

describe('resolveToolbarPopupIntent（フェーズ0: ツールバー押下の意図）', () => {
  it('always_open_popup ならインラインが見えていても別窓を開く', () => {
    expect(
      resolveToolbarPopupIntent('always_open_popup', {
        inlineHostVisible: true
      })
    ).toBe('open_toolbar_popup');
  });

  it('prefer_focus_inline でインラインが見えているなら前面はインライン', () => {
    expect(
      resolveToolbarPopupIntent('prefer_focus_inline', {
        inlineHostVisible: true
      })
    ).toBe('focus_inline_host');
  });

  it('prefer_focus_inline でもインラインが無いなら別窓', () => {
    expect(
      resolveToolbarPopupIntent('prefer_focus_inline', {
        inlineHostVisible: false
      })
    ).toBe('open_toolbar_popup');
  });

  it('未知の policy は安全側（別窓）に倒す', () => {
    expect(
      resolveToolbarPopupIntent('unknown_policy', { inlineHostVisible: true })
    ).toBe('open_toolbar_popup');
  });
});
