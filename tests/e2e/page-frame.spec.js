import { test, expect } from './fixtures.js';
import { E2E_MOCK_WATCH_URL as MOCK_WATCH } from './constants.js';
const KEY_POPUP_FRAME = 'nls_popup_frame';

test.describe('watch page frame', () => {
  test('動画周りの装飾オーバーレイ（#nls-watch-prikura-frame）は常に非表示', async ({
    context
  }) => {
    let sw = context.serviceWorkers()[0];
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 60_000 });
    }

    await sw.evaluate(async ({ key }) => {
      await chrome.storage.local.set({ [key]: 'sunset' });
    }, { key: KEY_POPUP_FRAME });

    const page = await context.newPage();
    await page.goto(MOCK_WATCH, { waitUntil: 'load', timeout: 60_000 });

    await page.evaluate(() => {
      const doc = globalThis.document;
      const win = globalThis.window;
      const small = doc.getElementById('e2e-mock-video');
      if (small) small.remove();

      const host = doc.createElement('section');
      host.id = 'mock-player-host';
      host.style.width = '960px';
      host.style.height = '540px';
      host.style.margin = '12px 0 20px';
      host.style.background = '#111827';
      host.style.borderRadius = '14px';
      host.style.overflow = 'hidden';

      const video = doc.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('width', '960');
      video.setAttribute('height', '540');
      video.style.display = 'block';
      video.style.width = '100%';
      video.style.height = '100%';
      host.appendChild(video);

      doc.body.prepend(host);
      win.scrollTo(0, 0);
      win.dispatchEvent(new Event('resize'));
    });

    await page.waitForTimeout(1500);

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const overlay = globalThis.document.getElementById(
              'nls-watch-prikura-frame'
            );
            if (!overlay) return null;
            return globalThis.getComputedStyle(overlay).display;
          }),
        { timeout: 25_000 }
      )
      .toBe('none');

    const hasDock = await page.evaluate(() =>
      Boolean(globalThis.document.getElementById('nls-watch-prikura-dock'))
    );
    expect(hasDock).toBeFalsy();
  });
});
