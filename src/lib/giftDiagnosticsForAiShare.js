/**
 * AI共有・ギフト帯／NDGR ギフト経路の調査用サマリ（純関数・PII 最小）
 */

import { normalizeGiftThrowCount } from './giftRecord.js';

/** AI に渡す調査ヒント（静的・個人情報なし） */
export const GIFT_PIPELINE_AI_HINTS_JA = [
  'ギフト行は page-intercept（MAIN）が NDGR バイナリから Gift をデコードし postMessage→content で merge される（キー nls_gift_users_<lv>）。',
  'data-nls-ndgr の g（ギフト件数）が 0 のままならデコード経路・ワイヤ形式変更を疑う。c が増えるなら NDGR 自体は生きている。',
  'ストレージに行があるのに popup 帯が空なら prepareGiftRankStrip の broadcaster 除外・refreshGiftRankStrip・世代ガードを疑う。',
  'content の liveId と URL の lv が不一致なら NLS_INTERCEPT_GIFT_USERS 書き込みが別キーに逃げている可能性。',
  'recentErrors の gift / giftNickInterceptUpgrade を優先して読む。',
  'NLS_EXPORT_INTERCEPT_CACHE は frameId=0（トップ）が正。サブフレームのみ ok で items=0 はノイズになりやすい。',
  'イベント累計・順位・イベント名が欠けるときは UI.popupLayout.officialStatsPresence・content.giftDiagnostics.officialHudPageState・giftHudLastAttr を見る（NDGR field5 無し／closed shadow／未参加の切り分け）。'
];

/**
 * page-intercept が html に載せる `data-nls-ndgr`（例: `s=1 c=100 g=5 d=10`）を解析する。
 * @param {string|null|undefined} raw
 * @returns {{ stats: number|null, chats: number|null, gifts: number|null, decoded: number|null, parseOk: boolean }}
 */
export function parseDataNlsNdgrAttr(raw) {
  const s = String(raw || '').trim();
  const out = {
    stats: /** @type {number|null} */ (null),
    chats: /** @type {number|null} */ (null),
    gifts: /** @type {number|null} */ (null),
    decoded: /** @type {number|null} */ (null),
    parseOk: false
  };
  if (!s) return out;
  const pick = /** @param {string} letter */ (letter) => {
    const m = s.match(new RegExp(`\\b${letter}=(\\d+)`, 'i'));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  out.stats = pick('s');
  out.chats = pick('c');
  out.gifts = pick('g');
  out.decoded = pick('d');
  out.parseOk =
    out.stats != null ||
    out.chats != null ||
    out.gifts != null ||
    out.decoded != null;
  return out;
}

/**
 * `nls_gift_users_<lv>` の生データから集計（ユーザー表示名は含めない）
 * @param {unknown} raw
 */
export function summarizeGiftStorageForDiagnostics(raw) {
  /** @type {'missing'|'empty_array'|'non_array'|'ok'} */
  let shape = 'missing';
  let rowCount = 0;
  let totalThrows = 0;
  let maxThrow = 0;
  let rowsMissingUserId = 0;
  let rowsZeroThrowNormalized = 0;

  if (raw == null) {
    return {
      shape,
      rowCount,
      totalThrows,
      maxThrow,
      rowsMissingUserId,
      rowsZeroThrowNormalized,
      note: /** @type {string|null} */ (null)
    };
  }
  if (!Array.isArray(raw)) {
    shape = 'non_array';
    return {
      shape,
      rowCount: 0,
      totalThrows: 0,
      maxThrow: 0,
      rowsMissingUserId: 0,
      rowsZeroThrowNormalized: 0,
      note:
        'ストレージ値が配列以外。古いデータや破損の可能性。期待は StoredGiftUserWithThrows[]。'
    };
  }
  if (raw.length === 0) {
    shape = 'empty_array';
    return {
      shape,
      rowCount: 0,
      totalThrows: 0,
      maxThrow: 0,
      rowsMissingUserId: 0,
      rowsZeroThrowNormalized: 0,
      note: /** @type {string|null} */ (null)
    };
  }

  shape = 'ok';
  rowCount = raw.length;
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      rowsMissingUserId++;
      continue;
    }
    const o = /** @type {Record<string, unknown>} */ (row);
    const uid = String(o.userId ?? '').trim();
    if (!uid) rowsMissingUserId++;
    const tc = normalizeGiftThrowCount(o.throwCount);
    totalThrows += tc;
    if (tc > maxThrow) maxThrow = tc;
    if (tc <= 0) rowsZeroThrowNormalized++;
  }

  return {
    shape,
    rowCount,
    totalThrows,
    maxThrow,
    rowsMissingUserId,
    rowsZeroThrowNormalized,
    note:
      rowsMissingUserId > 0
        ? '一部行に userId 欠落（マージ・表示に影響しうる）'
        : null
  };
}

/** @param {unknown} entries */
export function filterGiftRelatedErrorEntries(entries) {
  if (!Array.isArray(entries)) return [];
  const giftContexts =
    /^(gift|giftNickInterceptUpgrade|giftHud|ndgr|intercept|pageIntercept|mergeGift)/i;
  const out = [];
  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    const o = /** @type {Record<string, unknown>} */ (e);
    const ctx = String(o.context || '').trim();
    const msg = String(o.message || '');
    if (!giftContexts.test(ctx) && !/gift|ギフト|NDGR.*gift|nls_gift/i.test(msg)) {
      continue;
    }
    out.push({
      at: o.at ?? null,
      context: ctx.slice(0, 80),
      message: msg.slice(0, 220)
    });
  }
  return out;
}

/**
 * popup→タブ messaging ログからインターセプトキャッシュ取得の成否を要約（ギフトは MAIN の intercept→NDGR 経由）
 * @param {unknown[]} recent
 */
export function summarizeInterceptMessagingForGiftPipeline(recent) {
  if (!Array.isArray(recent)) {
    return {
      nlsExportInterceptCacheTotal: 0,
      topFrameOkWithItems: 0,
      topFrameOkEmptyItems: 0,
      topFrameFail: 0,
      nonTopFrameAttempts: 0,
      lastTopFrameSummary: null
    };
  }
  let nlsExportInterceptCacheTotal = 0;
  let topFrameOkWithItems = 0;
  let topFrameOkEmptyItems = 0;
  let topFrameFail = 0;
  let nonTopFrameAttempts = 0;
  /** @type {string|null} */
  let lastTopFrameSummary = null;

  for (const e of recent) {
    if (!e || typeof e !== 'object') continue;
    const o = /** @type {Record<string, unknown>} */ (e);
    if (String(o.type || '') !== 'NLS_EXPORT_INTERCEPT_CACHE') continue;
    nlsExportInterceptCacheTotal++;
    const fid = o.frameId;
    const frameIsTop = fid === 0 || fid === '0';
    if (!frameIsTop) {
      nonTopFrameAttempts++;
      continue;
    }
    const ok = Boolean(o.ok);
    const sum = String(o.responseSummary || '');
    lastTopFrameSummary = sum.slice(0, 120);
    if (ok && /items=\d+/.test(sum)) {
      const m = sum.match(/items=(\d+)/);
      const n = m ? parseInt(m[1], 10) : 0;
      if (Number.isFinite(n) && n > 0) topFrameOkWithItems++;
      else topFrameOkEmptyItems++;
    } else if (ok) {
      topFrameOkEmptyItems++;
    } else {
      topFrameFail++;
    }
  }

  return {
    nlsExportInterceptCacheTotal,
    topFrameOkWithItems,
    topFrameOkEmptyItems,
    topFrameFail,
    nonTopFrameAttempts,
    lastTopFrameSummary
  };
}

/**
 * ストレージの nls_gift_users_* キー数（概算・キー名のみ）
 * @param {string[]} allKeys
 */
export function countGiftUserStorageKeys(allKeys) {
  if (!Array.isArray(allKeys)) return 0;
  let n = 0;
  for (const k of allKeys) {
    if (typeof k === 'string' && /^nls_gift_users_/i.test(k)) n++;
  }
  return n;
}
