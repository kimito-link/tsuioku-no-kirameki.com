import { test, expect } from './fixtures.js';

const MOCK_WATCH = 'http://127.0.0.1:3456/watch/lv888888888/';
const KEY_POPUP_FRAME = 'nls_popup_frame';

test.describe('watch page frame', () => {
  test('renders purikura-like frame on watch content area', async ({ context }) => {
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
      video.style.display = 'block';
      video.style.width = '100%';
      video.style.height = '100%';
      host.appendChild(video);

      doc.body.prepend(host);
      win.scrollTo(0, 0);
    });

    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const overlay = globalThis.document.getElementById(
              'nls-watch-prikura-frame'
            );
            if (!overlay) return false;
            const style = globalThis.getComputedStyle(overlay);
            return style.display !== 'none';
          }),
        { timeout: 20_000 }
      )
      .toBeTruthy();

    const metrics = await page.evaluate(() => {
      const doc = globalThis.document;
      const overlay = doc.getElementById('nls-watch-prikura-frame');
      const host = doc.getElementById('mock-player-host');
      const badges = overlay
        ? Array.from(overlay.querySelectorAll('.nls-frame-badge img')).map((img) =>
            img.getAttribute('src') || ''
          )
        : [];
      const hasDock = Boolean(doc.getElementById('nls-watch-prikura-dock'));
      if (!overlay || !host) {
        return {
          overlayWidth: 0,
          overlayHeight: 0,
          hostWidth: 0,
          hostHeight: 0,
          hasDock,
          badgeCount: badges.length,
          accent: '',
          badges
        };
      }
      const o = overlay.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      return {
        overlayWidth: Math.round(o.width),
        overlayHeight: Math.round(o.height),
        hostWidth: Math.round(h.width),
        hostHeight: Math.round(h.height),
        hasDock,
        badgeCount: badges.length,
        accent: globalThis.getComputedStyle(overlay)
          .getPropertyValue('--nls-frame-accent')
          .trim(),
        badges
      };
    });

    expect(metrics.overlayWidth).toBeGreaterThan(metrics.hostWidth);
    expect(metrics.overlayHeight).toBeGreaterThan(metrics.hostHeight);
    expect(metrics.hasDock).toBeFalsy();
    expect(metrics.badgeCount).toBe(0);
    expect(metrics.accent).toBe('#ea580c');
    expect(metrics.badges.length).toBe(0);
  });
});
