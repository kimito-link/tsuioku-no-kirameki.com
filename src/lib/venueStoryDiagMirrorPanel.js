import {
  buildStoryAvatarDiagHtml,
  buildStoryAvatarDiagVerboseHtml
} from './storyAvatarDiagLine.js';

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
      `<div class="nlsb-story-diag__head">①の診断(${ageLabel})</div>` +
      compactHtml +
      (verboseHtml || '')
  };
}

/**
 * @param {HTMLElement|null|undefined} host
 * @param {unknown} snap
 * @param {{ liveId?: unknown, nowMs?: unknown, lastSig?: string }} opts
 * @returns {{ sig: string, changed: boolean }}
 */
export function renderVenueStoryDiagMirrorPanel(host, snap, opts = {}) {
  if (!host) return { sig: String(opts.lastSig || ''), changed: false };
  const s = snap && typeof snap === 'object' ? /** @type {Record<string, unknown>} */ (snap) : null;
  const sameLive = Boolean(s && normalizeLiveId(s.liveId) && normalizeLiveId(s.liveId) === normalizeLiveId(opts.liveId));
  if (!sameLive) {
    const changed = !host.hidden || host.innerHTML !== '' || opts.lastSig !== '__hidden__';
    if (changed) {
      host.hidden = true;
      host.innerHTML = '';
    }
    return { sig: '__hidden__', changed };
  }

  const built = buildVenueStoryDiagMirrorHtml(s, opts.nowMs);
  if (built.html == null) {
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
