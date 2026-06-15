/**
 * v0.1.754 会場の3時間安定化(会議6体ほぼ全会一致の最大ボトルネック根治): 参加者集計を
 * 「30秒毎に【全コメント】を再読み・再集約(O(N)・数万件でメインスレッド圧迫・8秒timeout超で
 * 会場停止)」から「append-only チャンクの【新規 seq だけ】集約して既存集約へマージ(O(新規分))」へ。
 *
 * commentChunkStore は追記専用(既存チャンクは二度と書き換えない)なので、一度集約した seq の
 * 結果は不変=未処理 seq だけ読んで足せば全件再読みと同じ総数になる。avatar/nickname の
 * ピッカーは「2つのうち良い方」を選ぶ associative な性質なので、チャンク毎集約→マージ ≈
 * 全件まとめて集約 と等価(commentCount は加算・_laneSortAt は max・avatarObserved は OR)。
 *
 * 純関数(storage/DOM 非依存・テスト可能)。orchestration(どの seq を読むか)は呼び出し側。
 *
 * @module venueIncrementalAggregate
 */

import { pickStrongestAvatarUrlForUser } from './supportGrowthTileSrc.js';
import { pickBetterInterceptNickname } from './giftDisplayNickname.js';

/**
 * チャンクインデックスの全 seq から「まだ集約していない新規 seq」だけを昇順で返す。
 * チャンクは append-only なので、processedSeqs に無い現存 seq = 新規に読むべきチャンク。
 *
 * @param {number[]|null|undefined} allSeqs index.seqs(現存する全チャンク seq)
 * @param {number[]|null|undefined} processedSeqs 既に集約済みの seq
 * @returns {number[]} 新規 seq(昇順)
 */
export function selectNewChunkSeqs(allSeqs, processedSeqs) {
  const all = Array.isArray(allSeqs)
    ? allSeqs.map((n) => Math.max(0, Math.floor(Number(n) || 0)))
    : [];
  const done = new Set(
    Array.isArray(processedSeqs)
      ? processedSeqs.map((n) => Math.max(0, Math.floor(Number(n) || 0)))
      : []
  );
  return all.filter((seq) => !done.has(seq)).sort((a, b) => a - b);
}

/**
 * @typedef {{
 *   userId: string,
 *   nickname: string,
 *   avatarUrl: string,
 *   avatarObserved: boolean,
 *   liveId: string,
 *   commentCount?: number,
 *   giftCount?: number,
 *   _laneSortAt?: number
 * }} UserLaneCandidate
 */

/**
 * 既存の参加者集約に、新規チャンク由来の集約をマージする純関数。userId 単位で:
 *   - commentCount / giftCount を加算(全件再読みと同じ総数)
 *   - _laneSortAt は max(最新発言時刻=上位席判定に使う)
 *   - avatarObserved は OR(片方でも実観測済みなら true)
 *   - nickname は pickBetterInterceptNickname(空でない・より良い方)
 *   - avatarUrl は pickStrongestAvatarUrlForUser(スコア最強・実サムネ後着を拾う)
 *   - liveId は新規優先(同一配信内なので同じ想定)
 * 結果は _laneSortAt 降順にソート(最新発言が上位席=会場の並びと一致)。
 *
 * @param {ReadonlyArray<UserLaneCandidate>|null|undefined} existing
 * @param {ReadonlyArray<UserLaneCandidate>|null|undefined} incoming
 * @returns {UserLaneCandidate[]}
 */
export function mergeUserLaneAggregates(existing, incoming) {
  /** @type {Map<string, UserLaneCandidate>} */
  const byUid = new Map();

  /** @param {ReadonlyArray<UserLaneCandidate>|null|undefined} list */
  const ingest = (list) => {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      if (!c || typeof c !== 'object') continue;
      const uid = String(c.userId || '').trim();
      if (!uid) continue;
      const prev = byUid.get(uid);
      if (!prev) {
        byUid.set(uid, {
          userId: uid,
          nickname: String(c.nickname || ''),
          avatarUrl: String(c.avatarUrl || ''),
          avatarObserved: Boolean(c.avatarObserved),
          liveId: String(c.liveId || ''),
          commentCount: Math.max(0, Math.floor(Number(c.commentCount) || 0)),
          giftCount: Math.max(0, Math.floor(Number(c.giftCount) || 0)),
          _laneSortAt: Math.max(0, Number(c._laneSortAt) || 0)
        });
        continue;
      }
      // 同一ユーザー: 加算・max・OR・ベター選択でマージ。
      prev.commentCount =
        (prev.commentCount || 0) + Math.max(0, Math.floor(Number(c.commentCount) || 0));
      prev.giftCount =
        (prev.giftCount || 0) + Math.max(0, Math.floor(Number(c.giftCount) || 0));
      prev._laneSortAt = Math.max(prev._laneSortAt || 0, Math.max(0, Number(c._laneSortAt) || 0));
      prev.avatarObserved = prev.avatarObserved || Boolean(c.avatarObserved);
      prev.nickname = pickBetterInterceptNickname(uid, prev.nickname, String(c.nickname || ''));
      // avatarUrl は両候補を強さスコアで比較(空は無視・実URL後着を拾う)。
      const stronger = pickStrongestAvatarUrlForUser(uid, [prev.avatarUrl, String(c.avatarUrl || '')]);
      if (stronger) prev.avatarUrl = stronger;
      const nextLid = String(c.liveId || '').trim();
      if (nextLid) prev.liveId = nextLid;
    }
  };

  ingest(existing);
  ingest(incoming);

  const out = Array.from(byUid.values());
  out.sort((a, b) => (b._laneSortAt || 0) - (a._laneSortAt || 0));
  return out;
}
