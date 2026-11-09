/**
 * 会場モードの数字の帯(2026-11-09 りんく「これを会場モードでもいれたほうが利便性たかい」)を【実ブラウザで】確かめる e2e。
 * パネルが書く数字カードの鏡(nls_stat_cards_mirror_v1)を置いて会場を開き、
 *   (1) パネルと同じ文字が出る (2) 鏡が後から変わると追従する (3) パネルが閉じて鏡が古いと薄くなり経過が「—」
 *   (4) YouTube 版の会場(yt-venue.html・保存場所が ytm: 付き)でも出る。
 */
import { test, expect } from './fixtures.js';

const LV = 'lv348888888';
const KEY = 'nls_stat_cards_mirror_v1';

function mirror(capturedAt, over = {}) {
  return {
    liveId: LV,
    capturedAt,
    recordsText: '81',
    recordsIsPlaceholder: false,
    recordsOfficialLine: '',
    recordsBreakdownLine: '',
    recordsIngestLine: '',
    concurrent: { estText: '108', estIsPlaceholder: false, subText: '直接値' },
    visitor: { text: '352', isPlaceholder: false },
    official: {
      summaryText: '',
      viewers: { text: '1,234', isPlaceholder: false },
      comments: { text: '567', isPlaceholder: false },
      streamAge: { text: '2時間36分', isPlaceholder: false },
      adPts: { text: '300', isPlaceholder: false },
      giftPts: { text: '1,200', isPlaceholder: false },
      eventGiftPts: { text: '', isPlaceholder: true },
      eventRank: { text: '', isPlaceholder: true },
      eventTitle: { text: '', isPlaceholder: true }
    },
    ...over
  };
}

async function extId(context) {
  let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return new URL(sw.url()).hostname;
}

const valOf = (page, key) => page.locator(`.nlsb-stat-strip [data-stat="${key}"] .nlsb-stat__val`);

test('会場の数字の帯: パネルと同じ数字が出て、変われば追従し、古くなれば薄く・経過は「—」', async ({ context }) => {
  const id = await extId(context);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${id}/venue.html?lv=${LV}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, v]) => chrome.storage.local.set({ [k]: v }), [KEY, mirror(Date.now())]);
  await page.reload({ waitUntil: 'domcontentloaded' });

  const strip = page.locator('.nlsb-stat-strip');
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await expect(valOf(page, 'records')).toHaveText('81');
  await expect(valOf(page, 'concurrent')).toHaveText('108');
  await expect(valOf(page, 'visitor')).toHaveText('352');
  await expect(valOf(page, 'comments')).toHaveText('567');
  await expect(valOf(page, 'streamAge')).toHaveText('2時間36分');
  await expect(strip).toHaveAttribute('data-source', 'mirror');
  // 帯はヘッダーの中に収まる(画面の外へはみ出さない)
  const box = await strip.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1280);

  // (2) パネルが新しい値を書いたら追従(読み直しなし=onChanged)
  await page.evaluate(([k, v]) => chrome.storage.local.set({ [k]: v }), [KEY, mirror(Date.now(), { recordsText: '82', concurrent: { estText: '110', estIsPlaceholder: false, subText: '人' } })]);
  await expect(valOf(page, 'records')).toHaveText('82');
  await expect(valOf(page, 'concurrent')).toHaveText('110');

  // (3) パネルが閉じた(鏡が2分前のまま)
  await page.evaluate(([k, v]) => chrome.storage.local.set({ [k]: v }), [KEY, mirror(Date.now() - 120_000)]);
  await expect(strip).toHaveAttribute('data-stale', '1');
  await expect(valOf(page, 'streamAge')).toHaveText('—');
  await expect(valOf(page, 'concurrent')).toHaveText('108');

  // (別の配信の鏡は出さない)
  await page.evaluate(([k, v]) => chrome.storage.local.set({ [k]: v }), [KEY, mirror(Date.now(), { liveId: 'lv1' })]);
  await expect(valOf(page, 'concurrent')).toHaveText('—');
});

test('YouTube 版の会場(yt-venue.html)でも数字の帯が出る(保存場所は ytm: 付き)', async ({ context }) => {
  const id = await extId(context);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${id}/status.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, v]) => chrome.storage.local.set({ [k]: v }), [`ytm:${KEY}`, mirror(Date.now(), { recordsText: '42', official: null })]);
  await page.goto(`chrome-extension://${id}/yt-venue.html?lv=${LV}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.nlsb-stat-strip')).toBeVisible({ timeout: 30_000 });
  await expect(valOf(page, 'records')).toHaveText('42');
  await expect(valOf(page, 'concurrent')).toHaveText('108');
  await expect(valOf(page, 'streamAge')).toHaveText('—');
});
