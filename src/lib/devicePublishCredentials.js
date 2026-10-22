/**
 * 【層】L0 判定層(純粋関数)
 * 【この箱に入るもの】スマホ版への送信で「どの鍵で送るか」(共有キー/利用者ごとの鍵)の決定・利用者の鍵の形の検査・
 *   鍵をもらいに行ってよいかの判定・送信結果から鍵を捨てるべきかの判定
 * 【この箱に入らないもの】fetch・chrome.storage・Web Locks(src/extension/statusDeviceCred.js 側)
 *
 * ★なぜ(v0.1.1731・スマホ化 利用者ごとの鍵 第b段):
 *   サーバー側(v0.1.1730・api/device.js)で利用者ごとの鍵を発行できるようにした。拡張は
 *   「同意 ON なのに共有キーが無い」(=ストア版の利用者)ときに鍵をもらい、その鍵で送る。
 *   ★共有キー(開発者の診断用)があればそちらを優先する(今の送信は何も変えない)。
 * @module devicePublishCredentials
 */

import { isValidDeviceId, isValidWriteKey } from './deviceAuth.js';

const VIEW_TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
/** 鍵をもらいに行くのに失敗したあと、次に試すまでの間隔(サーバーの乱発制限は1時間5回)。 */
export const DEVICE_REGISTER_RETRY_MS = 15 * 60 * 1000;

/**
 * @typedef {{ deviceId: string, writeKey: string, viewToken: string, appOrigin: string }} DeviceCred
 * @typedef {{
 *   mode: 'shared' | 'device',
 *   viewToken: string,
 *   appOrigin: string,
 *   headers: Record<string, string>
 * }} PublishCredentials
 */

/**
 * 保存された利用者の鍵を読む。形が違えば null(=鍵が無い扱い・もらい直す)。
 * @param {unknown} raw
 * @param {string} defaultOrigin
 * @returns {DeviceCred | null}
 */
export function parseDeviceCred(raw, defaultOrigin) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (!isValidDeviceId(o.deviceId) || !isValidWriteKey(o.writeKey)) return null;
  if (typeof o.viewToken !== 'string' || !VIEW_TOKEN_RE.test(o.viewToken)) return null;
  const appOrigin = typeof o.appOrigin === 'string' && o.appOrigin.trim() ? o.appOrigin.trim() : defaultOrigin;
  return {
    deviceId: /** @type {string} */ (o.deviceId),
    writeKey: /** @type {string} */ (o.writeKey),
    viewToken: o.viewToken,
    appOrigin
  };
}

/**
 * どの鍵で送るか。★共有キー(書き込みキー+閲覧トークン)が揃っていれば必ずそちら(開発者の診断の送信は不変)。
 * 無ければ利用者の鍵。どちらも無ければ null(=送れない)。
 * @param {{ ingestKey?: string, viewToken?: string, appOrigin?: string } | null | undefined} uploadCfg
 * @param {DeviceCred | null | undefined} deviceCred
 * @returns {PublishCredentials | null}
 */
export function resolvePublishCredentials(uploadCfg, deviceCred) {
  const cfg = uploadCfg || {};
  if (cfg.ingestKey && cfg.viewToken) {
    return {
      mode: 'shared',
      viewToken: cfg.viewToken,
      appOrigin: String(cfg.appOrigin || ''),
      headers: { 'Content-Type': 'application/json', 'x-share-key': cfg.ingestKey }
    };
  }
  if (deviceCred) {
    return {
      mode: 'device',
      viewToken: deviceCred.viewToken,
      appOrigin: deviceCred.appOrigin,
      headers: {
        'Content-Type': 'application/json',
        'x-device-id': deviceCred.deviceId,
        'x-write-key': deviceCred.writeKey
      }
    };
  }
  return null;
}

/**
 * 鍵をもらいに行ってよいか。★同意していなければ絶対に行かない(鍵の発行もサーバーとの通信なので)。
 * @param {{ optedIn?: boolean, hasCredentials?: boolean, inFlight?: boolean, lastAttemptAtMs?: number, nowMs?: number }} a
 * @returns {boolean}
 */
export function shouldRegisterDevice(a) {
  if (!a || a.optedIn !== true) return false;
  if (a.hasCredentials === true || a.inFlight === true) return false;
  const last = Number(a.lastAttemptAtMs) || 0;
  if (last <= 0) return true;
  return (Number(a.nowMs) || 0) - last >= DEVICE_REGISTER_RETRY_MS;
}

/**
 * 利用者の鍵で送った結果、鍵を捨ててもらい直すべきか。
 *   401 = サーバーに鍵の記録が無い(30日使わず消えた・削除済み)。ほかの失敗(429/5xx/通信)では捨てない。
 * @param {'shared' | 'device' | null | undefined} mode
 * @param {number | null | undefined} httpStatus
 */
export function shouldForgetDeviceCred(mode, httpStatus) {
  return mode === 'device' && httpStatus === 401;
}

/**
 * 送る本文。共有キー経路は従来どおり閲覧トークン v を載せる。利用者の鍵ではサーバーが書き込み先を決めるので載せない。
 * @param {PublishCredentials} creds
 * @param {Record<string, unknown>} jsonBlob
 */
export function buildPublishBody(creds, jsonBlob) {
  return creds.mode === 'shared' ? { ...jsonBlob, v: creds.viewToken } : { ...jsonBlob };
}

/** @param {string} appOrigin */
export function deviceApiUrl(appOrigin) {
  return `${String(appOrigin ?? '').replace(/\/+$/, '')}/api/device`;
}
