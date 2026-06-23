/**
 * コメント送信経路の手元プロファイル（本番常時 ON にしない）。
 *
 * DevTools コンソールで `globalThis.__nlsCommentSubmitProfile = true` のあと送信すると、
 * 区間名と経過 ms のペアが `globalThis.__nlsCommentSubmitLastTimings` に入り、
 * `console.info` が1回出る（popup / content それぞれの global）。
 *
 * 計画メモの区間対応（概略）:
 * - **T1**: popup の `tabsSendMessageWithRetry` 前後（frame ごとに `T1-f{id}-send` / `T1-f{id}-res`）
 * - **T2**: content の editor `pollUntil` 前後
 * - **T3**: ダブル rAF + `reactSettleMs` まで
 * - **T4**: 送信ボタン探索〜 click まで
 * - **T5**: `confirmSubmittedCommentAsync`（1回目・必要なら2回目）
 *
 * 実装方針（計測後の最小チューニング）: `reactSettleMs` / popup リトライ間隔は据え置き。
 * 体感改善は `waitUntilEditorReflectsSubmit` の **送信直後（待ち前）プローブ**で速い成功経路を取る。
 * 数値の根拠が取れたら `COMMENT_SUBMIT_CONFIRM_PROBE_MS` や frame 優先は別コミットで検討。
 */

export const NLS_COMMENT_SUBMIT_PROFILE_FLAG = '__nlsCommentSubmitProfile';
export const NLS_COMMENT_SUBMIT_LAST_TIMINGS = '__nlsCommentSubmitLastTimings';

/** v0.1.604: 常駐観測の閾値。総所要がこれを超えたら console.warn を出して可視化。 */
export const NLS_COMMENT_SUBMIT_SLOW_WARN_MS = 800;
/** 直近 N 件の総所要を保持する rolling buffer 上限。 */
export const NLS_COMMENT_SUBMIT_HISTORY_MAX = 20;
/** rolling buffer の globalThis キー。DevTools から読める。 */
export const NLS_COMMENT_SUBMIT_HISTORY_KEY = '__nlsCommentSubmitTotals';

/**
 * v0.1.604: 軽量・常駐観測。フラグなしでも総所要 ms を 1 つだけ記録する。
 * 直近 20 件は globalThis.__nlsCommentSubmitTotals に rolling 保持され、
 * 平均/最大が即取れる。閾値超は console.warn で目立たせる（ユーザーが
 * F12 開いたとき「遅さ」が見える化される）。
 *
 * 副作用は console と globalThis 1 プロパティのみ。負荷 negligible。
 *
 * @param {string} label 例: 'nls-cmt-popup' / 'nls-cmt-content'
 * @param {number} elapsedMs Math.round 済み総所要
 */
export function recordCommentSubmitTotal(label, elapsedMs) {
  try {
    const ms = Number(elapsedMs);
    if (!Number.isFinite(ms) || ms < 0) return;
    const g = /** @type {Record<string, unknown>} */ (globalThis);
    /** @type {Array<{label:string,ms:number,at:number}>} */
    const buf =
      Array.isArray(g[NLS_COMMENT_SUBMIT_HISTORY_KEY]) &&
      g[NLS_COMMENT_SUBMIT_HISTORY_KEY].every(
        (r) => r && typeof r === 'object'
      )
        ? /** @type {any} */ (g[NLS_COMMENT_SUBMIT_HISTORY_KEY])
        : [];
    buf.push({ label: String(label || ''), ms, at: Date.now() });
    while (buf.length > NLS_COMMENT_SUBMIT_HISTORY_MAX) buf.shift();
    g[NLS_COMMENT_SUBMIT_HISTORY_KEY] = buf;
    if (ms >= NLS_COMMENT_SUBMIT_SLOW_WARN_MS) {
      try {
        // v0.1.776: console.warn は chrome://extensions のエラー欄に出てユーザーを不安にさせ、かつ
        //   行動につながらない(「見てどうすればいい?」)。console.debug に下げて拡張エラー欄へは出さず、
        //   必要時だけ DevTools の verbose で確認できるようにする。履歴は globalThis に従来どおり残す。
        const recent = buf.slice(-5).map((r) => r.ms);
        console.debug(
          `[${label}] slow=${ms}ms (recent5=[${recent.join(',')}]). ` +
            `DevTools で globalThis.__nlsCommentSubmitProfile=true にして再送信すると区間別の詳細が出ます。`
        );
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore: 観測の失敗は無視 */
  }
}

/** 成功/失敗の集計を保持する globalThis キー。DevTools / fastDiag から読める。 */
export const NLS_COMMENT_SUBMIT_OUTCOME_KEY = '__nlsCommentSubmitOutcome';
/** 直近の失敗理由（errorCode）を保持する件数上限。 */
export const NLS_COMMENT_SUBMIT_FAIL_REASONS_MAX = 5;

/**
 * v0.1.925: コメント送信の {ok, error} 文言を、安定した短い errorCode に分類する純関数。
 * 文言は postCommentFromContentAsync の各 return に対応する。文言が変わっても
 * 部分一致で拾えるよう特徴語で判定する（完全一致依存にしない）。
 *
 * @param {boolean} ok
 * @param {string|null|undefined} error
 * @returns {string} 'ok' | 'empty' | 'no_frame' | 'no_editor' | 'no_button' | 'unconfirmed' | 'exception' | 'unknown'
 */
export function classifyCommentSubmitError(ok, error) {
  if (ok) return 'ok';
  const msg = String(error || '');
  if (!msg) return 'unknown';
  if (msg.includes('コメントが空')) return 'empty';
  if (msg.includes('watchフレーム')) return 'no_frame';
  if (msg.includes('コメント入力欄')) return 'no_editor';
  if (msg.includes('送信ボタン')) return 'no_button';
  if (msg.includes('確認できませんでした')) return 'unconfirmed';
  // 上記に当てはまらない短い英語コード（'post_failed' 等）は例外経路由来。
  if (/^[a-z_]+$/.test(msg)) return 'exception';
  return 'unknown';
}

/**
 * v0.1.925: コメント送信の成否を軽量・常駐で集計する（storage は使わない＝軽さ維持）。
 * globalThis に試行数/成功数/失敗数と直近の失敗理由（errorCode）を rolling 保持する。
 * recordCommentSubmitTotal（所要 ms）と対になり、fastDiag が両方を読んで要約する。
 *
 * 副作用は globalThis 1 プロパティのみ。負荷 negligible。
 *
 * @param {boolean} ok
 * @param {string|null|undefined} [error] 失敗時の文言（errorCode 分類に使う）
 */
export function recordCommentSubmitOutcome(ok, error) {
  try {
    const g = /** @type {Record<string, unknown>} */ (globalThis);
    const prev = g[NLS_COMMENT_SUBMIT_OUTCOME_KEY];
    /** @type {{total:number, ok:number, fail:number, recentFails:string[]}} */
    const acc =
      prev && typeof prev === 'object'
        ? {
            total: Number(/** @type {any} */ (prev).total) || 0,
            ok: Number(/** @type {any} */ (prev).ok) || 0,
            fail: Number(/** @type {any} */ (prev).fail) || 0,
            recentFails: Array.isArray(/** @type {any} */ (prev).recentFails)
              ? /** @type {any} */ (prev).recentFails.slice()
              : []
          }
        : { total: 0, ok: 0, fail: 0, recentFails: [] };
    acc.total += 1;
    if (ok) {
      acc.ok += 1;
    } else {
      acc.fail += 1;
      const code = classifyCommentSubmitError(false, error);
      acc.recentFails.push(code);
      while (acc.recentFails.length > NLS_COMMENT_SUBMIT_FAIL_REASONS_MAX) {
        acc.recentFails.shift();
      }
    }
    g[NLS_COMMENT_SUBMIT_OUTCOME_KEY] = acc;
  } catch {
    /* ignore: 観測の失敗は無視 */
  }
}

/**
 * v0.1.925: コメント送信診断を fastDiag 用に要約する純関数。
 * globalThis の rolling buffer（所要 ms）と outcome 集計から、試行数・成功数・
 * 失敗数・成功率・直近所要の平均/最大・直近の失敗理由をまとめる。
 *
 * 集計が一度も無ければ null（fastDiag に出さない＝送信していないだけ）。
 *
 * @param {{ globals?: Record<string, unknown> }} [opts] テスト用に globalThis を差し替え可能
 * @returns {{
 *   attempts: number,
 *   ok: number,
 *   fail: number,
 *   successRate: number|null,
 *   avgMs: number|null,
 *   maxMs: number|null,
 *   recentFails: string[]
 * }|null}
 */
export function summarizeCommentSubmitDiag(opts = {}) {
  const g =
    opts.globals && typeof opts.globals === 'object'
      ? opts.globals
      : /** @type {Record<string, unknown>} */ (globalThis);
  const outcome = g[NLS_COMMENT_SUBMIT_OUTCOME_KEY];
  const totals = g[NLS_COMMENT_SUBMIT_HISTORY_KEY];
  const hasOutcome = Boolean(outcome && typeof outcome === 'object');
  const msRows =
    Array.isArray(totals) && totals.length
      ? totals
          .map((r) => Number(/** @type {any} */ (r)?.ms))
          .filter((n) => Number.isFinite(n) && n >= 0)
      : [];
  if (!hasOutcome && msRows.length === 0) return null;

  const o = /** @type {any} */ (outcome) || {};
  const attempts = Number(o.total) || 0;
  const ok = Number(o.ok) || 0;
  const fail = Number(o.fail) || 0;
  const successRate = attempts > 0 ? ok / attempts : null;
  const recentFails = Array.isArray(o.recentFails)
    ? o.recentFails
        .map((/** @type {unknown} */ s) => String(s))
        .slice(-NLS_COMMENT_SUBMIT_FAIL_REASONS_MAX)
    : [];

  let avgMs = null;
  let maxMs = null;
  if (msRows.length) {
    const sum = msRows.reduce((a, b) => a + b, 0);
    avgMs = Math.round(sum / msRows.length);
    maxMs = Math.round(Math.max(...msRows));
  }

  return { attempts, ok, fail, successRate, avgMs, maxMs, recentFails };
}

/** @returns {boolean} */
export function isCommentSubmitProfileEnabled() {
  try {
    const g = /** @type {Record<string, unknown>} */ (globalThis);
    return Boolean(g[NLS_COMMENT_SUBMIT_PROFILE_FLAG]);
  } catch {
    return false;
  }
}

/**
 * @param {{ now?: () => number }} [opts]
 * @returns {{ mark: (name: string) => void, finish: (label?: string) => void } | null}
 */
export function createCommentSubmitProfiler(opts = {}) {
  if (!isCommentSubmitProfileEnabled()) return null;
  const now =
    typeof opts.now === 'function' ? opts.now.bind(opts) : () => performance.now();
  const t0 = now();
  /** @type {Array<[string, number]>} */
  const phases = [];
  return {
    /** @param {string} name */
    mark(name) {
      phases.push([name, Math.round(now() - t0)]);
    },
    /** @param {string} [label] */
    finish(label = 'nls-comment-submit') {
      try {
        const g = /** @type {Record<string, unknown>} */ (globalThis);
        g[NLS_COMMENT_SUBMIT_LAST_TIMINGS] = phases;
      } catch (_) {
        /* ignore */
      }
      try {
        console.info(`[${label}]`, Object.fromEntries(phases));
      } catch (_) {
        /* ignore */
      }
    }
  };
}
