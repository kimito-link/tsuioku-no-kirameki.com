/**
 * スマホの開始画面(app/phone.html)で貼られた「PC の拡張のスマホ用リンク」を読む(純関数)。
 *   受け付けるのは app.tsuioku-no-kirameki.com の /live-view?v=<トークン> と、トークンだけの文字列。
 *   ほかのサイトのリンクは開かない(アプリの中で知らないページへ飛ばない)。
 *
 * @module phoneStartLink
 */

import { isValidPostKey } from './phonePost.js';

const VIEW_TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
const APP_HOST = 'app.tsuioku-no-kirameki.com';
const VIEW_PATHS = new Set(['/live-view', '/app/live-view.html']);

/** 開始画面が覚えておくキー(この端末だけ)。 */
export const PHONE_START_LINK_KEY = 'nls_phone_start_link_v1';

/**
 * @param {unknown} input
 * @returns {{ token: string, postKey: string }|null}
 */
export function parseViewerLink(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return null;
  if (VIEW_TOKEN_RE.test(raw)) return { token: raw, postKey: '' };
  /** @type {URL} */
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== APP_HOST || !VIEW_PATHS.has(u.pathname)) return null;
  const token = u.searchParams.get('v') || '';
  if (!VIEW_TOKEN_RE.test(token)) return null;
  const pk = new URLSearchParams(u.hash.replace(/^#/, '')).get('pk') || '';
  return { token, postKey: isValidPostKey(pk) ? pk : '' };
}

/**
 * 開く先(同じサイトの中のパス)。投稿の鍵があれば #pk= で渡す(live-view が受け取って端末に覚える)。
 * @param {{ token: string, postKey: string }} link
 */
export function viewerPathFor(link) {
  const base = `/live-view?v=${encodeURIComponent(link.token)}`;
  return link.postKey ? `${base}#pk=${encodeURIComponent(link.postKey)}` : base;
}

/**
 * 覚えておく値(投稿の鍵は live-view が自分で覚えるので、ここにはトークンのパスだけ)。
 * @param {unknown} saved
 * @returns {string} 開けるパス('' なら覚えていない・壊れている)
 */
export function savedViewerPath(saved) {
  const s = String(saved == null ? '' : saved);
  const m = /^\/live-view\?v=([A-Za-z0-9_-]{8,128})$/.exec(s);
  return m ? s : '';
}

const NICOLIVE_LV_RE = /^lv\d{6,15}$/;
const NICOLIVE_HOSTS = new Set(['live.nicovideo.jp', 'sp.live.nicovideo.jp', 'live2.nicovideo.jp', 'nico.ms']);

/**
 * v0.1.1819: PC の拡張が無い人が貼る「ニコ生の放送の URL」から番組 ID(lvNNN)を取る。
 *   受け付ける形: https://live.nicovideo.jp/watch/lv… ・ sp.live… ・ https://nico.ms/lv… ・ lv… だけ。
 *   ほかのサイトや番組以外のページは '' (開かない)。
 * @param {unknown} input
 * @returns {string} 小文字の lvNNN、読めなければ ''
 */
export function parseNicoliveWatchLink(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return '';
  const bare = raw.toLowerCase();
  if (NICOLIVE_LV_RE.test(bare)) return bare;
  /** @type {URL} */
  let u;
  try {
    u = new URL(raw);
  } catch {
    return '';
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !NICOLIVE_HOSTS.has(u.hostname.toLowerCase())) return '';
  const parts = u.pathname.split('/').filter(Boolean);
  const last = String(parts[parts.length - 1] || '').toLowerCase();
  if (!NICOLIVE_LV_RE.test(last)) return '';
  if (u.hostname.toLowerCase() === 'nico.ms') return parts.length === 1 ? last : '';
  return parts.length === 2 && parts[0] === 'watch' ? last : '';
}
