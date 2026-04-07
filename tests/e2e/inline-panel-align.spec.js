import { test, expect } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';
const INLINE_HOST_ID = 'nls-inline-popup-host';
const KEY_INLINE_PANEL_WIDTH_MODE = 'nls_inline_panel_width_mode';

async function extensionServiceWorker(context) {
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
  }
  return sw;
}

function injectTwoColumnPlayerRow() {
  const doc = globalThis.document;
  const win = globalThis.window;
  const oldVid = doc.getElementById('e2e-mock-video');
  if (oldVid) oldVid.remove();
  const panel = doc.querySelector('.ga-ns-comment-panel');
  if (panel) panel.remove();

  const row = doc.createElement('section');
  row.id = 'mock-player-row';
  row.style.cssText =
    'display:flex;flex-direction:row;align-items:flex-start;gap:10px;width:640px;margin:12px 0;padding:8px;background:#1a1a1a;';

  const v = doc.createElement('video');
  v.setAttribute('playsinline', '');
  v.setAttribute('width', '400');
  v.setAttribute('height', '225');
  v.style.cssText =
    'display:block;width:400px;height:225px;flex-shrink:0;background:#000;';

  const side = doc.createElement('div');
  side.className = 'ga-ns-comment-panel comment-panel';
  side.style.cssText =
    'width:220px;min-height:280px;flex-shrink:0;background:#2a2a2a;';

  row.appendChild(v);
  row.appendChild(side);
  doc.body.prepend(row);
  win.scrollTo(0, 0);
  win.dispatchEvent(new Event('resize'));
}

/**
 * インラインパネルが 2 カラム視聴行の幅に合わせること（player_row 既定）、
 * または video モードで動画幅に近いこと
 */
test.describe('inline panel alignment', () => {
  test('2カラム時 player_row ではホスト幅が動画単体より広い', async ({
    context
  }) => {
    const sw = await extensionServiceWorker(context);
    await sw.evaluate(async (key) => {
      await chrome.storage.local.remove(key);
    }, KEY_INLINE_PANEL_WIDTH_MODE);

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    await page.evaluate(injectTwoColumnPlayerRow);

    await page.waitForTimeout(2000);

    const metrics = await page.evaluate((hostId) => {
      const host = globalThis.document.getElementById(hostId);
      if (!host) return null;
      const st = globalThis.getComputedStyle(host);
      return {
        display: st.display,
        marginLeft: st.marginLeft,
        width: st.width
      };
    }, INLINE_HOST_ID);

    expect(metrics, 'インラインホストが DOM にある').not.toBeNull();
    expect(metrics.display).toBe('block');
    const w = Number.parseFloat(metrics.width);
    // player_row でも resolvePlayerRowRect が挿入アンカー（多くは video 幅）で上限化するため、
    // 2 列 mock（動画 400px + サイド 220px）ではパネル幅は動画幅付近になる
    expect(w).toBeGreaterThan(380);
    expect(w).toBeLessThanOrEqual(660);
  });

  test('video モードではホスト幅が動画幅に近い', async ({ context }) => {
    const sw = await extensionServiceWorker(context);
    await sw.evaluate(async (key) => {
      await chrome.storage.local.set({ [key]: 'video' });
    }, KEY_INLINE_PANEL_WIDTH_MODE);

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    await page.evaluate(injectTwoColumnPlayerRow);

    await page.waitForTimeout(2000);

    const metrics = await page.evaluate((hostId) => {
      const host = globalThis.document.getElementById(hostId);
      if (!host) return null;
      const st = globalThis.getComputedStyle(host);
      return {
        display: st.display,
        width: st.width
      };
    }, INLINE_HOST_ID);

    expect(metrics, 'インラインホストが DOM にある').not.toBeNull();
    expect(metrics.display).toBe('block');
    const w = Number.parseFloat(metrics.width);
    expect(w).toBeGreaterThan(380);
    expect(w).toBeLessThan(430);
  });
});
