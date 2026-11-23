// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createVenueComposeBox } from '../venueComposeBox.js';
import {
  describeMxCommentInputLookup,
  findMxCommentComposerToReveal,
  findMxCommentInput,
  findMxSendButton,
  isMxCommentPromptOnly,
  isMxDummyAutosizeField,
  revealMxOfficialComposer,
} from './mxCommentInput.js';

function officialMixchComposer() {
  const wrap = document.createElement('div');
  wrap.className = 'column right';
  wrap.innerHTML =
    '<div class="e10cxjj00"><div class="textarea-wrapper"><textarea class="css-0 ehsyv870" placeholder="コメントする..."></textarea></div><button type="button" class="submit-btn" disabled>送信</button></div>';
  return wrap;
}

function appendVenue() {
  const root = document.createElement('div');
  root.id = 'nlsb-venue-root';
  root.append(createVenueComposeBox(async () => ({ ok: true })));
  document.body.append(root);
  return root;
}

describe('findMxCommentInput', () => {
  it('form に入っていない「コメントする...」の textarea を、会場の欄より先に公式として拾う', () => {
    document.body.innerHTML = '';
    appendVenue();
    const dummy = document.createElement('textarea');
    dummy.setAttribute('style', 'visibility:hidden;position:absolute;z-index:-1000;height:0');
    dummy.setAttribute('aria-hidden', 'true');
    dummy.setAttribute('tabindex', '-1');
    document.body.append(dummy);
    const official = officialMixchComposer();
    document.body.append(official);
    const input = official.querySelector('textarea');
    expect(isMxDummyAutosizeField(dummy)).toBe(true);
    expect(findMxCommentInput(document)).toBe(input);
    expect(findMxSendButton(document, input)).toBe(official.querySelector('button.submit-btn'));
  });

  it('公式の欄が無いときは会場の入力を返さない', () => {
    document.body.innerHTML = '';
    appendVenue();
    expect(findMxCommentInput(document)).toBeNull();
    expect(findMxSendButton(document)).toBeNull();
  });

  it('placeholder が無くても .textarea-wrapper / .e10cxjj00 の中の textarea を拾う', () => {
    document.body.innerHTML = '';
    appendVenue();
    const wrap = document.createElement('div');
    wrap.className = 'e5x5d221';
    wrap.innerHTML =
      '<div class="e10cxjj00"><div class="textarea-wrapper simplebar-scrollable"><div class="simplebar-content"><textarea class="css-0 ehsyv870"></textarea></div></div><button type="button" class="submit-btn">送信</button></div>';
    document.body.append(wrap);
    const input = wrap.querySelector('textarea');
    expect(findMxCommentInput(document)).toBe(input);
  });

  it('open shadow の中の公式 textarea も拾う', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const official = officialMixchComposer();
    shadow.append(official);
    expect(findMxCommentInput(document)).toBe(official.querySelector('textarea'));
  });

  it('「コメントするにはログインしてください」は入力欄ではない', () => {
    document.body.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'css-8u7ih1 e5x5d221';
    box.innerHTML = '<div class="css-d43e5r e5x5d220">コメントするにはログインしてください</div>';
    document.body.append(box);
    expect(isMxCommentPromptOnly(box)).toBe(true);
    expect(findMxCommentInput(document)).toBeNull();
    expect(findMxCommentComposerToReveal(document)).toBeNull();
  });

  it('ギフトの「送信する」は公式のコメント送信にしない', () => {
    document.body.innerHTML = '';
    const official = officialMixchComposer();
    document.body.append(official);
    const gift = document.createElement('div');
    gift.innerHTML =
      '<div class="gift-menu-header"></div><div id="tab-boxes"><button type="button">送信する</button></div>';
    document.body.append(gift);
    const input = official.querySelector('textarea');
    const btn = findMxSendButton(document, input);
    expect(btn).toBe(official.querySelector('button.submit-btn'));
    expect(btn && btn.textContent).toBe('送信');
  });

  it('ページの検索欄は公式のコメント欄として拾わない', () => {
    document.body.innerHTML = '';
    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = '検索';
    document.body.append(search);
    expect(findMxCommentInput(document)).toBeNull();
    document.body.append(officialMixchComposer());
    expect(findMxCommentInput(document)).toBe(document.querySelector('.ehsyv870, .textarea-wrapper textarea'));
  });

  it('失敗記録用の概要は入力値を含まない', () => {
    document.body.innerHTML = '';
    document.body.append(officialMixchComposer());
    const snap = describeMxCommentInputLookup(document);
    expect(snap.textareas).toBeGreaterThanOrEqual(1);
    expect(snap.placeholders).toContain('コメントする...');
    expect(JSON.stringify(snap)).not.toMatch(/こんにちわ|secret|password/i);
  });
});

describe('revealMxOfficialComposer', () => {
  it('会場が開いているときだけ nlsb-is-tucked を付け、戻すと外れる', () => {
    document.body.innerHTML = '';
    document.documentElement.classList.add('nlsb-venue-open');
    const root = document.createElement('div');
    root.id = 'nlsb-venue-root';
    document.body.append(root);
    const restore = revealMxOfficialComposer(document);
    expect(root.classList.contains('nlsb-is-tucked')).toBe(true);
    restore();
    expect(root.classList.contains('nlsb-is-tucked')).toBe(false);
    document.documentElement.classList.remove('nlsb-venue-open');
  });

  it('会場が閉じているときは何もしない', () => {
    document.body.innerHTML = '';
    document.documentElement.classList.remove('nlsb-venue-open');
    const root = document.createElement('div');
    root.id = 'nlsb-venue-root';
    document.body.append(root);
    const restore = revealMxOfficialComposer(document);
    expect(root.classList.contains('nlsb-is-tucked')).toBe(false);
    restore();
  });

  it('前回の失敗で残った nlsb-is-tucked も、戻すと外れる', () => {
    document.body.innerHTML = '';
    document.documentElement.classList.add('nlsb-venue-open');
    const root = document.createElement('div');
    root.id = 'nlsb-venue-root';
    root.classList.add('nlsb-is-tucked');
    document.body.append(root);
    const restore = revealMxOfficialComposer(document);
    expect(root.classList.contains('nlsb-is-tucked')).toBe(true);
    restore();
    expect(root.classList.contains('nlsb-is-tucked')).toBe(false);
    document.documentElement.classList.remove('nlsb-venue-open');
  });
});
