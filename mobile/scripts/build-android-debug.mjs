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
 *   作り方は scripts/prepare-android-assets.mjs(Google Play 用の CI と共用)。
 *
 * ■ これは「テスト用」。Google Play 用の署名つき AAB は .github/workflows/android-play-release.yml が作る。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
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

// 4. アイコンとスプラッシュ(Google Play 用の CI と同じ作り方・prepare-android-assets.mjs)
run(`node "${path.join(OUT, 'scripts', 'prepare-android-assets.mjs')}" "${OUT}"`);

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
