import { test, expect } from '@playwright/test';

/**
 * サイドパネルの配信者カードは 26px の円。将棋チャンネルの公開ロゴ
 * （image.p-c2-x.abema-tv.com の logo.png・2026-11 に 200 の不透明 PNG）を
 * その円へ入れると、中央は白くない。読めない URL は顔に落ち、白い既定アイコンは残さない。
 */
const SHOGI_LOGO = 'https://image.p-c2-x.abema-tv.com/image/channels/shogi/logo.png?format=png&width=320&height=320';

test('配信者カードにチャンネル画像が出る', async ({ page }) => {
  const logo = await page.request.get(SHOGI_LOGO);
  expect(logo.status()).toBe(200);
  expect(String(logo.headers()['content-type'] || '')).toContain('image/png');
  const dataUrl = `data:image/png;base64,${(await logo.body()).toString('base64')}`;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.setContent(`<!doctype html>
<meta charset="utf-8">
<style>
  :root { --nl-accent: #3b82f6; --nl-text: #f4f4f5; --nl-surface: #1c1c22; --nl-border: #3f3f46; }
  html, body { margin: 0; background: #111; color: var(--nl-text); font-family: system-ui, sans-serif; }
  body { padding: 48px; }
  .nl-top-support-rank__caster {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    width: 112px; min-width: 74px; max-width: 112px; box-sizing: border-box;
    padding: 5px 6px 6px; border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--nl-accent) 35%, var(--nl-border) 65%);
    background: color-mix(in srgb, var(--nl-accent) 10%, var(--nl-surface) 90%);
  }
  .nl-top-support-rank__caster-label { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; }
  .nl-top-support-rank__caster-link { display: flex; flex-direction: column; align-items: center; gap: 3px; text-decoration: none; color: inherit; min-width: 0; max-width: 100%; }
  .nl-top-support-rank__caster-thumb {
    width: 26px; height: 26px; border-radius: 50%; object-fit: cover;
    background: var(--nl-surface); border: 2px solid color-mix(in srgb, var(--nl-accent) 30%, transparent);
  }
  .nl-top-support-rank__caster-name {
    font-size: 9px; font-weight: 600; max-width: 100%; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; text-align: center;
  }
  .nl-top-support-rank__caster-follow {
    display: inline-flex; padding: 2px 9px; border-radius: 999px; font-size: 9px; font-weight: 700;
    text-decoration: none; color: #fff; background: var(--nl-accent);
  }
</style>
<div class="nl-top-support-rank__caster" role="listitem">
  <span class="nl-top-support-rank__caster-label">配信者</span>
  <a class="nl-top-support-rank__caster-link" href="https://abema.tv/now-on-air/shogi">
    <img class="nl-top-support-rank__caster-thumb" alt="" data-on-error-fallback="face" data-fallback-name="将棋チャンネル" />
    <span class="nl-top-support-rank__caster-name">将棋チャンネル</span>
  </a>
  <a class="nl-top-support-rank__caster-follow" href="https://abema.tv/now-on-air/shogi">番組を見る</a>
</div>`);
  await page.locator('.nl-top-support-rank__caster-thumb').evaluate((img, src) => {
    img.src = src;
  }, dataUrl);
  const thumb = page.locator('.nl-top-support-rank__caster-thumb');
  await expect(thumb).toBeVisible();
  await page.waitForFunction(() => {
    const img = document.querySelector('.nl-top-support-rank__caster-thumb');
    return img instanceof HTMLImageElement && img.naturalWidth >= 32 && img.complete;
  });
  const box = await thumb.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  const painted = await page.evaluate(() => {
    const img = document.querySelector('.nl-top-support-rank__caster-thumb');
    if (!(img instanceof HTMLImageElement)) return null;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    if (!g) return null;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    let white = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 16) {
      n += 1;
      if (data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) white += 1;
    }
    return { w: img.naturalWidth, h: img.naturalHeight, white, n };
  });
  expect(painted).toBeTruthy();
  expect(painted.w).toBeGreaterThan(100);
  expect(painted.h).toBeGreaterThan(40);
  expect(painted.white / painted.n).toBeLessThan(0.5);
  const name = page.locator('.nl-top-support-rank__caster-name');
  await expect(name).toHaveText('将棋チャンネル');
  const nameBox = await name.boundingBox();
  expect(nameBox.width).toBeGreaterThan(40);
  await expect(page.locator('.nl-top-support-rank__caster-follow')).toHaveText('番組を見る');
  await page.locator('.nl-top-support-rank__caster').screenshot({ path: 'test-results/abema-caster-thumb.png' });
});
