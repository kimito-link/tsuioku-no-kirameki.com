/**
 * 通常動画のサムネイルを押したとき、横の欄の中にその人の行動を出す。
 * ライブ配信のタイル（配信モードの列）には配線しない。発言一覧は詳細の中のリンクだけが開く。
 * wireLaneUserDetailOpen.js は触らない（ライブのクリックは master のまま）。
 */
import { buildComeviewUserDetailPath, laneTileUserDetailTarget } from '../lib/comeviewUserDetailLink.js';
import { buildViewerBehaviorPersonDetail, viewerBehaviorPersonDetailInnerHtml } from '../lib/viewerBehavior.js';

/**
 * @param {any} box 動画カード（.nlsb-video-watch-card またはその器）
 * @param {{ board?: any, document?: Document }} [opts]
 */
export function wireVideoLanePersonDetail(box, opts = {}) {
  if (!box || typeof box.addEventListener !== 'function') return;
  if (box.getAttribute('data-nlsb-video-detail-wired') === '1') {
    // v0.1.2263: 録画のチャット再生などでカードが描き直されても、開いていた人の詳細を開いたままにする
    if (opts.board) box.__nlsbBoard = opts.board;
    reopenVideoLanePersonDetail(box);
    return;
  }
  box.setAttribute('data-nlsb-video-detail-wired', '1');
  if (opts.board) box.__nlsbBoard = opts.board;

  // キャプチャ段階で止める。document の live 用リスナー（wireLaneUserDetailOpen）が窓を開かないようにする。
  box.addEventListener('error', (/** @type {Event} */ ev) => {
    const img = /** @type {HTMLImageElement|null} */ (ev.target);
    if (!img?.matches?.('img.nlsb-person-detail__reply-face')) return;
    const fallback = img.ownerDocument.createElement('span');
    fallback.className = 'nlsb-person-detail__reply-face';
    fallback.setAttribute('aria-hidden', 'true');
    fallback.textContent = '?';
    img.replaceWith(fallback);
  }, true);
  box.addEventListener('click', (/** @type {any} */ ev) => {
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
    const id = laneTileUserDetailTarget({
      userKey: tile.getAttribute('data-user-key') || '',
      title: tile.getAttribute('title') || '',
    })?.uid || String(tile.getAttribute('data-user-key') || '').replace(/^u:/, '');
    showVideoLanePersonDetail(box, tile, id, box.__nlsbBoard || opts.board);
  }, true);
}

/**
 * @param {any} box
 * @param {any} tile
 * @param {string} id
 * @param {any} board
 */
function showVideoLanePersonDetail(box, tile, id, board) {
  const detailEl = box.querySelector('.nlsb-viewer-behavior__detail');
  if (!detailEl || !id) return;
  const row = Array.isArray(board?.rows) ? board.rows.find((/** @type {any} */ r) => String(r.id) === id) : null;
  const uname = laneTileUserDetailTarget({ userKey: tile?.getAttribute?.('data-user-key') || '', title: tile?.getAttribute?.('title') || '' })?.uname || '';
  const detail = /** @type {any} */ (buildViewerBehaviorPersonDetail(row || { id, name: uname }));
  // 返信を読めるのは YouTube だけ。ほかのサービスの動画・録画では返信の欄を出さない
  const platform = String(board?.platform || '').trim();
  if (platform && platform !== 'youtube') detail.repliesUnknown = true;
  detailEl.hidden = false;
  const html = viewerBehaviorPersonDetailInnerHtml(detail);
  if (detailEl.innerHTML !== html) detailEl.innerHTML = html;
  box.__nlsbOpenDetailId = id;
  const selected = box.querySelectorAll('.nl-story-userlane-cell[aria-expanded="true"]');
  for (let i = 0; i < selected.length; i += 1) selected[i].setAttribute('aria-expanded', 'false');
  tile?.setAttribute?.('aria-expanded', 'true');
}

/**
 * 描き直しのあと、開いていた人の詳細を同じ行の最新の値で開き直す。その人のタイルが消えたら閉じたまま。
 * @param {any} box
 */
export function reopenVideoLanePersonDetail(box) {
  const id = String(box?.__nlsbOpenDetailId || '');
  if (!id) return;
  const detailEl = box.querySelector('.nlsb-viewer-behavior__detail');
  if (!detailEl || !detailEl.hidden) return;
  const tiles = box.querySelectorAll('.nl-story-userlane-cell[data-user-key^="u:"]');
  let tile = null;
  for (let i = 0; i < tiles.length; i += 1) {
    if (String(tiles[i].getAttribute('data-user-key') || '').replace(/^u:/, '') === id) { tile = tiles[i]; break; }
  }
  if (!tile) return;
  showVideoLanePersonDetail(box, tile, id, box.__nlsbBoard);
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
