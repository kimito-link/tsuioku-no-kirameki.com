import {
  test,
  expect,
  dismissExtensionUsageTermsGate,
  focusMockWatchThenReloadPopup
} from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';

/*
 * v0.1.340: 応援タイムライン（コメント＋ギフトを時刻順に1本の流れで）を実ブラウザで実証。
 * comments storage と nls_gift_events_ を seed し、パネルを開くと時系列にコメント行と
 * ギフトカードが混在して並ぶこと・ギフト要約がヘッダに出ることを確認する。
 */

const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const KEY_RECORDING = 'nls_recording_enabled';
const KEY_COMMENTS = 'nls_comments_lv888888888';
const KEY_GIFT_EVENTS = 'nls_gift_events_lv888888888';
const KEY_PROFILE_CACHE = 'nls_user_comment_profile_v1';

async function swOf(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  return sw;
}

test('応援タイムライン: コメントとギフトが時刻順に混在して描画される', async ({ context }) => {
  const sw = await swOf(context);
  const extensionId = new URL(sw.url()).hostname;

  await sw.evaluate(
    async ({ watchKey, recKey, cKey, gKey, pKey, watchUrl }) => {
      const base = Date.now() - 60_000;
      const comments = [
        { id: 'lv888888888::c1', liveId: 'lv888888888', commentNo: '1', userId: '100', nickname: 'あ', text: 'こめんと1', capturedAt: base + 1000 },
        { id: 'lv888888888::c2', liveId: 'lv888888888', commentNo: '2', userId: '4046119', nickname: 'い', text: 'こめんと2', capturedAt: base + 3000 }
      ];
      const giftEvents = [
        { userId: '380000', nickname: 'おくりぬし', itemId: 'g1', itemName: 'かしわもち', point: 1200, message: '', contributionRank: null, capturedAt: base + 2000 }
      ];
      // ギフト送信者 380000 の avatar を profile cache に seed（uid を含む usericon URL=
      // broadcaster guard を通る）。enrich でギフト行に顔が出ることを実証する。
      const profileCache = {
        '380000': {
          nickname: 'おくりぬし',
          avatarUrl: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/38/380000.jpg',
          updatedAt: Date.now()
        }
      };
      await chrome.storage.local.set({
        [watchKey]: watchUrl,
        [recKey]: true,
        [pKey]: profileCache,
        [cKey]: comments,
        [gKey]: giftEvents
      });
    },
    {
      watchKey: KEY_LAST_WATCH_URL,
      recKey: KEY_RECORDING,
      cKey: KEY_COMMENTS,
      gKey: KEY_GIFT_EVENTS,
      pKey: KEY_PROFILE_CACHE,
      watchUrl: MOCK_WATCH
    }
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
  await popup.waitForTimeout(1800);

  const details = popup.locator('#supportTimelineDetails');
  await expect(details).toBeAttached();
  // パネルを開く。
  await popup.evaluate(() => {
    const d = document.getElementById('supportTimelineDetails');
    if (d) d.setAttribute('open', '');
  });

  const body = popup.locator('#supportTimelineBody');
  // ギフトカードとコメント行が両方描画されるまで待つ。
  await expect
    .poll(
      async () => {
        const gifts = await body.locator('.nl-tl-gift').count();
        const rows = await body.locator('.nl-tl-row').count();
        return gifts >= 1 && rows >= 2;
      },
      { timeout: 8000, message: 'ギフトカード1件以上＋コメント行2件以上が出るまで' }
    )
    .toBe(true);

  // ギフトカードの中身（item名・pt）が出ている。
  await expect(body.locator('.nl-tl-gift')).toContainText('かしわもち');
  await expect(body.locator('.nl-tl-gift')).toContainText('1,200pt');

  // 時刻順（desc）でギフト(2000)が、seed した c2(3000)より後・c1(1000)より前に挟まることを確認。
  //   モック watch ページのコメントが多数混ざるため、絶対順ではなく「seed 2件の間にギフト」で検証。
  const positions = await body.evaluate((el) => {
    const items = Array.from(el.querySelectorAll('.nl-tl-gift, .nl-tl-row'));
    let gift = -1;
    let c2 = -1;
    let c1 = -1;
    items.forEach((n, i) => {
      const txt = n.textContent || '';
      if (n.classList.contains('nl-tl-gift')) gift = i;
      else if (txt.includes('こめんと2')) c2 = i;
      else if (txt.includes('こめんと1')) c1 = i;
    });
    return { gift, c2, c1 };
  });
  // 3 つとも見つかり、desc で c2 < gift < c1（新しいものが上＝index 小）。
  expect(positions.c2).toBeGreaterThanOrEqual(0);
  expect(positions.gift).toBeGreaterThan(positions.c2);
  expect(positions.c1).toBeGreaterThan(positions.gift);

  // ヘッダのギフト要約。
  await expect(popup.locator('#supportTimelineGiftMeta')).toContainText('1件');
  await expect(popup.locator('#supportTimelineGiftMeta')).toContainText('1,200pt');

  // v0.1.341: 相対時刻（「たった今／N秒前／N分前」）が各行に出る。
  await expect(body.locator('.nl-tl-time').first()).toBeVisible();
  const agoText = (await body.locator('.nl-tl-time').first().innerText()).trim();
  expect(agoText).toMatch(/(たった今|秒前|分前)/u);

  // v0.1.342: ギフト行に送信者アバター（profile cache から enrich）が顔として出る。
  const giftAvatar = body.locator('.nl-tl-gift .nl-tl-gift__avatar');
  await expect(giftAvatar).toHaveCount(1);
  await expect(giftAvatar).toHaveAttribute('src', /usericon\/s\/38\/380000\.jpg/);
  await expect(body.locator('.nl-tl-gift .nl-tl-gift__badge')).toBeAttached();

  await popup.screenshot({
    path: 'test-results/support-activity-timeline.png',
    fullPage: false
  });
});
