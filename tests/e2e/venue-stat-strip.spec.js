/**
 * 会場モードの数字の帯(2026-11-09 りんく「これを会場モードでもいれたほうが利便性たかい」)を【実ブラウザで】確かめる e2e。
 * パネルが書く数字カードの鏡(nls_stat_cards_mirror_v1)を置いて会場を開き、
 *   (1) パネルと同じ文字が出る (2) 鏡が後から変わると追従する (3) パネルが閉じて鏡が古いと薄くなり経過が「—」
 *   (4) YouTube 版の会場(yt-venue.html・保存場所が ytm: 付き)でも出る。
 */
import { test, expect } from './fixtures.js';
import { E2E_MOCK_WATCH_URL } from './constants.js';

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

/*
 * 2026-11-10 りんく「POPをひらかなくても数字がつくようにしてほしい」。
 * 横の欄(パネル)を一度も開かず、鏡(nls_stat_cards_mirror_v1)が無い状態で会場を開いても、
 * 会場が視聴ページの値から自分で数字を付ける(data-source="self")。
 */

const MOCK_LV = 'lv888888888';
const stripState = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.nlsb-stat-strip');
    if (!el) return null;
    /** @type {Record<string, string>} */
    const vals = {};
    for (const c of el.querySelectorAll('[data-stat]')) vals[c.getAttribute('data-stat')] = c.querySelector('.nlsb-stat__val').textContent;
    return { source: el.getAttribute('data-source'), stale: el.getAttribute('data-stale'), vals };
  });

test('パネルを開かなくても: 視聴ページの中の会場が自分で数字を付ける', async ({ context }) => {
  const id = await extId(context);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(E2E_MOCK_WATCH_URL, { waitUntil: 'load', timeout: 60_000 });
  // パネルは出ていない・鏡も無い(=一度も開いていない人と同じ)
  const sw = context.serviceWorkers().find((w) => w.url().includes(id));
  expect(await sw.evaluate((k) => chrome.storage.local.get(k), KEY)).toEqual({});
  await page.locator('.nlsb-toggle').click({ timeout: 30_000 });
  await expect(page.locator('.nlsb-stat-strip')).toHaveAttribute('data-source', 'self', { timeout: 20_000 });
  const st = await stripState(page);
  console.log('[stat-strip inline self]', JSON.stringify(st));
  expect(st.stale).toBe('0');
  // 「—」だけの帯ではない(視聴ページから読めた数字が1つ以上付く)
  expect(Object.values(st.vals).filter((v) => v && v !== '—').length).toBeGreaterThan(0);
  // 会場は storage の鏡を書かない(パネルと書き手を取り合わない)
  expect(await sw.evaluate((k) => chrome.storage.local.get(k), KEY)).toEqual({});
});

test('パネルを開かなくても: 別窓の会場(venue.html)が視聴タブに聞いて数字を付ける', async ({ context }) => {
  const id = await extId(context);
  const watch = await context.newPage();
  await watch.goto(E2E_MOCK_WATCH_URL, { waitUntil: 'load', timeout: 60_000 });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${id}/venue.html?lv=${MOCK_LV}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.nlsb-stat-strip')).toHaveAttribute('data-source', 'self', { timeout: 20_000 });
  const st = await stripState(page);
  console.log('[stat-strip standalone self]', JSON.stringify(st));
  expect(Object.values(st.vals).filter((v) => v && v !== '—').length).toBeGreaterThan(0);
});

/*
 * 2026-11-10 PC 実測(ニコ生): 視聴ページを開くだけで隠れた欄が鏡を1回書き、そのあと書かない。
 * 会場の帯がその「開いた瞬間の値」(記録 1 など)のまま約1分止まった。
 * 1回書いたきりの鏡は「動いている」と扱わず、会場が自分で読んだ数字をすぐ出す。
 */
test('1回書いたきりの鏡(隠れた欄)では止まらない: 会場が自分で読んだ数字に切り替わる', async ({ context }) => {
  const id = await extId(context);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(E2E_MOCK_WATCH_URL, { waitUntil: 'load', timeout: 60_000 });
  const sw = context.serviceWorkers().find((w) => w.url().includes(id));
  const frozen = mirror(Date.now(), { liveId: MOCK_LV, recordsText: '1', visitor: { text: '1', isPlaceholder: false } });
  await sw.evaluate(([k, v]) => chrome.storage.local.set({ [k]: v }), [KEY, frozen]);
  await page.locator('.nlsb-toggle').click({ timeout: 30_000 });
  await expect(page.locator('.nlsb-stat-strip')).toHaveAttribute('data-source', 'self', { timeout: 20_000 });
  const st = await stripState(page);
  console.log('[stat-strip frozen mirror]', JSON.stringify(st));
  expect(st.vals.visitor).not.toBe('1');
});
