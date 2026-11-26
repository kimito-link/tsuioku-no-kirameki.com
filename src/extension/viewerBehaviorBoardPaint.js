/**
 * 視聴者の行動ボードを、既にある storage の変化だけを見て塗る。
 * 新しいタイマー・Observer・通信は使わない。会場の数字は触らない。
 */
import { KEY_VIEWER_BEHAVIOR_BOARD, KEY_YT_VIDEO_WATCH_CARD, KEY_NICO_VIDEO_WATCH_CARD, KEY_VOD_VIDEO_WATCH_CARD, KEY_LAST_WATCH_URL } from '../lib/storageKeys.js';
import { hydrateViewerBehaviorLiveLayout } from './viewerBehaviorLiveLayout.js';
import { wireVideoLanePersonDetail } from './wireVideoLanePersonDetail.js';
import { videoIdentityFromUrl, videoCardWrapMatchesIdentity, videoPageUrlOfTab } from '../lib/videoWatch/videoIdentity.js';
import { ytVideoWatchCardInnerHtml } from '../lib/youtube/ytVideoWatchCard.js';
import { nicoVideoWatchCardInnerHtml } from '../lib/niconico/nicoVideoWatchCard.js';
import { vodVideoWatchCardInnerHtml } from '../lib/videoWatch/videoWatchCard.js';
import { VENUE_STAT_STRIP_CSS } from '../lib/venueStatStrip.js';

export const VIEWER_BEHAVIOR_BOARD_EL_ID = 'nlsb-viewer-behavior-board';
export const VIEWER_BEHAVIOR_BOARD_STYLE_ID = 'nlsb-viewer-behavior-board-style';

/**
 * @param {string} rootSel
 * @param {'overlay' | 'flow'} [_placement] 配置(今はどの配置でも同じ流れの中に置く)
 * @returns {string}
 */
export function viewerBehaviorBoardStyleText(rootSel, _placement = 'overlay') {
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
    rootSel + ' .nlsb-person-detail{margin:0;}' +
    rootSel + ' .nlsb-person-detail p{margin:0 0 4px;}' +
    rootSel + ' .nlsb-person-detail__name{font-weight:700;}' +
    rootSel + ' .nlsb-person-detail__replies{margin:6px 0;}' +
    rootSel + ' .nlsb-person-detail__replies ul{margin:0;padding-left:1.2em;}' +
    rootSel + ' .nlsb-person-detail__comeview{margin:6px 0 0;padding:4px 8px;font:inherit;font-size:12px;cursor:pointer;}' +
    rootSel + ' .nlsb-viewer-behavior--video .nlsb-viewer-behavior__pending-toggle{margin:0 0 6px;}' +
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
 * @param {HTMLElement & { __nlsbBoard?: any }} box
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
  });
}

/**
 * @param {{ document?: Document | null, html?: string, hide?: boolean, placement?: 'overlay' | 'flow', board?: any, collapsed?: boolean, mountParent?: Element | null }} [opts]
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
  const afterPaint = (/** @type {any} */ el) => {
    bindViewerBehaviorBoardEvents(el);
    // 動画のタイルは詳細を横の欄に出す。ライブの発言一覧クリックは popup-entry の既存配線のまま。
    if (opts.board) {
      try {
        el.__nlsbBoard = opts.board;
        hydrateViewerBehaviorLiveLayout(el, opts.board, { document: doc });
      } catch { /* 帯とレーンが出せなくても要約は残す */ }
    }
    try { wireVideoLanePersonDetail(el, { board: opts.board, document: doc }); } catch { /* 詳細が出なくてもカードは残す */ }
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
 * 動画の身元(videoIdentity.js)で照合する。書く側(視聴ページ)と同じ関数で作った鍵なので、サービスが増えてもずれない。
 * @param {{ videoId?: string, card?: any }} wrap
 * @param {import('../lib/videoWatch/videoIdentity.js').VideoIdentity | null} identity
 * @param {'youtube' | 'niconico'} slot
 * @returns {string}
 */
function videoCardHtmlIfMatches(wrap, identity, slot) {
  if (!wrap || typeof wrap !== 'object') return '';
  if (!videoCardWrapMatchesIdentity(wrap, identity, slot)) return '';
  return slot === 'niconico' ? nicoVideoWatchCardInnerHtml(wrap.card) : ytVideoWatchCardInnerHtml(wrap.card);
}

/**
 * @param {{ videoId?: string, card?: any }} wrap
 * @param {import('../lib/videoWatch/videoIdentity.js').VideoIdentity | null} identity
 */
function vodCardHtmlIfMatches(wrap, identity) {
  if (!wrap || typeof wrap !== 'object') return '';
  if (!videoCardWrapMatchesIdentity(wrap, identity, 'vod')) return '';
  return vodVideoWatchCardInnerHtml(wrap.card);
}

/** 動画ページを前に出しているとき、横の欄のライブ用の数字(同時視聴・来場・経過など)を隠す印 */
export const VIDEO_WATCH_ROOT_ATTR = 'data-nl-video-watch';
export const VIDEO_WATCH_HIDE_STYLE_ID = 'nlsb-video-watch-hide-live-stats';
/**
 * 動画には「いま何人」が無い。ライブ用の枠を出すと「読み込み中」のまま止まって見える(0.1.2239 実機・全 7 ページ)。
 * 行や枠は足さず、既存の枠を隠すだけ。ライブのページでは印が付かないので何も変わらない。
 * v0.1.2245: ライブ用の「記録 0 応援コメント」の札・りんくのイベント順位の一言(#nlEventStanding)・
 *   下の「応援 0 コメント／まだ応援コメントがないのだ…」の欄(section.nl-stats)も、動画ページでは隠す。
 *   どれも前に見ていたライブ配信のもので、動画のカード(人が並ぶ)と食い違って見えた(Twitch の動画で「りんく: YouTube には…」)。
 */
export const VIDEO_WATCH_HIDE_LIVE_STATS_CSS =
  `html[${VIDEO_WATCH_ROOT_ATTR}="1"] #watchConcurrentCard,` +
  `html[${VIDEO_WATCH_ROOT_ATTR}="1"] .nl-official-nico-stats__row,` +
  `html[${VIDEO_WATCH_ROOT_ATTR}="1"] #liveStatCards,` +
  `html[${VIDEO_WATCH_ROOT_ATTR}="1"] #nlEventStanding,` +
  `html[${VIDEO_WATCH_ROOT_ATTR}="1"] section.nl-stats{display:none !important;}`;

/**
 * 横の欄の根元に「動画ページを見ている」印を付け外しする(印が変わるときだけ DOM を触る)。
 * @param {Document | null | undefined} doc
 * @param {boolean} on
 */
export function applyVideoWatchRootMark(doc, on) {
  const root = doc?.documentElement;
  if (!root) return;
  const cur = root.getAttribute(VIDEO_WATCH_ROOT_ATTR) === '1';
  if (cur === on) return;
  if (on) {
    if (!doc.getElementById(VIDEO_WATCH_HIDE_STYLE_ID)) {
      const st = doc.createElement('style');
      st.id = VIDEO_WATCH_HIDE_STYLE_ID;
      st.textContent = VIDEO_WATCH_HIDE_LIVE_STATS_CSS;
      (doc.head || root).appendChild(st);
    }
    root.setAttribute(VIDEO_WATCH_ROOT_ATTR, '1');
  } else {
    root.removeAttribute(VIDEO_WATCH_ROOT_ATTR);
  }
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

/**
 * ライブの板は出さない。通常動画のカードだけを、その URL のときだけ塗る。
 * @param {{ url?: string, sources?: string, nicoCard?: any, ytCard?: any, vodCard?: any, liveWrap?: any }} input
 */
export function planViewerBehaviorBoardPaint(input) {
  const src = input && typeof input === 'object' ? input : {};
  const url = String(src.url || '');
  const sources = src.sources === 'live' ? 'live' : 'video';
  // ライブ配信の URL・知らない URL は身元が null = 何も塗らない(ライブの画面は master と同じ)。
  const identity = sources !== 'live' ? videoIdentityFromUrl(url) : null;
  const nico = videoCardHtmlIfMatches(src.nicoCard, identity, 'niconico');
  const yt = videoCardHtmlIfMatches(src.ytCard, identity, 'youtube');
  const vod = !nico && !yt ? vodCardHtmlIfMatches(src.vodCard, identity) : '';
  // ライブ配信の「視聴者の行動」は出さない（コメントごとに書いて横の欄をちらつかせない）。
  return {
    html: nico || yt || vod || '',
    board: (nico && src.nicoCard?.card?.behavior) || (yt && src.ytCard?.card?.behavior) || (vod && src.vodCard?.card?.behavior) || null,
    hide: !(nico || yt || vod),
    source: nico ? 'niconico-video' : yt ? 'youtube-video' : vod ? 'vod-video' : 'none',
    identityKey: identity ? identity.key : '',
  };
}

/** 視聴ページの入口(vod-video-watch / nico-video-watch)に「いまの DOM を読み直して」と頼む合図 */
export const VIDEO_WATCH_REREAD_MESSAGE = 'NLS_VIDEO_WATCH_REREAD';

/**
 * storage にあるカード／ボードを、いまのページ用だけ塗る(横の欄)。
 * @param {any} opts document / storage / getUrl / placement / sources / mountParent / sendToTab / tabs / windows
 */
export function installViewerBehaviorBoardFromStorage(opts) {
  const doc = opts.document || (typeof document !== 'undefined' ? document : null);
  const storage = opts.storage;
  const noop = { refresh: () => {}, notePageTab: () => {}, askPageToReread: () => {} };
  if (!doc || !storage?.local?.get) return noop;

  /**
   * 横の欄が前に出しているタブの本当の URL(既存の refresh() が既に問い合わせたタブを渡してもらう)。
   * 動画の身元が取れたときだけ入る。ライブ・知らないページでは '' のまま=照合の道は今までどおり。
   */
  let pageTabUrl = '';
  let pageTabKey = '';
  /** @type {number|null} */
  let pageTabId = null;

  const refresh = () => {
    try {
      if (opts.skipIfVideoCardId && doc.getElementById(opts.skipIfVideoCardId)) {
        paintViewerBehaviorBoardEl({ document: doc, hide: true });
        return;
      }
      void storage.local.get([KEY_VIEWER_BEHAVIOR_BOARD, KEY_YT_VIDEO_WATCH_CARD, KEY_NICO_VIDEO_WATCH_CARD, KEY_VOD_VIDEO_WATCH_CARD, KEY_LAST_WATCH_URL]).then((/** @type {any} */ bag) => {
        try {
          if (opts.skipIfVideoCardId && doc.getElementById(opts.skipIfVideoCardId)) {
            paintViewerBehaviorBoardEl({ document: doc, hide: true });
            return;
          }
          const url = pageTabUrl || String(opts.getUrl ? opts.getUrl() : '') || String(bag?.[KEY_LAST_WATCH_URL] || '');
          const planned = planViewerBehaviorBoardPaint({
            url,
            sources: opts.sources,
            nicoCard: bag?.[KEY_NICO_VIDEO_WATCH_CARD],
            ytCard: bag?.[KEY_YT_VIDEO_WATCH_CARD],
            vodCard: bag?.[KEY_VOD_VIDEO_WATCH_CARD],
            liveWrap: bag?.[KEY_VIEWER_BEHAVIOR_BOARD],
          });
          const html = planned.html;
          const board = planned.board;
          // v0.1.2244: 「動画を見ている」印は、いまのページ用の動画カードを実際に塗れたときだけ付ける。
          //   YouTube のライブも /watch?v= なので URL だけでは決められない(0.1.2241 はライブでも同時視聴者数を隠していた)。
          //   動画カードは、ページ側が「動画」と判定したときにしか書かれない(ライブでは消される)。
          applyVideoWatchRootMark(doc, !!html && !!pageTabKey);
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

  /**
   * 既存の refresh()(横の欄の定期の見回り・可視復帰)が問い合わせた前面タブを受け取る。
   * 新しいタイマー・Observer・通信は足さない。動画ページのときだけ、
   *   ① 横の欄のライブ用の数字を隠す印を付け、② 身元が変わったら塗り直し、③ ページの入口に DOM の読み直しを頼む
   *   (Twitch の録画チャットのように、開いたあとで描かれるコメントを拾うため。変化が無ければページ側は書かない)。
   * ライブ・知らないページでは、URL を読むだけで何もしない。
   * @param {{ id?: number, url?: string, pendingUrl?: string, __ytUrl?: string } | null | undefined} tab
   */
  const notePageTab = (tab) => {
    try {
      const url = videoPageUrlOfTab(tab);
      const identity = videoIdentityFromUrl(url);
      const key = identity ? identity.key : '';
      if (!key && !pageTabKey) return;
      const changed = key !== pageTabKey;
      pageTabKey = key;
      pageTabUrl = key ? url : '';
      pageTabId = key && tab && typeof tab.id === 'number' ? tab.id : null;
      if (!changed) return;
      refresh();
      askPageToReread(); // 移った直後に1回。その後は既存の見回りの合図(pulseVideoPageTabForSidePanel)だけ
    } catch {
      /* 前面タブが読めなくても、今までの照合で塗る */
    }
  };

  /** 動画ページの入口に「いまの DOM を読み直して」と頼む(動画ページのときだけ・変化が無ければページ側は書かない) */
  const askPageToReread = () => {
    if (!pageTabKey || pageTabId == null || typeof opts.sendToTab !== 'function') return;
    try {
      const p = opts.sendToTab(pageTabId, { type: VIDEO_WATCH_REREAD_MESSAGE, key: pageTabKey });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* 入口がまだ無いタブでも塗りは続く */
    }
  };

  /*
   * v0.1.2244: 前面タブは、タブの切り替え・ページの移動の知らせ(chrome.tabs の既存イベント)で受け取る。
   *   0.1.2241 は横の欄の refresh() にだけ頼っていたが、実機の横の欄では定期の見回りが refresh() まで進まないことが多く
   *   (描き直しの間引き・取得中の見送り)、同じタブでページを移っても動画カードが塗られなかった。
   *   外枠(sidepanel-iframe-boot-entry.js)と同じ仕組み・同じ条件(このウィンドウの前面タブだけ)。タイマー・Observer・通信は足さない。
   */
  const tabsApi = opts.tabs;
  if (tabsApi && typeof tabsApi.query === 'function') {
    try {
      /** @type {number|null} */
      let ownWindowId = null;
      try {
        void Promise.resolve(opts.windows?.getCurrent?.()).then((w) => { ownWindowId = w && w.id != null ? w.id : null; }, () => {});
      } catch { /* ウィンドウが分からなくても前面タブで照合する */ }
      /** @param {any} tab */
      const take = (tab) => {
        if (!tab || tab.active === false) return;
        if (ownWindowId != null && tab.windowId != null && tab.windowId !== ownWindowId) return;
        notePageTab(tab);
      };
      tabsApi.onActivated?.addListener?.((/** @type {any} */ info) => {
        try {
          void Promise.resolve(tabsApi.get(info.tabId)).then(take, () => {});
        } catch { /* 次の知らせで追う */ }
      });
      tabsApi.onUpdated?.addListener?.((/** @type {any} */ _id, /** @type {any} */ changeInfo, /** @type {any} */ tab) => {
        if (changeInfo && (changeInfo.url || changeInfo.status === 'complete')) take(tab);
      });
      // 開いた瞬間の前面タブ(1回だけ)
      void Promise.resolve(tabsApi.query({ active: true, currentWindow: true })).then((ts) => take(Array.isArray(ts) ? ts[0] : null), () => {});
    } catch {
      /* 知らせが取れなくても refresh() からの受け取りで照合する */
    }
  }

  try {
    storage.onChanged?.addListener?.((/** @type {any} */ changes, /** @type {string} */ area) => {
      if (area !== 'local') return;
      if (!changes?.[KEY_VIEWER_BEHAVIOR_BOARD] && !changes?.[KEY_YT_VIDEO_WATCH_CARD] && !changes?.[KEY_NICO_VIDEO_WATCH_CARD] && !changes?.[KEY_VOD_VIDEO_WATCH_CARD]) return;
      refresh();
    });
  } catch {
    /* 監視できなくても初回の塗で足りる */
  }
  refresh();
  lastInstalledBoard = { refresh, notePageTab, askPageToReread };
  return lastInstalledBoard;
}

/** @type {{ refresh: () => void, notePageTab: (tab: any) => void, askPageToReread: () => void } | null} */
let lastInstalledBoard = null;

/**
 * v0.1.2244: 横の欄の既存の定期の見回り(3秒・隠れているときは止まる)の先頭から呼ぶ。
 *   動画ページを前に出しているときだけ、ページの入口に読み直しを頼む(Twitch の録画チャットのように後から増えるコメント用)。
 *   ライブ・知らないページでは何もしない。新しいタイマーではない。
 */
export function pulseVideoPageTabForSidePanel() {
  try {
    lastInstalledBoard?.askPageToReread();
  } catch {
    /* 頼めなくても塗りは続く */
  }
}

/**
 * v0.1.2241: 横の欄の refresh() が既に問い合わせた前面タブを、動画カードの照合へ渡す(問い合わせは増やさない)。
 *   ライブのタブなら URL を読むだけで何もしない(notePageTab)。失敗しても横の欄は続ける。
 * @param {any} tab
 */
export function noteVideoPageTabForSidePanel(tab) {
  try {
    lastInstalledBoard?.notePageTab(tab);
  } catch {
    /* 動画カードが出せなくても横の欄は続ける */
  }
}
