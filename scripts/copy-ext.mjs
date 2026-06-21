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

async function main() {
  if (!existsSync(srcDir)) {
    console.error(`コピー元 extension/ が見つかりません: ${srcDir}`);
    process.exit(1);
  }
  warnIfSynced(destDir);

  // Windows は robocopy で丸ごとミラー(/MIR=コピー先を完全同期・消し残し無し)。
  //   Node の fs.cpSync は Windows で大きめツリーをコピーすると native crash(0xC0000409)する個体が
  //   あるため(2026-06-22 実機で確認)、堅牢な robocopy を使う。robocopy の終了コードは 0-7 が成功。
  if (process.platform === 'win32') {
    const r = spawnSync(
      'robocopy',
      [srcDir, destDir, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1'],
      { stdio: 'ignore', windowsHide: true }
    );
    const code = typeof r.status === 'number' ? r.status : 16;
    if (code >= 8) {
      console.error(`robocopy が失敗しました(exit=${code})。コピー先の権限/パスを確認してください: ${destDir}`);
      process.exit(1);
    }
  } else {
    // 非 Windows(将来用): Node の cpSync を使う。
    const { cpSync, rmSync, mkdirSync } = await import('node:fs');
    if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true });
    mkdirSync(destDir, { recursive: true });
    cpSync(srcDir, destDir, { recursive: true });
  }

  let version = '?';
  try {
    version = JSON.parse(readFileSync(resolve(srcDir, 'manifest.json'), 'utf8')).version;
  } catch {
    /* no-op */
  }

  console.log(`\n✅ 拡張を同期外フォルダへコピーしました(v${version})`);
  console.log(`   コピー元: ${srcDir}`);
  console.log(`   コピー先: ${destDir}`);
  console.log('\n次の手順:');
  console.log('  初回だけ: chrome://extensions →「パッケージ化されていない拡張機能を読み込む」→ 上のコピー先を選ぶ');
  console.log('  2回目以降: chrome://extensions でこの拡張の更新ボタン(🔄)を押す');
  console.log('  → これで OneDrive/Resilio がファイルを触らないので、再読み込みが固着しません。\n');
}

main().catch((e) => {
  console.error('コピーに失敗しました:', e && e.message ? e.message : e);
  process.exit(1);
});
