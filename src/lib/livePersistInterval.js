/**
 * v0.1.498〜501: ライブ記録の保存（コアレッサ）最小間隔を決める純粋関数。フリーズ対策 A。
 *
 * 背景: コメントは liveId ごとに 1 本の巨大配列として保存され、保存のたびに全件を
 *   JSON 直列化してメインスレッド上で書き戻す（content-entry.js persistCommentRowsImpl）。
 *   同一オリジン（live.nicovideo.jp）の複数 watch タブは Chrome が同一レンダラー＝同一
 *   メインスレッドにまとめるため、巨大配列の書き戻しが前面タブごと「応答しません」にする。
 *
 * 設計（v0.1.501 で「件数主導」に整理）:
 *   フリーズの主因は「件数が多い放送の 1 回の巨大書き込み」であって「裏タブであること」
 *   自体ではない。小〜中規模の書き込みは軽くフリーズしない。逆に、可視状態で間隔を切り替
 *   えると「タブを切り替えて複数監視する」使い方で、どのタブも切替直後に記録が遅れて見える
 *   （v0.1.499/500 の不満の主因）。
 *
 *   そこで間隔は基本的に「保存済み件数」だけで決める:
 *     - FLOOR 未満（小〜中規模）: 表示/裏に関係なく基本間隔（＝全タブ常時リアルタイム）
 *     - FLOOR〜CEIL（巨大放送）: 件数に応じて間隔を伸ばす。ここだけ可視状態で帯を変え、
 *       裏の巨大放送は上限を大きく（フリーズ源を強く抑える）、前面の巨大放送は控えめに伸ばす
 *       （単独巨大タブの自己フリーズも避けつつ、見ているタブの鮮度は保つ）。
 *
 *   ⚠ 反省: v0.1.498 は hidden を一律 1h ポーズにして「裏タブが記録しない」回帰、
 *     v0.1.499/500 は小〜中規模でも hidden 帯（8s〜）を当てて「切替直後に増えない」回帰を
 *     起こした。本版は「小〜中規模は可視非依存で常に基本間隔」にして両方を解消する。
 */

/** 基本最小間隔（小〜中規模・可視非依存）。INGEST_TIMING.coalescerMinMs と揃える想定。 */
export const LIVE_PERSIST_BASE_MS = 1500;

/** 前面タブで件数が CEIL に達したときの上限間隔。 */
export const LIVE_PERSIST_VISIBLE_MAX_MS = 6_000;

/** 裏タブで件数が CEIL に達したときの上限間隔（巨大放送のフリーズ源を強く抑える）。 */
export const LIVE_PERSIST_HIDDEN_MAX_MS = 120_000;

/** 前面タブはこの件数までは基本間隔（小〜中規模は常にリアルタイム）。 */
export const LIVE_PERSIST_GROWTH_FLOOR = 12_000;

/**
 * 裏タブ専用の throttle 開始件数（前面より大幅に低い）。
 *
 * v0.1.504: 実機で「1 万件級の放送タブを開いたまま別放送を開くと『ページが応答しません』」を確認。
 *   原因は、別放送を開くと 1 万件タブが裏に回るのに、前面用 FLOOR(12,000) 未満なので基本間隔
 *   1.5 秒のまま巨大配列の構造化クローン保存を続け、同一レンダラープロセスを共有する前面タブごと
 *   メインスレッドを固めること。裏タブは見えていないので鮮度を落としても実害が小さい（可視化時は
 *   visibilitychange の harvest が即補償）。そこで裏タブだけ早い段階（2,000 件〜）から間隔を伸ばす。
 *   前面タブの挙動は不変（≤12,000 は常にリアルタイム）＝「切替直後に増えない」回帰は再発させない。
 */
export const LIVE_PERSIST_HIDDEN_GROWTH_FLOOR = 2_000;

/** この件数で上限間隔に到達する。 */
export const LIVE_PERSIST_GROWTH_CEIL = 30_000;

/**
 * @param {object} [opts]
 * @param {boolean} [opts.hidden] document.hidden 相当（裏タブか）。FLOOR 未満では無視される。
 * @param {number} [opts.storedCount] 現在保存済みのコメント件数
 * @param {number} [opts.baseMs] 基本間隔（省略時 LIVE_PERSIST_BASE_MS）
 * @param {number} [opts.maxVisibleMs] 前面の上限間隔（省略時 LIVE_PERSIST_VISIBLE_MAX_MS）
 * @param {number} [opts.hiddenMaxMs] 裏タブの上限間隔（省略時 LIVE_PERSIST_HIDDEN_MAX_MS）
 * @param {boolean} [opts.boundedWrite] v0.1.510: その放送が「追記チャンク化済み」で、毎フラッシュの
 *   書き込みが O(追加分)＋有界テールに収まる場合 true。件数比例の間引き（巨大放送ほど間隔を
 *   伸ばす）は「毎回 全件 O(N) set が共有レンダラを固める」旧世界の対策なので、書き込みが
 *   有界化された放送では不要。true のときは件数に関係なく基本間隔を返す（裏の巨大放送でも
 *   記録カウントがリアルタイムに伸びる＝「増えない／補充停止」の解消）。
 * @returns {number} 最小間隔（ms）
 */
export function computeLivePersistIntervalMs(opts = {}) {
  const baseMs = positiveOr(opts.baseMs, LIVE_PERSIST_BASE_MS);

  // 書き込みが有界（追記チャンク＋有界テール）なら、件数比例の間引きは不要。
  //   旧スロットルの目的は「巨大配列 1 回の構造化クローン set が共有レンダラを固める」回避で、
  //   チャンク化済み放送ではその set が発生しない。常に基本間隔でリアルタイム記録する。
  if (opts.boundedWrite === true) return baseMs;

  const rawCount = Number(opts.storedCount);
  const count = Number.isFinite(rawCount) && rawCount > 0 ? rawCount : 0;

  // 前面は FLOOR(12,000) まで常にリアルタイム。裏タブは早い HIDDEN_FLOOR(2,000) から throttle
  //   開始（巨大放送の裏タブが前面を巻き込んで固めるのを防ぐ。可視化時は harvest が即補償）。
  const floor = opts.hidden
    ? LIVE_PERSIST_HIDDEN_GROWTH_FLOOR
    : LIVE_PERSIST_GROWTH_FLOOR;
  if (count <= floor) return baseMs;

  const span = LIVE_PERSIST_GROWTH_CEIL - floor;
  const ratio = span > 0
    ? Math.min(1, (count - floor) / span)
    : 1;

  const maxMs = opts.hidden
    ? Math.max(baseMs, positiveOr(opts.hiddenMaxMs, LIVE_PERSIST_HIDDEN_MAX_MS))
    : Math.max(baseMs, positiveOr(opts.maxVisibleMs, LIVE_PERSIST_VISIBLE_MAX_MS));

  return Math.round(baseMs + ratio * (maxMs - baseMs));
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function positiveOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
