/**
 * popupErrorProbe の速報1行を作る純関数(v0.1.1377)。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★なぜ要るか — popup の例外は【どこにも残っていなかった】
 * ─────────────────────────────────────────────────────────────────────────
 *
 * popup-entry.js の error/unhandledrejection ハンドラは
 * 「Extension context invalidated」を握り潰すだけで、**他は何も記録していなかった**。
 * ＝ユーザーが一番見る画面(サイドパネルの中身)で例外が出ても、速報にも storage にも
 * 1件も残らない＝**起きたことすら分からない**。
 * content-entry.js は v0.1.201 から同じ ring buffer を持っており、popup だけが
 * 非対称に無防備だった([[shared-helper-hides-canonical-bugs-2026-08-07]] と同型)。
 *
 * ■ この行の掟(今日確定した判定基準に従う)
 *   - **0件は「異常なし」と断言しない**。「観測できている」ことが分かる形にする
 *     ([[zero-count-may-mean-unmeasured-2026-08-04]])。
 *   - **件数だけ出さない**。読んで次の一手が決まるよう、最新のメッセージを載せる
 *     ([[instrument-value-is-measured-by-fixes-2026-08-12]] / [[instrument-must-name-the-cause-2026-08-01]])。
 *   - ノイズ(ERR_BLOCKED_BY_CLIENT 等)は ignoredCount 側に分けて別掲する
 *     =「実害のあるエラーだけ」を主役にする。
 *
 * @module popupErrorLine
 */

/** 速報に載せるメッセージの最大長(長いスタックで速報を埋めない)。 */
const MAX_MESSAGE_CHARS = 160;

/**
 * ring buffer の snapshot に速報行を添えて返す(診断ペイロード用)。
 * ★popup-entry.js は max-lines 上限(22119)に張り付いているので、
 *   組み立てはこちら(lib)に置く。呼び出し側は1行で済む。
 * 失敗しても null を返すだけ=診断の生成を止めない。
 *
 * @param {{ snapshot?: () => any }|null|undefined} buffer createConsoleErrorBuffer の戻り
 * @returns {object|null}
 */
export function buildPopupErrorProbe(buffer) {
  try {
    if (!buffer || typeof buffer.snapshot !== 'function') return null;
    const snap = buffer.snapshot();
    return { ...snap, line: formatPopupErrorLine(snap) };
  } catch {
    return null;
  }
}

/**
 * @param {{ recentErrors?: Array<{ message?: string, source?: string, timestamp?: number }>,
 *   totalCount?: number, ignoredCount?: number }|null|undefined} snap
 * @param {number} [nowMs] 現在時刻(テスト可能性のため注入可能)
 * @returns {string}
 */
export function formatPopupErrorLine(snap, nowMs) {
  const s = snap && typeof snap === 'object' ? snap : null;
  if (!s) return '';
  const total = Math.max(0, Math.floor(Number(s.totalCount) || 0));
  const ignored = Math.max(0, Math.floor(Number(s.ignoredCount) || 0));
  const list = Array.isArray(s.recentErrors) ? s.recentErrors : [];

  /*
   * ★0件のとき: 「異常なし」ではなく「観測できている・0件」と言う。
   *   ノイズを弾いた件数も併記して、計器が生きていることを示す。
   */
  if (total <= 0) {
    const note = ignored > 0 ? `(無害なもの${ignored}件は除外)` : '(観測中)';
    return `popupのエラー ✅ 0件${note}`;
  }

  // 最新のものが一番役に立つ(いま起きている問題に近い)。
  const last = list.length ? list[list.length - 1] : null;
  const rawMsg = String(last?.message || '').replace(/\s+/g, ' ').trim();
  const msg =
    rawMsg.length > MAX_MESSAGE_CHARS ? `${rawMsg.slice(0, MAX_MESSAGE_CHARS)}…` : rawMsg;
  const src = last?.source === 'unhandledrejection' ? '非同期' : '同期';

  let ago = '';
  const ts = Number(last?.timestamp);
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  if (Number.isFinite(ts) && ts > 0 && now >= ts) {
    const sec = Math.round((now - ts) / 1000);
    ago = sec < 60 ? `${sec}秒前` : `${Math.round(sec / 60)}分前`;
  }

  const ignoredNote = ignored > 0 ? ` / 無害なもの${ignored}件は除外` : '';
  const agoNote = ago ? `・${ago}` : '';
  return (
    `popupのエラー 🔴 ${total}件${ignoredNote}\n` +
    `  → 直近(${src}${agoNote}): ${msg || '(メッセージなし)'}`
  );
}
