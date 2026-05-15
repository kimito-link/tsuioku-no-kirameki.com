import { describe, expect, it } from 'vitest';
import { shouldRevealInlineIframeAfterSameSrc } from './inlinePopupIframeVisibilityPolicy.js';

describe('shouldRevealInlineIframeAfterSameSrc', () => {
  it('host が display:none なら再表示しない', () => {
    expect(
      shouldRevealInlineIframeAfterSameSrc({
        hostDisplay: 'none',
        hostVisibility: 'visible',
        iframeDocReadyState: 'complete'
      })
    ).toEqual({ shouldReveal: false });
  });

  it('host が visibility:hidden なら再表示しない', () => {
    expect(
      shouldRevealInlineIframeAfterSameSrc({
        hostDisplay: 'block',
        hostVisibility: 'hidden',
        iframeDocReadyState: 'complete'
      })
    ).toEqual({ shouldReveal: false });
  });

  it('host が見えていて iframe が complete なら再表示する', () => {
    expect(
      shouldRevealInlineIframeAfterSameSrc({
        hostDisplay: 'block',
        hostVisibility: 'visible',
        iframeDocReadyState: 'complete'
      })
    ).toEqual({ shouldReveal: true });
  });

  it('host が見えていて iframe が未完了なら再表示しない（load／タイマー待ち）', () => {
    expect(
      shouldRevealInlineIframeAfterSameSrc({
        hostDisplay: 'block',
        hostVisibility: 'visible',
        iframeDocReadyState: 'loading'
      })
    ).toEqual({ shouldReveal: false });
  });

  it('iframe 状態が取れないときは再表示しない', () => {
    expect(
      shouldRevealInlineIframeAfterSameSrc({
        hostDisplay: 'block',
        hostVisibility: 'visible',
        iframeDocReadyState: null
      })
    ).toEqual({ shouldReveal: false });
  });
});
