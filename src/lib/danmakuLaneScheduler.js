// danmakuLaneScheduler.js
// v0.1.652: 追憶のきらめき独自コメビュ「KIRAMEKI Comment View」の土台(PR1)。
//
// 設計(3視点会議 wf_66d21f13-078 で確定): わんコメは「コメントを流す帯」。追憶は
//   「視聴者のコメントが集まると、ニコ生弾幕が降り・3キャラが反応し・各コメントに
//   きらめき記章の後光が灯る、応援が見えるコメビュ」。器(流す表示)は飽和した入場券で、
//   唯一性は記録基盤(きらめき7賞)が画面を動かすこと。このファイルは表示の前段=
//   「どのコメントを・どのレーンで・どの速さで流すか / 弾幕(同一コメント一斉到達)か」を
//   決める純粋スケジューラ。DOM/storage/chrome.* に一切依存しない(テスト可能・Web版/OBS版で共用)。
//
// 重さ/白化対策の心臓(MEMORY: paintWatchPopupUi の cap前全arr O(N)走査が重さの真因):
//   1.8万件のコメントが来ても、画面に同時に存在するのは maxOnScreen 個だけ。リングバッファで
//   cap し、超過分は evicted として返して呼び出し側が DOM から remove する。全件走査も
//   全消し再構築もしない=構造的に重くならない。

/**
 * @typedef {Object} DanmakuRow
 * @property {string} id        一意キー(コメントの commentNo/id 由来・呼び出し側が付与)
 * @property {string} text      表示テキスト
 * @property {number} lane      割り当てレーン番号(0-based)
 * @property {number} admittedAt 画面に乗せた時刻(ms)
 * @property {number} durationMs 流れ切るまでの時間(ms)
 */

/**
 * @typedef {Object} DanmakuSchedulerState
 * @property {DanmakuRow[]} onScreen 今画面に乗っている行(admittedAt 昇順)
 * @property {{ text: string, at: number }[]} recent 弾幕検出用の直近テキスト窓
 */

/** 既定の画面同時表示上限(白化/重さの回帰ガード) */
export const DEFAULT_MAX_ON_SCREEN = 8;
/** 既定のレーン数 */
export const DEFAULT_LANE_COUNT = 8;
/** 弾幕検出の窓(ms) */
export const DEFAULT_BURST_WINDOW_MS = 8000;
/** 弾幕検出のしきい値(窓内の同一正規化テキスト件数) */
export const DEFAULT_BURST_THRESHOLD = 4;

/**
 * スケジューラの初期状態を作る。
 * @returns {DanmakuSchedulerState}
 */
export function createDanmakuSchedulerState() {
  return {
    onScreen: /** @type {DanmakuRow[]} */ ([]),
    recent: /** @type {{ text: string, at: number }[]} */ ([])
  };
}

/**
 * テキストを弾幕一致判定用に正規化する(全角空白/連続スペース除去・小文字・トリム)。
 * 「888」「８８８」「888888」のような伸縮は前方一致で吸収するため、ここでは記号と
 * 大小・空白だけ均す(過剰正規化で別コメントを誤結合しない)。
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeDanmakuText(text) {
  return String(text ?? '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

/**
 * 文字数から流速(画面を流れ切る時間)を決める純計算。長文ほどゆっくり=読み切れる。
 * @param {unknown} text
 * @param {{ baseMs?: number, perCharMs?: number, maxMs?: number }} [opts]
 * @returns {number} durationMs
 */
export function computeRowSpeed(text, opts) {
  const baseMs = opts?.baseMs ?? 6000;
  const perCharMs = opts?.perCharMs ?? 120;
  const maxMs = opts?.maxMs ?? 16000;
  const len = String(text ?? '').length;
  return Math.min(maxMs, baseMs + len * perCharMs);
}

/**
 * 最も古い空きレーンを選ぶ(レーン衝突回避)。全レーン埋まっていれば、最も古く乗った
 * 行のレーンを再利用する(画面端に達した行のレーンは実質空く前提)。
 * @param {DanmakuSchedulerState} state
 * @param {number} laneCount
 * @returns {number} lane index
 */
export function pickLane(state, laneCount) {
  const n = Math.max(1, Math.floor(laneCount) || DEFAULT_LANE_COUNT);
  /** @type {Map<number, number>} lane → 最新 admittedAt */
  const laneLatest = new Map();
  for (const r of state.onScreen) {
    const prev = laneLatest.get(r.lane);
    if (prev == null || r.admittedAt > prev) laneLatest.set(r.lane, r.admittedAt);
  }
  // 未使用レーンがあれば最小番号を使う。
  for (let i = 0; i < n; i += 1) {
    if (!laneLatest.has(i)) return i;
  }
  // 全レーン使用中 → 最後に乗った時刻が最も古いレーンを再利用。
  let bestLane = 0;
  let bestAt = Infinity;
  for (const [lane, at] of laneLatest) {
    if (lane < n && at < bestAt) {
      bestAt = at;
      bestLane = lane;
    }
  }
  return bestLane;
}

/**
 * コメントを画面に乗せる。リングバッファで maxOnScreen を厳守し、超過分(最古)を evicted で返す。
 * 副作用なし=新しい state を返す(state は in-place 変更しない)。
 *
 * @param {DanmakuSchedulerState} state
 * @param {{ id: string, text: string }} comment
 * @param {number} now ms
 * @param {{ maxOnScreen?: number, laneCount?: number, burstWindowMs?: number }} [opts]
 * @returns {{ state: DanmakuSchedulerState, row: DanmakuRow, evicted: DanmakuRow[] }}
 */
export function admitComment(state, comment, now, opts) {
  const maxOnScreen = Math.max(1, Math.floor(opts?.maxOnScreen ?? DEFAULT_MAX_ON_SCREEN));
  const laneCount = opts?.laneCount ?? DEFAULT_LANE_COUNT;
  const burstWindowMs = opts?.burstWindowMs ?? DEFAULT_BURST_WINDOW_MS;
  const text = String(comment?.text ?? '');

  const lane = pickLane(state, laneCount);
  /** @type {DanmakuRow} */
  const row = {
    id: String(comment?.id ?? ''),
    text,
    lane,
    admittedAt: now,
    durationMs: computeRowSpeed(text)
  };

  const onScreen = [...state.onScreen, row];
  /** @type {DanmakuRow[]} */
  const evicted = [];
  // cap 超過分は最古(先頭)から落とす。
  while (onScreen.length > maxOnScreen) {
    const old = onScreen.shift();
    if (old) evicted.push(old);
  }

  // 弾幕検出窓を更新(窓外を間引く)。
  const recent = [...state.recent, { text: normalizeDanmakuText(text), at: now }].filter(
    (e) => now - e.at <= burstWindowMs
  );

  return { state: { onScreen, recent }, row, evicted };
}

/**
 * アニメ完了などで行を画面から外す。副作用なし。
 * @param {DanmakuSchedulerState} state
 * @param {string} id
 * @returns {DanmakuSchedulerState}
 */
export function retireRow(state, id) {
  return {
    onScreen: state.onScreen.filter((r) => r.id !== id),
    recent: state.recent
  };
}

/**
 * 弾幕(同一/類似コメントの一斉到達)を検出する。窓内の同一正規化テキストが
 * threshold 件以上なら、その語で弾幕発火すべきと判定する。O(window) で
 * Levenshtein 等は使わない(軽量・スクロール中も走れる)。
 *
 * 「888」「88888」のような伸縮は、短い方が長い方の前方部分一致になるよう
 * 共通プレフィックス(先頭3文字以上)でも数える。
 *
 * @param {DanmakuSchedulerState} state
 * @param {unknown} candidateText 今来たコメント
 * @param {{ threshold?: number }} [opts]
 * @returns {{ burst: boolean, phrase: string, count: number }}
 */
export function shouldBurstDanmaku(state, candidateText, opts) {
  const threshold = Math.max(2, Math.floor(opts?.threshold ?? DEFAULT_BURST_THRESHOLD));
  const norm = normalizeDanmakuText(candidateText);
  if (!norm) return { burst: false, phrase: '', count: 0 };

  // 完全一致 + 前方一致(短い方が長い方の prefix・3文字以上)で数える。
  // candidate 自身も「今その語が1件来た」として数える(窓 + 今回 = 合計)。
  const key3 = norm.slice(0, 3);
  let count = 1;
  for (const e of state.recent) {
    if (!e.text) continue;
    if (e.text === norm) {
      count += 1;
    } else if (
      key3.length >= 3 &&
      (e.text.startsWith(key3) || norm.startsWith(e.text.slice(0, 3)))
    ) {
      count += 1;
    }
  }
  return { burst: count >= threshold, phrase: norm, count };
}
