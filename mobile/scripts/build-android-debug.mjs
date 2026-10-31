/**
 * Android アプリ(テスト用 APK)を PC で作り、つないだ Android 端末に入れる。
 *
 * ■ 使い方(mobile/ で)
 *   node scripts/build-android-debug.mjs            … APK を作る
 *   node scripts/build-android-debug.mjs --install  … 作って、adb でつないだ端末(実機/エミュレータ)に入れて起動する
 *
 * ■ なぜ別フォルダで作るか
 *   Android のビルド(Gradle)は、パスに日本語(「デスクトップ」)があると止まる
 *   (Android Gradle Plugin の非 ASCII パス検査)。さらに同期フォルダ(OneDrive)の中で作ると
 *   数百 MB の中間ファイルが同期される。だから mobile/ の中身を C:\tsuioku-mobile-build へ写して、そこで作る。
 *   android/ はコミットしない(iOS の ios/ と同じ・毎回 cap add で作る)。
 *
 * ■ アイコン
 *   Android の丸いアイコン(adaptive icon)は前景と背景の2枚が要る。iPhone と同じ 1024 の原版
 *   (store-assets/appstore/app-icon-1024.png)から、背景=原版そのまま・前景=透明、を作る。
 *   原版1枚(icon-only)だけ渡すと前景が Capacitor の既定ロゴのまま残る(2026-10-31 エミュレータで実測)。
 *
 * ■ これは「テスト用」。Google Play 用の署名つき AAB は作らない(配布はまだ決めていない)。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.TSUIOKU_ANDROID_BUILD_DIR || 'C:\\tsuioku-mobile-build';
const JAVA_HOME = process.env.JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr';
const INSTALL = process.argv.includes('--install');
const APP_ID = 'com.kimito.link.tsuioku';
/** 写さないもの(作り直せる物・iOS 用・中間物)。 */
const SKIP = new Set(['node_modules', 'android', 'ios', 'build', 'dist', 'ios-screenshots']);

const run = (/** @type {string} */ cmd, /** @type {string} */ cwd = OUT) => {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, JAVA_HOME } });
};

// 1. ASCII パス・同期外のフォルダへ写す
//   ★fs.cpSync は使わない: Node 22 の Windows で日本語パスを渡すとプロセスごと落ちる
//   (終了コード 0xC0000409・何も出さずに止まる。2026-10-31 実測)。1ファイルずつ写す。
/** @param {string} from @param {string} to */
const copyTree = (from, to) => {
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from, { withFileTypes: true })) {
    if (from === SRC && SKIP.has(e.name)) continue;
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyTree(a, b);
    else if (e.isFile()) copyFileSync(a, b);
  }
};
copyTree(SRC, OUT);
run('pnpm install --frozen-lockfile');

// 2. webDir(server.url で本番を開くので中身は仮でよい・iOS の CI と同じ)
mkdirSync(path.join(OUT, 'dist', 'public'), { recursive: true });
const index = path.join(OUT, 'dist', 'public', 'index.html');
if (!existsSync(index)) writeFileSync(index, '<!doctype html><html><head><meta charset="utf-8"><title>追憶のきらめき</title></head><body>loading...</body></html>');

// 3. Android の土台(無ければ作る)と、プラグインの取り込み
if (!existsSync(path.join(OUT, 'android', 'app'))) run('npx cap add android');
run('npx cap sync android');

// 4. アイコンとスプラッシュ
// pnpm は依存を実体フォルダの隣に置くので、リンクを実体へたどってから探す。
const sharp = createRequire(realpathSync(path.join(OUT, 'node_modules', '@capacitor', 'assets', 'package.json')))('sharp');
const master = path.join(OUT, 'store-assets', 'appstore', 'app-icon-1024.png');
const assets = path.join(OUT, 'assets');
await sharp(master).png().toFile(path.join(assets, 'icon-only.png'));
// 背景=原版そのまま(端まで絵がある)・前景=透明。丸く切られて見えるのは中央(りんくの顔)になる。
//   前景に縮めた原版を重ねると、背景の原版と二重に見える(2026-10-31 エミュレータで実測)。
await sharp(master).png().toFile(path.join(assets, 'icon-background.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .png()
  .toFile(path.join(assets, 'icon-foreground.png'));
const brand = JSON.parse(readFileSync(path.join(OUT, 'app.config.json'), 'utf8')).brand || {};
const bg = brand.splashBackgroundColor || '#FFF7EC';
run(`npx @capacitor/assets generate --android --assetPath assets --splashBackgroundColor "${bg}" --splashBackgroundColorDark "${brand.splashBackgroundColorDark || bg}"`);

// 5. テスト用 APK
run(`"${path.join(OUT, 'android', 'gradlew.bat')}" assembleDebug --no-daemon -q`, path.join(OUT, 'android'));
const apk = path.join(OUT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(apk)) throw new Error(`APK ができていません: ${apk}`);
console.log(`\nAPK: ${apk}`);

// 6. 端末へ
if (INSTALL) {
  run(`adb install -r "${apk}"`);
  run(`adb shell monkey -p ${APP_ID} -c android.intent.category.LAUNCHER 1`);
}
