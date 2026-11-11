/**
 * OBS透過コメントの表示の見た目（色・大きさ・行数）を正規化し、安全な CSS にする。
 *
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】保存値と URL の検証、型の適用、CSS 文字列、コピー用 URL
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし（キー名の正本は storageKeys.js。ここは中身の形だけ）
 * 【正本宣言】OBS 透過の見た目の形と、URL に埋め込んでよいかの判断はこのファイルのみ
 *
 * 保存の版: `{ v: 1, ... }`。v が 1 でない記録は読まない（既定に倒す）。
 * 未知の版を半分だけ適用しない。書くときは必ず v: 1。余分なフィールドは落とす。
 *
 * OBS のブラウザソース（OBS 内蔵の Chromium）は chrome-extension:// を開けない。
 * この URL は、拡張が入っている Chrome で透過窓を開くためのもの。
 */

export const OBS_OVERLAY_STYLE_VERSION = 1;

/** comeview.html のクエリ名。見た目を URL に固定するときだけ付ける。 */
export const OBS_OVERLAY_QUERY_PARAM = 's';

const FONT_MIN = 12;
const FONT_MAX = 32;
const LINES_MIN = 1;
const LINES_MAX = 24;
const OPACITY_MIN = 15;
const OPACITY_MAX = 100;
const TOKEN_MAX = 600;

/** @typedef {'classic' | 'night' | 'paper' | 'compact' | 'custom'} ObsPresetId */

/**
 * @typedef {{
 *   v: 1,
 *   preset: ObsPresetId,
 *   textColor: string,
 *   nameColor: string,
 *   cardColor: string,
 *   cardOpacity: number,
 *   fontSize: number,
 *   maxLines: number,
 *   showIcons: boolean,
 *   showNames: boolean,
 *   animate: boolean
 * }} ObsOverlayStyle
 */

/** @type {Omit<ObsOverlayStyle, 'preset'>} */
const CLASSIC_FIELDS = {
  v: OBS_OVERLAY_STYLE_VERSION,
  textColor: '#ffffff',
  nameColor: '#8fd6ff',
  cardColor: '#000000',
  cardOpacity: 38,
  fontSize: 15,
  maxLines: 8,
  showIcons: true,
  showNames: true,
  animate: false
};

/** @type {Record<Exclude<ObsPresetId, 'custom'>, Omit<ObsOverlayStyle, 'preset'>>} */
const PRESET_FIELDS = {
  classic: CLASSIC_FIELDS,
  night: {
    v: OBS_OVERLAY_STYLE_VERSION,
    textColor: '#f4f7fb',
    nameColor: '#d7c4ff',
    cardColor: '#000000',
    cardOpacity: 78,
    fontSize: 18,
    maxLines: 6,
    showIcons: true,
    showNames: true,
    animate: false
  },
  paper: {
    v: OBS_OVERLAY_STYLE_VERSION,
    textColor: '#1f2937',
    nameColor: '#0f6f9e',
    cardColor: '#ffffff',
    cardOpacity: 92,
    fontSize: 16,
    maxLines: 8,
    showIcons: true,
    showNames: true,
    animate: false
  },
  compact: {
    v: OBS_OVERLAY_STYLE_VERSION,
    textColor: '#ffffff',
    nameColor: '#b7e3ff',
    cardColor: '#000000',
    cardOpacity: 46,
    fontSize: 13,
    maxLines: 14,
    showIcons: false,
    showNames: true,
    animate: false
  }
};

const PRESET_IDS = /** @type {const} */ (['classic', 'night', 'paper', 'compact']);

/** 見本に出すコメント。個人の名前は置かない。 */
export const OBS_PREVIEW_SAMPLES = Object.freeze([
  Object.freeze({ name: '匿名001', text: '8888', kind: 'comment' }),
  Object.freeze({ name: '匿名002', text: 'きた', kind: 'comment' }),
  Object.freeze({ name: '匿名003', text: 'おつかれさま', kind: 'comment' }),
  Object.freeze({ name: '匿名004', text: 'ギフト', kind: 'gift' })
]);

const AVATAR_FILLS = ['#5b8def', '#e07a5f', '#7dba6a', '#d4a017'];

/** @param {number} index @returns {string} */
export function obsPreviewAvatarDataUrl(index) {
  const fill = AVATAR_FILLS[Math.abs(index | 0) % AVATAR_FILLS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="32" fill="${fill}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** @returns {ObsOverlayStyle} */
export function defaultObsOverlayStyle() {
  return styleFromPreset('classic');
}

/**
 * @param {string} id
 * @returns {ObsOverlayStyle}
 */
export function styleFromPreset(id) {
  const key = PRESET_IDS.find((name) => name === id) || 'classic';
  return { ...PRESET_FIELDS[key], preset: key };
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 */
function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** @param {unknown} value @param {string} fallback */
function hexColor(value, fallback) {
  const s = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
}

/** @param {unknown} value @param {boolean} fallback */
function boolOr(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * v が 1 の記録だけ通す。壊れた色や範囲外の数は既定へ倒す。
 * @param {unknown} raw
 * @returns {ObsOverlayStyle | null}
 */
export function parseObsOverlayStyle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.v !== OBS_OVERLAY_STYLE_VERSION) return null;
  const base = CLASSIC_FIELDS;
  /** @type {ObsOverlayStyle} */
  const style = {
    v: OBS_OVERLAY_STYLE_VERSION,
    preset: 'custom',
    textColor: hexColor(o.textColor, base.textColor),
    nameColor: hexColor(o.nameColor, base.nameColor),
    cardColor: hexColor(o.cardColor, base.cardColor),
    cardOpacity: clampInt(o.cardOpacity, OPACITY_MIN, OPACITY_MAX, base.cardOpacity),
    fontSize: clampInt(o.fontSize, FONT_MIN, FONT_MAX, base.fontSize),
    maxLines: clampInt(o.maxLines, LINES_MIN, LINES_MAX, base.maxLines),
    showIcons: boolOr(o.showIcons, base.showIcons),
    showNames: boolOr(o.showNames, base.showNames),
    animate: boolOr(o.animate, base.animate)
  };
  style.preset = detectObsPreset(style);
  return style;
}

/** @param {unknown} raw @returns {ObsOverlayStyle} */
export function obsOverlayStyleOrDefault(raw) {
  return parseObsOverlayStyle(raw) || defaultObsOverlayStyle();
}

/**
 * 保存する形。v は必ず 1。画面用の余分なキーは付けない。
 * @param {unknown} raw
 * @returns {ObsOverlayStyle}
 */
export function toStorageRecord(raw) {
  const style = obsOverlayStyleOrDefault(raw);
  return {
    v: OBS_OVERLAY_STYLE_VERSION,
    preset: style.preset,
    textColor: style.textColor,
    nameColor: style.nameColor,
    cardColor: style.cardColor,
    cardOpacity: style.cardOpacity,
    fontSize: style.fontSize,
    maxLines: style.maxLines,
    showIcons: style.showIcons,
    showNames: style.showNames,
    animate: style.animate
  };
}

/**
 * @param {ObsOverlayStyle} style
 * @returns {ObsPresetId}
 */
export function detectObsPreset(style) {
  for (const id of PRESET_IDS) {
    const preset = PRESET_FIELDS[id];
    if (
      style.textColor === preset.textColor &&
      style.nameColor === preset.nameColor &&
      style.cardColor === preset.cardColor &&
      style.cardOpacity === preset.cardOpacity &&
      style.fontSize === preset.fontSize &&
      style.maxLines === preset.maxLines &&
      style.showIcons === preset.showIcons &&
      style.showNames === preset.showNames &&
      style.animate === preset.animate
    ) {
      return id;
    }
  }
  return 'custom';
}

/**
 * URL の見た目が読めたときだけ url。それ以外は保存、無ければ既定。
 * 壊れた `s` は保存へ倒す（URL を固定したことにはしない）。
 * @param {{ queryParam?: unknown, stored?: unknown }} input
 * @returns {{ style: ObsOverlayStyle, source: 'url' | 'storage' | 'default' }}
 */
export function resolveObsOverlayStyle(input) {
  const token = String(input?.queryParam ?? '').trim();
  if (token) {
    const fromUrl = decodeObsOverlayStyle(token);
    if (fromUrl) return { style: fromUrl, source: 'url' };
  }
  const fromStore = parseObsOverlayStyle(input?.stored);
  if (fromStore) return { style: fromStore, source: 'storage' };
  return { style: defaultObsOverlayStyle(), source: 'default' };
}

/** @param {string} text */
function utf8ToBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** @param {string} token @returns {string | null} */
function base64UrlToUtf8(token) {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const pad = token.length % 4 === 0 ? '' : '='.repeat(4 - (token.length % 4));
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** @param {unknown} style @returns {string} */
export function encodeObsOverlayStyle(style) {
  return utf8ToBase64Url(JSON.stringify(toStorageRecord(style)));
}

/** @param {unknown} token @returns {ObsOverlayStyle | null} */
export function decodeObsOverlayStyle(token) {
  const raw = String(token ?? '').trim();
  if (!raw || raw.length > TOKEN_MAX) return null;
  const json = base64UrlToUtf8(raw);
  if (!json) return null;
  try {
    return parseObsOverlayStyle(JSON.parse(json));
  } catch {
    return null;
  }
}

/**
 * @param {unknown} watchUrl
 * @returns {string} lv が無ければ空
 */
export function liveIdFromWatchUrl(watchUrl) {
  const m = String(watchUrl ?? '').toLowerCase().match(/lv\d{1,15}/);
  return m ? m[0] : '';
}

/**
 * @param {{
 *   pageUrl?: unknown,
 *   liveId?: unknown,
 *   includeLiveId?: boolean,
 *   embedStyle?: boolean,
 *   style?: unknown
 * }} input
 * @returns {string}
 */
export function buildObsComeviewUrl(input) {
  let url;
  try {
    url = new URL(String(input?.pageUrl ?? ''));
  } catch {
    return '';
  }
  url.searchParams.set('obs', '1');
  url.searchParams.delete('lv');
  url.searchParams.delete(OBS_OVERLAY_QUERY_PARAM);
  const liveId = String(input?.liveId ?? '');
  if (input?.includeLiveId === true && /^lv\d{1,15}$/.test(liveId)) {
    url.searchParams.set('lv', liveId);
  }
  if (input?.embedStyle === true) {
    url.searchParams.set(OBS_OVERLAY_QUERY_PARAM, encodeObsOverlayStyle(input?.style));
  }
  return url.toString();
}

/** @param {string} hex */
function rgbOf(hex) {
  const h = hex.slice(1);
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16)
  };
}

/** @param {ObsOverlayStyle} style */
function cardShadow(style) {
  const { r, g, b } = rgbOf(style.cardColor);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum > 0.65 && style.cardOpacity >= 60) return '0 1px 0 rgb(255 255 255 / 65%)';
  return '0 1px 2px rgb(0 0 0 / 70%)';
}

/**
 * 利用者の文字列は色と数に直したあとだけ CSS へ入れる。
 * scope は呼び出し側の定数だけ（body.is-obs / #obsPreview.is-obs）。
 * @param {unknown} style
 * @param {string} [scope]
 * @returns {string}
 */
export function buildObsOverlayCss(style, scope) {
  const s = obsOverlayStyleOrDefault(style);
  const root = scope === '#obsPreview.is-obs' ? scope : 'body.is-obs';
  const { r, g, b } = rgbOf(s.cardColor);
  const alpha = (s.cardOpacity / 100).toFixed(2);
  const avatar = Math.max(22, Math.min(40, Math.round(s.fontSize * 1.6)));
  const shadow = cardShadow(s);
  return [
    `${root} .nl-tl-row,`,
    `${root} .nl-tl-gift {`,
    'display: flex;',
    'gap: 8px;',
    'align-items: flex-start;',
    `background: rgba(${r}, ${g}, ${b}, ${alpha});`,
    `color: ${s.textColor};`,
    'border: 0;',
    'border-radius: 10px;',
    'padding: 8px 10px;',
    'margin: 0 0 6px;',
    `font-size: ${s.fontSize}px;`,
    'line-height: 1.45;',
    `text-shadow: ${shadow};`,
    'text-decoration: none;',
    'animation: none;',
    '}',
    `${root} .nl-tl-row__avatar,`,
    `${root} .nl-tl-gift__avatar {`,
    `width: ${avatar}px;`,
    `height: ${avatar}px;`,
    'border-radius: 999px;',
    'object-fit: cover;',
    'flex: 0 0 auto;',
    'background: rgb(255 255 255 / 20%);',
    '}',
    `${root} .nl-tl-row__name,`,
    `${root} .nl-tl-gift__name {`,
    `color: ${s.nameColor};`,
    'font-weight: 700;',
    'flex: 0 1 auto;',
    'max-width: 40%;',
    'overflow: hidden;',
    'text-overflow: ellipsis;',
    'white-space: nowrap;',
    '}',
    `${root} .nl-tl-row__text,`,
    `${root} .nl-tl-gift__item {`,
    'min-width: 0;',
    'flex: 1 1 auto;',
    'white-space: pre-wrap;',
    'word-break: break-word;',
    '}',
    `${root} .nl-tl-gift__avatar-wrap {`,
    'position: relative;',
    'flex: 0 0 auto;',
    '}',
    `${root} .nl-tl-gift__badge {`,
    'position: absolute;',
    'right: -4px;',
    'bottom: -4px;',
    'font-size: 12px;',
    'line-height: 1;',
    '}',
    `${root}.obs-hide-icons .nl-tl-row__avatar,`,
    `${root}.obs-hide-icons .nl-tl-gift__avatar,`,
    `${root}.obs-hide-icons .nl-tl-gift__avatar-wrap,`,
    `${root}.obs-hide-icons .nl-tl-gift__icon,`,
    `${root}.obs-hide-icons .nl-tl-gift__badge { display: none; }`,
    `${root}.obs-hide-names .nl-tl-row__name,`,
    `${root}.obs-hide-names .nl-tl-gift__name { display: none; }`,
    `${root} .obs-row-hidden { display: none; }`,
    `${root} .cv-list { scroll-behavior: auto; }`,
    `${root} .nl-tl-row.cv-row-in,`,
    `${root} .nl-tl-gift.cv-row-in { animation: none; }`,
    `${root}.obs-animate .nl-tl-row.cv-row-in,`,
    `${root}.obs-animate .nl-tl-gift.cv-row-in { animation: obsRowIn 220ms ease-out; }`,
    '@keyframes obsRowIn {',
    'from { opacity: 0; transform: translateY(6px); }',
    'to { opacity: 1; transform: none; }',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    `${root}.obs-animate .nl-tl-row.cv-row-in,`,
    `${root}.obs-animate .nl-tl-gift.cv-row-in { animation: none; }`,
    '}'
  ].join('\n');
}

/**
 * 先頭側を隠す（新しい行を残す）。
 * @param {number} count
 * @param {number} maxLines
 * @returns {boolean[]}
 */
export function obsRowHiddenFlags(count, maxLines) {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const max = clampInt(maxLines, LINES_MIN, LINES_MAX, CLASSIC_FIELDS.maxLines);
  const hideBefore = Math.max(0, n - max);
  return Array.from({ length: n }, (_, i) => i < hideBefore);
}
