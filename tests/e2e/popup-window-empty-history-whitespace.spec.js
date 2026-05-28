/**
 * v0.1.357: 別ウィンドウ(standalone popup window=html.nl-popup-window)で
 * 「配信なし + 過去の応援履歴あり(empty-history)」のとき、コメントのグリッドは
 * 上半分に出るのに下半分が大きな白い空白になる退行を実機再現＋根治確認する。
 *
 * 真因(2 過去修正の競合):
 *  - v0.1.73: resizePopupWindowForState が nlPopupPrimary.scrollHeight を測って
 *    ウィンドウをその高さにリサイズする。
 *  - v0.1.306: 下空白対策で html.nl-popup-window body を 100vh に開放した。
 *  → 100vh で body→.nl-main→nlPopupPrimary がウィンドウ全高に伸び、直後に測る
 *    scrollHeight が「実コンテンツ高」でなく「今のウィンドウ高」を返す。
 *  → computePopupWindowTargetHeight が「今の高さ + 40」を返し、縮まらず空白が残る。
 *
 * e2e では Chrome に実 type:popup を開かせるのが難しいため、popup ページを
 * 通常タブで開き html.nl-popup-window を付与 + 縦長 viewport で standalone を再現。
 * resizePopupWindowForState の chrome.windows.update 分岐は走らない(win.type!=='popup')が、
 * 「測定値が実コンテンツ高に一致するか(=ウィンドウ全高でない)」を直接検証できる。
 */

import { test, expect, dismissExtensionUsageTermsGate } from './fixtures.js';

const POPUP_WIDTH = 420;
// 別ウィンドウ相当の縦長 viewport。バグ時は scrollHeight がこの値に貼り付く。
const TALL_VIEWPORT_HEIGHT = 820;

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('別ウィンドウ empty-history: nlPopupPrimary の実測高がウィンドウ全高に貼り付かない', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  // 過去の応援履歴(broadcast summary)を IDB に 1 件入れて empty-history を成立させる。
  // popup 内で書く(IDB は origin 単位なので popup ページの origin に書く必要がある)。
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  const seedPage = await context.newPage();
  await seedPage.setViewportSize({ width: POPUP_WIDTH, height: TALL_VIEWPORT_HEIGHT });
  await seedPage.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await seedPage.evaluate(async () => {
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
  await seedPage.close();

  // 本番の popup を別タブで開き直し(IDB に履歴がある状態で初期化させる)。
  const popup = await context.newPage();
  await popup.setViewportSize({ width: POPUP_WIDTH, height: TALL_VIEWPORT_HEIGHT });
  await popup.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  // standalone window 文脈を再現(本番は resizePopupWindowForState が付与)。
  await popup.evaluate(() => {
    const root = document.documentElement;
    root.classList.add('nl-popup-window');
    // 本番同様、ウィンドウ実内寸を hint として CSS 変数に焼く。
    root.style.setProperty('--nl-pop-height', `${window.innerHeight}px`);
  });
  await dismissExtensionUsageTermsGate(popup);

  // empty-state(履歴あり)に倒れ、content がペイントされるまで待つ。
  await expect(popup.locator('html.nl-empty-state')).toBeAttached({ timeout: 15_000 });
  await expect(
    popup.locator('html[data-nl-popup-content-painted="1"]')
  ).toBeAttached({ timeout: 15_000 });
  // class が reload 等で落ちる可能性に備え付け直す。
  await popup.evaluate(() => {
    document.documentElement.classList.add('nl-popup-window');
    document.documentElement.style.setProperty(
      '--nl-pop-height',
      `${window.innerHeight}px`
    );
  });
  await popup.waitForTimeout(500);

  const probe = await popup.evaluate(() => {
    const primary = document.getElementById('nlPopupPrimary');
    const main = document.querySelector('.nl-main');
    const lastVisibleBottom = () => {
      // empty-history で可視な末尾要素の下端(実コンテンツ高の目安)。
      const candidates = [
        '#liveStatCards',
        '#lastBroadcastActions',
        '#nlPopupSettings',
        '.nl-powered-by'
      ];
      let maxBottom = 0;
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          const b = el.getBoundingClientRect().bottom;
          if (b > maxBottom) maxBottom = b;
        }
      }
      return maxBottom;
    };
    const lanes = document.getElementById('northStarLanes');
    const trio = document.getElementById('northStarCharaTrio');
    const cards = document.getElementById('liveStatCards');
    return {
      viewportHeight: window.innerHeight,
      primaryScrollHeight: primary?.scrollHeight ?? null,
      mainFlex: main ? getComputedStyle(main).flex : null,
      bodyScrollHeight: document.body?.scrollHeight ?? null,
      contentBottom: lastVisibleBottom(),
      rootClasses: document.documentElement.className,
      // 真因: empty-state で live ランキングレーンが空のまま ~1337px 確保していた。
      lanesDisplay: lanes ? getComputedStyle(lanes).display : 'missing',
      lanesHeight: lanes ? Math.round(lanes.getBoundingClientRect().height) : null,
      trioDisplay: trio ? getComputedStyle(trio).display : 'missing',
      // 前回サマリの stat cards 自体は残ること(空白対策で消しすぎない)。
      cardsVisible: cards ? cards.offsetParent !== null : false
    };
  });

  console.log('=== empty-history whitespace probe ===', JSON.stringify(probe, null, 2));

  await popup.screenshot({
    path: 'test-results/popup-window-empty-history-whitespace.png',
    fullPage: false
  });

  // 前提: empty-history で content が実際に存在する(0 ではない)。
  expect(probe.contentBottom).toBeGreaterThan(200);

  // 核心(根治): 北極星 live レーンとキャラ三連は empty-state では畳まれている。
  // これが ~1337px の「空のプレースホルダ枠」=下半分の白い空白の正体だった。
  expect(
    probe.lanesDisplay,
    `#northStarLanes は empty-state では display:none であるべき(実測 ${probe.lanesHeight}px の空き枠が白い空白の原因)`
  ).toBe('none');
  expect(probe.trioDisplay, '#northStarCharaTrio も empty-state では非表示').toBe(
    'none'
  );

  // 前回サマリの stat cards 自体は残す(消しすぎ退行を防ぐ)。
  expect(probe.cardsVisible, '前回サマリの stat cards は empty-history で残る').toBe(
    true
  );

  // レーンを畳んだので content は劇的に縮む(バグ時 ~2245px → ~900px)。
  // ウィンドウ MAX(1100)に達するほどの空き枠が無くなったことを担保。
  expect(
    probe.primaryScrollHeight,
    `レーンを畳めば content は大幅縮小するはず(実測 ${probe.primaryScrollHeight}px)`
  ).toBeLessThan(1300);
});
