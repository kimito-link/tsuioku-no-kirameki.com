/**
 * Twitch・Kick のチャットの絵文字(エモート)を、画面で画像として出すための部品(純粋関数)。
 *
 * 記録の本文は今までどおり絵文字の名前(Kappa・KEKW)のまま持つ(検索・マーケHTML はそのまま)。
 * 吹き出しと読み上げだけ、URL があるときは画像にし、絵文字だけのコードは出さない・読まない。
 * 名前 → 画像の URL の対応だけを配信のサービスごとに覚えておき、画面の本文で名前と同じ語を画像に見せる。
 *
 * - Twitch: IRC の emotes タグ「25:0-4,12-16/1902:6-10」。位置はまず文字、名前にならなければ UTF-8 のバイト。
 *   最初の範囲が壊れても、後ろの範囲の id は捨てない。GQL の fragment は emote.emoteID を本文側で付ける。
 *   画像は static-cdn.jtvnw.net/emoticons/v2/<id>/default/dark/2.0（1.0 と同じ置き場の 2 倍サイズ）
 * - Kick: 本文の [emote:123:KEKW] と、横に付く emotes 配列の emote_id → files.kick.com/emotes/<id>/fullsize
 *   （thumbnail は 403・2026-11-08 実測）。id が数字なら、名前の形に関係なくこの URL を作る。
 *
 * 印から来た語は、画像が無いときに文字へ戻さない。外部の形が変わっても、読めない所だけ捨てる(§3.6)。
 */

/** 画像にする名前(英数字と _ と - 。2〜64字)。「:)」のような記号は普通の文字と見分けにくいので画像にしない */
const NAME_RE = /^[A-Za-z0-9_-]{2,64}$/;
const TW_ID_RE = /^[A-Za-z0-9_]{1,80}$/;
const KICK_ID_RE = /^\d{1,20}$/;

/** 1つの配信のサービスで覚えておく絵文字の上限(古いものから捨てる) */
export const EMOTE_DICT_MAX = 600;

/**
 * 会場が、記録に残った名前を画像へ戻すときに読む storage のキー。
 * streamPlatform.js の emotesKey と揃える（増えたらテストが止める）。
 */
export const REMEMBERED_EMOTE_KEYS = Object.freeze(['yt_tw_emotes', 'yt_kk_emotes']);

/**
 * storage から読んだ絵文字を、名前 → URL の1枚に畳む。危ない URL は入れない。
 * @param {Record<string, Record<string, string>>} byKey キーごとの控え（この関数が書き換える）
 * @param {unknown} bag 今回届いたキーだけ
 * @returns {Record<string, string>}
 */
export function rememberedEmoteDict(byKey, bag) {
  if (bag && typeof bag === 'object') {
    const src = /** @type {Record<string, unknown>} */ (bag);
    for (const key of REMEMBERED_EMOTE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
      const raw = src[key];
      /** @type {Record<string, string>} */
      const names = {};
      if (raw && typeof raw === 'object') {
        for (const [name, url] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
          if (isEmoteName(name) && isSafeEmoteUrl(url)) names[name] = String(url);
        }
      }
      byKey[key] = names;
    }
  }
  /** @type {Record<string, string>} */
  const next = {};
  for (const key of REMEMBERED_EMOTE_KEYS) Object.assign(next, byKey[key] || {});
  return next;
}

/**
 * storage.onChanged から、絵文字のキーだけを取り出す。無ければ null。
 * @param {unknown} changes
 * @returns {Record<string, unknown> | null}
 */
export function rememberedEmoteChanges(changes) {
  if (!changes || typeof changes !== 'object') return null;
  const src = /** @type {Record<string, { newValue?: unknown }>} */ (changes);
  /** @type {Record<string, unknown>} */
  const bag = {};
  let hit = false;
  for (const key of REMEMBERED_EMOTE_KEYS) {
    if (!src[key]) continue;
    bag[key] = src[key].newValue;
    hit = true;
  }
  return hit ? bag : null;
}

/** @param {unknown} name */
export function isEmoteName(name) {
  return NAME_RE.test(String(name ?? ''));
}

/** @param {string} id */
export function twEmoteUrl(id) {
  return TW_ID_RE.test(id) ? `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0` : '';
}

/** @param {string} id */
export function kickEmoteUrl(id) {
  return KICK_ID_RE.test(id) ? `https://files.kick.com/emotes/${id}/fullsize` : '';
}

/** 画面に出してよい絵文字の画像の URL か(この2つの置き場所の形だけ通す) @param {unknown} url */
export function isSafeEmoteUrl(url) {
  const s = String(url ?? '');
  return (
    /^https:\/\/static-cdn\.jtvnw\.net\/emoticons\/v2\/[A-Za-z0-9_]{1,80}\/default\/dark\/[123]\.0$/.test(s) ||
    /^https:\/\/files\.kick\.com\/emotes\/\d{1,20}\/fullsize$/.test(s)
  );
}

/**
 * ゼロ幅などを外して、画像にしてよい名前ならその名前。違うときは ''。
 * @param {unknown} raw
 */
function cleanEmoteSlice(raw) {
  const t = String(raw ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  return isEmoteName(t) ? t : '';
}

/**
 * Twitch の位置。文字で名前になればそれを使い、ならなければ UTF-8 のバイトで切り直す。
 * IRC の既存の例は文字単位。GQL の from/to はバイト単位、という報告がある。
 * @param {string} text
 * @param {number} s
 * @param {number} e 両端を含む
 */
function sliceTwitchEmote(text, s, e) {
  if (!(e >= s)) return '';
  const chars = Array.from(text);
  const byChar = e < chars.length ? cleanEmoteSlice(chars.slice(s, e + 1).join('')) : '';
  if (byChar) return byChar;
  try {
    const bytes = new TextEncoder().encode(text);
    if (e >= bytes.length) return '';
    return cleanEmoteSlice(new TextDecoder().decode(bytes.slice(s, e + 1)));
  } catch {
    return '';
  }
}

/**
 * Twitch の IRC の emotes タグから {名前, URL} を取り出す。
 * 同じ id の範囲は全部見る。最初の範囲が壊れていても、後ろの範囲で名前が取れれば id を残す。
 * @param {unknown} tag 例 "25:0-4,12-16/1902:6-10"
 * @param {unknown} text 本文
 * @returns {{ name: string, url: string }[]}
 */
export function twEmotesFromTag(tag, text) {
  const t = String(tag ?? '');
  if (!t) return [];
  const src = String(text ?? '');
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const part of t.split('/')) {
    const i = part.indexOf(':');
    if (i <= 0) continue;
    const url = twEmoteUrl(part.slice(0, i));
    if (!url) continue;
    for (const range of part.slice(i + 1).split(',')) {
      const m = /^(\d{1,6})-(\d{1,6})$/.exec(range);
      if (!m) continue;
      const name = sliceTwitchEmote(src, Number(m[1]), Number(m[2]));
      if (name && !out.has(name)) out.set(name, url);
      if (out.size >= 40) break;
    }
    if (out.size >= 40) break;
  }
  return [...out].map(([name, url]) => ({ name, url }));
}

/**
 * Kick の本文の [emote:123:KEKW] から {名前, URL} を取り出す。
 * @param {unknown} content
 * @returns {{ name: string, url: string }[]}
 */
export function kickEmotesFromContent(content) {
  const s = String(content ?? '');
  if (!s.includes('[emote:')) return [];
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const m of s.matchAll(/\[emote:(\d{1,20}):([A-Za-z0-9_-]{2,64})(?::[^\]]{0,40})?\]/g)) {
    const url = kickEmoteUrl(m[1]);
    if (url && isEmoteName(m[2]) && !out.has(m[2])) out.set(m[2], url);
    if (out.size >= 40) break;
  }
  return [...out].map(([name, url]) => ({ name, url }));
}

/**
 * 位置から名前を切る。公式の例は両端を含む。名前にならなければ、終端を含まない切り方も試す。
 * 切った中身が [emote:id:name] なら、中の名前を使う。
 * @param {string[]} chars
 * @param {number} start
 * @param {number} end
 */
function kickNameAt(chars, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) return '';
  /** @type {string[]} */
  const cuts = [];
  if (end < chars.length) cuts.push(chars.slice(start, end + 1).join(''));
  if (end <= chars.length && end > start) cuts.push(chars.slice(start, end).join(''));
  for (const raw of cuts) {
    const tag = /^\[emote:\d+:([A-Za-z0-9_-]{2,64})/.exec(raw);
    const name = tag ? tag[1] : raw;
    if (isEmoteName(name)) return name;
  }
  return '';
}

/**
 * Kick の本文タグと、メッセージ横の emotes 配列（emote_id と位置）から {名前, URL} を取る。
 * 数字の id なら https://files.kick.com/emotes/<id>/fullsize を作る。
 * @param {unknown} content
 * @param {unknown} nodes
 * @returns {{ name: string, url: string }[]}
 */
export function kickEmotesFromNodes(content, nodes) {
  const s = String(content ?? '');
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const e of kickEmotesFromContent(s)) out.set(e.name, e.url);
  const list = Array.isArray(nodes) ? nodes : [];
  const chars = Array.from(s);
  for (const node of list) {
    if (!node || typeof node !== 'object') continue;
    const rec = /** @type {Record<string, unknown>} */ (node);
    const url = kickEmoteUrl(String(rec.emote_id ?? rec.emoteId ?? ''));
    if (!url) continue;
    const positions = Array.isArray(rec.positions) ? rec.positions : [];
    let named = false;
    for (const pos of positions) {
      if (!pos || typeof pos !== 'object') continue;
      const p = /** @type {Record<string, unknown>} */ (pos);
      const name = kickNameAt(chars, Number(p.s ?? p.start), Number(p.e ?? p.end));
      if (name && !out.has(name)) out.set(name, url);
      if (name) named = true;
      if (out.size >= 40) break;
    }
    if (!named) {
      const fallback = String(rec.name ?? '');
      if (isEmoteName(fallback) && !out.has(fallback)) out.set(fallback, url);
    }
    if (out.size >= 40) break;
  }
  return [...out].map(([name, url]) => ({ name, url }));
}

/**
 * 覚えている対応に足す(新しいものを後ろへ・上限を超えたら古いものから捨てる)。
 * 変わらなければ同じオブジェクトを返す(保存を省くため)。
 * @param {unknown} dict 名前 → URL
 * @param {unknown} list {name, url}[]
 * @param {number} [max]
 * @returns {Record<string, string>}
 */
export function mergeEmoteDict(dict, list, max = EMOTE_DICT_MAX) {
  /** @type {Record<string, string>} */
  const base = {};
  if (dict && typeof dict === 'object') {
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (dict))) {
      if (isEmoteName(k) && isSafeEmoteUrl(v)) base[k] = String(v);
    }
  }
  let changed = Boolean(dict && typeof dict === 'object' && Object.keys(base).length !== Object.keys(dict).length);
  for (const e of Array.isArray(list) ? list : []) {
    const name = String(e?.name ?? '');
    const url = String(e?.url ?? '');
    if (!isEmoteName(name) || !isSafeEmoteUrl(url) || base[name] === url) continue;
    delete base[name];
    base[name] = url;
    changed = true;
  }
  const keys = Object.keys(base);
  if (keys.length > max) {
    for (const k of keys.slice(0, keys.length - max)) delete base[k];
    changed = true;
  }
  return changed || !dict || typeof dict !== 'object' ? base : /** @type {Record<string, string>} */ (dict);
}

/**
 * 本文を「文字」と「絵文字」に分ける。空白で区切られた語が覚えている名前と同じときだけ絵文字にする。
 * 絵文字が1つも無ければ null(書き換え不要)。
 * @param {string} text
 * @param {Map<string, string>} dict 名前 → URL
 * @returns {null | ({ t: 'text', v: string } | { t: 'emote', name: string, url: string })[]}
 */
export function splitTextByEmotes(text, dict) {
  const s = String(text ?? '');
  if (!s || !dict || !dict.size) return null;
  const parts = s.split(/(\s+)/);
  /** @type {({ t: 'text', v: string } | { t: 'emote', name: string, url: string })[]} */
  const out = [];
  let buf = '';
  let hit = false;
  for (const p of parts) {
    const url = p && dict.get(p);
    if (url) {
      if (buf) out.push({ t: 'text', v: buf });
      buf = '';
      out.push({ t: 'emote', name: p, url });
      hit = true;
    } else buf += p;
  }
  if (!hit) return coverWithEmoteNames(s, dict);
  if (buf) out.push({ t: 'text', v: buf });
  return out;
}

/**
 * 空白が無い並びでも、本文全体が覚えている絵文字の名前だけでできていれば分ける。
 * 途中に名前でない文字が残るときは null（単語の一部は絵文字にしない）。
 * @param {string} s
 * @param {Map<string, string>} dict
 * @returns {null | ({ t: 'text', v: string } | { t: 'emote', name: string, url: string })[]}
 */
function coverWithEmoteNames(s, dict) {
  const names = [...dict.keys()].sort((a, b) => b.length - a.length);
  if (!names.length) return null;
  /** @type {({ t: 'text', v: string } | { t: 'emote', name: string, url: string })[]} */
  const out = [];
  let buf = '';
  let i = 0;
  let hit = false;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      buf += ch;
      i += 1;
      continue;
    }
    let name = '';
    for (const n of names) {
      if (s.startsWith(n, i)) { name = n; break; }
    }
    if (!name) return null;
    if (buf) { out.push({ t: 'text', v: buf }); buf = ''; }
    out.push({ t: 'emote', name, url: /** @type {string} */ (dict.get(name)) });
    hit = true;
    i += name.length;
  }
  if (!hit) return null;
  if (buf) out.push({ t: 'text', v: buf });
  return out;
}

/**
 * 読み上げから絵文字の名前を外す。名前が無いときは空白を整えるだけ。
 * @param {unknown} text
 * @param {ReadonlyArray<string>} names
 * @returns {string}
 */
export function textWithoutEmoteNames(text, names) {
  let s = String(text ?? '');
  const list = [...new Set((names || []).filter((n) => isEmoteName(n)))].sort((a, b) => b.length - a.length);
  for (const n of list) s = s.split(n).join(' ');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * 吹き出しに出す本文。URL がある絵文字は画像の部品にする。
 * 絵文字だけなのに URL が無いとき、または :shortcut: だけのときは drop（コードを出さない・読まない）。
 * @param {unknown} text
 * @param {unknown} emotes
 * @returns {{ drop: boolean, text: string, voiceText: string, segments: null | ({ t: 'text', v: string } | { t: 'emote', name: string, url: string })[] }}
 */
export function bubbleEmotePlan(text, emotes) {
  const src = String(text ?? '');
  /** @type {string[]} */
  const tagNames = [];
  /** @type {{ name: string, url: string }[]} */
  const tagEmotes = [];
  const raw = src
    .replace(/\[emote:(\d{1,20}):([A-Za-z0-9_-]{2,64})(?::[^\]]*)?\]/g, (_m, id, n) => {
      const name = String(n);
      tagNames.push(name);
      const url = kickEmoteUrl(String(id));
      if (url) tagEmotes.push({ name, url });
      return ` ${name} `;
    })
    .replace(/\[emote:[^\]]+\]/g, ' ')
    .replace(/\[emoji:[^\]]+\]/g, ' ');
  const shortcutOnly = raw.trim() !== '' && raw.replace(/:[A-Za-z_][A-Za-z0-9_-]*:/g, '').trim() === '';
  const display = raw.replace(/:[A-Za-z_][A-Za-z0-9_-]*:/g, ' ').replace(/\s+/g, ' ').trim();
  const list = Array.isArray(emotes) ? emotes : [];
  /** @type {string[]} */
  const names = [];
  /** @type {Map<string, string>} */
  const dict = new Map();
  for (const e of [...list, ...tagEmotes]) {
    const name = String(e && typeof e === 'object' ? /** @type {{ name?: unknown }} */ (e).name || '' : '');
    const url = String(e && typeof e === 'object' ? /** @type {{ url?: unknown }} */ (e).url || '' : '');
    if (!isEmoteName(name)) continue;
    if (!names.includes(name)) names.push(name);
    if (isSafeEmoteUrl(url)) dict.set(name, url);
  }
  for (const n of tagNames) if (isEmoteName(n) && !names.includes(n)) names.push(n);
  const voiceText = textWithoutEmoteNames(display, names);
  const segments = dict.size ? splitTextByEmotes(display, dict) : null;
  const emoteOnly = (names.length > 0 && voiceText === '') || shortcutOnly || (display === '' && src.trim() !== '');
  if (emoteOnly && !segments) return { drop: true, text: '', voiceText: '', segments: null };
  if (segments) return { drop: false, text: display, voiceText, segments };
  return { drop: false, text: names.length ? voiceText : display, voiceText, segments: null };
}
