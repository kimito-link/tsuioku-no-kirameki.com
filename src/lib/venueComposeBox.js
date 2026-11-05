// venueComposeBox.js — 会場モードから発言する1行の入力欄(2026-11-05 りんく「会場モードにも発言送信できたら」)。
//   会場を開いている間は公式のコメント欄が隠れるので、会場の帯に入力欄を置き、パネルの「コメント送信」と同じ経路で送る。
//   送り方(post)は呼び出し側が渡す: ニコ生=content script の postCommentFromContentAsync、YouTube=YT_SEND_COMMENT。
//   ★キー入力は会場の外へ伝えない(ページ側のショートカットや会場の Esc で閉じるに食われないように)。

/** @typedef {{ ok?: boolean, error?: unknown, reason?: unknown }} VenuePostResult */

/**
 * 送信結果を画面の一言にする(純関数)。
 * @param {VenuePostResult | null | undefined} res
 * @param {(reason: string) => string} [reasonText] 理由コードを日本語にする(YouTube 版用)
 * @returns {{ ok: boolean, text: string }}
 */
export function venueComposeResultText(res, reasonText) {
  if (res && res.ok) return { ok: true, text: '送信しました' };
  const err = String(res?.error || '').trim();
  if (err) return { ok: false, text: err };
  const reason = String(res?.reason || '').trim();
  const mapped = reason && typeof reasonText === 'function' ? String(reasonText(reason) || '') : '';
  return { ok: false, text: mapped || `送信できませんでした${reason ? `(${reason})` : ''}` };
}

/**
 * @param {(text: string) => Promise<VenuePostResult>} post
 * @param {{ doc?: Document, reasonText?: (reason: string) => string }} [opts]
 * @returns {HTMLFormElement}
 */
export function createVenueComposeBox(post, opts = {}) {
  const doc = opts.doc || document;
  const form = doc.createElement('form');
  form.className = 'nlsb-compose';
  form.style.cssText = 'position:relative;display:inline-flex;align-items:center;gap:4px;margin:0;';
  const input = doc.createElement('input');
  input.type = 'text';
  input.className = 'nlsb-compose-input';
  input.placeholder = 'ここから発言';
  input.maxLength = 200;
  input.autocomplete = 'off';
  input.style.cssText =
    'width:180px;max-width:40vw;height:26px;box-sizing:border-box;padding:2px 8px;border-radius:13px;' +
    'border:1px solid rgba(0,0,0,0.25);background:rgba(255,255,255,0.96);color:#1f2328;font-size:12px;';
  const btn = doc.createElement('button');
  btn.type = 'submit';
  btn.className = 'nlsb-comeview-btn nlsb-compose-send';
  btn.textContent = '送信';
  btn.disabled = true;
  const status = doc.createElement('span');
  status.className = 'nlsb-compose-status';
  // 結果の一言は入力欄の下に浮かせる(並びに入れると帯が折り返して入力欄が横へ跳ぶ)。不透明な下地で動画の上でも読める。
  status.style.cssText =
    'position:absolute;top:calc(100% + 4px);left:0;z-index:5;width:max-content;max-width:min(360px,80vw);' +
    'padding:4px 10px;border-radius:8px;background:rgba(255,255,255,0.97);box-shadow:0 1px 4px rgba(0,0,0,0.3);' +
    'font-size:12px;font-weight:600;line-height:1.4;white-space:normal;pointer-events:none;';
  status.hidden = true;
  let busy = false;
  let clearTimer = 0;
  const sync = () => {
    btn.disabled = busy || !input.value.trim();
  };
  /** @param {{ ok: boolean, text: string }} r */
  const show = (r) => {
    status.hidden = false;
    status.textContent = r.text;
    status.title = r.text;
    status.style.color = r.ok ? '#1a7f37' : '#cf222e';
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = /** @type {any} */ (setTimeout(() => {
      status.hidden = true;
      clearTimer = 0;
    }, r.ok ? 2500 : 12000));
  };
  const send = async () => {
    const text = input.value.replace(/\s+/g, ' ').trim();
    if (!text || busy) return;
    busy = true;
    sync();
    /** @type {VenuePostResult | null} */
    let res = null;
    try {
      res = await post(text);
    } catch (e) {
      res = { ok: false, error: e && typeof e === 'object' && 'message' in e ? String(/** @type {any} */ (e).message) : String(e) };
    }
    busy = false;
    const r = venueComposeResultText(res, opts.reasonText);
    if (r.ok) input.value = '';
    show(r);
    sync();
  };
  input.addEventListener('input', sync);
  for (const type of ['keydown', 'keyup', 'keypress']) {
    input.addEventListener(type, (ev) => {
      ev.stopPropagation();
      const ke = /** @type {KeyboardEvent} */ (ev);
      if (type === 'keydown' && ke.key === 'Escape') input.blur();
    });
  }
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void send();
  });
  form.append(input, btn, status);
  return form;
}
