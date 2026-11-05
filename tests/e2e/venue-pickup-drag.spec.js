/**
 * PICK UP の吹き出しをドラッグで動かし、位置を覚える(v0.1.1894・りんく「ドラッグでうごかせるようにしておきたい」)を
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

test('PICK UP: ドラッグで動き、会場の外へ出ず、開き直しても同じ場所・ダブルクリックで戻る', async ({ context }) => {
  const page = await openVenue(context);
  const before = await rectOf(page);
  console.log('[pickup-drag] before', JSON.stringify(before));
  expect(before.w).toBeGreaterThan(100);

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

  // 2) 画面の外へ大きく引っ張っても会場の内側に止まる
  const m = await rectOf(page);
  await page.mouse.move(m.x + 30, m.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 10; i += 1) await page.mouse.move(m.x + 30 + 300 * i, m.y + 10 + 300 * i);
  await page.mouse.up();
  const edge = await rectOf(page);
  console.log('[pickup-drag] edge', JSON.stringify(edge));
  // ★速く動かして最初の move で吹き出しの外へ出ても、置いていかれずに付いてくる
  expect(edge.y).toBeGreaterThan(moved.y + 100);
  expect(edge.x + edge.w).toBeLessThanOrEqual(edge.L.x + edge.L.w + 1);
  expect(edge.y + edge.h + 20).toBeLessThanOrEqual(edge.L.y + edge.L.h + 1);

  // 3) 開き直しても同じ場所
  await page.reload();
  await openVenue(context, page);
  const again = await rectOf(page);
  console.log('[pickup-drag] reopened', JSON.stringify(again));
  expect(Math.abs(again.x - edge.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(again.y - edge.y)).toBeLessThanOrEqual(2);

  // 4) 小さく押しただけ(4px 未満)では動かない
  await page.mouse.move(again.x + 30, again.y + 10);
  await page.mouse.down();
  await page.mouse.move(again.x + 32, again.y + 11);
  await page.mouse.up();
  const click = await rectOf(page);
  expect(Math.abs(click.x - again.x)).toBeLessThanOrEqual(1);

  // 5) ダブルクリックで元の自動位置へ
  await page.mouse.dblclick(again.x + 30, again.y + 10);
  await page.waitForTimeout(200);
  const reset = await rectOf(page);
  console.log('[pickup-drag] reset', JSON.stringify(reset));
  expect(Math.abs(reset.x - before.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(reset.y - before.y)).toBeLessThanOrEqual(2);
  const cleared = await page.evaluate((k) => chrome.storage.local.get(k), KEY);
  expect(cleared[KEY] ?? null).toBeNull();
});
