/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { pickCommentMutationObserverRoot } from './observerTarget.js';

describe('pickCommentMutationObserverRoot', () => {
  it('.ga-ns-comment-panel があるときその要素を返す', () => {
    document.documentElement.innerHTML = '<body></body>';
    const body = document.body;
    const panel = document.createElement('div');
    panel.className = 'ga-ns-comment-panel';
    panel.id = 'panel';
    body.appendChild(panel);
    expect(pickCommentMutationObserverRoot(document).id).toBe('panel');
  });

  it('パネルが無いとき document.documentElement を返す', () => {
    document.documentElement.innerHTML = '<body><p>x</p></body>';
    expect(pickCommentMutationObserverRoot(document)).toBe(document.documentElement);
  });

  it('Document でないと TypeError', () => {
    expect(() => pickCommentMutationObserverRoot(/** @type {any} */ (null))).toThrow(
      TypeError
    );
  });
});
