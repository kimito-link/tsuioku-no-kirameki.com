// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createVenueComposeBox } from '../venueComposeBox.js';
import {
  findMxCommentInput,
  findMxSendButton,
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

describe('findMxCommentInput', () => {
  it('form に入っていない「コメントする...」の textarea を、会場の欄より先に公式として拾う', () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    root.id = 'nlsb-venue-root';
    root.append(createVenueComposeBox(async () => ({ ok: true })));
    document.body.append(root);
    const dummy = document.createElement('textarea');
    dummy.setAttribute('style', 'visibility:hidden;position:absolute;z-index:-1000;height:0');
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
    const root = document.createElement('div');
    root.id = 'nlsb-venue-root';
    root.append(createVenueComposeBox(async () => ({ ok: true })));
    document.body.append(root);
    expect(findMxCommentInput(document)).toBeNull();
    expect(findMxSendButton(document)).toBeNull();
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
});
