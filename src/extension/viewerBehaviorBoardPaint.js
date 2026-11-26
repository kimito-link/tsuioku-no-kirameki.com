/**
 * 視聴者の行動ボードを、既にある storage の変化だけを見て塗る。
 * 新しいタイマー・Observer・通信は使わない。会場の数字は触らない。
 */
import { KEY_VIEWER_BEHAVIOR_BOARD, KEY_YT_VIDEO_WATCH_CARD, KEY_NICO_VIDEO_WATCH_CARD, KEY_LAST_WATCH_URL } from '../lib/storageKeys.js';
import { viewerBehaviorBoardInnerHtml } from '../lib/viewerBehavior.js';
import { hydrateViewerBehaviorLiveLayout } from './viewerBehaviorLiveLayout.js';
import { viewerBehaviorWrapMatchesUrl } from '../lib/viewerBehaviorMatch.js';
import { ytVideoWatchCardInnerHtml } from '../lib/youtube/ytVideoWatchCard.js';
import { nicoVideoWatchCardInnerHtml } from '../lib/niconico/nicoVideoWatchCard.js';
import { VENUE_STAT_STRIP_CSS } from '../lib/venueStatStrip.js';

export const VIEWER_BEHAVIOR_BOARD_EL_ID = 'nlsb-viewer-behavior-board';
export const VIEWER_BEHAVIOR_BOARD_STYLE_ID = 'nlsb-viewer-behavior-board-style';

/**
 * @param {string} rootSel
 * @param {'overlay' | 'flow'} placement
 * @returns {string}
 */
export function viewerBehaviorBoardStyleText(rootSel, placement = 'overlay') {
  // ページのコメント欄や映像の上に浮かせない。どの配置でも自分の欄の中の流れにする。
  const box = 'position:relative;z-index:2;max-width:100%;margin:0 0 8px;max-height:none;';
  return (
    rootSel + '{' + box +
      'font:13px/1.45 system-ui,sans-serif;color:#1b1b1b;background:rgba(255,252,245,.96);' +
      'border:1px solid rgba(80,60,20,.28);border-radius:10px;padding:8px 10px;' +
      'box-shadow:none;pointer-events:auto;box-sizing:border-box;' +
    '}' +
    rootSel + ' .nlsb-viewer-behavior__title,' +
    rootSel + ' .nlsb-video-watch-card__title{margin:0 0 4px;font-size:13px;font-weight:700;}' +
    rootSel + ' p{margin:0 0 6px;}' +
    rootSel + ' p:last-child{margin-bottom:0;}' +
    rootSel + ' .nlsb-viewer-behavior{margin-bottom:0;}' +
    rootSel + ' .nlsb-video-watch-card .nlsb-viewer-behavior{margin-bottom:8px;}' +
    rootSel + ' .nlsb-viewer-behavior__summary-btn{display:block;width:100%;margin:0;padding:4px 0;border:0;background:transparent;font:inherit;font-weight:600;text-align:left;cursor:pointer;color:inherit;}' +
    rootSel + ' .nlsb-viewer-behavior__grid{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;max-height:168px;overflow:auto;}' +
    rootSel + ' .nlsb-viewer-behavior__tile{position:relative;width:40px;height:40px;padding:0;border:1px solid rgba(80,60,20,.2);border-radius:8px;background:#fff8ee;cursor:pointer;overflow:hidden;}' +
    rootSel + ' .nlsb-viewer-behavior__tile img{width:40px;height:40px;object-fit:cover;display:block;}' +
    rootSel + ' .nlsb-viewer-behavior__tile .nlsb-viewer-behavior__jump{display:none;}' +
    rootSel + ' .nlsb-viewer-behavior__tile--anon{display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:10px;font-weight:700;}' +
    rootSel + ' .nlsb-viewer-behavior__anon-badge{font-size:14px;}' +
    rootSel + ' .nlsb-viewer-behavior__pending-toggle{margin:0 0 6px;padding:2px 8px;font:inherit;font-size:12px;}' +
    rootSel + ' .nlsb-viewer-behavior__detail{margin:6px 0 0;padding:6px 0 0;border-top:1px solid rgba(80,60,20,.12);font-size:12px;}' +
    rootSel + ' .nlsb-viewer-behavior__scope{font-size:11px;color:#5a4a32;}' +
    rootSel + ' .nlsb-viewer-behavior--pending-only .nlsb-viewer-behavior__tile:not([data-pending="1"]){display:none;}' +
    rootSel + ' .nlsb-viewer-behavior__totals{font-size:12px;}' +
    rootSel + ' .nl-story-userlane-stack{display:flex;flex-direction:column;gap:6px;margin:6px 0;}' +
    rootSel + ' .nl-story-userlane{display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start;}' +
    rootSel + ' .nl-story-userlane-cell{display:inline-flex;flex-direction:column;align-items:center;width:52px;padding:0;border:0;background:transparent;cursor:pointer;text-decoration:none;color:inherit;}' +
    rootSel + ' .nl-story-userlane-avatar,.nl-story-userlane-cell img{width:40px;height:40px;object-fit:cover;border-radius:10px;display:block;}' +
    rootSel + ' .nl-story-userlane-meta{font-size:10px;line-height:1.2;text-align:center;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    rootSel + ' [data-live-lane-host]{max-height:220px;overflow:auto;}' +
    VENUE_STAT_STRIP_CSS
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

/**
 * @param {HTMLElement} box
 */
export function bindViewerBehaviorBoardEvents(box) {
  if (!box || box.getAttribute('data-nlsb-bound') === '1') return;
  box.setAttribute('data-nlsb-bound', '1');
  box.addEventListener('click', (ev) => {
    const t = ev.target instanceof Element ? ev.target : null;
    if (!t) return;
    const jump = t.closest('[data-comment-jump]');
    if (jump) {
      ev.preventDefault();
      ev.stopPropagation();
      const id = String(jump.getAttribute('data-comment-jump') || '').trim();
      if (!id) return;
      const doc = box.ownerDocument;
      let el = null;
      try {
        el = doc.querySelector(`[comment-id="${CSS.escape(id)}"], [data-comment-id="${CSS.escape(id)}"]`);
      } catch {
        el = doc.querySelector(`[comment-id="${id}"]`);
      }
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        return;
      }
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'NLS_SCROLL_TO_VIDEO_COMMENT', commentId: id });
        }
      } catch {
        /* ページ側に届かなくてもボードは残す */
      }
      return;
    }
    const summary = t.closest('[data-summary-toggle]');
    if (summary) {
      ev.preventDefault();
      const section = box.querySelector('.nlsb-viewer-behavior');
      const body = box.querySelector('.nlsb-viewer-behavior__body');
      if (!section || !body) return;
      const open = section.getAttribute('data-collapsed') !== '1';
      const next = !open;
      section.setAttribute('data-collapsed', next ? '0' : '1');
      summary.setAttribute('aria-expanded', next ? 'true' : 'false');
      if (next) body.removeAttribute('hidden');
      else body.setAttribute('hidden', '');
      return;
    }
    const pend = t.closest('[data-pending-toggle]');
    if (pend) {
      ev.preventDefault();
      const section = box.querySelector('.nlsb-viewer-behavior');
      if (!section) return;
      const on = section.classList.toggle('nlsb-viewer-behavior--pending-only');
      pend.setAttribute('aria-pressed', on ? 'true' : 'false');
      pend.textContent = on ? '全員を見る' : '未対応だけ見る';
      const board = box.__nlsbBoard;
      if (board) {
        try { hydrateViewerBehaviorLiveLayout(box, board, { document: box.ownerDocument, pendingOnly: on }); } catch { /* 要約は残す */ }
      }
      return;
    }
    const tile = t.closest('.nl-story-userlane-cell');
    if (tile && box.contains(tile)) {
      ev.preventDefault();
      const detail = box.querySelector('.nlsb-viewer-behavior__detail');
      const board = box.__nlsbBoard;
      if (!detail || !board) return;
      const uid = String(tile.getAttribute('data-user-key') || tile.dataset.userKey || '').replace(/^u:/, '');
      const name = String(tile.querySelector('.nl-story-userlane-meta__name')?.textContent || tile.getAttribute('title') || '').trim();
      const row = (board.rows || []).find((r) => r.id === uid || r.name === name) || (board.rows || []).find((r) => r.isAnonymous);
      if (!row) return;
      const jumpId = String(row.commentAnchor || '');
      detail.textContent = '';
      const strong = box.ownerDocument.createElement('strong');
      strong.textContent = [row.name, row.relationLabel].filter(Boolean).join(' · ');
      detail.appendChild(strong);
      const span = box.ownerDocument.createElement('span');
      span.textContent = row.factLine ? ` ${row.factLine}` : '';
      detail.appendChild(span);
      if (jumpId) {
        const jump = box.ownerDocument.createElement('button');
        jump.type = 'button';
        jump.className = 'nlsb-viewer-behavior__jump';
        jump.setAttribute('data-comment-jump', jumpId);
        jump.textContent = 'このコメントへ';
        detail.appendChild(jump);
      }
      detail.removeAttribute('hidden');
    }
  });
}

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
  const afterPaint = (el) => {
    bindViewerBehaviorBoardEvents(el);
    if (opts.board) {
      try {
        el.__nlsbBoard = opts.board;
        hydrateViewerBehaviorLiveLayout(el, opts.board, { document: doc });
      } catch { /* 帯とレーンが出せなくても要約は残す */ }
    }
    if (opts.collapsed === true) {
      const section = el.querySelector('.nlsb-viewer-behavior');
      const body = el.querySelector('.nlsb-viewer-behavior__body');
      const btn = el.querySelector('[data-summary-toggle]');
      if (section) section.setAttribute('data-collapsed', '1');
      if (body) body.hidden = true;
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  };
  if (existing) {
    if (existing.innerHTML !== html) existing.innerHTML = html;
    afterPaint(existing);
    return;
  }
  const box = doc.createElement('div');
  box.id = VIEWER_BEHAVIOR_BOARD_EL_ID;
  box.innerHTML = html;
  afterPaint(box);
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
          const board = (nico && bag?.[KEY_NICO_VIDEO_WATCH_CARD]?.card?.behavior)
            || (yt && bag?.[KEY_YT_VIDEO_WATCH_CARD]?.card?.behavior)
            || (live && liveWrap?.board)
            || null;
          paintViewerBehaviorBoardEl({
            document: doc,
            html,
            placement: opts.placement || 'flow',
            mountParent: opts.mountParent || (opts.placement === 'flow' ? doc.getElementById('nlPopupPrimary') : (doc.body || doc.documentElement)),
            hide: !html,
            board,
            collapsed: opts.collapsed === true,
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
