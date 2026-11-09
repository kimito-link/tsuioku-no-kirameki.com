// sidepanel-stream-follow.spec.js — 0.1.1949: 横の欄の外枠が、YouTube 系どうしでタブを移っても「別の配信」なら中身を読み込み直すか
//   (council/panel-stream-selection-SPEC.md §4-A2)。判断の証拠は外枠の iframe の src(&stream=)。
//   以前は YouTube→Kick→SHOWROOM と移っても src が同じで読み込み直さず、前のサービスの言葉が残っていた(PC 計測 0.1.1946)。
import { test, expect } from './fixtures.js';

const FAKE = '<!doctype html><html><head><title>fake</title></head><body>fake stream page</body></html>';

test('YouTube 系どうしで配信が変わったら外枠が中身を読み込み直し、配信でないページでは保つ', async ({ context }) => {
  // 本物のサービスには繋がない(ページは中身の無い偽物。外枠はタブの URL だけを見る)
  for (const host of ['https://kick.com/**', 'https://www.showroom-live.com/**', 'https://www.youtube.com/**', 'https://example.com/**']) {
    await context.route(host, (r) =>
      r.request().resourceType() === 'document' ? r.fulfill({ status: 200, contentType: 'text/html', body: FAKE }) : r.abort(),
    );
  }
  let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;

  const kick = await context.newPage();
  await kick.goto('https://kick.com/alpha');
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
  const src = () => panel.evaluate(() => String(document.querySelector('iframe[data-nl-src]')?.getAttribute('src') || ''));

  const show = async (/** @type {import('@playwright/test').Page} */ p) => {
    await p.bringToFront();
  };

  await show(kick);
  await expect.poll(src, { timeout: 15_000 }).toContain(`stream=${encodeURIComponent('kick:alpha')}`);

  const sr = await context.newPage();
  await sr.goto('https://www.showroom-live.com/r/beta_room');
  await show(sr);
  await expect.poll(src, { timeout: 15_000 }).toMatch(/yt-sidepanel\.html\?.*stream=showroom%3A/);

  const yt = await context.newPage();
  await yt.goto('https://www.youtube.com/watch?v=abcdefghijk');
  await show(yt);
  await expect.poll(src, { timeout: 15_000 }).toContain(`stream=${encodeURIComponent('yt:abcdefghijk')}`);

  // 配信でないページ(対応外のサイト・YouTube のトップ)では今の配信を保つ(ニコ生版と同じ)
  const other = await context.newPage();
  await other.goto('https://example.com/');
  await show(other);
  await yt.goto('https://www.youtube.com/');
  await show(yt);
  await panel.waitForTimeout(1500);
  expect(await src()).toContain(`stream=${encodeURIComponent('yt:abcdefghijk')}`);

  await show(kick);
  await expect.poll(src, { timeout: 15_000 }).toContain(`stream=${encodeURIComponent('kick:alpha')}`);
});
