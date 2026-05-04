/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findCommentPanelAssetLauncherButton,
  resolveCommentPanelAssetSearchScope,
  scoreCommentPanelAssetLauncher,
  isVisibleAssetLauncherCandidate
} from './nicoCommentPanelAssetLauncher.js';

function markVisible(root) {
  for (const el of root.querySelectorAll('*')) {
    Object.defineProperty(el, 'getClientRects', {
      configurable: true,
      value: () => [{ width: 40, height: 40 }]
    });
  }
}

describe('nicoCommentPanelAssetLauncher', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('投げボタンが form の外（コメントパネル内）でも拾える', () => {
    document.body.innerHTML = `
      <div class="ga-ns-comment-panel">
        <form id="f">
          <textarea id="ed"></textarea>
          <button type="submit" aria-label="コメントを送信" id="send">送信</button>
        </form>
        <div class="toolbar">
          <button type="button" aria-label="投げる" id="nage">投げ</button>
        </div>
      </div>
    `;
    markVisible(document.body);
    const editor = /** @type {HTMLElement} */ (document.getElementById('ed'));
    const scope = resolveCommentPanelAssetSearchScope(editor);
    const hit = findCommentPanelAssetLauncherButton(scope, editor);
    expect(hit?.id).toBe('nage');
  });

  it('ギフト系 aria-label のボタンを優先する', () => {
    document.body.innerHTML = `
      <div class="comment-panel">
        <textarea id="ed"></textarea>
        <button type="button" aria-label="ギフトを贈る" id="gift"></button>
        <button type="submit" aria-label="コメントを送信" id="send"></button>
      </div>
    `;
    markVisible(document.body);
    const editor = /** @type {HTMLElement} */ (document.getElementById('ed'));
    const panel = /** @type {HTMLElement} */ (document.querySelector('.comment-panel'));
    const hit = findCommentPanelAssetLauncherButton(panel, editor);
    expect(hit?.id).toBe('gift');
  });

  it('送信ボタンは asset 起動として選ばない', () => {
    document.body.innerHTML = `
      <div class="comment-panel">
        <textarea id="ed"></textarea>
        <button type="button" id="send" aria-label="コメントを送信">送信</button>
      </div>
    `;
    markVisible(document.body);
    const editor = /** @type {HTMLElement} */ (document.getElementById('ed'));
    const panel = /** @type {HTMLElement} */ (document.querySelector('.comment-panel'));
    expect(findCommentPanelAssetLauncherButton(panel, editor)).toBeNull();
  });

  it('data-testid に gift があれば拾う', () => {
    document.body.innerHTML = `
      <form id="f">
        <textarea id="ed" name="comment"></textarea>
        <button type="button" data-testid="open-gift-panel" id="g"></button>
      </form>
    `;
    markVisible(document.body);
    const editor = /** @type {HTMLElement} */ (document.getElementById('ed'));
    const form = /** @type {HTMLElement} */ (document.getElementById('f'));
    expect(findCommentPanelAssetLauncherButton(form, editor)?.id).toBe('g');
  });

  it('scoreCommentPanelAssetLauncher: 同一 form なら加点', () => {
    document.body.innerHTML = `
      <form id="f"><textarea id="ed"></textarea><button type="button" id="b" aria-label="アイテム">A</button></form>
    `;
    markVisible(document.body);
    const ed = /** @type {HTMLElement} */ (document.getElementById('ed'));
    const b = /** @type {HTMLElement} */ (document.getElementById('b'));
    expect(scoreCommentPanelAssetLauncher(b, ed)).toBeGreaterThanOrEqual(80);
  });

  it('isVisibleAssetLauncherCandidate: display none は false', () => {
    document.body.innerHTML = '<button type="button" id="x" style="display:none">x</button>';
    const b = /** @type {HTMLElement} */ (document.getElementById('x'));
    expect(isVisibleAssetLauncherCandidate(b)).toBe(false);
  });
});
