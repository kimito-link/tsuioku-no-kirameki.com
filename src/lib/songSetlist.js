/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】歌枠の曲順・リクエスト言葉・OBS用の文字の組み立て
 * 【この箱に入らないもの】storage / DOM / コメントの取得
 * 【書けるstorageキー】なし（キー名の定数だけ）
 * 【正本宣言】リクエストは言葉が先頭にあるコメントだけ。曲順の文字はこのファイルだけ
 *
 * songSetlist.js — 歌枠のセットリスト。ランキングは作らない。
 */

/** セットリストの storage キー。 */
export const SONG_SETLIST_KEY = 'nls_song_setlist_v1';

export const SONG_SETLIST_FORMAT = 1;
export const SONG_TITLE_MAX = 80;
export const SONG_MAX = 80;
export const REQUEST_OPEN_MAX = 40;
export const REQUEST_WORD_MAX = 12;
export const SEEN_KEY_MAX = 400;

/**
 * @returns {{
 *   formatVersion: number,
 *   seq: number,
 *   requestWords: string[],
 *   songs: Array<{ id: string, title: string }>,
 *   order: string[],
 *   currentId: string,
 *   requests: Array<{ id: string, title: string, name: string, userId: string, at: number, status: string }>,
 *   seenKeys: string[]
 * }}
 */
export function emptySongSetlist() {
  return {
    formatVersion: SONG_SETLIST_FORMAT,
    seq: 0,
    requestWords: [],
    songs: [],
    order: [],
    currentId: '',
    requests: [],
    seenKeys: []
  };
}

/** @param {unknown} text */
function clipTitle(text) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, SONG_TITLE_MAX);
}

/**
 * 1行1語。空行は捨て、長すぎる語は切る。
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeRequestWords(raw) {
  const lines = Array.isArray(raw) ? raw : String(raw == null ? '' : raw).split(/\r?\n/);
  /** @type {string[]} */
  const out = [];
  for (const line of lines) {
    const word = String(line || '').trim().slice(0, 24);
    if (!word || out.includes(word)) continue;
    out.push(word);
    if (out.length >= REQUEST_WORD_MAX) break;
  }
  return out;
}

/**
 * @param {unknown} raw
 */
export function normalizeSongSetlist(raw) {
  const base = emptySongSetlist();
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const seq = Math.max(0, Math.floor(Number(/** @type {any} */ (src).seq) || 0));
  /** @type {Array<{ id: string, title: string }>} */
  const songs = [];
  const seenSong = new Set();
  for (const row of Array.isArray(/** @type {any} */ (src).songs) ? /** @type {any} */ (src).songs : []) {
    if (!row || typeof row !== 'object') continue;
    const id = String(row.id || '').trim();
    const title = clipTitle(row.title);
    if (!id || !title || seenSong.has(id)) continue;
    seenSong.add(id);
    songs.push({ id, title });
    if (songs.length >= SONG_MAX) break;
  }
  const ids = new Set(songs.map((s) => s.id));
  /** @type {string[]} */
  const order = [];
  for (const id of Array.isArray(/** @type {any} */ (src).order) ? /** @type {any} */ (src).order : []) {
    const key = String(id || '').trim();
    if (!ids.has(key) || order.includes(key)) continue;
    order.push(key);
  }
  /** @type {Array<{ id: string, title: string, name: string, userId: string, at: number, status: string }>} */
  const requests = [];
  for (const row of Array.isArray(/** @type {any} */ (src).requests) ? /** @type {any} */ (src).requests : []) {
    if (!row || typeof row !== 'object') continue;
    const title = clipTitle(row.title);
    const id = String(row.id || '').trim();
    if (!id || !title) continue;
    const status = row.status === 'accepted' || row.status === 'rejected' ? row.status : 'open';
    requests.push({
      id,
      title,
      name: String(row.name || '').trim().slice(0, 80),
      userId: String(row.userId || '').trim().slice(0, 40),
      at: Math.max(0, Number(row.at) || 0),
      status
    });
  }
  /** @type {string[]} */
  const seenKeys = [];
  for (const key of Array.isArray(/** @type {any} */ (src).seenKeys) ? /** @type {any} */ (src).seenKeys : []) {
    const k = String(key || '').trim().slice(0, 120);
    if (!k || seenKeys.includes(k)) continue;
    seenKeys.push(k);
  }
  const currentId = String(/** @type {any} */ (src).currentId || '').trim();
  return {
    ...base,
    seq,
    requestWords: normalizeRequestWords(/** @type {any} */ (src).requestWords),
    songs,
    order,
    currentId: ids.has(currentId) ? currentId : '',
    requests: requests.slice(-REQUEST_OPEN_MAX * 2),
    seenKeys: seenKeys.slice(-SEEN_KEY_MAX)
  };
}

/**
 * コメントの先頭がリクエスト言葉のとき、曲名を返す。言葉の途中（「リク」で「リクエスト」）は拾わない。
 * @param {unknown} text
 * @param {unknown} words
 * @returns {{ word: string, title: string } | null}
 */
export function extractSongRequest(text, words) {
  const body = String(text == null ? '' : text).trim();
  if (!body) return null;
  for (const word of normalizeRequestWords(words)) {
    if (!body.startsWith(word) || body.length === word.length) continue;
    const next = body.charAt(word.length);
    if (next !== ' ' && next !== '　' && next !== ':' && next !== '：') continue;
    const title = clipTitle(body.slice(word.length).replace(/^[\s:：]+/, ''));
    if (!title) continue;
    return { word, title };
  }
  return null;
}

/**
 * @param {unknown} row
 * @returns {string}
 */
export function requestSeenKey(row) {
  const src = row && typeof row === 'object' ? row : {};
  const no = String(/** @type {any} */ (src).no || /** @type {any} */ (src).commentNo || '').trim();
  if (no) return `n:${no}`.slice(0, 120);
  const at = Math.max(0, Number(/** @type {any} */ (src).at) || 0);
  const text = String(/** @type {any} */ (src).text || '').trim().slice(0, 80);
  if (!text) return '';
  return `t:${at}:${text}`.slice(0, 120);
}

/**
 * まだ見ていないコメントから、言葉に合うものだけを未対応リクエストに足す。
 * @param {unknown} state
 * @param {readonly any[]} comments
 * @returns {{ state: ReturnType<typeof emptySongSetlist>, added: number }}
 */
export function ingestSongRequests(state, comments) {
  const next = normalizeSongSetlist(state);
  if (!next.requestWords.length || !Array.isArray(comments)) return { state: next, added: 0 };
  const seen = new Set(next.seenKeys);
  let added = 0;
  for (const row of comments) {
    const key = requestSeenKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.seenKeys.push(key);
    const hit = extractSongRequest(row?.text, next.requestWords);
    if (!hit) continue;
    const dup = next.requests.some(
      (r) => r.status === 'open' && r.title === hit.title && r.userId === String(row?.userId || '').trim()
    );
    if (dup) continue;
    next.seq += 1;
    next.requests.push({
      id: `r${next.seq}`,
      title: hit.title,
      name: String(row?.name || row?.nickname || '').trim().slice(0, 80),
      userId: String(row?.userId || '').trim().slice(0, 40),
      at: Math.max(0, Number(row?.at) || 0),
      status: 'open'
    });
    added += 1;
  }
  if (next.seenKeys.length > SEEN_KEY_MAX) next.seenKeys = next.seenKeys.slice(-SEEN_KEY_MAX);
  const open = next.requests.filter((r) => r.status === 'open');
  const closed = next.requests.filter((r) => r.status !== 'open');
  const keepOpen = open.slice(-REQUEST_OPEN_MAX);
  next.requests = [...closed.slice(-20), ...keepOpen];
  return { state: next, added };
}

/**
 * @param {unknown} state
 * @param {unknown} title
 */
export function addSongToSetlist(state, title) {
  const next = normalizeSongSetlist(state);
  const name = clipTitle(title);
  if (!name) return next;
  let song = next.songs.find((s) => s.title === name);
  if (!song) {
    if (next.songs.length >= SONG_MAX) return next;
    next.seq += 1;
    song = { id: `s${next.seq}`, title: name };
    next.songs.push(song);
  }
  if (!next.order.includes(song.id)) next.order.push(song.id);
  return next;
}

/**
 * @param {unknown} state
 * @param {string} id
 * @param {-1|1} dir
 */
export function moveSetlistSong(state, id, dir) {
  const next = normalizeSongSetlist(state);
  const index = next.order.indexOf(String(id || ''));
  const to = index + (dir < 0 ? -1 : 1);
  if (index < 0 || to < 0 || to >= next.order.length) return next;
  const tmp = next.order[to];
  next.order[to] = next.order[index];
  next.order[index] = tmp;
  return next;
}

/**
 * @param {unknown} state
 * @param {string} id
 */
export function removeSetlistSong(state, id) {
  const next = normalizeSongSetlist(state);
  const key = String(id || '');
  next.order = next.order.filter((x) => x !== key);
  if (next.currentId === key) next.currentId = '';
  return next;
}

/**
 * @param {ReturnType<typeof normalizeSongSetlist>} state
 */
function shownNowId(state) {
  if (state.currentId && state.order.includes(state.currentId)) return state.currentId;
  return state.order[0] || '';
}

/**
 * @param {unknown} state
 */
export function advanceSetlist(state) {
  const next = normalizeSongSetlist(state);
  const now = shownNowId(next);
  const index = next.order.indexOf(now);
  const following = index >= 0 ? next.order[index + 1] : '';
  if (following) next.currentId = following;
  return next;
}

/**
 * @param {unknown} state
 * @param {string} requestId
 * @param {'accepted'|'rejected'} status
 */
export function settleSongRequest(state, requestId, status) {
  const next = normalizeSongSetlist(state);
  const req = next.requests.find((r) => r.id === String(requestId || '') && r.status === 'open');
  if (!req) return next;
  req.status = status === 'rejected' ? 'rejected' : 'accepted';
  if (req.status === 'accepted') return addSongToSetlist(next, req.title);
  return next;
}

/**
 * OBSのウィンドウキャプチャ用。装飾もアニメーションも無いプレーンテキスト。
 * @param {unknown} state
 * @returns {string}
 */
export function buildObsSetlistText(state) {
  const next = normalizeSongSetlist(state);
  const byId = new Map(next.songs.map((s) => [s.id, s.title]));
  const nowId = shownNowId(next);
  const nowIndex = next.order.indexOf(nowId);
  const nowTitle = byId.get(nowId) || '（まだありません）';
  const nextTitle = (nowIndex >= 0 && next.order[nowIndex + 1] && byId.get(next.order[nowIndex + 1])) || '（まだありません）';
  const open = next.requests.filter((r) => r.status === 'open').slice(0, 8);
  const lines = ['いま', nowTitle, '', 'つぎ', nextTitle, '', 'リクエスト'];
  if (!open.length) lines.push('（まだありません）');
  else open.forEach((r, i) => lines.push(`${i + 1}. ${r.title}`));
  return lines.join('\n');
}
