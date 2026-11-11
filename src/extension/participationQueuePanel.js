/**
 * コメビュの「参加の順番」。保存の読み書きと、順番の操作だけを持つ。
 * 判定は src/lib/participationQueue.js。
 */

import { anonymousIdenticonDataUrl } from '../lib/anonymousIdenticon.js';
import {
  PARTICIPATION_BOOTSTRAP_ROWS,
  PARTICIPATION_QUEUE_MAX,
  PARTICIPATION_WORDS_KEY,
  applyParticipationComments,
  commentMatchesWord,
  inheritParticipationWords,
  markParticipationDone,
  moveParticipation,
  normalizeParticipationQueue,
  normalizeParticipationWords,
  openParticipationQueue,
  participationCommentAt,
  participationCommentBeforeAccept,
  participationCommentKey,
  participationDisplayName,
  participationQueueDemoState,
  participationQueueSignature,
  participationQueueStorageKey,
  participationQueueToStorage,
  participationWordsConflict,
  removeParticipationAt,
  resetParticipationOrder,
  setParticipationWords,
  shuffleParticipation
} from '../lib/participationQueue.js';
import { participationProfileUrl } from '../lib/participationQueueProfile.js';

const HANDED_MAX = 4000;
const WORD_SAVE_MS = 400;

/** @type {string} */
let liveId = '';
/** @type {number} */
let generation = 0;
/** @type {boolean} */
let ready = false;
/** @type {boolean} */
let fixture = false;
/** @type {any} */
let view = null;
/** @type {ReturnType<typeof normalizeParticipationQueue> | null} */
let shown = null;
/** @type {Set<string>} */
const handed = new Set();
/** @type {any[]} */
let recent = [];
/** @type {ReturnType<typeof setTimeout> | null} */
let wordTimer = null;
/** @type {Promise<void>} */
let chain = Promise.resolve();

function isFixture() {
  try {
    return /(?:\?|&)pqfixture=1(?:&|$)/.test(String(location.search || ''));
  } catch {
    return false;
  }
}

function storageApi() {
  try {
    const c = /** @type {any} */ (globalThis).chrome;
    return c && c.storage && c.storage.local ? c.storage.local : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 * @param {(state: any) => Promise<void> | void} run
 */
function withLock(id, run) {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
  if (locks && typeof locks.request === 'function' && id) {
    return locks.request(`nls-pq-${id}`, () => run());
  }
  const p = chain.then(() => run(), () => run());
  chain = p.then(() => {}, () => {});
  return p;
}

/**
 * @param {any} state
 */
function render(state) {
  if (!view) return;
  const sig = participationQueueSignature(state);
  const conflict = participationWordsConflict(state);
  if (view.sig === sig && view.conflict === conflict) return;
  view.sig = sig;
  view.conflict = conflict;
  shown = state;
  const joinFocused = document.activeElement === view.joinInput;
  const cancelFocused = document.activeElement === view.cancelInput;
  if (!joinFocused) view.joinInput.value = state.joinWord || '';
  if (!cancelFocused) view.cancelInput.value = state.cancelWord || '';
  view.warn.hidden = !conflict;
  const waiting = state.order.length;
  if (!state.joinWord) view.meta.textContent = '参加の言葉を入れると並びます';
  else if (conflict) view.meta.textContent = '参加と辞退は、違う言葉にしてください';
  else if (waiting >= PARTICIPATION_QUEUE_MAX) view.meta.textContent = `待ちはいっぱいです（${PARTICIPATION_QUEUE_MAX}人）`;
  else view.meta.textContent = waiting ? `${waiting}人` : 'まだ誰も並んでいません';
  view.nextBtn.disabled = waiting === 0 || conflict;
  view.shuffleBtn.disabled = waiting < 2;
  view.resetBtn.disabled = waiting === 0;
  view.list.replaceChildren();
  if (!waiting) {
    const empty = document.createElement('li');
    empty.className = 'cv-pq-empty';
    empty.textContent = 'まだ誰も並んでいません';
    view.list.appendChild(empty);
    return;
  }
  state.order.forEach((/** @type {any} */ person, /** @type {number} */ index) => {
    view.list.appendChild(renderRow(person, index, state, waiting));
  });
}

/**
 * @param {any} person
 * @param {number} index
 * @param {any} state
 * @param {number} total
 */
function renderRow(person, index, state, total) {
  const li = document.createElement('li');
  li.className = 'cv-pq-row';
  li.dataset.i = String(index);
  const who = document.createElement('div');
  who.className = 'cv-pq-who';
  const img = document.createElement('img');
  img.alt = '';
  img.width = 28;
  img.height = 28;
  const fallback = anonymousIdenticonDataUrl(person.userId || person.key || person.name, 28);
  img.src = person.avatar || fallback;
  if (person.avatar) img.addEventListener('error', () => { img.src = fallback; }, { once: true });
  who.appendChild(img);
  const text = document.createElement('div');
  text.className = 'cv-pq-name';
  const name = participationDisplayName(person);
  const url = participationProfileUrl(person.userId, person.channelId, person.login);
  if (url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = name;
    text.appendChild(a);
  } else {
    const span = document.createElement('span');
    span.textContent = name;
    text.appendChild(span);
  }
  const idText = idLabel(person);
  if (idText) {
    const id = document.createElement('span');
    id.className = 'cv-pq-id';
    id.textContent = ` ${idText}`;
    text.appendChild(id);
  }
  const count = Math.floor(Number(state.counts[person.key]) || 0);
  const done = document.createElement('span');
  done.className = 'cv-pq-id';
  done.textContent = count > 0 ? ` 済${count}` : ' 済0';
  text.appendChild(done);
  who.appendChild(text);
  li.appendChild(who);
  const actions = document.createElement('div');
  actions.className = 'cv-pq-row-actions';
  actions.appendChild(rowButton('上', 'up', index === 0));
  actions.appendChild(rowButton('下', 'down', index === total - 1));
  actions.appendChild(rowButton('済', 'done', false));
  actions.appendChild(rowButton('外す', 'remove', false));
  li.appendChild(actions);
  return li;
}

/** @param {string} label @param {string} act @param {boolean} disabled */
function rowButton(label, act, disabled) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.act = act;
  btn.textContent = label;
  btn.disabled = disabled;
  return btn;
}

/** @param {any} person */
function idLabel(person) {
  const channel = String(person.channelId || '');
  const login = String(person.login || '');
  const uid = String(person.userId || '');
  if (/^\d+$/.test(uid) && Number(uid) >= 8000000000) return channel || login;
  return uid || channel || login;
}

/**
 * @param {(state: any) => any} change
 * @param {{ saveWords?: boolean }} [opts]
 */
function mutate(change, opts = {}) {
  if (fixture) {
    if (!shown) shown = participationQueueDemoState();
    const next = change(shown);
    if (next && next !== shown) render(next);
    return Promise.resolve();
  }
  const id = liveId;
  const key = participationQueueStorageKey(id);
  const store = storageApi();
  if (!key || !store) return Promise.resolve();
  const g = generation;
  return withLock(id, async () => {
    if (g !== generation || liveId !== id) return;
    const bag = await store.get([key, PARTICIPATION_WORDS_KEY]);
    let state = normalizeParticipationQueue(bag[key]);
    if (state.opaque) {
      render(state);
      return;
    }
    state = inheritParticipationWords(state, bag[PARTICIPATION_WORDS_KEY]);
    const next = change(state);
    if (!next || next === state || next.opaque) return;
    const payload = participationQueueToStorage(next);
    if (!payload) return;
    /** @type {Record<string, unknown>} */
    const write = { [key]: payload };
    if (opts.saveWords) {
      write[PARTICIPATION_WORDS_KEY] = normalizeParticipationWords({
        joinWord: next.joinWord,
        cancelWord: next.cancelWord
      });
    }
    await store.set(write);
    if (g === generation) render(next);
  }).catch(() => {});
}

/** @param {number} g */
async function reload(g) {
  if (fixture) {
    ready = true;
    render(participationQueueDemoState());
    return;
  }
  const id = liveId;
  const key = participationQueueStorageKey(id);
  const store = storageApi();
  const openedAt = Date.now();
  if (!key || !store) {
    ready = true;
    render(openParticipationQueue(normalizeParticipationQueue(null), openedAt));
    return;
  }
  try {
    const bag = await store.get([key, PARTICIPATION_WORDS_KEY]);
    if (g !== generation) return;
    let state = normalizeParticipationQueue(bag[key]);
    if (!state.opaque) state = inheritParticipationWords(state, bag[PARTICIPATION_WORDS_KEY]);
    const opened = openParticipationQueue(state, openedAt);
    if (opened !== state) {
      const payload = participationQueueToStorage(opened);
      if (payload) await store.set({ [key]: payload });
      state = opened;
    }
    if (g !== generation) return;
    ready = true;
    render(state);
    const liveRows = rowsOnOrAfter(recent, state.acceptAfter);
    if (liveRows.length) noteParticipationComments(liveRows);
  } catch {
    if (g !== generation) return;
    ready = true;
    render(openParticipationQueue(normalizeParticipationQueue(null), openedAt));
  }
}

/** @param {string} id */
function rememberHand(id) {
  handed.add(id);
  if (handed.size <= HANDED_MAX) return;
  const oldest = handed.values().next().value;
  if (oldest) handed.delete(oldest);
}

/**
 * 手元に残っているコメントのうち、区切りの時刻以降だけを返す。
 * 時刻の無い行は、言葉を決める前の溜まりなので渡さない。
 * @param {any[]} rows
 * @param {number} acceptAfter
 * @returns {any[]}
 */
function rowsOnOrAfter(rows, acceptAfter) {
  const cutoff = Number(acceptAfter) || 0;
  if (!cutoff) return [];
  const out = [];
  for (const row of rows) {
    const at = participationCommentAt(row);
    if (at >= cutoff) out.push(row);
  }
  return out;
}

/** @param {any} row */
function mightMatch(row) {
  if (!shown || shown.opaque) return false;
  if (participationWordsConflict(shown)) return false;
  const text = row && typeof row === 'object' ? row.text : '';
  return commentMatchesWord(text, shown.joinWord) || commentMatchesWord(text, shown.cancelWord);
}

/**
 * コメビュが受け取ったコメントを順番へ渡す。待たない。
 * retry は、言葉を保存した直後だけ。その瞬間に届いたコメントを、一度見送っていても見返す。
 * @param {unknown} rows
 * @param {{ retry?: boolean }} [opts]
 */
export function noteParticipationComments(rows, opts) {
  if (!liveId || !Array.isArray(rows) || rows.length === 0) return;
  const retry = !!(opts && opts.retry);
  if (!retry) recent = recent.concat(rows).slice(-PARTICIPATION_BOOTSTRAP_ROWS);
  if (!ready || !shown) return;
  /** @type {any[]} */
  const fresh = [];
  for (const row of rows) {
    const id = participationCommentKey(row);
    if (!id || (!retry && handed.has(id))) continue;
    if (participationCommentBeforeAccept(row, shown.acceptAfter)) {
      rememberHand(id);
      continue;
    }
    if (!mightMatch(row)) {
      if (shown.wordsSet && shown.acceptAfter) rememberHand(id);
      continue;
    }
    rememberHand(id);
    fresh.push(row);
  }
  if (fresh.length) void mutate((state) => applyParticipationComments(state, fresh, Date.now()));
}

/** @param {unknown} id */
export function setParticipationQueueLive(id) {
  const next = String(id || '').trim().toLowerCase();
  if (next === liveId && ready) return;
  liveId = next;
  handed.clear();
  recent = [];
  ready = false;
  const g = ++generation;
  void reload(g);
}

function scheduleWords() {
  if (!view) return;
  if (wordTimer) clearTimeout(wordTimer);
  wordTimer = setTimeout(() => {
    wordTimer = null;
    if (!view) return;
    const joinWord = view.joinInput.value;
    const cancelWord = view.cancelInput.value;
    const now = Date.now();
    void mutate((state) => setParticipationWords(state, { joinWord, cancelWord }, now), { saveWords: true })
      .then(() => {
        const liveRows = rowsOnOrAfter(recent, now);
        if (liveRows.length) noteParticipationComments(liveRows, { retry: true });
      });
  }, WORD_SAVE_MS);
}

/** @param {Event} ev */
function onListClick(ev) {
  const target = /** @type {HTMLElement} */ (ev.target);
  const btn = target && target.closest ? target.closest('button[data-act]') : null;
  if (!btn || !view || !view.list.contains(btn)) return;
  const host = btn.closest('[data-i]');
  const index = Number(host && /** @type {HTMLElement} */ (host).dataset.i);
  if (!Number.isFinite(index)) return;
  const act = /** @type {HTMLElement} */ (btn).dataset.act;
  const now = Date.now();
  if (act === 'up') void mutate((s) => moveParticipation(s, index, -1, now));
  else if (act === 'down') void mutate((s) => moveParticipation(s, index, 1, now));
  else if (act === 'done') void mutate((s) => markParticipationDone(s, index, now));
  else if (act === 'remove') void mutate((s) => removeParticipationAt(s, index, now));
}

function openObs() {
  const id = liveId || 'lv0';
  const q = `participation-queue.html?lv=${encodeURIComponent(id)}`;
  try {
    const c = /** @type {any} */ (globalThis).chrome;
    const url = c && c.runtime && typeof c.runtime.getURL === 'function' ? c.runtime.getURL(q) : q;
    if (c && c.windows && typeof c.windows.create === 'function') {
      c.windows.create({ url, type: 'popup', width: 420, height: 640, focused: true });
      return;
    }
    window.open(url, 'participation-queue', 'popup,width=420,height=640');
  } catch {
    /* 開けなくても順番の操作は残す */
  }
}

/**
 * @param {{ root: HTMLElement | null }} opts
 */
export function mountParticipationQueuePanel(opts) {
  const root = opts && opts.root;
  if (!root || root.dataset.pqMounted === '1') return;
  root.dataset.pqMounted = '1';
  fixture = isFixture();
  view = {
    sig: '',
    conflict: false,
    joinInput: root.querySelector('#cvPqJoin'),
    cancelInput: root.querySelector('#cvPqCancel'),
    warn: root.querySelector('#cvPqWarn'),
    meta: root.querySelector('#cvPqMeta'),
    list: root.querySelector('#cvPqList'),
    nextBtn: root.querySelector('#cvPqNext'),
    shuffleBtn: root.querySelector('#cvPqShuffle'),
    resetBtn: root.querySelector('#cvPqReset'),
    obsBtn: root.querySelector('#cvPqObs')
  };
  if (!view.joinInput || !view.list) return;
  view.joinInput.addEventListener('input', scheduleWords);
  view.cancelInput.addEventListener('input', scheduleWords);
  view.list.addEventListener('click', onListClick);
  view.nextBtn.addEventListener('click', () => { void mutate((s) => markParticipationDone(s, 0, Date.now())); });
  view.shuffleBtn.addEventListener('click', () => { void mutate((s) => shuffleParticipation(s, Math.random, Date.now())); });
  view.resetBtn.addEventListener('click', () => {
    if (!window.confirm('待ちの並びを空にします。済の回数は残します。')) return;
    void mutate((s) => resetParticipationOrder(s, Date.now()));
  });
  view.obsBtn.addEventListener('click', openObs);
  if (fixture) {
    ready = true;
    liveId = 'lv0';
    render(participationQueueDemoState());
    return;
  }
  try {
    const onChanged = globalThis.chrome?.storage?.onChanged;
    if (onChanged && typeof onChanged.addListener === 'function') {
      onChanged.addListener((changes, area) => {
        if (area !== 'local' || fixture || !shown) return;
        const key = participationQueueStorageKey(liveId);
        const queueChange = key ? changes[key] : null;
        const wordsChange = changes[PARTICIPATION_WORDS_KEY];
        if (!queueChange && !wordsChange) return;
        if (queueChange) {
          let incoming = normalizeParticipationQueue(queueChange.newValue);
          if (!incoming.opaque && wordsChange) incoming = inheritParticipationWords(incoming, wordsChange.newValue);
          else if (!incoming.opaque && !incoming.wordsSet && shown) incoming = inheritParticipationWords(incoming, { joinWord: shown.joinWord, cancelWord: shown.cancelWord });
          if (shown && !incoming.opaque && incoming.updatedAt && shown.updatedAt && incoming.updatedAt < shown.updatedAt) return;
          render(incoming);
          return;
        }
        if (wordsChange && shown && !shown.wordsSet && !shown.opaque) {
          render(inheritParticipationWords(shown, wordsChange.newValue));
        }
      });
    }
  } catch { /* 購読できなくても操作は残す */ }
}
