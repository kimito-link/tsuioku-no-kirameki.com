/**
 * mcpDiagDumpServices.js — ニコ生以外のサービス計器・タブを軽量ダンプするための純粋ロジック（L0）。
 *
 * - extension/background.js の runMcpDiagDumpTick（status-latest.json・既定 OFF）と
 *   src/extension/status-entry.js の JSON ダウンロードの両方から共有する。
 * - 全 storage のダンプは行わず、固定の軽量キー配列（OTHER_SERVICE_DIAG_KEYS）だけを対象にする。
 * - URL パターンは既存の host_permissions 内に限定し、新しい権限を増やさない。
 *
 * @module mcpDiagDumpServices
 */

/** ニコ生以外の主要計器キー（軽量スナップショットのみ。全 storage ダンプ禁止）。 */
export const OTHER_SERVICE_DIAG_KEYS = Object.freeze([
  // 各サービスの視聴・チャット計器
  'yt_diag_tw_chat',
  'yt_diag_kk_chat',
  'yt_diag_mx_chat',
  'yt_diag_sr_chat',
  'yt_diag_ww_chat',
  'yt_diag_tc_chat',
  'yt_diag_tt_chat',
  'yt_diag_ab_chat',
  // YouTube 固有計器・SW 状態
  'yt_diag_superchat',
  'yt_diag_superchat_paid',
  'yt_diag_chat_frame_vid',
  'yt_diag_echo_drop',
  'yt_diag_live_rows',
  'yt_diag_sw_boot',
  'yt_diag_sw_stale'
]);

/** 既存の host_permissions 内で照会する他サービスタブ URL パターン。 */
export const OTHER_SERVICE_WATCH_TAB_PATTERNS = Object.freeze([
  'https://www.youtube.com/watch*',
  'https://www.youtube.com/live/*',
  'https://www.twitch.tv/*',
  'https://kick.com/*',
  'https://whowatch.tv/*',
  'https://www.showroom-live.com/*',
  'https://mixch.tv/*',
  'https://twitcasting.tv/*',
  'https://www.tiktok.com/*',
  'https://abema.tv/*'
]);

/** ダンプに載せる他サービスタブの最大件数（肥大化防止）。 */
export const OTHER_SERVICE_TABS_MAX = 30;

/**
 * URL からサービス名と最小限のパス識別子を抽出する（クエリ文字列の機密値やフル URL は載せない）。
 * @param {string} rawUrl
 * @returns {{ service: string, target: string } | null}
 */
export function parseOtherServiceTabUrl(rawUrl) {
  const s = String(rawUrl || '').trim();
  if (!s) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = String(u.hostname || '').toLowerCase();
  const path = String(u.pathname || '');
  const segs = path.split('/').filter(Boolean);

  if (host === 'www.youtube.com' || host === 'youtube.com') {
    if (path.startsWith('/watch')) {
      const v = String(u.searchParams.get('v') || '').slice(0, 32);
      return v ? { service: 'youtube', target: v } : null;
    }
    if (segs[0] === 'live' && segs[1]) {
      return { service: 'youtube', target: segs[1].slice(0, 32) };
    }
    return null;
  }
  if (host === 'www.twitch.tv' || host === 'twitch.tv') {
    if (!segs[0] || /^(directory|downloads|jobs|p|settings|subscriptions|inventory|wallet|u)$/i.test(segs[0])) {
      return null;
    }
    return { service: 'twitch', target: segs[0].slice(0, 48) };
  }
  if (host === 'kick.com' || host === 'www.kick.com') {
    if (!segs[0] || /^(browse|categories|following|transactions|settings)$/i.test(segs[0])) {
      return null;
    }
    return { service: 'kick', target: segs[0].slice(0, 48) };
  }
  if (host === 'whowatch.tv' || host === 'www.whowatch.tv') {
    if (segs[0] === 'viewer' && segs[1]) {
      return { service: 'whowatch', target: segs[1].slice(0, 48) };
    }
    if (segs[0] === 'profile' && segs[1]) {
      return { service: 'whowatch', target: `profile/${segs[1].slice(0, 40)}` };
    }
    return null;
  }
  if (host === 'www.showroom-live.com' || host === 'showroom-live.com') {
    if (segs[0] === 'r' && segs[1]) {
      return { service: 'showroom', target: segs[1].slice(0, 48) };
    }
    return null;
  }
  if (host === 'mixch.tv' || host === 'www.mixch.tv') {
    if (segs[0] === 'u' && segs[1]) {
      return { service: 'mixch', target: segs[1].slice(0, 48) };
    }
    return null;
  }
  if (host === 'twitcasting.tv' || host === 'www.twitcasting.tv') {
    if (!segs[0] || /^(index\.php|login|search|notify|account)$/i.test(segs[0])) {
      return null;
    }
    return { service: 'twitcasting', target: segs[0].slice(0, 48) };
  }
  if (host === 'www.tiktok.com' || host === 'tiktok.com') {
    if (segs[0] && segs[0].startsWith('@') && segs[1] === 'live') {
      return { service: 'tiktok', target: segs[0].slice(0, 48) };
    }
    return null;
  }
  if (host === 'abema.tv' || host === 'www.abema.tv') {
    if (segs[0] === 'now-on-air' && segs[1]) {
      return { service: 'abema', target: segs[1].slice(0, 48) };
    }
    return null;
  }
  return null;
}

/**
 * タブ配列を軽量な他サービス一覧へ要約する（最大 maxTabs 件）。
 * @param {Array<{ url?: string, active?: boolean, discarded?: boolean, status?: string }>} tabs
 * @param {{ maxTabs?: number }} [opts]
 * @returns {Array<{ service: string, target: string, active: boolean, discarded: boolean, status: string }>}
 */
export function summarizeOtherServiceTabs(tabs, opts = {}) {
  const maxTabs = Math.max(1, Math.min(100, Number(opts.maxTabs) || OTHER_SERVICE_TABS_MAX));
  /** @type {Array<{ service: string, target: string, active: boolean, discarded: boolean, status: string }>} */
  const out = [];
  if (!Array.isArray(tabs)) return out;
  for (const t of tabs) {
    if (out.length >= maxTabs) break;
    const parsed = parseOtherServiceTabUrl(t?.url || '');
    if (!parsed) continue;
    out.push({
      service: parsed.service,
      target: parsed.target,
      active: !!t?.active,
      discarded: !!t?.discarded,
      status: String(t?.status || '')
    });
  }
  return out;
}

/**
 * storage bag から許可済み他サービス計器キーのうち値があるものだけを摘出する。
 * @param {Record<string, unknown>|null|undefined} bag
 * @returns {Record<string, unknown>}
 */
export function pickOtherServiceDiags(bag) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (!bag || typeof bag !== 'object') return out;
  for (const key of OTHER_SERVICE_DIAG_KEYS) {
    const val = bag[key];
    if (val !== undefined && val !== null) {
      out[key] = val;
    }
  }
  return out;
}
