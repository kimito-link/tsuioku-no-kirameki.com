/**
 * 【層】L0 判定層(純粋関数・DOM/chrome.* には触れない)
 * 【この箱に入るもの】応援マス(#sceneStoryGrowth)を「なぜ」全部作り直したかの台帳と、状態速報の1行
 * 【この箱に入らないもの】描画・storage への書き込み(載せるのは flickerMeter の補足欄)
 * 【書けるstorageキー】なし
 *
 * storyGrowthRebuildReasons.js — v0.1.1875
 *
 * ■ なぜ要るか(2026-11-05 りんく「ニコニコはまたチカチカしています」)
 *   ちらつき計(v0.1.1686)の実測: サイドパネルを開いて271秒で #sceneStoryGrowth の作り直し 10,076+9,978、
 *   .nl-story-growth-icon の src 変更 7,832・往復293。約98マスのグリッドが数秒ごとに丸ごと作り直されている。
 *   しかし作り直しには入口が5つあり(配信の切替/根の差し替え/件数の縮小/足せない増加/マス数のずれ)、
 *   既存の作り直し計(storyGrowthChurn)は popup 診断(開いた直後に1回だけ集約)にしか出ないため実機で読めなかった。
 *   → 入口ごとの回数と、直近の「何件→何件」を数え、4秒ごとに書かれるちらつき計の補足欄へ載せる。
 *
 * ■ 守ること
 *   - 数えるだけ。描画にもタイミングにも干渉しない。配列を舐めない(呼び手が持っている数だけ受け取る)。
 *   - 事実の数字だけ出す。「これが原因」とは断定しない。
 * @module storyGrowthRebuildReasons
 */

/** 作り直しの入口(syncStoryGrowth / patchStoryGrowthIconsFromSource の分岐と1対1)。 */
export const STORY_GROWTH_REBUILD_REASON = Object.freeze({
  /** 配信 id が変わった(空 '' との行き来を含む)。根を空にしてから描き直す。 */
  LIVE: 'live',
  /** 根の要素が差し替わった。 */
  ROOT: 'root',
  /** 目標の件数が描いた数より減った。 */
  SHRINK: 'shrink',
  /** 増えたが「足すだけ」の条件を満たさなかった。 */
  GROW_FULL: 'grow',
  /** 中身の更新時に、画面の枚数が描いた数と合わなかった。 */
  DOM_MISMATCH: 'dom',
  /** 目標0件で根を空にした。 */
  EMPTY: 'empty'
});

/** @type {Readonly<Record<string, string>>} */
const LABELS = Object.freeze({
  live: '配信切替',
  root: '根の差替',
  shrink: '件数の縮小',
  grow: '足せない増加',
  dom: '枚数のずれ',
  empty: '空に'
});

/** 直近の記録を何件持つか。 */
export const STORY_GROWTH_REBUILD_RECENT_MAX = 8;

/**
 * @typedef {{ reason: string, from: number, to: number, dom: number, liveSame: boolean, atMs: number }} RebuildEvent
 * @typedef {{ counts: Record<string, number>, recent: RebuildEvent[], targets: number[], liveFlips: number, lastLiveKey: string }} RebuildReasonState
 */

/** @returns {RebuildReasonState} */
export function createStoryGrowthRebuildReasonState() {
  return { counts: {}, recent: [], targets: [], liveFlips: 0, lastLiveKey: '' };
}

/** @param {unknown} v */
const int = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * 作り直しを1回記録する。
 * @param {RebuildReasonState} state
 * @param {{ reason: string, from?: number, to?: number, dom?: number, liveSame?: boolean, atMs?: number }} ev
 */
export function noteStoryGrowthRebuildReason(state, ev) {
  if (!state || !ev) return;
  const reason = String(ev.reason || '?');
  state.counts[reason] = (state.counts[reason] || 0) + 1;
  state.recent.push({
    reason,
    from: int(ev.from),
    to: int(ev.to),
    dom: int(ev.dom),
    liveSame: ev.liveSame !== false,
    atMs: Number(ev.atMs) || 0
  });
  if (state.recent.length > STORY_GROWTH_REBUILD_RECENT_MAX) state.recent.shift();
}

/**
 * syncStoryGrowth に来た目標件数と配信を1回記録する(件数の揺れ・配信の行き来を見る)。
 * 配信 id そのものは残さず、「前回と同じか」だけを数える。
 * @param {RebuildReasonState} state
 * @param {{ liveKey: string, target: number }} ev
 */
export function noteStoryGrowthTarget(state, ev) {
  if (!state || !ev) return;
  const key = String(ev.liveKey || '');
  if (key !== state.lastLiveKey) {
    if (state.targets.length) state.liveFlips += 1;
    state.lastLiveKey = key;
  }
  const t = int(ev.target);
  const last = state.targets[state.targets.length - 1];
  // 同じ値の連続は1つにまとめる(揺れの形だけ見たい)
  if (last !== t) {
    state.targets.push(t);
    if (state.targets.length > 12) state.targets.shift();
  }
}

/**
 * 状態速報の1行。記録が無ければ ''。
 * @param {RebuildReasonState | null | undefined} state
 * @param {number} nowMs
 * @returns {string}
 */
export function formatStoryGrowthRebuildReasons(state, nowMs) {
  if (!state || typeof state !== 'object') return '';
  const entries = Object.entries(state.counts || {}).filter(([, n]) => n > 0);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const tgt = Array.isArray(state.targets) ? state.targets : [];
  if (!total && tgt.length <= 1 && !state.liveFlips) return '';
  const byReason = entries.length
    ? entries.sort((a, b) => b[1] - a[1]).map(([k, n]) => `${LABELS[k] || k}${n}`).join('・')
    : 'なし';
  const recent = (state.recent || [])
    .slice(-4)
    .map((e) => {
      const ago = nowMs && e.atMs ? `${Math.max(0, Math.round((nowMs - e.atMs) / 100) / 10)}秒前` : '';
      return `${LABELS[e.reason] || e.reason} ${e.from}→${e.to}(画面${e.dom}${e.liveSame ? '' : '・配信が変化'})${ago ? ` ${ago}` : ''}`;
    })
    .join('、');
  return `応援マスの作り直し${total}回(${byReason})` +
    ` / 目標件数の推移 ${tgt.join('→') || '—'}` +
    ` / 配信の行き来${int(state.liveFlips)}回` +
    (recent ? ` / 直近: ${recent}` : '');
}

/**
 * ちらつき計(globalThis.__nlsFlickerMeter.meter)の補足欄へ今の1行を書く。meter が無ければ何もしない。
 * @param {RebuildReasonState} state
 * @param {{ setNote?: (name: string, text: string) => void } | null | undefined} meter
 * @param {number} nowMs
 */
export function publishStoryGrowthRebuildNote(state, meter, nowMs) {
  if (!meter || typeof meter.setNote !== 'function') return;
  meter.setNote('storyGrowthRebuild', formatStoryGrowthRebuildReasons(state, nowMs));
}
