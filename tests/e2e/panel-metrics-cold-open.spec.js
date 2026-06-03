import {
  test,
  expect,
  enableInlinePanelAutoshow,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const CHUNK_INDEX_KEY = 'nls_cchunk_index_lv888888888';
const INLINE_HOST_ID = 'nls-inline-popup-host';

/**
 * v0.1.595: storage に件数サマリが無くても、content メモリ直結 metrics で
 * 初回 open から記録・来場・同接カードが「—」/「~0」にならない。
 */
test('chunk index のみ + metrics 直結で初回カードが埋まる（cold open）', async ({
  context
}) => {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ recordingKey, lastWatchKey, indexKey, watchUrl }) => {
      const liveId = 'lv888888888';
      const all = await chrome.storage.local.get(null);
      const staleKeys = Object.keys(all || {}).filter(
        (key) =>
          key === `nls_comments_${liveId}` ||
          key === `nls_csummary_${liveId}` ||
          key === `nls_ctail_${liveId}` ||
          key === `nls_cdb_summary_${liveId}` ||
          key === `nls_watch_snapshot_${liveId}` ||
          key === `nls_panel_summary_${liveId}` ||
          key === `nls_cchunk_index_${liveId}` ||
          key === `nls_cchunk_migrated_${liveId}` ||
          key.startsWith(`nls_cchunk_${liveId}_`)
      );
      if (staleKeys.length) await chrome.storage.local.remove(staleKeys);
      await chrome.storage.local.set({
        [recordingKey]: true,
        [lastWatchKey]: watchUrl,
        [indexKey]: {
          v: 1,
          liveId: 'lv888888888',
          seqs: [0, 1, 2],
          total: 8806,
          maxPerChunk: 1000
        }
      });
    },
    {
      recordingKey: KEY_RECORDING,
      lastWatchKey: KEY_LAST_WATCH_URL,
      indexKey: CHUNK_INDEX_KEY,
      watchUrl: MOCK_WATCH
    }
  );

  await enableInlinePanelAutoshow(context);

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
  await expect(watch.locator('#e2e-mock-viewer-count-sentinel')).toBeAttached();

  const frame = watch.frameLocator(`#${INLINE_HOST_ID} iframe`);
  await expect(frame.locator('html[data-nl-popup-content-painted]')).toBeAttached({
    timeout: 40_000
  });

  await expect
    .poll(
      async () =>
        (await frame.locator('#liveStatComments').innerText())
          .trim()
          .replace(/[,，\s]/g, ''),
      {
        timeout: 25_000,
        message: 'metrics / chunk index で記録カードが数値表示になるまで'
      }
    )
    .toMatch(/^\d+$/u);

  await expect
    .poll(
      async () =>
        (await frame.locator('#watchViewerDom').innerText())
          .trim()
          .replace(/[,，\s]/g, ''),
      {
        timeout: 25_000,
        message: 'metrics / DOM fallback で来場カードが数値表示になるまで'
      }
    )
    .toMatch(/^\d+$/u);

  await expect
    .poll(
      async () => (await frame.locator('#watchConcurrentEst').innerText()).trim(),
      {
        timeout: 25_000,
        message: '同接カードが ~0 ではなく推定中または正の推定になるまで'
      }
    )
    .toMatch(/^(推定中|~?[1-9][\d,，]*)$/u);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await focusMockWatchThenReloadPopup(watch, popup);
  await dismissExtensionUsageTermsGate(popup);

  await expect
    .poll(
      async () =>
        (await popup.locator('#liveStatComments').innerText())
          .trim()
          .replace(/[,，\s]/g, ''),
      { timeout: 20_000 }
    )
    .toBe('8806');
});
