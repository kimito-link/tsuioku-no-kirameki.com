/**
 * v0.1.505: コメント保存の「テールバッファ（追記式チャンク）」純関数群。
 *
 * 背景（[[reference_storage_local_live_db_perf_overhaul]] の続き）:
 *   従来は 1 放送＝1 つの巨大配列 `nls_comments_<lv>` を、毎フラッシュ（1.5〜数秒ごと）
 *   read→merge→**全件 set** していた。1 万件を超えると 1 回の構造化クローン set が重く、
 *   同一オリジンの watch タブが共有レンダラ上で同時に全件 set を撃ち合うと
 *   「ページが応答しません」フリーズ＋記録頭打ちを招いていた。
 *
 *   本モジュールは「毎フラッシュは新規分だけを小さなテールキー `nls_ctail_<lv>` に追記し、
 *   一定件数/時間・タブ非表示・離脱時にだけ既存パイプラインでメイン配列へ畳み込む」
 *   ための純関数を提供する。メイン配列（正本）の形式・既存の dedupe/merge ロジックには
 *   一切触れない（畳み込みは既存 mergeNewComments を再利用する）ため、既存データは無傷。
 *
 * 設計上の不変条件:
 *   - テールキーの接頭辞 `nls_ctail_` は `nls_comments_lv*` を列挙する clean migration /
 *     past-live 読みと衝突しない（接頭辞を分離している）。
 *   - テールには「正規化前の enriched 生行（incoming 形）」を保存する。createCommentEntry が
 *     capturedAt を生成時刻で上書きするため、正規化はメイン畳み込み時に 1 度だけ行い、
 *     二重正規化での id/capturedAt 取り違えを避ける。
 *   - テール内の重複は buildDedupeKey ベースで弾く（best-effort）。最終的な正本側 dedupe は
 *     畳み込み時の mergeNewComments(main, tail) が担保する。
 *
 * @module commentTailBuffer
 */

import { buildDedupeKey } from './commentRecord.js';

/** テール畳み込みの件数しきい値（これ以上テールに溜まったら畳み込む） */
export const TAIL_COMPACT_COUNT = 200;

/** テール畳み込みの時間しきい値（テールが空でなければ最低この間隔で畳み込む） */
export const TAIL_COMPACT_INTERVAL_MS = 10_000;

/** テールに保持してよい上限（安全弁: 異常時でもテール set が肥大化しないように） */
export const TAIL_MAX_ROWS = 2_000;

/**
 * v0.1.696: この行数以上のバッチはテールを経由させずチャンク追記へ直行させるしきい値。
 * テールは「小さな高頻度RTバッチ」の O(N) 緩和装置で、backfill の数千行バーストを通すと
 * TAIL_MAX_ROWS クランプで古い行が黙って消える(=「一気に取れない」38〜43%損失の真因・
 * 実機 crawl42,078行/保存15,094行で確定)。チャンク追記は O(追加分) なので大口直行が安全。
 */
export const TAIL_BULK_BYPASS_MIN_ROWS = 500;

/**
 * v0.1.507: 「巨大メイン」と見なす件数。これ以上では畳み込み1回の構造化クローンが重く、
 * 同一オリジンの複数 watch タブが共有レンダラ（同一メインスレッド）を固めて
 * 「ページが応答しません」を招く。巨大メインでは畳み込みの頻度を最小化する。
 */
export const BIG_MAIN_THRESHOLD = 5_000;

/**
 * v0.1.507: 巨大メイン時の畳み込みしきい値。テールが満杯（TAIL_MAX_ROWS）になる前に必ず
 * 畳み込むが、それ以外（hidden 強制・短間隔・タブ切替時の強制）は行わず重いクローンの頻度を
 * 最小化する。満杯前に余裕を持たせる（await 中の追記レースで TAIL_MAX_ROWS を超えて古い行を
 * 落とさないように TAIL_MAX_ROWS より十分小さく取る）。
 */
export const TAIL_COMPACT_COUNT_BIG = 1_500;

/**
 * 放送ごとのテール用 storage キー。`nls_comments_lv*` とは別接頭辞にして
 * 既存の prefix 列挙・clean migration と衝突させない。
 * @param {string} liveId lv123
 * @returns {string}
 */
export function tailStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_ctail_${id}`;
}

/**
 * commentNo を持つ行の「番号ベース」dedupe キー（buildDedupeKey は commentNo がある行で
 * capturedAt/userId を無視し `liveId|no|text` を返す＝番号が一意キー）。commentNo 欠落行は
 * null（cheap dedupe 対象外。最終 dedupe は畳み込み時の mergeNewComments+loneDedupe が担う）。
 *
 * @param {string} liveId
 * @param {{ commentNo?: string, text?: string }} row
 * @returns {string|null}
 */
export function commentNoDedupeKey(liveId, row) {
  const no = String(row?.commentNo ?? '').trim();
  if (!no) return null;
  const lid = String(liveId || '').trim().toLowerCase();
  return buildDedupeKey(lid, { commentNo: no, text: row?.text || '' });
}

/**
 * コメント配列から commentNo を持つ行の dedupe キー集合を作る（メイン正本の seed 用）。
 * commentNo 欠落行は含めない（cheap dedupe では扱わないため）。
 *
 * @param {string} liveId
 * @param {Array<{ commentNo?: string, text?: string }>|unknown} entries
 * @returns {Set<string>}
 */
export function collectCommentNoKeys(liveId, entries) {
  const out = new Set();
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    const k = commentNoDedupeKey(liveId, e);
    if (k) out.add(k);
  }
  return out;
}

/**
 * テールへ追記する新規行を選別する純関数。
 *
 * 安全方針（既存 mergeNewComments の dedupe 仕様を壊さない）:
 *   - commentNo を持つ行: `liveId|no|text` キーで cheap dedupe（メイン ∪ テールに既存なら捨てる）。
 *     さらに同一バッチ内の重複も弾く。表示順用に capturedAt 未設定なら nowMs をスタンプ
 *     （buildDedupeKey は commentNo 行で capturedAt を無視するので dedupe には影響しない）。
 *   - commentNo 欠落行: cheap dedupe しない（capturedAt 秒に依存するキーは buffer 時刻で
 *     стамプすると畳み込み時の loneDedupe 再利用を壊し二重記録を招くため）。そのまま追記し、
 *     最終 dedupe は畳み込み時の mergeNewComments(main, tail) に委譲する。capturedAt も
 *     スタンプしない（loneDedupe が既存 cap を再利用できるように undefined のまま残す）。
 *
 * @param {string} liveId
 * @param {Array<{ commentNo?: string, text?: string, userId?: string|null, capturedAt?: number }>} candidates
 * @param {Set<string>} knownKeys メイン＋テールに既にある commentNo ベースの dedupe キー
 * @param {number} [nowMs]
 * @returns {{ fresh: Array<object>, keys: string[] }}
 *   fresh = テールへ追記すべき行、keys = 追加された commentNo ベースのキー（knownKeys 更新用）
 */
export function selectNewTailRows(liveId, candidates, knownKeys, nowMs = Date.now()) {
  /** @type {Array<object>} */
  const fresh = [];
  /** @type {string[]} */
  const keys = [];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { fresh, keys };
  }
  const seen = knownKeys instanceof Set ? knownKeys : new Set();
  // 同一バッチ内の commentNo 重複も弾くためのローカル集合（knownKeys を汚さない）
  const localSeen = new Set();
  for (const raw of candidates) {
    const text = String(raw?.text ?? '').trim();
    if (!text) continue;
    const key = commentNoDedupeKey(liveId, raw);
    if (key) {
      if (seen.has(key) || localSeen.has(key)) continue;
      localSeen.add(key);
      const cap = Number(raw?.capturedAt);
      const stamped =
        Number.isFinite(cap) && cap > 0 ? raw : { ...raw, capturedAt: nowMs };
      fresh.push(stamped);
      keys.push(key);
    } else {
      // commentNo 欠落: cheap dedupe せず、capturedAt も触らずそのまま追記する。
      fresh.push(raw);
    }
  }
  return { fresh, keys };
}

/**
 * 既存テール配列に新規行を追記して返す（純関数・上限クランプ付き）。
 * @param {Array<object>|unknown} currentTail
 * @param {Array<object>} freshRows
 * @returns {Array<object>}
 */
export function appendToTail(currentTail, freshRows) {
  const base = Array.isArray(currentTail) ? currentTail : [];
  if (!Array.isArray(freshRows) || freshRows.length === 0) return base;
  const next = base.concat(freshRows);
  if (next.length > TAIL_MAX_ROWS) {
    // 安全弁: 異常に溜まった場合は古い側を落とす（畳み込みが追いついていない時のみ到達）。
    return next.slice(next.length - TAIL_MAX_ROWS);
  }
  return next;
}

/**
 * テールをメインへ畳み込むべきか判定する純関数。
 *
 * @param {{
 *   tailLength?: number,
 *   sinceLastCompactMs?: number,
 *   mainCount?: number,
 *   hidden?: boolean,
 *   force?: boolean
 * }} opts
 * @returns {boolean}
 */
export function shouldCompactTail(opts = {}) {
  const tailLength = Math.max(0, Number(opts.tailLength) || 0);
  if (tailLength <= 0) return false;
  if (opts.force === true) return true;
  const mainCount = Math.max(0, Number(opts.mainCount) || 0);
  // v0.1.507: 巨大メインでは畳み込み1回の構造化クローンが重く、複数タブが共有レンダラを
  //   固める。テールが満杯近くのときだけ畳み込み、hidden 強制・短間隔・タブ切替時の強制は
  //   使わない（＝重いクローンの頻度を最小化）。新着はテール（常時永続）が表示を担うので
  //   データも鮮度も守られる。
  if (mainCount >= BIG_MAIN_THRESHOLD) {
    return tailLength >= TAIL_COMPACT_COUNT_BIG;
  }
  // 小〜中規模: 従来どおり（クローンが安いので頻繁でも問題ない）。
  // タブ非表示／離脱時はテールが空でなければ畳み込んでおく（次回読み込みで取りこぼさない）。
  if (opts.hidden === true) return true;
  if (tailLength >= TAIL_COMPACT_COUNT) return true;
  const since = Math.max(0, Number(opts.sinceLastCompactMs) || 0);
  if (since >= TAIL_COMPACT_INTERVAL_MS) return true;
  return false;
}
