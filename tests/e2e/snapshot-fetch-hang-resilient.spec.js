import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.398: 「全カードが『—』で固まる→時間差で出る」再発バグの根治を実ブラウザで実証する。
 *
 * 真因: popup の短間隔 polling は `if (watchMetaCache.snapshotFetchActive) return;`
 *   （v0.1.392, popup-entry.js）で重複 fetch を防ぐが、snapshot fetch 配下の chrome API
 *   （tabs.query / scripting.executeScript / tabs.sendMessage）はいずれも timeout を持たず、
 *   多タブ stall 下で reject せず永久 pending になり得る。その場合 await が settle せず
 *   `finally`（snapshotFetchActive=false のリセット）に到達しないため、フラグが永久 true に
 *   張り付き、以後の polling tick が毎回 early-return → 全カードが「—」「取得中…」のまま固定
 *   になる（実機 v0.1.397 で観測）。
 *
 * 修正: snapshot fetch を既存 withTimeout ヘルパーで 15s に有界化。await が必ず settle →
 *   `finally` が必ず走り、snapshotFetchActive が構造的に stranded し得なくなる。
 *
 * このテストは「fetch が永久ハング」する状況を作り、popup の `window.__nlsSnapshotFetchActive`
 *   診断 getter（= watchMetaCache.snapshotFetchActive の read-only 鏡・挙動非影響）を観測する:
 *   - 旧コード（timeout 無し）: 最初の fetch で true になった後、finally に到達せず
 *     **永久 true 固定** → 「true になった後 false に戻る瞬間」が来ず下の expect がタイムアウト FAIL。
 *   - 新コード（withTimeout 15s）: 15s 毎に打ち切られ finally が走るため、true→false を周期的に
 *     繰り返す → 「true の後に false へ戻る」が観測でき PASS。
 *
 * ネガティブコントロール（withTimeout を外したビルド）で「FAIL する」ことを確認済み。
 * これが無いと「直したつもりで実は退化を捕らえない」テストになる
 * （[[feedback_verify_in_real_browser_before_reporting]]）。
 */

const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';

test('snapshot fetch が永久ハングしても snapshotFetchActive は永久 true に張り付かない（全部—固定の根治）', async ({
  context
}) => {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ recordingKey, lastWatchKey, commentsKey, watchUrl }) => {
      await chrome.storage.local.set({
        [recordingKey]: true,
        [lastWatchKey]: watchUrl,
        [commentsKey]: []
      });
    },
    {
      recordingKey: KEY_RECORDING,
      lastWatchKey: KEY_LAST_WATCH_URL,
      commentsKey: STORAGE_COMMENTS,
      watchUrl: MOCK_WATCH
    }
  );

  const watch = await context.newPage();
  await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
  await expect(watch.locator('#e2e-mock-viewer-count-sentinel')).toBeAttached();

  const popup = await context.newPage();
  // ナビゲーション前に、snapshot fetch が使う chrome API を「永久 pending」にする
  // パッチを仕込む（= 多タブ stall で chrome API が reject せず固まる状況の再現）。
  // tabs.query / scripting.executeScript / tabs.sendMessage の 3 つを塞げば
  // requestWatchPageSnapshotFromOpenTab の全経路（候補列挙・frame 列挙・本体取得）が
  // settle しなくなる。
  await popup.addInitScript(() => {
    const neverSettles = () =>
      new Promise(() => {
        /* reject も resolve もしない */
      });
    try {
      if (chrome?.tabs?.query) {
        // @ts-expect-error テスト用の差し替え
        chrome.tabs.query = function hangQuery() {
          return neverSettles();
        };
      }
      if (chrome?.scripting?.executeScript) {
        // @ts-expect-error テスト用の差し替え
        chrome.scripting.executeScript = function hangExec() {
          return neverSettles();
        };
      }
      if (chrome?.tabs?.sendMessage) {
        // @ts-expect-error テスト用の差し替え
        chrome.tabs.sendMessage = function hangSend() {
          return neverSettles();
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
  await focusMockWatchThenReloadPopup(watch, popup);
  await dismissExtensionUsageTermsGate(popup);

  const readFetchActive = async () =>
    popup.evaluate(
      () =>
        /** @type {{ __nlsSnapshotFetchActive?: boolean }} */ (window)
          .__nlsSnapshotFetchActive === true
    );

  // 1) まず snapshotFetchActive が一度 true になる（fetch が走った証拠）。新旧どちらでも通過。
  await expect
    .poll(readFetchActive, {
      timeout: 20_000,
      message: 'snapshot fetch が開始して snapshotFetchActive=true になるまで'
    })
    .toBe(true);

  // 2) ★ 核心: fetch は永久ハングしているのに、snapshotFetchActive が false へ戻る瞬間が来る。
  //    = withTimeout が 15s で打ち切り finally が走り、フラグがリセットされた証拠。
  //    旧コードなら finally に到達せず true 固定で、この expect は永久に通らずタイムアウトしていた
  //    （= polling 全停止 → 全部「—」固定の指紋）。
  //    タイムアウトは 15s の withTimeout + 取りこぼし余裕で 22s。
  await expect
    .poll(readFetchActive, {
      timeout: 22_000,
      message:
        'ハング中でも snapshotFetchActive が false へ戻るまで（戻らなければ永久張り付き=退行）'
    })
    .toBe(false);

  await popup.screenshot({
    path: 'test-results/snapshot-fetch-hang-resilient.png',
    fullPage: false
  });
});
