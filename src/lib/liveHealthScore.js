/**
 * 配信ごとの「健康チェック」5段階評価(純関数)。
 *
 * status / Web版のカード上部に、各配信の状態を ●●●●○ のような5段階で出して、
 * 数値を読まなくても「健康か」が一目で分かるようにする。
 *
 * 入力は summarizeOneLive が返す live オブジェクト(perfDiag 含む)。
 * 4 指標を 0〜5 の整数スコアに正規化する。判定基準はあえて素朴に(透明性優先)。
 *
 * @module liveHealthScore
 */

/**
 * スコアを 0〜5 にクランプ。
 * @param {number} n
 * @returns {number}
 */
function clamp5(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
}

/**
 * 取得率(記録/公式)を 5 段階に。100% 近いほど満点。
 * @param {number|null} ratePct
 * @returns {number}
 */
export function scoreCaptureRate(ratePct) {
  if (ratePct == null || !Number.isFinite(ratePct)) return 0;
  // 95%+→5, 80%+→4, 60%+→3, 40%+→2, 20%+→1, それ未満→0
  if (ratePct >= 95) return 5;
  if (ratePct >= 80) return 4;
  if (ratePct >= 60) return 3;
  if (ratePct >= 40) return 2;
  if (ratePct >= 20) return 1;
  return 0;
}

/**
 * 描画の健康(白化リスクの低さ)。前面で活発に描画されているほど満点。
 * 裏タブは省電力で描画が減るのが仕様なので減点しすぎない(満点-1 を上限の目安)。
 * @param {{ paintCount?: number|null, tabVisible?: boolean|null }|null} perfDiag
 * @returns {number}
 */
export function scoreRenderHealth(perfDiag) {
  if (!perfDiag) return 0;
  const paint = Number(perfDiag.paintCount);
  const visible = perfDiag.tabVisible;
  if (!Number.isFinite(paint)) return 0;
  // 前面: 描画回数が多いほど健康(20+→5, 10+→4, 5+→3, 1+→2, 0→1)。
  if (visible === true) {
    if (paint >= 20) return 5;
    if (paint >= 10) return 4;
    if (paint >= 5) return 3;
    if (paint >= 1) return 2;
    return 1;
  }
  // 裏タブ: 省電力で描画が減るのは正常。最低限描画していれば「省電力で安定」=4扱い。
  //   全く描画 0 なら復帰未確認として 2。
  if (visible === false) {
    return paint >= 1 ? 4 : 2;
  }
  // 可視状態不明: paint があれば中庸。
  return paint >= 1 ? 3 : 1;
}

/**
 * 更新の鮮度。最終取り込みが新しいほど満点。
 * @param {number|null} lastIngestAgoMs
 * @returns {number}
 */
export function scoreFreshness(lastIngestAgoMs) {
  if (lastIngestAgoMs == null || !Number.isFinite(lastIngestAgoMs)) return 0;
  const sec = lastIngestAgoMs / 1000;
  // 10秒以内→5, 30秒→4, 1分→3, 3分→2, 10分→1, それ以上→0
  if (sec <= 10) return 5;
  if (sec <= 30) return 4;
  if (sec <= 60) return 3;
  if (sec <= 180) return 2;
  if (sec <= 600) return 1;
  return 0;
}

/**
 * スクロールの軽さ(paint 所要 ms が小さいほど軽い=満点)。
 * @param {{ lastPaintMs?: number|null }|null} perfDiag
 * @returns {number}
 */
export function scoreScrollLightness(perfDiag) {
  if (!perfDiag) return 0;
  const ms = Number(perfDiag.lastPaintMs);
  if (!Number.isFinite(ms)) return 0;
  // 20ms以下→5, 40→4, 80→3, 150→2, 300→1, それ以上→0
  if (ms <= 20) return 5;
  if (ms <= 40) return 4;
  if (ms <= 80) return 3;
  if (ms <= 150) return 2;
  if (ms <= 300) return 1;
  return 0;
}

/**
 * live(summarizeOneLive の戻り)から4指標の健康スコアをまとめて算出する。
 * @param {{ officialRatePct?: number|null, lastIngestAgoMs?: number|null, perfDiag?: object|null }|null|undefined} live
 * @returns {{ capture: number, render: number, freshness: number, scroll: number }}
 */
export function buildLiveHealth(live) {
  if (!live || typeof live !== 'object') {
    return { capture: 0, render: 0, freshness: 0, scroll: 0 };
  }
  const l = /** @type {Record<string, any>} */ (live);
  const perf = l.perfDiag && typeof l.perfDiag === 'object' ? l.perfDiag : null;
  return {
    capture: clamp5(scoreCaptureRate(l.officialRatePct)),
    render: clamp5(scoreRenderHealth(perf)),
    freshness: clamp5(scoreFreshness(l.lastIngestAgoMs)),
    scroll: clamp5(scoreScrollLightness(perf))
  };
}

/**
 * スコア(0〜5)を ●●●○○ の文字列にする。
 * @param {number} score
 * @returns {string}
 */
export function scoreToDots(score) {
  const s = clamp5(score);
  return '●'.repeat(s) + '○'.repeat(5 - s);
}
