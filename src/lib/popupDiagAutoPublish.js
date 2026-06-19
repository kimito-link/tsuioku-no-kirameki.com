// popupDiagAutoPublish.js — popup を開いたとき popup 固有診断を status へ自動集約するスケジューラ(純ロジック)。
//   設計根拠 council/popup-less-diag-SYNTHESIS.md: popup 描画値(avatarLoadDiag/northStarRenderProbe)は
//   popup が実際に描画して初めて生成される=offscreen/裏自動は誤診=不採用。「popup を開く」操作だけは
//   物理的に必要だが、その後の『AI診断コピーを押す』手間は消せる。ここは DOM/Chrome を持たない純関数に
//   切り出し(popup-entry の行数を増やさない=ラチェット維持)、副作用(診断収集)は呼び出し側が注入する。

/**
 * 「1回だけ・初期描画を妨げないアイドル遅延で」診断収集を走らせるスケジューラを作る。
 * 同じインスタンスで複数回呼ばれても collect は1回しか走らない(開くたびの多重実行防止)。
 *
 * @param {() => (void | Promise<void>)} collect 診断を収集して status キーへ書く副作用(呼び出し側が注入)。
 * @param {{
 *   requestIdle?: ((cb: () => void, opts?: { timeout?: number }) => unknown) | null,
 *   setTimeoutFn?: (cb: () => void, ms: number) => unknown,
 *   idleTimeoutMs?: number,
 *   fallbackDelayMs?: number,
 * }} [deps] テスト容易化のための依存注入(既定はブラウザの requestIdleCallback / setTimeout)。
 * @returns {() => void} schedule 関数(初回だけ collect をアイドルで予約する)。
 */
export function createPopupDiagAutoPublisher(collect, deps = {}) {
  const requestIdle = deps.requestIdle !== undefined
    ? deps.requestIdle
    : (typeof requestIdleCallback === 'function' ? requestIdleCallback : null);
  const setTimeoutFn = deps.setTimeoutFn || ((cb, ms) => setTimeout(cb, ms));
  const idleTimeoutMs = deps.idleTimeoutMs ?? 4000;
  const fallbackDelayMs = deps.fallbackDelayMs ?? 1500;
  let published = false;
  const run = () => { void Promise.resolve().then(collect).catch(() => { /* 自動集約失敗は無視 */ }); };
  return function schedule() {
    if (published) return;
    published = true;
    try {
      if (typeof requestIdle === 'function') requestIdle(run, { timeout: idleTimeoutMs });
      else setTimeoutFn(run, fallbackDelayMs);
    } catch { setTimeoutFn(run, fallbackDelayMs); }
  };
}

/**
 * popup の watchUrl を解決する(AI診断コピーと同じ順: exportJson の dataset → KEY_LAST_WATCH_URL)。
 * DOM/Chrome を直接持たず呼び出し側から注入して popup-entry の行数を増やさない。
 * @param {{
 *   datasetWatchUrl?: string | null,
 *   readLastWatchUrl?: () => Promise<string>,
 * }} deps
 * @returns {Promise<string>}
 */
export async function resolvePopupWatchUrl(deps = {}) {
  const fromDataset = String(deps.datasetWatchUrl || '').trim();
  if (fromDataset) return fromDataset;
  if (typeof deps.readLastWatchUrl === 'function') {
    try { return String((await deps.readLastWatchUrl()) || '').trim(); } catch { return ''; }
  }
  return '';
}
