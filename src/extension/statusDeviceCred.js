/**
 * スマホ版の「利用者ごとの鍵」を拡張側で持つ部品(v0.1.1731・スマホ化 利用者ごとの鍵 第b段)。
 *   - 同意 ON で共有キーが無ければ、サーバー(POST /api/device)から鍵をもらって chrome.storage.local に置く。
 *   - 同意 OFF にしたら、サーバーのデータ(本体・ETag・鍵の記録)を消してから、ここの鍵も消す。
 *   - 送信が 401(鍵の記録がサーバーに無い)なら鍵を捨てる=次の描画でもらい直す。
 *   判定はすべて src/lib/devicePublishCredentials.js(純関数)。ここは fetch・storage・Web Locks だけ。
 *
 *   ★鍵をもらうのは status 画面(タブ)とサイドパネルの送信担当のどちらでも起こりうるので、
 *     Web Locks で1つに絞り、ロックの中で storage を読み直してから発行する(二重発行を防ぐ)。
 */

import { KEY_STATUS_DEVICE_CRED } from '../lib/storageKeys.js';
import {
  deviceApiUrl,
  parseDeviceCred,
  resolvePublishCredentials,
  shouldRegisterDevice
} from '../lib/devicePublishCredentials.js';
import { runStorageOpWithTimeout } from '../lib/storageOpTimeout.js';

const STORAGE_TIMEOUT_MS = 1_500;
const REGISTER_LOCK = 'nls-status-device-register';

/** @type {import('../lib/devicePublishCredentials.js').DeviceCred | null} */
let _cred = null;
let _registerInFlight = false;
let _lastRegisterAttemptAtMs = 0;

/** @param {string} defaultOrigin */
async function readCred(defaultOrigin) {
  const bag = await runStorageOpWithTimeout(
    () => chrome.storage.local.get(KEY_STATUS_DEVICE_CRED),
    STORAGE_TIMEOUT_MS
  );
  return parseDeviceCred(bag?.[KEY_STATUS_DEVICE_CRED], defaultOrigin);
}

/**
 * storage から読み直してキャッシュする(失敗時は「鍵なし」=送らない側に倒す)。
 * @param {string} defaultOrigin
 */
export async function refreshDeviceCredCache(defaultOrigin) {
  try {
    _cred = await readCred(defaultOrigin);
  } catch {
    _cred = null;
  }
  return _cred;
}

/**
 * 送るときに使う鍵(共有キー優先)。同期で呼べる(描画経路から呼ばれるため)。
 * @param {{ ingestKey?: string, viewToken?: string, appOrigin?: string }} uploadCfg
 */
export function getPublishCredentials(uploadCfg) {
  return resolvePublishCredentials(uploadCfg, _cred);
}

/**
 * 同意 ON で鍵が無ければ、鍵をもらいに行く(呼び出し側は待たなくてよい・失敗しても次の機会に再挑戦)。
 * @param {{ optedIn: boolean, uploadCfg: { ingestKey?: string, viewToken?: string, appOrigin?: string } }} a
 * @returns {Promise<void> | undefined} 行ったときだけ、終わりを待てる Promise
 */
export function maybeRegisterDevice(a) {
  const nowMs = Date.now();
  if (
    !shouldRegisterDevice({
      optedIn: a.optedIn,
      hasCredentials: Boolean(getPublishCredentials(a.uploadCfg)),
      inFlight: _registerInFlight,
      lastAttemptAtMs: _lastRegisterAttemptAtMs,
      nowMs
    })
  ) {
    return undefined;
  }
  _registerInFlight = true;
  _lastRegisterAttemptAtMs = nowMs;
  const appOrigin = String(a.uploadCfg.appOrigin || '');
  const run = async () => {
    // ロックの中で読み直す: 別の画面が先に発行していればそれを使う。
    const existing = await readCred(appOrigin);
    if (existing) {
      _cred = existing;
      return;
    }
    const res = await fetch(deviceApiUrl(appOrigin), { method: 'POST' });
    if (!res.ok) return;
    const got = parseDeviceCred({ ...(await res.json()), appOrigin }, appOrigin);
    if (!got) return;
    await chrome.storage.local.set({ [KEY_STATUS_DEVICE_CRED]: got });
    _cred = got;
  };
  const locks = globalThis.navigator?.locks;
  return (locks ? locks.request(REGISTER_LOCK, run) : run())
    .catch(() => {
      /* 次の機会に再挑戦(DEVICE_REGISTER_RETRY_MS 後) */
    })
    .finally(() => {
      _registerInFlight = false;
    });
}

/** 鍵を捨てる(サーバーには触らない)。送信が 401 のとき=サーバーにもう記録が無い。 */
export async function forgetDeviceCred() {
  _cred = null;
  _lastRegisterAttemptAtMs = 0;
  try {
    await chrome.storage.local.remove(KEY_STATUS_DEVICE_CRED);
  } catch {
    /* best-effort */
  }
}

/**
 * 同意 OFF: サーバーのデータを消してから鍵を捨てる。サーバーへの削除が失敗しても鍵は捨てる
 * (以後は送らない。サーバー側は24時間で消える・鍵の記録も30日で消える)。
 * @param {string} defaultOrigin
 * @returns {Promise<boolean>} サーバーの削除まで成功したか(鍵が無ければ true)
 */
export async function deleteDeviceOnServer(defaultOrigin) {
  let cred = _cred;
  try {
    cred = cred || (await readCred(defaultOrigin));
  } catch {
    /* 読めなければ消すものが分からない */
  }
  if (!cred) return true;
  let ok = false;
  try {
    const res = await fetch(deviceApiUrl(cred.appOrigin), {
      method: 'DELETE',
      headers: { 'x-device-id': cred.deviceId, 'x-write-key': cred.writeKey }
    });
    ok = res.ok || res.status === 401; // 401 = もう記録が無い=消えている
  } catch {
    ok = false;
  }
  await forgetDeviceCred();
  return ok;
}

/**
 * 閲覧URLを作り直す(漏れたときに古いURLを無効にする)。成功したら新しい閲覧トークンを保存して返す。
 * @returns {Promise<string | null>}
 */
export async function rotateDeviceViewToken() {
  const cred = _cred;
  if (!cred) return null;
  try {
    const res = await fetch(`${deviceApiUrl(cred.appOrigin)}?action=rotate`, {
      method: 'POST',
      headers: { 'x-device-id': cred.deviceId, 'x-write-key': cred.writeKey }
    });
    if (!res.ok) return null;
    const next = parseDeviceCred({ ...cred, viewToken: (await res.json())?.viewToken }, cred.appOrigin);
    if (!next) return null;
    await chrome.storage.local.set({ [KEY_STATUS_DEVICE_CRED]: next });
    _cred = next;
    return next.viewToken;
  } catch {
    return null;
  }
}

export { buildPublishBody, shouldForgetDeviceCred } from '../lib/devicePublishCredentials.js';
