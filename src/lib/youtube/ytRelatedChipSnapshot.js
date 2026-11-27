/**
 * YouTube 動画ページの右側チップと、いま画面に出ている関連動画を、
 * 呼んだ瞬間の DOM だけから読む。新しい通信・Observer・タイマーは使わない。
 * チップは切り替えない（選ばれているチップの中身だけ）。
 */

/**
 * @typedef {{
 *   title: string,
 *   channel: string,
 *   videoId: string,
 *   href: string,
 *   duration: string,
 *   isOwn: boolean
 * }} YtRelatedChipVideo
 *
 * @typedef {{
 *   chipLabel: string,
 *   chipLabels: string[],
 *   videos: YtRelatedChipVideo[],
 *   ownCount: number,
 *   capturedAt: number
 * }} YtRelatedChipSnapshot
 */

/** @param {unknown} s */
function text(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/** @param {string} href */
export function ytVideoIdFromHref(href) {
  const s = String(href || '');
  try {
    const u = new URL(s, 'https://www.youtube.com/');
    const v = u.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const m = u.pathname.match(/\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    if (m) return m[1];
  } catch {
    /* relative でも上の base で読める。壊れた href は空 */
  }
  const loose = s.match(/[?&]v=([A-Za-z0-9_-]{11})/) || s.match(/\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
  return loose ? loose[1] : '';
}

/**
 * @param {Element | null | undefined} el
 * @param {string} sel
 */
function q(el, sel) {
  if (!el || typeof el.querySelector !== 'function') return null;
  try {
    return el.querySelector(sel);
  } catch {
    return null;
  }
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {string} sel
 */
function qa(root, sel) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  try {
    return Array.from(root.querySelectorAll(sel));
  } catch {
    return [];
  }
}

/**
 * @param {string} channel
 * @param {{ operatorChannelId?: string, operatorChannelName?: string, operatorHandle?: string, videoId?: string }} opts
 */
function isOwnChannel(channel, opts) {
  const name = text(channel).replace(/^@/, '').toLowerCase();
  if (!name) return false;
  const opName = text(opts.operatorChannelName).replace(/^@/, '').toLowerCase();
  const opHandle = text(opts.operatorHandle).replace(/^@/, '').toLowerCase();
  if (opName && name === opName) return true;
  if (opHandle && name === opHandle) return true;
  return false;
}

/**
 * 右側のチップバーから、見えている名前と、いま選ばれているチップを読む。
 * @param {ParentNode} root
 * @returns {{ labels: string[], selected: string }}
 */
export function readYtRelatedChipLabels(root) {
  /** @type {string[]} */
  const labels = [];
  let selected = '';
  const chips = qa(
    root,
    [
      'yt-related-chip-cloud-renderer yt-chip-cloud-chip-renderer',
      '#related yt-chip-cloud-chip-renderer',
      '#secondary yt-chip-cloud-chip-renderer',
      'yt-chip-cloud-renderer yt-chip-cloud-chip-renderer',
    ].join(','),
  );
  for (const el of chips) {
    const label = text(el.textContent);
    if (!label) continue;
    if (!labels.includes(label)) labels.push(label);
    const aria = String(el.getAttribute?.('aria-selected') || '').toLowerCase();
    const selectedAttr = el.hasAttribute?.('selected') || el.hasAttribute?.('is-selected');
    const cls = String(el.className || '');
    if (aria === 'true' || selectedAttr || /\biron-selected\b|\bis-selected\b|\bselected\b/.test(cls)) {
      selected = label;
    }
  }
  return { labels, selected };
}

/**
 * @param {Element} el
 * @param {{ operatorChannelId?: string, operatorChannelName?: string, operatorHandle?: string, videoId?: string }} opts
 * @returns {YtRelatedChipVideo | null}
 */
function videoFromCard(el, opts) {
  const links = qa(el, 'a[href]');
  let href = '';
  let videoId = '';
  for (const a of links) {
    const h = String(a.getAttribute?.('href') || '');
    const id = ytVideoIdFromHref(h);
    if (id) {
      href = h;
      videoId = id;
      break;
    }
  }
  const titleEl =
    q(el, '#video-title') ||
    q(el, 'a#video-title') ||
    q(el, '.yt-lockup-metadata-view-model-wiz__title') ||
    q(el, 'a.yt-lockup-metadata-view-model__title') ||
    q(el, 'yt-formatted-string#video-title') ||
    links.find((a) => ytVideoIdFromHref(String(a.getAttribute?.('href') || ''))) ||
    null;
  const title = text(
    titleEl?.getAttribute?.('title') || titleEl?.getAttribute?.('aria-label') || titleEl?.textContent,
  ).slice(0, 200);
  const channelEl =
    q(el, 'ytd-channel-name #text') ||
    q(el, 'yt-formatted-string.ytd-channel-name') ||
    q(el, '.yt-lockup-metadata-view-model-wiz__metadata') ||
    q(el, '.yt-content-metadata-view-model__metadata-row') ||
    q(el, '#channel-name') ||
    q(el, 'yt-formatted-string.yt-core-attributed-string');
  let channel = '';
  if (channelEl) {
    // メタ行は「チャンネル名 · 再生数 · 日時」のことがある
    const raw = text(channelEl.textContent);
    channel = raw.split(/[·•|]/)[0].trim().slice(0, 80);
  }
  if (!channel) {
    for (const a of links) {
      const h = String(a.getAttribute?.('href') || '');
      if (/\/@|\/channel\//.test(h) && !ytVideoIdFromHref(h)) {
        const t = text(a.textContent);
        if (t && t !== title) {
          channel = t.slice(0, 80);
          break;
        }
      }
    }
  }
  const durEl = q(el, '#text.ytd-thumbnail-overlay-time-status-renderer, .ytp-time-duration, badge-shape .yt-badge-shape__text, .yt-badge-shape__text');
  const duration = text(durEl?.textContent);
  if (!title && !videoId) return null;
  const ownByHref = opts.operatorChannelId
    ? links.some((a) => String(a.getAttribute?.('href') || '').includes(`/channel/${opts.operatorChannelId}`))
    : false;
  const isOwn = ownByHref || isOwnChannel(channel, opts);
  return {
    title,
    channel,
    videoId,
    href,
    duration,
    isOwn,
  };
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {{
 *   operatorChannelId?: string,
 *   operatorChannelName?: string,
 *   operatorHandle?: string, videoId?: string,
 *   nowMs?: number,
 *   limit?: number
 * }} [opts]
 * @returns {YtRelatedChipSnapshot | null}
 */
export function readYtRelatedChipSnapshot(root, opts = {}) {
  if (!root) return null;
  const { labels, selected } = readYtRelatedChipLabels(root);
  const limit = Number.isFinite(Number(opts.limit)) ? Math.max(1, Math.floor(Number(opts.limit))) : 20;
  const scope =
    q(/** @type {any} */ (root), '#related') ||
    q(/** @type {any} */ (root), 'ytd-watch-next-secondary-results-renderer') ||
    q(/** @type {any} */ (root), '#secondary') ||
    root;
  const cards = qa(
    scope,
    [
      'ytd-compact-video-renderer',
      'ytd-compact-movie-renderer',
      'yt-lockup-view-model',
      'ytd-video-renderer',
      'ytd-rich-item-renderer',
    ].join(','),
  );
  /** @type {YtRelatedChipVideo[]} */
  const videos = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const el of cards) {
    const rec = videoFromCard(el, opts);
    if (!rec) continue;
    const key = rec.videoId || `${rec.title}|${rec.channel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    videos.push(rec);
    if (videos.length >= limit) break;
  }
  if (!labels.length && !videos.length) return null;
  const ownCount = videos.filter((v) => v.isOwn).length;
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();
  return {
    chipLabel: selected || (labels[0] || ''),
    chipLabels: labels,
    videos,
    ownCount,
    capturedAt: nowMs,
  };
}
