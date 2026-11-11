/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】読み上げ辞書・読み方の型・読まない人の正規化と、声を作る直前の適用
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし(キー名の定数は voiceKeys.js の KEY_VOICE_READING_SCRIPT)
 * 【正本宣言】読み上げ文へ辞書と型を当てる判断はここだけ
 *
 * voiceReadingScript.js — 利用者の読み上げ辞書と読み方の型。
 *
 * 会場とコメビュは、これまで名前と本文を「名前、本文」でつなぎ、ギフトは
 * 「ギフト、名前を贈りました。」にしていた。辞書も型も無いときは、その文と一字も変えない。
 * 辞書の置換は、設定が変わったときに一度だけ正規表現へ組む。コメントのたびに組み直さない。
 */

import { comeviewUserKeyForRow } from './comeviewActions.js';
import { normalizeVoiceReadingBody } from './voiceReadingNormalize.js';
import { shortenLongCommentForVoice } from './voiceLongCommentShorten.js';

/** 保存する形の版。フィールドを足すときはここを上げ、normalize で古い形を読む。 */
export const VOICE_READING_SCRIPT_SCHEMA = 1;

export const VOICE_READING_DICT_MAX = 300;
export const VOICE_READING_WORD_MAX = 40;
export const VOICE_READING_READING_MAX = 40;
export const VOICE_READING_TEMPLATE_MAX = 180;
export const VOICE_READING_EXCLUDE_MAX = 300;
export const VOICE_READING_IMPORT_MAX_CHARS = 200_000;

/** 何も保存していないときのコメントの型。名前が空なら先頭の読点は出さない。 */
export const DEFAULT_COMMENT_TEMPLATE = '{name}、{comment}';
/** 何も保存していないときのギフトの型。1個のときは {count} が空で「を贈りました」になる。 */
export const DEFAULT_GIFT_TEMPLATE = '{name}、ギフト、{gift}を{count}贈りました。{message}';

const PLACEHOLDERS = new Set(['name', 'comment', 'gift', 'count', 'message']);
const TEMPLATE_TOKEN_RE = /\{(name|comment|gift|count|message)\}/g;
const UNKNOWN_TOKEN_RE = /\{[a-zA-Z]+\}/g;

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function clipChars(value, max) {
  const chars = Array.from(String(value ?? ''));
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('');
}

/**
 * @param {unknown} maxChars
 * @returns {number}
 */
export function resolveVoiceMaxChars(maxChars) {
  const raw = Number(maxChars);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 60;
}

/**
 * @param {string} word
 * @returns {string}
 */
function escapeRegExp(word) {
  return word.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

/**
 * @param {unknown} raw
 * @param {string} fallback
 * @param {readonly string[] | null | undefined} required
 * @returns {string}
 */
function cleanTemplate(raw, fallback, required) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return fallback;
  s = s.replace(UNKNOWN_TOKEN_RE, (token) => (PLACEHOLDERS.has(token.slice(1, -1)) ? token : ''));
  s = clipChars(s, VOICE_READING_TEMPLATE_MAX).trim();
  if (!s) return fallback;
  if (required && !required.some((name) => s.includes(`{${name}}`))) return fallback;
  return s;
}

/**
 * 保存値・読み込み JSON・画面の入力を、同じ形へ揃える。壊れた部分は捨てて、型は既定へ戻す。
 * @param {unknown} raw
 * @returns {{
 *   schemaVersion: number,
 *   dictionary: { word: string, reading: string }[],
 *   commentTemplate: string,
 *   giftTemplate: string,
 *   exclude: { key: string, name: string, at: number }[]
 * }}
 */
export function normalizeVoiceReadingScript(raw) {
  const src = raw && typeof raw === 'object' ? /** @type {any} */ (raw) : {};
  /** @type {Map<string, string>} */
  const words = new Map();
  const dictRaw = Array.isArray(src.dictionary) ? src.dictionary : [];
  for (const row of dictRaw) {
    if (!row || typeof row !== 'object') continue;
    const word = clipChars(String(/** @type {any} */ (row).word ?? '').trim(), VOICE_READING_WORD_MAX).trim();
    if (!word) continue;
    const reading = clipChars(String(/** @type {any} */ (row).reading ?? '').trim(), VOICE_READING_READING_MAX);
    words.set(word, reading);
    if (words.size >= VOICE_READING_DICT_MAX) break;
  }
  /** @type {Map<string, { key: string, name: string, at: number }>} */
  const excluded = new Map();
  const exRaw = Array.isArray(src.exclude) ? src.exclude : [];
  for (const row of exRaw) {
    if (!row || typeof row !== 'object') continue;
    const key = clipChars(String(/** @type {any} */ (row).key ?? '').trim(), 80);
    if (!key.startsWith('u:') && !key.startsWith('n:')) continue;
    const name = clipChars(String(/** @type {any} */ (row).name ?? '').trim(), 40) || key.slice(2);
    const at = Number(/** @type {any} */ (row).at) || 0;
    excluded.set(key, { key, name, at });
    if (excluded.size >= VOICE_READING_EXCLUDE_MAX) break;
  }
  return {
    schemaVersion: VOICE_READING_SCRIPT_SCHEMA,
    dictionary: [...words.entries()].map(([word, reading]) => ({ word, reading })),
    commentTemplate: cleanTemplate(src.commentTemplate, DEFAULT_COMMENT_TEMPLATE, ['comment']),
    giftTemplate: cleanTemplate(src.giftTemplate, DEFAULT_GIFT_TEMPLATE, ['gift', 'message']),
    exclude: [...excluded.values()]
  };
}

/**
 * 辞書を1本の正規表現へ組む。返す関数は、呼ぶたびに正規表現を作り直さない。
 * 長い語を先に並べる(「8888」が「888」より先)。
 * @param {{ word: string, reading: string }[]} dictionary
 * @returns {{ apply: (text: string) => string, re: RegExp | null }}
 */
export function compileReadingDictionary(dictionary) {
  const entries = Array.isArray(dictionary) ? dictionary.filter((e) => e && e.word) : [];
  if (!entries.length) {
    return { apply: (text) => String(text ?? ''), re: null };
  }
  const sorted = entries
    .map((e, i) => ({ word: e.word, reading: String(e.reading ?? ''), i }))
    .sort((a, b) => b.word.length - a.word.length || a.i - b.i);
  const re = new RegExp(sorted.map((e) => escapeRegExp(e.word)).join('|'), 'g');
  const map = new Map(sorted.map((e) => [e.word, e.reading]));
  /** @param {string} text */
  const apply = (text) => {
    const s = String(text ?? '');
    if (!s) return '';
    re.lastIndex = 0;
    return s.replace(re, (hit) => (map.has(hit) ? /** @type {string} */ (map.get(hit)) : hit));
  };
  return { apply, re };
}

/**
 * @param {string} template
 * @returns {{ t: 'lit' | 'ph', v: string }[]}
 */
export function compileVoiceTemplate(template) {
  const src = String(template || '');
  /** @type {{ t: 'lit' | 'ph', v: string }[]} */
  const parts = [];
  const re = new RegExp(TEMPLATE_TOKEN_RE.source, 'g');
  let last = 0;
  let m = re.exec(src);
  while (m) {
    if (m.index > last) parts.push({ t: 'lit', v: src.slice(last, m.index) });
    parts.push({ t: 'ph', v: m[1] });
    last = m.index + m[0].length;
    m = re.exec(src);
  }
  if (last < src.length) parts.push({ t: 'lit', v: src.slice(last) });
  return parts;
}

/**
 * 空の {name} は、直後の「さん」や読点ごと省く。組んだ部品は書き換えない。
 * @param {readonly { t: 'lit' | 'ph', v: string }[]} parts
 * @param {Record<string, string>} vars
 * @returns {string}
 */
export function renderVoiceTemplate(parts, vars) {
  let out = '';
  let skipJoiner = false;
  for (const part of parts) {
    if (part.t === 'lit') {
      let lit = part.v;
      if (skipJoiner) {
        lit = lit.replace(/^(?:さん|様|ちゃん|くん)?[、,，\s]*/, '');
        skipJoiner = false;
      }
      out += lit;
      continue;
    }
    const val = String(vars[part.v] ?? '');
    if (!val && part.v === 'name') {
      out = out.replace(/[、,，\s]+$/, '');
      skipJoiner = true;
      continue;
    }
    skipJoiner = false;
    if (!val) continue;
    out += val;
  }
  return out
    .replace(/^[、,，\s]+/, '')
    .replace(/[、,，]{2,}/g, '、')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * @param {unknown} raw
 */
export function compileVoiceReadingScript(raw) {
  const script = normalizeVoiceReadingScript(raw);
  const dict = compileReadingDictionary(script.dictionary);
  return {
    ...script,
    applyDict: dict.apply,
    dictRe: dict.re,
    excludeKeys: new Set(script.exclude.map((e) => e.key)),
    commentParts: compileVoiceTemplate(script.commentTemplate),
    giftParts: compileVoiceTemplate(script.giftTemplate),
    commentIsDefault: script.commentTemplate === DEFAULT_COMMENT_TEMPLATE,
    giftIsDefault: script.giftTemplate === DEFAULT_GIFT_TEMPLATE
  };
}

/** 辞書も型も読まない人も無いときのコンパイル。コメントごとに作り直さない。 */
export const EMPTY_VOICE_READING_SCRIPT = compileVoiceReadingScript(null);

/**
 * @typedef {ReturnType<typeof compileVoiceReadingScript>} CompiledVoiceReadingScript
 */

/**
 * 声の文を組み立てる材料。コメントは text、ギフトは gift / count / message。
 * @typedef {{
 *   kind?: unknown,
 *   name?: unknown,
 *   text?: unknown,
 *   gift?: unknown,
 *   count?: unknown,
 *   message?: unknown
 * }} VoiceReadingParts
 */

/**
 * @param {unknown} script
 */
export function voiceReadingScriptToStorage(script) {
  const n = normalizeVoiceReadingScript(script);
  return {
    schemaVersion: n.schemaVersion,
    dictionary: n.dictionary,
    commentTemplate: n.commentTemplate,
    giftTemplate: n.giftTemplate,
    exclude: n.exclude
  };
}

/**
 * @param {unknown} script
 * @returns {string}
 */
export function serializeVoiceReadingScript(script) {
  return JSON.stringify(voiceReadingScriptToStorage(compileVoiceReadingScript(script)), null, 2);
}

/**
 * 1行を「単語」と「読み」に分ける。タブ、矢印、読点、カンマの順。
 * @param {string} line
 * @returns {[string, string] | null}
 */
function splitDictLine(line) {
  if (line.includes('\t')) {
    const [word, ...rest] = line.split('\t');
    return [word.trim(), rest.join('\t').trim()];
  }
  const arrow = line.split(/\s*(?:=>|=)\s*/);
  if (arrow.length >= 2 && arrow[0].trim()) return [arrow[0].trim(), arrow.slice(1).join('=').trim()];
  const comma = line.match(/^(.+?)[,、](.+)$/);
  if (comma) return [comma[1].trim(), comma[2].trim()];
  return null;
}

/**
 * JSON(版つき)か、1行1語の一覧を読む。
 * @param {unknown} text
 * @returns {{ ok: true, mode: 'document' | 'dictionary', script: ReturnType<typeof normalizeVoiceReadingScript> } | { ok: false, reason: 'empty' | 'too-big' | 'bad-json' | 'no-rows' }}
 */
export function parseVoiceReadingImport(text) {
  const raw = String(text ?? '');
  if (Array.from(raw).length > VOICE_READING_IMPORT_MAX_CHARS) return { ok: false, reason: 'too-big' };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json)) {
        const dictionary = json.map((row) => {
          if (Array.isArray(row)) return { word: row[0], reading: row[1] };
          if (row && typeof row === 'object') return { word: row.word ?? row.from, reading: row.reading ?? row.to };
          return null;
        }).filter(Boolean);
        const script = normalizeVoiceReadingScript({ dictionary });
        return script.dictionary.length ? { ok: true, mode: 'dictionary', script } : { ok: false, reason: 'no-rows' };
      }
      const script = normalizeVoiceReadingScript(json);
      const has =
        script.dictionary.length > 0 ||
        script.exclude.length > 0 ||
        script.commentTemplate !== DEFAULT_COMMENT_TEMPLATE ||
        script.giftTemplate !== DEFAULT_GIFT_TEMPLATE;
      return has ? { ok: true, mode: 'document', script } : { ok: false, reason: 'no-rows' };
    } catch {
      return { ok: false, reason: 'bad-json' };
    }
  }
  /** @type {{ word: string, reading: string }[]} */
  const dictionary = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#') || s.startsWith('//')) continue;
    const pair = splitDictLine(s);
    if (!pair || !pair[0]) continue;
    dictionary.push({ word: pair[0], reading: pair[1] });
  }
  const script = normalizeVoiceReadingScript({ dictionary });
  return script.dictionary.length ? { ok: true, mode: 'dictionary', script } : { ok: false, reason: 'no-rows' };
}

/**
 * 一覧だけの読み込みは今の型と読まない人を残す。JSON 全体は置き換える。
 * @param {unknown} current
 * @param {{ ok: true, mode: 'document' | 'dictionary', script: ReturnType<typeof normalizeVoiceReadingScript> }} parsed
 */
export function mergeVoiceReadingImport(current, parsed) {
  const base = normalizeVoiceReadingScript(current);
  if (!parsed || parsed.mode === 'document') return parsed.script;
  const map = new Map(base.dictionary.map((e) => [e.word, e.reading]));
  for (const row of parsed.script.dictionary) map.set(row.word, row.reading);
  return normalizeVoiceReadingScript({
    ...base,
    dictionary: [...map.entries()].map(([word, reading]) => ({ word, reading }))
  });
}

/**
 * 画面の入力欄から、読まない人を1件作る。ユーザーIDがあれば ID、無ければ表示名。
 * 汎用名(匿名など)は一人に絞れないので null。
 * @param {unknown} input
 * @param {number} [now]
 * @returns {{ key: string, name: string, at: number } | null}
 */
export function excludeEntryFromInput(input, now = 0) {
  const s = clipChars(String(input ?? '').trim(), 80).trim();
  if (!s) return null;
  const userId = s.startsWith('u:')
    ? s.slice(2)
    : (/^[0-9]+$/.test(s) || s.startsWith('a:') ? s : '');
  const name = userId ? '' : s;
  const key = comeviewUserKeyForRow({ userId, name });
  if (!key) return null;
  const label = key.startsWith('u:') ? key.slice(2) : s;
  return { key, name: clipChars(label, 40), at: Number(now) || 0 };
}

/**
 * @param {{ userId?: unknown, nickname?: unknown, name?: unknown } | null | undefined} item
 * @param {{ excludeKeys?: Set<string> } | null | undefined} script
 * @returns {boolean}
 */
export function isVoiceReadingExcluded(item, script) {
  const keys = script?.excludeKeys;
  if (!item || !(keys instanceof Set) || keys.size === 0) return false;
  const key = comeviewUserKeyForRow({
    userId: String(item.userId ?? ''),
    name: String(item.nickname ?? item.name ?? '')
  });
  return !!key && keys.has(key);
}

/**
 * キューに載せる名前と本文。本文の形は、辞書が無いときの従来の文と揃える(同じ文はまとまる)。
 * @param {{ kind?: unknown, nickname?: unknown, text?: unknown, gift?: { name?: unknown, count?: unknown, message?: unknown } } | null | undefined} item
 * @param {boolean} readNameEnabled
 */
export function buildVoiceQueueSpeech(item, readNameEnabled) {
  const name = readNameEnabled ? String(item?.nickname || '').trim() : '';
  if (item?.kind === 'gift') {
    const rawCount = Number(item.gift?.count);
    const many = Number.isFinite(rawCount) && rawCount > 1;
    const countPhrase = many ? `を${rawCount}個` : 'を';
    const gift = String(item.gift?.name || 'アイテム');
    const message = String(item.gift?.message || '');
    const body = `ギフト、${gift}${countPhrase}贈りました。${message}`.trim();
    return {
      name,
      body,
      reading: { kind: 'gift', name, gift: gift || 'アイテム', count: many ? rawCount : 1, message: message.trim() }
    };
  }
  const text = String(item?.text || '').trim();
  return {
    name,
    body: text,
    reading: { kind: 'comment', name, text }
  };
}

/**
 * @param {string} text
 * @param {(s: string) => string} applyDict
 * @param {number} limit
 * @returns {string}
 */
function prepareField(text, applyDict, limit) {
  const replaced = applyDict(String(text ?? ''));
  if (!replaced.trim()) return '';
  return shortenLongCommentForVoice(normalizeVoiceReadingBody(replaced), limit);
}

/**
 * 声に渡す1文。辞書は整え(笑いの w・拍手の 8)より先。型が既定のときは従来の連結のまま。
 * @param {{ kind?: unknown, name?: unknown, text?: unknown, gift?: unknown, count?: unknown, message?: unknown } | null | undefined} reading
 * @param {{ maxChars?: unknown, script?: ReturnType<typeof compileVoiceReadingScript> | null }} [opts]
 * @returns {string}
 */
export function composeVoiceReading(reading, opts = {}) {
  const script = opts.script || EMPTY_VOICE_READING_SCRIPT;
  const applyDict = typeof script.applyDict === 'function'
    ? script.applyDict
    : /** @param {string} s */ (s) => String(s ?? '');
  const limit = resolveVoiceMaxChars(opts.maxChars);
  const name = normalizeVoiceReadingBody(applyDict(String(reading?.name || '').trim()));

  if (reading?.kind === 'gift') {
    const giftRaw = String(reading.gift || 'アイテム');
    const messageRaw = String(reading.message || '');
    const rawCount = Number(reading.count);
    const many = Number.isFinite(rawCount) && rawCount > 1;
    if (script.giftIsDefault !== false && (!script.giftTemplate || script.giftTemplate === DEFAULT_GIFT_TEMPLATE)) {
      const countPhrase = many ? `を${rawCount}個` : 'を';
      const assembled = `ギフト、${applyDict(giftRaw) || 'アイテム'}${countPhrase}贈りました。${applyDict(messageRaw)}`.trim();
      const body = shortenLongCommentForVoice(normalizeVoiceReadingBody(assembled), limit);
      if (!body) return '';
      return name ? `${name}、${body}` : body;
    }
    const gift = prepareField(giftRaw, applyDict, limit) || 'アイテム';
    const message = prepareField(messageRaw, applyDict, limit);
    const count = many ? `${rawCount}個` : '';
    const line = renderVoiceTemplate(script.giftParts || compileVoiceTemplate(script.giftTemplate || DEFAULT_GIFT_TEMPLATE), {
      name,
      comment: '',
      gift,
      count,
      message
    });
    return /[\p{L}\p{N}]/u.test(line) ? line : '';
  }

  const rawText = applyDict(String(reading?.text || '').trim());
  if (!rawText.trim()) return '';
  const body = shortenLongCommentForVoice(normalizeVoiceReadingBody(rawText), limit);
  if (!body) return '';
  if (script.commentIsDefault !== false && (!script.commentTemplate || script.commentTemplate === DEFAULT_COMMENT_TEMPLATE)) {
    return name ? `${name}、${body}` : body;
  }
  const line = renderVoiceTemplate(script.commentParts || compileVoiceTemplate(script.commentTemplate || DEFAULT_COMMENT_TEMPLATE), {
    name,
    comment: body,
    gift: '',
    count: '',
    message: ''
  });
  return /[\p{L}\p{N}]/u.test(line) ? line : '';
}
