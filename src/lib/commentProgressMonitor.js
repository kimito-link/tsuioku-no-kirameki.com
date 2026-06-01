/**
 * 記録進捗の自動監視ロジック（純関数）。
 *
 * 目的（目視卒業・2026-06-01）:
 *   「公式コメント件数（officialCommentCount）」と「記録できた件数
 *   （observedRecordedCommentCount）」の時系列サンプルから、いま記録が
 *     - reached（目標割合まで追い切った＝放置で OK）
 *     - growing（順調に増えている）
 *     - stalled（ギャップが残っているのに一定時間増えていない＝要確認）
 *     - idle（公式件数が不明・データ不足で判定できない）
 *   のどれかを判定する。content script が定期サンプリングしてこの関数で判定し、
 *   ステータス変化時だけオーバーレイ/コンソールに出す（ユーザーが件数を凝視しなくて済む）。
 *
 * ⚠️ 公式件数にはギフト・運営など本拡張が記録しない種別も含まれるため、100% には
 *    到達しないのが正常。targetPct（既定 0.94）で「実質追い切った」を判定する。
 *
 * この関数は時刻・乱数・DOM に触れない（呼び出し側が now と sample を渡す）。
 *
 * @module commentProgressMonitor
 */

/**
 * @typedef {{ t: number, recorded: number, official: number|null }} ProgressSample
 */

/** @returns {ProgressSample[]} 空のサンプル列。 */
export function createProgressSamples() {
  return [];
}

/**
 * サンプルを追加し、リングバッファとして maxSamples 件に丸めた新配列を返す（純関数）。
 * recorded は単調増加が期待値だが、巻き戻り（再読込直後の 0 等）も素直に格納する
 * （判定側が「直近の増加時刻」で吸収する）。
 *
 * @param {ProgressSample[]} samples
 * @param {{ t:number, recorded:number, official:number|null|undefined }} sample
 * @param {{ maxSamples?: number }} [opts]
 * @returns {ProgressSample[]}
 */
export function pushProgressSample(samples, sample, opts) {
  const list = Array.isArray(samples) ? samples.slice() : [];
  const maxSamples = Math.max(2, Math.floor(Number(opts && opts.maxSamples) || 240));
  const t = Number(sample && sample.t);
  const recordedRaw = Number(sample && sample.recorded);
  const officialRaw = sample ? sample.official : null;
  const official =
    officialRaw == null || !Number.isFinite(Number(officialRaw))
      ? null
      : Math.max(0, Math.floor(Number(officialRaw)));
  const next = {
    t: Number.isFinite(t) ? t : 0,
    recorded: Number.isFinite(recordedRaw) ? Math.max(0, Math.floor(recordedRaw)) : 0,
    official
  };
  list.push(next);
  if (list.length > maxSamples) list.splice(0, list.length - maxSamples);
  return list;
}

/** ステータス定数（呼び出し側の比較ミスを防ぐ）。 */
export const PROGRESS_STATUS = /** @type {const} */ ({
  IDLE: 'idle',
  GROWING: 'growing',
  REACHED: 'reached',
  STALLED: 'stalled'
});

/**
 * 直近サンプルから記録進捗を評価する（純関数）。
 *
 * @param {ProgressSample[]} samples
 * @param {{ targetPct?: number, stallMs?: number }} [opts]
 * @returns {{
 *   status: 'idle'|'growing'|'reached'|'stalled',
 *   recorded: number|null,
 *   official: number|null,
 *   pct: number|null,
 *   sinceGrowthMs: number|null,
 *   deltaPerMin: number|null,
 *   label: string
 * }}
 */
export function evaluateCommentProgress(samples, opts) {
  const list = Array.isArray(samples) ? samples : [];
  const targetPct = clamp01(Number(opts && opts.targetPct), 0.94);
  const stallMs = Math.max(1000, Math.floor(Number(opts && opts.stallMs) || 300_000));

  if (list.length === 0) {
    return {
      status: PROGRESS_STATUS.IDLE,
      recorded: null,
      official: null,
      pct: null,
      sinceGrowthMs: null,
      deltaPerMin: null,
      label: 'データ待ち'
    };
  }

  const latest = list[list.length - 1];
  const recorded = Number(latest.recorded) || 0;
  const official =
    latest.official == null || !Number.isFinite(Number(latest.official))
      ? null
      : Math.max(0, Math.floor(Number(latest.official)));
  const pct = official && official > 0 ? recorded / official : null;

  // recorded が「最後に変化した」時刻を求める（= 最後に成長 or リセットした時刻）。
  //   末尾から隣接サンプルを比較し、値が変わった最初の地点（末尾側から見て直近）を基準にする。
  //     - 増加: そこが最後に増えた時刻。
  //     - 減少（再読込・再注入での 0 リセットや一時的な巻き戻り等）: そこを新しい基準にし、
  //       巻き戻り直後に「長時間停滞」と誤判定しないよう猶予を与える。
  //   窓内で一度も変化していなければ窓の先頭時刻（＝ずっと横ばい＝真の停滞候補）。
  let reachedCurrentAt = list[0].t;
  for (let i = list.length - 1; i >= 1; i -= 1) {
    if ((Number(list[i].recorded) || 0) !== (Number(list[i - 1].recorded) || 0)) {
      reachedCurrentAt = list[i].t;
      break;
    }
  }
  const sinceGrowthMs = Math.max(0, Number(latest.t) - Number(reachedCurrentAt));

  // 窓全体の増加ペース（件/分）。
  const first = list[0];
  const spanMs = Math.max(0, Number(latest.t) - Number(first.t));
  const deltaPerMin =
    spanMs > 0 ? ((recorded - (Number(first.recorded) || 0)) / spanMs) * 60_000 : null;

  // 公式件数が不明なら割合判定できない（idle）。
  if (official == null || official <= 0) {
    return {
      status: PROGRESS_STATUS.IDLE,
      recorded,
      official: null,
      pct: null,
      sinceGrowthMs,
      deltaPerMin,
      label: `記録 ${recorded} 件（公式件数 不明）`
    };
  }

  const pctText = `${Math.round((pct || 0) * 1000) / 10}%`;
  const base = `記録 ${recorded}/${official}（${pctText}）`;

  if (pct != null && pct >= targetPct) {
    return {
      status: PROGRESS_STATUS.REACHED,
      recorded,
      official,
      pct,
      sinceGrowthMs,
      deltaPerMin,
      label: `${base} 追い切り完了`
    };
  }

  // ギャップが残っているのに一定時間増えていない → stalled（要確認）。
  //   サンプルが 2 件以上ないと「増えていない」を主張できない。
  if (list.length >= 2 && sinceGrowthMs >= stallMs) {
    const mins = Math.round(sinceGrowthMs / 60_000);
    return {
      status: PROGRESS_STATUS.STALLED,
      recorded,
      official,
      pct,
      sinceGrowthMs,
      deltaPerMin,
      label: `${base} 停滞（${mins}分 増加なし）`
    };
  }

  return {
    status: PROGRESS_STATUS.GROWING,
    recorded,
    official,
    pct,
    sinceGrowthMs,
    deltaPerMin,
    label: `${base} 取得中`
  };
}

/**
 * 0..1 にクランプ。NaN/範囲外は fallback。
 * @param {number} v
 * @param {number} fallback
 * @returns {number}
 */
function clamp01(v, fallback) {
  if (!Number.isFinite(v)) return fallback;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
