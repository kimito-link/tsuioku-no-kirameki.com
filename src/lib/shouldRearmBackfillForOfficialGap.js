/**
 * 自動補充の核心: 「公式コメント件数と記録件数のギャップが大きいまま、NDGR バックフィルが
 * 未完了で止まっている」とき、ワンショット guard（_backfillTriedLiveId）を解除して
 * バックフィルを続きから再開してよいかを判定する純関数。
 *
 * 背景（実機 v0.1.476 で観測・「記録は公式の約67%で頭打ち」）:
 *   - ライブ中のギャップ追い（maybeOfficialGapQuietDeepHarvest）は DOM 仮想リストの
 *     deep harvest しか起動しない。DOM は「画面のコメント欄に今ある分」しか拾えないので、
 *     利用者が参加する前の過去コメントは永遠に埋まらない。
 *   - 過去コメントをサーバーから取れるのは NDGR バックフィル（crawlNdgrBackward）だけ。
 *     しかし NDGR は liveId ごとに実質1回（_backfillTriedLiveId）しか走らず、no_progress /
 *     cap_reseeds / visited_revisit / aborted（タブ非表示）等の「非一過性」stop では
 *     自動再試行されない（backfillTransientRetry の対象外）。
 *   - 結果、ギャップを本当に埋められる経路が一度きりで諦め、67% 等で固定される。
 *
 * この関数は「ギャップが残り、かつ配信開始まで到達（reached_start）していない」ときに、
 * 回数上限つきで再開を許可する。NDGR は resumeFromVpos で前回の続きから掘れるので、
 * 再開ごとにギャップは縮む（同区画は dedupe で弾かれ無駄にならない）。
 *
 * ⚠️ 暴走防止のため、容量ガード（cap_rows / cap_bytes）と完了（reached_start）では
 *    再開しない。回数上限（maxRearms）で「no_progress が永遠に続く」ケースも有界化する。
 *    呼び出し側は別途クールダウン（OFFICIAL_GAP_DEEP_TIMING.cooldownMs）でも throttle する。
 *
 * @module shouldRearmBackfillForOfficialGap
 */

/**
 * これらの stop 理由では、ギャップが残っていても再開しない。
 * - reached_start: 配信開始まで遡り切った＝埋め切っている。
 * - cap_rows / cap_bytes: 容量ガード（暴走防止）。これ以上掘らせない設計意図を尊重する。
 * @type {ReadonlySet<string>}
 */
export const BACKFILL_GAP_REARM_BLOCKED_STOP_REASONS = new Set([
  'reached_start',
  'cap_rows',
  'cap_bytes'
]);

/**
 * fix/backfill-all-sizes（2026-06-01）: 放送サイズに依らずギャップを追い切るための「実効
 * 再アーム停止しきい値」を返す純関数。
 *
 * 真因（実機 lv350655041・公式344/記録155=gap189）: 再アーム停止が固定絶対値 minGapAbsolute(170)
 *   のみだったため、記録が 174 件（gap169<170）に達した時点で打ち切られ、約49%で頭打ちになった。
 *   170 は大型放送（公式 数千〜万）でギフト/運営/system の取り込み対象外ぶんを延々追わないための
 *   絶対上限であって、公式が小さい放送では「割合的にまだ大穴」なのに止まる副作用があった。
 *
 * 設計: 実効しきい値 = clamp(round(official × ratio), smallFloor, minGapAbsolute)。
 *   - 大型（official 14000・ratio 0.058 → 812）→ clamp で minGapAbsolute(170) に収束＝従来不変。
 *   - 中規模（official 2000 → 116）→ 116（91.5%→94%相当へ）。
 *   - 小規模（official 344 → 20）→ 20（49%→約94%まで追う）。
 *   - 極小（official 50 → 3）→ smallFloor(8) で底打ち（ギフト/運営ぶんを延々追わない）。
 * official が不明/非正なら従来どおり minGapAbsolute を返す（後方互換＝挙動を変えない）。
 *
 * @param {object} args
 * @param {number|null|undefined} args.official 公式コメント累計（statistics.comments）。
 * @param {number} args.minGapAbsolute 大型放送向けの絶対上限（OFFICIAL_GAP_DEEP_TIMING.minGapAbsolute）。
 * @param {number} args.gapRatioOfOfficial 公式件数に対する許容残差の割合（同 gapRatioOfOfficial）。
 * @param {number} args.smallFloor 極小放送での下限（同 minGapFloorSmall）。
 * @returns {number} 実効再アーム停止しきい値（このギャップ未満なら再アームしない）。
 */
export function computeEffectiveBackfillRearmMinGap(args) {
  const minGapAbsolute = Number(args && args.minGapAbsolute);
  const absolute = Number.isFinite(minGapAbsolute) && minGapAbsolute > 0 ? minGapAbsolute : 0;
  const official = Number(args && args.official);
  // official 不明/非正は従来どおり絶対上限（挙動不変）。
  if (!Number.isFinite(official) || official <= 0) return absolute;
  const ratio = Number(args && args.gapRatioOfOfficial);
  const smallFloorRaw = Number(args && args.smallFloor);
  const smallFloor = Number.isFinite(smallFloorRaw) && smallFloorRaw >= 0 ? smallFloorRaw : 0;
  if (!Number.isFinite(ratio) || ratio <= 0) return absolute;
  const ratioGap = Math.round(official * ratio);
  // clamp(ratioGap, smallFloor, absolute)
  let eff = ratioGap;
  if (eff < smallFloor) eff = smallFloor;
  if (absolute > 0 && eff > absolute) eff = absolute;
  return eff;
}

/**
 * @param {object} args
 * @param {boolean} args.backfillRunning いま巡回中か（_backfillAbort != null）。
 * @param {boolean} args.backfillFinishedOnce 一度でも巡回が終了したか（_backfillProgress.done===1）。
 * @param {boolean} args.guardMatchesLiveId 現在の liveId でワンショット guard がセット済みか
 *   （_backfillTriedLiveId === liveId）。未セット＝まだ走っていないので再開不要。
 * @param {string} args.stopReason 直近巡回の stop 理由。
 * @param {number} args.gap 公式件数 − 記録件数（負なら 0 扱い推奨）。
 * @param {number} args.minGap このギャップ未満なら「十分埋まった」とみなし再開しない。
 * @param {number} args.rearmCount この liveId で既にギャップ再開した回数。
 * @param {number} args.maxRearms ギャップ再開の上限回数。
 * @param {number} [args.reachedStartGapOverride] reached_start（通常は再開しない＝遡り切ったと
 *   みなす）でも、ギャップがこの件数以上なら「明らかな誤完了」とみなして上限つきで再 sweep を
 *   許可するしきい値。0/未指定なら reached_start は従来どおりブロック（後方互換）。
 *   背景（fix/broadcast-bulk-catchup・2026-05-31）: stale resume で配信末尾へジャンプして
 *   数区画だけ遡り reached_start 誤完了 → 記録が公式の数% で固定される放送がある。次回は
 *   forceFullSweep（resume 破棄）で今から遡り直すので、誤完了を是正できる。
 * @returns {boolean} true なら guard を解除して NDGR バックフィルを続きから再開してよい。
 */
export function shouldRearmBackfillForOfficialGap(args) {
  if (!args) return false;
  // 巡回中は触らない（二重起動防止）。
  if (args.backfillRunning) return false;
  // まだ一度も終了していない（初回が走っている最中/起動前）なら待つ。
  if (!args.backfillFinishedOnce) return false;
  // この liveId で guard がセットされていない＝まだ走っていない。
  //   maybeAutoStartBackfill が初回起動するので、ここで解除する必要はない。
  if (!args.guardMatchesLiveId) return false;

  const gap = Number(args.gap);
  const minGap = Number(args.minGap);
  if (!Number.isFinite(gap) || !Number.isFinite(minGap)) return false;
  if (gap < minGap) return false;

  const reason = String(args.stopReason || '');
  if (BACKFILL_GAP_REARM_BLOCKED_STOP_REASONS.has(reason)) {
    // reached_start で「大ギャップ」のときだけ、明らかな誤完了として上限つきで再 sweep 許可。
    //   cap_rows / cap_bytes（容量ガード）は誤完了ではないので常にブロックを維持。
    const override = Number(args.reachedStartGapOverride);
    const allowReachedStartReSweep =
      reason === 'reached_start' &&
      Number.isFinite(override) &&
      override > 0 &&
      gap >= override;
    if (!allowReachedStartReSweep) return false;
  }

  const rearmCount = Number(args.rearmCount) || 0;
  const maxRearms = Number(args.maxRearms);
  if (!Number.isFinite(maxRearms)) return false;
  if (rearmCount >= maxRearms) return false;

  return true;
}
