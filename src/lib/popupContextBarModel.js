/**
 * popup 上部の接続コンテキスト表示・復旧バー表示・stat 表面状態の純粋ロジック。
 */

import { resolveWatchMetaCardState } from './watchMetaCardStateGate.js';

/**
 * @param {string} source
 * @returns {string}
 */
export function labelWatchUrlSource(source) {
  const s = String(source || '').trim();
  if (s === 'activeTab') return '前面タブ';
  if (s === 'dataBacked') return '記録のある配信タブ';
  if (s === 'lastFocusedNormal') return '直前のブラウザタブ';
  if (s === 'storage') return '直近の視聴URL（保存）';
  if (s === 'none') return '—';
  return s;
}

/**
 * @param {{
 *   watchUrlSource: string,
 *   treatAsNoActiveWatch: boolean
 * }} input
 * @returns {string}
 */
export function buildContextSourceLine(input) {
  const src = labelWatchUrlSource(input.watchUrlSource);
  if (input.treatAsNoActiveWatch) {
    return `接続: なし（${src}）`;
  }
  if (input.watchUrlSource === 'storage') {
    return `接続元: ${src}（別ページを前面にしているときは直近の視聴データを表示）`;
  }
  return `接続元: ${src}`;
}

/**
 * @param {{
 *   hasLiveContext: boolean,
 *   fetchInflight: boolean,
 *   fetchError: string,
 *   snapshot: object | null
 * }} input
 * @returns {boolean}
 */
export function shouldShowPopupRecoveryBar(input) {
  if (!input.hasLiveContext) return false;
  if (input.fetchInflight) return false;
  const fe = String(input.fetchError || '').trim();
  if (fe) return true;
  const gate = resolveWatchMetaCardState({
    snapshot: input.snapshot,
    snapshotFetchInflight: Boolean(input.fetchInflight),
    snapshotFetchError: fe
  });
  return gate.state === 'fetch_failed';
}

/**
 * @param {{
 *   hasLiveContext: boolean,
 *   fetchError: string,
 *   fetchInflight: boolean,
 *   snapshot: object | null
 * }} input
 * @returns {string}
 */
export function buildRecoveryBarReason(input) {
  if (!input.hasLiveContext) return '';
  const fe = String(input.fetchError || '').trim();
  if (fe) {
    if (/Receiving end does not exist|message port closed/i.test(fe)) {
      return '配信ページと接続できていません。配信タブを再読み込みするか、POPを更新してください。';
    }
    if (/watch.*見つか|not found|no.*tab|Could not establish connection/i.test(fe)) {
      return '配信タブが見つかりません。配信を開いたタブを前面にしてから更新してください。';
    }
    return '通信に失敗しました。下のボタンで復旧を試せます。';
  }
  const gate = resolveWatchMetaCardState({
    snapshot: input.snapshot,
    snapshotFetchInflight: Boolean(input.fetchInflight),
    snapshotFetchError: fe
  });
  if (gate.state === 'fetch_failed') {
    return '番組ヘッダー情報を再取得できませんでした。配信タブの再読み込みや POP の更新を試してください。';
  }
  return '';
}

/**
 * @typedef {'empty' | 'loading' | 'stale' | 'ok'} PopupStatSurfaceMode
 */

/**
 * @param {{
 *   treatAsNoActiveWatch: boolean,
 *   fetchInflight: boolean,
 *   hasSnapshot: boolean
 * }} input
 * @returns {PopupStatSurfaceMode}
 */
export function resolvePopupStatSurfaceMode(input) {
  if (input.treatAsNoActiveWatch) return 'empty';
  if (input.fetchInflight && !input.hasSnapshot) return 'loading';
  if (input.fetchInflight && input.hasSnapshot) return 'stale';
  return 'ok';
}

/**
 * @param {PopupStatSurfaceMode} mode
 * @returns {string}
 */
export function labelStatSurfaceMode(mode) {
  if (mode === 'empty') return '未接続';
  if (mode === 'loading') return '更新中';
  if (mode === 'stale') return '直近値';
  return '反映済';
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function formatPopupRefreshClock(ms) {
  if (!ms || !Number.isFinite(ms)) return 'POP更新: —';
  const d = new Date(ms);
  const t = d.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  return `POP更新: ${t}`;
}

/**
 * @param {number} count
 * @returns {string}
 */
export function buildMultiTabHint(count) {
  const n = typeof count === 'number' && Number.isFinite(count) ? Math.floor(count) : 0;
  if (n <= 1) return '';
  return `同一放送に該当する視聴タブが ${n} 件あります（この URL を基準に表示しています）。`;
}

/**
 * v0.1.414: standalone popup の multitab「中身が空」救済ウォッチドッグの判定。
 *
 * 別ウィンドウ POP は自タブを持たず getLastFocused の前面タブから lv を推測するため、
 * 複数タブ時に「未 populate の別タブ lv」を拾い、lv は取れる（source≠storage/none）ので
 * 「前回の配信」フォールバックが走らず全カード/全チップ「—」固定になる残穴があった。
 *
 * この関数は「いま解決した lv に実データが全く無く、かつ解決ソースが "推測"
 * （dataBacked / lastFocusedNormal / storage）」のとき true を返す。呼び出し側は
 * true のとき空状態と同じ「前回の配信」復元に倒し、「—」のまま居座らせない。
 *
 * 前面 activeTab / inlineParam（self-tab の真実）では救済しない＝ユーザーが今まさに
 * 見ている配信が始まったばかりで空なだけかもしれず、別配信を出すのは誤りなので false。
 *
 * @param {{
 *   watchUrlSource: string,
 *   hasSnapshotForLv: boolean,
 *   storedCommentCount: number,
 *   onNicoUserProfilePage?: boolean,
 *   inlineMode?: boolean
 * }} input
 * @returns {boolean} true = 「前回の配信」復元に倒すべき
 */
export function shouldRescueEmptyResolvedWatch(input) {
  if (!input || typeof input !== 'object') return false;
  if (input.inlineMode === true) return false;
  if (input.onNicoUserProfilePage === true) return false;
  const src = String(input.watchUrlSource || '').trim();
  const resolvedFromGuess =
    src === 'dataBacked' || src === 'lastFocusedNormal' || src === 'storage';
  if (!resolvedFromGuess) return false;
  const count =
    typeof input.storedCommentCount === 'number' &&
    Number.isFinite(input.storedCommentCount)
      ? input.storedCommentCount
      : 0;
  const hasAnyUsableData = input.hasSnapshotForLv === true || count > 0;
  return !hasAnyUsableData;
}

/**
 * @param {string} title
 * @param {number} max
 * @returns {string}
 */
export function truncateUiTitle(title, max = 42) {
  const s = String(title || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}
