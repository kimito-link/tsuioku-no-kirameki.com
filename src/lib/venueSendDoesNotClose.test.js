// @vitest-environment happy-dom
// #690 (v0.1.2179) の回帰: 会場の「ここから発言」から送ると、成功しても失敗しても
//   会場が閉じたように見えた。YouTube では送信自体は成功していた。
//   原因は共通処理 withRevealedVenueOfficialComposer が nlsb-is-tucked を付け、
//   CSS が .nlsb-stage(ヘッダーと入力欄)を visibility:hidden にしたこと。
//   js の tucked は false のままなので、右下に「🏟 会場モード」だけが出て閉じたように見える。
//   このテストはその「送信後に閉じたように見える」状態を再現条件にし、送りのあとにそれを禁ずる。
import { afterEach, describe, expect, it } from 'vitest';
import { createVenueComposeBox } from './venueComposeBox.js';
import { withRevealedVenueOfficialComposer } from './venueRevealOfficialComposer.js';
import { VENUE_COMPOSER_PASS_CLASS, VENUE_TUCK_CLASS, venueToggleShouldUntuck } from './venueTuckState.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** #690 の「送信後に会場が閉じたように見える」状態 */
function looksClosedAfterSend(root) {
  return (
    document.documentElement.classList.contains('nlsb-venue-open') &&
    !!root &&
    root.classList.contains(VENUE_TUCK_CLASS)
  );
}

function mountOpenVenue(tucked = false) {
  document.body.replaceChildren();
  document.documentElement.classList.add('nlsb-venue-open');
  const root = document.createElement('div');
  root.id = 'nlsb-venue-root';
  root.className = 'nlsb-root nlsb-full nlsb-is-open';
  if (tucked) root.classList.add(VENUE_TUCK_CLASS);
  const stage = document.createElement('section');
  stage.className = 'nlsb-stage';
  const toggle = document.createElement('button');
  toggle.className = 'nlsb-toggle';
  toggle.textContent = '🏟 会場モード';
  root.append(toggle, stage);
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.classList.remove('nlsb-venue-open');
});

describe('送信後に会場が閉じたように見える状態 (#690 回帰)', () => {
  it('しまい印が付いたままだと、開いたままなのに閉じたように見える(再現)', () => {
    const root = mountOpenVenue(true);
    expect(looksClosedAfterSend(root)).toBe(true);
    // トグルを押すと、js の tucked が false でも閉じずに戻すべき印がある
    expect(venueToggleShouldUntuck(false, root)).toBe(true);
  });

  it('送りが成功しても、その閉じたように見える状態にはならない。会場は開いたまま', async () => {
    const root = mountOpenVenue();
    const form = createVenueComposeBox(async () => ({ ok: true }));
    document.body.append(form);
    const input = /** @type {HTMLInputElement} */ (form.querySelector('input'));
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();
    expect(looksClosedAfterSend(root)).toBe(false);
    expect(document.documentElement.classList.contains('nlsb-venue-open')).toBe(true);
    expect(root.classList.contains('nlsb-is-open')).toBe(true);
    expect(root.classList.contains(VENUE_TUCK_CLASS)).toBe(false);
    expect(root.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(false);
  });

  it('入力欄なし(no-input)で失敗しても、会場は閉じたように見えない', async () => {
    const root = mountOpenVenue();
    const form = createVenueComposeBox(async () => ({ ok: false, reason: 'no-input' }));
    document.body.append(form);
    const input = /** @type {HTMLInputElement} */ (form.querySelector('input'));
    input.value = 'hello';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();
    expect(looksClosedAfterSend(root)).toBe(false);
    expect(document.documentElement.classList.contains('nlsb-venue-open')).toBe(true);
    expect(root.classList.contains(VENUE_TUCK_CLASS)).toBe(false);
    expect(root.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(false);
  });

  it('前回送りのしまい印が残っていても、次の送りのあとには残らない', async () => {
    const root = mountOpenVenue(true);
    expect(looksClosedAfterSend(root)).toBe(true);
    await withRevealedVenueOfficialComposer(document, async () => ({ ok: true }));
    expect(looksClosedAfterSend(root)).toBe(false);
    expect(document.documentElement.classList.contains('nlsb-venue-open')).toBe(true);
    expect(root.classList.contains(VENUE_TUCK_CLASS)).toBe(false);
    expect(root.classList.contains(VENUE_COMPOSER_PASS_CLASS)).toBe(false);
  });
});
