import { test, expect, enableInlinePanelAutoshow } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';
const INLINE_HOST_ID = 'nls-inline-popup-host';
const KEY_INLINE_PANEL_WIDTH_MODE = 'nls_inline_panel_width_mode';
const KEY_INLINE_PANEL_PLACEMENT = 'nls_inline_panel_placement';
const KEY_INLINE_FLOATING_ANCHOR = 'nls_inline_floating_anchor';
/*
 * autoshow は 0.1.6 以降 opt-in（既定 OFF）のため、E2E ではテストごとに明示 ON にする。
 * ここではフラグ名を storage key 定数経由でなくリテラルで持つと本体実装とのキー揺れに
 * 気づきにくいので、共通ヘルパ経由で ON にする（fixtures.js の enableInlinePanelAutoshow）。
 */
/*
 * 拡張は「初回起動で floating を一度だけ dock_bottom に寄せる」旧利用者向け移行を
 * background.js と content-entry.js の両方で持っている（migrateFloatingInlinePanelToDockOnce）。
 * 生の E2E コンテキストは毎回 migrated=false で起動するため、テストが floating を指定しても
 * 移行ロジックが直ちに dock_bottom に書き換えてしまう。テスト側で「移行済み」フラグを
 * 明示して移行 path に入らないようにする（背景のクリーンルーム側の挙動は別途 E2E で担保する想定）。
 */
const KEY_INLINE_PANEL_FLOAT_TO_DOCK_MIGRATED =
  'nls_inline_panel_float_to_dock_migrated';

async function extensionServiceWorker(context) {
  const pickExt = () =>
    context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ext = pickExt();
    if (ext) return ext;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('extension service worker not found');
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
 * @param {{
 *   widthMode?: string|null,
 *   placement?: string|null,
 *   floatingAnchor?: string|null,
 *   touchFloatingAnchor?: boolean
 * }} opts
 */
async function setInlinePanelModes(context, opts = {}) {
  /*
   * 既定 OFF 化された autoshow を必ず ON にしてから配置モードを設定する。
   * ここで毎回 ON にしても storage.set は冪等なので副作用はない。
   */
  await enableInlinePanelAutoshow(context);
  const sw = await extensionServiceWorker(context);
  await sw.evaluate(
    async ({
      widthMode,
      placement,
      floatingAnchor,
      touchFloatingAnchor,
      widthKey,
      placementKey,
      anchorKey,
      migratedKey
    }) => {
      const removeKeys = [];
      /** @type {Record<string, unknown>} */
      const save = {};
      if (widthMode == null) removeKeys.push(widthKey);
      else save[widthKey] = widthMode;
      if (placement == null) removeKeys.push(placementKey);
      else save[placementKey] = placement;
      if (touchFloatingAnchor) {
        if (floatingAnchor == null) removeKeys.push(anchorKey);
        else save[anchorKey] = floatingAnchor;
      }
      /* 移行フラグは常に true で固定し、content/background のワンショット再書き込みを封じる */
      save[migratedKey] = true;
      if (removeKeys.length) {
        await chrome.storage.local.remove(removeKeys);
      }
      if (Object.keys(save).length) {
        await chrome.storage.local.set(save);
      }
    },
    {
      widthMode: opts.widthMode ?? null,
      placement: opts.placement ?? null,
      floatingAnchor: opts.floatingAnchor ?? null,
      touchFloatingAnchor: opts.touchFloatingAnchor === true,
      widthKey: KEY_INLINE_PANEL_WIDTH_MODE,
      placementKey: KEY_INLINE_PANEL_PLACEMENT,
      anchorKey: KEY_INLINE_FLOATING_ANCHOR,
      migratedKey: KEY_INLINE_PANEL_FLOAT_TO_DOCK_MIGRATED
    }
  );
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
 * @param {import('@playwright/test').Page} page
 */
async function hostFloatingCornerMetrics(page) {
  return page.evaluate((hostId) => {
    const host = globalThis.document.getElementById(hostId);
    if (!host) return null;
    const st = globalThis.getComputedStyle(host);
    return {
      position: st.position,
      top: st.top,
      right: st.right,
      bottom: st.bottom,
      left: st.left,
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

  test('floating + bottom_left では fixed で左下に寄せる', async ({ context }) => {
    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'floating',
      floatingAnchor: 'bottom_left',
      touchFloatingAnchor: true
    });

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await page.evaluate(injectTwoColumnPlayerRow);

    await expect(page.locator(`#${INLINE_HOST_ID}`)).toBeVisible({ timeout: 25_000 });

    await expect
      .poll(() => hostFloatingCornerMetrics(page), { timeout: 25_000 })
      .toMatchObject({ position: 'fixed' });

    const m = await hostFloatingCornerMetrics(page);
    if (process.env.CI !== 'true') expect(m?.floatingClass).toBe(true);
    const bottom = Number.parseFloat(String(m?.bottom || ''));
    const left = Number.parseFloat(String(m?.left || ''));
    const top = Number.parseFloat(String(m?.top || ''));
    expect(Number.isFinite(bottom)).toBe(true);
    expect(Number.isFinite(left)).toBe(true);
    expect(Number.isFinite(top)).toBe(true);
    expect(bottom).toBeLessThanOrEqual(24);
    expect(left).toBeLessThanOrEqual(24);
    expect(top).toBeGreaterThan(80);
  });

  /*
   * Bug #3 回帰ガード: below → floating → below の往復で、floating モードが付けた
   * width / maxWidth / marginLeft / boxSizing / position / top / right ... がホスト
   * インラインスタイルに残留していないことを保証する。
   * 旧 clearInlineHostFloatingLayout は width / maxWidth / marginLeft / boxSizing を
   * reset 対象に入れていなかったため、below に戻した直後のパネル幅・余白が壊れていた。
   */
  test('below → floating → below で前モードの残留スタイルが消える（Bug #3 回帰ガード）', async ({
    context
  }) => {
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

    // floating へ
    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'floating'
    });
    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 25_000 })
      .toMatchObject({ display: 'block', position: 'fixed' });

    // below に戻す
    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'below'
    });

    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 25_000 })
      .toMatchObject({
        display: 'block',
        parentTag: 'BODY',
        prevElementId: 'mock-player-row',
        floatingClass: false
      });

    // インラインスタイル側の残留を直接検証（computed style ではなく element.style を見る）
    const residue = await page.evaluate((hostId) => {
      const host = globalThis.document.getElementById(hostId);
      if (!host) return null;
      return {
        position: host.style.position,
        top: host.style.top,
        right: host.style.right,
        bottom: host.style.bottom,
        maxHeight: host.style.maxHeight,
        zIndex: host.style.zIndex,
        boxShadow: host.style.boxShadow,
        borderRadius: host.style.borderRadius,
        background: host.style.background,
        hasFloatingClass: host.classList.contains('nls-inline-host--floating'),
        hasDockBottomClass: host.classList.contains('nls-inline-host--dock-bottom')
      };
    }, INLINE_HOST_ID);

    expect(residue, 'below に戻したあと host DOM が残っている').not.toBeNull();
    // floating 時に書いた inline style が「空文字」に戻っていることを確認
    expect(residue.position).toBe('');
    expect(residue.top).toBe('');
    expect(residue.right).toBe('');
    expect(residue.bottom).toBe('');
    expect(residue.maxHeight).toBe('');
    expect(residue.zIndex).toBe('');
    expect(residue.boxShadow).toBe('');
    expect(residue.borderRadius).toBe('');
    expect(residue.background).toBe('');
    expect(residue.hasFloatingClass).toBe(false);
    expect(residue.hasDockBottomClass).toBe(false);
  });

  /*
   * Bug #3 回帰ガード: dock_bottom → floating の遷移で、dock_bottom が付けた
   * width:100% / maxWidth:100% / borderRadius: '14px 14px 0 0' が残って
   * floating の丸角・幅を潰さないことを保証する。
   */
  test('dock_bottom → floating で下ドック由来の 100% 幅 / 角丸が floating を潰さない（Bug #3 回帰ガード）', async ({
    context
  }) => {
    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'dock_bottom'
    });

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });
    await page.evaluate(injectTwoColumnPlayerRow);

    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 25_000 })
      .toMatchObject({ display: 'block', position: 'fixed' });

    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'floating'
    });

    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 25_000 })
      .toMatchObject({ display: 'block', position: 'fixed' });

    const inline = await page.evaluate((hostId) => {
      const host = globalThis.document.getElementById(hostId);
      if (!host) return null;
      return {
        width: host.style.width,
        maxWidth: host.style.maxWidth,
        borderRadius: host.style.borderRadius,
        hasFloatingClass: host.classList.contains('nls-inline-host--floating'),
        hasDockBottomClass: host.classList.contains('nls-inline-host--dock-bottom')
      };
    }, INLINE_HOST_ID);

    expect(inline, 'floating に切り替えたあと host DOM が残っている').not.toBeNull();
    // floating が書き直したはずの値であり、dock_bottom の 100% / 上丸角のみ
    // ではないこと（残留チェック）
    expect(inline.hasFloatingClass).toBe(true);
    expect(inline.hasDockBottomClass).toBe(false);
    expect(inline.width).not.toBe('100%');
    expect(inline.maxWidth).not.toBe('100%');
    // floating は 14px 一律。dock_bottom の '14px 14px 0 0' 残留だと不等
    expect(inline.borderRadius).toBe('14px');
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

    await expect(page.locator(`#${INLINE_HOST_ID}`)).toBeVisible({ timeout: 25_000 });

    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 25_000 })
      .toMatchObject({
        display: 'block',
        parentTag: 'BODY',
        position: 'fixed'
      });

    if (process.env.CI !== 'true') {
      const floatCheck = await hostPlacementMetrics(page);
      expect(floatCheck?.floatingClass).toBe(true);
    }

    await setInlinePanelModes(context, {
      widthMode: null,
      placement: 'beside'
    });

    await expect
      .poll(() => hostPlacementMetrics(page), { timeout: 25_000 })
      .toMatchObject({
        display: 'block',
        parentId: 'mock-player-row',
        prevElementTag: 'VIDEO'
      });

    const metrics = await hostPlacementMetrics(page);
    expect(metrics?.position).not.toBe('fixed');
    if (process.env.CI !== 'true') expect(metrics?.floatingClass).toBe(false);
  });
});
