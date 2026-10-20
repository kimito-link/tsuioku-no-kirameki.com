/**
 * rankOrderMeter.js — 応援ランキング(上位10人)の【並びが変わった回数】を数える計器(2026-10-20)。
 *
 * 背景: ランキングが「めまぐるしく入れ替わる」と報告されたが、既存の計器(ちらつき計=A→B→A往復・phaseLog・repaintReason)では
 *   順位の入れ替わりを数えられなかった。直した版(v0.1.1702: 全件で数える+同数は前回順位を保つ)の効果を、
 *   実機の数字で前後比較するための計器。数字だけを出し、原因は断定しない(AGENTS §12.7)。
 *
 * 数え方: 描画のたびに上位10人の userKey の並びを渡す。前回と並びが違えば「変化」+1。
 *   同じ顔ぶれで位置が変わったら「順位の入れ替え」、顔ぶれが出入りしたら「顔ぶれの出入り」。
 *   moves=前回と違う位置の数の累計(動いた幅の目安)。
 * @module rankOrderMeter
 */

export const RANK_ORDER_METER_STORAGE_KEY = 'nls_rank_order_meter_sidepanel_v1';
/** 直近の変化時刻を持つ上限(メモリ・storage を抑える)。 */
const CHANGE_RING_MAX = 200;
const WINDOW_MS = 60_000;

/**
 * @param {number} [startedAt]
 */
export function createRankOrderMeter(startedAt = Date.now()) {
  let renders = 0;
  let changes = 0;
  let swaps = 0;
  let turnover = 0;
  let moves = 0;
  /** @type {number|null} */
  let lastChangeAt = null;
  /** @type {number[]} */
  let ring = [];
  /** @type {string[]|null} */
  let prev = null;
  let dirty = false;
  return {
    /**
     * @param {readonly string[]} topKeys 上位10人の userKey(並び順)
     * @param {number} nowMs
     */
    note(topKeys, nowMs) {
      if (!Array.isArray(topKeys) || topKeys.length === 0) return;
      renders += 1;
      dirty = true;
      const cur = topKeys.map(String);
      if (prev) {
        const same = prev.length === cur.length && prev.every((k, i) => k === cur[i]);
        if (!same) {
          changes += 1;
          const setPrev = new Set(prev);
          const sameMembers = prev.length === cur.length && cur.every((k) => setPrev.has(k));
          if (sameMembers) swaps += 1;
          else turnover += 1;
          const n = Math.max(prev.length, cur.length);
          for (let i = 0; i < n; i++) if (prev[i] !== cur[i]) moves += 1;
          lastChangeAt = nowMs;
          ring.push(nowMs);
          if (ring.length > CHANGE_RING_MAX) ring = ring.slice(ring.length - CHANGE_RING_MAX);
        }
      }
      prev = cur;
    },
    /** 前回の takeDirty から記録があれば true(書き込みの間引き用)。 */
    takeDirty() {
      const d = dirty;
      dirty = false;
      return d;
    },
    /** @param {number} [nowMs] */
    snapshot(nowMs = Date.now()) {
      return {
        at: nowMs,
        startedAt,
        sinceMs: Math.max(0, nowMs - startedAt),
        renders,
        changes,
        swaps,
        turnover,
        moves,
        lastChangeAt,
        recent60: ring.filter((t) => nowMs - t <= WINDOW_MS).length
      };
    }
  };
}

/**
 * 状態速報の1行。記録が無ければ ''。数字だけ。
 * @param {{ at?: number, sinceMs?: number, renders?: number, changes?: number, swaps?: number, turnover?: number, moves?: number, lastChangeAt?: number|null, recent60?: number } | null | undefined} snap
 * @param {number} nowMs
 * @returns {string}
 */
export function formatRankOrderLine(snap, nowMs) {
  if (!snap || typeof snap !== 'object' || !(Number(snap.renders) > 0)) return '';
  const sec = Math.max(0, Math.round((Number(snap.sinceMs) || 0) / 1000));
  const age = typeof snap.at === 'number' ? `${Math.max(0, Math.round((nowMs - snap.at) / 1000))}秒前の記録` : '時刻不明';
  const last =
    typeof snap.lastChangeAt === 'number' ? `最後の変化${Math.max(0, Math.round((nowMs - snap.lastChangeAt) / 1000))}秒前` : '変化なし';
  return (
    `順位計(開いて${sec}秒・${age}・描画${Number(snap.renders) || 0}回) / ` +
    `上位10の並び変化${Number(snap.changes) || 0}回(順位の入れ替え${Number(snap.swaps) || 0}・顔ぶれの出入り${Number(snap.turnover) || 0}・動いた位置の合計${Number(snap.moves) || 0}) / ` +
    `直近60秒${Number(snap.recent60) || 0}回 / ${last}`
  );
}
