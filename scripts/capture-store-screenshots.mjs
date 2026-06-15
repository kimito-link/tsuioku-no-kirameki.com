/**
 * Chrome ウェブストア用スクショ自動撮影
 *
 * dns-osint-pro-ver2.0 の capture-store-screenshots.mjs から移植 (2026-06-07)。
 * 出力済み HTML(セッションレポート / status.html を保存したもの等)を
 * 1280x800 でスクロールしながら 5 枚に切り出す。
 *
 * 使い方:
 *   node scripts/capture-store-screenshots.mjs <HTMLのパス> [出力枚数]
 * 例:
 *   node scripts/capture-store-screenshots.mjs "C:/Users/info/Downloads/kirameki-report.html"
 *   node scripts/capture-store-screenshots.mjs ./extension/status.html 5
 *
 * メモ: Playwright の channel 既定(bundled chromium)を使う。拡張ロードは不要
 * (HTML を直接開くだけ)。Web Store は 1280x800 / 640x400 のみ受付なので
 * deviceScaleFactor は必ず 1 固定 (DSF=2 だと 2560x1600 で弾かれる)。
 *
 * 出力: store-assets/screenshot-1〜N-1280x800.png
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import url from 'node:url';

const W = 1280;
const H = 800;
const OUT_DIR = 'store-assets';

async function main() {
  const reportArg = process.argv[2];
  const shots = Math.max(1, parseInt(process.argv[3] || '5', 10));
  if (!reportArg) {
    console.error('使い方: node scripts/capture-store-screenshots.mjs <HTMLのパス> [出力枚数=5]');
    process.exit(1);
  }
  const reportPath = path.resolve(reportArg);
  if (!fs.existsSync(reportPath)) {
    console.error('ファイルが見つかりません:', reportPath);
    process.exit(1);
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const fileUrl = url.pathToFileURL(reportPath).href;
  console.log('📄 HTML を開きます:', fileUrl);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  // details(折りたたみ)を全開にして中身を見せる
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => (d.open = true));
  });
  await page.waitForTimeout(1200);

  const fullHeight = await page.evaluate(() => document.body.scrollHeight);
  console.log(`📐 ページ全高: ${fullHeight}px → ${shots} 枚に分割 (各 ${H}px)`);

  const positions = [];
  for (let i = 0; i < shots; i++) {
    const denom = shots > 1 ? shots - 1 : 1;
    let y = Math.round((fullHeight - H) * (i / denom));
    y = Math.max(0, Math.min(y, Math.max(0, fullHeight - H)));
    positions.push(y);
  }

  for (let i = 0; i < shots; i++) {
    const y = positions[i];
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(400);
    const out = path.join(OUT_DIR, `screenshot-${i + 1}-1280x800.png`);
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
    console.log(`  ✅ ${out} (scrollY=${y})`);
  }

  await browser.close();
  console.log(`🎉 完了: ${OUT_DIR}/screenshot-1〜${shots}-1280x800.png (各 1280x800)`);
}

main().catch((e) => {
  console.error('撮影失敗:', e);
  process.exit(1);
});
