/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】会場のタイル数が「描画のたびにどう動いたか」を数える計器(観測のみ・何も書き換えない)
 * 【この箱に入らないもの】DOM・storage・chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】会場のタイル数の増減(特に【減った】こと)の判定と1行の文面はこのファイルのみ
 *
 * ★なぜ要るか(2026-10-13・ユーザー報告「会場が出たり消えたりする。増えるのはいいが、途中で減るのはだめ」)
 *   POP には laneTileOscillation(往復・脱落の計器)があるが、会場には人数の時系列を残す計器が無かった。
 *   ＝会場で【いつ・何人から何人に・どの鏡に替わって】減ったかを、状態速報から復元できなかった。
 *   再現環境(3配信タブ・150秒)では会場は減らず、実機の「減る」瞬間の証拠が要る。これはその計器。
 *
 * ★laneTileOscillation を使い回さない理由
 *   あちらは直近12回の paint を持つ。会場の描画は1秒に数回走るため、12回では数秒で流れて「減った」が残らない。
 *   → 会場専用に【累計】を持つ(減った回数・最大の脱落)。人数が変わったとき/供給元が替わったときだけ履歴へ積む。
 *
 * ★設計原則(ユーザー確定): 応援レーンは【増え続ける】のが正しい=減少は方向を問わず全部異常として数える。
 *   増加・据え置きは正常(入場が続いているだけ)。配信が替わったら数え直す(別配信への切替は減少ではない)。
 *   close/open では消さない(再オープン直後に前より少ない人数で描かれるのも、利用者には「減った」と見えるため)。
 *
 * @module venueTileCountCensus
 */

/** 直近の変化として持つ件数(軽さのため小さく保つ)。 */
export const VENUE_TILE_RECENT_CAP = 6;

/**
 * @returns {{
 *   liveId: string, last: number, lastOrigin: string, paints: number, changes: number,
 *   max: number, min: number, drops: number,
 *   worstDrop: number, worstFrom: number, worstTo: number, worstCause: string, worstAt: number,
 *   lastDropAt: number,
 *   recent: Array<{ at: number, tiles: number, origin: string }>
 * }}
 */
export function createVenueTileCountState() {
  return {
    liveId: '',
    last: -1,
    lastOrigin: '',
    paints: 0,
    changes: 0,
    max: 0,
    min: 0,
    drops: 0,
    worstDrop: 0,
    worstFrom: 0,
    worstTo: 0,
    worstCause: '',
    worstAt: 0,
    lastDropAt: 0,
    recent: []
  };
}

/** @param {unknown} v @returns {number} 非負整数(不正なら0) */
function n0(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * 描画のたびに1回呼ぶ。人数と供給元が前回と同じなら何も積まない(毎描画の呼び出しでも軽い・履歴が流れない)。
 *
 * @param {ReturnType<typeof createVenueTileCountState>} state in-place で更新する
 * @param {{ liveId?: unknown, tiles?: unknown, origin?: unknown, nowMs?: unknown }|null|undefined} sample
 *   origin: 供給元ラベル(例: 'mirror' / 'mirror-stale' / 'fallback:staleHard')
 */
export function observeVenueTileCount(state, sample) {
  const liveId = String(sample?.liveId ?? '').trim().toLowerCase();
  const tiles = n0(sample?.tiles);
  const origin = String(sample?.origin ?? '').trim() || '?';
  const nowMs = n0(sample?.nowMs);

  // 別配信への切替は「減った」ではない: 数え直す(liveId が両方とも分かっているときだけ)。
  if (liveId && state.liveId && liveId !== state.liveId) {
    Object.assign(state, createVenueTileCountState());
  }
  if (liveId) state.liveId = liveId;

  state.paints += 1;
  const prev = state.last;
  if (prev === tiles && state.lastOrigin === origin) return; // 変化なし

  state.changes += 1;
  if (prev >= 0 && tiles < prev) {
    state.drops += 1;
    state.lastDropAt = nowMs;
    const size = prev - tiles;
    if (size > state.worstDrop) {
      state.worstDrop = size;
      state.worstFrom = prev;
      state.worstTo = tiles;
      state.worstCause = state.lastOrigin === origin ? origin : `${state.lastOrigin}→${origin}`;
      state.worstAt = nowMs;
    }
  }
  state.max = Math.max(state.max, tiles);
  state.min = prev < 0 ? tiles : Math.min(state.min, tiles);
  state.last = tiles;
  state.lastOrigin = origin;
  state.recent.push({ at: nowMs, tiles, origin });
  if (state.recent.length > VENUE_TILE_RECENT_CAP) state.recent.shift();
}

/** @param {number} ms @param {number} nowMs @returns {string} 「12秒前」形式(時計に依らない=決定的) */
function ago(ms, nowMs) {
  if (!(ms > 0) || !(nowMs > 0)) return '?';
  const s = Math.max(0, Math.round((nowMs - ms) / 1000));
  return s < 120 ? `${s}秒前` : `${Math.round(s / 60)}分前`;
}

/**
 * 状態速報に出す1行と、構造化した値。
 * @param {ReturnType<typeof createVenueTileCountState>} state
 * @param {number} nowMs
 * @returns {{ line: string, verdict: 'ok'|'warn'|'idle', paints: number, changes: number, last: number, max: number,
 *   drops: number, worstDrop: number, worstFrom: number, worstTo: number, worstCause: string }}
 */
export function toVenueTileCountDiag(state, nowMs) {
  const idle = state.paints === 0 || state.last < 0;
  const bad = state.drops > 0;
  /** @type {'ok'|'warn'|'idle'} */
  const verdict = idle ? 'idle' : bad ? 'warn' : 'ok';
  const mark = idle ? '⚪' : bad ? '🔴' : '✅';
  /** @type {string[]} */
  const parts = [];
  if (idle) {
    parts.push(`会場の人数 ${mark} 未観測(会場を開いて描画されると出ます)`);
  } else if (!bad) {
    parts.push(
      `会場の人数 ${mark} 増え続けている(${state.min}→${state.max}枚・描画${state.paints}回/変化${state.changes}回・いま${state.last}枚・${state.lastOrigin})`
    );
  } else {
    parts.push(
      `会場の人数 ${mark} ★減った${state.drops}回(最大${state.worstFrom}→${state.worstTo}枚=${state.worstDrop}枚減・原因 ${state.worstCause || '?'}・${ago(state.worstAt, nowMs)})`
    );
    parts.push(`最大${state.max}枚・いま${state.last}枚(${state.lastOrigin})・描画${state.paints}回/変化${state.changes}回`);
  }
  if (!idle && state.recent.length > 1) {
    const tail = state.recent.map((r) => `${r.tiles}(${r.origin}・${ago(r.at, nowMs)})`).join(' → ');
    parts.push(`直近の変化: ${tail}`);
  }
  return {
    line: parts.join(' / '),
    verdict,
    paints: state.paints,
    changes: state.changes,
    last: Math.max(0, state.last),
    max: state.max,
    drops: state.drops,
    worstDrop: state.worstDrop,
    worstFrom: state.worstFrom,
    worstTo: state.worstTo,
    worstCause: state.worstCause
  };
}
