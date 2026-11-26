/**
 * 視聴者の行動ボードを、既にある storage の変化だけを見て塗る。
 * 新しいタイマー・Observer・通信は使わない。会場の数字は触らない。
 */
import { KEY_VIEWER_BEHAVIOR_BOARD, KEY_YT_VIDEO_WATCH_CARD, KEY_NICO_VIDEO_WATCH_CARD, KEY_LAST_WATCH_URL } from '../lib/storageKeys.js';
import { viewerBehaviorBoardInnerHtml } from '../lib/viewerBehavior.js';
import { viewerBehaviorWrapMatchesUrl } from '../lib/viewerBehaviorMatch.js';
import { ytVideoWatchCardInnerHtml } from '../lib/youtube/ytVideoWatchCard.js';
import { nicoVideoWatchCardInnerHtml } from '../lib/niconico/nicoVideoWatchCard.js';

export const VIEWER_BEHAVIOR_BOARD_EL_ID = 'nlsb-viewer-behavior-board';
export const VIEWER_BEHAVIOR_BOARD_STYLE_ID = 'nlsb-viewer-behavior-board-style';

/**
 * @param {string} rootSel
 * @param {'overlay' | 'flow'} placement
 * @returns {string}
 */
export function viewerBehaviorBoardStyleText(rootSel, placement = 'overlay') {
  const box =
    placement === 'flow'
      ? 'position:relative;z-index:2;max-width:100%;margin:0 0 12px;max-height:none;'
      : 'position:fixed;z-index:2147483646;right:12px;bottom:72px;max-width:320px;max-height:70vh;overflow:auto;';
  return (
    rootSel + '{' + box +
      'font:14px/1.55 system-ui,sans-serif;color:#1b1b1b;background:rgba(255,252,245,.96);' +
      'border:1px solid rgba(80,60,20,.28);border-radius:10px;padding:10px 12px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.14);pointer-events:auto;box-sizing:border-box;' +
    '}' +
    rootSel + ' .nlsb-viewer-behavior__title,' +
    rootSel + ' .nlsb-video-watch-card__title{margin:0 0 6px;font-size:13px;font-weight:700;}' +
    rootSel + ' p{margin:0 0 6px;}' +
    rootSel + ' p:last-child{margin-bottom:0;}' +
    rootSel + ' .nlsb-viewer-behavior{margin-bottom:0;}' +
    rootSel + ' .nlsb-video-watch-card .nlsb-viewer-behavior{margin-bottom:10px;}' +
    rootSel + ' .nlsb-viewer-behavior__list{margin:0;padding:0;list-style:none;}' +
    rootSel + ' .nlsb-viewer-behavior__row{margin:0 0 6px;padding:0 0 6px;border-bottom:1px solid rgba(80,60,20,.12);}' +
    rootSel + ' .nlsb-viewer-behavior__row:last-child{margin-bottom:0;padding-bottom:0;border-bottom:0;}' +
    rootSel + ' .nlsb-viewer-behavior__name{font-weight:700;margin-right:6px;}' +
    rootSel + ' .nlsb-viewer-behavior__rel{font-weight:600;margin-right:6px;}' +
    rootSel + ' .nlsb-viewer-behavior__facts{display:block;font-size:12px;line-height:1.45;}'
  );
}

/**
 * @param {{
 *   document?: Document,
 *   html?: string,
 *   placement?: 'overlay' | 'flow',
 *   mountParent?: Element | null,
 *   hide?: boolean,
 * }} opts
 */
export function paintViewerBehaviorBoardEl(opts = {}) {
  const doc = opts.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const existing = doc.getElementById(VIEWER_BEHAVIOR_BOARD_EL_ID);
  const html = String(opts.html || '');
  if (opts.hide || !html) {
    existing?.remove();
    return;
  }
  if (!doc.getElementById(VIEWER_BEHAVIOR_BOARD_STYLE_ID)) {
    const st = doc.createElement('style');
    st.id = VIEWER_BEHAVIOR_BOARD_STYLE_ID;
    st.textContent = viewerBehaviorBoardStyleText('#' + VIEWER_BEHAVIOR_BOARD_EL_ID, opts.placement || 'overlay');
    (doc.head || doc.documentElement).appendChild(st);
  }
  if (existing) {
    if (existing.innerHTML === html) return;
    existing.innerHTML = html;
    return;
  }
  const box = doc.createElement('div');
  box.id = VIEWER_BEHAVIOR_BOARD_EL_ID;
  box.innerHTML = html;
  const parent = opts.mountParent || doc.body || doc.documentElement;
  if (opts.placement === 'flow' && parent && parent.firstChild) {
    const notice = typeof parent.querySelector === 'function' ? parent.querySelector('#whatsNewNotice') : null;
    if (notice && notice.nextSibling) parent.insertBefore(box, notice.nextSibling);
    else parent.insertBefore(box, parent.firstChild);
  } else {
    parent.appendChild(box);
  }
}

/**
 * @param {{ videoId?: string, card?: any }} wrap
 * @param {string} url
 * @returns {string}
 */
function videoCardHtmlIfMatches(wrap, url) {
  if (!wrap || typeof wrap !== 'object') return '';
  if (!viewerBehaviorWrapMatchesUrl({ pageKey: wrap.videoId }, url)) return '';
  return wrap.card?.platform === 'niconico' || wrap.card?.kind === 'video' && wrap.card?.ownerId
    ? nicoVideoWatchCardInnerHtml(wrap.card)
    : ytVideoWatchCardInnerHtml(wrap.card);
}

/**
 * storage にあるカード／ボードを、いまのページ用だけ塗る。
 * @param {{
 *   document?: Document,
 *   storage?: { local: { get: Function }, onChanged?: { addListener: Function } },
 *   getUrl: () => string,
 *   placement?: 'overlay' | 'flow',
 *   mountParent?: Element | null,
 *   skipIfVideoCardId?: string,
 * }} opts
 */
export function installViewerBehaviorBoardFromStorage(opts) {
  const doc = opts.document || (typeof document !== 'undefined' ? document : null);
  const storage = opts.storage;
  if (!doc || !storage?.local?.get) return { refresh: () => {} };

  const refresh = () => {
    try {
      if (opts.skipIfVideoCardId && doc.getElementById(opts.skipIfVideoCardId)) {
        paintViewerBehaviorBoardEl({ document: doc, hide: true });
        return;
      }
      void storage.local.get([KEY_VIEWER_BEHAVIOR_BOARD, KEY_YT_VIDEO_WATCH_CARD, KEY_NICO_VIDEO_WATCH_CARD, KEY_LAST_WATCH_URL]).then((bag) => {
        try {
          if (opts.skipIfVideoCardId && doc.getElementById(opts.skipIfVideoCardId)) {
            paintViewerBehaviorBoardEl({ document: doc, hide: true });
            return;
          }
          const url = String(opts.getUrl ? opts.getUrl() : '') || String(bag?.[KEY_LAST_WATCH_URL] || '');
          const sources = opts.sources === 'live' ? 'live' : 'all';
          const nico = sources === 'all' ? videoCardHtmlIfMatches(bag?.[KEY_NICO_VIDEO_WATCH_CARD], url) : '';
          const yt = sources === 'all' ? videoCardHtmlIfMatches(bag?.[KEY_YT_VIDEO_WATCH_CARD], url) : '';
          const liveWrap = bag?.[KEY_VIEWER_BEHAVIOR_BOARD];
          const live = liveWrap && viewerBehaviorWrapMatchesUrl(liveWrap, url)
            ? viewerBehaviorBoardInnerHtml(liveWrap.board)
            : '';
          const html = nico || yt || live || '';
          paintViewerBehaviorBoardEl({
            document: doc,
            html,
            placement: opts.placement || 'overlay',
            mountParent: opts.mountParent || (opts.placement === 'flow' ? doc.getElementById('nlPopupPrimary') : (doc.body || doc.documentElement)),
            hide: !html,
          });
        } catch {
          /* ボードが出せなくても会場の数字は出す */
        }
      }).catch(() => {});
    } catch {
      /* 同上 */
    }
  };

  try {
    storage.onChanged?.addListener?.((changes, area) => {
      if (area !== 'local') return;
      if (!changes?.[KEY_VIEWER_BEHAVIOR_BOARD] && !changes?.[KEY_YT_VIDEO_WATCH_CARD] && !changes?.[KEY_NICO_VIDEO_WATCH_CARD]) return;
      refresh();
    });
  } catch {
    /* 監視できなくても初回の塗で足りる */
  }
  refresh();
  return { refresh };
}
