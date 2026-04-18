/**
 * 応援ユーザーレーン: 保存済みコメント配列 → LaneCandidate[] の adapter。
 *
 * レイヤ: data/sources/ (pure / chrome API に触れない)
 *
 * 役割（AI汎用ルール/DO_NOT_REWRITE 準拠）:
 *   ・既存の `src/lib/userLaneCandidatesFromStorage.js` は呼び出し元が多く、
 *     Phase 5 まで正本のまま据え置く（書き換えない）
 *   ・このモジュールは **新しい呼び出し経路**（laneStoreInstance に流し込む data 層）から使う
 *     ための薄い source adapter で、保存行 → LaneAggregateRow → `aggregateLaneCandidates`
 *     の合成を 1 箇所に閉じる
 *   ・旧 adapter（`userLaneCandidatesFromStorage`）との二重実装は最小限で、
 *     liveId 正規化は共通ユーティリティから reuse する
 *
 * 将来（Phase 5 以降）:
 *   ・各ソース（stored / ndgr / live-api）用の sibling adapter を同じ layer に並べて、
 *     acquirer が必要に応じて合流する
 *   ・legacy `avatarObserved` boolean の代わりに kind 情報が per-row で渡されるよう
 *     storage schema が育ったら `kindsFromLegacyObservedFlag` 依存を外す
 */

import { aggregateLaneCandidates } from '../../domain/lane/aggregate.js';
import { kindsFromLegacyObservedFlag } from '../../domain/user/avatar.js';
import { normalizeLv } from '../../shared/niconico/liveId.js';

/**
 * @typedef {import('../../domain/lane/aggregate.js').LaneCandidate} LaneCandidate
 * @typedef {import('../../domain/lane/aggregate.js').LaneAggregateRow} LaneAggregateRow
 */

const CANONICAL_USERICON_HTTPS_PREFIX =
  'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/';

/**
 * @param {unknown} url
 * @returns {boolean}
 */
function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || '').trim());
}

/**
 * URL が「ニコ公式の合成 canonical usericon」形か。
 * @param {unknown} url
 * @returns {boolean}
 */
function isCanonicalUsericonUrl(url) {
  const s = String(url || '').trim();
  if (!isHttpUrl(s)) return false;
  return s.startsWith(CANONICAL_USERICON_HTTPS_PREFIX);
}

/**
 * 行が target liveId にマッチするか（lvId フォールバック付き）。
 * @param {unknown} row
 * @param {string} targetNorm normalizeLv 済みの比較キー
 * @returns {boolean}
 */
function rowMatchesLiveFilter(row, targetNorm) {
  if (!targetNorm) return true;
  const o = /** @type {{ liveId?: unknown, lvId?: unknown }} */ (row);
  const a = normalizeLv(o?.liveId);
  const b = normalizeLv(o?.lvId);
  return (Boolean(a) && a === targetNorm) || (Boolean(b) && b === targetNorm);
}

/**
 * 保存行 1 件を LaneAggregateRow に持ち上げる（kinds / nonCanonical を補強）。
 *
 * @param {unknown} row
 * @returns {LaneAggregateRow}
 */
function storedRowToAggregateRow(row) {
  const o = /** @type {Record<string, unknown>} */ (row || {});
  const avatarUrl = String(o?.avatarUrl || '').trim();
  const observed = Boolean(o?.avatarObserved);
  const kinds = kindsFromLegacyObservedFlag(observed);
  const hasNonCanonicalPersonalUrl =
    Boolean(avatarUrl) && !isCanonicalUsericonUrl(avatarUrl);
  return {
    userId: String(o?.userId || '').trim(),
    nickname: String(o?.nickname || '').trim(),
    avatarUrl,
    avatarObservationKinds: kinds,
    hasNonCanonicalPersonalUrl,
    liveId: String(o?.liveId || o?.lvId || '').trim(),
    capturedAt: Number(o?.capturedAt) || 0
  };
}

/**
 * 保存済みコメント行の配列を LaneCandidate[] に変換する。
 *
 * liveId 省略時は全 live 混在で集約する。指定ありで該当行 0 件のときは
 * 既存 adapter と同じく全件にフォールバックする（当放送の保存が欠けていても
 * 直近の他放送で暫定表示できるようにする契約）。
 *
 * @param {readonly unknown[]|null|undefined} storedComments
 * @param {string|null|undefined} [liveId]
 * @returns {LaneCandidate[]}
 */
export function laneCandidatesFromStoredComments(storedComments, liveId) {
  const allRows = Array.isArray(storedComments) ? storedComments : [];
  const filterByLive =
    arguments.length >= 2 && liveId != null && String(liveId).trim() !== '';
  const targetNorm = filterByLive ? normalizeLv(String(liveId)) : '';

  let rows = filterByLive
    ? allRows.filter((r) => rowMatchesLiveFilter(r, targetNorm))
    : allRows;
  if (filterByLive && rows.length === 0) {
    rows = allRows;
  }

  const aggregateRows = rows.map(storedRowToAggregateRow);
  return aggregateLaneCandidates(aggregateRows);
}
