import { test, expect } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const STORAGE_COMMENTS = 'nls_comments_lv888888888';
const LIVE_ID = 'lv888888888';

/**
 * 実際のニコ生はログイン・配信の有無で DOM が変わるため、
 * E2E はローカル静的ページ（manifest の :3456 のみ）で「記録〜storage」の経路を検証する。
 */
test.describe('拡張機能（モック watch）', () => {
  test('記録ONでモックコメントが storage に溜まる', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    expect(sw.url(), 'service worker が立ち上がる').toContain(
      'chrome-extension://'
    );

    await sw.evaluate(async (commentsKey) => {
      const payload = { nls_recording_enabled: true };
      payload[commentsKey] = [];
      await chrome.storage.local.set(payload);
    }, STORAGE_COMMENTS);

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await expect(page.locator('#e2e-comment-form')).toBeVisible();

    // v0.1.509: 記録本体は追記専用チャンク（nls_cchunk_<lv>_<seq>）＋未畳み込みテール
    //   （nls_ctail_<lv>）に分割保存される。従来の単一 main キーではなく、チャンク総数＋テール
    //   （無ければ従来 main にフォールバック）の合計で「記録が溜まったか」を検証する。
    await expect
      .poll(
        async () => {
          return sw.evaluate((lv) => {
            const idxKey = `nls_cchunk_index_${lv}`;
            const mainKey = `nls_comments_${lv}`;
            const tailKey = `nls_ctail_${lv}`;
            return new Promise((resolve) => {
              chrome.storage.local.get([idxKey, mainKey, tailKey], (r) => {
                const idx = r[idxKey];
                const tail = Array.isArray(r[tailKey]) ? r[tailKey].length : 0;
                if (idx && typeof idx === 'object' && Array.isArray(idx.seqs)) {
                  const keys = idx.seqs.map((seq) => `nls_cchunk_${lv}_${seq}`);
                  chrome.storage.local.get(keys, (cb) => {
                    let total = 0;
                    for (const k of keys) {
                      if (Array.isArray(cb[k])) total += cb[k].length;
                    }
                    resolve(total + tail);
                  });
                  return;
                }
                const arr = r[mainKey];
                resolve((Array.isArray(arr) ? arr.length : 0) + tail);
              });
            });
          }, LIVE_ID);
        },
        {
          timeout: 60_000,
          message:
            'コンテンツスクリプトがコメントをマージするまで（チャンク＋テール合計）'
        }
      )
      .toBeGreaterThanOrEqual(25);
  });
});
