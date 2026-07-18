import {
  buildStoryAvatarDiagHtml,
  buildStoryAvatarDiagVerboseHtml
} from './storyAvatarDiagLine.js';
import { resolveStoryDiagTotal } from './storyDiagTotalSource.js';

/** @param {unknown} value @returns {string} */
function normalizeLiveId(value) {
  return String(value || '').trim().toLowerCase();
}

/** @param {unknown} value @returns {number} */
function finiteNumberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** @param {unknown} capturedAt @param {unknown} nowMs @returns {number} */
function storyDiagAgeSec(capturedAt, nowMs) {
  const cap = finiteNumberOrZero(capturedAt);
  const now = finiteNumberOrZero(nowMs);
  if (cap <= 0 || now <= 0) return 0;
  return Math.max(0, Math.floor((now - cap) / 1000));
}

/** @param {number} sec @returns {string} */
function formatAgeLabel(sec) {
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  return `${Math.floor(min / 60)}時間前`;
}

/**
 * @param {unknown} snap
 * @param {unknown} liveId
 * @param {unknown} nowMs
 * @returns {{ present: boolean, ageSec: number|null }}
 */
export function storyDiagMirrorStatus(snap, liveId, nowMs) {
  const s = snap && typeof snap === 'object' ? /** @type {Record<string, unknown>} */ (snap) : null;
  const sameLive = Boolean(s && normalizeLiveId(s.liveId) && normalizeLiveId(s.liveId) === normalizeLiveId(liveId));
  if (!sameLive) return { present: false, ageSec: null };
  return { present: true, ageSec: storyDiagAgeSec(s.capturedAt, nowMs) };
}

/**
 * @param {unknown} snap
 * @param {unknown} nowMs
 * @returns {{ html: string|null, sig: string }}
 */
function buildVenueStoryDiagMirrorHtml(snap, nowMs) {
  const s = /** @type {import('./storyAvatarDiagLine.js').StoryAvatarDiagSnapshot & { liveId?: string, capturedAt?: number }} */ (snap);
  const compactHtml = buildStoryAvatarDiagHtml(s);
  if (compactHtml == null) return { html: null, sig: '__hidden__' };
  const verboseHtml = buildStoryAvatarDiagVerboseHtml(s);
  const ageLabel = formatAgeLabel(storyDiagAgeSec(s?.capturedAt, nowMs));
  const sig = `${normalizeLiveId(s?.liveId)}|${finiteNumberOrZero(s?.capturedAt)}|${compactHtml}|${verboseHtml}`;
  return {
    sig,
    html:
      `<div class="nlsb-story-diag__head">①の診断(内訳 ${ageLabel})</div>` +
      compactHtml +
      (verboseHtml || '')
  };
}

/**
 * 鏡(KEY_STORY_DIAG_MIRROR)が無い/別配信でも、panel summary(件数の正本ストリーム)だけで
 * 件数行のみを描く簡易HTML(story-diag-realtime-sync-DESIGN.md §C-3)。
 * 入力の出どころ: panelSummary(nls_panel_summary_<lv>由来、①popup非依存でcontentが書く)。
 * 出力の使われ方: 鏡不在時のフォールバック描画(renderVenueStoryDiagMirrorPanel から)。
 * 担う責務: 件数行のみの表示。内訳(withUid等)は①でしか計算されないため、代わりに
 *   「内訳は①ポップアップを開くと表示されます」の案内文を出す(0埋めで誤読させない)。
 * 担わない責務: 内訳の算出・単調化(呼び出し側が resolveStoryDiagTotal 経由で解決済みの
 *   total を渡す前提)。
 * @param {{ total: number, panelAgeSec: number|null }} resolved
 * @returns {{ html: string, sig: string }}
 */
function buildVenueStoryDiagPanelOnlyHtml(resolved) {
  const totalNum = Math.max(0, Math.floor(Number(resolved.total) || 0));
  const ageLabel =
    resolved.panelAgeSec == null ? '' : `(件数 ${formatAgeLabel(resolved.panelAgeSec)})`;
  const compactHtml =
    '<div class="nl-story-diag nl-story-diag--compact">' +
    `<p class="nl-story-diag__lead">記録している応援コメント <strong>${totalNum}</strong> 件です。` +
    '内訳は①ポップアップを開くと表示されます。</p></div>';
  const sig = `panelOnly|${totalNum}`;
  return {
    sig,
    html: `<div class="nlsb-story-diag__head">①の診断${ageLabel}</div>` + compactHtml
  };
}

/**
 * 鏡が使えないときの panel summary フォールバックを試みる。使えなければ null。
 * @param {{ liveId?: unknown, nowMs?: unknown, panelSummary?: unknown }} opts
 * @returns {{ html: string, sig: string }|null}
 */
function tryBuildPanelOnlyFallback(opts) {
  if (opts.panelSummary === undefined) return null; // panelSummary 未対応の呼び出し元は挙動不変
  const resolved = resolveStoryDiagTotal({
    panelSummary: opts.panelSummary,
    liveId: String(opts.liveId || ''),
    fallbackTotal: 0,
    nowMs: finiteNumberOrZero(opts.nowMs)
  });
  if (resolved.source !== 'panel') return null;
  return buildVenueStoryDiagPanelOnlyHtml(resolved);
}

/**
 * @param {HTMLElement|null|undefined} host
 * @param {unknown} snap
 * @param {{ liveId?: unknown, nowMs?: unknown, lastSig?: string, panelSummary?: unknown }} opts
 * @returns {{ sig: string, changed: boolean }}
 */
export function renderVenueStoryDiagMirrorPanel(host, snap, opts = {}) {
  if (!host) return { sig: String(opts.lastSig || ''), changed: false };
  const s = snap && typeof snap === 'object' ? /** @type {Record<string, unknown>} */ (snap) : null;
  const sameLive = Boolean(s && normalizeLiveId(s.liveId) && normalizeLiveId(s.liveId) === normalizeLiveId(opts.liveId));
  if (!sameLive) {
    const fallback = tryBuildPanelOnlyFallback(opts);
    if (fallback) {
      if (fallback.sig === opts.lastSig && !host.hidden) return { sig: fallback.sig, changed: false };
      host.innerHTML = fallback.html;
      host.hidden = false;
      return { sig: fallback.sig, changed: true };
    }
    const changed = !host.hidden || host.innerHTML !== '' || opts.lastSig !== '__hidden__';
    if (changed) {
      host.hidden = true;
      host.innerHTML = '';
    }
    return { sig: '__hidden__', changed };
  }

  const built = buildVenueStoryDiagMirrorHtml(s, opts.nowMs);
  if (built.html == null) {
    const fallback = tryBuildPanelOnlyFallback(opts);
    if (fallback) {
      if (fallback.sig === opts.lastSig && !host.hidden) return { sig: fallback.sig, changed: false };
      host.innerHTML = fallback.html;
      host.hidden = false;
      return { sig: fallback.sig, changed: true };
    }
    const changed = !host.hidden || host.innerHTML !== '' || opts.lastSig !== '__hidden__';
    if (changed) {
      host.hidden = true;
      host.innerHTML = '';
    }
    return { sig: '__hidden__', changed };
  }
  if (built.sig === opts.lastSig && !host.hidden) {
    return { sig: built.sig, changed: false };
  }
  host.innerHTML = built.html;
  host.hidden = false;
  return { sig: built.sig, changed: true };
}
