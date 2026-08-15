/**
 * northStarDetailCells.js — 公式値レーン(ギフト/広告/イベント)の【実績】をセルにする(純関数)。
 *
 * ★なぜ要るか(2026-08-15 会議 lead の逆算)
 *   既存の ns-* セルは各レーンの **いまの state** しか出さない。
 *   そのため「⏳取得中」のまま1時間、というのが**正常に見えてしまう**
 *   (進行中は緑でも赤でもないので、誰も異常と認識できない)。
 *
 *   さらに深刻な実例: contribResult が **約1年発火していなかった**。
 *   真因は配線漏れ＋「成功0件だとstorageに書かない」で、
 *   **一度も成功していないこと自体を誰も見ていなかった**
 *   ([[unwired-judgement-is-systemic-2026-08-12]])。
 *
 * ■ このモジュールが出すもの
 *   1. 「一度でも取れたことがあるか」(foundCountLifetime)
 *      ＝ 0 なら **その機能は最初から動いていない**。state が何であれ症状。
 *   2. 「⏳が続きすぎていないか」(配信経過時間との突き合わせ)
 *
 * ★掟2(仕様上そうなるものを異常にしない)を厳守する:
 *   - イベントに参加していない配信では、イベント系レーンが取れないのは**正常**
 *   - 広告が1件も無い配信で広告ランキングが空なのも**正常**
 *   → よって「一度も取れていない」だけでは異常にせず、
 *     **他のレーンは取れているのにこのレーンだけ0** のときに症状として出す。
 *
 * @module northStarDetailCells
 */

/** @param {unknown} v @returns {number} */
function n0(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {string} id @param {string} label
 * @param {'ok'|'warn'|'bad'|'na'} level @param {string} text
 * @returns {import('./healthCells.js').HealthCell}
 */
function cell(id, label, level, text) {
  return { id, label, kind: /** @type {'state'} */ ('state'), value: null, level, text };
}

/**
 * 「取得中」が続いてよい上限[ms]。これを超えたら詰まりとみなす。
 * ★配信開始直後は取れなくて当たり前なので、経過時間で判断する。
 */
const PENDING_LIMIT_MS = 5 * 60 * 1000;

/**
 * state が「進行中」を表すトークンか。
 * @param {unknown} state
 * @returns {boolean}
 */
function isPending(state) {
  const s = String(state || '');
  return s === 'iframe_unrendered' || s === 'loading' || s === 'pending';
}

/**
 * 公式値レーンの実績セル。
 *
 * @param {any} data buildHealthCells と同じ入力
 * @returns {Array<import('./healthCells.js').HealthCell>}
 */
export function buildNorthStarDetailCells(data) {
  /** @type {Array<import('./healthCells.js').HealthCell>} */
  const out = [];
  const ns = data?.fastDiag?.content?.giftDiagnostics?.['北極星レーン'] ?? null;
  const elapsedMs = n0(data?.liveElapsedMs);

  if (!ns || typeof ns !== 'object') {
    out.push(cell('ns-ever-got', '公式値の取得実績', 'na', '—'));
    out.push(cell('ns-pending', '取得中のまま', 'na', '—'));
    return out;
  }

  /**
   * 各レーンの「一度でも取れたか」。
   * ★lifetime カウンタの名前はレーンごとに違うので個別に読む
   *   (存在しないレーンは null=判定に混ぜない)。
   */
  const lanes = [
    { key: '1_貢献度ランキング', label: 'ギフト貢献度', ever: n0(ns['1_貢献度ランキング']?.foundCountLifetime) },
    { key: '2_ギフト履歴', label: 'ギフト履歴', ever: n0(ns['2_ギフト履歴']?.foundCountLifetime) },
    {
      key: '3_イベント累計スコア', label: 'イベントスコア',
      ever: n0(ns['3_イベント累計スコア']?.bannerFoundCountLifetime)
        + n0(ns['3_イベント累計スコア']?.balloonFoundCountLifetime)
    }
  ].filter((l) => ns[l.key]);

  /* ── 一度でも取れたことがあるか ─────────────────────────
   * ★「全部0」は配信の性質(イベント無し・ギフト無し)で説明できるので異常にしない(掟2)。
   *   **一部だけ0** のとき＝取れる環境なのにそのレーンだけ死んでいる＝症状。
   */
  if (lanes.length === 0) {
    out.push(cell('ns-ever-got', '公式値の取得実績', 'na', '—'));
  } else {
    const got = lanes.filter((l) => l.ever > 0);
    const missing = lanes.filter((l) => l.ever === 0);
    if (got.length === 0) {
      // 全部0=この配信では公式値が発生していない可能性が高い(仕様)。
      out.push(cell(
        'ns-ever-got', '公式値の取得実績', 'na',
        elapsedMs > 0 ? 'まだ取得していません(ギフト/イベントが無い配信では正常です)' : '—'
      ));
    } else if (missing.length > 0) {
      out.push(cell(
        'ns-ever-got', '公式値の取得実績', 'warn',
        `${missing.map((l) => l.label).join('・')}だけ一度も取れていません`
      ));
    } else {
      out.push(cell(
        'ns-ever-got', '公式値の取得実績', 'ok',
        `${got.length}種すべて取得実績あり`
      ));
    }
  }

  /* ── 「取得中」が続きすぎていないか ─────────────────────
   * ★進行中は緑でも赤でもないので誰も異常と認識できない。
   *   配信開始から5分を超えて⏳のままなら、それは詰まり。
   */
  const pendingLanes = Object.keys(ns)
    .filter((k) => isPending(ns[k]?.state))
    .map((k) => String(k).replace(/^[0-9+α_]+/, ''));

  if (pendingLanes.length === 0) {
    out.push(cell('ns-pending', '取得中のまま', 'ok', '取得中で止まっているものはありません'));
  } else if (elapsedMs > 0 && elapsedMs < PENDING_LIMIT_MS) {
    // 配信直後は取れなくて当たり前(掟2)。
    out.push(cell(
      'ns-pending', '取得中のまま', 'ok',
      `${pendingLanes.length}件が取得中(配信開始から間もないため正常です)`
    ));
  } else {
    out.push(cell(
      'ns-pending', '取得中のまま',
      elapsedMs >= PENDING_LIMIT_MS ? 'warn' : 'ok',
      `${pendingLanes.join('・')}が取得中のままです(${Math.round(elapsedMs / 60000)}分経過)`
    ));
  }

  return out;
}
