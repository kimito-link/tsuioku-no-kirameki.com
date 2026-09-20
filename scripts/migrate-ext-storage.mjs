/**
 * 拡張の記録データを「旧ID配下フォルダ」→「新ID配下フォルダ」へコピーする(一度だけ・v0.1.1529)。
 *
 * 背景:
 *   リロード固着の恒久根治で拡張に key を追加し ID を固定した(旧 edpell... → 新 ohif...)。
 *   Chrome は拡張の chrome.storage.local と IndexedDB を【拡張IDそのものの名前が付いたフォルダ】に
 *   保存するため、ID が変わると新IDからは旧記録が見えなくなる。このスクリプトは旧IDフォルダを
 *   新ID名でコピーして記録(135件+累計・コメント本体)をそのまま引き継ぐ。データ変換は一切しない。
 *
 * ★安全設計(記録を失わない):
 *   - コピーのみ。旧IDフォルダは【一切消さない】(移行成功を実機確認してから、ユーザーが手動で
 *     chrome://extensions から旧拡張を削除する)。
 *   - Chrome が生きていると LevelDB がロックされコピーが壊れるため、Chrome プロセスが動いていたら中止。
 *   - 新IDフォルダが既に在れば上書きしない(誤って二度流して記録を壊さない)。--force で明示上書き。
 *
 * 使い方(Chrome を完全終了してから):
 *   node scripts/migrate-ext-storage.mjs
 *   node scripts/migrate-ext-storage.mjs --profile "Profile 45"   # プロファイル指定
 *   node scripts/migrate-ext-storage.mjs --dry-run                # コピーせず対象だけ表示
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const OLD_ID = 'edpellgokebgpjboflekdmmlnjgajnfn';
const NEW_ID = 'ohifblceplfkfajfecaoaclmkiahfflm';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const profileArg = (() => {
  const i = args.indexOf('--profile');
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
})();

function chromeUserDataDir() {
  if (process.env.NL_CHROME_USER_DATA) return process.env.NL_CHROME_USER_DATA;
  const home = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || 'C:\\Users\\info', 'AppData', 'Local');
  return join(home, 'Google', 'Chrome', 'User Data');
}

/** Chrome が起動中か(Windows: tasklist で chrome.exe を探す)。 */
function isChromeRunning() {
  if (process.platform !== 'win32') return false;
  const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq chrome.exe', '/NH'], {
    encoding: 'utf8',
    windowsHide: true
  });
  return /chrome\.exe/i.test(r.stdout || '');
}

/** src→dest をコピー(robocopy /E=サブツリー含む・宛先は消さない=旧は無傷)。 */
function copyTree(src, dest) {
  if (process.platform === 'win32') {
    const r = spawnSync(
      'robocopy',
      [src, dest, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1'],
      { stdio: 'ignore', windowsHide: true }
    );
    const code = typeof r.status === 'number' ? r.status : 16;
    return code < 8; // 0-7 は成功
  }
  return false;
}

function main() {
  const userDataDir = chromeUserDataDir();
  const profiles = profileArg ? [profileArg] : ['Profile 45', 'Default'];

  if (!DRY_RUN && isChromeRunning()) {
    console.error(
      '\n🔴 Chrome が起動中です。記録フォルダ(LevelDB)がロックされ、コピーが壊れます。\n' +
        '   Chrome を完全に終了してから もう一度実行してください。\n'
    );
    process.exit(1);
  }

  let migratedAny = false;
  for (const profile of profiles) {
    const base = join(userDataDir, profile);
    if (!existsSync(base)) continue;

    // 移行対象3フォルダ: chrome.storage.local(LevelDB) と IndexedDB(leveldb + blob)。
    const jobs = [
      {
        label: 'chrome.storage.local',
        src: join(base, 'Local Extension Settings', OLD_ID),
        dest: join(base, 'Local Extension Settings', NEW_ID)
      },
      {
        label: 'IndexedDB(leveldb)',
        src: join(base, 'IndexedDB', `chrome-extension_${OLD_ID}_0.indexeddb.leveldb`),
        dest: join(base, 'IndexedDB', `chrome-extension_${NEW_ID}_0.indexeddb.leveldb`)
      },
      {
        label: 'IndexedDB(blob)',
        src: join(base, 'IndexedDB', `chrome-extension_${OLD_ID}_0.indexeddb.blob`),
        dest: join(base, 'IndexedDB', `chrome-extension_${NEW_ID}_0.indexeddb.blob`)
      }
    ];

    for (const job of jobs) {
      if (!existsSync(job.src)) {
        console.log(`  skip: ${profile} / ${job.label} — 旧データ無し(${job.src})`);
        continue;
      }
      if (existsSync(job.dest) && !FORCE) {
        console.log(
          `  skip: ${profile} / ${job.label} — 新IDフォルダが既に存在(上書きしない・--force で明示)`
        );
        continue;
      }
      if (DRY_RUN) {
        console.log(`  [dry-run] copy: ${job.src}\n            → ${job.dest}`);
        migratedAny = true;
        continue;
      }
      const okCopy = copyTree(job.src, job.dest);
      if (okCopy) {
        console.log(`  ✅ copied: ${profile} / ${job.label}`);
        migratedAny = true;
      } else {
        console.error(`  🔴 copy 失敗: ${profile} / ${job.label} (${job.src})`);
        process.exit(1);
      }
    }
  }

  if (!migratedAny) {
    console.log('\n移行対象が見つかりませんでした(旧データが無い・既に移行済み・プロファイル違い)。');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] 上の対象をコピーします(実コピーはしていません)。実行するには --dry-run を外してください。');
    process.exit(0);
  }

  console.log(
    '\n✅ 記録フォルダを新ID名でコピーしました(旧IDフォルダは無傷のまま残しています)。\n' +
      '   次の手順:\n' +
      '   1) Chrome を起動\n' +
      '   2) chrome://extensions で同期外フォルダ(例 C:\\nicolive-ext)を「読み込む」\n' +
      '   3) 状態速報の「記録N件」で記録が見えるか確認\n' +
      '   4) 見えたら初めて、旧IDの拡張を chrome://extensions から削除\n' +
      '   (万一 記録が見えなければ、新IDフォルダを消せば元の旧IDに戻せます=旧は無傷)\n'
  );
}

try {
  main();
} catch (e) {
  console.error('migrate-ext-storage が失敗:', e && e.message ? e.message : e);
  process.exit(1);
}
