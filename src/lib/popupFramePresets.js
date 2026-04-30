/**
 * popup の配色プリセット（フレーム）管理。
 *
 * プリセットデータ（`FRAME_PRESETS` / `LEGACY_FRAME_ALIAS` /
 * `DEFAULT_CUSTOM_FRAME`）と、それらを検索・正規化・解決する純粋関数を提供。
 *
 * chrome.storage や DOM には依存しないので vitest で単体検証可能。
 * popup-entry.js の `applyPopupFrame` などコールサイト側から import して使う。
 */

/** @type {'light'} */
export const DEFAULT_FRAME_ID = 'light';

/** 旧バージョンのプリセット ID（廃止済みの別名）を現行 ID に引き直す表 */
export const LEGACY_FRAME_ALIAS = Object.freeze({
  trio: 'light',
  link: 'light',
  konta: 'sunset',
  tanunee: 'midnight'
});

/**
 * 各プリセットの CSS カスタムプロパティ定義。
 * `--nl-*` 変数をそのまま `document.documentElement.style.setProperty` で適用する前提。
 */
/**
 * すべてのプリセットが必ず持つべき CSS 変数キーの正本。
 *
 * 経緯（A1 親バグ）:
 *   標準 popup.html では `html.nl-skin-panel-dark` クラス配下のセレクタが
 *   ダーク向け色（`#1a2330`、`#cbd5e1`、`#5eead4` 等）をハードコードしていた。
 *   一方 `applyPopupFrame()` は inline style で「プリセットの vars」を `<html>` に
 *   書き込む（inline は CSS rule に勝つ）。
 *
 *   light / sunset プリセットには `--nl-text-sub` / `--nl-rank-count` などのキーが
 *   無かったため、`html.nl-skin-panel-dark { --nl-text-sub: #cbd5e1 }` という
 *   CSS rule の dark 値が light フレーム選択時にも残り、白背景上で薄水色の id が
 *   読めなくなる症状が出ていた（toolbar standalone は INLINE_MODE=false で常に
 *   `nl-skin-panel-dark` が付く）。
 *
 *   解決:
 *     ・プリセット 4 種すべてに同じキー集合（KNOWN_FRAME_VARS）を持たせる
 *     ・`applyPopupFrame` でプリセット切替時に既知キーを一括 removeProperty してから
 *       新プリセットを書き込む（前プリセットの inline 残留を防ぐ）
 *     ・popup.html 側の dark スキンルールも `var(--nl-stat-card-bg-start)` 等の
 *       変数経由に置き換える
 */
export const KNOWN_FRAME_VARS = Object.freeze([
  '--nl-bg',
  '--nl-bg-soft',
  '--nl-surface',
  '--nl-text',
  '--nl-text-sub',
  '--nl-muted',
  '--nl-border',
  '--nl-accent',
  '--nl-accent-hover',
  '--nl-header-start',
  '--nl-header-end',
  '--nl-frame-outline',
  '--nl-rank-count',
  '--nl-stat-card-bg-start',
  '--nl-stat-card-bg-end',
  '--nl-stat-card-border',
  '--nl-stat-card-shadow',
  '--nl-placeholder'
]);

export const FRAME_PRESETS = Object.freeze({
  light: Object.freeze({
    label: 'ライト',
    vars: Object.freeze({
      '--nl-bg': '#fffaf2',
      '--nl-bg-soft': '#eef8ff',
      '--nl-surface': '#ffffff',
      '--nl-text': '#1f2937',
      // light 背景上で WCAG AA を満たす補助テキスト色。:root のデフォルト
      // (#4b5563) と同値だが inline で固定して、CSS rule 経由の dark 値
      // (`html.nl-skin-panel-dark { --nl-text-sub: #cbd5e1 }`) が toolbar
      // standalone（nl-skin-panel-dark あり）でも上書きされないようにする。
      '--nl-text-sub': '#4b5563',
      '--nl-muted': '#5b6475',
      '--nl-border': '#d5e3f5',
      '--nl-accent': '#0f8fd8',
      '--nl-accent-hover': '#0b73ad',
      '--nl-header-start': '#0f8fd8',
      '--nl-header-end': '#14b8a6',
      '--nl-frame-outline': 'rgb(255 255 255 / 22%)',
      // ランクの「件」数字。dark 側で teal を明るくする A8 修正の light 側固定。
      '--nl-rank-count': '#0f766e',
      // stat card の背景・枠・影。light フレームでは light tint なグラデ。
      '--nl-stat-card-bg-start': '#ffffff',
      '--nl-stat-card-bg-end': '#eef6ff',
      '--nl-stat-card-border': '#d5e3f5',
      '--nl-stat-card-shadow': '0 2px 6px rgb(2 17 31 / 10%)',
      // textarea / input の placeholder 色。light 背景上での視認性確保。
      '--nl-placeholder': '#6b7280'
    })
  }),
  dark: Object.freeze({
    label: 'ダーク',
    vars: Object.freeze({
      '--nl-bg': '#0b1220',
      '--nl-bg-soft': '#111827',
      '--nl-surface': '#0f172a',
      '--nl-text': '#e5e7eb',
      // ダーク背景上で WCAG AA を満たす補助テキスト色。
      '--nl-text-sub': '#cbd5e1',
      '--nl-muted': '#94a3b8',
      '--nl-border': '#243244',
      '--nl-accent': '#60a5fa',
      '--nl-accent-hover': '#3b82f6',
      '--nl-header-start': '#1e293b',
      '--nl-header-end': '#334155',
      '--nl-frame-outline': 'rgb(255 255 255 / 18%)',
      '--nl-rank-count': '#5eead4',
      '--nl-stat-card-bg-start': '#1a2330',
      '--nl-stat-card-bg-end': '#141b24',
      '--nl-stat-card-border': 'rgb(100 116 139 / 32%)',
      '--nl-stat-card-shadow': '0 4px 16px rgb(0 0 0 / 38%)',
      // dark 背景上で読める明るめの placeholder。
      '--nl-placeholder': '#94a3b8'
    })
  }),
  midnight: Object.freeze({
    label: 'ミッドナイト',
    vars: Object.freeze({
      '--nl-bg': '#0b1022',
      '--nl-bg-soft': '#1b1f3a',
      '--nl-surface': '#10182f',
      '--nl-text': '#e2e8f0',
      '--nl-text-sub': '#cbd5e1',
      '--nl-muted': '#9fb1ca',
      '--nl-border': '#2a3761',
      '--nl-accent': '#7dd3fc',
      '--nl-accent-hover': '#38bdf8',
      '--nl-header-start': '#1e1b4b',
      '--nl-header-end': '#1d4ed8',
      '--nl-frame-outline': 'rgb(255 255 255 / 22%)',
      '--nl-rank-count': '#5eead4',
      '--nl-stat-card-bg-start': '#1b2444',
      '--nl-stat-card-bg-end': '#141a32',
      '--nl-stat-card-border': 'rgb(100 116 139 / 32%)',
      '--nl-stat-card-shadow': '0 4px 16px rgb(0 0 0 / 42%)',
      '--nl-placeholder': '#9fb1ca'
    })
  }),
  sunset: Object.freeze({
    label: 'サンセット',
    vars: Object.freeze({
      '--nl-bg': '#fff7ed',
      '--nl-bg-soft': '#ffedd5',
      '--nl-surface': '#fffbf6',
      '--nl-text': '#1f2937',
      '--nl-text-sub': '#7c3a16',
      '--nl-muted': '#6b7280',
      '--nl-border': '#f5d0b5',
      '--nl-accent': '#ea580c',
      '--nl-accent-hover': '#c2410c',
      '--nl-header-start': '#fb923c',
      '--nl-header-end': '#f43f5e',
      '--nl-frame-outline': 'rgb(255 255 255 / 30%)',
      '--nl-rank-count': '#9a3412',
      '--nl-stat-card-bg-start': '#fffbf6',
      '--nl-stat-card-bg-end': '#ffedd5',
      '--nl-stat-card-border': '#f5d0b5',
      '--nl-stat-card-shadow': '0 2px 6px rgb(120 53 15 / 10%)',
      '--nl-placeholder': '#92614a'
    })
  })
});

/** カスタムフレームの 3 色初期値（ライトの雰囲気） */
export const DEFAULT_CUSTOM_FRAME = Object.freeze({
  headerStart: '#0f8fd8',
  headerEnd: '#14b8a6',
  accent: '#0f8fd8'
});

/**
 * 指定 ID が現行プリセットに存在するか。
 * @param {string} id
 * @returns {boolean}
 */
export function hasFramePreset(id) {
  return Object.prototype.hasOwnProperty.call(FRAME_PRESETS, id);
}

/**
 * 外部から受け取った任意値をプリセット ID 相当に正規化する。
 * 大小文字揺れ・旧別名を吸収し、知らない ID は引数のまま返す（呼び出し側で
 * `hasFramePreset` で再検証することを想定）。
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeFrameId(raw) {
  const id = String(raw || '')
    .trim()
    .toLowerCase();
  if (!id) return '';
  return (
    LEGACY_FRAME_ALIAS[/** @type {keyof typeof LEGACY_FRAME_ALIAS} */ (id)] || id
  );
}

/**
 * @param {string} id
 * @returns {{label: string, vars: Record<string, string>} | null}
 */
export function getFramePreset(id) {
  return hasFramePreset(id)
    ? FRAME_PRESETS[/** @type {keyof typeof FRAME_PRESETS} */ (id)]
    : null;
}

/**
 * UI に出すプリセット名。`custom` 特別扱い、未知 ID はデフォルトのラベル。
 * @param {string} frameId
 * @returns {string}
 */
export function frameLabel(frameId) {
  return frameId === 'custom'
    ? 'カスタム'
    : getFramePreset(frameId)?.label || FRAME_PRESETS[DEFAULT_FRAME_ID].label;
}

/**
 * `#rrggbb` 形式の 6 桁 hex カラーに正規化。フォーマット違反なら fallback を返す。
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
export function normalizeHexColor(value, fallback) {
  const s = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : fallback;
}

/**
 * hex 色を一定割合暗くする（`--nl-accent-hover` の自動生成に使う）。
 * @param {string} hex
 * @param {number} ratio 0〜1
 * @returns {string}
 */
export function darkenHexColor(hex, ratio) {
  const source = normalizeHexColor(hex, '#0f8fd8').slice(1);
  const clamp = (/** @type {number} */ v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(parseInt(source.slice(0, 2), 16) * (1 - ratio));
  const g = clamp(parseInt(source.slice(2, 4), 16) * (1 - ratio));
  const b = clamp(parseInt(source.slice(4, 6), 16) * (1 - ratio));
  return `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * カスタムフレームの 3 色を常に有効な hex に整形。
 * @param {unknown} raw
 * @returns {{headerStart: string, headerEnd: string, accent: string}}
 */
export function sanitizeCustomFrame(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    headerStart: normalizeHexColor(
      /** @type {{ headerStart?: unknown }} */ (source).headerStart,
      DEFAULT_CUSTOM_FRAME.headerStart
    ),
    headerEnd: normalizeHexColor(
      /** @type {{ headerEnd?: unknown }} */ (source).headerEnd,
      DEFAULT_CUSTOM_FRAME.headerEnd
    ),
    accent: normalizeHexColor(
      /** @type {{ accent?: unknown }} */ (source).accent,
      DEFAULT_CUSTOM_FRAME.accent
    )
  };
}

/**
 * 指定フレームに対応する CSS 変数マップを返す。
 * custom は `sanitizeCustomFrame` を通した 3 色を light 基調に合成する。
 * @param {string} frameId
 * @param {{headerStart: string, headerEnd: string, accent: string}} custom
 * @returns {Record<string, string>}
 */
export function resolveFrameVars(frameId, custom) {
  if (frameId !== 'custom') {
    return /** @type {Record<string, string>} */ (
      getFramePreset(frameId)?.vars || FRAME_PRESETS[DEFAULT_FRAME_ID].vars
    );
  }
  const safe = sanitizeCustomFrame(custom);
  return {
    '--nl-bg': '#f7fbff',
    '--nl-bg-soft': '#e8f4ff',
    '--nl-surface': '#ffffff',
    '--nl-text': '#1f2937',
    '--nl-text-sub': '#4b5563',
    '--nl-muted': '#5b6475',
    '--nl-border': '#cfe0f4',
    '--nl-accent': safe.accent,
    '--nl-accent-hover': darkenHexColor(safe.accent, 0.2),
    '--nl-header-start': safe.headerStart,
    '--nl-header-end': safe.headerEnd,
    '--nl-frame-outline': 'rgb(255 255 255 / 28%)',
    '--nl-rank-count': '#0f766e',
    '--nl-stat-card-bg-start': '#ffffff',
    '--nl-stat-card-bg-end': '#e8f4ff',
    '--nl-stat-card-border': '#cfe0f4',
    '--nl-stat-card-shadow': '0 2px 6px rgb(2 17 31 / 10%)',
    '--nl-placeholder': '#6b7280'
  };
}
