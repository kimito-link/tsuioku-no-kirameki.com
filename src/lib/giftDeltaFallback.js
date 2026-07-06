/**
 * giftDeltaFallback.js
 *
 * 「ギフト個別イベント欠落配信」のフォールバック検知(2026-07-06)。
 *
 * 背景(実測+調査で確定): 配信によっては個別ギフトイベントが一切来ない(NDGRのmsg.8も
 *   ギフトのシステムコメント本文も無い)のに、合計ギフトpt(NDGR statistics 由来の集計値=
 *   ndgrDecode.js#decodeStatistics の giftPoints)だけは取れる。実測: 公式13人・18,050pt に
 *   対し拡張の検知1件=演出・効果音がほぼ全滅。ニコ生側の配信依存仕様ムラ(既知パターン・
 *   memory/handoff_2026-06-16_gift_throw_and_voice.md)。
 *
 * 設計(帳簿方式・決定論):
 *   state = { lastAggregate, accountedPoints, synthesizedPoints, lastRealEventAt, liveId }
 *   - accountedPoints: 個別イベント検知(本物)で「説明済み」のpt累計(呼び出し元が加算)。
 *   - synthesizedPoints: このモジュールがデルタ合成で「説明済み」にしたpt累計。
 *   - unaccounted = aggregate - accounted - synthesized。閾値以上なら1イベントを合成し、
 *     synthesized に加算する(=帳簿が必ず追いつく。二重計上なし)。
 *   - 集計の巻き戻り(負のdelta)は異常値として無視する(state はリセットしない=単調)。
 *   - liveId が変わったら state を初期化する(配信ごとに帳簿を分離)。
 *   - 本物の個別イベントが直近 GIFT_DELTA_DEBOUNCE_MS 以内に来ている配信ではデルタ合成を
 *     抑止する(本物の検知系が動いている配信で二重系を走らせない)。
 *   - 乱数は一切使わない。1tick(1回の computeGiftDelta 呼び出し)につき合成イベントは
 *     最大1件(バーストは呼び出し元の directHit 昇格に任せる=既存コンボ置換の踏襲)。
 */

/**
 * ギフト帯(tier)の下限pt。giftThrowProjectile.js#tierFromPoints と同じ閾値
 * (small: 1〜49 / medium: 50〜499 / large: 500〜4999 / mega: 5000〜)。
 * デルタ検知の tier 判定もこの閾値に揃える(演出/音の帯分けと整合させるため)。
 */
export const GIFT_DELTA_TIER_THRESHOLDS = Object.freeze({
  medium: 50,
  large: 500,
  mega: 5000
});

/**
 * 合成イベントを起こす最小 unaccounted pt。tierFromPoints は 1pt 以上を 'small' 帯として
 * 扱う(0pt は無効)ため、下限は 1。NDGR statistics の giftPoints は整数カウンタで、
 * 正の差分は必ず実際のギフト(丸め誤差ではない)。
 */
export const GIFT_DELTA_MIN_POINTS = 1;

/** 本物の個別イベントが直近何msにあれば、デルタ合成を抑止するか(本物優先・二重系防止)。 */
export const GIFT_DELTA_DEBOUNCE_MS = 60_000;

/**
 * @typedef {{
 *   lastAggregate: number,
 *   accountedPoints: number,
 *   synthesizedPoints: number,
 *   lastRealEventAt: number,
 *   liveId: string
 * }} GiftDeltaState
 */

/** 初期 state。 @param {string} [liveId] @returns {GiftDeltaState} */
export function makeInitialGiftDeltaState(liveId = '') {
  return {
    lastAggregate: 0,
    accountedPoints: 0,
    synthesizedPoints: 0,
    lastRealEventAt: 0,
    liveId: String(liveId || '')
  };
}

/** pt→帯(tierFromPoints と同じ閾値)。 @param {number} points @returns {'small'|'medium'|'large'|'mega'} */
export function tierForGiftDeltaPoints(points) {
  const pt = Number(points) || 0;
  if (pt >= GIFT_DELTA_TIER_THRESHOLDS.mega) return 'mega';
  if (pt >= GIFT_DELTA_TIER_THRESHOLDS.large) return 'large';
  if (pt >= GIFT_DELTA_TIER_THRESHOLDS.medium) return 'medium';
  return 'small';
}

/**
 * 本物の個別イベントを検知した(=説明済みにする)ことを帳簿に反映する純関数。
 * 呼び出し元(venueBar.js)は maybeThrowGiftFromSpeech / handleNewGiftEvents で本物を
 * 検知した瞬間にこれを呼び、accountedPoints と lastRealEventAt を進める。
 * @param {Partial<GiftDeltaState>|null|undefined} prev
 * @param {number} points この本物イベントの pt
 * @param {number} nowMs
 * @returns {GiftDeltaState}
 */
export function accountRealGiftEvent(prev, points, nowMs) {
  const p = normalizeState(prev);
  const pt = Math.max(0, Number(points) || 0);
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  return {
    ...p,
    accountedPoints: p.accountedPoints + pt,
    lastRealEventAt: now
  };
}

/** @param {Partial<GiftDeltaState>|null|undefined} prev @returns {GiftDeltaState} */
function normalizeState(prev) {
  const p = prev && typeof prev === 'object' ? prev : null;
  return {
    lastAggregate: Math.max(0, Number(p?.lastAggregate) || 0),
    accountedPoints: Math.max(0, Number(p?.accountedPoints) || 0),
    synthesizedPoints: Math.max(0, Number(p?.synthesizedPoints) || 0),
    lastRealEventAt: Math.max(0, Number(p?.lastRealEventAt) || 0),
    liveId: String(p?.liveId || '')
  };
}

/**
 * 集計ギフトpt(NDGR statistics 由来の累計)から、個別イベントで説明できていない分を
 * 検知し、デルタ合成イベントを1件(あれば)返す純関数。
 *
 * @param {Partial<GiftDeltaState>|null|undefined} state 前回 state(null=初期状態から)
 * @param {number} aggregatePoints 現在の集計ギフトpt(累計・NDGR statistics giftPoints)
 * @param {number} nowMs 現在時刻(epoch ms)
 * @param {{ liveId?: string, minPoints?: number, debounceMs?: number }} [opts]
 * @returns {{ events: Array<{ points: number, tier: 'small'|'medium'|'large'|'mega' }>, nextState: GiftDeltaState }}
 */
export function computeGiftDelta(state, aggregatePoints, nowMs, opts = {}) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : 0;
  const liveId = String(opts.liveId ?? '');
  const minPoints =
    Number.isFinite(Number(opts.minPoints)) && Number(opts.minPoints) > 0
      ? Number(opts.minPoints)
      : GIFT_DELTA_MIN_POINTS;
  const debounceMs =
    Number.isFinite(Number(opts.debounceMs)) && Number(opts.debounceMs) >= 0
      ? Number(opts.debounceMs)
      : GIFT_DELTA_DEBOUNCE_MS;

  let s = normalizeState(state);

  // liveId 切替: 帳簿を配信ごとに分離(前配信の累計を引き継がない)。
  if (liveId && s.liveId && s.liveId !== liveId) {
    s = makeInitialGiftDeltaState(liveId);
  } else if (liveId && !s.liveId) {
    s = { ...s, liveId };
  }

  const aggregate = Math.max(0, Math.floor(Number(aggregatePoints) || 0));

  // 集計が取れていない(0や不正値)場合は何もしない(state のaggregateだけ据え置き)。
  if (!(aggregate > 0) && s.lastAggregate === 0) {
    return { events: [], nextState: s };
  }

  // 集計の巻き戻り(負のdelta)は異常値として無視する。state をリセットせず、
  // lastAggregate も動かさない(単調前進の帳簿を保つ)。
  if (aggregate < s.lastAggregate) {
    return { events: [], nextState: s };
  }

  const nextState = { ...s, lastAggregate: aggregate };

  // 本物の個別イベントが直近debounceMs以内に来ている配信では合成を抑止する。
  const realEventRecent =
    s.lastRealEventAt > 0 && now >= s.lastRealEventAt && now - s.lastRealEventAt < debounceMs;
  if (realEventRecent) {
    return { events: [], nextState };
  }

  const unaccounted = aggregate - s.accountedPoints - s.synthesizedPoints;
  if (unaccounted < minPoints) {
    return { events: [], nextState };
  }

  // 1tickにつき合成は最大1イベント(バーストは呼び出し元のdirectHit昇格に任せる)。
  const tier = tierForGiftDeltaPoints(unaccounted);
  return {
    events: [{ points: unaccounted, tier }],
    nextState: { ...nextState, synthesizedPoints: s.synthesizedPoints + unaccounted }
  };
}
