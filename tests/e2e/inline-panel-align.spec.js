import { test, expect } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';
const INLINE_HOST_ID = 'nls-inline-popup-host';
const KEY_INLINE_PANEL_WIDTH_MODE = 'nls_inline_panel_width_mode';
const KEY_INLINE_PANEL_PLACEMENT = 'nls_inline_panel_placement';

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
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{ widthMode?: string|null, placement?: string|null }} opts
 */
async function setInlinePanelModes(context, opts = {}) {
  const sw = await extensionServiceWorker(context);
  await sw.evaluate(async ({ widthMode, placement, widthKey, placementKey }) => {
    const removeKeys = [];
    /** @type {Record<string, string>} */
    const save = {};
    if (widthMode == null) removeKeys.push(widthKey);
    else save[widthKey] = widthMode;
    if (placement == null) removeKeys.push(placementKey);
    else save[placementKey] = placement;
    if (removeKeys.length) {
      await chrome.storage.local.remove(removeKeys);
    }
    if (Object.keys(save).length) {
      await chrome.storage.local.set(save);
    }
  }, {
    widthMode: opts.widthMode ?? null,
    placement: opts.placement ?? null,
    widthKey: KEY_INLINE_PANEL_WIDTH_MODE,
    placementKey: KEY_INLINE_PANEL_PLACEMENT
  });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function hostPlacementMetrics(page) {
  return page.evaluate((hostId) => {
    const host = globalThis.document.getElementById(hostId);
    if (!host) return null;
    const st = globalThis.getComputedStyle(host);
    return {
      display: st.display,
      position: st.position,
      top: st.top,
      right: st.right,
      width: st.width,
      marginLeft: st.marginLeft,
      parentTag: host.parentElement?.tagName || '',
      parentId: host.parentElement?.id || '',
      prevElementTag: host.previousElementSibling?.tagName || '',
      prevElementId: host.previousElementSibling?.id || '',
      prevSiblingType: host.previousSibling?.nodeType || null,
      floatingClass: host.classList.contains('nls-inline-host--floating')
    };
  }, INLINE_HOST_ID);
}

/**
 * インラインパネルが 2 カラム視聴行の幅に合わせること（player_row 既定）、
 * または video モードで動画幅に近いこと
 */
test.describe('inline panel alignment', () => {
  test('2カラム時 player_row ではホスト幅が動画単体より広い', async ({
    context
  }) => {
    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'below'
    });

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
    await setInlinePanelModes(context, {
      widthMode: 'video',
      placement: 'below'
    });

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

  test('below では 2カラム行の外側に出る', async ({ context }) => {
    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'below'
    });

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await page.evaluate(injectTwoColumnPlayerRow);

    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 25_000 })
      .toMatchObject({
        display: 'block',
        parentTag: 'BODY',
        prevElementId: 'mock-player-row',
        floatingClass: false
      });
  });

  test('beside では 動画列の直後に入り row の内側に出る', async ({ context }) => {
    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'beside'
    });

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await page.evaluate(injectTwoColumnPlayerRow);

    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 25_000 })
      .toMatchObject({
        display: 'block',
        parentId: 'mock-player-row',
        prevElementTag: 'VIDEO',
        floatingClass: false
      });

    const metrics = await hostPlacementMetrics(page);
    const w = Number.parseFloat(metrics?.width || '0');
    expect(w).toBeGreaterThan(380);
    expect(w).toBeLessThan(430);
    expect(metrics?.marginLeft).toBe('0px');
  });

  test('beside でも狭いビューポートでは下（行の外）へ逃がす', async ({
    context
  }) => {
    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'beside'
    });

    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 720 });
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await page.evaluate(injectTwoColumnPlayerRow);

    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 25_000 })
      .toMatchObject({
        display: 'block',
        parentTag: 'BODY',
        prevElementId: 'mock-player-row',
        floatingClass: false
      });
  });

  test('beside では 空白 Text ノードが間にあっても毎tick再挿入しない', async ({
    context
  }) => {
    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'beside'
    });

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await page.evaluate(injectTwoColumnPlayerRow);

    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 25_000 })
      .toMatchObject({
        parentId: 'mock-player-row',
        prevElementTag: 'VIDEO'
      });

    await page.evaluate((hostId) => {
      const doc = globalThis.document;
      const row = doc.getElementById('mock-player-row');
      const host = doc.getElementById(hostId);
      if (!row || !host) return;
      row.insertBefore(doc.createTextNode(' '), host);
    }, INLINE_HOST_ID);

    await page.waitForTimeout(1200);

    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 10_000 })
      .toMatchObject({
        parentId: 'mock-player-row',
        prevElementTag: 'VIDEO',
        prevSiblingType: 3
      });
  });

  test('floating から beside へ切り替えると fixed 表示を外して row 内へ戻る', async ({
    context
  }) => {
    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'floating'
    });

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await page.evaluate(injectTwoColumnPlayerRow);

    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 25_000 })
      .toMatchObject({
        display: 'block',
        parentTag: 'BODY',
        position: 'fixed',
        floatingClass: true
      });

    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'beside'
    });

    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 25_000 })
      .toMatchObject({
        display: 'block',
        parentId: 'mock-player-row',
        prevElementTag: 'VIDEO',
        floatingClass: false
      });

    const metrics = await hostPlacementMetrics(page);
    expect(metrics?.position).not.toBe('fixed');
  });
});
