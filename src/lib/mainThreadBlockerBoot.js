/**
 * mainThreadBlockerBoot.js — メインスレッドを止めた区間を【実測】する(副作用モジュール)。
 *
 * ★v0.1.1398: 観測方法を longtask から【自前のハートビート】へ差し替えた。
 *
 * ■ 何が起きていたか(2026-08-14 実機・ユーザー「計器いれたの？」)
 *   同じ速報にこの2つが並んでいた:
 *       最大タイマー遅延=1354ms 🔴イベントループ停止
 *       mainThreadBlocker: count 0        ← 私の計器
 *   ＝**1.35秒止まったのに、私の計器はゼロ**。計器が測れていなかった。
 *
 * ■ 理由: `longtask` は【トップレベル文書にしか配送されない】。
 *   ①POPは sidepanel.html の中の **iframe** で動くので、
 *   PerformanceObserver('longtask') は原理的に何も受け取れない。
 *   ★「observe を書いた」=「測れている」ではない。出荷後に数字が0のままなら疑う
 *     ([[zero-count-may-mean-unmeasured-2026-08-04]] を自分で踏んだ)。
 *
 * ■ 直し方: **同じフレームの中で**測る。
 *   一定間隔でタイマーを鳴らし、予定時刻からの遅れを見る。遅れ=その間
 *   メインスレッドが他の何かに占有されていた、ということ。
 *   ★これは sidepanel-entry.js の「最大タイマー遅延」と同じ原理で、
 *     そちらは実際に 1354ms を検出できている=iframe 内でも有効だと実証済み。
 *
 * ■ 誰が止めたかをどう出すか
 *   タイマーの遅れだけでは「誰が」が出ない(それが従来の速報の限界だった)。
 *   → 拡張の重い処理を `markBlockerSection()` で囲み、**遅延が観測された瞬間に
 *     実行中だった区間名**を犯人として記録する。囲っていない区間で遅れたら
 *     `(拡張の外)` と出る=それ自体が「ページ側が犯人」という情報になる。
 *
 * @module mainThreadBlockerBoot
 */
import { createBlockerCensus, noteBlocker, LONG_TASK_MS } from './mainThreadBlockerCensus.js';

/** 集計(状態速報が読む)。 */
export const mainThreadBlocker = createBlockerCensus();

/** ハートビートの間隔[ms]。短すぎると自分が負荷になるので 250ms。 */
const HEARTBEAT_MS = 250;

/** 直近の可視復帰時刻(ms)。-1=まだ復帰していない。 */
let _lastVisibleAt = -1;

/** いま実行中の区間名(入れ子は最後に入ったものが勝つ)。 */
let _currentSection = '';

/**
 * 重い処理を区間名で囲む。遅延が出たときの【犯人】になる。
 *
 * @template T
 * @param {string} name
 * @param {() => T} fn
 * @returns {T}
 */
export function markBlockerSection(name, fn) {
  const prev = _currentSection;
  _currentSection = String(name || '') || prev;
  try {
    return fn();
  } finally {
    _currentSection = prev;
  }
}

/** @returns {number} 可視復帰からの経過ms(-1=不明) */
function sinceVisible() {
  if (_lastVisibleAt < 0) return -1;
  return Math.max(0, Date.now() - _lastVisibleAt);
}

try {
  if (typeof document !== 'undefined') {
    if (!document.hidden) _lastVisibleAt = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) _lastVisibleAt = Date.now();
    });
  }

  if (typeof setTimeout === 'function') {
    let expected = Date.now() + HEARTBEAT_MS;
    const tick = () => {
      const now = Date.now();
      const delay = now - expected;
      /*
       * ★遅れ = その間スレッドが空かなかった時間。
       *   タブが hidden だと Chrome がタイマーを間引くので、その分は数えない
       *   (間引きは正常動作であって「止まった」ではない)。
       */
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (!hidden && delay >= LONG_TASK_MS) {
        noteBlocker(mainThreadBlocker, {
          name: _currentSection || '(拡張の外)',
          ms: delay,
          atMs: now,
          sinceVisibleMs: sinceVisible()
        });
      }
      expected = Date.now() + HEARTBEAT_MS;
      setTimeout(tick, HEARTBEAT_MS);
    };
    setTimeout(tick, HEARTBEAT_MS);
  }
} catch {
  /* 観測できない環境では黙って何もしない(画面は止めない) */
}
