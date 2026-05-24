/**
 * 実 type:popup ウィンドウで empty-history の下空白を観測する診断用 spec。
 * SW から chrome.windows.create({type:'popup'}) で本物の別ウィンドウを開き、
 * resizePopupWindowForState の chrome.windows.update 経路を実際に走らせる。
 *
 * 目的: 「ウィンドウ outer 高」「body/primary の実コンテンツ高」「可視末尾要素の
 * 下端」を突き合わせ、下空白(= ウィンドウ高 > コンテンツ高)が出るかを確定する。
 */

import { test, expect, dismissExtensionUsageTermsGate } from './fixtures.js';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('実別ウィンドウ empty-history: ウィンドウ高とコンテンツ高の関係を観測', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;

  // 1) まず popup ページを通常タブで開いて、その origin の IDB に履歴を 1 件入れる。
  const seed = await context.newPage();
  await seed.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await seed.evaluate(async () => {
    const DB_NAME = 'nls_broadcast_summary_v1';
    const STORE = 'samples';
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          s.createIndex('byLiveCaptured', ['liveId', 'capturedAt'], { unique: false });
          s.createIndex('byCapturedAt', 'capturedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add({
        liveId: 'lv888888888',
        capturedAt: Date.now() - 60_000,
        watchUrl: 'https://live.nicovideo.jp/watch/lv888888888',
        recording: true,
        commentStorageCount: 123,
        uniqueKnownCommenters: 20,
        giftUserCount: 3,
        peakConcurrentEstimate: 456,
        officialCommentCount: 789,
        officialViewerCount: 456,
        officialCaptureRatio: 0.8,
        broadcastTitle: 'テスト配信タイトル',
        broadcasterName: 'テスト配信者',
        viewerCountFromDom: 456
      });
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await seed.close();

  // 2) 実 popup ウィンドウを開く（active watch タブが無い → empty state に倒れる）。
  await sw.evaluate(async (url) => {
    await chrome.windows.create({
      url,
      type: 'popup',
      width: 420,
      height: 780,
      focused: false
    });
  }, popupUrl);

  // popup ページを拾う
  let popup;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    popup = context.pages().find((p) => p.url() === popupUrl);
    if (popup) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  expect(popup, 'popup page should be created').toBeTruthy();

  await dismissExtensionUsageTermsGate(popup);
  await expect(popup.locator('html.nl-empty-state')).toBeAttached({ timeout: 15_000 });
  await expect(
    popup.locator('html[data-nl-popup-content-painted="1"]')
  ).toBeAttached({ timeout: 15_000 });
  await popup.waitForTimeout(1200); // resize の chrome.windows.update を待つ

  const dims = await sw.evaluate(async (url) => {
    const wins = await chrome.windows.getAll({ populate: true });
    const base = url.replace(/[?#].*$/, '');
    const w = wins.find(
      (x) => x.type === 'popup' && (x.tabs?.[0]?.url || '').startsWith(base)
    );
    return { outerWidth: w?.width, outerHeight: w?.height, type: w?.type };
  }, popupUrl);

  const content = await popup.evaluate(() => {
    const primary = document.getElementById('nlPopupPrimary');
    const main = document.querySelector('.nl-main');
    const lanes = document.getElementById('northStarLanes');
    // 実コンテンツ下端 = nlPopupPrimary の rect bottom（empty-state では
    // .nl-main は flex:0 0 auto で content にフィットするので primary 下端が実高）。
    const primaryBottom = primary
      ? Math.round(primary.getBoundingClientRect().bottom)
      : null;
    return {
      innerHeight: window.innerHeight,
      primaryScrollHeight: primary?.scrollHeight ?? null,
      primaryBottom,
      bodyScrollHeight: document.body?.scrollHeight ?? null,
      bodyComputedHeight: getComputedStyle(document.body).height,
      mainFlex: main ? getComputedStyle(main).flex : null,
      lanesDisplay: lanes ? getComputedStyle(lanes).display : 'missing',
      rootClasses: document.documentElement.className
    };
  });

  console.log('=== REAL popup window dims ===', JSON.stringify(dims));
  console.log('=== REAL popup content ===', JSON.stringify(content, null, 2));
  const whitespace = (dims.outerHeight ?? 0) - (content.primaryBottom ?? 0);
  console.log('=== whitespace (outerHeight - primaryBottom) ===', whitespace);

  await popup.screenshot({
    path: 'test-results/popup-window-empty-history-real.png',
    fullPage: false
  });

  expect(dims.type).toBe('popup');

  // 根治確認1: live レーンは empty-state では畳まれている（白い空白の正体）。
  expect(content.lanesDisplay, '#northStarLanes は empty-state で非表示').toBe('none');

  // 根治確認2: ウィンドウが MAX(1100)に張り付いていない＝空き枠が消えた。
  // バグ時はレーンの空枠でコンテンツ ~2245px → outer=1100 だった。
  expect(
    dims.outerHeight,
    `ウィンドウ高 ${dims.outerHeight} が MAX(1100)未満＝空のレーン枠が消えた`
  ).toBeLessThan(1080);

  // 根治確認3: ウィンドウ高とコンテンツ実高の差(下空白)が小さい。
  // chrome 余裕 40px + OS 誤差を見て 120px 以内なら「大きな白い空白」は無い。
  expect(
    Math.abs(whitespace),
    `下空白(outerHeight ${dims.outerHeight} - content下端 ${content.primaryBottom} = ${whitespace})が大きすぎる`
  ).toBeLessThanOrEqual(120);
});
