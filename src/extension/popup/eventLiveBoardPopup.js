// eventLiveBoardPopup.js
// 2026-11-21 Phase 2: popup のイベント💎ボード（いまの順位・pt・次の順位まで）。popup-entry.js は
//   max-lines ラチェットがあるので、DOM と SW 依頼はここに置く。数字の計算と HTML は src/lib の純関数
//   （eventLiveBoardModel.js / eventLiveBoardHtml.js）。
import { eventScoreRankingStorageKey } from '../../lib/eventScoreRankingRelay.js';
import {
  buildEventLiveBoardModel,
  buildEventFullListRows,
  sanitizeServerAnnotation
} from '../../lib/eventLiveBoardModel.js';
import {
  buildEventSelfCardHtml,
  buildEventFullListRowsHtml,
  buildEventFullListHeadHtml
} from '../../lib/eventLiveBoardHtml.js';
import {
  AUDITION_EVENT_FULL_LIST_MESSAGE_TYPE,
  AUDITION_EVENT_ANNOTATION_MESSAGE_TYPE,
  normalizeAuditionFullRankingPages
} from '../../lib/auditionEventRankingApi.js';

/* ------------------------------------------------------------------ */
/* 2026-11-21 Phase 2: イベント💎ボード（いまの順位・pt・次の順位まで を先頭に）           */
/*  - 数字の出どころ: content が保存した events[]（capi・30秒おき・タブ1つだけ）。         */
/*  - 起点（推定・公式更新以降 +X）: SW 経由でサーバへ（同じイベントは5分に1回まで）。     */
/*  - 全員一覧: 「参加者全員の順位を見る」を開いている間だけ、60秒おきに SW 経由で取る。   */
/*    描画は25人ずつ（もっと見る）＋ content-visibility で、低スペックPCでも固まらない。   */
/* ------------------------------------------------------------------ */
const EVB_FULL_LIST_POLL_MS = 60_000;
const EVB_ANNOTATION_RETRY_MS = 5 * 60_000;
const EVB_FIRST_CHUNK = 25;
const EVB_MORE_CHUNK = 50;
/** @type {Map<string, { at: number, ann: any }>} */
const _evbAnnotationByKey = new Map();
/** @type {Set<string>} */
const _evbAnnotationPending = new Set();
let _evbActive = false;
let _evbSelectedKey = '';
let _evbLastCardsHtml = '';
/** @type {Array<any>} */
let _evbEvents = [];
let _evbBroadcasterName = '';
/** @type {() => string} */
let _evbGetBroadcasterName = () => '';
/** @type {{ key: string, rows: any[], totalCount: number, gotAt: number } | null} */
let _evbFull = null;
let _evbShown = EVB_FIRST_CHUNK;
/** @type {ReturnType<typeof setInterval> | null} */
let _evbFullTimer = null;
let _evbWired = false;

/** @param {string} key */
function evbAnnotationFor(key) {
  const c = _evbAnnotationByKey.get(key);
  return c && c.ann ? c.ann : null;
}

/** @param {string} key @param {() => void} onDone */
function evbRequestAnnotation(key, onDone) {
  const c = _evbAnnotationByKey.get(key);
  if (_evbAnnotationPending.has(key)) return;
  if (c && Date.now() - c.at < EVB_ANNOTATION_RETRY_MS) return;
  _evbAnnotationPending.add(key);
  try {
    chrome.runtime.sendMessage({ type: AUDITION_EVENT_ANNOTATION_MESSAGE_TYPE, key }, (resp) => {
      void chrome.runtime.lastError;
      _evbAnnotationPending.delete(key);
      const ann = resp && resp.ok ? sanitizeServerAnnotation(resp.annotation) : null;
      _evbAnnotationByKey.set(key, { at: Date.now(), ann: ann || (c ? c.ann : null) });
      if (ann) onDone();
    });
  } catch {
    _evbAnnotationPending.delete(key);
    _evbAnnotationByKey.set(key, { at: Date.now(), ann: c ? c.ann : null });
  }
}

function evbSelectedEvent() {
  return _evbEvents.find((e) => e.key === _evbSelectedKey) || _evbEvents[0] || null;
}

function evbRenderFullList() {
  const board = document.getElementById('nlEventLiveBoard');
  if (!(board instanceof HTMLElement)) return;
  const head = board.querySelector('[data-evb-role="fullhead"]');
  const list = board.querySelector('[data-evb-role="list"]');
  const foot = board.querySelector('[data-evb-role="fullfoot"]');
  if (!(head instanceof HTMLElement) || !(list instanceof HTMLElement) || !(foot instanceof HTMLElement)) return;
  const ev = evbSelectedEvent();
  if (!ev || !_evbFull || _evbFull.key !== ev.key) {
    head.innerHTML = '<p class="nl-evb__muted">ニコニコの公式から取得中…</p>';
    list.innerHTML = '';
    foot.innerHTML = '';
    return;
  }
  const ann = evbAnnotationFor(ev.key);
  const model = buildEventLiveBoardModel(ev, ann);
  const all = buildEventFullListRows(_evbFull.rows, ev.self && ev.self.id ? ev.self.id : '', ann);
  const shown = Math.min(_evbShown, all.length);
  head.innerHTML = buildEventFullListHeadHtml({
    scoreLabel: model.scoreLabel,
    gotAt: _evbFull.gotAt,
    totalCount: _evbFull.totalCount,
    shown,
    officialNote: model.officialNote
  });
  list.innerHTML = buildEventFullListRowsHtml(all.slice(0, shown), { separate: model.separate });
  const selfIdx = all.findIndex((r) => r.isSelf);
  let fh = '';
  if (shown < all.length) {
    fh += `<button type="button" class="nl-evb__more" data-evb-more="1">もっと見る（あと${all.length - shown}人）</button> `;
  }
  if (selfIdx >= 0) fh += '<button type="button" class="nl-evb__jump" data-evb-jump="1">この配信者さんの位置へ</button>';
  foot.innerHTML = fh;
}

function evbFetchFullList() {
  const ev = evbSelectedEvent();
  if (!ev) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const key = ev.key;
  try {
    chrome.runtime.sendMessage({ type: AUDITION_EVENT_FULL_LIST_MESSAGE_TYPE, key }, (resp) => {
      void chrome.runtime.lastError;
      if (!resp || !resp.ok) {
        if (!_evbFull || _evbFull.key !== key) evbRenderFullList();
        return;
      }
      const norm = normalizeAuditionFullRankingPages(resp.pagesJson);
      if (!norm) return;
      _evbFull = { key, rows: norm.rows, totalCount: norm.totalCount, gotAt: Number(resp.gotAt) || Date.now() };
      evbRenderFullList();
    });
  } catch {
    /* 拡張の再読込中など。次の周期で取り直す */
  }
}

function evbStopFullPoll() {
  if (_evbFullTimer) {
    clearInterval(_evbFullTimer);
    _evbFullTimer = null;
  }
}

function evbStartFullPoll() {
  evbStopFullPoll();
  evbRenderFullList();
  evbFetchFullList();
  _evbFullTimer = setInterval(() => {
    const board = document.getElementById('nlEventLiveBoard');
    const det = board ? board.querySelector('[data-evb-role="full"]') : null;
    if (!(det instanceof HTMLDetailsElement) || !det.open || board.hidden) {
      evbStopFullPoll();
      return;
    }
    evbFetchFullList();
  }, EVB_FULL_LIST_POLL_MS);
}

/** @param {HTMLElement} board */
function evbWire(board) {
  if (_evbWired) return;
  _evbWired = true;
  const det = board.querySelector('[data-evb-role="full"]');
  if (det instanceof HTMLDetailsElement) {
    det.addEventListener('toggle', () => {
      if (det.open) {
        _evbShown = EVB_FIRST_CHUNK;
        evbStartFullPoll();
      } else evbStopFullPoll();
    });
  }
  board.addEventListener('click', (/** @type {Event} */ e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const open = t.closest('[data-evb-open]');
    if (open instanceof HTMLElement) {
      const key = String(open.getAttribute('data-evb-open') || '');
      if (key && key !== _evbSelectedKey) {
        _evbSelectedKey = key;
        _evbFull = null;
      }
      evbUpdateSummary(board);
      if (det instanceof HTMLDetailsElement) {
        if (!det.open) det.open = true; // toggle → poll 開始
        else evbStartFullPoll();
        det.scrollIntoView({ block: 'nearest' });
      }
      return;
    }
    if (t.closest('[data-evb-more]')) {
      _evbShown += EVB_MORE_CHUNK;
      evbRenderFullList();
      return;
    }
    if (t.closest('[data-evb-jump]')) {
      const ev = evbSelectedEvent();
      if (_evbFull && ev && ev.self) {
        const idx = _evbFull.rows.findIndex((r) => r.id === ev.self.id);
        if (idx >= 0 && idx >= _evbShown) _evbShown = idx + 10;
      }
      evbRenderFullList();
      const row = board.querySelector('[data-evb-self="1"]');
      if (row instanceof HTMLElement) row.scrollIntoView({ block: 'center' });
    }
  });
}

/** @param {HTMLElement} board */
function evbUpdateSummary(board) {
  const sum = board.querySelector('[data-evb-role="summary"]');
  const ev = evbSelectedEvent();
  if (sum instanceof HTMLElement) {
    const txt = ev && _evbEvents.length > 1 ? `参加者全員の順位を見る（${ev.title || ev.key}）` : '参加者全員の順位を見る';
    if (sum.textContent !== txt) sum.textContent = txt;
  }
}

/**
 * @param {string} liveId
 * @param {() => string} [getBroadcasterName] 配信者名（拡張が持つ正本）
 * @returns {Promise<boolean>} ボードを出したか
 */
export async function refreshEventLiveBoardAsync(liveId, getBroadcasterName) {
  if (typeof getBroadcasterName === 'function') _evbGetBroadcasterName = getBroadcasterName;
  const board = document.getElementById('nlEventLiveBoard');
  if (!(board instanceof HTMLElement)) return false;
  const lid = String(liveId || '').trim().toLowerCase();
  /** @type {any[]} */
  let events = [];
  if (/^lv\d{1,15}$/.test(lid)) {
    try {
      const sKey = eventScoreRankingStorageKey(lid);
      const bag = await chrome.storage.local.get([sKey]);
      const sv = /** @type {any} */ (bag[sKey]);
      if (sv && typeof sv === 'object' && Array.isArray(sv.events)) {
        events = sv.events.filter((/** @type {any} */ e) => e && typeof e === 'object' && typeof e.key === 'string' && e.self);
      }
    } catch {
      events = [];
    }
  }
  if (events.length === 0) {
    _evbActive = false;
    _evbEvents = [];
    if (!board.hasAttribute('hidden')) board.setAttribute('hidden', '');
    evbStopFullPoll();
    return false;
  }
  evbWire(board);
  _evbEvents = events;
  if (!events.some((e) => e.key === _evbSelectedKey)) {
    _evbSelectedKey = events[0].key;
    _evbFull = null;
  }
  _evbBroadcasterName = String(_evbGetBroadcasterName() || '').trim();
  const rerender = () => {
    void refreshEventLiveBoardAsync(lid);
  };
  for (const ev of events) evbRequestAnnotation(ev.key, rerender);
  const cards = events
    .map((ev) =>
      buildEventSelfCardHtml(buildEventLiveBoardModel(ev, evbAnnotationFor(ev.key)), {
        broadcasterName: _evbBroadcasterName,
        showListButton: events.length > 1
      })
    )
    .join('');
  const cardsEl = board.querySelector('[data-evb-role="cards"]');
  if (cardsEl instanceof HTMLElement && cards !== _evbLastCardsHtml) {
    cardsEl.innerHTML = cards;
    _evbLastCardsHtml = cards;
  }
  evbUpdateSummary(board);
  if (board.hasAttribute('hidden')) board.removeAttribute('hidden');
  _evbActive = true;
  const det = board.querySelector('[data-evb-role="full"]');
  if (det instanceof HTMLDetailsElement && det.open && _evbFull) evbRenderFullList();
  return true;
}

/** ボードが出ているか（出ている間は旧「本人の現在順位」ヘッダを重ねない）。 */
export function isEventLiveBoardActive() {
  return _evbActive;
}
