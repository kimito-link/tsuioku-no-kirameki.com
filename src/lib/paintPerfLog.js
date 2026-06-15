// paintPerfLog.js
// v0.1.725: 描画(paint)コストの軽量リングバッファ記録(純関数)。
//
// 目的(性能・安定性会議 + 星野メソッド「速度はデザインの一部・中で測って外で読む」):
//   paintWatchPopupUi 等の重い描画区間の所要 ms を本番でも軽く記録し、status/diag で読む。
//   chrome-devtools を開かなくても「重い瞬間」を数値で捕まえられるようにする(Karpathy=推測でなく実測)。
//
// このファイルは記録・集計の純ロジックだけ(DOM/chrome.* 非依存・テスト可能)。
//   サンプルは { ms, n, at }(所要ms・対象件数・時刻)。リングで最新 N 件だけ保持。

/** リングに保持する最大サンプル数(軽量・直近の傾向が分かれば十分)。 */
export const PAINT_PERF_RING_MAX = 60;

/**
 * 1サンプルを追加し、リング上限を超えたら古いものから捨てた新配列を返す(非破壊)。
 * @param {Array<{ms:number,n:number,at:number}>} ring 既存リング
 * @param {{ ms:number, n?:number, at:number }} sample 追加するサンプル
 * @param {number} [max=PAINT_PERF_RING_MAX]
 * @returns {Array<{ms:number,n:number,at:number}>}
 */
export function pushPaintPerfSample(ring, sample, max = PAINT_PERF_RING_MAX) {
  const list = Array.isArray(ring) ? ring.slice() : [];
  const ms = Number(sample?.ms);
  const at = Number(sample?.at);
  if (!Number.isFinite(ms) || ms < 0 || !Number.isFinite(at)) return list;
  const n = Number.isFinite(Number(sample?.n)) ? Math.max(0, Math.floor(Number(sample.n))) : 0;
  list.push({ ms: Math.round(ms * 10) / 10, n, at });
  const cap = Math.max(1, Math.floor(Number(max) || PAINT_PERF_RING_MAX));
  if (list.length > cap) list.splice(0, list.length - cap);
  return list;
}

/**
 * リングから集計(件数・平均・p50・p95・最大・最新)を出す。status/diag 表示用。
 * @param {Array<{ms:number,n:number,at:number}>} ring
 * @returns {{ count:number, avgMs:number, p50Ms:number, p95Ms:number, maxMs:number, lastMs:number, lastN:number, lastAt:number }}
 */
export function summarizePaintPerf(ring) {
  const list = Array.isArray(ring) ? ring.filter((s) => s && Number.isFinite(Number(s.ms))) : [];
  if (list.length === 0) {
    return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, lastMs: 0, lastN: 0, lastAt: 0 };
  }
  const msSorted = list.map((s) => Number(s.ms)).sort((a, b) => a - b);
  const sum = msSorted.reduce((a, b) => a + b, 0);
  const pick = (/** @type {number} */ p) =>
    msSorted[Math.min(msSorted.length - 1, Math.floor((p / 100) * msSorted.length))];
  const last = list[list.length - 1];
  const round = (/** @type {number} */ x) => Math.round(x * 10) / 10;
  return {
    count: list.length,
    avgMs: round(sum / msSorted.length),
    p50Ms: round(pick(50)),
    p95Ms: round(pick(95)),
    maxMs: round(msSorted[msSorted.length - 1]),
    lastMs: round(Number(last.ms)),
    lastN: Math.max(0, Math.floor(Number(last.n) || 0)),
    lastAt: Number(last.at) || 0
  };
}

/**
 * paint コスト記録器を作る(状態+間引き保存を内包し、呼び出し側を1行にする)。
 * @param {{ persist: (ring: Array<{ms:number,n:number,at:number}>) => void, persistEveryMs?: number, max?: number }} io
 * @returns {(ms:number, n:number) => void} record(ms, n)
 */
export function createPaintPerfRecorder(io) {
  /** @type {Array<{ms:number,n:number,at:number}>} */
  let ring = [];
  let lastAt = 0;
  const everyMs = Number(io?.persistEveryMs) > 0 ? Number(io.persistEveryMs) : 2000;
  const max = Number(io?.max) > 0 ? Number(io.max) : PAINT_PERF_RING_MAX;
  return (ms, n) => {
    ring = pushPaintPerfSample(ring, { ms, n, at: Date.now() }, max);
    const now = Date.now();
    if (now - lastAt < everyMs) return;
    lastAt = now;
    try {
      io.persist(ring);
    } catch {
      /* 呼び出し側の persist 失敗は無視 */
    }
  };
}

/**
 * 重さの判定(status の信号色用)。p95 を閾値で good/warn/bad に。
 * @param {{ p95Ms:number }} summary
 * @returns {'good'|'warn'|'bad'}
 */
export function paintPerfHealth(summary) {
  const p95 = Number(summary?.p95Ms) || 0;
  if (p95 >= 50) return 'bad'; // 1フレーム(16ms)を大きく超える=体感カクつき
  if (p95 >= 16) return 'warn';
  return 'good';
}
