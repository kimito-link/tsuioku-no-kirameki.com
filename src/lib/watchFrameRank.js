// watchFrameRank.js — 複数 watch フレーム/タブから「今解決すべき配信」を innerText とURL一致でスコア付けして選ぶ純ロジック。
import {
  extractLiveIdFromUrl,
  watchPageUrlsMatchForSnapshot
} from './broadcastUrl.js';

/** innerText スコアに足す: 解決 watch と同一 lv の frame href */
const LV_MATCH_BONUS = 100_000_000;
/** lv が取れない場合の緩い一致（同一 pathname 等） */
const URL_SNAPSHOT_MATCH_BONUS = 50_000_000;

/**
 * `listWatchFramesWithInnerText` の結果を、対象 watch URL に紐づくフレームが先に来るよう並べ替える。
 * all_frames 注入で副次 frame の score が本体を上回る事故を減らす。
 *
 * @param {{ frameId: number, score: number, text: string, href?: string }[]} frames
 * @param {string} watchUrl
 * @returns {{ frameId: number, score: number, text: string, href?: string }[]}
 */
export function prioritizeWatchFramesForWatchUrl(frames, watchUrl) {
  const w = String(watchUrl || '').trim();
  const targetLv = extractLiveIdFromUrl(w);
  const list = Array.isArray(frames) ? frames.slice() : [];
  for (const r of list) {
    const base = typeof r.score === 'number' ? r.score : 0;
    const href = String(r.href || '').trim();
    let bonus = 0;
    if (href && targetLv) {
      const fl = extractLiveIdFromUrl(href);
      if (fl && fl === targetLv) bonus = LV_MATCH_BONUS;
    }
    if (!bonus && href && w) {
      if (watchPageUrlsMatchForSnapshot(href, w)) {
        bonus = URL_SNAPSHOT_MATCH_BONUS;
      }
    }
    r.score = base + bonus;
  }
  list.sort((a, b) => b.score - a.score);
  return list;
}
