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

import { KEY_LIVEVIEW_PUBLISH_PAYLOAD } from '../lib/storageKeys.js';
import { buildStatusShareUrls } from '../lib/statusShareUrls.js';

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

/**
 * 「🌐 このURLをWEBでも公開する」ボタンを配線する。
 *   status が KEY_LIVEVIEW_PUBLISH_PAYLOAD に置いた {jsonBlob, ingestKey, viewToken, appOrigin} を読み、
 *   /api/status へ POST して、拡張なしで見られる公開URL(/live-view?v=token)を出す。
 *   ★再構築しない=status が組み立てた jsonBlob を丸ごと送る(status の「WEBサイトURLで共有」と byte 一致)。
 */
function setupPublishButton() {
  const bar = document.getElementById('lvPublishBar');
  const btn = /** @type {HTMLButtonElement|null} */ (document.getElementById('lvPublishBtn'));
  const result = document.getElementById('lvPublishResult');
  if (!bar || !btn || !result) return;

  const showError = (/** @type {string} */ msg) => {
    result.hidden = false;
    result.classList.add('is-error');
    result.replaceChildren();
    const d = document.createElement('div');
    d.textContent = '× ' + msg;
    result.appendChild(d);
  };

  const showSuccess = (/** @type {string} */ publicUrl) => {
    result.hidden = false;
    result.classList.remove('is-error');
    result.replaceChildren();
    const head = document.createElement('div');
    head.className = 'lv-pub-head';
    head.textContent = '✓ これが そっくりの画面URLです（拡張なしのスマホ/他人でも見られます）:';
    result.appendChild(head);
    const urlBox = document.createElement('div');
    urlBox.className = 'lv-pub-url';
    urlBox.textContent = publicUrl;
    result.appendChild(urlBox);
    const actions = document.createElement('div');
    actions.className = 'lv-pub-actions';
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = '🪞 公開ページを開く';
    openBtn.addEventListener('click', () => {
      try {
        chrome.tabs.create({ url: publicUrl });
      } catch {
        window.open(publicUrl, '_blank', 'noopener');
      }
    });
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = '📋 URLをコピー';
    copyBtn.addEventListener('click', async () => {
      const prev = copyBtn.textContent;
      try {
        await navigator.clipboard.writeText(publicUrl);
        copyBtn.textContent = '✓ コピーしました';
      } catch {
        copyBtn.textContent = '× コピー不可(手動で選択)';
      }
      setTimeout(() => { copyBtn.textContent = prev; }, 1800);
    });
    actions.appendChild(openBtn);
    actions.appendChild(copyBtn);
    result.appendChild(actions);
  };

  btn.addEventListener('click', async () => {
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = '公開中...';
    try {
      const bag = await chrome.storage.local.get(KEY_LIVEVIEW_PUBLISH_PAYLOAD);
      const payload = /** @type {{ jsonBlob?: object, ingestKey?: string, viewToken?: string, appOrigin?: string }|undefined} */ (
        bag && bag[KEY_LIVEVIEW_PUBLISH_PAYLOAD]
      );
      if (!payload || !payload.jsonBlob || !payload.ingestKey || !payload.viewToken) {
        showError('まだ公開できる状態がありません。状態速報ページ(診断)を一度開いてから、もう一度お試しください。');
        return;
      }
      const { ingestUrl, liveViewUrl } = buildStatusShareUrls(payload.appOrigin, payload.viewToken);
      const res = await fetch(ingestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-share-key': payload.ingestKey },
        body: JSON.stringify({ ...payload.jsonBlob, v: payload.viewToken })
      });
      if (!res.ok) {
        showError(`送信失敗 (HTTP ${res.status})`);
        return;
      }
      showSuccess(liveViewUrl);
    } catch (err) {
      showError('通信エラー: ' + String((err && err.message) || err));
    } finally {
      btn.textContent = prev;
      btn.disabled = false;
    }
  });
}

function bootstrap() {
  const frame = /** @type {HTMLIFrameElement|null} */ (document.getElementById('lvPopupFrame'));
  const noLive = document.getElementById('lvNoLive');
  const publishBar = document.getElementById('lvPublishBar');
  const lv = liveIdFromUrl();

  // ?lv= が無い/不正 = 案内を出して iframe は出さない(死に画面にしない)。
  if (!lv) {
    if (frame) frame.hidden = true;
    if (noLive) noLive.hidden = false;
    if (publishBar) publishBar.hidden = true; // 配信が無いなら公開ボタンも出さない
    return;
  }

  const src = buildPopupEmbedSrc(lv);
  if (!frame || !src) {
    // iframe を出せない(chrome.runtime 不在等)= 案内のまま。
    if (noLive) noLive.hidden = false;
    if (publishBar) publishBar.hidden = true;
    return;
  }

  if (noLive) noLive.hidden = true;
  document.title = `応援ライブビュー — ${lv}`;
  if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
  frame.hidden = false;

  // 配信が出るときだけ「このURLをWEBでも公開する」を配線+表示。
  if (publishBar) publishBar.hidden = false;
  setupPublishButton();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
}
