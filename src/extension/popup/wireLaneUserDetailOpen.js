/**
 * 応援レーン(story user lane)のタイルを押したら、その人の「この配信での発言一覧」を
 * comeview のユーザー詳細で開く配線。
 *
 * 既存経路(popup 応援タイムライン行クリック → comeview.html?user=&uname= を popup 窓で開く →
 * comeview が ?user= を読んで showUserDetail を自動オープン)へタイルを乗せるだけ。
 * 新しい発言パネル DOM は作らない(DESIGN 機能A の非目的)。
 *
 * - root(document)に click 委譲を 1 個だけ張る(innerHTML 再描画・hollow→real 置換に耐える)。
 * - 修飾キー/中ボタン(button!==0 || ctrl/meta/shift/alt)は素通し=数値 uid の既存 <a>
 *   (ニコ生ユーザーページ)は Ctrl+クリック/中クリックで従来どおり開ける。
 * - 素クリックは preventDefault → comeview を popup 窓で開く(失敗時 window.open)。
 *
 * DOM/chrome API に触れるためここは src/extension/popup 配下(src/lib は window/document 禁止)。
 * 純粋なパス/対象判定は src/lib/comeviewUserDetailLink.js に分離。
 * 設計正本: docs/handoff/live-comment-body-DESIGN.md 機能A(A3)。
 */
import {
  buildComeviewUserDetailPath,
  laneTileUserDetailTarget
} from '../../lib/comeviewUserDetailLink.js';

/**
 * @param {Document|null|undefined} root document(委譲を張る先)
 */
export function wireLaneUserDetailOpen(root) {
  if (!root || typeof root.addEventListener !== 'function') return;
  const docEl = root.documentElement;
  // 二重配線ガード(popup-entry.js の応援タイムラインと同型)。
  if (docEl && docEl.dataset && docEl.dataset.nlLaneUserDetailWired === '1') return;
  if (docEl && docEl.dataset) docEl.dataset.nlLaneUserDetailWired = '1';

  root.addEventListener('click', (ev) => {
    // 修飾キー・中/右ボタンは既定動作へ素通し(数値 uid=ユーザーページ・匿名=何もしない)。
    if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
    const target =
      ev.target instanceof Element
        ? ev.target.closest('.nl-story-userlane-cell[data-user-key^="u:"]')
        : null;
    if (!(target instanceof Element)) return;
    const detail = laneTileUserDetailTarget({
      userKey: target.getAttribute('data-user-key') || '',
      title: target.getAttribute('title') || ''
    });
    if (!detail) return;
    ev.preventDefault();
    const path = buildComeviewUserDetailPath(detail.uid, detail.uname);
    const url = chrome.runtime.getURL(path);
    try {
      void chrome.windows.create({ url, type: 'popup', width: 420, height: 640 });
    } catch {
      window.open(url, '_blank', 'width=420,height=640');
    }
  });
}
