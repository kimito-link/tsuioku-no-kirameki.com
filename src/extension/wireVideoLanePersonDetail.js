/**
 * 通常動画のサムネイルを押したとき、横の欄の中にその人の行動を出す。
 * ライブ配信のタイル（配信モードの列）には配線しない。発言一覧は詳細の中のリンクだけが開く。
 * wireLaneUserDetailOpen.js は触らない（ライブのクリックは master のまま）。
 */
import { buildComeviewUserDetailPath, laneTileUserDetailTarget } from '../lib/comeviewUserDetailLink.js';
import { buildViewerBehaviorPersonDetail, viewerBehaviorPersonDetailInnerHtml } from '../lib/viewerBehavior.js';

/**
 * @param {Element | null | undefined} box 動画カード（.nlsb-video-watch-card またはその器）
 * @param {{ board?: any, document?: Document }} [opts]
 */
export function wireVideoLanePersonDetail(box, opts = {}) {
  if (!box || typeof box.addEventListener !== 'function') return;
  if (box.getAttribute('data-nlsb-video-detail-wired') === '1') return;
  box.setAttribute('data-nlsb-video-detail-wired', '1');
  if (opts.board) box.__nlsbBoard = opts.board;

  // キャプチャ段階で止める。document の live 用リスナー（wireLaneUserDetailOpen）が窓を開かないようにする。
  box.addEventListener('click', (ev) => {
    if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
    // instanceof Element は、happy-dom の Window と Node のグローバルが違うと外れる。closest の有無で見る。
    const t = ev.target && typeof ev.target.closest === 'function' ? ev.target : null;
    if (!t || (typeof box.contains === 'function' && !box.contains(t))) return;

    const openBtn = t.closest('[data-open-comeview]');
    if (openBtn && box.contains(openBtn)) {
      ev.preventDefault();
      ev.stopPropagation();
      const uid = String(openBtn.getAttribute('data-user-id') || '').trim();
      const uname = String(openBtn.getAttribute('data-user-name') || '').trim();
      if (!uid) return;
      openComeviewUserDetail(uid, uname, box.ownerDocument || opts.document);
      return;
    }

    const tile = t.closest('.nl-story-userlane-cell[data-user-key^="u:"]');
    if (!tile || !box.contains(tile)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const board = box.__nlsbBoard || opts.board;
    const target = laneTileUserDetailTarget({
      userKey: tile.getAttribute('data-user-key') || '',
      title: tile.getAttribute('title') || '',
    });
    const id = target?.uid || String(tile.getAttribute('data-user-key') || '').replace(/^u:/, '');
    const row = Array.isArray(board?.rows) ? board.rows.find((r) => String(r.id) === id) : null;
    const detailEl = box.querySelector('.nlsb-viewer-behavior__detail');
    if (!detailEl) return;
    const detail = buildViewerBehaviorPersonDetail(row || { id, name: target?.uname || '' });
    detailEl.hidden = false;
    detailEl.innerHTML = viewerBehaviorPersonDetailInnerHtml(detail);
    const selected = box.querySelectorAll('.nl-story-userlane-cell[aria-expanded="true"]');
    for (let i = 0; i < selected.length; i += 1) selected[i].setAttribute('aria-expanded', 'false');
    tile.setAttribute('aria-expanded', 'true');
  }, true);
}

/**
 * 既存の発言一覧窓と同じ口。ライブのタイルクリック経路は使わない。
 * @param {string} uid
 * @param {string} uname
 * @param {Document | null | undefined} doc
 */
export function openComeviewUserDetail(uid, uname, doc) {
  const path = buildComeviewUserDetailPath(uid, uname);
  const g = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : globalThis);
  const chromeObj = /** @type {any} */ (g && g.chrome) || (typeof chrome !== 'undefined' ? chrome : null);
  const url = chromeObj?.runtime?.getURL ? chromeObj.runtime.getURL(path) : path;
  try {
    if (chromeObj?.windows?.create) {
      void chromeObj.windows.create({ url, type: 'popup', width: 420, height: 640 });
      return;
    }
  } catch {
    /* 窓 API が無ければ window.open */
  }
  if (g && typeof g.open === 'function') g.open(url, '_blank', 'width=420,height=640');
}
