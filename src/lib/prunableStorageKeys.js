/**
 * v0.1.419: storage.local の「定期 prune 対象キー」だけを prefix で絞り込む純関数。
 *
 * 背景（[[reference_storage_local_live_db_perf_overhaul]]）:
 *   content の persistOfficialEventDomBundleNow が 5 秒ごとに
 *   `chrome.storage.local.get(null)`（= 全 storage・巨大な nls_comments_<lv> 配列を含む）を
 *   読み、その中から `nls_event_dom_*` / koken / nicoad / event-participation /
 *   event-score-ranking の stale キーだけを prune していた。長時間配信ほど get(null) が
 *   重くなる（コメント配列を毎回フル read）。
 *
 *   prune に必要なのは「これらの prefix に一致するキーの値（capturedAt）」だけ。そこで
 *   キー名一覧を cheap に得て（`chrome.storage.local.getKeys()` 等）、この関数で prune 対象
 *   prefix のキーだけに絞り、その分だけ `get([...keys])` で値を読む。巨大配列は読まない。
 *
 * 純関数（chrome 非依存）＝呼び出し側がキー一覧の取得手段（getKeys / get(null) fallback）を
 * 持つ。ここは「与えられたキー名配列を prefix で絞る」だけ。
 *
 * @module prunableStorageKeys
 */

/**
 * 定期 prune が対象にする storage キーの prefix 一覧（正本）。
 * これらに一致するキーだけ値を読めば、定期 cleanup は成立する（コメント配列は不要）。
 *
 * @type {readonly string[]}
 */
export const PRUNABLE_STORAGE_KEY_PREFIXES = Object.freeze([
  'nls_event_dom_',
  'nls_koken_api_contrib_',
  'nls_nicoad_api_ranking_',
  'nls_event_participation_',
  'nls_event_score_ranking_',
  'nls_event_voting_ranking_',
  'nls_nicoad_ranking_',
  'nls_broadcaster_profile_',
  'nls_commenter_follow_live_',
  // ★v0.1.1301(Codex レビュー指摘・重大度中): 応援レーン鏡を配信ごとキーへ分離した
  //   (v0.1.1300)結果、視聴した配信の数だけキーが増えるようになった。旧実装は
  //   単一グローバルキー1本だったので lifecycle が要らなかったが、分離した以上
  //   削除する人が必要=既存の TTL(6h)+LRU(30件) 巡回に相乗りさせる。
  //   ★どちらの値も capturedAt を持つ(laneMirror.js buildLaneMirrorSnapshot /
  //     buildLaneReceipt)ので、既存の prune 判定がそのまま使える。
  //   ★現在視聴中の lv は pruneStaleEventDomLvs が別枠で保護する。
  'nls_lane_mirror_v2_',
  'nls_lane_receipt_v1_',
  // 2026-10-09: ハイライト台帳も配信ごとキーへ分離(highlightLedgerKeyFor)。視聴した配信の数だけ増えるので同じ巡回で掃除する。
  //   値は capturedAt(最後のハイライト時刻)を持つので既存の prune 判定がそのまま使える。現在視聴中の lv は別枠で保護される。
  'nls_highlight_ledger_v1_'
]);

/**
 * キー名一覧から、prune 対象 prefix に一致するものだけを返す。
 *
 * @param {Iterable<string>|null|undefined} allKeys storage の全キー名（値は不要）
 * @param {readonly string[]} [prefixes] 既定 = PRUNABLE_STORAGE_KEY_PREFIXES
 * @returns {string[]} prefix 一致キー（重複なし・入力順を保つ）
 */
export function pickPrunableStorageKeys(allKeys, prefixes = PRUNABLE_STORAGE_KEY_PREFIXES) {
  if (!allKeys) return [];
  const px = Array.isArray(prefixes) ? prefixes : PRUNABLE_STORAGE_KEY_PREFIXES;
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const raw of allKeys) {
    const k = String(raw == null ? '' : raw);
    if (!k || seen.has(k)) continue;
    for (let i = 0; i < px.length; i += 1) {
      if (k.startsWith(px[i])) {
        out.push(k);
        seen.add(k);
        break;
      }
    }
  }
  return out;
}

/**
 * 配信別キー(`<prefix><lv>`・値に capturedAt)のうち、実際に消してよいキーを返す純関数(2026-10-09)。
 *   pickPrunableStorageKeys は「読む対象」を絞るだけで消さない。消す人が居ないキーは増え続ける。
 *   現在視聴中の配信は保護。TTL 超過・capturedAt 不明・壊れた値は消す。prefix に一致しないキーは返さない。
 * @param {Record<string, unknown>|null|undefined} bag chrome.storage.local.get の戻り
 * @param {string} prefix 例 'nls_highlight_ledger_v1_'(末尾 '_' まで)
 * @param {string|null|undefined} currentLiveId 現在視聴中の lv(保護)
 * @param {number} nowMs
 * @param {number} ttlMs
 * @returns {string[]}
 */
export function stalePerLiveCapturedAtKeys(bag, prefix, currentLiveId, nowMs, ttlMs) {
  if (!bag || typeof bag !== 'object' || !prefix) return [];
  if (!Number.isFinite(nowMs) || !Number.isFinite(ttlMs) || ttlMs <= 0) return [];
  const cur = String(currentLiveId || '').trim().toLowerCase();
  /** @type {string[]} */
  const out = [];
  for (const k of Object.keys(bag)) {
    if (!k.startsWith(prefix)) continue;
    const lv = k.slice(prefix.length).toLowerCase();
    if (!lv || (cur && lv === cur)) continue;
    const v = /** @type {any} */ (bag)[k];
    const cap = v && typeof v === 'object' && typeof v.capturedAt === 'number' ? v.capturedAt : 0;
    if (cap === 0 || nowMs - cap >= ttlMs) out.push(k);
  }
  return out;
}
