/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】コメント翻訳の設定・訳すか止めるかの判定・原文の切り詰め
 * 【この箱に入らないもの】Translator API の呼び出し / fetch / storage / DOM
 * 【書けるstorageキー】なし（キー名の定数だけ。読み書きは comeview）
 * 【正本宣言】自動翻訳は既定オフ。モデルが未準備のあいだは自動では訳さない
 *
 * commentTranslate.js — コメントを1行ずつ訳すかどうかの判断。
 * 外の翻訳サービスへは送らない。実際の翻訳は Chrome の Translator があるときだけ
 * src/extension/commentTranslateHost.js が行う。
 */

/** 自動翻訳スイッチの storage キー。 */
export const COMMENT_TRANSLATE_KEY = 'nls_comment_translate_v1';

/** 設定の形の版。上げるときは古い版も読めるように残す。 */
export const COMMENT_TRANSLATE_FORMAT = 1;

/** 1件の上限。長い文をまとめて訳すと弱いPCの負荷が上がる。 */
export const TRANSLATE_TEXT_MAX = 400;

const LANGS = new Set(['ja', 'en', 'ko', 'zh']);

/**
 * @param {unknown} raw
 * @returns {{ formatVersion: number, auto: boolean, targetLanguage: string }}
 */
export function normalizeCommentTranslateSettings(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const target = String(/** @type {{ targetLanguage?: unknown }} */ (src).targetLanguage || 'ja')
    .trim()
    .toLowerCase();
  return {
    formatVersion: COMMENT_TRANSLATE_FORMAT,
    auto: /** @type {{ auto?: unknown }} */ (src).auto === true,
    targetLanguage: LANGS.has(target) ? target : 'ja'
  };
}

/**
 * 空白を畳み、上限で切る。空なら空文字。
 * @param {unknown} text
 * @returns {string}
 */
export function clipTranslateInput(text) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > TRANSLATE_TEXT_MAX ? t.slice(0, TRANSLATE_TEXT_MAX) : t;
}

/**
 * 文字種だけ見る軽い判定。漢字だけは日本語か中国語か分からないので cjk。
 * @param {unknown} text
 * @returns {'ja'|'en'|'ko'|'cjk'|'unknown'}
 */
export function detectScriptLanguage(text) {
  const s = String(text == null ? '' : text);
  let hira = 0;
  let kata = 0;
  let hang = 0;
  let cjk = 0;
  let lat = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) || 0;
    if (c >= 0x3040 && c <= 0x309f) hira += 1;
    else if (c >= 0x30a0 && c <= 0x30ff) kata += 1;
    else if (c >= 0xac00 && c <= 0xd7af) hang += 1;
    else if (c >= 0x4e00 && c <= 0x9fff) cjk += 1;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) lat += 1;
  }
  if (hira + kata > 0) return 'ja';
  if (hang > 0) return 'ko';
  if (lat >= 3 && lat > cjk) return 'en';
  if (cjk > 0) return 'cjk';
  return 'unknown';
}

/**
 * @param {string} script
 * @param {string} detected
 * @param {string} target
 * @param {'manual'|'auto'} mode
 * @returns {string} 言語コード、'same'、または ''（分からない）
 */
function pickSource(script, detected, target, mode) {
  if (LANGS.has(detected)) return detected === target ? 'same' : detected;
  if (script === 'ja' || script === 'en' || script === 'ko') {
    return script === target ? 'same' : script;
  }
  if (script === 'cjk') {
    if (target === 'ja') return 'same';
    return mode === 'manual' ? 'zh' : '';
  }
  return '';
}

/**
 * 1件を訳すか止めるか。自動はモデルが既にあるときだけ。ダウンロードは始めない。
 *
 * @param {{
 *   text?: unknown,
 *   settings?: unknown,
 *   mode?: 'manual'|'auto',
 *   availability?: unknown,
 *   detectedLanguage?: unknown,
 *   busy?: boolean
 * }} input
 * @returns {{
 *   go: boolean,
 *   reason: string,
 *   text: string,
 *   sourceLanguage: string,
 *   targetLanguage: string
 * }}
 */
export function planCommentTranslate(input) {
  const src = input && typeof input === 'object' ? input : {};
  const mode = src.mode === 'auto' ? 'auto' : 'manual';
  const cfg = normalizeCommentTranslateSettings(src.settings);
  const text = clipTranslateInput(src.text);
  const empty = {
    go: false,
    reason: 'empty',
    text: '',
    sourceLanguage: '',
    targetLanguage: cfg.targetLanguage
  };
  if (!text) return empty;
  if (mode === 'auto' && !cfg.auto) {
    return { ...empty, reason: 'auto-off', text };
  }
  if (src.busy === true) return { ...empty, reason: 'busy', text };
  const detected = String(src.detectedLanguage || '').trim().toLowerCase();
  const source = pickSource(detectScriptLanguage(text), detected, cfg.targetLanguage, mode);
  if (source === 'same') return { ...empty, reason: 'already-target', text };
  if (!source) return { ...empty, reason: 'unknown-language', text };
  const availability = String(src.availability || '');
  if (availability !== 'available') {
    return {
      ...empty,
      reason: mode === 'auto' || availability === 'unavailable' || !availability
        ? (availability === 'downloadable' || availability === 'downloading'
          ? (mode === 'auto' ? 'model-not-ready' : 'needs-download')
          : 'unavailable')
        : 'needs-download',
      text,
      sourceLanguage: source
    };
  }
  return {
    go: true,
    reason: 'ready',
    text,
    sourceLanguage: source,
    targetLanguage: cfg.targetLanguage
  };
}

/**
 * 画面に足す訳文。空や原文と同じなら出さない。
 * @param {unknown} translated
 * @param {unknown} original
 * @returns {string}
 */
export function translationLine(translated, original) {
  const line = String(translated == null ? '' : translated).replace(/\s+/g, ' ').trim();
  if (!line) return '';
  const orig = String(original == null ? '' : original).replace(/\s+/g, ' ').trim();
  if (line === orig) return '';
  return line.slice(0, TRANSLATE_TEXT_MAX);
}
