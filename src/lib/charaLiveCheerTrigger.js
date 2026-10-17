/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】応援コメント件数の節目(100件など)を会場のゆっくり3人が「お祝い」するかの判定
 * 【この箱に入らないもの】描画(charaLiveStage.js)・タイミング(charaLiveController.js)・件数の集計(content-entry.js が正本)
 * 【書けるstorageキー】なし
 * 【正本宣言】「3人が節目でお祝いするか」の判定と、その節目で既存シャワーを止めるかの判定はこのファイルのみ
 *
 * ★設計(2026-10-17・council-fable・docs/handoff/yukkuri-float-and-celebrate-DESIGN-2026-10-17.md §E):
 *   「アプリ記録 N 件達成!」の告知・効果音・降りものシャワーは popup 側に既にある(supportCelebration.js)。
 *   足りないのは【常駐の3人が反応する】ことだけ。件数は数え直さず、会場が購読済みの記録件数(panel_summary の recordedCount)を使い、
 *   節目の判定も既存の pickHighestCrossedMilestone / COMMENT_MILESTONES を再利用する(新しい節目表を作らない)。
 *   一回性は「会場ローカルの前回件数(baseline)」が単調に進むことで保つ(storage に書かない)。
 * @module charaLiveCheerTrigger
 */

import { COMMENT_MILESTONES, pickHighestCrossedMilestone } from './supportCelebration.js';

/** 3人がお祝いする最小の節目。ユーザー要望は100件(10/25/50 は従来どおり既存の演出のみ)。 */
export const CHEER_MIN_MILESTONE = 100;

/** 1回の観測でこれ以上件数が増えたら、過去ログの一括流入(backfill/タイムシフト)とみなして祝わない。 */
export const CHEER_JUMP_GUARD = 300;

/**
 * 記録件数が節目を跨いだかを判定し、次回の基準(baseline)を返す。
 *   - prev が null(開いて最初の観測)は基準を採るだけで祝わない(開いた瞬間に昔の節目を祝わない)。
 *   - 件数が減った(配信切替など)は基準を取り直すだけ。
 *   - 一度に jumpGuard 以上増えたら一括流入とみなし基準を更新するだけ。
 * @param {number|null|undefined} prev 前回の件数(最初は null)
 * @param {unknown} next 今回の件数
 * @param {{ minMilestone?: number, jumpGuard?: number }} [opts]
 * @returns {{ baseline: number|null, cheer: { milestone: number }|null }}
 */
export function resolveCommentCheer(prev, next, opts = {}) {
  const minMilestone = Number.isFinite(opts.minMilestone) ? Number(opts.minMilestone) : CHEER_MIN_MILESTONE;
  const jumpGuard = Number.isFinite(opts.jumpGuard) && Number(opts.jumpGuard) > 0 ? Number(opts.jumpGuard) : CHEER_JUMP_GUARD;
  const n = next == null || next === '' ? NaN : Number(next);
  if (!Number.isFinite(n) || n < 0) return { baseline: prev == null ? null : prev, cheer: null };
  const cur = Math.floor(n);
  if (prev == null || !Number.isFinite(prev)) return { baseline: cur, cheer: null };
  if (cur < prev) return { baseline: cur, cheer: null };
  if (cur - prev >= jumpGuard) return { baseline: cur, cheer: null };
  const hit = pickHighestCrossedMilestone(prev, cur, COMMENT_MILESTONES.filter((m) => m >= minMilestone));
  return { baseline: cur, cheer: hit == null ? null : { milestone: hit } };
}

/**
 * 節目を「100件!」の文言にする。
 * @param {unknown} milestone
 * @returns {string}
 */
export function cheerLabel(milestone) {
  const n = Math.floor(Number(milestone));
  return Number.isFinite(n) && n > 0 ? `${n.toLocaleString('ja-JP')}件!` : '';
}

/**
 * 視聴ページに中継される既存の降りものシャワーのうち、会場のゆっくり3人がお祝いする節目のものは、会場を開いている間は止める(3人だけにする)。
 *   ユーザー決定(2026-10-17): 「3人だけ」。会場が開いていなければ従来どおりシャワーを出す。
 * @param {{ variant?: unknown, spec?: { kind?: unknown, dedupeKey?: unknown }|null }|null|undefined} payload NLS_PLAY_WATCH_CELEBRATION の payload
 * @param {boolean} venueOpen html.nlsb-venue-open が付いているか
 * @returns {boolean} true なら中継のシャワーを出さない
 */
export function shouldSkipShowerForCheer(payload, venueOpen) {
  if (venueOpen !== true) return false;
  if (!payload || payload.variant !== 'support') return false;
  const spec = payload.spec;
  if (!spec || spec.kind !== 'comment_milestone') return false;
  const m = /^comment_(\d+)$/.exec(String(spec.dedupeKey || ''));
  return !!m && Number(m[1]) >= CHEER_MIN_MILESTONE;
}
