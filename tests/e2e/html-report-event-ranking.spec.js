import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * Phase B 実機実証（2026-05-26・会議）。
 *
 * v0.1.390 で HTML レポートに「イベント順位」セクション（#sec-event-ranking）を追加した。
 * これが「pure test 緑」だけでなく、**実拡張を実ブラウザに load した状態で
 * buildHtmlReportDocument が実際に出力する HTML に出る**ことを実証する
 * （[[feedback_verify_in_real_browser_before_reporting]]）。
 *
 * 検証手法:
 *   - storage に nls_event_score_ranking_<lv>（content-entry が書く本物の形）を seed。
 *   - popup を standalone で開き、HTML 保存ボタン #exportJson の dataset を
 *     入力契約どおり（liveId/storageKey/watchUrl）に設定。
 *   - URL.createObjectURL を stub して downloadCommentsHtml が作る Blob の本文を捕捉
 *     （実ファイル download のプラミングに依存せず、本物の buildHtmlReportDocument を通す）。
 *   - 捕捉した HTML に セクション/イベント名/本人順位/TOP 行 が出ることを assert。
 *   - ⭐セキュリティ回帰ガード: data: サムネは strip され、https サムネは残ることも確認。
 */

const KEY_RECORDING = 'nls_recording_enabled';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const STORAGE_COMMENTS = 'nls_comments_lv888888888';
const EVENT_KEY = 'nls_event_score_ranking_lv888888888';

test.describe('HTML レポート イベント順位セクション（実拡張）', () => {
  test('参加イベントの順位が実 HTML 出力に出る + 非httpサムネは strip', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }
    const extensionId = new URL(sw.url()).hostname;

    // content-entry が nls_event_score_ranking_<lv> に書くのと同じ形を seed する。
    await sw.evaluate(
      async ({ recordingKey, lastWatchKey, commentsKey, eventKey, watchUrl }) => {
        const comments = Array.from({ length: 3 }, (_, idx) => ({
          id: `lv888888888::e2e-evt-${idx + 1}`,
          liveId: 'lv888888888',
          commentNo: String(idx + 1),
          userId: `user_evt_${idx}`,
          text: `e2e event row ${idx + 1}`,
          capturedAt: Date.now() - idx * 1000
        }));
        await chrome.storage.local.set({
          [recordingKey]: true,
          [lastWatchKey]: watchUrl,
          [commentsKey]: comments,
          [eventKey]: {
            rows: [
              {
                rank: 1,
                score: 4_965_200,
                name: 'あめ',
                isAnonymous: false,
                thumbnailUrl: 'https://example.com/thumb-ame.jpg'
              },
              {
                // ⭐非httpサムネ（data:）は出力で strip されること
                rank: 2,
                score: 3_452_500,
                name: 'この',
                isAnonymous: false,
                thumbnailUrl: 'data:image/png;base64,AAAA'
              },
              {
                rank: 3,
                score: 2_825_600,
                name: 'ぴとな',
                isAnonymous: false,
                thumbnailUrl: ''
              }
            ],
            selfStatus: {
              rank: 2,
              score: 3_452_500,
              diffToNext: 1_512_700,
              eventName: '5月病なんか銀河系まで飛んでいけ！',
              broadcasterName: 'この'
            },
            capturedAt: Date.now(),
            liveId: 'lv888888888',
            frameUrl:
              'https://audition.nicovideo.jp/embedded/richview/live?content_id=lv888888888'
          }
        });
      },
      {
        recordingKey: KEY_RECORDING,
        lastWatchKey: KEY_LAST_WATCH_URL,
        commentsKey: STORAGE_COMMENTS,
        eventKey: EVENT_KEY,
        watchUrl: MOCK_WATCH
      }
    );

    const watch = await context.newPage();
    await watch.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await expect(watch.locator('#e2e-mock-viewer-count-sentinel')).toBeAttached();

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000
    });
    await focusMockWatchThenReloadPopup(watch, popup);
    await dismissExtensionUsageTermsGate(popup);
    await expect(popup.locator('html[data-nl-support-wired]')).toBeAttached({
      timeout: 20_000
    });

    // downloadCommentsHtml が作る Blob の本文を捕捉する（実ファイル download に依存しない）。
    // a.click() による実 download を抑止するため click も無効化する。
    await popup.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__capturedReportHtml = null;
      const origCreate = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        try {
          if (blob && typeof blob.text === 'function') {
            blob.text().then((t) => {
              w.__capturedReportHtml = t;
            });
          }
        } catch {
          /* no-op */
        }
        return origCreate(blob);
      };
      // 実ダウンロード（a.click）はテストでは不要 → no-op 化（href は付くが click しない）
      const origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this && this.download && /^blob:/.test(String(this.href || ''))) return;
        return origClick.apply(this, arguments);
      };
    });

    // HTML 保存ボタンの入力契約（dataset）を設定してクリック。
    const exportBtn = popup.locator('#exportJson');
    await expect(exportBtn).toBeAttached();
    await exportBtn.evaluate(
      (el, { lv, key, watchUrl }) => {
        const btn = /** @type {HTMLButtonElement} */ (el);
        btn.dataset.liveId = lv;
        btn.dataset.storageKey = key;
        btn.dataset.watchUrl = watchUrl;
        btn.disabled = false;
      },
      { lv: 'lv888888888', key: STORAGE_COMMENTS, watchUrl: MOCK_WATCH }
    );
    await exportBtn.click();

    // 捕捉した HTML を取り出す（Blob 本文が入るまで待ってから読む）。
    await expect
      .poll(
        async () =>
          (
            await popup.evaluate(
              () => /** @type {any} */ (window).__capturedReportHtml || ''
            )
          ).length,
        { timeout: 20_000, message: 'HTML レポートの Blob 本文が捕捉されるまで' }
      )
      .toBeGreaterThan(0);
    const html = await popup.evaluate(
      () => /** @type {any} */ (window).__capturedReportHtml || ''
    );

    // セクション本体が出る。
    expect(html, 'イベント順位セクションが出力に含まれる').toContain(
      'id="sec-event-ranking"'
    );
    expect(html).toContain('イベント順位');
    // TOC にもリンクが出る。
    expect(html).toContain('href="#sec-event-ranking"');

    // イベント名（公式バナーの選択中をそのまま）。
    expect(html).toContain('5月病なんか銀河系まで飛んでいけ！');

    // 本人順位（この さん 現在 2 位 💎 3,452,500）。
    expect(html).toContain('この');
    expect(html).toContain('現在');
    expect(html).toContain('3,452,500');
    // 次順位までの差（あと 💎 1,512,700 で 1 位）。
    expect(html).toContain('1,512,700');

    // TOP 行（1 位 あめ 💎 4,965,200 / 3 位 ぴとな）。
    expect(html).toContain('あめ');
    expect(html).toContain('4,965,200');
    expect(html).toContain('ぴとな');

    // ⭐https サムネは src に残る。
    expect(html, 'https サムネは出力に残る').toContain(
      'https://example.com/thumb-ame.jpg'
    );
    // ⭐非http（data:）サムネは strip される（S-2 回帰ガード）。
    expect(html, 'data: サムネは出力に出してはいけない').not.toContain(
      'data:image/png;base64,AAAA'
    );
  });
});
