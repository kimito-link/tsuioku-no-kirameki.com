/**
 * mainThreadBlockerBoot.js — メインスレッドを止めた区間を【実測】する(副作用モジュール)。
 *
 * ★なぜ要るか
 *   v0.1.1390 で mainThreadBlockerCensus.js(集計の純関数)を作ったが、
 *   **どこからも呼んでいなかった**＝計器を足しただけで永久に 0 件のままだった
 *   ([[unwired-judgement-is-systemic-2026-08-12]] / [[counting-is-not-fixing-2026-08-13]])。
 *   ここで実際の観測につなぐ。
 *
 * ■ 何で測るか: PerformanceObserver('longtask')
 *   ★自前で setTimeout の遅れを測る方式は「遅れた事実」しか分からず、
 *     **誰が止めたか**が出ない(速報が「探すこと」で終わっていた原因)。
 *   longtask エントリは `attribution` を持ち、どのフレーム/スクリプトが
 *   長時間占有したかの手がかりが付く。取れないブラウザでは黙って何もしない。
 *
 * ■ 可視復帰との相関
 *   ユーザー観測「しばらく配信を見ないとスリープ→戻ると黒→しばらくすると戻る」を
 *   検証するため、**可視復帰からの経過**を各サンプルに付ける。
 *   復帰直後に偏るなら「まとめ描き」が主因だと数字で言える。
 *
 * @module mainThreadBlockerBoot
 */
import { createBlockerCensus, noteBlocker, LONG_TASK_MS } from './mainThreadBlockerCensus.js';

/** 集計(状態速報が読む)。 */
export const mainThreadBlocker = createBlockerCensus();

/** 直近の可視復帰時刻(ms)。-1=まだ復帰していない。 */
let _lastVisibleAt = -1;

/** @returns {number} 可視復帰からの経過ms(-1=不明) */
function sinceVisible() {
  if (_lastVisibleAt < 0) return -1;
  return Math.max(0, Date.now() - _lastVisibleAt);
}

try {
  if (typeof document !== 'undefined') {
    // 起動時に見えていれば、その時点を復帰とみなす。
    if (!document.hidden) _lastVisibleAt = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) _lastVisibleAt = Date.now();
    });
  }

  if (typeof PerformanceObserver === 'function') {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const ms = Number(e.duration) || 0;
        if (ms < LONG_TASK_MS) continue;
        /*
         * ★名前は attribution から取る。取れないときは entryType で代替する。
         *   ここで「(無名)」ばかりになるなら、それ自体が
         *   「拡張の外(ページ側)が止めている」という情報になる。
         */
        let name = String(e.name || 'longtask');
        try {
          const attr = /** @type {any} */ (e).attribution;
          if (Array.isArray(attr) && attr.length > 0) {
            const a = attr[0];
            const src = String(a?.containerName || a?.containerId || a?.containerSrc || '').trim();
            if (src) name = src;
            else if (a?.name) name = String(a.name);
          }
        } catch {
          /* 名前が取れなくても計測は続ける */
        }
        noteBlocker(mainThreadBlocker, {
          name,
          ms,
          atMs: Date.now(),
          sinceVisibleMs: sinceVisible()
        });
      }
    });
    // buffered:true で、この行より前に起きた長時間タスクも拾う(起動直後の黒が本題のため)。
    obs.observe({ type: 'longtask', buffered: true });
  }
} catch {
  /* 観測できない環境では黙って何もしない(画面は止めない) */
}
