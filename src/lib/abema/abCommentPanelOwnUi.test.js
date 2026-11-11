// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { listAbCommentControls } from './abCommentPanel.js';

describe('コメント欄を開くとき、拡張自身の会場のボタンは押さない', () => {
  it('会場の「✍ しまう」「💬 コメビュ」は候補に入らない(2026-11-11 PC: 会場が最初から畳まれていた)', () => {
    document.body.innerHTML = `
      <div id="nlsb-venue-root" class="nlsb-root nlsb-full">
        <button type="button" class="nlsb-comeview-btn" title="コメントを打つあいだ会場をしまいます">✍ しまう</button>
        <button type="button" class="nlsb-comeview-btn" title="読み上げ付きコメントビューア(別ウィンドウ)を開く">💬 コメビュ</button>
      </div>
      <div class="com-tv-LinearFooter">
        <button type="button" class="com-tv-LinearFooterCommentButton" aria-label="コメント">コメント</button>
      </div>`;
    for (const el of document.querySelectorAll('button')) {
      el.getBoundingClientRect = () => /** @type {DOMRect} */ ({ width: 40, height: 20 });
    }
    const picked = listAbCommentControls(document);
    expect(picked.length).toBeGreaterThan(0);
    for (const c of picked) {
      expect(c.el.closest('#nlsb-venue-root')).toBe(null);
    }
  });
});
