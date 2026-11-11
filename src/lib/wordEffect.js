/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】言葉・ギフトをきっかけにした軽い画面演出の設定正規化と、出してよいかの判定
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし(キー名の定数だけ。読む書くは extension 側)
 * 【正本宣言】言葉の演出の上限・保存形・発火判定はこのファイルのみ
 *
 * wordEffect.js — 登録した言葉(またはギフト)に合わせて、絵を1つ出すか少し落とすかの判定。
 * 物理演算はしない。同時数・言葉ごとの間隔・一気に届いた古い分の見送りもここで決める。
 * コメントはテール(nls_ctail_)を見ない。届いた分だけを取り込み口から受け取る。
 */
import { toEpochMs } from './timeAuthority.js';
import { isPlaceholderStreamKey, platformOfStreamKey } from './platform/streamPlatform.js';

/** chrome.storage.local のキー。版を上げるときはキーの末尾を変えて旧値を残す。 */
export const KEY_WORD_EFFECT = 'nls_word_effect_v1';

/** このコードが読める設定の版。これより新しい版は上書きしない。 */
export const WORD_EFFECT_SCHEMA_VERSION = 1;

/** 登録できる言葉の数。 */
export const WORD_EFFECT_MAX_RULES = 12;
/** 言葉の最大文字数。 */
export const WORD_EFFECT_WORD_MAX = 24;
/** 絵文字の最大文字数。 */
export const WORD_EFFECT_EMOJI_MAX = 8;
/** 画像 URL の最大文字数。 */
export const WORD_EFFECT_IMAGE_URL_MAX = 200;
/** 同時に画面へ出せる個数の既定と上限。 */
export const WORD_EFFECT_DEFAULT_CONCURRENT = 4;
export const WORD_EFFECT_MAX_CONCURRENT = 8;
/** 同じ言葉の最短・既定・最長の間隔(ms)。 */
export const WORD_EFFECT_COOLDOWN_MIN_MS = 1500;
export const WORD_EFFECT_COOLDOWN_DEFAULT_MS = 3000;
export const WORD_EFFECT_COOLDOWN_MAX_MS = 30000;
/** 落ちる演出の個数。ポンは常に1。 */
export const WORD_EFFECT_FALL_MIN = 2;
export const WORD_EFFECT_FALL_MAX = 5;
export const WORD_EFFECT_FALL_DEFAULT = 4;
/** 1回の保存更新で出す件数。それを超える塊(過去ログの取り込みなど)は出さない。 */
export const WORD_EFFECT_MAX_FIRES_PER_TICK = 2;
export const WORD_EFFECT_BURST_SKIP = 8;
/** 照合に使う本文の長さと、差分を見る末尾件数。 */
export const WORD_EFFECT_TEXT_MAX = 80;
export const WORD_EFFECT_LOOKBACK = 40;
/** 見たキーの記憶。超えた分は古い方から捨てる。 */
export const WORD_EFFECT_SEEN_CAP = 240;
/** CSS アニメの長さ(ms)。JS はタイマーの後始末にだけ使う。 */
export const WORD_EFFECT_POP_MS = 1100;
export const WORD_EFFECT_FALL_MS = 1600;
/** 取り込み口から届いた新しいコメントを、別窓と会場へ渡すメッセージ。 */
export const WORD_EFFECT_INGEST_TYPE = 'nls_word_effect_ingest';

/**
 * @typedef {'word'|'gift'} WordEffectTrigger
 * @typedef {'pop'|'fall'} WordEffectMotion
 * @typedef {{
 *   id: string,
 *   trigger: WordEffectTrigger,
 *   word: string,
 *   effect: WordEffectMotion,
 *   emoji: string,
 *   imageUrl: string,
 *   count: number,
 *   cooldownMs: number
 * }} WordEffectRule
 * @typedef {{
 *   schemaVersion: number,
 *   enabled: boolean,
 *   maxConcurrent: number,
 *   rules: WordEffectRule[]
 * }} WordEffectSettings
 * @typedef {{ key: string, text: string, itemName: string }} WordEffectEvent
 * @typedef {{
 *   effect: WordEffectMotion,
 *   emoji: string,
 *   imageUrl: string,
 *   xPct: number,
 *   delayMs: number,
 *   rotDeg: number,
 *   durationMs: number
 * }} WordEffectSprite
 * @typedef {{
 *   seen: string[],
 *   lastFired: Record<string, number>,
 *   primed: boolean,
 *   activeLiveId: string
 * }} WordEffectWatchState
 */

/** @returns {WordEffectSettings} */
export function defaultWordEffectSettings() {
  return {
    schemaVersion: WORD_EFFECT_SCHEMA_VERSION,
    enabled: false,
    maxConcurrent: WORD_EFFECT_DEFAULT_CONCURRENT,
    rules: []
  };
}

/** @returns {WordEffectWatchState} */
export function createWordEffectWatchState() {
  return { seen: [], lastFired: Object.create(null), primed: false, activeLiveId: '' };
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isNewerWordEffectSchema(raw) {
  if (!raw || typeof raw !== 'object') return false;
  const ver = Number(/** @type {{ schemaVersion?: unknown }} */ (raw).schemaVersion);
  return Number.isFinite(ver) && ver > WORD_EFFECT_SCHEMA_VERSION;
}

/**
 * @param {unknown} raw
 * @returns {{ settings: WordEffectSettings, locked: boolean }}
 */
export function readWordEffectSettings(raw) {
  if (isNewerWordEffectSchema(raw)) {
    return { settings: defaultWordEffectSettings(), locked: true };
  }
  return { settings: normalizeWordEffectSettings(raw), locked: false };
}

/**
 * いま保存されている版が新しいときは、古いコードで上書きしない。
 * @param {unknown} previousRaw
 * @param {unknown} draft
 * @returns {{ ok: boolean, reason: string, value: unknown }}
 */
export function writeWordEffectSettings(previousRaw, draft) {
  if (isNewerWordEffectSchema(previousRaw)) {
    return { ok: false, reason: 'newer-schema', value: previousRaw };
  }
  return { ok: true, reason: '', value: normalizeWordEffectSettings(draft) };
}

/**
 * @param {unknown} raw
 * @returns {WordEffectSettings}
 */
export function normalizeWordEffectSettings(raw) {
  const base = defaultWordEffectSettings();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const src = /** @type {{ enabled?: unknown, maxConcurrent?: unknown, rules?: unknown }} */ (raw);
  const rulesIn = Array.isArray(src.rules) ? src.rules.slice(0, WORD_EFFECT_MAX_RULES) : [];
  /** @type {Set<string>} */
  const used = new Set();
  /** @type {WordEffectRule[]} */
  const rules = [];
  for (let i = 0; i < rulesIn.length; i += 1) {
    const rule = normalizeRule(rulesIn[i], i, used);
    if (rule) rules.push(rule);
  }
  return {
    schemaVersion: WORD_EFFECT_SCHEMA_VERSION,
    enabled: src.enabled === true,
    maxConcurrent: clampInt(src.maxConcurrent, WORD_EFFECT_DEFAULT_CONCURRENT, 1, WORD_EFFECT_MAX_CONCURRENT),
    rules
  };
}

/**
 * @param {unknown} raw
 * @param {number} index
 * @param {Set<string>} used
 * @returns {WordEffectRule|null}
 */
function normalizeRule(raw, index, used) {
  if (!raw || typeof raw !== 'object') return null;
  const src = /** @type {Record<string, unknown>} */ (raw);
  const trigger = src.trigger === 'gift' ? 'gift' : 'word';
  const effect = src.effect === 'fall' ? 'fall' : 'pop';
  let id = String(src.id || '').trim().toLowerCase();
  if (!/^[a-z0-9]{1,16}$/.test(id) || used.has(id)) {
    id = `w${index + 1}`;
    while (used.has(id)) id = `w${index + 1}${used.size}`;
    id = id.slice(0, 16);
  }
  used.add(id);
  const word = clampChars(src.word, WORD_EFFECT_WORD_MAX);
  const emoji = clampChars(String(src.emoji || '').replace(/[<>]/g, ''), WORD_EFFECT_EMOJI_MAX) || (trigger === 'gift' ? '🎁' : '✨');
  return {
    id,
    trigger,
    word,
    effect,
    emoji,
    imageUrl: sanitizeWordEffectImageUrl(src.imageUrl),
    count: effect === 'pop' ? 1 : clampInt(src.count, WORD_EFFECT_FALL_DEFAULT, WORD_EFFECT_FALL_MIN, WORD_EFFECT_FALL_MAX),
    cooldownMs: clampInt(src.cooldownMs, WORD_EFFECT_COOLDOWN_DEFAULT_MS, WORD_EFFECT_COOLDOWN_MIN_MS, WORD_EFFECT_COOLDOWN_MAX_MS)
  };
}

/**
 * https の画像だけ通す。それ以外は空(絵文字で出す)。
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeWordEffectImageUrl(raw) {
  const text = String(raw || '').trim();
  if (!text || text.length > WORD_EFFECT_IMAGE_URL_MAX) return '';
  if (!/^https:\/\//i.test(text)) return '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * ギフトの保存キーから配信 id を取る。コメントのテールキーは対象にしない。
 * @param {unknown} key
 * @returns {string}
 */
export function liveIdFromWordEffectStorageKey(key) {
  const m = /^nls_gift_events_(.+)$/.exec(String(key || ''));
  return m && m[1] ? m[1] : '';
}

/**
 * @param {unknown} key
 * @returns {'comment'|'gift'|''}
 */
export function wordEffectKindFromStorageKey(key) {
  return String(key || '').startsWith('nls_gift_events_') ? 'gift' : '';
}

/**
 * 配信 id と、開いているページのホストからサービス名を決める。
 * ABEMA は YouTube のチャットを使うが、ページのホストが abema なら abema とする。
 * @param {unknown} liveId
 * @param {unknown} [pageHost]
 * @returns {'niconico'|'youtube'|'twitch'|'kick'|'abema'|string}
 */
export function wordEffectServiceOf(liveId, pageHost = '') {
  const host = String(pageHost || '').toLowerCase().replace(/^www\./, '');
  if (host === 'abema.tv' || host.endsWith('.abema.tv') || host === 'abema.jp' || host.endsWith('.abema.jp')) return 'abema';
  const id = String(liveId || '').trim();
  const plat = platformOfStreamKey(id);
  if (plat) return plat.id;
  if (/^lv9\d{11}$/i.test(id)) return 'youtube';
  if (/^lv\d{1,15}$/i.test(id)) return 'niconico';
  if (id) return 'youtube';
  return '';
}

/**
 * @param {unknown} liveId
 * @returns {string}
 */
function normalizeIngestLiveId(liveId) {
  const id = String(liveId || '').trim();
  return /^lv\d{1,15}$/i.test(id) ? id.toLowerCase() : id;
}

/**
 * 取り込み口の1行を演出の入力にする。本文の無い行は捨てる。
 * @param {unknown} row
 * @param {'comment'|'gift'} kind
 * @returns {WordEffectEvent|null}
 */
function eventFromIngestRow(row, kind) {
  if (!row || typeof row !== 'object') return null;
  const rec = /** @type {Record<string, unknown>} */ (row);
  const id = String(rec.commentNo || rec.id || rec.pk || '').trim().slice(0, 48);
  if (kind === 'gift') {
    const itemName = clampChars(rec.itemName || rec.ytGiftName, WORD_EFFECT_TEXT_MAX);
    if (!itemName && !id) return null;
    return {
      key: `g:${id}:${itemName}:${Number(rec.point) || 0}`,
      text: '',
      itemName
    };
  }
  const text = clampChars(rec.text || rec.message, WORD_EFFECT_TEXT_MAX);
  if (!text) return null;
  const at = toEpochMs(rec.capturedAt || rec.recordedAt || rec.postedAtMs);
  return { key: id ? `i:${id}` : `i:${at}:${clampChars(text, 40)}`, text, itemName: '' };
}

/**
 * 届いたばかりのコメントから、別窓へ渡すメッセージを作る。
 * 過去ログ・8件以上の塊・空は null(出さない)。
 * @param {unknown} liveId
 * @param {unknown} rows
 * @param {'comment'|'gift'} [kind]
 * @param {unknown} [source]
 * @param {unknown} [pageHost]
 * @returns {{ type: string, liveId: string, service: string, kind: 'comment'|'gift', events: WordEffectEvent[] }|null}
 */
export function buildWordEffectIngestMessage(liveId, rows, kind = 'comment', source = '', pageHost = '') {
  const id = normalizeIngestLiveId(liveId);
  if (!id || isPlaceholderStreamKey(id)) return null;
  if (/backfill|deep|replay|archive/i.test(String(source || ''))) return null;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length >= WORD_EFFECT_BURST_SKIP) return null;
  const useKind = kind === 'gift' ? 'gift' : 'comment';
  /** @type {WordEffectEvent[]} */
  const events = [];
  for (const row of rows) {
    const ev = eventFromIngestRow(row, useKind);
    if (ev) events.push(ev);
  }
  if (events.length === 0) return null;
  return {
    type: WORD_EFFECT_INGEST_TYPE,
    liveId: id,
    service: wordEffectServiceOf(id, pageHost),
    kind: useKind,
    events
  };
}

/**
 * @param {unknown} message
 * @returns {{ liveId: string, service: string, kind: 'comment'|'gift', events: WordEffectEvent[] }|null}
 */
export function parseWordEffectIngestMessage(message) {
  const msg = /** @type {Record<string, unknown>} */ (message);
  if (!msg || msg.type !== WORD_EFFECT_INGEST_TYPE) return null;
  const liveId = normalizeIngestLiveId(msg.liveId);
  if (!liveId || !Array.isArray(msg.events) || msg.events.length === 0 || msg.events.length >= WORD_EFFECT_BURST_SKIP) return null;
  /** @type {WordEffectEvent[]} */
  const events = [];
  for (const raw of msg.events) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = /** @type {Record<string, unknown>} */ (raw);
    const key = String(rec.key || '').slice(0, 80);
    if (!key) continue;
    events.push({
      key,
      text: clampChars(rec.text, WORD_EFFECT_TEXT_MAX),
      itemName: clampChars(rec.itemName, WORD_EFFECT_TEXT_MAX)
    });
  }
  if (events.length === 0) return null;
  return {
    liveId,
    service: String(msg.service || wordEffectServiceOf(liveId)),
    kind: msg.kind === 'gift' ? 'gift' : 'comment',
    events
  };
}

/**
 * 取り込み口のメッセージを、出してよい絵に変える。最初の1件でも出す(テールの初回読み飛ばしはしない)。
 * @param {WordEffectSettings|null|undefined} settings
 * @param {unknown} message
 * @param {WordEffectWatchState|null|undefined} state
 * @param {number} nowMs
 * @param {number} spawnBudget
 * @returns {{ state: WordEffectWatchState, fires: WordEffectSprite[][], service: string }}
 */
export function applyWordEffectIngest(settings, message, state, nowMs, spawnBudget) {
  const parsed = parseWordEffectIngestMessage(message);
  const base = state && typeof state === 'object' ? state : createWordEffectWatchState();
  if (!parsed) return { state: base, fires: [], service: '' };
  const next = advanceWordEffectWatch(
    settings,
    parsed.events,
    parsed.kind,
    base,
    nowMs,
    spawnBudget,
    parsed.liveId,
    true
  );
  return { ...next, service: parsed.service };
}

/**
 * 保存配列の末尾だけを演出の入力にする。
 * @param {unknown} rows
 * @param {'comment'|'gift'} kind
 * @returns {WordEffectEvent[]}
 */
export function wordEffectEventsFromRows(rows, kind) {
  if (!Array.isArray(rows)) return [];
  const slice = rows.slice(-WORD_EFFECT_LOOKBACK);
  /** @type {WordEffectEvent[]} */
  const out = [];
  for (const row of slice) {
    if (!row || typeof row !== 'object') continue;
    const rec = /** @type {Record<string, unknown>} */ (row);
    if (kind === 'gift') {
      out.push({
        key: giftEffectKey(rec),
        text: '',
        itemName: clampChars(rec.itemName, WORD_EFFECT_TEXT_MAX)
      });
    } else {
      out.push({
        key: commentEffectKey(rec),
        text: clampChars(rec.text, WORD_EFFECT_TEXT_MAX),
        itemName: ''
      });
    }
  }
  return out;
}

/**
 * @param {WordEffectSettings|null|undefined} settings
 * @param {'comment'|'gift'} kind
 * @param {WordEffectEvent} event
 * @returns {WordEffectRule|null}
 */
export function matchWordEffectRule(settings, kind, event) {
  const rules = Array.isArray(settings?.rules) ? settings.rules : [];
  const trigger = kind === 'gift' ? 'gift' : 'word';
  const ordered = trigger === 'gift'
    ? rules.filter((r) => r.trigger === 'gift' && r.word).concat(rules.filter((r) => r.trigger === 'gift' && !r.word))
    : rules.filter((r) => r.trigger === 'word');
  const sample = (kind === 'gift' ? event?.itemName : event?.text) || '';
  const hay = sample.toLowerCase();
  for (const rule of ordered) {
    if (kind === 'gift' && !rule.word) return rule;
    if (!rule.word) continue;
    if (hay.includes(rule.word.toLowerCase())) return rule;
  }
  return null;
}

/**
 * @param {WordEffectRule} rule
 * @param {number} seed
 * @returns {WordEffectSprite[]}
 */
export function buildWordEffectSprites(rule, seed) {
  const count = rule.effect === 'pop' ? 1 : rule.count;
  const durationMs = rule.effect === 'pop' ? WORD_EFFECT_POP_MS : WORD_EFFECT_FALL_MS;
  /** @type {WordEffectSprite[]} */
  const sprites = [];
  const base = Number(seed) || 0;
  for (let i = 0; i < count; i += 1) {
    const n = (base + i * 17) % 100;
    sprites.push({
      effect: rule.effect,
      emoji: rule.emoji,
      imageUrl: rule.imageUrl,
      xPct: 12 + (n % 76),
      delayMs: rule.effect === 'fall' ? i * 90 : 0,
      rotDeg: rule.effect === 'fall' ? (n % 24) - 12 : 0,
      durationMs
    });
  }
  return sprites;
}

/**
 * 配信の新着を見て、出してよい絵の束を返す。
 * 最初の1回は記憶するだけで出さない。オフのあいだも記憶だけ進める。
 * 予算(同時数の空き)が無い分は捨てる(後でまとめて出さない)。
 *
 * @param {WordEffectSettings|null|undefined} settings
 * @param {WordEffectEvent[]} events
 * @param {'comment'|'gift'} kind
 * @param {WordEffectWatchState|null|undefined} state
 * @param {number} nowMs
 * @param {number} spawnBudget
 * @param {string} [liveId]
 * @param {boolean} [freshOnly] 取り込み口の新しい行。初回でも出す
 * @returns {{ state: WordEffectWatchState, fires: WordEffectSprite[][] }}
 */
export function advanceWordEffectWatch(settings, events, kind, state, nowMs, spawnBudget, liveId, freshOnly = false) {
  const prev = state && typeof state === 'object' ? state : createWordEffectWatchState();
  const incomingLive = String(liveId || '');
  const switched = incomingLive !== '' && incomingLive !== prev.activeLiveId;
  /** @type {string[]} */
  const seen = switched || !Array.isArray(prev.seen) ? [] : prev.seen.slice();
  /** @type {Record<string, number>} */
  const lastFired = { ...(prev.lastFired || {}) };
  const primed = freshOnly ? true : (switched ? false : prev.primed === true);
  const activeLiveId = incomingLive || String(prev.activeLiveId || '');
  const list = Array.isArray(events) ? events : [];

  if (!primed) {
    for (const ev of list) {
      if (ev && ev.key) seen.push(ev.key);
    }
    return { state: capSeen({ seen, lastFired, primed: true, activeLiveId }), fires: [] };
  }

  const seenSet = new Set(seen);
  /** @type {WordEffectEvent[]} */
  const fresh = [];
  for (const ev of list) {
    if (!ev || !ev.key || seenSet.has(ev.key)) continue;
    seenSet.add(ev.key);
    seen.push(ev.key);
    fresh.push(ev);
  }
  const nextState = () => capSeen({ seen, lastFired, primed: true, activeLiveId });
  if (!settings || settings.enabled !== true || fresh.length === 0 || fresh.length >= WORD_EFFECT_BURST_SKIP) {
    return { state: nextState(), fires: [] };
  }

  const picks = fresh.slice(-WORD_EFFECT_MAX_FIRES_PER_TICK);
  /** @type {WordEffectSprite[][]} */
  const fires = [];
  let budget = Math.max(0, Math.floor(Number(spawnBudget) || 0));
  const now = Number(nowMs) || 0;
  for (const ev of picks) {
    if (budget <= 0) break;
    const rule = matchWordEffectRule(settings, kind, ev);
    if (!rule) continue;
    const prevAt = Number(lastFired[rule.id]) || 0;
    if (prevAt > 0 && now - prevAt < rule.cooldownMs) continue;
    const sprites = buildWordEffectSprites(rule, hashWordEffectKey(ev.key)).slice(0, budget);
    if (sprites.length === 0) continue;
    budget -= sprites.length;
    lastFired[rule.id] = now;
    fires.push(sprites);
  }
  return { state: nextState(), fires };
}

/**
 * @param {string} key
 * @returns {number}
 */
export function hashWordEffectKey(key) {
  let h = 0;
  const text = String(key || '');
  for (let i = 0; i < text.length; i += 1) h = (h * 33 + text.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
function commentEffectKey(row) {
  const no = String(row.commentNo ?? '').trim().slice(0, 24);
  const text = clampChars(row.text, 40);
  const at = toEpochMs(row.capturedAt);
  return no ? `c:${no}:${text}` : `c:${at}:${text}`;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
function giftEffectKey(row) {
  const at = toEpochMs(row.capturedAt);
  const item = clampChars(row.itemId || row.itemName, 40);
  const pt = Number(row.point) || 0;
  return `g:${at}:${item}:${pt}`;
}

/**
 * @param {WordEffectWatchState} state
 * @returns {WordEffectWatchState}
 */
function capSeen(state) {
  if (state.seen.length <= WORD_EFFECT_SEEN_CAP) return state;
  return { ...state, seen: state.seen.slice(-WORD_EFFECT_SEEN_CAP) };
}

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function clampChars(value, max) {
  const chars = Array.from(String(value || '').replace(/[\r\n]/g, '').trim());
  return chars.slice(0, max).join('');
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
