/**
 * audition richview 由来のイベント💎順位リストを親へ relay するときの
 * storage キー・検証（PR3〜4 経路）。
 *
 * 順位リストは scrapeEventScoreRankingFromRichviewDom の戻り形をそのまま
 * 「信頼境界」でチェックしたうえで nls_event_score_ranking_<lv> に保存する。
 */

import { classifyGiftSubAppFrameSource } from './giftSubAppFrameSource.js';

/** nls_event_score_ranking_<liveId> の prefix（storage prune と一致させる）。 */
export const EVENT_SCORE_RANKING_STORAGE_PREFIX = 'nls_event_score_ranking_';

/**
 * @param {string|null|undefined} liveId lv…（小文字想定でも正規化する）
 * @returns {string}
 */
export function eventScoreRankingStorageKey(liveId) {
  return (
    EVENT_SCORE_RANKING_STORAGE_PREFIX +
    String(liveId == null ? '' : liveId).trim().toLowerCase()
  );
}

/**
 * audition richview URL の query content_id が lv と一致するときのみ lv を返す。
 * @param {string|null|undefined} frameUrl
 * @returns {string|null}
 */
export function extractContentIdFromAuditionRichviewUrl(frameUrl) {
  try {
    const u = new URL(String(frameUrl || ''));
    if (u.hostname.toLowerCase() !== 'audition.nicovideo.jp') return null;
    if (!u.pathname.toLowerCase().includes('/embedded/richview/live')) return null;
    const id = String(u.searchParams.get('content_id') || '').trim().toLowerCase();
    return /^lv\d{1,15}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} rows
 * @returns {boolean}
 */
function looksLikeRankingRowArray(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 10) return false;
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') return false;
    const r = /** @type {{ rank?: unknown; score?: unknown; name?: unknown }} */ (raw);
    if (
      typeof r.rank !== 'number' ||
      !Number.isFinite(r.rank) ||
      typeof r.score !== 'number' ||
      !Number.isFinite(r.score)
    ) {
      return false;
    }
    if (typeof r.name !== 'string' || String(r.name).trim() === '') return false;
  }
  return true;
}

/**
 * 親側で storage に書いてよいか（trust メッセージに加える domain 検査）。
 *
 * @param {{ frameUrl: string|null|undefined, rows: unknown, destinationLiveId: string|null|undefined }} p
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateEventScoreRankingRelayPayload(p) {
  const lid = String(p.destinationLiveId || '').trim().toLowerCase();
  if (!/^lv\d{1,15}$/.test(lid)) return { ok: false, reason: 'bad-live-id' };

  const frameUrl = String(p.frameUrl || '').trim();
  if (!frameUrl) return { ok: false, reason: 'no-frame-url' };

  if (classifyGiftSubAppFrameSource(frameUrl) !== 'audition')
    return { ok: false, reason: 'not-audition' };

  const cid = extractContentIdFromAuditionRichviewUrl(frameUrl);
  if (!cid || cid !== lid) return { ok: false, reason: 'content-id-mismatch' };

  const rows = p.rows;
  if (!looksLikeRankingRowArray(rows)) return { ok: false, reason: 'bad-rows' };

  return { ok: true };
}
