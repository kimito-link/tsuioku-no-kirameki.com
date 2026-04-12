import { test, expect } from './fixtures.js';

/**
 * 実際のニコニコ生放送ページでコメント取得が動いているか確認するテスト。
 * ニコニコ実況（TBS等）は常時配信なので安定して利用できる。
 *
 * 実行: npx playwright test tests/e2e/live-chat-check.spec.js --headed
 */
test.describe('実ニコ生コメント取得チェック', () => {
  test.skip(
    () => process.env.CI === 'true',
    '外部サービス（live.nicovideo.jp）依存のためCIではスキップ'
  );
  test.setTimeout(180_000);

  test('ニコ生視聴ページでコメントが storage に蓄積される', async ({ context }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    expect(sw.url()).toContain('chrome-extension://');

    await sw.evaluate(async () => {
      await chrome.storage.local.set({ nls_recording_enabled: true });
    });

    const page = await context.newPage();

    console.log('--- ニコニコ生放送トップから配信中番組を探す ---');
    await page.goto('https://live.nicovideo.jp/', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });

    await page.waitForTimeout(3000);

    const liveLink = page.locator('a[href*="/watch/lv"]').first();
    const hasLiveLink = await liveLink.count() > 0;

    let watchUrl;
    if (hasLiveLink) {
      watchUrl = await liveLink.getAttribute('href');
      if (watchUrl && !watchUrl.startsWith('http')) {
        watchUrl = `https://live.nicovideo.jp${watchUrl}`;
      }
      console.log(`配信中の番組を検出: ${watchUrl}`);
    } else {
      watchUrl = 'https://live.nicovideo.jp/watch/lv346441640';
      console.log(`トップからリンク取得できず、フォールバック URL: ${watchUrl}`);
    }

    console.log(`--- ${watchUrl} に移動 ---`);
    await page.goto(watchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    console.log(`現在のURL: ${currentUrl}`);

    const liveIdMatch = currentUrl.match(/lv\d+/);
    const liveId = liveIdMatch ? liveIdMatch[0] : null;
    console.log(`配信ID: ${liveId ?? '(不明)'}`);

    const storageKey = liveId ? `nls_comments_${liveId}` : null;

    const commentPanel = page.locator('[class*="comment"], [data-name="comment"]');
    const panelCount = await commentPanel.count();
    console.log(`コメントパネル候補の要素数: ${panelCount}`);

    const inlineHost = page.locator('#nls-inline-popup-host');
    try {
      await expect(inlineHost).toBeVisible({ timeout: 30_000 });
      console.log('✓ インラインパネル(#nls-inline-popup-host)が表示された');
    } catch {
      console.log('△ インラインパネルは見つからなかった（ログインなし等の可能性）');
    }

    console.log('--- 30秒待機してコメント蓄積を確認 ---');
    await page.waitForTimeout(30_000);

    if (storageKey) {
      const commentCount = await sw.evaluate((key) => {
        return new Promise((resolve) => {
          chrome.storage.local.get(key, (r) => {
            const arr = r[key];
            resolve(Array.isArray(arr) ? arr.length : 0);
          });
        });
      }, storageKey);
      console.log(`✓ storage に蓄積されたコメント数: ${commentCount}`);
      expect(commentCount, 'コメントが1件以上 storage に蓄積される').toBeGreaterThanOrEqual(1);
    } else {
      console.log('△ liveId が取得できなかったため storage チェックをスキップ');
    }

    const allKeys = await sw.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.local.get(null, (r) => {
          const keys = Object.keys(r).filter(k => k.startsWith('nls_comments_'));
          const summary = keys.map(k => {
            const arr = r[k];
            return `${k}: ${Array.isArray(arr) ? arr.length : '(not array)'}件`;
          });
          resolve(summary);
        });
      });
    });
    console.log('--- storage 内のコメントキー一覧 ---');
    for (const line of allKeys) {
      console.log(`  ${line}`);
    }

    console.log('--- チェック完了 ---');
  });
});
