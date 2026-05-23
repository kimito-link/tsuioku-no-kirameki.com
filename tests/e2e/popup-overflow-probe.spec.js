import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * 調査用（恒久 assert は緩め）: 狭幅 action popup 相当で「横にはみ出して右端が
 * 見切れている要素」を実ブラウザで検出する。会議室レビューの仮説（.nl-main の
 * overflow-x:hidden で右端クリップ）を客観データで裏取りする。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';
const KEY_KOKEN = 'nls_koken_api_contrib_lv888888888';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('overflow probe: 狭幅 popup で横はみ出し要素を検出', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  // 長い名前・多件数で溢れやすい状況を作る（貢献度ランキング）。
  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, commentsKey, kokenKey }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [commentsKey]: [{ no: 1, content: 'やあ', userId: 'u1', date: Date.now() }],
        [kokenKey]: {
          liveId: 'lv888888888',
          capturedAt: Date.now(),
          rows: [
            {
              rank: 1,
              name: 'とてもながいなまえのはいしんしゃさんでみきれるかどうか確認用',
              contribution: 1234567,
              isAnonymous: false,
              userPageUrl: 'https://www.nicovideo.jp/user/4046119'
            },
            { rank: 2, name: 'めっちゃんこ長い名前テスト', contribution: 99999, isAnonymous: false },
            { rank: 3, name: '名無し', contribution: 500, isAnonymous: true }
          ]
        }
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      commentsKey: STORAGE_COMMENTS,
      kokenKey: KEY_KOKEN
    }
  );

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const popup = await context.newPage();
  // action popup 相当の狭い viewport を強制（Chrome のドロップダウンは ~実幅）。
  await popup.setViewportSize({ width: 400, height: 580 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissExtensionUsageTermsGate(popup);
  await focusMockWatchThenReloadPopup(watch, popup);
  await popup.waitForTimeout(2500);

  // 横にはみ出している要素（scrollWidth が clientWidth を明確に超える）を列挙。
  const overflows = await popup.evaluate(() => {
    const out = [];
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.offsetParent === null && el.tagName !== 'BODY') continue; // 非表示は除外
      const over = el.scrollWidth - el.clientWidth;
      if (over > 4 && el.clientWidth > 0) {
        const cls = (el.getAttribute('class') || '').slice(0, 60);
        const cs = getComputedStyle(el);
        out.push({
          tag: el.tagName.toLowerCase(),
          cls,
          over,
          clientW: el.clientWidth,
          scrollW: el.scrollWidth,
          overflowX: cs.overflowX,
          whiteSpace: cs.whiteSpace
        });
      }
    }
    // はみ出し量が大きい順
    out.sort((a, b) => b.over - a.over);
    return out.slice(0, 25);
  });

  // 文書自体（body）が viewport を超えていないか
  const docOverflow = await popup.evaluate(() => ({
    bodyScrollW: document.body.scrollWidth,
    bodyClientW: document.body.clientWidth,
    docScrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth
  }));

  console.log('=== doc overflow ===', JSON.stringify(docOverflow));
  console.log('=== overflowing elements (top 25) ===');
  for (const o of overflows) {
    console.log(JSON.stringify(o));
  }

  await popup.screenshot({ path: 'test-results/popup-overflow-probe.png', fullPage: false });

  // 調査用なので緩い assert（popup 自体は描画されている）。
  expect(docOverflow.innerW).toBeGreaterThan(0);
});
