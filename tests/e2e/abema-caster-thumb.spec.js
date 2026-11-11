import { test, expect } from '@playwright/test';

/**
 * ABEMA 実機: 配信者カードの丸い画像が空で、名前だけ「ABEMA NEWSチャンネル |...」と
 * フォローボタンが出ていた。チャンネル画像を渡すと 26px の円に絵が入り、
 * 名前とフォローはそのまま読める。
 */
test('配信者カードにチャンネル画像が出る', async ({ page }) => {
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
  <a class="nl-top-support-rank__caster-link" href="https://abema.tv/now-on-air/abema-news">
    <img class="nl-top-support-rank__caster-thumb" alt="" />
    <span class="nl-top-support-rank__caster-name">ABEMA NEWSチャンネル</span>
  </a>
  <a class="nl-top-support-rank__caster-follow" href="https://abema.tv/now-on-air/abema-news">フォロー</a>
</div>
<script>
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e60012';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff';
  g.font = 'bold 42px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('NEWS', 64, 68);
  document.querySelector('.nl-top-support-rank__caster-thumb').src = c.toDataURL('image/png');
</script>`);
  const thumb = page.locator('.nl-top-support-rank__caster-thumb');
  await expect(thumb).toBeVisible();
  await page.waitForFunction(() => {
    const img = document.querySelector('.nl-top-support-rank__caster-thumb');
    return img instanceof HTMLImageElement && img.naturalWidth >= 32 && img.complete;
  });
  const box = await thumb.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  const name = page.locator('.nl-top-support-rank__caster-name');
  await expect(name).toHaveText('ABEMA NEWSチャンネル');
  const nameBox = await name.boundingBox();
  expect(nameBox.width).toBeGreaterThan(40);
  await expect(page.locator('.nl-top-support-rank__caster-follow')).toHaveText('フォロー');
  await page.locator('.nl-top-support-rank__caster').screenshot({ path: 'test-results/abema-caster-thumb.png' });
});
