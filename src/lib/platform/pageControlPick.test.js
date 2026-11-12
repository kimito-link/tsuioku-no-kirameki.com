// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { findPageButton, isOwnExtensionUi, queryPageControl } from './pageControlPick.js';
import { createVenueComposeBox } from '../venueComposeBox.js';

const MX_INPUT_SEL = 'textarea[placeholder*="コメント"], input[placeholder*="コメント"], form textarea, form input[type="text"]';

/** 会場の「ここから発言」(本物の部品)をページの先頭に置き、その後ろに公式の欄がある DOM */
function pageWithVenueFirst() {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  root.id = 'nlsb-venue-root';
  const box = createVenueComposeBox(async () => ({ ok: true }));
  root.append(box);
  document.body.append(root);
  const official = document.createElement('form');
  official.innerHTML = '<input type="text" placeholder="メッセージ"><button type="submit">送信</button>';
  document.body.append(official);
  return { box, official };
}

describe('pageControlPick', () => {
  it('会場の発言欄(本物の部品)は追憶の部品と分かる', () => {
    const { box, official } = pageWithVenueFirst();
    expect(isOwnExtensionUi(box.querySelector('input'))).toBe(true);
    expect(isOwnExtensionUi(box.querySelector('button'))).toBe(true);
    expect(isOwnExtensionUi(official.querySelector('input'))).toBe(false);
  });

  it('会場が先にあっても公式の入力欄とボタンを拾う(修正前は会場の欄・押せない会場のボタンを拾った)', () => {
    const { box, official } = pageWithVenueFirst();
    // 修正前の探し方では会場の部品を拾っていたことを確かめる
    expect(document.querySelector(MX_INPUT_SEL)).toBe(box.querySelector('input'));
    const input = queryPageControl(document, MX_INPUT_SEL);
    expect(input).toBe(official.querySelector('input'));
    expect(findPageButton(document, /送信/, input)).toBe(official.querySelector('button'));
    expect(findPageButton(document, /送信/)).toBe(official.querySelector('button'));
  });

  it('公式のボタンが無ければ null(会場のボタンは返さない)', () => {
    const { official } = pageWithVenueFirst();
    official.querySelector('button')?.remove();
    expect(findPageButton(document, /送信/)).toBeNull();
  });
});
