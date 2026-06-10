// @ts-nocheck — comeview UI: read-only DOM/Chrome API。popup と独立。
/**
 * v0.1.652: 独自コメビュ「KIRAMEKI Comment View」(comeview.html)。
 * v0.1.676: ユーザー指示「(自前描画をやめて)そのまま一旦は POP にすればいい」に従い、
 *   一覧描画を【パネルの応援タイムラインと同一パイプライン】に置換した。
 *   - データ: readChunkedComments(本体チャンク正本)+テール+gift_events(POP と同じ)
 *   - 名前/サムネ: applyUserCommentProfileMapToEntries+buildTimelineRowHtml(POP と同じ)
 *   - 見た目: popup.html の .nl-tl-* CSS を移植(POP と同じ)
 *   これにより「コメビュだけ二重表示/名前欠け」の類は構造的に起きない(ソースも描画も同一)。
 *
 * わんコメ式機能: 行クリック→ユーザー詳細(ニックネーム[匿名OK]/ラベル/メモ/ID/リンク/
 *   発言一覧)。NG(非表示)は詳細パネルから。?user=<uid> 起動で詳細を自動オープン
 *   (パネルのタイムライン行クリックから飛んでくる)。
 *
 * ほぼリードオンリー: 書込はユーザー操作時の小さな UI 状態(NG/ノート)のみ・SW は起こさない。
 *
 * @module comeview-entry
 */

import {
  commentsStorageKey,
  KEY_USER_COMMENT_PROFILE_CACHE
} from '../lib/storageKeys.js';
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import { readChunkedComments } from '../lib/commentChunkStore.js';
import {
  isCommentDbAvailable,
  openCommentDb,
  countCommentsForLive as countCommentsForLiveDb,
  readAllCommentsForLive as readAllCommentsFromDb
} from '../lib/commentDb.js';
import { combineCanonicalComeviewRows } from '../lib/comeviewRows.js';
import { buildSupportActivityTimeline } from '../lib/supportActivityTimeline.js';
import { buildTimelineRowHtml } from '../lib/supportTimelineHtml.js';
import {
  normalizeUserCommentProfileMap,
  applyUserCommentProfileMapToEntries
} from '../lib/userCommentProfileCache.js';
import {
  comeviewUserKeyForRow,
  comeviewUserPageUrl,
  comeviewPinStorageKey,
  buildComeviewCopyText,
  resolveComeviewAvatarUrl,
  mergeComeviewRowWithProfile,
  normalizeComeviewNgList,
  addComeviewNgEntry,
  removeComeviewNgEntry,
  extractUserCommentRows,
  COMEVIEW_NG_STORAGE_KEY
} from '../lib/comeviewActions.js';
import {
  normalizeComeviewUserNotes,
  upsertComeviewUserNote,
  resolveComeviewDisplayName,
  formatComeviewTime,
  COMEVIEW_USER_NOTES_KEY
} from '../lib/comeviewUserNotes.js';
import {
  comeviewTimelineItemSignature,
  filterVisibleComeviewTimeline,
  keepLatestComeviewTimelineItems,
  pickNewComeviewTimelineItems,
  pickAppendedComeviewSnapshotRows,
  selectAppendedComeviewTimelineItems,
  isComeviewNearBottom
} from '../lib/comeviewInstantRender.js';

/** POP のタイムラインと同じ既定アバター(extension ルート相対・popup.html と同一)。 */
const DEFAULT_TILE_IMG =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
/** POP と同じ表示上限。 */
const TIMELINE_LIMIT = 120;
const HOT_POLL_INTERVAL_MS = 5000;
const RECONCILE_INTERVAL_MS = 60_000;
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';

let _liveId = '';
let _paused = false;
let _timer = null;
let _lastReconcileAt = 0;
let _fullRefreshPromise = null;
let _fullRefreshRequested = false;
let _fullRefreshForceBottom = false;
let _fullRefreshRunning = false;
/** @type {Array<Record<string, unknown>>} */
let _tailRows = [];
/** @type {Array<Record<string, unknown>>} */
let _giftRows = [];
/** @type {Array<Record<string, unknown>>|null} */
let _deferredTailRows = null;
/** @type {Array<Record<string, unknown>>|null} */
let _deferredGiftRows = null;
/** @type {Set<string>} 現在 DOM にある TimelineItem.key。 */
const _renderedKeys = new Set();
/** @type {Map<string, import('../lib/supportActivityTimeline.js').TimelineItem>} */
const _timelineItemsByKey = new Map();
let _commentCount = 0;
let _hoverBar = null;
let _hoverRow = null;

/** @type {Array<{key:string,name:string,at:number}>} ユーザーNG リスト(storage 永続)。 */
let _ngList = [];
/** @type {Set<string>} NG 中ユーザーキー(高速判定用)。 */
let _ngKeys = new Set();
/** @type {Record<string,{nickname:string,label:string,memo:string,at:number}>} ユーザーノート。 */
let _userNotes = {};
/** @type {Record<string,{nickname?:string,avatarUrl?:string}>} プロフィールキャッシュ(POPと同一情報源)。 */
let _profileCache = {};
/** @type {Set<string>} 行単位で隠したシグネチャ(この窓だけ・セッション限り)。 */
const _hiddenSigs = new Set();
/** @type {string} 表示中ピンの内容(再描画抑止用)。 */
let _pinShownSig = '';

/**
 * v0.1.677: ホバーアクション(わんコメ同型)のモノクロ SVG アイコン。
 * 固定定数のみ=ユーザー由来文字列は混ぜない(innerHTML 安全)。fill は CSS の currentColor。
 */
const CV_ACTION_ICONS = {
  trash:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9zm4 2v9h2v-9h-2zm4 0v9h2v-9h-2z"/></svg>',
  block:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4 12a8 8 0 0 1 12.9-6.3L5.7 16.9A7.96 7.96 0 0 1 4 12zm8 8a7.96 7.96 0 0 1-4.9-1.7L18.3 7.1A8 8 0 0 1 12 20z"/></svg>',
  person:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v2h16v-2c0-3.3-4.7-5-8-5z"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
  pin:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5l-2 3v2h5v6l1 1 1-1v-6h5v-2l-2-3z"/></svg>'
};

function resolveLiveIdFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search).get('lv') || '';
    const m = String(p).trim().toLowerCase().match(/lv\d{1,15}/);
    if (m) return m[0];
  } catch {
    /* no-op */
  }
  return '';
}

async function resolveLiveIdFromStorage() {
  try {
    const bag = await chrome.storage.local.get(KEY_LAST_WATCH_URL);
    const url = String(bag[KEY_LAST_WATCH_URL] || '');
    const m = url.toLowerCase().match(/lv\d{1,15}/);
    if (m) return m[0];
  } catch {
    /* no-op */
  }
  return '';
}

function isObsMode() {
  try {
    return new URLSearchParams(window.location.search).get('obs') === '1';
  } catch {
    return false;
  }
}

/**
 * v0.1.674: ?user=<uid>(&uname=<表示名>) で起動されたら詳細パネルを自動で開く。
 * uname が自動生成の「匿名NNN」なら持ち込まない(コメビュ側で同じ番号を再生成する)。
 */
function resolveDetailRequestFromUrl() {
  try {
    const sp = new URLSearchParams(window.location.search);
    const uid = String(sp.get('user') || '').trim();
    if (!uid || uid.length > 128) return null;
    let name = String(sp.get('uname') || '').trim();
    if (/^匿名\d{1,3}$/.test(name)) name = '';
    return { userId: uid, name };
  } catch {
    return null;
  }
}

const AVATAR_COLORS = ['#0f8fd8', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
function avatarColor(seed) {
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initial(name) {
  const s = String(name || '').trim();
  return s ? s.slice(0, 1) : '★';
}

function copyTextToClipboard(text) {
  const t = String(text || '');
  if (!t) return;
  try {
    void navigator.clipboard.writeText(t);
    return;
  } catch {
    /* fallthrough */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch {
    /* no-op */
  }
}

// ── NG(非表示)管理 ─────────────────────────────────────────────
function persistNgList() {
  try {
    void chrome.storage.local.set({ [COMEVIEW_NG_STORAGE_KEY]: _ngList });
  } catch {
    /* no-op */
  }
}

function setNgList(next) {
  _ngList = next;
  _ngKeys = new Set(next.map((e) => e.key));
  persistNgList();
  updateNgButton();
  void requestFullRefresh();
}

function addNg(row) {
  const { list, added } = addComeviewNgEntry(_ngList, row, Date.now());
  if (!added) return;
  setNgList(list);
}

function updateNgButton() {
  const btn = document.getElementById('cvBtnNg');
  if (!btn) return;
  const n = _ngList.length;
  btn.textContent = `NG ${n}`;
  btn.style.display = n > 0 ? '' : 'none';
}

async function loadNgList() {
  try {
    const bag = await chrome.storage.local.get(COMEVIEW_NG_STORAGE_KEY);
    _ngList = normalizeComeviewNgList(bag[COMEVIEW_NG_STORAGE_KEY]);
    _ngKeys = new Set(_ngList.map((e) => e.key));
  } catch {
    _ngList = [];
    _ngKeys = new Set();
  }
  updateNgButton();
}

// ── ユーザーノート(ニックネーム/ラベル/メモ・匿名OK) ─────────────
function saveUserNotePatch(ukey, patch) {
  if (!ukey) return;
  _userNotes = upsertComeviewUserNote(_userNotes, ukey, patch, Date.now());
  try {
    void chrome.storage.local.set({ [COMEVIEW_USER_NOTES_KEY]: _userNotes });
  } catch {
    /* no-op */
  }
}

// ── 画面内パネル(ユーザー詳細/NG 管理) ─────────────────────────
function openPanel(title) {
  const panel = document.getElementById('cvPanel');
  const titleEl = document.getElementById('cvPanelTitle');
  const bodyEl = document.getElementById('cvPanelBody');
  if (!panel || !titleEl || !bodyEl) return null;
  titleEl.textContent = title;
  bodyEl.textContent = '';
  panel.style.display = '';
  return bodyEl;
}

function closePanel() {
  const panel = document.getElementById('cvPanel');
  if (panel) panel.style.display = 'none';
}

/**
 * ユーザー詳細パネル(わんコメ式+追憶独自):
 *   サムネ・名前・ID・コピー・↗ユーザーページ(セット原則)+ニックネーム/ラベル/メモ
 *   (匿名にも付けられる)+この配信での発言一覧(本体アーカイブから・時刻付き)+NG。
 */
async function showUserDetail(row) {
  row = mergeComeviewRowWithProfile(row, _profileCache) || row;
  const ukey = comeviewUserKeyForRow(row);
  if (!ukey || !_liveId) return;
  const label =
    resolveComeviewDisplayName(row, _userNotes, ukey) || row.userId || 'この人';
  const bodyEl = openPanel(`👤 ${label}`);
  if (!bodyEl) return;

  // --- ヘッダ: サムネ・名前・ID・リンクは「分かる限りセット」で出す ---
  const head = document.createElement('div');
  head.className = 'cv-detail-head';
  const avatarUrl = resolveComeviewAvatarUrl(row);
  if (avatarUrl) {
    const av = document.createElement('img');
    av.className = 'cv-detail-avatar';
    av.src = avatarUrl;
    av.alt = '';
    av.onerror = () => {
      const fb = document.createElement('div');
      fb.className = 'cv-avatar-fallback cv-detail-avatar';
      fb.style.background = avatarColor(row.userId || row.name);
      fb.textContent = initial(label);
      av.replaceWith(fb);
    };
    head.appendChild(av);
  } else {
    const fb = document.createElement('div');
    fb.className = 'cv-avatar-fallback cv-detail-avatar';
    fb.style.background = avatarColor(row.userId || row.name);
    fb.textContent = initial(label);
    head.appendChild(fb);
  }
  const headBody = document.createElement('div');
  headBody.className = 'cv-detail-head-body';
  const headName = document.createElement('div');
  headName.className = 'cv-detail-name';
  headName.textContent = label;
  headBody.appendChild(headName);
  const idLine = document.createElement('div');
  idLine.className = 'cv-detail-id';
  const idText = document.createElement('span');
  idText.textContent = row.userId ? `ID: ${row.userId}` : '(名前のみ・ID なし)';
  idLine.appendChild(idText);
  if (row.userId) {
    const cp = document.createElement('button');
    cp.type = 'button';
    cp.className = 'cv-panel-unng';
    cp.textContent = 'コピー';
    cp.addEventListener('click', () => copyTextToClipboard(row.userId));
    idLine.appendChild(cp);
  }
  const pageUrl = comeviewUserPageUrl(row.userId);
  if (pageUrl) {
    const lk = document.createElement('button');
    lk.type = 'button';
    lk.className = 'cv-panel-unng';
    lk.textContent = '↗ ユーザーページ';
    lk.title = 'ニコニコのユーザーページを開く';
    lk.addEventListener('click', () => {
      try {
        void chrome.tabs.create({ url: pageUrl });
      } catch {
        window.open(pageUrl, '_blank', 'noopener');
      }
    });
    idLine.appendChild(lk);
  }
  // NG(この人を非表示)。一覧の行からではなく詳細から行う(POP 同一描画を崩さない)。
  const ngBtn = document.createElement('button');
  ngBtn.type = 'button';
  ngBtn.className = 'cv-panel-unng';
  ngBtn.textContent = '🚫 非表示';
  ngBtn.title = 'この人のコメントをコメビュで非表示にする(ヘッダの NG から解除可)';
  ngBtn.addEventListener('click', () => {
    addNg(row);
    closePanel();
  });
  idLine.appendChild(ngBtn);
  headBody.appendChild(idLine);
  head.appendChild(headBody);
  bodyEl.appendChild(head);

  // --- ニックネーム/ラベル/メモ(変更したら即保存・匿名にも付けられる) ---
  const note = _userNotes[ukey] || { nickname: '', label: '', memo: '' };
  const form = document.createElement('div');
  form.className = 'cv-detail-form';
  const mkField = (caption, placeholder, value, field, multiline) => {
    const wrap = document.createElement('label');
    wrap.className = 'cv-detail-field';
    const cap = document.createElement('span');
    cap.textContent = caption;
    wrap.appendChild(cap);
    const input = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) input.type = 'text';
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener('change', () =>
      saveUserNotePatch(ukey, { [field]: input.value })
    );
    wrap.appendChild(input);
    form.appendChild(wrap);
  };
  mkField(
    'ニックネーム(あなた用のメモ名・匿名にも付けられます)',
    '例: 常連の柿ピーさん',
    note.nickname,
    'nickname',
    false
  );
  mkField('ラベル', '例: 常連 / 初見', note.label, 'label', false);
  mkField('メモ(自分用・画面には出ません)', '', note.memo, 'memo', true);
  bodyEl.appendChild(form);

  const loading = document.createElement('div');
  loading.className = 'cv-panel-note';
  loading.textContent = 'アーカイブから読み込み中…';
  bodyEl.appendChild(loading);

  // --- この配信での発言一覧(本体アーカイブから・クリック時だけ一度読む) ---
  let rawRows = [];
  try {
    rawRows = await readCanonicalComments(_liveId);
  } catch {
    rawRows = [];
  }

  const { rows, total } = extractUserCommentRows(rawRows, ukey, 200);
  loading.remove();
  const countNote = document.createElement('div');
  countNote.className = 'cv-panel-note';
  countNote.textContent = total
    ? `この配信での発言 全 ${total} 件${total > rows.length ? `(新しい ${rows.length} 件を表示)` : ''}`
    : 'この配信の記録にはまだ発言がありません';
  bodyEl.appendChild(countNote);
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const line = document.createElement('div');
    line.className = 'cv-panel-row';
    const no = document.createElement('span');
    no.className = 'cv-panel-no';
    no.textContent = r.no != null ? `#${r.no}` : '·';
    line.appendChild(no);
    const tx = document.createElement('span');
    tx.className = 'cv-panel-text';
    tx.textContent = r.text;
    line.appendChild(tx);
    const tm = document.createElement('span');
    tm.className = 'cv-panel-time';
    tm.textContent = formatComeviewTime(r.capturedAt);
    line.appendChild(tm);
    frag.appendChild(line);
  }
  bodyEl.appendChild(frag);
  bodyEl.scrollTop = bodyEl.scrollHeight;
}

/** NG 管理パネル(サムネ・名前・ID セット+解除ボタン)。 */
function showNgPanel() {
  const bodyEl = openPanel('🚫 非表示にした人');
  if (!bodyEl) return;
  if (!_ngList.length) {
    const note = document.createElement('div');
    note.className = 'cv-panel-note';
    note.textContent = '非表示中のユーザーはいません';
    bodyEl.appendChild(note);
    return;
  }
  for (const e of [..._ngList].reverse()) {
    const line = document.createElement('div');
    line.className = 'cv-panel-row';
    const uid = e.key.startsWith('u:') ? e.key.slice(2) : '';
    const avatarUrl = resolveComeviewAvatarUrl({ avatar: '', userId: uid });
    if (avatarUrl) {
      const av = document.createElement('img');
      av.className = 'cv-ng-avatar';
      av.src = avatarUrl;
      av.alt = '';
      av.onerror = () => av.remove();
      line.appendChild(av);
    }
    const nm = document.createElement('span');
    nm.className = 'cv-panel-text';
    nm.textContent =
      e.name || resolveComeviewDisplayName({ userId: uid, name: '' }, {}, '') || e.key;
    line.appendChild(nm);
    if (uid) {
      const idSpan = document.createElement('span');
      idSpan.className = 'cv-panel-time';
      idSpan.textContent = uid;
      line.appendChild(idSpan);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cv-panel-unng';
    btn.textContent = '解除';
    btn.addEventListener('click', () => {
      setNgList(removeComeviewNgEntry(_ngList, e.key));
      line.remove();
    });
    line.appendChild(btn);
    bodyEl.appendChild(line);
  }
}

// ── 一覧描画: POP の応援タイムラインと同一パイプライン ─────────────
/**
 * コメント本体を POP の readAllCommentsForLive と同じ優先順で読む:
 *   IDB(SW 集約書きの正本・uid/名前が揃う) > チャンク/main +テール。
 *   実機(lv350667621)で「チャンクだけ読むと uid 無しの劣化行・IDB は enriched」と確認済み。
 * @param {string} lv
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function readCanonicalComments(lv) {
  let rows = [];
  if (isCommentDbAvailable()) {
    let db = null;
    try {
      db = await openCommentDb();
      const cnt = await countCommentsForLiveDb(db, lv);
      if (cnt > 0) {
        const dbRows = await readAllCommentsFromDb(db, lv);
        if (Array.isArray(dbRows) && dbRows.length) rows = dbRows;
      }
    } catch {
      /* fallthrough: chunk 経路へ */
    } finally {
      try {
        if (db) db.close();
      } catch {
        /* no-op */
      }
    }
  }
  if (!rows.length) {
    try {
      const res = await readChunkedComments(lv, commentsStorageKey(lv), (keys) =>
        chrome.storage.local.get(keys)
      );
      rows = Array.isArray(res.rows) ? res.rows : [];
    } catch {
      rows = [];
    }
  }
  try {
    const tKey = tailStorageKey(lv);
    const bag = await chrome.storage.local.get(tKey);
    rows = combineCanonicalComeviewRows(rows, Array.isArray(bag[tKey]) ? bag[tKey] : []);
  } catch {
    /* テールは任意 */
  }
  return rows;
}

function updateCommentCount() {
  const countEl = document.getElementById('cvCount');
  if (countEl) countEl.textContent = `${_commentCount} 件`;
}

/**
 * 現在の全入力を時系列昇順へ統合する。共有 builder の asc+limit は古い側から
 * limit 件を返すため、ここでは全候補を通してから末尾120件へ絞る。
 */
function buildAllComeviewTimeline(comments, gifts) {
  const commentList = Array.isArray(comments) ? comments : [];
  const giftList = Array.isArray(gifts) ? gifts : [];
  return buildSupportActivityTimeline(commentList, giftList, {
    order: 'asc',
    limit: Math.max(TIMELINE_LIMIT, commentList.length + giftList.length)
  });
}

function timelineRowHtml(item) {
  return buildTimelineRowHtml(item, {
    defaultAvatar: DEFAULT_TILE_IMG,
    now: Date.now()
  });
}

function rememberTimelineElement(element, item, animate) {
  if (!(element instanceof HTMLElement) || !item?.key) return;
  element.dataset.cvKey = item.key;
  if (animate) element.classList.add('cv-row-in');
  _renderedKeys.add(item.key);
  _timelineItemsByKey.set(item.key, item);
}

function forgetTimelineElement(element) {
  if (!(element instanceof HTMLElement)) return;
  const key = element.dataset.cvKey || '';
  if (key) {
    _renderedKeys.delete(key);
    _timelineItemsByKey.delete(key);
  }
  if (_hoverRow === element) hideHoverBar();
}

function renderFullTimeline(timeline, forceBottom = false) {
  const listEl = document.getElementById('cvList');
  if (!listEl) return;
  const wasNearBottom =
    forceBottom ||
    isComeviewNearBottom({
      scrollTop: listEl.scrollTop,
      clientHeight: listEl.clientHeight,
      scrollHeight: listEl.scrollHeight
    });
  const bottomGap = Math.max(
    0,
    listEl.scrollHeight - listEl.clientHeight - listEl.scrollTop
  );

  hideHoverBar();
  _renderedKeys.clear();
  _timelineItemsByKey.clear();
  listEl.innerHTML = timeline.length
    ? timeline.map((item) => timelineRowHtml(item)).join('')
    : '<p class="nl-support-timeline__empty">まだコメントもギフトもありません（記録ONで時系列にたまります）</p>';

  const elements = Array.from(listEl.children).filter((element) =>
    element.matches('.nl-tl-row, .nl-tl-gift')
  );
  elements.forEach((element, index) =>
    rememberTimelineElement(element, timeline[index], false)
  );

  if (wasNearBottom) {
    listEl.scrollTop = listEl.scrollHeight;
  } else {
    listEl.scrollTop = Math.max(
      0,
      listEl.scrollHeight - listEl.clientHeight - bottomGap
    );
  }
}

function appendTimelineItems(items) {
  const listEl = document.getElementById('cvList');
  if (!listEl || !items.length) return;
  const shouldFollow = isComeviewNearBottom({
    scrollTop: listEl.scrollTop,
    clientHeight: listEl.clientHeight,
    scrollHeight: listEl.scrollHeight
  });
  const empty = listEl.querySelector('.nl-support-timeline__empty, #cvEmpty');
  if (empty) empty.remove();

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const template = document.createElement('template');
    template.innerHTML = timelineRowHtml(item).trim();
    const element = template.content.firstElementChild;
    if (!element) continue;
    rememberTimelineElement(element, item, true);
    fragment.appendChild(element);
  }
  listEl.appendChild(fragment);

  let rows = listEl.querySelectorAll('[data-cv-key]');
  while (rows.length > TIMELINE_LIMIT) {
    const oldest = rows[0];
    forgetTimelineElement(oldest);
    oldest.remove();
    rows = listEl.querySelectorAll('[data-cv-key]');
  }
  if (shouldFollow) listEl.scrollTop = listEl.scrollHeight;
}

function normalizePin(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text || '').trim().slice(0, 500);
  if (!text) return null;
  return {
    name: String(raw.name || '').trim().slice(0, 200),
    text,
    at: Number(raw.at) || 0
  };
}

function renderPin(raw) {
  const pinBar = document.getElementById('cvPinBar');
  if (!pinBar) return;
  const pin = normalizePin(raw);
  const sig = pin ? JSON.stringify(pin) : '';
  if (sig === _pinShownSig) return;
  _pinShownSig = sig;
  pinBar.textContent = '';
  if (!pin) {
    pinBar.style.display = 'none';
    return;
  }

  const icon = document.createElement('span');
  icon.className = 'cv-pin-icon';
  icon.textContent = '📌';
  pinBar.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'cv-pin-body';
  if (pin.name) {
    const name = document.createElement('span');
    name.className = 'cv-pin-name';
    name.textContent = pin.name;
    body.appendChild(name);
  }
  const text = document.createElement('span');
  text.className = 'cv-pin-text';
  text.textContent = pin.text;
  body.appendChild(text);
  pinBar.appendChild(body);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cv-pin-close';
  close.textContent = '✕';
  close.title = 'コメピタを解除';
  close.addEventListener('click', () => {
    if (!_liveId) return;
    renderPin(null);
    try {
      void chrome.storage.local.remove(comeviewPinStorageKey(_liveId));
    } catch {
      /* no-op */
    }
  });
  pinBar.appendChild(close);
  pinBar.style.display = '';
}

function savePin(row) {
  if (!_liveId) return;
  const pin = normalizePin({
    name: row.name,
    text: row.text,
    at: Date.now()
  });
  if (!pin) return;
  renderPin(pin);
  try {
    void chrome.storage.local.set({
      [comeviewPinStorageKey(_liveId)]: pin
    });
  } catch {
    /* no-op */
  }
}

async function performFullRefresh(forceBottom) {
  if (!_liveId) return;
  const lv = _liveId;
  const tKey = tailStorageKey(lv);
  const giftKey = `nls_gift_events_${lv}`;
  const pinKey = comeviewPinStorageKey(lv);
  let bag = {};
  try {
    bag = await chrome.storage.local.get([
      tKey,
      giftKey,
      pinKey,
      COMEVIEW_USER_NOTES_KEY,
      KEY_USER_COMMENT_PROFILE_CACHE
    ]);
  } catch {
    return;
  }

  _tailRows = Array.isArray(bag[tKey]) ? bag[tKey] : [];
  _giftRows = Array.isArray(bag[giftKey]) ? bag[giftKey] : [];
  _userNotes = normalizeComeviewUserNotes(bag[COMEVIEW_USER_NOTES_KEY]);
  _profileCache = normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE]);
  renderPin(bag[pinKey]);

  let comments = await readCanonicalComments(lv);
  if (Object.keys(_profileCache).length) {
    comments = applyUserCommentProfileMapToEntries(comments, _profileCache).next;
  }
  const timeline = keepLatestComeviewTimelineItems(
    filterVisibleComeviewTimeline(
      buildAllComeviewTimeline(comments, _giftRows),
      _ngKeys,
      _hiddenSigs
    ),
    TIMELINE_LIMIT
  );
  _commentCount = comments.length;
  renderFullTimeline(timeline, forceBottom);
  updateCommentCount();
  _lastReconcileAt = Date.now();
}

function requestFullRefresh(forceBottom = false) {
  _fullRefreshRequested = true;
  _fullRefreshForceBottom ||= forceBottom;
  if (_fullRefreshPromise) return _fullRefreshPromise;
  _fullRefreshPromise = (async () => {
    while (_fullRefreshRequested) {
      const nextForceBottom = _fullRefreshForceBottom;
      _fullRefreshRequested = false;
      _fullRefreshForceBottom = false;
      _fullRefreshRunning = true;
      try {
        await performFullRefresh(nextForceBottom);
      } finally {
        _fullRefreshRunning = false;
      }
      await flushDeferredHotSnapshots();
    }
  })().finally(() => {
    _fullRefreshPromise = null;
  });
  return _fullRefreshPromise;
}

function processHotSnapshots(nextTail, nextGifts) {
  const tail = Array.isArray(nextTail) ? nextTail : [];
  const gifts = Array.isArray(nextGifts) ? nextGifts : [];
  if (_paused || document.hidden || _fullRefreshRunning) {
    _deferredTailRows = tail;
    _deferredGiftRows = gifts;
    return;
  }

  const addedComments = pickAppendedComeviewSnapshotRows(
    _tailRows,
    tail,
    'comment'
  );
  const addedGifts = pickAppendedComeviewSnapshotRows(_giftRows, gifts, 'gift');
  _tailRows = tail;
  _giftRows = gifts;
  if (!addedComments.length && !addedGifts.length) return;

  let profiledTail = tail;
  if (Object.keys(_profileCache).length) {
    profiledTail = applyUserCommentProfileMapToEntries(tail, _profileCache).next;
  }
  const appended = selectAppendedComeviewTimelineItems(
    buildAllComeviewTimeline(profiledTail, gifts),
    addedComments,
    addedGifts
  );
  const unseen = pickNewComeviewTimelineItems(appended, _renderedKeys);
  _commentCount += unseen.filter((item) => item.kind === 'comment').length;
  appendTimelineItems(
    filterVisibleComeviewTimeline(unseen, _ngKeys, _hiddenSigs)
  );
  updateCommentCount();
}

async function flushDeferredHotSnapshots() {
  if (!_deferredTailRows && !_deferredGiftRows) return;
  const tail = _deferredTailRows || _tailRows;
  const gifts = _deferredGiftRows || _giftRows;
  _deferredTailRows = null;
  _deferredGiftRows = null;
  processHotSnapshots(tail, gifts);
}

async function pollHotSnapshots() {
  if (_paused || document.hidden || !_liveId || _fullRefreshRunning) return;
  const tKey = tailStorageKey(_liveId);
  const giftKey = `nls_gift_events_${_liveId}`;
  try {
    const bag = await chrome.storage.local.get([tKey, giftKey]);
    processHotSnapshots(
      Array.isArray(bag[tKey]) ? bag[tKey] : [],
      Array.isArray(bag[giftKey]) ? bag[giftKey] : []
    );
  } catch {
    /* 次の onChanged / poll で再試行 */
  }
}

async function timerTick() {
  if (_paused || document.hidden) return;
  if (Date.now() - _lastReconcileAt >= RECONCILE_INTERVAL_MS) {
    await requestFullRefresh();
    return;
  }
  await pollHotSnapshots();
}

function startTimer() {
  if (_timer != null) return;
  _timer = window.setInterval(() => void timerTick(), HOT_POLL_INTERVAL_MS);
}
function stopTimer() {
  if (_timer != null) {
    clearInterval(_timer);
    _timer = null;
  }
}

function hideHoverBar() {
  if (_hoverBar) {
    _hoverBar.classList.remove('is-visible');
    _hoverBar.style.display = 'none';
  }
  _hoverRow = null;
}

function actionDataForTimelineRow(element, item) {
  const name =
    element.querySelector('.nl-tl-row__name, .nl-tl-gift__name')?.textContent?.trim() ||
    String(item?.nickname || '').trim();
  const userId =
    element.getAttribute('data-nl-uid') || String(item?.userId || '').trim();
  let text = '';
  if (item?.kind === 'gift') {
    const itemName = String(item.itemName || 'ギフト').trim();
    const point = Number(item.point) || 0;
    text = point > 0 ? `${itemName}（${point.toLocaleString('ja-JP')}pt）` : itemName;
  } else {
    text =
      element.querySelector('.nl-tl-row__text')?.textContent?.trim() ||
      String(item?.text || '').trim();
  }
  return {
    id: String(item?.key || ''),
    no: item?.kind === 'comment' ? item.commentNo : null,
    name,
    text,
    userId,
    avatar: String(item?.avatarUrl || ''),
    selfPosted: item?.selfPosted === true,
    capturedAt: Number(item?.at) || null
  };
}

function positionHoverBar() {
  if (!_hoverBar || !_hoverRow || !_hoverRow.isConnected) {
    hideHoverBar();
    return;
  }
  const rect = _hoverRow.getBoundingClientRect();
  const width = _hoverBar.offsetWidth;
  const height = _hoverBar.offsetHeight;
  const left = Math.max(4, Math.min(window.innerWidth - width - 4, rect.right - width - 4));
  const top = Math.max(4, Math.min(window.innerHeight - height - 4, rect.top + 2));
  _hoverBar.style.left = `${left}px`;
  _hoverBar.style.top = `${top}px`;
}

function showHoverBar(row) {
  if (isObsMode() || !_hoverBar || !(row instanceof HTMLElement)) return;
  const key = row.dataset.cvKey || '';
  const item = _timelineItemsByKey.get(key);
  if (!item) return;
  _hoverRow = row;
  const userId = String(item.userId || '').trim();
  for (const button of _hoverBar.querySelectorAll('button[data-cv-action]')) {
    const action = button.dataset.cvAction;
    button.disabled = (action === 'block' || action === 'person') && !userId;
  }
  _hoverBar.style.display = 'flex';
  _hoverBar.classList.add('is-visible');
  positionHoverBar();
}

function createHoverBar() {
  if (isObsMode() || _hoverBar) return;
  const bar = document.createElement('div');
  bar.className = 'cv-hover-actions';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'コメント操作');
  const actions = [
    ['trash', 'この行を隠す'],
    ['block', 'この人を非表示'],
    ['person', 'この人の詳細'],
    ['copy', '名前と本文をコピー'],
    ['pin', 'コメピタ']
  ];
  for (const [action, label] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cvAction = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = CV_ACTION_ICONS[action];
    bar.appendChild(button);
  }
  bar.addEventListener('mouseenter', () => {
    if (_hoverRow) bar.classList.add('is-visible');
  });
  bar.addEventListener('mouseleave', (event) => {
    if (
      _hoverRow &&
      event.relatedTarget instanceof Node &&
      _hoverRow.contains(event.relatedTarget)
    ) {
      return;
    }
    hideHoverBar();
  });
  bar.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest('button[data-cv-action]')
        : null;
    if (!button || button.disabled || !_hoverRow) return;
    event.preventDefault();
    event.stopPropagation();
    const key = _hoverRow.dataset.cvKey || '';
    const item = _timelineItemsByKey.get(key);
    if (!item) return;
    const row = actionDataForTimelineRow(_hoverRow, item);
    switch (button.dataset.cvAction) {
      case 'trash': {
        const sig = comeviewTimelineItemSignature(item);
        if (sig) _hiddenSigs.add(sig);
        const target = _hoverRow;
        forgetTimelineElement(target);
        target.remove();
        hideHoverBar();
        break;
      }
      case 'block':
        addNg(row);
        hideHoverBar();
        break;
      case 'person':
        void showUserDetail(row);
        hideHoverBar();
        break;
      case 'copy':
        copyTextToClipboard(buildComeviewCopyText(row));
        hideHoverBar();
        break;
      case 'pin':
        savePin(row);
        hideHoverBar();
        break;
      default:
        break;
    }
  });
  document.body.appendChild(bar);
  _hoverBar = bar;
}

function wireStorageChanges() {
  if (!_liveId) return;
  const tKey = tailStorageKey(_liveId);
  const giftKey = `nls_gift_events_${_liveId}`;
  const pinKey = comeviewPinStorageKey(_liveId);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[pinKey]) renderPin(changes[pinKey].newValue);
    if (changes[COMEVIEW_USER_NOTES_KEY]) {
      _userNotes = normalizeComeviewUserNotes(
        changes[COMEVIEW_USER_NOTES_KEY].newValue
      );
    }
    if (changes[KEY_USER_COMMENT_PROFILE_CACHE]) {
      _profileCache = normalizeUserCommentProfileMap(
        changes[KEY_USER_COMMENT_PROFILE_CACHE].newValue
      );
    }
    if (changes[COMEVIEW_NG_STORAGE_KEY]) {
      const next = normalizeComeviewNgList(
        changes[COMEVIEW_NG_STORAGE_KEY].newValue
      );
      if (JSON.stringify(next) !== JSON.stringify(_ngList)) {
        _ngList = next;
        _ngKeys = new Set(next.map((entry) => entry.key));
        updateNgButton();
        void requestFullRefresh();
      }
    }
    if (changes[tKey] || changes[giftKey]) {
      processHotSnapshots(
        changes[tKey]
          ? Array.isArray(changes[tKey].newValue)
            ? changes[tKey].newValue
            : []
          : _tailRows,
        changes[giftKey]
          ? Array.isArray(changes[giftKey].newValue)
            ? changes[giftKey].newValue
            : []
          : _giftRows
      );
    }
  });
}

function wireButtons() {
  const btnWin = document.getElementById('cvBtnWindow');
  if (btnWin) {
    btnWin.addEventListener('click', () => {
      const url = chrome.runtime.getURL(
        `comeview.html?lv=${encodeURIComponent(_liveId)}`
      );
      try {
        chrome.windows.create({ url, type: 'popup', width: 400, height: 640 });
      } catch {
        window.open(url, '_blank', 'width=400,height=640');
      }
    });
  }
  const btnObs = document.getElementById('cvBtnObs');
  if (btnObs) {
    btnObs.addEventListener('click', () => {
      const url = chrome.runtime.getURL(
        `comeview.html?lv=${encodeURIComponent(_liveId)}&obs=1`
      );
      try {
        chrome.windows.create({ url, type: 'popup', width: 400, height: 640 });
      } catch {
        window.open(url, '_blank', 'width=400,height=640');
      }
    });
  }
  const btnPause = document.getElementById('cvBtnPause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      _paused = !_paused;
      btnPause.textContent = _paused ? '再開' : '一時停止';
      if (!_paused) {
        if (Date.now() - _lastReconcileAt >= RECONCILE_INTERVAL_MS) {
          void requestFullRefresh();
        } else {
          void flushDeferredHotSnapshots();
          void pollHotSnapshots();
        }
      }
    });
  }
  const btnNg = document.getElementById('cvBtnNg');
  if (btnNg) btnNg.addEventListener('click', () => showNgPanel());
  const btnPanelClose = document.getElementById('cvPanelClose');
  if (btnPanelClose) btnPanelClose.addEventListener('click', () => closePanel());

  // 行クリック→ユーザー詳細(POP のタイムラインと同じ data-nl-uid 属性を使う)。
  const listEl = document.getElementById('cvList');
  if (listEl) {
    listEl.addEventListener('mouseover', (event) => {
      const row =
        event.target instanceof Element
          ? event.target.closest('.nl-tl-row, .nl-tl-gift')
          : null;
      if (row && listEl.contains(row)) showHoverBar(row);
    });
    listEl.addEventListener('mouseleave', (event) => {
      if (
        _hoverBar &&
        event.relatedTarget instanceof Node &&
        _hoverBar.contains(event.relatedTarget)
      ) {
        return;
      }
      hideHoverBar();
    });
    listEl.addEventListener('scroll', () => hideHoverBar(), { passive: true });
    listEl.addEventListener('click', (ev) => {
      const t =
        ev.target instanceof Element ? ev.target.closest('[data-nl-uid]') : null;
      if (!t) return;
      ev.preventDefault();
      const uid = t.getAttribute('data-nl-uid') || '';
      if (!uid) return;
      const key = t instanceof HTMLElement ? t.dataset.cvKey || '' : '';
      const item = _timelineItemsByKey.get(key);
      if (item) {
        void showUserDetail(actionDataForTimelineRow(t, item));
        return;
      }
      let uname = t.getAttribute('data-nl-uname') || '';
      if (/^匿名\d{1,3}$/.test(uname)) uname = '';
      void showUserDetail({ name: uname, text: '', userId: uid });
    });
  }
  createHoverBar();
  window.addEventListener('resize', () => hideHoverBar(), { passive: true });
}

async function main() {
  if (isObsMode()) document.body.classList.add('is-obs');
  _liveId = resolveLiveIdFromUrl() || (await resolveLiveIdFromStorage());
  const meta = document.getElementById('cvLiveMeta');
  if (meta) meta.textContent = _liveId ? _liveId : '配信が見つかりません';
  wireButtons();
  await loadNgList();
  wireStorageChanges();
  await requestFullRefresh(true);
  // パネルのタイムライン行クリックから ?user= 付きで開かれたら、詳細を自動で開く。
  const detailReq = resolveDetailRequestFromUrl();
  if (detailReq) {
    void showUserDetail({
      id: '',
      no: null,
      name: detailReq.name,
      text: '',
      userId: detailReq.userId,
      avatar: '',
      selfPosted: false,
      capturedAt: null
    });
  }
  startTimer();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer();
    else {
      startTimer();
      if (Date.now() - _lastReconcileAt >= RECONCILE_INTERVAL_MS) {
        void requestFullRefresh();
      } else {
        void flushDeferredHotSnapshots();
        void pollHotSnapshots();
      }
    }
  });
}

void main();
