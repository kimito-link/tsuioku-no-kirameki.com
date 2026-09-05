/**
 * 応援グリッド等のリモート avatar img の読み込みガード。
 *
 * 星野ロミ Avatar.tsx パターン:
 *   fallback を先に表示 → バックグラウンドでプローブ → 成功時だけ差し替え
 *   → 404 フリッカーを完全に防止。
 */

import { isHttpOrHttpsUrl } from './supportGrowthTileSrc.js';

/**
 * @param {string} url
 * @returns {string}
 */
function defaultUrlKey(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    return `${u.origin}${u.pathname}`.toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

/**
 * @typedef {{ baseMs?: number, maxMs?: number, maxAttempts?: number }} RetryPolicy
 */

/** venue-avatar-stale-mirror-DESIGN.md §C-1b の既定値。未指定(policy=null)は従来の恒久負キャッシュ。 */
const DEFAULT_RETRY_POLICY = Object.freeze({ baseMs: 30_000, maxMs: 600_000, maxAttempts: 5 });

/**
 * venue-avatar-stale-mirror-DESIGN.md §C-1b: 失敗記録の再試行可否を判定する純関数(TDD対象)。
 *   指数バックオフ(base * 2^(failCount-1)、maxMsで頭打ち)を経過し、かつ試行回数が上限未満なら
 *   再プローブを許可する。policyがnull/undefinedなら常にfalse(従来の恒久負キャッシュ=後方互換)。
 * @param {{ failCount: number, lastFailAt: number }|null|undefined} rec
 * @param {number} nowMs
 * @param {RetryPolicy|null|undefined} policy
 * @returns {boolean}
 */
export function isProbeRetryEligible(rec, nowMs, policy) {
  if (!policy || typeof policy !== 'object') return false;
  if (!rec || typeof rec !== 'object') return false;
  const failCount = Math.max(1, Number(rec.failCount) || 1);
  const maxAttempts = Math.max(1, Number(policy.maxAttempts) || DEFAULT_RETRY_POLICY.maxAttempts);
  if (failCount >= maxAttempts) return false;
  const baseMs = Math.max(1, Number(policy.baseMs) || DEFAULT_RETRY_POLICY.baseMs);
  const maxMs = Math.max(baseMs, Number(policy.maxMs) || DEFAULT_RETRY_POLICY.maxMs);
  const backoffMs = Math.min(maxMs, baseMs * 2 ** (failCount - 1));
  const lastFailAt = Number(rec.lastFailAt) || 0;
  if (!(lastFailAt > 0)) return false;
  return nowMs - lastFailAt > backoffMs;
}

/**
 * @param {{
 *   fallbackSrc: string,
 *   fallbackSrcFor?: ((requestedSrc: string) => string)|null,
 *   urlKey?: (s: string) => string,
 *   onFallbackApplied?: (img: HTMLImageElement) => void,
 *   onRemoteSuccess?: (img: HTMLImageElement) => void,
 *   timeoutMs?: number,
 *   retryPolicy?: RetryPolicy|null
 * }} options
 */
export function createSupportAvatarLoadGuard(options) {
  const fallbackSrc = String(options?.fallbackSrc || '');
  /*
   * ★v0.1.1318: 「その人ごとの代替顔」を返せるようにする(会場が白丸だらけになる件)。
   *
   * ■ なぜ要るか(2026-08-10 実機・ユーザー報告「サムネがおちてる」)
   *   アイコン未設定のユーザーは CDN が 404 を返す(実測: 未設定=404 / 設定済=200)。
   *   guard は失敗時に【全員同じ】fallbackSrc(公式 blank.jpg)を出すので、
   *   会場が「白丸だらけ」になる。これは v0.1.1307 で広告段に対して直したのと同じ症状で、
   *   そのときの結論は「404の白丸でなく【ゆっくり顔】にする」だった。
   *   ★静的な1枚しか返せない構造だったので、会場だけ取り残されていた。
   *
   * ■ 加法のみ: 未指定なら従来どおり fallbackSrc(既存の呼び出し元は挙動不変)。
   */
  const fallbackSrcFor =
    typeof options?.fallbackSrcFor === 'function' ? options.fallbackSrcFor : null;
  /**
   * 失敗時に出す代替 src を決める。個別解決器があればそれを優先し、
   * 空を返したら共通の fallbackSrc に倒す(必ず何かを返す=壊れ画像にしない)。
   * @param {string} requestedSrc
   * @returns {string}
   */
  const resolveFallback = (requestedSrc) => {
    if (!fallbackSrcFor) return fallbackSrc;
    try {
      const s = String(fallbackSrcFor(String(requestedSrc || '')) || '').trim();
      return s || fallbackSrc;
    } catch {
      return fallbackSrc; // 解決器の失敗で画像を壊さない
    }
  };
  const urlKeyFn =
    typeof options?.urlKey === 'function' ? options.urlKey : defaultUrlKey;
  // venue-avatar-stale-mirror-DESIGN.md §C-1b/§G-7: 既定は null=従来の恒久負キャッシュ
  //   (popup互換)。指定した呼び出し元(会場)だけがopt-inでTTL+バックオフ再プローブを得る。
  const retryPolicy =
    options?.retryPolicy && typeof options.retryPolicy === 'object' ? options.retryPolicy : null;
  const onFallbackApplied =
    typeof options?.onFallbackApplied === 'function'
      ? options.onFallbackApplied
      : null;
  const onRemoteSuccess =
    typeof options?.onRemoteSuccess === 'function'
      ? options.onRemoteSuccess
      : null;
  const timeoutRaw = Number(options?.timeoutMs);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 3000;

  // venue-avatar-stale-mirror-DESIGN.md §C-1a: failedKeys は Set→Map化し、失敗種別
  //   (timeout/error)・失敗回数・最終失敗時刻をメタデータとして持つ。has() 判定の意味は
  //   不変(段階0はここまで=挙動不変)。retryPolicy(段階1で追加予定)が無い間は今までどおり
  //   一度失敗したら永久に fallback のまま(TTL/リトライは無い)。
  /** @typedef {{ kind: 'timeout'|'error', failCount: number, lastFailAt: number }} FailedProbeRecord */
  /** @type {Map<string, FailedProbeRecord>} */
  const failedKeys = new Map();
  /** @type {Set<string>} */
  const succeededKeys = new Set();
  /** @type {WeakMap<HTMLImageElement, () => void>} */
  const activeProbes = new WeakMap();
  // venue-avatar-stale-mirror-DESIGN.md §C-1b: retryPolicy有効時にfailedKeys経由で
  //   再プローブが実際に発行された累計(§D計器のretriedTotalの実体)。
  let retriedTotal = 0;

  /**
   * 未確認の HTTP URL にはフォールバックを返す（フリッカー防止）。
   * @param {string} requestedSrc
   * @returns {string}
   */
  function pickDisplaySrc(requestedSrc) {
    const req = String(requestedSrc || '').trim();
    if (!req) return resolveFallback(req);
    if (!isHttpOrHttpsUrl(req)) return req;
    if (req === fallbackSrc) return req;
    const key = urlKeyFn(req);
    // ★失敗が確定している URL は、その人ごとの代替顔へ倒す(全員同じ白丸にしない)。
    if (key && failedKeys.has(key)) return resolveFallback(req);
    if (key && succeededKeys.has(key)) return req;
    return resolveFallback(req);
  }

  /**
   * バックグラウンドプローブ: 隠し Image で読み込みテストし、成功時のみ可視 img.src を差し替え。
   * @param {HTMLImageElement} img
   * @param {string} requestedSrc
   * @returns {HTMLImageElement|null} プローブ Image（テスト用）。プローブ不要なら null。
   */
  function noteRemoteAttempt(img, requestedSrc) {
    if (!(img instanceof HTMLImageElement)) return null;
    const req = String(requestedSrc || '').trim();
    if (!isHttpOrHttpsUrl(req)) return null;
    if (req === fallbackSrc) return null;
    const key = urlKeyFn(req);
    if (!key) return null;
    if (failedKeys.has(key)) {
      // venue-avatar-stale-mirror-DESIGN.md §C-1b: retryPolicy有効かつeligibleなら
      //   再プローブを続行する(拒否せず下へ進む)。ineligibleなら従来どおり拒否。
      //   どちらの経路でも再試行対象の刻印を刻む(retrySweepが後で拾えるように)。
      const eligible = isProbeRetryEligible(failedKeys.get(key), Date.now(), retryPolicy);
      try { img.dataset.nlsbAvatarRetrySrc = req; } catch { /* no-op: 非DOM環境等 */ }
      if (!eligible) return null;
      retriedTotal += 1;
    }

    const cancelPrev = activeProbes.get(img);
    if (cancelPrev) {
      cancelPrev();
      activeProbes.delete(img);
    }

    if (succeededKeys.has(key)) {
      if (img.getAttribute('src') !== req) {
        img.src = req;
        onRemoteSuccess?.(img);
      }
      return null;
    }

    let settled = false;
    /** @type {ReturnType<typeof setTimeout>|null} */
    let timer = null;
    const probe = document.createElement('img');

    const cleanup = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      activeProbes.delete(img);
    };

    /** @param {'timeout'|'error'} kind */
    const applyFailed = (kind) => {
      if (settled) return;
      settled = true;
      const prev = failedKeys.get(key);
      failedKeys.set(key, {
        kind,
        failCount: (prev?.failCount || 0) + 1,
        lastFailAt: Date.now()
      });
      // venue-avatar-stale-mirror-DESIGN.md §C-1b: 初回失敗時点で再試行対象の刻印を刻む
      //   (retrySweepが後で拾えるように)。retryPolicy未指定の呼び出し元でも刻印自体は無害
      //   (retrySweepはretryPolicy無しならno-opで一切参照しない)。
      try { img.dataset.nlsbAvatarRetrySrc = req; } catch { /* no-op: 非DOM環境等 */ }
      /*
       * ★v0.1.1318: 失敗が確定したら【その場で代替顔へ差し替える】。
       *   従来は onFallbackApplied(クラス付与)だけで src を触っておらず、
       *   img は失敗した URL を指したまま=ブラウザの壊れ画像(白丸)が残っていた。
       *   ★fallbackSrcFor が無い呼び出し元では resolveFallback が従来の
       *     fallbackSrc を返すので、実質的な見え方は変わらない(加法)。
       */
      const alt = resolveFallback(req);
      if (alt && img.getAttribute('src') !== alt) {
        try { img.src = alt; } catch { /* no-op: 非DOM環境等 */ }
      }
      onFallbackApplied?.(img);
      cleanup();
    };

    const applySuccess = () => {
      if (settled) return;
      settled = true;
      succeededKeys.add(key);
      // 再試行(retryPolicy)経由の成功時、failedKeysに残った古いレコードを消す。これが無いと
      // pickDisplaySrcがfailedKeys.has(key)を先に見てfallbackを返し続ける(再試行成功が反映
      // されないバグになる)。
      failedKeys.delete(key);
      img.src = req;
      try { delete img.dataset.nlsbAvatarRetrySrc; } catch { /* no-op */ }
      onRemoteSuccess?.(img);
      cleanup();
    };

    probe.addEventListener('load', applySuccess, { once: true });
    probe.addEventListener('error', () => applyFailed('error'), { once: true });
    timer = setTimeout(() => applyFailed('timeout'), timeoutMs);

    activeProbes.set(img, () => {
      if (!settled) {
        settled = true;
        cleanup();
      }
    });

    probe.src = req;
    return probe;
  }

  function clearFailedUrls() {
    failedKeys.clear();
    succeededKeys.clear();
  }

  /**
   * venue-avatar-stale-mirror-DESIGN.md §C-1d: 鏡世代前進時(popup復帰等)に、timeout種別
   *   のみ失敗記録を消す(errorは維持=404の再打撃を避ける)。clearFailedUrlsと違いsucceededKeys
   *   は触らない(§G-1: 成功集合を消すと全タイルが一瞬白丸に戻るちらつきを防ぐ)。
   */
  function clearTimedOutFailures() {
    for (const [key, rec] of failedKeys) {
      if (rec.kind === 'timeout') failedKeys.delete(key);
    }
  }

  /**
   * venue-avatar-stale-mirror-DESIGN.md §C-1c: rootEl配下の再試行対象刻印
   *   (img[data-nlsb-avatar-retry-src])を走査し、eligibleなものだけ再プローブを発行する。
   *   新規タイマーは持たない(呼び出し側の既存低頻度サイクルから叩く設計、§G-5)。
   * @param {Element|null|undefined} rootEl
   * @param {number} nowMs
   * @returns {{ scanned: number, retried: number }}
   */
  function retrySweep(rootEl, nowMs) {
    const result = { scanned: 0, retried: 0 };
    if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return result;
    if (!retryPolicy) return result; // opt-inしていない呼び出し元では何もしない
    /** @type {NodeListOf<HTMLImageElement>} */
    const imgs = rootEl.querySelectorAll('img[data-nlsb-avatar-retry-src]');
    for (const img of imgs) {
      result.scanned += 1;
      const req = String(img.dataset.nlsbAvatarRetrySrc || '').trim();
      if (!req) continue;
      const key = urlKeyFn(req);
      if (!key) continue;
      const rec = failedKeys.get(key);
      if (!rec) {
        // 既に成功済み/未失敗になっている(他タイルが先に解決した等)=刻印だけ掃除。
        try { delete img.dataset.nlsbAvatarRetrySrc; } catch { /* no-op */ }
        continue;
      }
      if (!isProbeRetryEligible(rec, nowMs, retryPolicy)) continue;
      if (activeProbes.has(img)) continue; // 進行中プローブへの二重発行を避ける
      noteRemoteAttempt(img, req);
      result.retried += 1;
    }
    return result;
  }

  /**
   * @param {string} url Vitest 用（失敗セットへの直接投入）
   * @param {'timeout'|'error'} [kind] 既定 'error'
   */
  function markFailedForTests(url, kind = 'error') {
    const k = urlKeyFn(String(url || ''));
    if (k) failedKeys.set(k, { kind, failCount: 1, lastFailAt: Date.now() });
  }

  /** @param {string} url Vitest 用（成功セットへの直接投入） */
  function markSucceededForTests(url) {
    const k = urlKeyFn(String(url || ''));
    if (k) succeededKeys.add(k);
  }

  /**
   * v0.1.339: 「照合済みなのにサムネが出ない」②の真因切り分け用診断。
   *   合成 usericon URL（/nicoaccount/usericon/...）の load 成否を集計して、
   *   どれだけが 404/timeout で fallback に落ちているかを実機ログで可視化する。
   *   key は `origin+pathname` 小文字（probe 結果ベース）なので副作用なしの読み取りのみ。
   * venue-avatar-stale-mirror-DESIGN.md §C-1a/§D: failedTimeout/failedError/retriedTotal/
   *   lastFailAgoMs を追加(会場の白丸が「一度の一時失敗が永久固着している」現象を実機で
   *   切り分けるための計器)。retriedTotal は段階1(§C-1b/1c)実装済み: retryPolicyが有効
   *   (opt-in)な呼び出し元でのみ増える。無効(既定null)の呼び出し元では常に0。
   * @returns {{
   *   succeededTotal: number, failedTotal: number,
   *   usericonSucceeded: number, usericonFailed: number,
   *   failedUsericonSamples: string[],
   *   failedTimeout: number, failedError: number, retriedTotal: number,
   *   lastFailAgoMs: number|null
   * }}
   */
  function getDiagnostics() {
    /** @param {string} k */
    const isUsericon = (k) => /\/nicoaccount\/usericon\//i.test(String(k || ''));
    let usericonSucceeded = 0;
    for (const k of succeededKeys) if (isUsericon(k)) usericonSucceeded += 1;
    let usericonFailed = 0;
    let failedTimeout = 0;
    let failedError = 0;
    let lastFailAt = 0;
    /** @type {string[]} */
    const failedUsericonSamples = [];
    for (const [k, rec] of failedKeys) {
      if (rec.kind === 'timeout') failedTimeout += 1;
      else failedError += 1;
      if (rec.lastFailAt > lastFailAt) lastFailAt = rec.lastFailAt;
      if (!isUsericon(k)) continue;
      usericonFailed += 1;
      if (failedUsericonSamples.length < 5) failedUsericonSamples.push(k);
    }
    return {
      succeededTotal: succeededKeys.size,
      failedTotal: failedKeys.size,
      usericonSucceeded,
      usericonFailed,
      failedUsericonSamples,
      failedTimeout,
      failedError,
      retriedTotal,
      lastFailAgoMs: lastFailAt > 0 ? Math.max(0, Date.now() - lastFailAt) : null
    };
  }

  return {
    pickDisplaySrc,
    noteRemoteAttempt,
    clearFailedUrls,
    clearTimedOutFailures,
    retrySweep,
    markFailedForTests,
    markSucceededForTests,
    getDiagnostics
  };
}
