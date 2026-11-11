import { test, expect } from '@playwright/test';
import { VENUE_PICKUP_CSS, venuePickupDisplayWidth } from '../../src/lib/venuePickupBanner.js';

/**
 * サイドパネルの開閉は窓の幅を変える。一度細く書いた幅が、窓が広がったあとも残らないこと。
 * 実ページのサイドパネルそのものではなく、同じ幅の計算をブラウザの窓で縮めて戻す。
 */
test('PICK UP の幅は窓を細くしたあと、広げると元に戻る', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.setContent(`<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: #111; }
  video { display: block; width: 960px; height: 540px; background: #222; }
  .nlsb-root { position: relative; width: 100%; height: 100vh; }
  ${VENUE_PICKUP_CSS}
</style>
<div class="nlsb-root">
  <video></video>
  <div class="nlsb-pickup">
    <span class="nlsb-pickup__badge">PICK UP</span>
    <span class="nlsb-pickup__main">
      <span class="nlsb-pickup__meta">枠好きの人</span>
      <span class="nlsb-pickup__body">無敵の笑顔で荒らすなんて、そんなことできるわけがない</span>
    </span>
  </div>
</div>`);

  const apply = async () => {
    const measured = await page.evaluate(() => {
      const video = document.querySelector('video').getBoundingClientRect();
      return { video: video.width, vw: window.innerWidth };
    });
    const width = venuePickupDisplayWidth(measured.video, measured.vw);
    const box = await page.evaluate((px) => {
      const el = document.querySelector('.nlsb-pickup');
      el.style.setProperty('width', `${px}px`, 'important');
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), inline: el.style.width };
    }, width);
    return { ...measured, width, box };
  };

  const wide = await apply();
  expect(wide.width).toBe(860);
  expect(wide.box.w).toBeGreaterThanOrEqual(800);

  await page.setViewportSize({ width: 720, height: 800 });
  await page.evaluate(() => { document.querySelector('video').style.width = '640px'; });
  const narrow = await apply();
  expect(narrow.width).toBeLessThan(wide.width);
  expect(narrow.box.w).toBeLessThan(wide.box.w);

  await page.setViewportSize({ width: 1400, height: 800 });
  await page.evaluate(() => { document.querySelector('video').style.width = '960px'; });
  const back = await apply();
  expect(back.width).toBe(860);
  expect(back.box.w).toBeGreaterThanOrEqual(800);
  expect(back.box.inline).toBe('860px');
});
