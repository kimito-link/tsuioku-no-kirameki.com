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
  // 2026-11-05 りんく「中央でもよい・小さすぎる」: 帯の一番上に1段まるごと使って中央に置く(右のボタン群の幅に左右されない)。
  form.style.cssText =
    'position:relative;display:flex;align-items:center;justify-content:center;gap:6px;margin:0;' +
    'flex:1 1 100%;order:-1;min-width:0;';
  const input = doc.createElement('input');
  input.type = 'text';
  input.className = 'nlsb-compose-input';
  input.placeholder = 'ここから発言';
  input.maxLength = 200;
  input.autocomplete = 'off';
  // 入力欄と結果の一言を重ねる枠(結果は入力欄の上に出し、打ち始めたら消える=周りのボタンを覆わない)。
  const box = doc.createElement('div');
  box.style.cssText = 'position:relative;flex:0 1 520px;min-width:0;display:flex;';
  input.style.cssText =
    'flex:1 1 auto;width:100%;min-width:0;height:34px;box-sizing:border-box;padding:4px 14px;border-radius:17px;' +
    'border:1px solid rgba(0,0,0,0.25);background:rgba(255,255,255,0.96);color:#1f2328;font-size:14px;';
  const btn = doc.createElement('button');
  btn.type = 'submit';
  btn.className = 'nlsb-comeview-btn nlsb-compose-send';
  btn.textContent = '送信';
  btn.disabled = true;
  btn.style.minHeight = '34px';
  const status = doc.createElement('span');
  status.className = 'nlsb-compose-status';
  // 結果の一言は入力欄の上に重ねる(下に浮かせると右のボタンを覆った・帯に並べると入力欄が横へ跳ぶ)。
  status.style.cssText =
    'position:absolute;inset:0;z-index:2;display:none;align-items:center;box-sizing:border-box;padding:0 14px;' +
    'border-radius:17px;border:1px solid currentColor;background:#fff;overflow:hidden;' +
    'font-size:12px;font-weight:600;line-height:1.3;white-space:normal;pointer-events:none;';
  status.hidden = true;
  let clearTimer = 0;
  const hide = () => {
    status.hidden = true;
    status.style.display = 'none';
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = 0;
  };
  let busy = false;
  const sync = () => {
    btn.disabled = busy || !input.value.trim();
  };
  /** @param {{ ok: boolean, text: string }} r */
  const show = (r) => {
    status.hidden = false;
    status.style.display = 'flex';
    status.textContent = r.text;
    status.title = r.text;
    status.style.color = r.ok ? '#1a7f37' : '#cf222e';
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = /** @type {any} */ (setTimeout(hide, r.ok ? 2500 : 12000));
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
  input.addEventListener('input', () => {
    hide();
    sync();
  });
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
  box.append(input, status);
  form.append(box, btn);
  return form;
}
