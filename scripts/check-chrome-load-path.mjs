/**
 * Chrome が拡張を「同期フォルダ配下から」読み込んでいないか検査する(リロード固着の再発防止・v0.1.1529)。
 *
 * 背景(実証で確定・2026-09-20):
 *   この拡張のリロード固着の真因は「Chrome の unpacked ロード先が OneDrive+Resilio の二重同期
 *   フォルダ配下(<repo>/extension/)のまま」で、build が同期フォルダ内へ 1MB級ファイルを書くたびに
 *   同期エンジンが再ハッシュ → Chrome がフォルダ変更を検知して拡張を無効化(トグルOFF固着)していた。
 *   copy:ext は同期外 C:\nicolive-ext へミラーしていたが、Chrome はそこを読んでおらず対策が空振り。
 *
 * この検査(機械ゲート):
 *   Chrome プロファイルの Secure Preferences を全 Profile 走査し、この拡張(恒久ID/旧ID)の
 *   ロードパス(extensions.settings.<ID>.path)が同期フォルダ配下だったら【赤】にして張り替えを促す。
 *   MEMORY 原則「文書に書いても84版積まれた・判定はコードに置く」の実践。copy-ext.mjs の
 *   warnIfSynced(コピー先の検査)を、今度は【Chrome の実ロード先】へ適用する。
 *
 * 門と報の分離(MEMORY: bundle-gates):
 *   Chrome プロファイルが在る環境(=ローカル実機)でのみ判定=【門】(exit 1 で止める)。
 *   プロファイルが無い環境(CI の clone 等)は skip と明記=【合格ではない】(exit 0・報)。
 *
 * 使い方:
 *   node scripts/check-chrome-load-path.mjs             # 実機の Secure Preferences を検査
 *   node scripts/check-chrome-load-path.mjs --selftest  # 毒(同期パス)を食わせて赤が出るか自己検査
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

// 恒久ID(key由来・v0.1.1529〜・これが今後の正)。これが同期フォルダを読んでいたら
//   「張り替えたのに間違ったフォルダを指した」＝将来の再発＝【門】(exit 1 で止める)。
const PERMANENT_ID = 'ohifblceplfkfajfecaoaclmkiahfflm';
// 旧ID(パス由来・移行前)。これが同期フォルダを読んでいるのは「まだ張り替え前の暫定状態」＝
//   張り替えを促す【報】(警告は出すが commit は止めない)。張り替え完了後はこのエントリが消える。
const LEGACY_ID = 'edpellgokebgpjboflekdmmlnjgajnfn';
const EXTENSION_IDS = Object.freeze([PERMANENT_ID, LEGACY_ID]);

// 同期フォルダを示す語(小文字部分一致)。ロードパスにこれらが含まれたら固着リスク。
const SYNC_MARKERS = Object.freeze(['onedrive', 'resilio', 'dropbox', 'google drive']);

/** Chrome の User Data ルート(Windows 既定)。env NL_CHROME_USER_DATA で上書き可(テスト用)。 */
function chromeUserDataDir() {
  if (process.env.NL_CHROME_USER_DATA) return resolve(process.env.NL_CHROME_USER_DATA);
  const home = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || 'C:\\Users\\info', 'AppData', 'Local');
  return join(home, 'Google', 'Chrome', 'User Data');
}

/** User Data 配下の "Profile N" / "Default" ディレクトリ名を列挙する。 */
function listProfileDirs(userDataDir) {
  try {
    return readdirSync(userDataDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && (d.name === 'Default' || /^Profile\s*\d+$/i.test(d.name)))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * 1つの Secure Preferences から、対象拡張のロードパスを取り出す。
 * @param {string} securePrefsPath
 * @returns {Array<{id:string,path:string}>} 見つかった (ID, path) の配列
 */
function extractLoadPaths(securePrefsPath) {
  const found = [];
  let json;
  try {
    json = JSON.parse(readFileSync(securePrefsPath, 'utf8'));
  } catch {
    return found;
  }
  const settings = json?.extensions?.settings;
  if (!settings || typeof settings !== 'object') return found;
  for (const id of EXTENSION_IDS) {
    const entry = settings[id];
    const p = entry && typeof entry.path === 'string' ? entry.path : '';
    if (p) found.push({ id, path: p });
  }
  return found;
}

/** ロードパスが同期フォルダ配下か。 */
function isSyncedPath(p) {
  const low = String(p).toLowerCase();
  return SYNC_MARKERS.some((m) => low.includes(m));
}

/**
 * User Data ルートを検査して結果を返す(純関数寄り・テストから呼べる)。
 * @param {string} userDataDir
 * @returns {{present:boolean, offenders:Array<{profile:string,id:string,path:string}>, scanned:number}}
 */
export function inspectChromeLoadPaths(userDataDir) {
  if (!existsSync(userDataDir)) return { present: false, offenders: [], scanned: 0 };
  const profiles = listProfileDirs(userDataDir);
  const offenders = [];
  let scanned = 0;
  for (const profile of profiles) {
    const securePrefs = join(userDataDir, profile, 'Secure Preferences');
    if (!existsSync(securePrefs)) continue;
    scanned += 1;
    for (const { id, path: p } of extractLoadPaths(securePrefs)) {
      if (isSyncedPath(p)) offenders.push({ profile, id, path: p });
    }
  }
  return { present: profiles.length > 0, offenders, scanned };
}

/** 毒(同期パス)を食わせて赤が出るか自己検査する。 */
function runSelftest() {
  const os = process.platform;
  // 一時ディレクトリに偽の User Data を作る。
  const tmpRoot = join(process.env.TEMP || process.env.TMP || '.', `nl-clp-selftest-${Date.now()}`);
  const profileDir = join(tmpRoot, 'Profile 45');
  mkdirSync(profileDir, { recursive: true });
  const poisoned = {
    extensions: {
      settings: {
        edpellgokebgpjboflekdmmlnjgajnfn: {
          path: 'C:\\Users\\info\\OneDrive\\デスクトップ\\Resilio\\github\\tsuioku-no-kirameki.com\\extension',
          location: 4
        }
      }
    }
  };
  writeFileSync(join(profileDir, 'Secure Preferences'), JSON.stringify(poisoned), 'utf8');
  // 恒久IDが同期フォルダを読む毒(=門になるべきケース)も足す。
  const permProfile = join(tmpRoot, 'Profile 2');
  mkdirSync(permProfile, { recursive: true });
  const permPoisoned = {
    extensions: {
      settings: {
        [PERMANENT_ID]: {
          path: 'C:\\Users\\info\\OneDrive\\デスクトップ\\Resilio\\github\\tsuioku-no-kirameki.com\\extension',
          location: 4
        }
      }
    }
  };
  writeFileSync(join(permProfile, 'Secure Preferences'), JSON.stringify(permPoisoned), 'utf8');
  // 健全ケースも足す(同期外パス→検出されないこと)。
  const cleanProfile = join(tmpRoot, 'Profile 1');
  mkdirSync(cleanProfile, { recursive: true });
  const clean = {
    extensions: {
      settings: {
        [PERMANENT_ID]: { path: 'C:\\nicolive-ext', location: 4 }
      }
    }
  };
  writeFileSync(join(cleanProfile, 'Secure Preferences'), JSON.stringify(clean), 'utf8');

  let failures = 0;
  const res = inspectChromeLoadPaths(tmpRoot);
  // 旧IDの毒(同期フォルダ)は offenders に出るべき(報として警告に使う)。
  if (!res.offenders.some((o) => o.id === LEGACY_ID)) {
    console.error('SELFTEST FAIL: 旧IDの同期フォルダ・ロードパス(毒)を検出できませんでした');
    failures += 1;
  }
  // 恒久IDの毒(同期フォルダ)も offenders に出るべき(門の対象)。
  if (!res.offenders.some((o) => o.id === PERMANENT_ID && o.path.toLowerCase().includes('onedrive'))) {
    console.error('SELFTEST FAIL: 恒久IDの同期フォルダ・ロードパス(毒)を検出できませんでした');
    failures += 1;
  }
  // 健全(C:\nicolive-ext)は検出されてはならない。
  if (res.offenders.some((o) => o.path.toLowerCase().includes('nicolive-ext'))) {
    console.error('SELFTEST FAIL: 同期外パス(C:\\nicolive-ext)を誤検出しました');
    failures += 1;
  }
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* no-op */
  }
  if (os !== 'win32') console.log('(注: 非 Windows 環境での selftest・パス表記は Windows 形式)');
  if (failures === 0) {
    console.log('check:chrome-load-path selftest OK (毒→赤・健全→緑 を確認)');
    process.exit(0);
  }
  process.exit(1);
}

function main() {
  if (process.argv.includes('--selftest')) {
    runSelftest();
    return;
  }

  const userDataDir = chromeUserDataDir();
  const res = inspectChromeLoadPaths(userDataDir);

  if (!res.present) {
    // 【報】プロファイルが無い環境(CI 等)。合格ではなく skip。
    console.log(
      'check:chrome-load-path skip: Chrome プロファイルが見つかりません' +
        `(${userDataDir})。★対象外であって合格ではない(実機でのみ判定)。`
    );
    process.exit(0);
  }

  if (res.offenders.length === 0) {
    console.log(
      `check:chrome-load-path OK: ${res.scanned} プロファイルを検査・同期フォルダからのロードは無し。`
    );
    process.exit(0);
  }

  const permanentOffenders = res.offenders.filter((o) => o.id === PERMANENT_ID);
  const legacyOffenders = res.offenders.filter((o) => o.id === LEGACY_ID);

  // 【報】旧IDが同期フォルダを読んでいる=まだ張り替え前の暫定状態。警告は出すが止めない。
  if (legacyOffenders.length > 0) {
    console.warn('\n⚠ 旧ID(移行前)がまだ【同期フォルダ配下】から読み込まれています(張り替え前の暫定状態):');
    for (const o of legacyOffenders) {
      console.warn(`   - ${o.profile}: path=${o.path}`);
    }
    console.warn(
      '   → 記録移行(scripts/migrate-ext-storage.mjs)後、chrome://extensions で旧拡張を削除し\n' +
        '     同期外フォルダ(例 C:\\nicolive-ext)を読み込み直すと、この警告は消えます。\n'
    );
  }

  // 【門】恒久IDが同期フォルダを読んでいる=張り替えたのに間違った先を指した=再発。止める。
  if (permanentOffenders.length > 0) {
    console.error('\n🔴 恒久IDの拡張が【同期フォルダ配下】から読み込まれています(リロード固着が再発します):');
    for (const o of permanentOffenders) {
      console.error(`   - ${o.profile}: path=${o.path}`);
    }
    console.error(
      '\n   対処: chrome://extensions でこの拡張を削除し、同期外フォルダ(例 C:\\nicolive-ext)を\n' +
        '        「パッケージ化されていない拡張機能を読み込む」で読み込み直してください。\n' +
        '        (key 固定済みなので ID は変わらず、移行済みの記録はそのまま残ります)\n'
    );
    process.exit(1);
  }

  // 旧ID警告のみ=止めない(暫定状態を許容)。
  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error('check:chrome-load-path が失敗:', e && e.message ? e.message : e);
  process.exit(1);
}
