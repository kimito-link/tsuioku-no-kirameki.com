// ABEMA のコメント本文は、コメント欄が開いているときだけ届く。
// 番組詳細が最初から開いていても、コメントのタブや右下の吹き出しを、
// コメントの応答が届くまで押し直す。利用者がコメント欄を閉じたら、同じページでは押し直さない。
// チャンネルを切り替えたときは呼び出し側が reset する。

export const AB_COMMENT_AREA_SEL = '.com-tv-CommentArea, .com-tv-CommentBlock';
export const AB_COMMENT_BUTTON_SEL = '.com-tv-LinearFooterCommentButton button, button.com-tv-LinearFooterCommentButton, [class*="CommentButton"] button, button[class*="CommentButton"], [class*="FooterComment"] button, button[class*="FooterComment"]';
export const AB_COMMENT_CONTROL_SEL = `button, [role="tab"], a, ${AB_COMMENT_BUTTON_SEL}`;
export const AB_PANEL_POLL_MS = 2000;
export const AB_PANEL_RETRY_MS = 3500;
export const AB_PANEL_TOGGLE_MS = 8000;
/** このあいだ押し続けてコメントが届かなければ、手で開く案内に切り替える */
export const AB_PANEL_WAIT_MS = 90_000;
/** 同じ配信を「いま見ている」と書き直す最短間隔。裏タブとの入れ替わりを止める */
export const AB_ACTIVE_CLAIM_DEBOUNCE_MS = 8_000;
/** 配信画像がまだ無いときの再確認。毎秒は見ない */
export const AB_IMAGE_RETRY_MS = 8_000;
/** 配信画像が取れたあとの再確認 */
export const AB_IMAGE_REFRESH_MS = 30_000;
/** 未設定はオン。false のときだけ自動で開かない */
export const AB_OPEN_COMMENT_KEY = 'yt_ab_open_comment';
export const AB_PANEL_NOTE = 'ABEMAのコメント欄（画面右下の吹き出しボタン）を開くと記録が始まります';

// 拡張自身の画面(会場・案内)。会場の「✍ しまう」は title に「コメント」を含むので、除かないと
// コメント欄のボタンと取り違えて押し、会場が最初から畳まれていた(2026-11-11 PC 実測)。
const OWN_UI = '#nl-ab-open, #nl-ab-note, #nlsb-venue-root, .nlsb-root';

/** @param {unknown} stored */
export function abOpenCommentEnabled(stored) {
  return stored !== false;
}

/**
 * 押してよいか。0 は押さない。小さいほど先に押す。
 * @param {{ label?: string, className?: string, role?: string, hasCommentIcon?: boolean, inOwnUi?: boolean, inCommentChrome?: boolean }} info
 * @returns {{ rank: number, kind: 'tab' | 'footer' | 'icon' | 'label' | '' }}
 */
export function rankAbCommentControl(info) {
  if (!info || info.inOwnUi) return { rank: 0, kind: '' };
  const label = String(info.label || '').replace(/\s+/g, ' ').trim();
  const className = String(info.className || '');
  const role = String(info.role || '').toLowerCase();
  if (/自動で開く|追憶のきらめき|コメントを入力|コメントを書く|送信|通報|ブロック|マイリスト|エピソード|おすすめ|ログイン/.test(label)) {
    return { rank: 0, kind: '' };
  }
  if (/コメントを閉じ|コメントを非表示|コメント\s*(オフ|OFF)/i.test(label)) return { rank: 0, kind: '' };
  if (role === 'tab' && /^コメント/.test(label)) return { rank: 1, kind: 'tab' };
  if (/^(コメント|コメント欄|コメントを見る|コメントを表示)$/.test(label)) return { rank: 1, kind: 'tab' };
  if (/CommentButton|FooterComment|LinearFooterComment/i.test(className)) return { rank: 2, kind: 'footer' };
  if (info.hasCommentIcon) return { rank: 3, kind: 'icon' };
  if (/コメント/.test(label)) return { rank: 4, kind: 'label' };
  if (info.inCommentChrome && /^[\d,]+$/.test(label)) return { rank: 5, kind: 'footer' };
  return { rank: 0, kind: '' };
}

/**
 * 前回押した相手の次を選ぶ。1件しか無ければそれを返す。
 * @param {Array<{ key: string, rank: number, kind: string }>} candidates
 * @param {string} lastKey
 */
export function pickAbCommentControl(candidates, lastKey) {
  const list = (Array.isArray(candidates) ? candidates : [])
    .filter((c) => c && c.rank > 0 && c.key)
    .slice()
    .sort((a, b) => a.rank - b.rank || String(a.key).localeCompare(String(b.key)));
  if (!list.length) return null;
  if (!lastKey) return list[0];
  const idx = list.findIndex((c) => c.key === lastKey);
  if (idx < 0) return list[0];
  return list[(idx + 1) % list.length];
}

export function createAbPanelController() {
  let sawOpen = false;
  let startedAt = 0;
  let lastClickAt = 0;
  let lastKey = '';
  let attempts = 0;
  let gaveUp = false;
  let userClosed = false;
  return {
    reset() {
      sawOpen = false;
      startedAt = 0;
      lastClickAt = 0;
      lastKey = '';
      attempts = 0;
      gaveUp = false;
      userClosed = false;
    },
    status() {
      return {
        clicked: attempts > 0,
        sawArea: sawOpen,
        startedAt,
        gaveUp,
        userClosed,
        attempts,
      };
    },
    /**
     * @param {{ open: boolean, arrived: boolean, enabled: boolean, now: number, candidates: Array<{ key: string, rank: number, kind: string }> }} s
     * @returns {{ clickKey: string, userClosed: boolean, gaveUp: boolean }}
     */
    tick(s) {
      const now = Number(s.now) || 0;
      const open = !!s.open;
      const arrived = !!s.arrived;
      if (!s.enabled) return { clickKey: '', userClosed: false, gaveUp: false };
      if (!startedAt) startedAt = now;
      if (open || arrived) {
        sawOpen = true;
        userClosed = false;
        gaveUp = false;
        return { clickKey: '', userClosed: false, gaveUp: false };
      }
      if (sawOpen) {
        userClosed = true;
        return { clickKey: '', userClosed: true, gaveUp: false };
      }
      if (gaveUp || now - startedAt > AB_PANEL_WAIT_MS) {
        gaveUp = true;
        return { clickKey: '', userClosed: false, gaveUp: true };
      }
      const since = lastClickAt ? now - lastClickAt : AB_PANEL_RETRY_MS;
      if (lastClickAt && since < AB_PANEL_RETRY_MS) return { clickKey: '', userClosed: false, gaveUp: false };
      const next = pickAbCommentControl(s.candidates, lastKey);
      if (!next) return { clickKey: '', userClosed: false, gaveUp: false };
      const repeatingToggle = next.key === lastKey && (next.kind === 'footer' || next.kind === 'icon');
      if (repeatingToggle && since < AB_PANEL_TOGGLE_MS) return { clickKey: '', userClosed: false, gaveUp: false };
      lastClickAt = now;
      lastKey = next.key;
      attempts += 1;
      return { clickKey: next.key, userClosed: false, gaveUp: false };
    },
  };
}

/** @param {Element | { getAttribute?: (n: string) => string | null, className?: string, innerText?: string, textContent?: string, querySelector?: (s: string) => unknown, closest?: (s: string) => unknown }} el */
export function describeAbCommentControl(el) {
  const className = String(/** @type {any} */ (el).className || '');
  const role = String(el.getAttribute?.('role') || '');
  const aria = `${el.getAttribute?.('aria-label') || ''} ${el.getAttribute?.('title') || ''}`;
  const text = String(/** @type {any} */ (el).innerText || /** @type {any} */ (el).textContent || '');
  const label = `${aria} ${text}`.replace(/\s+/g, ' ').trim().slice(0, 80);
  const own = typeof el.closest === 'function' ? !!el.closest(OWN_UI) : false;
  let hasCommentIcon = false;
  if (typeof el.querySelector === 'function') {
    try {
      hasCommentIcon = !!el.querySelector('use[href*="comment" i], img[src*="comment" i], [class*="comment" i]');
    } catch {
      hasCommentIcon = !!el.querySelector('[class*="comment"]');
    }
  }
  const inCommentChrome = typeof el.closest === 'function'
    ? !!el.closest('[class*="Comment"], [class*="Footer"]')
    : /Comment|Footer/.test(className);
  return { label, className, role, hasCommentIcon, inOwnUi: own, inCommentChrome };
}

/** @param {{ getBoundingClientRect?: () => { width: number, height: number } }} el */
function isShown(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return true;
  const r = el.getBoundingClientRect();
  return r.width >= 8 && r.height >= 8;
}

/**
 * コメント一覧か入力欄が見えていれば開いている。番組詳細の件数表示だけでは開いていない。
 * @param {{ querySelector?: (s: string) => any, querySelectorAll?: (s: string) => Iterable<any> }} doc
 */
export function abCommentsLookOpen(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return false;
  if (doc.querySelector(AB_COMMENT_AREA_SEL)) return true;
  if (typeof doc.querySelectorAll !== 'function') return false;
  const fields = doc.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]');
  for (const el of fields) {
    const ph = `${el?.getAttribute?.('placeholder') || ''} ${el?.getAttribute?.('aria-label') || ''} ${el?.getAttribute?.('data-placeholder') || ''}`;
    if (/コメント/.test(ph) && isShown(el)) return true;
  }
  return false;
}

/**
 * @param {{ querySelectorAll?: (s: string) => Iterable<any> }} doc
 * @returns {Array<{ key: string, rank: number, kind: string, el: any }>}
 */
export function listAbCommentControls(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  /** @type {Array<{ key: string, rank: number, kind: string, el: any }>} */
  const out = [];
  const seen = new Set();
  let nodes = [];
  try {
    nodes = [...doc.querySelectorAll(AB_COMMENT_CONTROL_SEL)];
  } catch {
    nodes = [...doc.querySelectorAll('button, [role="tab"], a')];
  }
  nodes.forEach((el, index) => {
    if (!el || seen.has(el) || !isShown(el)) return;
    const clickEl = typeof el.matches === 'function' && !el.matches('button, [role="tab"], a') && typeof el.querySelector === 'function'
      ? (el.querySelector('button, [role="tab"], a') || el)
      : el;
    if (seen.has(clickEl)) return;
    const info = describeAbCommentControl(clickEl);
    const ranked = rankAbCommentControl(info);
    if (!ranked.rank) return;
    seen.add(el);
    seen.add(clickEl);
    out.push({
      key: `${ranked.rank}:${index}:${info.label.slice(0, 24)}`,
      rank: ranked.rank,
      kind: ranked.kind,
      el: clickEl,
    });
  });
  return out;
}

/** @param {any} el */
function pressControl(el) {
  if (!el) return;
  try {
    const view = el.ownerDocument?.defaultView;
    if (view && typeof el.dispatchEvent === 'function') {
      const common = { bubbles: true, cancelable: true, view };
      if (typeof view.PointerEvent === 'function') {
        el.dispatchEvent(new view.PointerEvent('pointerdown', common));
        el.dispatchEvent(new view.PointerEvent('pointerup', common));
      }
      if (typeof view.MouseEvent === 'function') {
        el.dispatchEvent(new view.MouseEvent('mousedown', common));
        el.dispatchEvent(new view.MouseEvent('mouseup', common));
      }
    }
  } catch {
    /* click だけで足りる */
  }
  if (typeof el.click === 'function') el.click();
}

/**
 * ボタンの位置と文字を見るか。開いたあと・諦めたあと・届いたあとは見ない。
 * @param {{ sawArea?: boolean, gaveUp?: boolean, userClosed?: boolean, startedAt?: number }} status
 * @param {{ open?: boolean, arrived?: boolean, enabled?: boolean, now?: number }} opts
 */
export function abPanelShouldScanButtons(status, opts) {
  if (opts?.enabled === false) return false;
  if (opts?.open || opts?.arrived) return false;
  if (status?.sawArea || status?.gaveUp || status?.userClosed) return false;
  const started = Number(status?.startedAt) || 0;
  const now = Number(opts?.now) || 0;
  if (started > 0 && now - started > AB_PANEL_WAIT_MS) return false;
  return true;
}

/**
 * 見えているタブか、操作中のタブだけが「いまの配信」を書いてよい。
 * 同じ配信は debounce のあいだ書き直さない。配信が変わった直後と、前面に出たときは書く。
 * @param {{ visible?: boolean, focused?: boolean, videoId?: string, lastVideoId?: string, now?: number, lastClaimAt?: number, debounceMs?: number, force?: boolean }} s
 */
export function abShouldClaimActiveVideo(s = {}) {
  if (s.visible !== true && s.focused !== true) return false;
  const videoId = String(s.videoId || '');
  if (!videoId) return false;
  if (s.force === true) return true;
  const now = Number(s.now) || 0;
  const lastAt = Number(s.lastClaimAt) || 0;
  const wait = Number(s.debounceMs) > 0 ? Number(s.debounceMs) : AB_ACTIVE_CLAIM_DEBOUNCE_MS;
  if (videoId === String(s.lastVideoId || '') && lastAt > 0 && now - lastAt < wait) return false;
  return true;
}

/**
 * 配信画像の DOM を見にいくか。無いときは短く、有るときは長く空ける。
 * @param {number} lastScanAt
 * @param {boolean} hasImage
 * @param {number} now
 */
export function abImageScanDue(lastScanAt, hasImage, now) {
  const last = Number(lastScanAt) || 0;
  if (!(last > 0)) return true;
  const wait = hasImage ? AB_IMAGE_REFRESH_MS : AB_IMAGE_RETRY_MS;
  return (Number(now) || 0) - last >= wait;
}

/**
 * 番組詳細が開いていても、コメントのタブや吹き出しをコメントが届くまで押す。
 * 開いたあと・諦めたあとはボタンの位置と文字を見ない。
 * @param {ReturnType<typeof createAbPanelController>} ctrl
 * @param {{ querySelector?: (sel: string) => any, querySelectorAll?: (sel: string) => Iterable<any> }} doc
 * @param {{ enabled?: boolean, now: number, arrived?: boolean }} opts
 */
export function stepAbCommentPanel(ctrl, doc, opts) {
  const prior = ctrl.status();
  const open = abCommentsLookOpen(doc);
  const arrived = !!opts.arrived;
  /** @type {Array<{ key: string, rank: number, kind: string, el: any }>} */
  let candidates = [];
  if (abPanelShouldScanButtons(prior, { open, arrived, enabled: opts.enabled !== false, now: opts.now })) {
    candidates = listAbCommentControls(doc);
    if (!candidates.length && doc && typeof doc.querySelector === 'function') {
      const button = doc.querySelector(AB_COMMENT_BUTTON_SEL);
      if (button) {
        const info = describeAbCommentControl(button);
        const ranked = rankAbCommentControl({ ...info, className: info.className || 'com-tv-LinearFooterCommentButton' });
        if (ranked.rank) candidates = [{ key: 'legacy-footer', rank: ranked.rank, kind: ranked.kind || 'footer', el: button }];
      }
    }
  }
  const action = ctrl.tick({
    open,
    arrived: !!opts.arrived,
    enabled: opts.enabled !== false,
    now: opts.now,
    candidates,
  });
  const hit = action.clickKey ? candidates.find((c) => c.key === action.clickKey) : null;
  if (hit) pressControl(hit.el);
  return { click: !!hit, userClosed: action.userClosed, gaveUp: action.gaveUp, clickKey: action.clickKey };
}
