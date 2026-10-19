/**
 * 【層】L0 判定層(純粋関数・DOM/chrome.* には触れない。時刻・記録は呼び出し側が渡す)
 * 【この箱に入るもの】サイドパネルの「親(sidepanel.html)」と「子(popup.html の iframe)」の起動を、同じ時間軸に並べる年表の台帳と、状態速報の1行
 * 【この箱に入らないもの】PerformanceObserver・storage への書き込み(bootTimelineBoot.js)・描画
 * 【書けるstorageキー】なし
 * 【正本宣言】親子の起動の年表の組み立てと文言はこのファイルのみ
 *
 * bootTimeline.js — v0.1.1687「黒い幕の年表」
 *
 * ■ なぜ要るか(2026-10-19 ユーザー「黒い幕も計器を入れれば原因が特定できそう」)
 *   縞が見えている間=親の最初の描画までに、拡張プロセスの主スレッドで何が走っているかを、実機で並べて見られるようにする。
 *   Long Animation Frames は子 iframe のスクリプトを親へ教えない(実測: 親から見ると scripts が空)ため、関数名は出せない。
 *   代わりに、子(popup)が自分の
 *     ・文書の節目(応答の終わり・DOM 構築・load・最初の描画)
 *     ・長い処理(longtask・50ms 超)の開始と長さ
 *     ・popup の段階(count_card など・既存の markWatchPopupLoadPhase)
 *   を自分の時計で控え、親が自分の起点に直して【親の最初の描画】と同じ線上に並べる。
 *   「子の長い処理が親の最初の描画より前に走っているか」「どの段階と重なるか」が1行で読める。
 *
 * ■ 守ること
 *   - 事実の時刻だけを出す(原因は断定しない)。親子の起点の差は performance.timeOrigin(実時刻)で直す。
 * @module bootTimeline
 */

export const BOOT_TIMELINE_STORAGE_KEY = 'nls_boot_timeline_sidepanel_v1';
/** 長い処理・段階を数える窓(子の起点から)[ms]。 */
export const BOOT_TIMELINE_WINDOW_MS = 8000;
export const BOOT_TIMELINE_MAX_LONG = 10;
export const BOOT_TIMELINE_MAX_PHASES = 12;

/** @param {unknown} v */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * 子の長い処理の台帳(longtask)。窓の外・短いものは入れない。長い順ではなく【時刻順】に残す(年表なので)。
 * @returns {{ add: (startTime: number, duration: number) => void, snapshot: () => Array<[number, number]> }}
 */
export function createLongTaskLog() {
  /** @type {Array<[number, number]>} */
  const list = [];
  return {
    add(startTime, duration) {
      const s = num(startTime);
      const d = num(duration);
      if (s == null || d == null || s > BOOT_TIMELINE_WINDOW_MS || d < 50) return;
      if (list.length >= BOOT_TIMELINE_MAX_LONG) return;
      list.push([Math.round(s), Math.round(d)]);
    },
    snapshot: () => list.map((x) => /** @type {[number, number]} */ ([...x]))
  };
}

/**
 * 子が session へ書く記録を作る。
 * @param {{
 *   timeOrigin: number,
 *   nav?: { responseEnd?: number, domInteractive?: number, domContentLoaded?: number, load?: number, firstPaint?: number|null },
 *   longTasks?: Array<[number, number]>,
 *   phases?: Array<[string, number]>,
 *   at: number
 * }} i
 */
export function buildBootTimelineRecord(i) {
  const nav = i.nav || {};
  /** @param {unknown} v */
  const r = (v) => (num(v) == null ? null : Math.round(/** @type {number} */ (num(v))));
  return {
    at: i.at,
    timeOrigin: num(i.timeOrigin) ?? 0,
    nav: {
      responseEnd: r(nav.responseEnd),
      domInteractive: r(nav.domInteractive),
      domContentLoaded: r(nav.domContentLoaded),
      load: r(nav.load),
      firstPaint: r(nav.firstPaint)
    },
    longTasks: (Array.isArray(i.longTasks) ? i.longTasks : []).slice(0, BOOT_TIMELINE_MAX_LONG),
    phases: (Array.isArray(i.phases) ? i.phases : [])
      .filter((p) => Array.isArray(p) && typeof p[0] === 'string' && num(p[1]) != null && p[1] <= BOOT_TIMELINE_WINDOW_MS)
      .slice(0, BOOT_TIMELINE_MAX_PHASES)
  };
}

/**
 * 状態速報の1行。親の起点に直した時刻で、親の最初の描画と同じ線上に並べる。記録が無ければ ''。
 * @param {{ at?: number, timeOrigin?: number, nav?: any, longTasks?: Array<[number, number]>, phases?: Array<[string, number]> } | null | undefined} rec
 * @param {{ timeOrigin: number, firstPaintMs: number|null }} parent 親(sidepanel)の起点(epoch ms)と親の最初の描画(親の起点から)
 * @param {number} nowMs
 * @returns {string}
 */
export function formatBootTimelineLine(rec, parent, nowMs) {
  if (!rec || typeof rec !== 'object' || num(rec.timeOrigin) == null || !rec.timeOrigin) return '';
  const shift = /** @type {number} */ (num(rec.timeOrigin)) - (num(parent && parent.timeOrigin) ?? 0); // 子の時刻 → 親の時刻
  /** @param {unknown} t */
  const rel = (t) => (num(t) == null ? null : Math.round(/** @type {number} */ (num(t)) + shift));
  const fp = num(parent && parent.firstPaintMs);
  const age = typeof rec.at === 'number' ? `${Math.max(0, Math.round((nowMs - rec.at) / 1000))}秒前の記録` : '時刻不明';
  /** @param {string} label @param {unknown} t */
  const mark = (label, t) => (rel(t) == null ? '' : `${label}+${rel(t)}ms`);
  const nav = rec.nav || {};
  const navTxt = [mark('子の応答終わり', nav.responseEnd), mark('子のDOM構築', nav.domInteractive), mark('子のload', nav.load), mark('子の最初の描画', nav.firstPaint)]
    .filter(Boolean)
    .join('・');
  const longTxt = (rec.longTasks || [])
    .map((x) => {
      const start = rel(x[0]);
      const end = start == null ? null : start + x[1];
      // 親の最初の描画より前に走って、その前に終わった/またいだ=縞の間を占有していた処理に ★ を付ける
      const before = fp != null && start != null && start < fp ? '★' : '';
      return `${before}+${start}〜${end}ms(${x[1]}ms)`;
    })
    .join('・');
  const phaseTxt = (rec.phases || []).map((p) => `${p[0]}+${rel(p[1])}ms`).join('・');
  const parts = [`起動の年表(親の起点から・${age})`];
  parts.push(fp != null ? `親の最初の描画+${fp}ms` : '親の最初の描画 未取得');
  if (navTxt) parts.push(navTxt);
  parts.push(`子の長い処理(50ms超・★=親の最初の描画より前に始まった): ${longTxt || 'なし'}`);
  if (phaseTxt) parts.push(`子の段階: ${phaseTxt}`);
  return parts.join(' / ');
}
