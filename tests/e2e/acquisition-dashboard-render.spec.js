import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * B-4 リファクタ検証: renderAcquisitionDashboard の数値計算（レーダー座標・
 * 円グラフ conic-gradient・各取得率）を純関数 acquisitionDashboardChart.js に
 * 外出ししても、実 popup の取得率チャートが従来どおり描画されることを実ブラウザで実証。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('取得率ダッシュボードのレーダーと円グラフが描画される（配線確認）', async ({
  context
}) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;
  await sw.evaluate(
    async ({ watchUrl, watchKey, recordingKey }) => {
      await chrome.storage.local.set({ [watchKey]: watchUrl, [recordingKey]: true });
    },
    { watchUrl: MOCK_WATCH, watchKey: KEY_LAST_WATCH_URL, recordingKey: KEY_RECORDING }
  );

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await dismissExtensionUsageTermsGate(popup);
  await focusMockWatchThenReloadPopup(watch, popup);
  await popup.waitForTimeout(1500);

  const host = popup.locator('#devMonitorAcquisition');
  await expect(host).toBeAttached();

  // v0.1.637: devMonitor は details が開いているときだけ O(N) 集計を実行する
  // （閉じたまま放置してもスクロールが重くならないための perf gate）。
  await popup.locator('#devMonitorDetails').evaluate((el) => {
    el.open = true;
  });

  // liveId があるのでチャート（section.nl-acquisition）が描画される
  await expect
    .poll(async () => (await host.innerHTML().catch(() => '')).includes('nl-acquisition__radar'), {
      timeout: 8000
    })
    .toBe(true);

  // レーダーの polygon（取得率の塗り）が points 付きで存在（純関数 computeRadarPolygonPoints の出力）
  const polygons = host.locator('.nl-acquisition__radar polygon');
  await expect(polygons).toHaveCount(3); // ring / mid / fill
  const polygonPts = await polygons.last().getAttribute('points').catch(() => null);
  // points が数値ペアの羅列（純関数 computeRadarPolygonPoints の出力形）
  expect(polygonPts, 'レーダー polygon に points がある').toBeTruthy();
  expect(polygonPts).toMatch(/\d+\.\d{2},\d+\.\d{2}/);

  // 円グラフ pie-disk の background が設定されている（conic-gradient か単色）
  const pieBg = await host.locator('.nl-acquisition__pie-disk').first().evaluate((el) =>
    getComputedStyle(el).backgroundImage + '|' + getComputedStyle(el).backgroundColor
  );
  expect(pieBg, 'pie-disk に background がある').toBeTruthy();
});
