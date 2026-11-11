import { test, expect } from '@playwright/test';
import { VENUE_PICKUP_CSS } from '../../src/lib/venuePickupBanner.js';

/**
 * ABEMA 実機: PICK UP が親の細い flex と max-width:100% で 1 文字幅になり、
 * 本文が「ウ / ホ。」、名前が「9...」になっていた。
 * 窓 1280px・親 180px・ホストが全 div を min-width:0 / max-width:100% / break-all にしても、
 * 吹き出しは 300px 以上、本文は 2 行以内、名前は省略されない。
 */
test('PICK UP は細い親とホスト CSS の中でも読める幅', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.setContent(`<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; background: #111; }
  body { display: flex; width: 180px; align-items: flex-start; }
  div.nlsb-pickup, div.nlsb-pickup span {
    max-width: 40px !important;
    min-width: 0 !important;
    width: 40px !important;
    word-break: break-all !important;
    flex-shrink: 1 !important;
    zoom: 0.5 !important;
    transform: scale(0.4) !important;
  }
  .host { width: 180px; height: 400px; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  ${VENUE_PICKUP_CSS}
</style>
<div class="host">
  <div class="nlsb-root">
    <div class="nlsb-pickup">
      <span class="nlsb-pickup__badge">PICK UP</span>
      <span class="nlsb-pickup__main">
        <span class="nlsb-pickup__body">ウホ。今日も配信ありがとう</span>
        <span class="nlsb-pickup__meta">A2AmVn58ed3nrb</span>
      </span>
    </div>
  </div>
</div>`);
  const bubble = page.locator('.nlsb-pickup');
  const box = await bubble.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(300);
  const measure = await page.evaluate(() => {
    const body = document.querySelector('.nlsb-pickup__body');
    const meta = document.querySelector('.nlsb-pickup__meta');
    const line = parseFloat(getComputedStyle(body).lineHeight) || 25;
    return {
      bodyH: body.getBoundingClientRect().height,
      line,
      metaW: meta.getBoundingClientRect().width,
      meta: meta.textContent
    };
  });
  expect(measure.bodyH).toBeLessThan(measure.line * 3);
  expect(measure.metaW).toBeGreaterThan(80);
  expect(measure.meta).toBe('A2AmVn58ed3nrb');
  // 幅の断言は細い親のままで済んでいる。スクショは吹き出し全体が窓に入る位置で撮る。
  await page.evaluate(() => {
    const host = document.querySelector('.host');
    host.style.width = '100vw';
    host.style.overflow = 'visible';
    document.body.style.width = '100vw';
  });
  await page.screenshot({ path: 'test-results/abema-pickup-width.png' });
});
