/**
 * 疑似 lv の書き出しは、画面用の組み立て（人物・アイコン・ランキング）を待たない。
 * 保存層の行を、レポートが使う列だけに写す。視聴タブが開いていても、閉じたあとでも同じ行を読む。
 * ニコ生の書き出し束はこの登録を使わない（登録が無ければ null）。
 */

import { ytPostedAtFromClock, ytReplayPostedAt } from './ytPostedAt.js';

/** この件数ごとに画面へ制御を返す。10万件でも低スペックのPCを固めない。 */
export const EXPORT_STORED_MAP_CHUNK = 500;

/** @type {((lv: string) => Promise<unknown>) | null} */
let storedExportReader = null;

/**
 * @param {((lv: string) => Promise<unknown>) | null} fn
 */
export function setStoredExportCommentReader(fn) {
  storedExportReader = typeof fn === 'function' ? fn : null;
}

/**
 * @param {string} lv
 * @returns {Promise<unknown[] | null>} 登録が無い・失敗したときは null（従来の読みに戻す）
 */
export async function readStoredExportComments(lv) {
  if (!storedExportReader) return null;
  try {
    const rows = await storedExportReader(lv);
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

/**
 * channelId 接頭辞から配信サービス識別子を補完する（row.platform が未保存の行向け）。
 * @param {unknown} channelId
 * @returns {string}
 */
function inferPlatformFromChannelId(channelId) {
  const ch = String(channelId || '');
  if (ch.startsWith('mx:')) return 'mixch';
  if (ch.startsWith('tc:')) return 'twitcasting';
  if (ch.startsWith('tw:')) return 'twitch';
  if (ch.startsWith('kk:')) return 'kick';
  if (ch.startsWith('sr:')) return 'showroom';
  if (ch.startsWith('tt:')) return 'tiktok';
  if (ch.startsWith('ww:')) return 'whowatch';
  if (ch.startsWith('ab:')) return 'abema';
  return '';
}

/**
 * @param {Record<string, unknown>} row
 * @param {number} index
 * @param {string} liveId
 */
function exportCommentFromStoredRow(row, index, liveId) {
  const at = Number(row?.recordedAt || 0);
  const postedAt = Number(row?.postedAtMs) > 0
    ? Number(row.postedAtMs)
    : row?.replay
      ? ytReplayPostedAt(String(row?.ts || ''), Number(row?._streamStartedAt || 0), at)
      : ytPostedAtFromClock(String(row?.ts || ''), at);
  const backfilled = row?.skipVoice === true;
  const capturedAt = (row?.replay && postedAt > 0) || (backfilled && postedAt > 0 && postedAt < at)
    ? postedAt
    : at;
  const name = String(row?.name || row?.author || '');
  const login = String(row?.login || '').trim();
  const channelId = String(row?.channelId || '').trim();
  const icon = String(row?.avatarUrl || row?.iconUrl || '').trim();
  const avatarUrl = /^https:\/\//i.test(icon) ? icon : '';
  return {
    id: String(row?.id || `stored_${index}`),
    liveId,
    commentNo: String(row?.commentNo || index + 1),
    text: String(row?.text ?? row?.message ?? ''),
    userId: exportUserId(exportPersonKey(row)),
    nickname: name,
    name,
    ...(login ? { login } : {}),
    ...(channelId ? { channelId } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    capturedAt,
    ytKind: String(row?.kind || row?.ytKind || ''),
    ytAmount: row?.amount ?? row?.ytAmount ?? '',
    ytCurrency: String(row?.currency || row?.ytCurrency || ''),
    ytGiftCount: row?.giftCount,
    ...(row?.giftPartOf ? { giftPartOf: String(row.giftPartOf) } : {}),
    ...(row?.giftName || row?.ytGiftName ? { ytGiftName: String(row.giftName || row.ytGiftName) } : {}),
    ...(row?.subTier ? { subTier: String(row.subTier) } : {}),
    ...(Array.isArray(row?.badges) && row.badges.length ? { badges: row.badges } : {}),
    subMonths: row?.subMonths,
    subEvent: row?.subEvent,
    ytPlatform: String(row?.platform || inferPlatformFromChannelId(row?.channelId)),
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function exportPersonKey(row) {
  const channel = String(row?.channelId || '').trim();
  if (channel) return channel;
  const login = String(row?.login || '').trim();
  if (login) return `login:${login.toLowerCase()}`;
  const name = String(row?.name || '').trim();
  if (name) return `name:${name}`;
  return '';
}

/**
 * 同じ人は同じ番号。画面用の衝突表は使わない（書き出しの件数は行数で決まる）。
 * @param {string} key
 */
function exportUserId(key) {
  if (!key) return '';
  let h1 = 0x9e3779b1 >>> 0;
  let h2 = 0x85ebca77 >>> 0;
  for (let i = 0; i < key.length; i += 1) {
    const c = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0xc2b2ae3d) >>> 0;
  }
  const n = (h1 % 100000) * 10000 + (h2 % 10000);
  return String(8000000000 + (n % 1000000000));
}

/**
 * 保存層の行を、書き出しのコメント列にする。件数は保存した行数と揃える。
 * @param {unknown} rows
 * @param {string} lv
 * @param {() => Promise<void> | void} [pause]
 */
export async function exportCommentsFromStoredRows(rows, lv, pause) {
  const list = Array.isArray(rows) ? rows : [];
  const liveId = String(lv || '');
  /** @type {Array<Record<string, unknown>>} */
  const out = new Array(list.length);
  const wait = typeof pause === 'function'
    ? pause
    : () => new Promise((resolve) => { setTimeout(resolve, 0); });
  for (let i = 0; i < list.length; i += 1) {
    const row = /** @type {Record<string, unknown>} */ (list[i] && typeof list[i] === 'object' ? list[i] : {});
    out[i] = exportCommentFromStoredRow(row, i, liveId);
    if ((i + 1) % EXPORT_STORED_MAP_CHUNK === 0 && i + 1 < list.length) await wait();
  }
  return out;
}
