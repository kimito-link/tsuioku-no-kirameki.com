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
import { buildParityBadge } from '../lib/parityVerdict.js';
// 根2対策(council/diagnostics-completeness-root-SYNTHESIS.md 第3段): この公開ボタンの送信結果を【storage】に
//   記録する。従来 status の自己診断は globalThis 集計しか見ず、ここ(別ページ=別 globalThis)で送っても
//   「押したのに未送信」と誤報していた。storage に1件書けば status から読める。
import {
  KEY_LIVEVIEW_PUBLISH_OUTCOME,
  buildLiveviewPublishOutcomeRecord
} from '../lib/liveviewPublishOutcomeKey.js';

/** 送信結果を storage に1件記録(best-effort)。status / live-view どちらから送っても status が読める。
 * @param {{ ok: boolean, httpStatus?: number|null, error?: string, liveId?: string }} outcome */
function recordPublishOutcomeToStorage(outcome) {
  try {
    const local = globalThis.chrome?.storage?.local;
    if (!local) return;
    const rec = buildLiveviewPublishOutcomeRecord({ ...outcome, at: Date.now() });
    void local.set({ [KEY_LIVEVIEW_PUBLISH_OUTCOME]: rec });
  } catch {
    /* best-effort: 記録失敗は送信を妨げない */
  }
}

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
      // 送信した snapshot の対象 lv(鏡 liveId 優先)=送信結果記録に添える(status の自己診断が別配信判定に使う)。
      const jb = /** @type {any} */ (payload.jsonBlob || {});
      const sentLiveId = String(jb?.northStarMirror?.liveId || jb?.laneMirror?.liveId || jb?.statCardsMirror?.liveId || '');
      const res = await fetch(ingestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-share-key': payload.ingestKey },
        body: JSON.stringify({ ...payload.jsonBlob, v: payload.viewToken })
      });
      if (!res.ok) {
        recordPublishOutcomeToStorage({ ok: false, httpStatus: res.status, error: `送信失敗 (HTTP ${res.status})`, liveId: sentLiveId });
        showError(`送信失敗 (HTTP ${res.status})`);
        return;
      }
      recordPublishOutcomeToStorage({ ok: true, httpStatus: res.status, liveId: sentLiveId });
      showSuccess(liveViewUrl);
    } catch (err) {
      recordPublishOutcomeToStorage({ ok: false, httpStatus: null, error: '通信エラー: ' + String((err && err.message) || err) });
      showError('通信エラー: ' + String((err && err.message) || err));
    } finally {
      btn.textContent = prev;
      btn.disabled = false;
    }
  });
}

/**
 * 状態速報パネルに本文を貼る(無ければ hidden)。①POP の本文と byte 一致(再構築しない)。
 * @param {string|null|undefined} reportText
 */
function paintStatusReportPanel(reportText) {
  const panel = document.getElementById('lvStatusReport');
  const pre = document.getElementById('lvStatusReportText');
  if (!panel || !pre) return;
  const text = typeof reportText === 'string' ? reportText.trim() : '';
  if (!text) {
    panel.hidden = true;
    return;
  }
  if (pre.textContent !== text) pre.textContent = text;
  panel.hidden = false;
}

/**
 * v0.1.1015: 3画面パリティ・バッジを画面上部に描く。①POP=②この画面=③WEB が同一かを、状態速報を
 *   開かなくても一発で見せる(ユーザー要望「説明不要・コピーせず一発で分かる」)。
 *   status が組んだ jsonBlob.parityVerdict(構造化結果)を読み、buildParityBadge で整形するだけ
 *   (②側で再判定しない=①とバイト一致)。材料が無ければ hidden(死に表示にしない)。
 * @param {{ verdict?: string, reason?: string, nextAction?: string, code?: string }|null|undefined} parityVerdict
 */
function paintParityBadge(parityVerdict) {
  const el = document.getElementById('lvParityBadge');
  if (!el) return;
  if (!parityVerdict || typeof parityVerdict !== 'object') {
    el.hidden = true;
    return;
  }
  const badge = buildParityBadge(parityVerdict);
  el.classList.remove('is-ok', 'is-pending', 'is-mismatch');
  el.classList.add(`is-${badge.tone}`);
  el.replaceChildren();
  const title = document.createElement('div');
  title.className = 'lv-parity-title';
  title.textContent = `${badge.icon} ${badge.title}`;
  el.appendChild(title);
  if (badge.reason) {
    const reason = document.createElement('div');
    reason.className = 'lv-parity-reason';
    reason.textContent = badge.reason;
    el.appendChild(reason);
  }
  if (badge.nextAction) {
    const next = document.createElement('div');
    next.className = 'lv-parity-next';
    next.textContent = `→ ${badge.nextAction}`;
    el.appendChild(next);
  }
  el.hidden = false;
}

/**
 * ①POP と【全く同じフル状態速報】を②応援ライブビューに出す。
 *   status が KEY_LIVEVIEW_PUBLISH_PAYLOAD.jsonBlob.statusReport に置いた本文を読んで貼るだけ
 *   (再構築しない=①とバイト一致)。status の再描画(=再 publish)に storage.onChanged で追従する。
 *   読むだけ=受動ビューの不可侵原則(書かない)を守る。
 */
function setupStatusReportPanel() {
  const readAndPaint = async () => {
    try {
      const local = globalThis.chrome?.storage?.local;
      if (!local) return;
      const bag = await local.get(KEY_LIVEVIEW_PUBLISH_PAYLOAD);
      const payload = /** @type {{ jsonBlob?: { statusReport?: string, parityVerdict?: object } }|undefined} */ (
        bag && bag[KEY_LIVEVIEW_PUBLISH_PAYLOAD]
      );
      const report = payload && payload.jsonBlob ? payload.jsonBlob.statusReport : '';
      paintStatusReportPanel(report);
      paintParityBadge(payload && payload.jsonBlob ? payload.jsonBlob.parityVerdict : null);
    } catch {
      /* best-effort: 読めなくても応援ライブビュー本体は壊さない */
    }
  };
  void readAndPaint();
  try {
    globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'local' || !changes || !changes[KEY_LIVEVIEW_PUBLISH_PAYLOAD]) return;
      const next = /** @type {{ jsonBlob?: { statusReport?: string, parityVerdict?: object } }|undefined} */ (
        changes[KEY_LIVEVIEW_PUBLISH_PAYLOAD].newValue
      );
      const report = next && next.jsonBlob ? next.jsonBlob.statusReport : '';
      paintStatusReportPanel(report);
      paintParityBadge(next && next.jsonBlob ? next.jsonBlob.parityVerdict : null);
    });
  } catch {
    /* best-effort: onChanged 登録不可でも初回 read で1枚は出る */
  }
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

  // ★2026-06-26: このタブが裏に回っている間は iframe(本物 popup を全面起動)を止める。
  //   応援プレビューは重い popup-entry を丸ごと iframe で起動するため、タブを閉じずに診断
  //   (status)タブへ切り替えると、裏で生きた popup が同じ拡張の単一 LevelDB(chrome.storage.local)を
  //   診断と奪い合い「診断が重くて開かない」を招く(記録の心臓部の I/O 競合)。
  //   → document.hidden になったら iframe の src を空にして popup-entry を停止し、可視復帰で復元する。
  //     lv は URL に保持されているので復元は安全(状態は popup 側が storage/snapshot から再構成)。
  //   この変更は live-view タブ内で完結=popup の refresh/paint・status には一切触れない。
  setupPreviewVisibilityPause(frame, src);

  // 配信が出るときだけ「このURLをWEBでも公開する」を配線+表示。
  if (publishBar) publishBar.hidden = false;
  setupPublishButton();

  // ①POP と同一のフル状態速報を貼る(読むだけ・storage.onChanged で追従)。
  setupStatusReportPanel();
}

/** setupPreviewVisibilityPause の二重登録防止(bootstrap が複数回呼ばれても1回だけ配線)。 */
let _previewVisibilityWired = false;

/**
 * プレビュータブが裏に回ったら iframe(本物 popup の全面起動)を止め、表に戻ったら復元する。
 *   - 裏(document.hidden): src を空にして popup-entry を破棄=storage を触らせない(診断との競合解消)。
 *   - 表(visible): 保存しておいた src を再セット=popup-entry を再起動(lv は URL 保持で安全)。
 *   - 受動ビュー(dock=liveview)なので停止/再起動しても watch や storage を壊さない。
 * @param {HTMLIFrameElement} frame
 * @param {string} liveSrc iframe の本来の src(復元用)
 */
function setupPreviewVisibilityPause(frame, liveSrc) {
  if (_previewVisibilityWired) return;
  _previewVisibilityWired = true;
  const apply = () => {
    try {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        // 裏に回った: 本物 popup を止める(src を空に)。hidden は維持しない(表に戻れば復元する)。
        if (frame.getAttribute('src')) frame.setAttribute('src', '');
      } else {
        // 表に戻った: src を復元して popup-entry を再起動。
        if (frame.getAttribute('src') !== liveSrc) frame.setAttribute('src', liveSrc);
      }
    } catch {
      /* no-op: 復元失敗は次の visibilitychange で再試行される */
    }
  };
  document.addEventListener('visibilitychange', apply);
  // 初期状態が hidden(別タブで開かれた直後など)なら即適用して、裏起動の重さを抑える。
  if (typeof document !== 'undefined' && document.hidden) apply();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
}
