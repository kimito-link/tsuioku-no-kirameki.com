/**
 * iOS 起動時の白フラッシュ対策（最小・必要十分）。
 * CI の `npx cap copy ios` 後に実行する。
 *
 * 直す白の正体（実機録画で確認）:
 *   アイコンタップ → 起動アニメ → WKWebView が server.url を読みに行く間、
 *   ネイティブの下地が白いまま見える（本番 HTML 到着前なので web 側の
 *   インライン CSS では塗れない領域）。
 *
 * 対策は2点だけ。富士山の最前面 UIWindow / Bridge VC ポーリング等の重装備は、
 * server.url リモート構成では過剰なので入れない（AGENTS.md「作り分けない」方針）。
 *   1. Info.plist  UIUserInterfaceStyle=Dark（ダークに固定）
 *   2. LaunchScreen.storyboard の背景を #0A0A0F に
 * WebView 下地は capacitor.config.json の backgroundColor:#0A0A0FFF が担当。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
// モノレポ対応: Capacitor の ios/ ディレクトリは env IOS_PROJECT_DIR で指定する
// （malwarecheck は apps/mobile/ios）。未指定ならリポ直下 ios/（後方互換）。
const IOS_DIR = path.resolve(root, process.env.IOS_PROJECT_DIR || 'ios');
const iosApp = path.join(IOS_DIR, 'App', 'App');
const plist = path.join(iosApp, 'Info.plist');
const launchStoryboard = path.join(iosApp, 'Base.lproj', 'LaunchScreen.storyboard');

// 起動下地色。env SPLASH_BG_HEX（#RRGGBB）で可変。既定は金型の #0A0A0F。
// malwarecheck は #0F1B2D（DESIGN.md surface-dark）を CI から渡す。
const BG_HEX = (process.env.SPLASH_BG_HEX || '#0A0A0F').replace('#', '');
const R = String(parseInt(BG_HEX.slice(0, 2), 16) / 255);
const G = String(parseInt(BG_HEX.slice(2, 4), 16) / 255);
const B = String(parseInt(BG_HEX.slice(4, 6), 16) / 255);

// 画面の明暗。env IOS_UI_STYLE(Dark / Light)で可変。既定は金型の Dark。
// tsuioku は明るいクリーム地(DESIGN.md)なので Light を CI から渡す(暗転させると吹き出し等の色が変わる)。
const UI_STYLE = process.env.IOS_UI_STYLE === 'Light' ? 'Light' : 'Dark';

function plistBuddy(args) {
  execSync(`/usr/libexec/PlistBuddy ${args.map((a) => `"${a}"`).join(' ')}`, {
    stdio: 'inherit',
  });
}

function patchPlist() {
  if (!existsSync(plist)) {
    console.warn('patch-ios-launch-dark: skip Info.plist (missing)');
    return;
  }
  try {
    plistBuddy(['-c', 'Print :UIUserInterfaceStyle', plist]);
    plistBuddy(['-c', `Set :UIUserInterfaceStyle ${UI_STYLE}`, plist]);
  } catch {
    plistBuddy(['-c', `Add :UIUserInterfaceStyle string ${UI_STYLE}`, plist]);
  }
  console.log(`patch-ios-launch-dark: UIUserInterfaceStyle=${UI_STYLE}`);
}

async function patchLaunchStoryboard() {
  if (!existsSync(launchStoryboard)) {
    console.warn('patch-ios-launch-dark: skip LaunchScreen.storyboard (missing)');
    return;
  }
  let xml = await readFile(launchStoryboard, 'utf8');
  const colorTag = `<color key="backgroundColor" red="${R}" green="${G}" blue="${B}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>`;
  if (xml.includes('key="backgroundColor"')) {
    xml = xml.replace(/<color key="backgroundColor"[^/]*\/>/g, colorTag);
  } else if (xml.includes('<view key="view"')) {
    xml = xml.replace(/(<view key="view"[^>]*>)/, `$1\n                        ${colorTag}`);
  } else {
    console.warn('patch-ios-launch-dark: LaunchScreen has no recognizable view/color node');
    return;
  }
  await writeFile(launchStoryboard, xml, 'utf8');
  console.log(`patch-ios-launch-dark: LaunchScreen background -> #${BG_HEX}`);
}

async function main() {
  if (!existsSync(IOS_DIR)) {
    console.warn(`patch-ios-launch-dark: ${IOS_DIR} not found — skip (local or non-iOS job)`);
    return;
  }
  patchPlist();
  await patchLaunchStoryboard();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
