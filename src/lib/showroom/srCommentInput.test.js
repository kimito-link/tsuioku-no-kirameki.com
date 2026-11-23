// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { findSrCommentInput, findSrSendButton } from './srCommentInput.js';

describe('findSrCommentInput / findSrSendButton', () => {
  it('会場の入力と送信は拾わず、見えている公式の欄を優先する', () => {
    document.body.innerHTML = `
      <div id="nlsb-venue-root">
        <form class="nlsb-compose"><input type="text" placeholder="ここから発言" class="nlsb-compose-input"><button type="submit">送信</button></form>
      </div>
      <div class="st-comment">
        <input placeholder="コメントを投稿" style="position:absolute;left:-9999px;width:0;height:0" id="hidden-clone">
        <input placeholder="コメントを投稿" id="official">
        <button type="submit" class="st-comment__button">投稿</button>
      </div>
    `;
    const official = document.getElementById('official');
    official.getClientRects = () => [{ width: 120, height: 24 }];
    document.getElementById('hidden-clone').getClientRects = () => [];
    const input = findSrCommentInput(document);
    expect(input).toBe(official);
    const btn = findSrSendButton(document, input);
    expect(btn?.className).toContain('st-comment__button');
  });
});
