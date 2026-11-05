// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { createVenueComposeBox, venueComposeResultText } from './venueComposeBox.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('会場から発言する入力欄', () => {
  it('送れたら欄を空にして「送信しました」', async () => {
    const post = vi.fn(async () => ({ ok: true }));
    const form = createVenueComposeBox(post);
    document.body.append(form);
    const input = /** @type {HTMLInputElement} */ (form.querySelector('input'));
    input.value = '  こんにちは   みんな ';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();
    expect(post).toHaveBeenCalledWith('こんにちは みんな');
    expect(input.value).toBe('');
    expect(form.querySelector('.nlsb-compose-status')?.textContent).toBe('送信しました');
  });
  it('送れなかったら文字を残して理由を出す', async () => {
    const form = createVenueComposeBox(async () => ({ ok: false, error: 'コメント入力欄が見つかりません' }));
    const input = /** @type {HTMLInputElement} */ (form.querySelector('input'));
    input.value = 'test';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();
    expect(input.value).toBe('test');
    expect(form.querySelector('.nlsb-compose-status')?.textContent).toBe('コメント入力欄が見つかりません');
  });
  it('空なら送らない・送信ボタンは押せない', async () => {
    const post = vi.fn(async () => ({ ok: true }));
    const form = createVenueComposeBox(post);
    expect(/** @type {HTMLButtonElement} */ (form.querySelector('button')).disabled).toBe(true);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();
    expect(post).not.toHaveBeenCalled();
  });
  it('打っているキーは会場やページへ伝えない', () => {
    const form = createVenueComposeBox(async () => ({ ok: true }));
    document.body.append(form);
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    form.querySelector('input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.removeEventListener('keydown', seen);
    expect(seen).not.toHaveBeenCalled();
  });
  it('YouTube の理由コードは日本語にする・例外も一言にする', async () => {
    expect(venueComposeResultText({ ok: false, reason: 'no-chat-frame' }, (r) => (r === 'no-chat-frame' ? 'チャット欄がありません' : '')).text).toBe('チャット欄がありません');
    expect(venueComposeResultText({ ok: false, reason: 'x' }).text).toBe('送信できませんでした(x)');
    const form = createVenueComposeBox(async () => {
      throw new Error('Extension context invalidated.');
    });
    const input = /** @type {HTMLInputElement} */ (form.querySelector('input'));
    input.value = 'a';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();
    expect(form.querySelector('.nlsb-compose-status')?.textContent).toBe('Extension context invalidated.');
  });
});

describe('会場のギフトボタン', () => {
  it('公式のギフトボタンを押し、記録用の透明化を外す', async () => {
    const { openOfficialGiftPanel } = await import('./venueComposeBox.js');
    let clicked = 0;
    let removed = 0;
    const doc = /** @type {any} */ ({
      querySelector: (sel) => (sel === '[class*="gift-button"]' ? { click: () => { clicked++; } } : null),
      getElementById: (id) => (id === 'nls-stealth-gift-sidebar' ? { remove: () => { removed++; } } : null)
    });
    expect(openOfficialGiftPanel(doc)).toEqual({ ok: true });
    expect(clicked).toBe(1);
    expect(removed).toBe(1);
  });
  it('ボタンが無ければ no-button(押さない)', async () => {
    const { openOfficialGiftPanel } = await import('./venueComposeBox.js');
    const doc = /** @type {any} */ ({ querySelector: () => null, getElementById: () => null });
    expect(openOfficialGiftPanel(doc)).toEqual({ ok: false, reason: 'no-button' });
  });
  it('見つからないときの一言はボタンの名前に合わせる(YouTube はスーパーチャット)', async () => {
    const { createVenueGiftButton } = await import('./venueComposeBox.js');
    const tucks = [];
    const btn = createVenueGiftButton(async () => ({ ok: false }), { label: '💲 スーパーチャット', tuck: (on) => tucks.push(on) });
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(btn.textContent).toBe('スーパーチャットのボタンが見つかりません');
    expect(tucks).toEqual([true, false]);
  });
  it('理由の言い換えがあればそれを出す(未ログインなど)', async () => {
    const { createVenueGiftButton } = await import('./venueComposeBox.js');
    const btn = createVenueGiftButton(async () => ({ ok: false, reason: 'not-signed-in' }), {
      label: '💲 スーパーチャット',
      reasonText: (r) => (r === 'not-signed-in' ? 'ログインすると使えます' : ''),
    });
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(btn.textContent).toBe('ログインすると使えます');
  });
});
