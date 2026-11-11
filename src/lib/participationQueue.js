/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】参加の順番待ち(参加語/辞退語・重複なし・済/移動/シャッフル/空にする・人数)
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし(キー文字列の正本はここ。書くのは画面側)
 * 【正本宣言】参加順番の状態遷移・保存形(v)・OBS の文字の並びはこのファイルのみ
 *
 * participationQueue.js — 配信の参加型で、コメントの言葉から順番待ちを作る。
 * ニコ生も YouTube 系も、コメント行(text / userId / nickname / commentNo)が同じなら同じ結果になる。
 */

import { comeviewUserKeyForRow } from './comeviewActions.js';
import { isGenericComeviewName } from './comeviewRows.js';
import { comeviewAnonLabel } from './comeviewUserNotes.js';
import { safeHttpUrl } from './htmlText.js';
import { toEpochMs } from './timeAuthority.js';

/** 保存形の版。これより新しい v は読まず、上書きもしない。 */
export const PARTICIPATION_QUEUE_VERSION = 1;

/** 待ちに並べる上限(低スペックでも DOM と保存が膨らまない)。 */
export const PARTICIPATION_QUEUE_MAX = 200;

/** 参加/辞退として処理したコメント id の上限。超えたら古いものから捨てる。 */
export const PARTICIPATION_SEEN_MAX = 800;

/** 済の回数を覚える人数の上限。待ちにいない少ない回数から捨てる。 */
export const PARTICIPATION_COUNT_MAX = 500;

/** OBS の透過画面に出す行数。残りは人数だけ。 */
export const PARTICIPATION_OBS_LINES = 30;

/** 言葉を決めた直後に見返す、手元に残している直近コメント数。これより前は走査しない。 */
export const PARTICIPATION_BOOTSTRAP_ROWS = 200;

/** 言葉の最大文字数。 */
export const PARTICIPATION_WORD_MAX = 40;

/**
 * 配信ごとの保存キーの頭。全文は participationQueueStorageKey だけが組み立てる。
 * @type {string}
 */
export const PARTICIPATION_QUEUE_KEY_PREFIX = 'nls_pq_v1_';

/** 次の配信でも使う参加語・辞退語。配信をまたぐ小さな設定。 */
export const PARTICIPATION_WORDS_KEY = 'nls_pq_words_v1';

/**
 * @typedef {{
 *   key: string,
 *   userId: string,
 *   name: string,
 *   avatar: string,
 *   channelId: string,
 *   login: string,
 *   at: number
 * }} ParticipationPerson
 */

/**
 * @typedef {{
 *   v: number,
 *   opaque: boolean,
 *   wordsSet: boolean,
 *   joinWord: string,
 *   cancelWord: string,
 *   acceptAfter: number,
 *   order: ParticipationPerson[],
 *   counts: Record<string, number>,
 *   seen: string[],
 *   updatedAt: number
 * }} ParticipationQueueState
 */

/** @returns {ParticipationQueueState} */
export function emptyParticipationQueue() {
  return {
    v: PARTICIPATION_QUEUE_VERSION,
    opaque: false,
    wordsSet: false,
    joinWord: '',
    cancelWord: '',
    acceptAfter: 0,
    order: [],
    counts: {},
    seen: [],
    updatedAt: 0
  };
}

/**
 * 配信 id から保存キーを作る。形が変な id は空(書かない)。
 * @param {unknown} liveId
 * @returns {string}
 */
export function participationQueueStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,80}$/.test(id)) return '';
  return `${PARTICIPATION_QUEUE_KEY_PREFIX}${id}`;
}

/**
 * 制御文字を落とす。正規表現に制御文字を書かない。
 * @param {unknown} raw
 * @returns {string}
 */
function stripControls(raw) {
  let out = '';
  const s = String(raw ?? '');
  for (const ch of s) {
    const c = ch.codePointAt(0) || 0;
    if (c <= 0x1f || c === 0x7f) continue;
    out += ch;
  }
  return out;
}

/**
 * 入力された言葉を、保存して画面に出す形にする。
 * @param {unknown} raw
 * @returns {string}
 */
export function cleanParticipationWord(raw) {
  let s = stripControls(String(raw ?? '').normalize('NFKC')).trim().replace(/\s+/g, ' ');
  if (s.length > PARTICIPATION_WORD_MAX) s = s.slice(0, PARTICIPATION_WORD_MAX);
  return s;
}

/**
 * 比較用。英字の大小は区別しない。コメント本文は切らない。
 * @param {unknown} raw
 * @returns {string}
 */
function foldForMatch(raw) {
  return stripControls(String(raw ?? '').normalize('NFKC')).trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * コメント全文が言葉と一致するか。部分一致はしない。
 * @param {unknown} text
 * @param {unknown} word
 * @returns {boolean}
 */
export function commentMatchesWord(text, word) {
  const w = foldForMatch(cleanParticipationWord(word));
  if (!w) return false;
  return foldForMatch(text) === w;
}

/**
 * コメントが届いた時刻。書かれた時刻があるときは、受け取った時刻より前ならそちらを使う
 * (開いたときにチャット欄へ残っていた分は、受け取った時刻がまとめて新しくなる)。
 * @param {any} row
 * @returns {number}
 */
export function participationCommentAt(row) {
  if (!row || typeof row !== 'object') return 0;
  const captured = toEpochMs(row.capturedAt);
  const posted = toEpochMs(row.ytPostedAt != null ? row.ytPostedAt : row.postedAtMs);
  if (captured && posted) return Math.min(captured, posted);
  return captured || posted || 0;
}

/**
 * 参加の言葉を決めた時刻・待ちを開いた時刻・空にした時刻より前なら、並ばない。
 * 時刻の無い行は、ここでは落とさない(画面側が古い溜まりを渡さない)。
 * @param {any} row
 * @param {unknown} acceptAfter
 * @returns {boolean}
 */
export function participationCommentBeforeAccept(row, acceptAfter) {
  const cutoff = finiteAt(acceptAfter);
  if (!cutoff) return false;
  const at = participationCommentAt(row);
  if (!at) return false;
  return at < cutoff;
}

/**
 * @param {unknown} raw
 * @returns {{ v: number, joinWord: string, cancelWord: string }}
 */
export function normalizeParticipationWords(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? /** @type {any} */ (raw) : {};
  return {
    v: PARTICIPATION_QUEUE_VERSION,
    joinWord: cleanParticipationWord(o.joinWord),
    cancelWord: cleanParticipationWord(o.cancelWord)
  };
}

/**
 * 保存値を状態にする。知らない新しい版は opaque のまま返し、中身は使わない。
 * @param {unknown} raw
 * @returns {ParticipationQueueState}
 */
export function normalizeParticipationQueue(raw) {
  if (raw == null) return emptyParticipationQueue();
  if (typeof raw !== 'object' || Array.isArray(raw)) return emptyParticipationQueue();
  const rec = /** @type {any} */ (raw);
  const v = rec.v;
  if (typeof v === 'number' && Number.isFinite(v) && v > PARTICIPATION_QUEUE_VERSION) {
    return Object.freeze({
      v,
      opaque: true,
      wordsSet: false,
      joinWord: '',
      cancelWord: '',
      acceptAfter: 0,
      order: [],
      counts: {},
      seen: [],
      updatedAt: 0
    });
  }
  /** @type {ParticipationPerson[]} */
  const order = [];
  const seenKeys = new Set();
  const srcOrder = Array.isArray(rec.order) ? rec.order : [];
  for (const item of srcOrder) {
    if (!item || typeof item !== 'object') continue;
    const row = /** @type {any} */ (item);
    const key = String(row.key || '').trim();
    if (!key || seenKeys.has(key) || order.length >= PARTICIPATION_QUEUE_MAX) continue;
    seenKeys.add(key);
    order.push({
      key,
      userId: String(row.userId || '').trim().slice(0, 80),
      name: String(row.name || '').trim().slice(0, 80),
      avatar: safeHttpUrl(row.avatar).slice(0, 500),
      channelId: cleanChannelId(row.channelId),
      login: cleanLogin(row.login),
      at: finiteAt(row.at)
    });
  }
  /** @type {Record<string, number>} */
  const counts = {};
  const srcCounts = rec.counts && typeof rec.counts === 'object' && !Array.isArray(rec.counts) ? rec.counts : {};
  /** @type {Array<[string, number]>} */
  const countEntries = [];
  for (const [k, n] of Object.entries(srcCounts)) {
    const key = String(k || '').trim();
    const num = Math.floor(Number(n));
    if (!key || !Number.isFinite(num) || num <= 0) continue;
    countEntries.push([key, Math.min(9999, num)]);
  }
  countEntries.sort((a, b) => a[1] - b[1]);
  const keep = countEntries.slice(-PARTICIPATION_COUNT_MAX);
  for (const [key, num] of keep) counts[key] = num;

  const seen = [];
  const seenSet = new Set();
  const srcSeen = Array.isArray(rec.seen) ? rec.seen : [];
  const start = srcSeen.length > PARTICIPATION_SEEN_MAX ? srcSeen.length - PARTICIPATION_SEEN_MAX : 0;
  for (let i = start; i < srcSeen.length; i += 1) {
    const id = String(srcSeen[i] || '').trim().slice(0, 120);
    if (!id || seenSet.has(id)) continue;
    seenSet.add(id);
    seen.push(id);
  }
  return {
    v: PARTICIPATION_QUEUE_VERSION,
    opaque: false,
    wordsSet: rec.wordsSet === true,
    joinWord: cleanParticipationWord(rec.joinWord),
    cancelWord: cleanParticipationWord(rec.cancelWord),
    acceptAfter: finiteAt(rec.acceptAfter),
    order,
    counts,
    seen,
    updatedAt: finiteAt(rec.updatedAt)
  };
}

/**
 * この配信で言葉をまだ決めていなければ、前回の言葉を載せる(保存はしない)。
 * @param {ParticipationQueueState} state
 * @param {unknown} wordsRaw
 * @returns {ParticipationQueueState}
 */
export function inheritParticipationWords(state, wordsRaw) {
  if (!state || state.opaque || state.wordsSet) return state;
  const words = normalizeParticipationWords(wordsRaw);
  if (!words.joinWord && !words.cancelWord) return state;
  if (state.joinWord === words.joinWord && state.cancelWord === words.cancelWord) return state;
  return { ...state, joinWord: words.joinWord, cancelWord: words.cancelWord };
}

/**
 * 参加語と辞退語が同じ(空どうしは除く)なら、コメントでは動かさない。
 * @param {ParticipationQueueState | null | undefined} state
 * @returns {boolean}
 */
export function participationWordsConflict(state) {
  if (!state || state.opaque) return false;
  const join = foldForMatch(state.joinWord);
  const cancel = foldForMatch(state.cancelWord);
  return !!join && join === cancel;
}

/** @param {unknown} raw @returns {string} */
function cleanChannelId(raw) {
  const s = String(raw || '').trim();
  if (/^UC[\w-]{10,40}$/.test(s)) return s;
  if (/^[a-z]{2}:[\w.@-]{1,64}$/.test(s)) return s;
  return '';
}

/** @param {unknown} raw @returns {string} */
function cleanLogin(raw) {
  const s = String(raw || '').trim().slice(0, 40);
  return /^[\w.@-]{1,40}$/.test(s) ? s : '';
}

/** @param {unknown} n @returns {number} */
function finiteAt(n) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
}

/**
 * 同じコメントを二度処理しないための id。commentNo を優先する(再取り込みで id が変わっても同じ)。
 * @param {any} row
 * @returns {string}
 */
export function participationCommentKey(row) {
  if (!row || typeof row !== 'object') return '';
  const no = row.commentNo ?? row.no;
  const noStr = no == null ? '' : String(no).trim();
  if (noStr) return `no:${noStr}`.slice(0, 120);
  const id = String(row.id || '').trim();
  if (id) return `id:${id}`.slice(0, 120);
  return '';
}

/**
 * @param {any} row
 * @returns {ParticipationPerson | null}
 */
export function participationPersonFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  const name = String(row.name || row.nickname || '').trim().slice(0, 80);
  const userId = String(row.userId || '').trim().slice(0, 80);
  const key = comeviewUserKeyForRow({ userId, name });
  if (!key) return null;
  return {
    key,
    userId,
    name,
    avatar: safeHttpUrl(row.avatar || row.avatarUrl).slice(0, 500),
    channelId: cleanChannelId(row.ytChannelId || row.channelId),
    login: cleanLogin(row.login),
    at: 0
  };
}

/**
 * 画面に出す名前。汎用の「匿名」は番号に替える。
 * @param {Pick<ParticipationPerson, 'name' | 'userId'> | null | undefined} person
 * @returns {string}
 */
export function participationDisplayName(person) {
  const name = String(person?.name || '').trim();
  if (name && !isGenericComeviewName(name)) return name;
  const anon = comeviewAnonLabel(String(person?.userId || ''));
  if (anon) return anon;
  if (name) return name;
  const id = String(person?.userId || '').trim();
  return id ? id.slice(0, 24) : '名前なし';
}

/**
 * @param {ParticipationQueueState} state
 * @param {string[]} seen
 * @param {number} nowMs
 * @param {Partial<ParticipationQueueState>} patch
 * @returns {ParticipationQueueState}
 */
function commit(state, seen, nowMs, patch) {
  let nextSeen = seen;
  if (nextSeen.length > PARTICIPATION_SEEN_MAX) {
    nextSeen = nextSeen.slice(nextSeen.length - PARTICIPATION_SEEN_MAX);
  }
  return {
    ...state,
    ...patch,
    seen: nextSeen,
    updatedAt: finiteAt(nowMs) || state.updatedAt
  };
}

/**
 * コメント1件を順番に反映する。変化が無ければ同じオブジェクトを返す。
 * @param {ParticipationQueueState} state
 * @param {any} row
 * @param {number} [nowMs]
 * @returns {ParticipationQueueState}
 */
export function applyParticipationComment(state, row, nowMs = 0) {
  if (!state || state.opaque) return state;
  if (participationWordsConflict(state)) return state;
  if (!state.joinWord && !state.cancelWord) return state;
  if (participationCommentBeforeAccept(row, state.acceptAfter)) return state;
  const id = participationCommentKey(row);
  if (!id) return state;
  if (state.seen.includes(id)) return state;
  const text = row && typeof row === 'object' ? row.text : '';
  const join = commentMatchesWord(text, state.joinWord);
  const cancel = commentMatchesWord(text, state.cancelWord);
  if (!join && !cancel) return state;
  const seen = state.seen.concat(id);
  if (row && row.selfPosted === true) return commit(state, seen, nowMs, {});
  const person = participationPersonFromRow(row);
  if (!person) return commit(state, seen, nowMs, {});
  const at = finiteAt(nowMs);
  if (cancel) {
    const idx = state.order.findIndex((p) => p.key === person.key);
    if (idx < 0) return commit(state, seen, nowMs, {});
    const order = state.order.slice();
    order.splice(idx, 1);
    return commit(state, seen, nowMs, { order });
  }
  const idx = state.order.findIndex((p) => p.key === person.key);
  if (idx >= 0) {
    const cur = state.order[idx];
    const name = person.name || cur.name;
    const avatar = person.avatar || cur.avatar;
    const channelId = person.channelId || cur.channelId;
    const userId = person.userId || cur.userId;
    const login = person.login || cur.login;
    if (name === cur.name && avatar === cur.avatar && channelId === cur.channelId && userId === cur.userId && login === cur.login) {
      return commit(state, seen, nowMs, {});
    }
    const order = state.order.slice();
    order[idx] = { ...cur, name, avatar, channelId, userId, login };
    return commit(state, seen, nowMs, { order });
  }
  if (state.order.length >= PARTICIPATION_QUEUE_MAX) return commit(state, seen, nowMs, {});
  return commit(state, seen, nowMs, {
    order: state.order.concat({ ...person, at })
  });
}

/**
 * @param {ParticipationQueueState} state
 * @param {unknown} rows
 * @param {number} [nowMs]
 * @returns {ParticipationQueueState}
 */
export function applyParticipationComments(state, rows, nowMs = 0) {
  if (!state || state.opaque) return state;
  const list = Array.isArray(rows) ? rows : [];
  let cur = state;
  for (const row of list) cur = applyParticipationComment(cur, row, nowMs);
  return cur;
}

/**
 * 済にする。待ちから外し、その人の回数を1増やす。index を省略すると先頭。
 * @param {ParticipationQueueState} state
 * @param {number | null | undefined} index
 * @param {number} [nowMs]
 * @returns {ParticipationQueueState}
 */
export function markParticipationDone(state, index, nowMs = 0) {
  if (!state || state.opaque) return state;
  const i = index == null ? 0 : Math.floor(Number(index));
  const person = state.order[i];
  if (!person) return state;
  const order = state.order.slice();
  order.splice(i, 1);
  const prev = Math.floor(Number(state.counts[person.key]) || 0);
  const counts = { ...state.counts, [person.key]: Math.min(9999, prev + 1) };
  return trimCounts({ ...state, order, counts, updatedAt: finiteAt(nowMs) || state.updatedAt });
}

/**
 * 待ちから外す。回数は増やさない。
 * @param {ParticipationQueueState} state
 * @param {number} index
 * @param {number} [nowMs]
 * @returns {ParticipationQueueState}
 */
export function removeParticipationAt(state, index, nowMs = 0) {
  if (!state || state.opaque) return state;
  const i = Math.floor(Number(index));
  if (!state.order[i]) return state;
  const order = state.order.slice();
  order.splice(i, 1);
  return { ...state, order, updatedAt: finiteAt(nowMs) || state.updatedAt };
}

/**
 * @param {ParticipationQueueState} state
 * @param {number} index
 * @param {number} delta -1 で上、+1 で下
 * @param {number} [nowMs]
 * @returns {ParticipationQueueState}
 */
export function moveParticipation(state, index, delta, nowMs = 0) {
  if (!state || state.opaque) return state;
  const i = Math.floor(Number(index));
  const j = i + Math.trunc(Number(delta) || 0);
  if (!state.order[i] || j < 0 || j >= state.order.length || j === i) return state;
  const order = state.order.slice();
  const [row] = order.splice(i, 1);
  order.splice(j, 0, row);
  return { ...state, order, updatedAt: finiteAt(nowMs) || state.updatedAt };
}

/**
 * 待ちの並びだけを混ぜる。済の回数は変えない。
 * @param {ParticipationQueueState} state
 * @param {() => number} [rng] 0 以上 1 未満
 * @param {number} [nowMs]
 * @returns {ParticipationQueueState}
 */
export function shuffleParticipation(state, rng = Math.random, nowMs = 0) {
  if (!state || state.opaque || state.order.length < 2) return state;
  const order = state.order.slice();
  for (let i = order.length - 1; i > 0; i -= 1) {
    const r = Number(rng());
    const j = Math.max(0, Math.min(i, Math.floor((Number.isFinite(r) ? r : 0) * (i + 1))));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  let same = true;
  for (let i = 0; i < order.length; i += 1) {
    if (order[i] !== state.order[i]) {
      same = false;
      break;
    }
  }
  if (same) return state;
  return { ...state, order, updatedAt: finiteAt(nowMs) || state.updatedAt };
}

/**
 * 待ちを空にする。済の回数と、処理済みコメントは残す(同じコメントで並び直さない)。
 * @param {ParticipationQueueState} state
 * @param {number} [nowMs]
 * @returns {ParticipationQueueState}
 */
export function resetParticipationOrder(state, nowMs = 0) {
  if (!state || state.opaque || state.order.length === 0) return state;
  const at = finiteAt(nowMs);
  return {
    ...state,
    order: [],
    acceptAfter: Math.max(state.acceptAfter || 0, at),
    updatedAt: at || state.updatedAt
  };
}

/**
 * 待ちを開いた時刻を上げる。これより前に届いていたコメントは、開いた瞬間に並ばない。
 * @param {ParticipationQueueState} state
 * @param {number} [nowMs]
 * @returns {ParticipationQueueState}
 */
export function openParticipationQueue(state, nowMs = 0) {
  if (!state || state.opaque) return state;
  const at = finiteAt(nowMs);
  if (!at || at <= (state.acceptAfter || 0)) return state;
  return { ...state, acceptAfter: at, updatedAt: at };
}

/**
 * @param {ParticipationQueueState} state
 * @param {{ joinWord?: unknown, cancelWord?: unknown }} words
 * @param {number} [nowMs]
 * @returns {ParticipationQueueState}
 */
export function setParticipationWords(state, words, nowMs = 0) {
  if (!state || state.opaque) return state;
  const joinWord = cleanParticipationWord(words?.joinWord);
  const cancelWord = cleanParticipationWord(words?.cancelWord);
  if (state.wordsSet && state.joinWord === joinWord && state.cancelWord === cancelWord) return state;
  const at = finiteAt(nowMs);
  return {
    ...state,
    wordsSet: true,
    joinWord,
    cancelWord,
    acceptAfter: Math.max(state.acceptAfter || 0, at),
    updatedAt: at || state.updatedAt
  };
}

/** @param {ParticipationQueueState} state @returns {ParticipationQueueState} */
function trimCounts(state) {
  const keys = Object.keys(state.counts);
  if (keys.length <= PARTICIPATION_COUNT_MAX) return state;
  const waiting = new Set(state.order.map((p) => p.key));
  const ranked = keys
    .filter((k) => !waiting.has(k))
    .sort((a, b) => state.counts[a] - state.counts[b]);
  const counts = { ...state.counts };
  let extra = keys.length - PARTICIPATION_COUNT_MAX;
  for (const k of ranked) {
    if (extra <= 0) break;
    delete counts[k];
    extra -= 1;
  }
  return { ...state, counts };
}

/**
 * 直近だけを返す。全件の走査を画面にさせない。
 * @param {unknown} rows
 * @param {number} [max]
 * @returns {any[]}
 */
export function recentRowsForParticipation(rows, max = PARTICIPATION_BOOTSTRAP_ROWS) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const n = Number.isFinite(max) && max > 0 ? Math.floor(max) : PARTICIPATION_BOOTSTRAP_ROWS;
  return rows.length > n ? rows.slice(rows.length - n) : rows.slice();
}

/**
 * OBS 用の文字一覧。誰もいなければ空(透過のまま)。
 * @param {ParticipationQueueState | null | undefined} state
 * @returns {string}
 */
export function formatParticipationObsText(state) {
  if (!state || state.opaque || !state.order.length) return '';
  const lines = [];
  const cap = Math.min(state.order.length, PARTICIPATION_OBS_LINES);
  for (let i = 0; i < cap; i += 1) {
    const person = state.order[i];
    const name = participationDisplayName(person);
    const count = Math.floor(Number(state.counts[person.key]) || 0);
    const mark = i === 0 ? 'いま' : String(i + 1);
    lines.push(count > 0 ? `${mark}  ${name}（${count}）` : `${mark}  ${name}`);
  }
  const rest = state.order.length - cap;
  if (rest > 0) lines.push(`ほか ${rest}人`);
  return lines.join('\n');
}

/**
 * 保存してよいか。opaque は書かない。
 * @param {ParticipationQueueState | null | undefined} state
 * @returns {boolean}
 */
export function shouldPersistParticipationQueue(state) {
  return !!state && state.opaque !== true && state.v === PARTICIPATION_QUEUE_VERSION;
}

/**
 * chrome.storage に書く形。関数や画面用の印は入れない。
 * @param {ParticipationQueueState} state
 * @returns {object | null}
 */
export function participationQueueToStorage(state) {
  if (!shouldPersistParticipationQueue(state)) return null;
  return {
    v: PARTICIPATION_QUEUE_VERSION,
    wordsSet: state.wordsSet === true,
    joinWord: state.joinWord,
    cancelWord: state.cancelWord,
    acceptAfter: finiteAt(state.acceptAfter),
    order: state.order.map((p) => ({
      key: p.key,
      userId: p.userId,
      name: p.name,
      avatar: p.avatar,
      channelId: p.channelId,
      login: p.login,
      at: p.at
    })),
    counts: { ...state.counts },
    seen: state.seen.slice(),
    updatedAt: state.updatedAt
  };
}

/**
 * 画面確認用の見本。りんく・こん太・たぬ姉だけを並べる。
 * @returns {ParticipationQueueState}
 */
export function participationQueueDemoState() {
  const base = setParticipationWords(emptyParticipationQueue(), { joinWord: '参加', cancelWord: '辞退' }, 1);
  return {
    ...base,
    order: [
      { key: 'n:りんく', userId: '', name: 'りんく', avatar: '', channelId: '', login: '', at: 1 },
      { key: 'n:こん太', userId: '', name: 'こん太', avatar: '', channelId: '', login: '', at: 2 },
      { key: 'n:たぬ姉', userId: '', name: 'たぬ姉', avatar: '', channelId: '', login: '', at: 3 }
    ],
    counts: { 'n:りんく': 2, 'n:たぬ姉': 1 }
  };
}

/**
 * 描き直す必要があるかの比較用。
 * @param {ParticipationQueueState | null | undefined} state
 * @returns {string}
 */
export function participationQueueSignature(state) {
  if (!state) return '';
  if (state.opaque) return `opaque:${state.v}`;
  const order = state.order.map((p) => `${p.key}\t${p.name}\t${p.userId}\t${p.avatar}`).join('\n');
  const counts = state.order.map((p) => state.counts[p.key] || 0).join(',');
  return `${state.joinWord}\t${state.cancelWord}\t${state.wordsSet ? 1 : 0}\t${counts}\n${order}`;
}
