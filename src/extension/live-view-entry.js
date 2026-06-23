/**
 * 応援ライブビュー(live-view.html)のエントリ。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-06-23 「そっくりそのまま」(案B2・council/live-view-wholesale-clone-SYNTHESIS.md):
 *   かつては popup の各パネルを1枚ずつ自前で再現していたが、実機(Playwright で popup.html と live-view.html
 *   を直接比較)で「骨格が はじめから別物=そっくりではない」とユーザーに却下された。漸進移植では popup の
 *   12,263 行の骨格と一致しない。
 *
 *   → 本物の popup.html を iframe で全面に埋め込む方式へ全面転換。live-view は「?lv= を読んで
 *     popup.html?inline=1&dock=liveview&lv=<lv> を iframe に焼くだけ」の薄いシェル。描画は本物 popup が
 *     行う=popup を直せば live-view も自動追従(drift ゼロ)。
 *
 *   dock=liveview = INLINE_PASSIVE(受動ビュー)= storage に書かない/watch に注入しない/外部 fetch しない
 *     (inlineModeFlags.js)。status の ensureStatusPopupIframe と同型(MV3 同一拡張 iframe は実証済)。
 *
 *   将来サーバー公開版(chrome.* 無し)は、この iframe の src を Web 用エントリに差し替えるだけ=移植容易。
 * ───────────────────────────────────────────────────────────────────────────
 */

/** URL の ?lv= から live id を取り出す(検証付き)。不正なら ''。 */
function liveIdFromUrl() {
  try {
    const lv = String(new URLSearchParams(location.search).get('lv') || '')
      .trim()
      .toLowerCase();
    return /^lv\d{1,15}$/.test(lv) ? lv : '';
  } catch {
    return '';
  }
}

/**
 * 本物 popup.html を埋める iframe の src を組み立てる。
 *   chrome-extension://<id>/popup.html?inline=1&dock=liveview&lv=<lv>
 *   dock=liveview で popup は受動ビュー(書かない/注入しない/fetch しない)+ 全画面 CSS フック。
 * @param {string} lv
 * @returns {string} src(組み立て不能なら '')
 */
function buildPopupEmbedSrc(lv) {
  try {
    const u = new URL(chrome.runtime.getURL('popup.html'));
    u.searchParams.set('inline', '1');
    u.searchParams.set('dock', 'liveview');
    u.searchParams.set('lv', lv);
    return u.href;
  } catch {
    return '';
  }
}

function bootstrap() {
  const frame = /** @type {HTMLIFrameElement|null} */ (document.getElementById('lvPopupFrame'));
  const noLive = document.getElementById('lvNoLive');
  const lv = liveIdFromUrl();

  // ?lv= が無い/不正 = 案内を出して iframe は出さない(死に画面にしない)。
  if (!lv) {
    if (frame) frame.hidden = true;
    if (noLive) noLive.hidden = false;
    return;
  }

  const src = buildPopupEmbedSrc(lv);
  if (!frame || !src) {
    // iframe を出せない(chrome.runtime 不在等)= 案内のまま。
    if (noLive) noLive.hidden = false;
    return;
  }

  if (noLive) noLive.hidden = true;
  document.title = `応援ライブビュー — ${lv}`;
  if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
  frame.hidden = false;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
}
