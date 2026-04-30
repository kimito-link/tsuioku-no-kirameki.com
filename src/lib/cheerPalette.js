/**
 * 盛り上げワード（8888 / wwwww / 顔文字 等）のワンクリック挿入パレット。
 *
 * 設計（0.1.12 C: UIUX 阻害ゼロを目標）:
 *   ・ニコ生コメントは 250 字単一行スクロール表示なので、複数行 AA は効果が薄い。
 *     1 行で映える 8888 / wwwww / 拍手系 / 顔文字 / 簡単な絵文字に限定する。
 *   ・popup の compose 領域は元から狭く、視聴中は textarea を最優先にしたい。
 *     既存レイアウトを変えないため、textarea の右上に 22×22 の小さい toggle
 *     ボタンを絶対配置し、押されたときだけ chip ポップオーバーを下にドロップ。
 *   ・最近使った 5 件は chrome.storage.local（KEY_CHEER_RECENT_V1）に保存して
 *     先頭に並び替える（よく押すワードが上に来る学習動作）。
 *
 * 本ファイルは DOM/storage には依存しない純粋関数群（vitest 単体検証用）。
 * 実際の wire-up は popup-entry.js が担当。
 */

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   text: string,
 *   category: 'applause' | 'laugh' | 'kaomoji' | 'cheer' | 'thanks' | 'emoji'
 * }} CheerPreset
 */

/**
 * 既定プリセット 12 個。
 *
 * 選定基準:
 *   - 1 行で映え、ニコ生で実際に頻出するパターン（運営公認の暗黙文化を尊重）。
 *   - 子ども・初見視聴者でも趣旨が分かる無難なもの。
 *   - 政治・宗教・差別を連想させる文字列は除外。
 *   - 顔文字は AA に近いが、半角カナ＋括弧の範囲で 250 字内に収めやすいものに絞る。
 *
 * label は popup UI（chip 表示）で見せる短いラベル。text は実際に textarea へ
 * 挿入する文字列。多くの場合 label === text で良いが、長すぎる kaomoji の
 * label を簡略化したいので別フィールドにしている。
 *
 * @type {readonly CheerPreset[]}
 */
const DEFAULT_CHEER_PRESETS = Object.freeze([
  Object.freeze({ key: 'p_8888', label: '8888', text: '8888', category: 'applause' }),
  Object.freeze({
    key: 'p_pachipachi',
    label: 'パチパチ',
    text: 'パチパチ',
    category: 'applause'
  }),
  Object.freeze({
    key: 'p_clap_emoji',
    label: '👏',
    text: '👏👏👏',
    category: 'applause'
  }),
  Object.freeze({
    key: 'p_party',
    label: '🎉',
    text: '🎉🎉🎉',
    category: 'applause'
  }),
  Object.freeze({ key: 'p_wwww', label: 'wwww', text: 'wwww', category: 'laugh' }),
  Object.freeze({ key: 'p_kusa', label: '草', text: '草', category: 'laugh' }),
  Object.freeze({
    key: 'p_smile',
    label: '(*^▽^*)',
    text: '(*^▽^*)',
    category: 'kaomoji'
  }),
  Object.freeze({
    key: 'p_excited',
    label: '(/・ω・)/',
    text: '(/・ω・)/',
    category: 'kaomoji'
  }),
  Object.freeze({
    key: 'p_kita',
    label: 'ｷﾀ━(ﾟ∀ﾟ)━!',
    text: 'ｷﾀ━(ﾟ∀ﾟ)━!',
    category: 'cheer'
  }),
  Object.freeze({
    key: 'p_sugoi',
    label: 'すごい！',
    text: 'すごい！',
    category: 'cheer'
  }),
  Object.freeze({
    key: 'p_nice',
    label: 'ナイス！',
    text: 'ナイス！',
    category: 'cheer'
  }),
  Object.freeze({
    key: 'p_otsu',
    label: '乙でした',
    text: '乙でした',
    category: 'thanks'
  })
]);

/** @returns {readonly CheerPreset[]} */
export function getDefaultCheerPresets() {
  return DEFAULT_CHEER_PRESETS;
}

/**
 * @param {unknown} key
 * @returns {CheerPreset | null}
 */
export function findCheerPresetByKey(key) {
  if (typeof key !== 'string' || !key) return null;
  return DEFAULT_CHEER_PRESETS.find((p) => p.key === key) || null;
}

/**
 * textarea のカーソル位置（または選択範囲）に text を挿入する。
 * 250 字を超える場合は no-op。挿入後は input イベントを発火（送信ボタンの
 * 有効化や文字数カウンタなどの既存ハンドラに連動させるため）。
 *
 * @param {HTMLTextAreaElement | null | undefined} ta
 * @param {string} text
 * @param {{ maxLength: number }} opts
 * @returns {{ ok: boolean, reason?: string, newLength?: number }}
 */
export function insertCommentTextAtCursor(ta, text, opts) {
  if (!ta || typeof ta.value !== 'string') {
    return { ok: false, reason: 'no_textarea' };
  }
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, reason: 'empty_text' };
  }
  const max = Number.isFinite(opts?.maxLength) ? Number(opts.maxLength) : 250;
  const before = ta.value;
  const start = Number.isFinite(ta.selectionStart) ? Number(ta.selectionStart) : before.length;
  const end = Number.isFinite(ta.selectionEnd) ? Number(ta.selectionEnd) : before.length;
  const safeStart = Math.max(0, Math.min(start, before.length));
  const safeEnd = Math.max(safeStart, Math.min(end, before.length));
  const next =
    before.slice(0, safeStart) + text + before.slice(safeEnd);
  if (next.length > max) {
    return { ok: false, reason: 'exceeds_max_length' };
  }
  ta.value = next;
  const cursor = safeStart + text.length;
  try {
    ta.setSelectionRange(cursor, cursor);
  } catch {
    // jsdom や一部 UA で setSelectionRange が例外になるが致命ではない
  }
  try {
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  } catch {
    // dispatchEvent が無い環境はあり得ないが念のため
  }
  return { ok: true, newLength: next.length };
}

/**
 * 最近使った key 順に並び替える。元配列は mutate しない。
 *
 * @param {readonly CheerPreset[]} presets
 * @param {readonly string[]} recent  先頭ほど新しい
 * @returns {CheerPreset[]}
 */
export function rankCheerPresetsByRecent(presets, recent) {
  const out = [];
  const taken = new Set();
  for (const k of recent) {
    const found = presets.find((p) => p.key === k);
    if (found && !taken.has(found.key)) {
      out.push(found);
      taken.add(found.key);
    }
  }
  for (const p of presets) {
    if (!taken.has(p.key)) {
      out.push(p);
      taken.add(p.key);
    }
  }
  return out;
}

/**
 * recent 配列に key を「先頭に」push（重複排除 + 上限カット）。
 * @param {readonly string[]} recent
 * @param {string} key
 * @param {{ max: number }} opts
 * @returns {string[]}
 */
export function pushRecentCheerKey(recent, key, opts) {
  if (typeof key !== 'string' || !key) {
    return Array.isArray(recent) ? [...recent] : [];
  }
  const max = Number.isFinite(opts?.max) ? Number(opts.max) : 5;
  const dedup = [key, ...(Array.isArray(recent) ? recent : []).filter((k) => k !== key)];
  return dedup.slice(0, Math.max(1, max));
}

/**
 * 不正な保存値（手動編集・別バージョン由来など）をそのまま使うと UI 表示が
 * 崩れるので、文字列要素のみ・重複なし・上限内に正規化して返す。
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeRecentCheerKeys(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const v of raw) {
    if (typeof v !== 'string' || !v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= 20) break;
  }
  return out;
}
