/**
 * 拡張を「同期対象外フォルダ」へコピーする(Chrome の再読み込み固着の根治)。
 *
 * 背景(2026-06-22 ユーザー実機で確定):
 *   リポジトリは OneDrive + Resilio の二重同期フォルダ配下
 *   (C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com)。
 *   Chrome の「パッケージ化されていない拡張機能」を、この同期フォルダの extension/ から
 *   直接ロードすると、ビルド/同期がファイルを書き換えるたびに Chrome が「フォルダが変わった」と
 *   検知して拡張を【無効化・再読み込みループ】する=何度リロードしても OFF に戻る。
 *
 * 解決:
 *   extension/ を同期対象外の普通のフォルダ(既定 C:\nicolive-ext)へコピーし、Chrome には
 *   【そのコピー先】をロードさせる。コピー先は同期されないのでリロードが固着しない。
 *   更新したいときは `npm run copy:ext` → Chrome で更新ボタン、の2手順。
 *
 * ★v0.1.1529(atomic swap 化): 以前は robocopy /MIR で「宛先を完全ミラー」していたが、/MIR は
 *   宛先の余分ファイルを削除するため【Chrome が読んでいる最中に一瞬ファイルが消える】瞬間があり、
 *   それ自体が固着を誘発し得た。今は「staging(<dest>.staging)へ全コピー → 本名を .old へ退避 →
 *   staging を本名へ rename」の atomic swap にする。Chrome が読む本名フォルダは常に完全な状態を保つ。
 *
 * 使い方:
 *   npm run copy:ext               # 既定 C:\nicolive-ext へコピー
 *   NL_EXT_DEST=D:\myext npm run copy:ext   # コピー先を変えたいとき
 *
 * Chrome 側(初回だけ):
 *   chrome://extensions →「パッケージ化されていない拡張機能を読み込む」→ コピー先フォルダを選ぶ。
 *   以降は `npm run copy:ext` 後に Chrome の更新ボタン(🔄)を押すだけ。
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
// リリース工程ガード「版混在の実行時検知」(2026-07-06): コピー前後の BUILD_ID を出し、
//   「Chrome をリロードするまで版混在の状態が続く」ことを毎回明示する。
import { extractBundleBuildId } from '../src/lib/bundleBuildId.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const srcDir = resolve(repoRoot, 'extension');

// コピー先(同期対象外)。env NL_EXT_DEST で上書き可。既定 C:\nicolive-ext。
const destDir = process.env.NL_EXT_DEST
  ? resolve(process.env.NL_EXT_DEST)
  : resolve('C:\\nicolive-ext');

/** コピー先が同期フォルダ配下でないか(自己矛盾の検知)。 */
function warnIfSynced(p) {
  const low = p.toLowerCase();
  if (low.includes('onedrive') || low.includes('resilio') || low.includes('dropbox') || low.includes('google drive')) {
    console.warn(
      `\n⚠️ コピー先 "${p}" は同期フォルダ配下のようです。これだと固着が直りません。\n` +
        '   NL_EXT_DEST に同期されない普通のフォルダ(例 C:\\nicolive-ext)を指定してください。\n'
    );
  }
}

/**
 * コピー先(既存)の代表バンドルから NL_BUILD_ID を読む。コピー先が未作成/ファイルが無ければ '不明'。
 *   リリース工程ガード「版混在の実行時検知」(2026-07-06)の一部: コピー前後で BUILD_ID がどう
 *   変わったかを出し、「Chrome をリロードするまで版混在が続く」ことを毎回明示する。
 * @param {string} dir extension ディレクトリ(コピー元/コピー先どちらにも使う)
 * @returns {string}
 */
function readBuildIdFromDir(dir) {
  try {
    const text = readFileSync(resolve(dir, 'dist', 'popup.js'), 'utf8');
    return extractBundleBuildId(text);
  } catch {
    return '不明';
  }
}

async function main() {
  if (!existsSync(srcDir)) {
    console.error(`コピー元 extension/ が見つかりません: ${srcDir}`);
    process.exit(1);
  }
  warnIfSynced(destDir);

  // コピーで置き換えられる前に、コピー先(旧)の BUILD_ID を読んでおく。
  const oldBuildId = readBuildIdFromDir(destDir);

  // ★atomic swap: Chrome が読む本名フォルダ(destDir)を一瞬も壊さないために、
  //   1) staging(destDir.staging)へ全コピー → 2) 本名を .old へ退避 → 3) staging を本名へ rename。
  //   rename は同一ボリューム内なら原子的。Chrome から見て destDir は「古い完全版」か「新しい完全版」の
  //   どちらかであり、「中身が消えかけた不完全版」を読む瞬間が無い。
  const stagingDir = `${destDir}.staging`;
  const oldDir = `${destDir}.old`;
  if (process.platform === 'win32') {
    const { rmSync, existsSync: exists, renameSync } = await import('node:fs');
    // 前回の中断残骸を掃除。
    if (exists(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
    if (exists(oldDir)) rmSync(oldDir, { recursive: true, force: true });
    // 1) srcDir → stagingDir を robocopy /MIR でミラー(staging は Chrome が読んでいないので /MIR 安全)。
    //   Node の fs.cpSync は Windows で大きめツリーをコピーすると native crash(0xC0000409)する個体が
    //   あるため(2026-06-22 実機で確認)、堅牢な robocopy を使う。終了コードは 0-7 が成功。
    const r = spawnSync(
      'robocopy',
      [srcDir, stagingDir, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1'],
      { stdio: 'ignore', windowsHide: true }
    );
    const code = typeof r.status === 'number' ? r.status : 16;
    if (code >= 8) {
      console.error(`robocopy が失敗しました(exit=${code})。コピー先の権限/パスを確認してください: ${stagingDir}`);
      process.exit(1);
    }
    // 2)+3) 本名を .old へ退避 → staging を本名へ(rename は原子的)。初回は本名が無いので退避を飛ばす。
    if (exists(destDir)) renameSync(destDir, oldDir);
    renameSync(stagingDir, destDir);
    // 退避した旧版を後片付け(Chrome はもう新本名を読むので旧は不要)。
    if (exists(oldDir)) rmSync(oldDir, { recursive: true, force: true });
  } else {
    // 非 Windows(将来用): Node の cpSync で staging を作ってから rename。
    const { cpSync, rmSync, mkdirSync, existsSync: exists, renameSync } = await import('node:fs');
    if (exists(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
    if (exists(oldDir)) rmSync(oldDir, { recursive: true, force: true });
    mkdirSync(stagingDir, { recursive: true });
    cpSync(srcDir, stagingDir, { recursive: true });
    if (exists(destDir)) renameSync(destDir, oldDir);
    renameSync(stagingDir, destDir);
    if (exists(oldDir)) rmSync(oldDir, { recursive: true, force: true });
  }

  let version = '?';
  try {
    version = JSON.parse(readFileSync(resolve(srcDir, 'manifest.json'), 'utf8')).version;
  } catch {
    /* no-op */
  }

  // コピー後(新)の BUILD_ID。コピー先はもう robocopy でコピー元と同じ内容になっている。
  const newBuildId = readBuildIdFromDir(destDir);

  console.log(`\n✅ 拡張を同期外フォルダへコピーしました(v${version})`);
  console.log(`   コピー元: ${srcDir}`);
  console.log(`   コピー先: ${destDir}`);
  console.log(`   BUILD_ID: ${oldBuildId} → ${newBuildId}`);
  console.log(
    '   ⚠ Chrome に反映するには chrome://extensions でリロードが必要です(それまで版混在の状態です)。'
  );
  console.log('\n次の手順:');
  console.log('  初回だけ: chrome://extensions →「パッケージ化されていない拡張機能を読み込む」→ 上のコピー先を選ぶ');
  console.log('  2回目以降: chrome://extensions でこの拡張の更新ボタン(🔄)を押す');
  console.log('  → これで OneDrive/Resilio がファイルを触らないので、再読み込みが固着しません。\n');
}

main().catch((e) => {
  console.error('コピーに失敗しました:', e && e.message ? e.message : e);
  process.exit(1);
});
