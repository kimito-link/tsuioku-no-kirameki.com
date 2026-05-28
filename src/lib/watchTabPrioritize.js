import { extractLiveIdFromUrl } from './broadcastUrl.js';

/**
 * watch タブ候補リストを「対象 watch URL に最も近い」順に並べ替える純粋関数。
 *
 * 設計（0.1.36 AK: popup-entry.js コンポーネント分割の続き）:
 *   `collectWatchTabCandidates` で集めたタブ群から、`watchUrl` に最も近い
 *   タブを優先したい。
 *
 * 0.1.358 (B2 修正): rank を **lv 基準**に揃える。従来は pathname+search の厳密
 *   一致のみを rank 0 とし、**同一 lv でも query 文字列が違うと rank 1 に落ちて**
 *   いた。一方フレーム側 `watchFrameRank.js` は lv 一致を最優先（+100M）にして
 *   おり、タブ側とフレーム側で「どのタブ／フレームを採用するか」がねじれていた。
 *   実害: 同じ配信を2タブで開いたとき、解決 watchUrl の query にたまたま一致する
 *   待機タブが、ユーザーが実際に見ている（lastAccessed が新しい）前面タブを差し
 *   置いて先頭になり、スナップショット取得やコメント送信が待機タブに向いていた。
 *
 *   修正後は **同一 lv のタブは全て同一 tier（rank 0）**にまとめ、その中の優先は
 *   `lastAccessed`→`active`→`audible`→tab id のタイブレークに委ねる（＝ユーザーが
 *   直近で触った／フォーカスしているタブが必ず勝つ）。フレーム側の lv 一次思想と
 *   一致する。query の違いはもう順位を分けない。
 *
 *   rank（小さいほど優先）:
 *     0 = 同一 lv（query 等の違いは無視。lv が取れる通常の watch URL の主経路）
 *     1 = 解析できるが lv 不一致（別配信）
 *     2 = URL 解析失敗
 *
 *   ※ 解決 watchUrl から lv が取れない場合（channel ページ等の非 lv URL）は
 *      従来どおり pathname+search 厳密一致を rank 0 とする縮退動作にフォールバック。
 *
 *   rank が同じ候補同士は `lastAccessed`（新しいほど先）→ `active` → `audible`
 *   → tab id（新しいほど先）でタイブレークする。同一 lv の待機タブと視聴中タブが
 *   両方あるとき、ユーザーが直近で触った／フォーカスしている方を先に試す。
 *
 *   chrome / DOM 依存なしなので vitest 単体検証可能。
 */

/**
 * @typedef {{
 *   id: number,
 *   url: string,
 *   lastAccessed?: number,
 *   active?: boolean,
 *   audible?: boolean
 * }} WatchTabCandidate
 */

/**
 * @param {WatchTabCandidate[]} candidates
 * @param {string} watchUrl
 * @returns {WatchTabCandidate[]} watchUrl と同じ pathname+search を優先した並び
 */
export function prioritizeWatchTabCandidates(candidates, watchUrl) {
  const arr = Array.isArray(candidates) ? candidates : [];
  const w = String(watchUrl == null ? '' : watchUrl).trim();
  if (!w) return arr;
  let refKey = '';
  try {
    const ref = new URL(w);
    refKey = `${ref.pathname.replace(/\/$/, '')}${ref.search}`;
  } catch {
    return arr;
  }
  // 解決 watch URL の lv。取れる通常 watch URL では lv 一致を rank 0 にする。
  // 取れない（channel 等の非 lv URL）場合は従来の pathname+search 厳密一致に縮退。
  const refLv = extractLiveIdFromUrl(w);
  /** @param {string} url */
  const rank = (url) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return 2; // URL 解析失敗（最後尾）
    }
    if (refLv) {
      const lv = extractLiveIdFromUrl(url);
      // 同一 lv は query 等の違いを問わず最優先（フレーム側 lv ボーナスと整合）。
      // tier 内の順位は lastAccessed/active のタイブレークに委ねる。
      return lv && lv === refLv ? 0 : 1;
    }
    // 非 lv URL は厳密一致のみを最優先にする縮退動作（後方互換）。
    const k = `${u.pathname.replace(/\/$/, '')}${u.search}`;
    return k === refKey ? 0 : 1;
  };

  /** @param {WatchTabCandidate} c */
  const lastAccessedMs = (c) => {
    const n =
      typeof c.lastAccessed === 'number' && Number.isFinite(c.lastAccessed)
        ? c.lastAccessed
        : 0;
    return n > 0 ? n : 0;
  };

  /**
   * @param {WatchTabCandidate} a
   * @param {WatchTabCandidate} b
   */
  const compareTie = (a, b) => {
    const dLa = lastAccessedMs(a) - lastAccessedMs(b);
    if (dLa !== 0) return dLa > 0 ? -1 : 1;
    if (Boolean(a.active) !== Boolean(b.active)) {
      return a.active ? -1 : 1;
    }
    if (Boolean(a.audible) !== Boolean(b.audible)) {
      return a.audible ? -1 : 1;
    }
    return (b.id ?? 0) - (a.id ?? 0);
  };

  return [...arr].sort((a, b) => {
    const dr = rank(a.url) - rank(b.url);
    if (dr !== 0) return dr;
    return compareTie(a, b);
  });
}
