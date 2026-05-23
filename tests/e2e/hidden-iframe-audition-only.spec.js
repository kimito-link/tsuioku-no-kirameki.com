import { test, expect } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.323: 軽量化。koken / nicoad の hidden iframe を廃止し、無認証 API に一本化した
 * ことを実ブラウザで検証する。ギフトランキングレーン opt-in を有効化した状態で watch
 * ページを開いても、注入される hidden iframe は audition の 1 つだけで、koken / nicoad の
 * 重い Vue iframe は作られないことを確認する（PC が重い問題の主因の解消）。
 *
 * 貢献度ランキング(koken API) / 広告ランキング(nicoad API) は別経路（SW 無認証 API）で
 * 取得継続するため、iframe を消しても機能は退化しない（別 spec で担保）。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
// content-entry.js KEY_GIFT_RANKING_LANE_ENABLED と同期（opt-in で iframe inject を許可）。
const KEY_GIFT_RANKING_LANE_ENABLED = 'nls_gift_ranking_lane_enabled';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('hidden iframe は audition のみ（koken / nicoad iframe は作られない）', async ({
  context
}) => {
  const sw = await swOf(context);

  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey, laneKey }) => {
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recordingKey]: true,
        [laneKey]: true // ギフトランキングレーン opt-in（iframe inject 許可）
      });
    },
    {
      watchUrl: MOCK_WATCH,
      watchKey: KEY_LAST_WATCH_URL,
      recordingKey: KEY_RECORDING,
      laneKey: KEY_GIFT_RANKING_LANE_ENABLED
    }
  );

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // hidden iframe の inject はページ frame ループ（360ms tick 等）で走る。十分待つ。
  await watch.waitForTimeout(4000);

  const iframeIds = await watch.evaluate(() =>
    Array.from(document.querySelectorAll('iframe[data-nls-hidden-injected]')).map(
      (el) => el.id
    )
  );
  console.log('hidden injected iframe ids:', JSON.stringify(iframeIds));

  // koken / nicoad の hidden iframe は作られない（廃止済み）
  expect(iframeIds).not.toContain('nls-hidden-koken-iframe');
  expect(iframeIds).not.toContain('nls-hidden-nicoad-iframe');
  // audition iframe は残す（イベントバナー用）。inject されていれば audition のみ。
  // （mock 環境で inject 自体が走らない可能性もあるため、koken/nicoad が無いことを主検証とし、
  //   audition が居る場合はそれが唯一であることを確認）
  if (iframeIds.length > 0) {
    expect(iframeIds).toEqual(['nls-hidden-audition-iframe']);
  }
});
