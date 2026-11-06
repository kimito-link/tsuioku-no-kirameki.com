/**
 * PICK UP の吹き出しをドラッグで動かし、位置を覚える(v0.1.1899・りんく「ドラッグでうごかせるようにしておきたい」)を
 * 【実ブラウザで】確かめる e2e。マウスで実際に引っ張り、(1)動く (2)会場の外へ出ない (3)開き直しても同じ場所 (4)ダブルクリックで戻る。
 */
import { test, expect } from './fixtures.js';

const KEY = 'nls_venue_pickup_pos_v1';

async function openVenue(context, page) {
  let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  const extensionId = new URL(sw.url()).hostname;
  const p = page || (await context.newPage());
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto(`chrome-extension://${extensionId}/venue.html?lv=lv348888888`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await p.waitForSelector('.nlsb-pickup', { state: 'attached', timeout: 30_000 });
  // コメントが無い会場では吹き出しは隠れている。中身を入れて出す(位置合わせは resize で走る)。
  await p.evaluate(() => {
    const el = /** @type {HTMLElement} */ (document.querySelector('.nlsb-pickup'));
    el.removeAttribute('data-empty');
    el.querySelector('.nlsb-pickup__body').textContent = 'ドラッグ試験のコメント';
    window.dispatchEvent(new Event('resize'));
  });
  await p.waitForTimeout(300);
  return p;
}

const rectOf = (page) => page.evaluate(() => {
  const r = document.querySelector('.nlsb-pickup').getBoundingClientRect();
  const L = document.querySelector('.nlsb-stage-layout').getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, L: { x: L.left, y: L.top, w: L.width, h: L.height } };
});

test('PICK UP: つまみと札が出て、ドラッグで動き、窓の外へ出ず、会場の上へも行け、開き直しても同じ場所・ダブルクリックで戻る', async ({ context }) => {
  const page = await openVenue(context);
  const before = await rectOf(page);
  console.log('[pickup-drag] before', JSON.stringify(before));
  expect(before.w).toBeGreaterThan(100);
  // 0) 「ドラッグで動かせます」が分かる: つまみが見え、触れると札が出る
  await expect(page.locator('.nlsb-pickup__grip')).toBeVisible();
  await page.mouse.move(before.x + 30, before.y + 10);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.nlsb-pickup__hint')).opacity)).toBe('1');

  // 1) 右下へ 100,250 引っ張る(幅 860 の吹き出しは横に動ける幅が狭い)
  const sx = before.x + 30; const sy = before.y + before.h / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(sx + 10 * i, sy + 25 * i);
  await page.mouse.up();
  const moved = await rectOf(page);
  console.log('[pickup-drag] moved', JSON.stringify(moved));
  expect(Math.round(moved.x - before.x)).toBeGreaterThanOrEqual(95);
  expect(Math.round(moved.y - before.y)).toBeGreaterThanOrEqual(240);
  const saved = await page.evaluate((k) => chrome.storage.local.get(k), KEY);
  console.log('[pickup-drag] saved', JSON.stringify(saved));
  expect(saved[KEY]).toBeTruthy();

  // 2) 画面の外へ大きく引っ張っても窓の内側に止まる(venue.html では会場≒窓)
  const m = await rectOf(page);
  await page.mouse.move(m.x + 30, m.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(m.x + 30 + 300 * i, m.y + 10 + 300 * i);
  await page.mouse.up();
  const edge = await rectOf(page);
  console.log('[pickup-drag] edge', JSON.stringify(edge));
  // ★速く動かして最初の move で吹き出しの外へ出ても、置いていかれずに付いてくる
  expect(edge.y).toBeGreaterThan(moved.y + 100);
  expect(Math.round(edge.x + edge.w)).toBe(1280); // 窓の右端
  expect(Math.round(edge.y + edge.h + 20)).toBe(800); // 尻尾まで窓の下端

  // 2b) 会場の上端より上(窓の上端)まで持っていける
  const e2 = await rectOf(page);
  await page.mouse.move(e2.x + 30, e2.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(e2.x + 30, e2.y + 10 - 200 * i);
  await page.mouse.up();
  const top = await rectOf(page);
  console.log('[pickup-drag] top', JSON.stringify(top));
  expect(top.y).toBeLessThan(top.L.y);
  expect(Math.round(top.y)).toBe(0);

  // 3) 開き直しても同じ場所
  await page.reload();
  await openVenue(context, page);
  const again = await rectOf(page);
  console.log('[pickup-drag] reopened', JSON.stringify(again));
  expect(Math.abs(again.x - top.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(again.y - top.y)).toBeLessThanOrEqual(2);

  // 4) 小さく押しただけ(4px 未満)では動かない
  await page.mouse.move(again.x + 30, again.y + 30);
  await page.mouse.down();
  await page.mouse.move(again.x + 32, again.y + 31);
  await page.mouse.up();
  const click = await rectOf(page);
  expect(Math.abs(click.x - again.x)).toBeLessThanOrEqual(1);

  // 5) ダブルクリックで元の自動位置へ
  await page.mouse.dblclick(again.x + 30, again.y + 30);
  await page.waitForTimeout(200);
  const reset = await rectOf(page);
  console.log('[pickup-drag] reset', JSON.stringify(reset));
  expect(Math.abs(reset.x - before.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(reset.y - before.y)).toBeLessThanOrEqual(2);
  const cleared = await page.evaluate((k) => chrome.storage.local.get(k), KEY);
  expect(cleared[KEY] ?? null).toBeNull();
});

test('PICK UP: 顔か名前のクリックでその人の発言パネルが開き、ドラッグでは開かない(v0.1.1900)', async ({ context }) => {
  const page = await openVenue(context);
  await page.evaluate(() => {
    const el = /** @type {HTMLElement} */ (document.querySelector('.nlsb-pickup'));
    el.dataset.nlPickupUid = '12345678';
    el.dataset.nlPickupName = 'テストさん';
    const meta = el.querySelector('.nlsb-pickup__meta');
    meta.textContent = 'テストさん ・ ID:12345678';
    meta.setAttribute('href', 'https://www.nicovideo.jp/user/12345678');
    window.dispatchEvent(new Event('resize'));
  });
  const panelOpen = () => page.evaluate(() => {
    const p = document.querySelector('.nlsb-speech-panel');
    return !!p && !p.hidden;
  });
  const metaBox = await page.locator('.nlsb-pickup__meta').boundingBox();
  // 名前から始めてドラッグ → 動くがパネルは開かない・新しいタブも開かない
  const pagesBefore = context.pages().length;
  await page.mouse.move(metaBox.x + 10, metaBox.y + 5);
  await page.mouse.down();
  for (let i = 1; i <= 5; i += 1) await page.mouse.move(metaBox.x + 10, metaBox.y + 5 + 30 * i);
  await page.mouse.up();
  await page.waitForTimeout(200);
  expect(await panelOpen()).toBe(false);
  expect(context.pages().length).toBe(pagesBefore);
  // 動かさずに名前をクリック → 発言パネルが開き、見出しにその人の名前
  const meta2 = await page.locator('.nlsb-pickup__meta').boundingBox();
  await page.mouse.click(meta2.x + 10, meta2.y + 5);
  await expect.poll(panelOpen).toBe(true);
  await expect(page.locator('.nlsb-speech-panel')).toContainText('テストさん');
  expect(context.pages().length).toBe(pagesBefore);
});
