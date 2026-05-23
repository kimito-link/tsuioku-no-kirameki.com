import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.339: 「照合済みなのにサムネが出ない」②の実機切り分け用に、診断バンドルの
 * popup セクションへ avatarLoadDiag（合成 usericon の load 成否集計）を載せたことを実証。
 * AI共有用コピーの JSON に popup.avatarLoadDiag が含まれ、想定キーを持つことを確認する。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('診断バンドルに popup.avatarLoadDiag（usericon load 成否）が含まれる', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchKey, recordingKey, watchUrl }) => {
      await chrome.storage.local.set({ [watchKey]: watchUrl, [recordingKey]: true });
    },
    { watchKey: KEY_LAST_WATCH_URL, recordingKey: KEY_RECORDING, watchUrl: MOCK_WATCH }
  );

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const popup = await context.newPage();
  // chrome-extension は opaque origin で clipboard 権限を grant できないため、
  // navigator.clipboard.writeText を差し替えて「コピーされたテキスト」を捕捉する
  // （execCommand 経由のフォールバックも textarea から拾えるよう両対応）。
  await popup.addInitScript(() => {
    // @ts-expect-error テスト捕捉用グローバル
    window.__copiedText = '';
    try {
      const realWrite = navigator.clipboard?.writeText?.bind(navigator.clipboard);
      if (navigator.clipboard) {
        navigator.clipboard.writeText = async (t) => {
          // @ts-expect-error テスト捕捉用
          window.__copiedText = String(t || '');
          try {
            return realWrite ? await realWrite(t) : undefined;
          } catch {
            return undefined; // 権限拒否でも捕捉は成立
          }
        };
      }
    } catch {
      /* no-op */
    }
  });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissExtensionUsageTermsGate(popup);
  await focusMockWatchThenReloadPopup(watch, popup);
  await popup.waitForTimeout(1500);

  // dev monitor details を開いてからコピーボタンを押す。
  const btn = popup.locator('#devMonitorCopyAiBundleBtn');
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  // details 内に隠れている場合に備え、JS で直接 click（可視化に依存しない）。
  await popup.evaluate(() => {
    const b = document.getElementById('devMonitorCopyAiBundleBtn');
    if (b) b.click();
  });

  // コピーされたテキスト（捕捉グローバル）に診断まとめ（avatarLoadDiag を含む JSON）が
  // 乗るまで待つ。コピー本文は markdown で、JSON は ```json フェンス内にある。
  await expect
    .poll(
      async () => {
        const txt = await popup.evaluate(() => /** @type {any} */ (window).__copiedText || '');
        return Boolean(txt && txt.includes('avatarLoadDiag') && txt.includes('```json'));
      },
      { timeout: 15_000, message: 'コピーまとめ（avatarLoadDiag 含む）が捕捉されるまで' }
    )
    .toBe(true);

  const txt = await popup.evaluate(() => /** @type {any} */ (window).__copiedText || '');
  // markdown の ```json ... ``` フェンスから JSON 本体を取り出す。
  const m = txt.match(/```json\s*([\s\S]*?)```/);
  expect(m).not.toBeNull();
  const diag = JSON.parse(m[1]).popup.avatarLoadDiag;

  // 想定キーを持つ（値はゼロでも良い＝枠が出ていることが目的）。
  expect(diag).toHaveProperty('succeededTotal');
  expect(diag).toHaveProperty('failedTotal');
  expect(diag).toHaveProperty('usericonSucceeded');
  expect(diag).toHaveProperty('usericonFailed');
  expect(Array.isArray(diag.failedUsericonSamples)).toBe(true);
});
