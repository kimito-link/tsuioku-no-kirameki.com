/**
 * Android のアイコンとスプラッシュを、iPhone と同じ原版から作る(cap add android / cap sync のあとに呼ぶ)。
 *
 * ■ 使い方(mobile/ で・または mobile の写しで)
 *   node scripts/prepare-android-assets.mjs            … カレントディレクトリを mobile とみなす
 *   node scripts/prepare-android-assets.mjs <dir>      … <dir> を mobile とみなす
 *
 * ■ なぜ別ファイルか
 *   テスト用 APK(build-android-debug.mjs)と Google Play 用 AAB(.github/workflows/android-play-release.yml)の
 *   両方が同じ作り方をする。片方だけ直して食い違わないよう、ここ1か所に置く。
 *
 * ■ アイコン
 *   Android の丸いアイコン(adaptive icon)は前景と背景の2枚が要る。原版(store-assets/appstore/app-icon-1024.png)から、
 *   背景=原版そのまま・前景=透明、を作る。原版1枚(icon-only)だけ渡すと前景が Capacitor の既定ロゴのまま残り、
 *   前景に縮めた原版を重ねると背景の原版と二重に見える(どちらも 2026-10-31 エミュレータで実測)。
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || process.cwd());
const master = path.join(DIR, 'store-assets', 'appstore', 'app-icon-1024.png');
const assets = path.join(DIR, 'assets');
if (!existsSync(master)) throw new Error(`アイコンの原版がありません: ${master}`);
if (!existsSync(path.join(assets, 'splash.png'))) throw new Error(`スプラッシュの原版がありません: ${path.join(assets, 'splash.png')}`);
if (!existsSync(path.join(DIR, 'android', 'app'))) throw new Error(`android/ がありません。先に npx cap add android を実行してください: ${DIR}`);

// pnpm は依存を実体フォルダの隣に置くので、リンクを実体へたどってから探す。
const sharp = createRequire(realpathSync(path.join(DIR, 'node_modules', '@capacitor', 'assets', 'package.json')))('sharp');
await sharp(master).png().toFile(path.join(assets, 'icon-only.png'));
await sharp(master).png().toFile(path.join(assets, 'icon-background.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .png()
  .toFile(path.join(assets, 'icon-foreground.png'));

const brand = JSON.parse(readFileSync(path.join(DIR, 'app.config.json'), 'utf8')).brand || {};
const bg = brand.splashBackgroundColor || '#FFF7EC';
const cmd = `npx @capacitor/assets generate --android --assetPath assets --splashBackgroundColor "${bg}" --splashBackgroundColorDark "${brand.splashBackgroundColorDark || bg}"`;
console.log(`> ${cmd}`);
execSync(cmd, { cwd: DIR, stdio: 'inherit' });
