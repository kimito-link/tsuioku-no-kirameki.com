/**
 * wordEffectOverlay.js — 言葉の演出を透明な層に出す。
 * 動きは CSS の transform と opacity だけ。毎フレームの再計算も物理演算も使わない。
 * 会場の root か、OBS 用の別ページに1枚載せる。
 */
import {
  KEY_WORD_EFFECT,
  WORD_EFFECT_FALL_MS,
  WORD_EFFECT_INGEST_TYPE,
  WORD_EFFECT_POP_MS,
  advanceWordEffectWatch,
  applyWordEffectIngest,
  createWordEffectWatchState,
  liveIdFromWordEffectStorageKey,
  normalizeWordEffectSettings,
  readWordEffectSettings,
  wordEffectEventsFromRows,
  wordEffectKindFromStorageKey
} from '../lib/wordEffect.js';
import { subscribeWordEffectIngest } from './wordEffectIngestHost.js';

const STYLE_ID = 'nl-word-effect-style';

/**
 * @param {Document} doc
 */
function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .nl-we-layer {
      position: absolute;
      inset: 0;
      z-index: 8;
      overflow: hidden;
      pointer-events: none;
    }
    .nl-we-sprite {
      position: absolute;
      top: 18%;
      left: var(--we-x, 50%);
      font-size: clamp(40px, 8vw, 72px);
      line-height: 1;
      pointer-events: none;
      user-select: none;
      will-change: transform, opacity;
    }
    .nl-we-sprite img {
      width: clamp(48px, 10vw, 72px);
      height: clamp(48px, 10vw, 72px);
      object-fit: contain;
      display: block;
    }
    .nl-we-sprite.is-fall {
      top: 0;
      font-size: clamp(28px, 6vw, 48px);
    }
    .nl-we-sprite.is-fall img {
      width: clamp(36px, 8vw, 48px);
      height: clamp(36px, 8vw, 48px);
    }
    .nl-we-sprite.is-pop {
      animation-name: nl-we-pop;
      animation-duration: ${WORD_EFFECT_POP_MS}ms;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
      animation-delay: var(--we-delay, 0ms);
    }
    .nl-we-sprite.is-fall {
      animation-name: nl-we-fall;
      animation-duration: ${WORD_EFFECT_FALL_MS}ms;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
      animation-delay: var(--we-delay, 0ms);
    }
    @keyframes nl-we-pop {
      0% { opacity: 0; transform: translate3d(-50%, 12px, 0) scale(0.4); }
      18% { opacity: 1; transform: translate3d(-50%, 0, 0) scale(1.08); }
      70% { opacity: 1; transform: translate3d(-50%, -6px, 0) scale(1); }
      100% { opacity: 0; transform: translate3d(-50%, -18px, 0) scale(0.96); }
    }
    @keyframes nl-we-fall {
      0% { opacity: 0; transform: translate3d(-50%, -8vh, 0) rotate(0deg); }
      12% { opacity: 1; transform: translate3d(-50%, 0, 0) rotate(0deg); }
      100% { opacity: 0.2; transform: translate3d(-50%, 72vh, 0) rotate(var(--we-rot, 8deg)); }
    }
    @media (prefers-reduced-motion: reduce) {
      .nl-we-sprite.is-pop,
      .nl-we-sprite.is-fall {
        animation-name: nl-we-fade;
        animation-duration: 400ms;
      }
    }
    @keyframes nl-we-fade {
      0% { opacity: 0; transform: translate3d(-50%, 0, 0); }
      25% { opacity: 1; transform: translate3d(-50%, 0, 0); }
      100% { opacity: 0; transform: translate3d(-50%, 0, 0); }
    }
  `;
  (doc.head || doc.documentElement).appendChild(style);
}

/**
 * @param {HTMLElement} layer
 * @param {import('../lib/wordEffect.js').WordEffectSprite[]} sprites
 * @param {number} maxConcurrent
 * @param {boolean} force
 */
export function spawnWordEffectSprites(layer, sprites, maxConcurrent, force) {
  if (!layer || !Array.isArray(sprites) || sprites.length === 0) return;
  const max = Math.max(1, Math.floor(Number(maxConcurrent) || 1));
  const room = max - layer.childElementCount;
  if (!force && room <= 0) return;
  const list = force ? sprites.slice(0, max) : sprites.slice(0, Math.max(0, room));
  if (force) {
    while (layer.childElementCount + list.length > max && layer.firstElementChild) {
      layer.firstElementChild.remove();
    }
  }
  const doc = layer.ownerDocument;
  for (const sprite of list) {
    const el = doc.createElement('div');
    el.className = sprite.effect === 'fall' ? 'nl-we-sprite is-fall' : 'nl-we-sprite is-pop';
    el.style.setProperty('--we-x', `${sprite.xPct}%`);
    el.style.setProperty('--we-delay', `${sprite.delayMs}ms`);
    el.style.setProperty('--we-rot', `${sprite.rotDeg}deg`);
    el.setAttribute('aria-hidden', 'true');
    const emoji = doc.createElement('span');
    emoji.textContent = sprite.emoji || '✨';
    if (sprite.imageUrl) {
      const img = doc.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => {
        img.remove();
        emoji.hidden = false;
      }, { once: true });
      emoji.hidden = true;
      img.src = sprite.imageUrl;
      el.append(img, emoji);
    } else {
      el.append(emoji);
    }
    const remove = () => {
      if (el.isConnected) el.remove();
    };
    el.addEventListener('animationend', remove, { once: true });
    window.setTimeout(remove, sprite.delayMs + sprite.durationMs + 160);
    layer.appendChild(el);
  }
}

/**
 * @param {HTMLElement} parent
 * @param {{ canPaint?: () => boolean }} [opts]
 * @returns {{ preview: (draft: unknown) => void, destroy: () => void }}
 */
export function mountWordEffectOverlay(parent, opts = {}) {
  const noop = { preview() {}, destroy() {} };
  if (!parent || parent.dataset.nlWordEffect === '1') return noop;
  parent.dataset.nlWordEffect = '1';
  const doc = parent.ownerDocument;
  ensureStyle(doc);
  const layer = parent.classList.contains('nl-we-layer')
    ? parent
    : doc.createElement('div');
  if (layer !== parent) {
    layer.className = 'nl-we-layer';
    layer.setAttribute('aria-hidden', 'true');
    parent.appendChild(layer);
  }
  let settings = readWordEffectSettings(null).settings;
  let state = createWordEffectWatchState();
  /** @type {((changes: Record<string, { newValue?: unknown }>, area: string) => void) | null} */
  let onChanged = null;
  /** @type {((message: unknown) => void) | null} */
  let onIngestMessage = null;
  /** @type {(() => void) | null} */
  let unsubscribeIngest = null;

  const canPaint = () => (typeof opts.canPaint === 'function' ? opts.canPaint() !== false : true);

  /**
   * 取り込み口から届いた新しいコメント。テールの中身には頼らない。
   * @param {unknown} message
   */
  const takeIngest = (message) => {
    const budget = canPaint() ? Math.max(0, settings.maxConcurrent - layer.childElementCount) : 0;
    const next = applyWordEffectIngest(settings, message, state, Date.now(), budget);
    state = next.state;
    if (!canPaint()) return;
    for (const sprites of next.fires) {
      spawnWordEffectSprites(layer, sprites, settings.maxConcurrent, false);
    }
  };

  /**
   * @param {string} key
   * @param {unknown} value
   */
  const take = (key, value) => {
    const kind = wordEffectKindFromStorageKey(key);
    const liveId = liveIdFromWordEffectStorageKey(key);
    if (!kind || !liveId) return;
    const events = wordEffectEventsFromRows(value, kind);
    const budget = canPaint() ? Math.max(0, settings.maxConcurrent - layer.childElementCount) : 0;
    const next = advanceWordEffectWatch(settings, events, kind, state, Date.now(), budget, liveId);
    state = next.state;
    if (!canPaint()) return;
    for (const sprites of next.fires) {
      spawnWordEffectSprites(layer, sprites, settings.maxConcurrent, false);
    }
  };

  const storage = (() => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.storage.onChanged) {
        return chrome.storage;
      }
    } catch {
      /* 拡張の外で開いたプレビューでは保存しない */
    }
    return null;
  })();

  if (storage) {
    onChanged = (changes, area) => {
      if (area !== 'local' || !changes) return;
      if (Object.prototype.hasOwnProperty.call(changes, KEY_WORD_EFFECT)) {
        settings = readWordEffectSettings(changes[KEY_WORD_EFFECT]?.newValue).settings;
      }
      for (const key of Object.keys(changes)) {
        if (!wordEffectKindFromStorageKey(key)) continue;
        take(key, changes[key]?.newValue);
      }
    };
    storage.onChanged.addListener(onChanged);
    void storage.local.get(KEY_WORD_EFFECT).then((bag) => {
      const read = readWordEffectSettings(bag?.[KEY_WORD_EFFECT]);
      settings = read.settings;
    }).catch(() => {
      /* 読めなくても演出はオフのまま */
    });
  }

  unsubscribeIngest = subscribeWordEffectIngest(takeIngest);
  onIngestMessage = (message) => {
    const msg = /** @type {{ type?: string }} */ (message);
    if (!msg || msg.type !== WORD_EFFECT_INGEST_TYPE) return;
    takeIngest(message);
  };
  try {
    chrome.runtime.onMessage.addListener(onIngestMessage);
  } catch { /* 拡張の外のプレビュー */ }

  return {
    /**
     * 保存しなくても、その場で1回出す(設定画面の「試す」)。
     * @param {unknown} draft
     */
    preview(draft) {
      const normalized = normalizeWordEffectSettings({ enabled: true, maxConcurrent: 8, rules: [draft] });
      const rule = normalized.rules[0];
      if (!rule) return;
      const word = rule.trigger === 'word' && !rule.word ? '試す' : rule.word;
      const ready = word === rule.word
        ? normalized
        : normalizeWordEffectSettings({
          enabled: true,
          maxConcurrent: 8,
          rules: [{ ...rule, word }]
        });
      const use = ready.rules[0];
      if (!use) return;
      const sprites = advanceWordEffectWatch(
        ready,
        [{ key: `preview:${Date.now()}`, text: use.word || '試す', itemName: use.word }],
        use.trigger === 'gift' ? 'gift' : 'comment',
        { seen: [], lastFired: Object.create(null), primed: true, activeLiveId: 'preview' },
        Date.now(),
        8,
        'preview'
      ).fires[0];
      if (sprites) spawnWordEffectSprites(layer, sprites, 8, true);
    },
    destroy() {
      if (storage && onChanged) storage.onChanged.removeListener(onChanged);
      if (unsubscribeIngest) unsubscribeIngest();
      try {
        if (onIngestMessage) chrome.runtime.onMessage.removeListener(onIngestMessage);
      } catch { /* 拡張の外 */ }
      if (layer !== parent) layer.remove();
      delete parent.dataset.nlWordEffect;
    }
  };
}
