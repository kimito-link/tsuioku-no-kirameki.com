/**
 * 【層】L0 判定層(純粋関数)
 * 【この箱に入るもの】スマホ版の「利用者ごとの鍵」の形の検査・Redis のキー名・1日の上限の判定・送るまとめの絞り込み
 * 【この箱に入らないもの】乱数・ハッシュ計算(node:crypto を使う api/device.js / api/status.js 側)・Redis への通信
 *
 * ★なぜ(v0.1.1730・スマホ化 利用者ごとの鍵 第a段):
 *   スマホの WEB版へ送る書き込み認証は共有キー1本(STATUS_INGEST_KEY)で、ストア版には入らない
 *   (NL_STORE_BUILD=1)=一般の利用者はスマホ版を使えなかった。利用者ごとに鍵を発行し、
 *   書き込み先(閲覧トークン)は【サーバーが鍵から決める】=他人の閲覧トークンを指定して上書きできない。
 *   利用者ごとの1日の上限と全体の上限で、費用が利用者数で暴走しないようにする。
 *   計画書: /mnt/project-files/smartphone/plan-4-per-user-keys.md(保存24時間・1日4,000回は 2026-10-21 りんく了承)。
 * @module deviceAuth
 */

import { pickLiveForCard } from './liveviewCurrentLive.js';

/** 利用者の鍵の形(base64url)。deviceId は16バイト=22文字・writeKey は32バイト=43文字で発行する。 */
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const WRITE_KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;

/** スマホ版の保存期間(秒)。★2026-10-21 りんく了承: 7日→24時間(配信が終わったら翌日には消える)。 */
export const STATUS_TTL_SECONDS = 24 * 60 * 60;
/** 鍵の記録の保存期間(秒)。送信のたびに延ばす=使っている間は消えない。30日使わなければ消える(拡張は発行し直す)。 */
export const DEVICE_TTL_SECONDS = 30 * 24 * 60 * 60;
/**
 * 利用者ごとの1日の送信上限。v0.1.1736: 4,000→12,000(スマホで開いている間は約5秒間隔=約16時間分)。
 *   4,000 は 20秒間隔で約22時間分として 2026-10-21 りんく了承。12,000 は速さ 第2段(2026-10-22 りんく「ぜんぶやって」)。
 *   全体の上限(DEFAULT_GLOBAL_DAILY_LIMIT)は据え置き=1日の費用の天井は変わらない。
 */
export const DEFAULT_DEVICE_DAILY_LIMIT = 12_000;
/** v0.1.1736: スマホが開いている目印の寿命(秒)。スマホは約5秒ごとに取りに来るので、来なくなって30秒で消える。 */
export const VIEWER_ACTIVE_TTL_SEC = 30;
/** 全体の1日の書き込み上限の既定(env STATUS_GLOBAL_DAILY_LIMIT で上書き)。超えたら全員を生存確認の間隔に落とす。 */
export const DEFAULT_GLOBAL_DAILY_LIMIT = 200_000;
/**
 * v0.1.1755: 全体の【月】の書き込み上限の既定(env STATUS_GLOBAL_MONTHLY_LIMIT で上書き)。
 *   ★費用の天井(設計書 design-3 §8: 月$50〜70)。1回の書き込みで Upstash を約9コマンド使う
 *   (鍵の照合・上限3つの INCR・本体と ETag の SET・期限の延長・スマホの目印2つ)。
 *   200万回 × 9 = 1,800万コマンド ≒ 月$36(従量 $0.2/10万)。残りを読み取り(スマホの取りに行く分)と通信量に残す。
 *   1日の上限(20万回)を30日続けると600万回=月の上限が先に効く。超えたら全員を生存確認の間隔に落とす(1日の上限と同じ)。
 */
export const DEFAULT_GLOBAL_MONTHLY_LIMIT = 2_000_000;
/** 月の数え直しのキーの寿命(秒)。月をまたいでも残るよう40日。 */
export const MONTH_QUOTA_TTL_SECONDS = 40 * 24 * 60 * 60;
/** 発行(register)の乱発対策: 送信元ごとの1時間あたりの回数。 */
export const DEFAULT_REGISTER_HOURLY_LIMIT = 5;
/** 上限に当たったときに拡張へ伝える「次に送るまでの秒数」(拡張の生存確認の間隔=120秒と揃える)。 */
export const QUOTA_RETRY_AFTER_SEC = 120;

/** @param {unknown} v */
export function isValidDeviceId(v) {
  return typeof v === 'string' && DEVICE_ID_RE.test(v);
}

/** @param {unknown} v */
export function isValidWriteKey(v) {
  return typeof v === 'string' && WRITE_KEY_RE.test(v);
}

/** UTC の日付(YYYYMMDD)。上限の数え直しの区切り。 @param {number} nowMs */
export function utcDay(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10).replace(/-/g, '');
}

/** UTC の年月(YYYYMM)。月の上限の区切り。 @param {number} nowMs */
export function utcMonth(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 7).replace(/-/g, '');
}

/** UTC の日付+時(YYYYMMDDHH)。 @param {number} nowMs */
export function utcHour(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 13).replace(/[-T]/g, '');
}

/** Redis のキー名(ここだけで決める=api/device.js と api/status.js で食い違わない)。 */
export const deviceKeys = {
  /** @param {string} id */
  device: (id) => `device:${id}`,
  /** @param {string} id @param {number} nowMs */
  deviceQuota: (id, nowMs) => `quota:dev:${id}:${utcDay(nowMs)}`,
  /** @param {number} nowMs */
  globalQuota: (nowMs) => `quota:all:${utcDay(nowMs)}`,
  /** v0.1.1755: 全体の月の書き込み回数。 @param {number} nowMs */
  globalMonthQuota: (nowMs) => `quota:allm:${utcMonth(nowMs)}`,
  /** @param {string} who 送信元のハッシュ @param {number} nowMs */
  registerRate: (who, nowMs) => `rl:reg:${who}:${utcHour(nowMs)}`,
  /** @param {string} token */
  latest: (token) => `status:latest:${token}`,
  /** @param {string} token */
  etag: (token) => `status:etag:${token}`,
  /** v0.1.1736: いまスマホがこの閲覧トークンを開いているかの目印(中身は '1' だけ・30秒で消える)。 @param {string} token */
  viewing: (token) => `status:viewing:${token}`
};

/**
 * 保存された鍵の記録を読む。形が違えば null(=認証失敗側に倒す)。
 * @param {unknown} raw Redis の GET 結果(JSON 文字列)
 * @returns {{ h: string, v: string, c: number } | null}
 */
export function parseDeviceRecord(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let o;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  if (typeof o.h !== 'string' || !/^[0-9a-f]{64}$/.test(o.h)) return null;
  if (typeof o.v !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(o.v)) return null;
  return { h: o.h, v: o.v, c: Number(o.c) || 0 };
}

/**
 * 同じ長さの16進文字列を、長さ以外で時間差が出ないように比べる(writeKey のハッシュ照合)。
 * @param {unknown} a
 * @param {unknown} b
 */
export function hexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 上限の判定(利用者の1日・全体の1日・全体の月)。INCR した【後】の値で判定する(超えた1回目から断る)。
 *   monthCount を渡さない古い呼び出しは月の判定を飛ばす(0 扱い)。
 * @param {{ deviceCount: number, deviceLimit?: number, globalCount: number, globalLimit?: number, monthCount?: number, monthLimit?: number }} a
 * @returns {{ allow: boolean, reason: 'ok' | 'device_quota' | 'global_quota' | 'global_month_quota', globalWarn: boolean }}
 */
export function quotaVerdict(a) {
  const deviceLimit = Number(a.deviceLimit) > 0 ? Number(a.deviceLimit) : DEFAULT_DEVICE_DAILY_LIMIT;
  const globalLimit = Number(a.globalLimit) > 0 ? Number(a.globalLimit) : DEFAULT_GLOBAL_DAILY_LIMIT;
  const monthLimit = Number(a.monthLimit) > 0 ? Number(a.monthLimit) : DEFAULT_GLOBAL_MONTHLY_LIMIT;
  const d = Number(a.deviceCount) || 0;
  const g = Number(a.globalCount) || 0;
  const m = Number(a.monthCount) || 0;
  const globalWarn = g >= globalLimit * 0.8 || m >= monthLimit * 0.8;
  if (d > deviceLimit) return { allow: false, reason: 'device_quota', globalWarn };
  if (g > globalLimit) return { allow: false, reason: 'global_quota', globalWarn };
  if (m > monthLimit) return { allow: false, reason: 'global_month_quota', globalWarn };
  return { allow: true, reason: 'ok', globalWarn };
}

/**
 * 利用者経由の送信では保存しない欄(診断の全文=利用者のスマホに不要・第三者情報を減らす)。
 *   v0.1.1735: スマホが読まない overview(配信一覧の文章・WEB版は lives から作り直す)と
 *   supportersParity(PC の診断用の突き合わせ)も落とす。拡張も送る前に同じ表で落とす=送る量も減る。
 */
export const DEVICE_DROPPED_FIELDS = Object.freeze(['statusReport', 'fastDiag', 'overview', 'supportersParity']);

/**
 * 利用者経由の送信から、保存しない欄を落とす(元の物は変えない)。
 * 共有キー経路(開発者の診断用)には使わない。
 *   v0.1.1752: lives[] は【スマホが映す1配信だけ】に絞る(pickLiveForCard=鏡が指す配信・無ければ先頭)。
 *   PC で同時に開いている他の配信をサーバーへ送らない=送る量と第三者情報を減らし、
 *   リアルタイム化で「1配信=チャンネル1本」にできる(design-3-realtime-DRAFT.md の準備)。
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function stripDeviceBody(body) {
  const out = { ...body };
  delete out.v;
  for (const k of DEVICE_DROPPED_FIELDS) delete out[k];
  if (Array.isArray(out.lives)) {
    const shown = pickLiveForCard(out);
    out.lives = shown ? [shown] : [];
  }
  return out;
}
