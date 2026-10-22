/**
 * 【層】L2 画面層(DOM を組む。鍵の発行・削除・送信は statusDeviceCred.js、判定は lib)
 * 【この箱に入るもの】状態画面の「📱 スマホで見る」スイッチ(同意)・閲覧URL・URLの作り直し
 * 【この箱に入らないもの】鍵の発行や削除の通信(statusDeviceCred.js)・同意フラグの保存(status-entry.js の setWebPublishOptIn)
 *
 * ★なぜ(v0.1.1732・スマホ化 利用者ごとの鍵 第c段):
 *   旧来の同意チェックは共有キー(開発者向け)を入れた人にしか出ず、ストア版の利用者はスマホで見られなかった。
 *   このスイッチを入れると、共有キーが無くても利用者ごとの鍵をサーバーから受け取り、自分の閲覧URLが出る。
 *   何が送られ・どこに・どれだけ残り・誰が見られるかを、スイッチの横にそのまま書く(CWS の同意の要件)。
 * @module statusSmartphoneCard
 */

import { buildStatusShareUrls } from '../lib/statusShareUrls.js';
import { copyTextWithFallback } from '../lib/copyTextWithFallback.js';

/** 同意の説明文。privacy.html 4-3 と揃える(変えるときは両方)。 */
export const SMARTPHONE_CONSENT_TEXT =
  '📱 スマホで見る：配信中、この画面の内容(視聴者のID・表示名・コメント本文を含みます)を自動で送り、' +
  'スマホのブラウザで見られるようにします。中身が変わったときは約20秒、変わらないときは約2分ごとに送ります。' +
  'サーバーには最新の1件が24時間だけ残り、URLを知っている人が見られます。OFFにすると送信を止め、サーバーのデータも消します。';

/**
 * @typedef {{
 *   optedIn: boolean,
 *   getCreds: () => (import('../lib/devicePublishCredentials.js').PublishCredentials | null),
 *   setOptIn: (next: boolean) => Promise<unknown>,
 *   registerNow: () => (Promise<unknown> | undefined),
 *   rotate: () => Promise<string | null>,
 *   openUrl: (url: string) => void
 * }} SmartphoneCardDeps
 */

/**
 * @param {SmartphoneCardDeps} deps
 * @returns {HTMLElement}
 */
export function buildSmartphoneCard(deps) {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'margin-top:8px;padding:6px 8px;border-radius:6px;font-size:11px;line-height:1.5;' +
    'border:1px solid var(--nl-border);background:var(--nl-card-bg);';

  const label = document.createElement('label');
  label.style.cssText = 'display:flex;align-items:flex-start;gap:6px;cursor:pointer;';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = deps.optedIn === true;
  cb.style.cssText = 'margin-top:2px;flex:0 0 auto;cursor:pointer;';
  const text = document.createElement('span');
  text.textContent = SMARTPHONE_CONSENT_TEXT;
  label.appendChild(cb);
  label.appendChild(text);
  wrap.appendChild(label);

  const urlArea = document.createElement('div');
  urlArea.style.cssText = 'margin-top:6px;';
  wrap.appendChild(urlArea);

  /** @param {string} t @param {() => void} onClick */
  const mkBtn = (t, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.style.cssText =
      'margin:4px 6px 0 0;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;' +
      'border:1px solid var(--nl-accent);background:var(--nl-card-bg);color:var(--nl-accent);';
    b.addEventListener('click', onClick);
    return b;
  };

  const renderUrl = (/** @type {string} */ note = '') => {
    urlArea.replaceChildren();
    if (!cb.checked) return;
    const creds = deps.getCreds();
    if (!creds) {
      urlArea.textContent = note || '準備中です(サーバーからこの拡張専用の鍵を受け取っています)。';
      return;
    }
    const { liveViewUrl } = buildStatusShareUrls(creds.appOrigin, creds.viewToken);
    const box = document.createElement('div');
    box.textContent = liveViewUrl;
    box.style.cssText =
      'padding:6px 8px;border:1px solid var(--nl-accent);border-radius:6px;background:var(--nl-bg);' +
      'word-break:break-all;user-select:all;font-family:monospace;';
    urlArea.appendChild(box);
    urlArea.appendChild(mkBtn('📱 開く', () => deps.openUrl(liveViewUrl)));
    const copyBtn = mkBtn('📋 URLをコピー', async () => {
      const r = await copyTextWithFallback(liveViewUrl);
      copyBtn.textContent = r === 'clipboard' || r === 'execCommand' ? '✓ コピーしました' : '× コピー不可(手動で選択)';
      setTimeout(() => { copyBtn.textContent = '📋 URLをコピー'; }, 1800);
    });
    urlArea.appendChild(copyBtn);
    if (creds.mode === 'device') {
      urlArea.appendChild(
        mkBtn('🔄 URLを作り直す', async () => {
          const next = await deps.rotate();
          renderUrl();
          if (!next) urlArea.appendChild(document.createTextNode(' 作り直せませんでした。時間をおいてもう一度試してください。'));
        })
      );
    }
    if (note) urlArea.appendChild(document.createTextNode(' ' + note));
  };

  cb.addEventListener('change', async () => {
    const next = cb.checked === true;
    const prevMode = deps.getCreds()?.mode;
    await deps.setOptIn(next);
    if (!next) {
      renderUrl();
      // 共有キー(開発者の診断用)の送信先は消さない=消したとは書かない(24時間で消える)。
      urlArea.textContent = prevMode === 'device'
        ? '送信を止め、サーバーのデータを消しました(通信の失敗で消せなかった場合も24時間で消えます)。'
        : '送信を止めました。';
      return;
    }
    renderUrl();
    await deps.registerNow();
    renderUrl(deps.getCreds() ? '' : 'まだ鍵を受け取れていません。しばらくすると自動でもう一度試します。');
  });

  renderUrl();
  return wrap;
}
