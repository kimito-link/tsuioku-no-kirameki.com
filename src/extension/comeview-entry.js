// @ts-nocheck — comeview UI: read-only DOM/Chrome API。popup と独立。
/**
 * v0.1.652: 独自コメビュ「KIRAMEKI Comment View」(comeview.html)。
 * v0.1.676: ユーザー指示「(自前描画をやめて)そのまま一旦は POP にすればいい」に従い、
 *   一覧描画を【パネルの応援タイムラインと同一パイプライン】に置換した。
 *   - データ: readChunkedComments(本体チャンク正本)+テール+gift_events(POP と同じ)
 *   - 名前/サムネ: applyUserCommentProfileMapToEntries+buildSupportTimelineBodyHtml(POP と同じ)
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
import { buildSupportTimelineBodyHtml } from '../lib/supportTimelineHtml.js';
import {
  normalizeUserCommentProfileMap,
  applyUserCommentProfileMapToEntries
} from '../lib/userCommentProfileCache.js';
import {
  comeviewUserKeyForRow,
  comeviewUserPageUrl,
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

/** POP のタイムラインと同じ既定アバター(extension ルート相対・popup.html と同一)。 */
const DEFAULT_TILE_IMG =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';
/** POP と同じ表示上限。 */
const TIMELINE_LIMIT = 120;
const REFRESH_INTERVAL_MS = 2500;
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';

let _liveId = '';
let _paused = false;
let _timer = null;
/** 再描画スキップ用の入力シグネチャ(変化が無ければ innerHTML を組み直さない)。 */
let _lastRenderSig = '';

/** @type {Array<{key:string,name:string,at:number}>} ユーザーNG リスト(storage 永続)。 */
let _ngList = [];
/** @type {Set<string>} NG 中ユーザーキー(高速判定用)。 */
let _ngKeys = new Set();
/** @type {Record<string,{nickname:string,label:string,memo:string,at:number}>} ユーザーノート。 */
let _userNotes = {};
/** @type {Record<string,{nickname?:string,avatarUrl?:string}>} プロフィールキャッシュ(POPと同一情報源)。 */
let _profileCache = {};

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
  _lastRenderSig = ''; // 次 tick で必ず再描画(NG 反映)
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
  if (isCommentDbAvailable()) {
    let db = null;
    try {
      db = await openCommentDb();
      const cnt = await countCommentsForLiveDb(db, lv);
      if (cnt > 0) {
        const rows = await readAllCommentsFromDb(db, lv);
        if (Array.isArray(rows) && rows.length) return rows;
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
  let rows = [];
  try {
    const res = await readChunkedComments(lv, commentsStorageKey(lv), (keys) =>
      chrome.storage.local.get(keys)
    );
    rows = Array.isArray(res.rows) ? res.rows : [];
  } catch {
    rows = [];
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

/** NG 中ユーザーの行を除く(コメント/ギフト共通)。 */
function filterNgEntries(entries) {
  if (!_ngKeys.size || !Array.isArray(entries)) return entries;
  return entries.filter((e) => {
    if (!e || typeof e !== 'object') return true;
    const key = comeviewUserKeyForRow({
      userId: e.userId,
      name: e.nickname ?? e.name
    });
    return !key || !_ngKeys.has(key);
  });
}

async function refresh() {
  if (_paused || document.hidden) return;
  const listEl = document.getElementById('cvList');
  const countEl = document.getElementById('cvCount');
  if (!listEl || !_liveId) return;
  const lv = _liveId;

  const tKey = tailStorageKey(lv);
  const giftKey = `nls_gift_events_${lv}`;
  let bag = {};
  try {
    bag = await chrome.storage.local.get([
      tKey,
      giftKey,
      COMEVIEW_USER_NOTES_KEY,
      KEY_USER_COMMENT_PROFILE_CACHE
    ]);
  } catch {
    return;
  }
  _userNotes = normalizeComeviewUserNotes(bag[COMEVIEW_USER_NOTES_KEY]);
  _profileCache = normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE]);
  const tail = Array.isArray(bag[tKey]) ? bag[tKey] : [];
  const gifts = Array.isArray(bag[giftKey]) ? bag[giftKey] : [];

  // 本体チャンク(POP と同じ正本)。tick ごとの全読を避けるため、入力が変わった時だけ読む。
  const lastTail = tail.length ? tail[tail.length - 1] : null;
  const sig = JSON.stringify([
    tail.length,
    lastTail ? lastTail.commentNo ?? lastTail.capturedAt ?? '' : '',
    gifts.length,
    Object.keys(_profileCache).length,
    _ngList.length
  ]);
  if (sig === _lastRenderSig) return;

  let comments = await readCanonicalComments(lv);
  if (Object.keys(_profileCache).length) {
    comments = applyUserCommentProfileMapToEntries(comments, _profileCache).next;
  }

  const timeline = buildSupportActivityTimeline(
    filterNgEntries(comments),
    filterNgEntries(gifts),
    { order: 'desc', limit: TIMELINE_LIMIT }
  );
  listEl.innerHTML = buildSupportTimelineBodyHtml(timeline, {
    defaultAvatar: DEFAULT_TILE_IMG,
    now: Date.now()
  });
  _lastRenderSig = sig;
  if (countEl) countEl.textContent = `${comments.length} 件`;
}

function startTimer() {
  if (_timer != null) return;
  _timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
}
function stopTimer() {
  if (_timer != null) {
    clearInterval(_timer);
    _timer = null;
  }
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
    });
  }
  const btnNg = document.getElementById('cvBtnNg');
  if (btnNg) btnNg.addEventListener('click', () => showNgPanel());
  const btnPanelClose = document.getElementById('cvPanelClose');
  if (btnPanelClose) btnPanelClose.addEventListener('click', () => closePanel());

  // 行クリック→ユーザー詳細(POP のタイムラインと同じ data-nl-uid 属性を使う)。
  const listEl = document.getElementById('cvList');
  if (listEl) {
    listEl.addEventListener('click', (ev) => {
      const t =
        ev.target instanceof Element ? ev.target.closest('[data-nl-uid]') : null;
      if (!t) return;
      ev.preventDefault();
      const uid = t.getAttribute('data-nl-uid') || '';
      if (!uid) return;
      let uname = t.getAttribute('data-nl-uname') || '';
      if (/^匿名\d{1,3}$/.test(uname)) uname = '';
      void showUserDetail({
        id: '',
        no: null,
        name: uname,
        text: '',
        userId: uid,
        avatar: '',
        selfPosted: false,
        capturedAt: null
      });
    });
  }
}

async function main() {
  if (isObsMode()) document.body.classList.add('is-obs');
  _liveId = resolveLiveIdFromUrl() || (await resolveLiveIdFromStorage());
  const meta = document.getElementById('cvLiveMeta');
  if (meta) meta.textContent = _liveId ? _liveId : '配信が見つかりません';
  wireButtons();
  await loadNgList();
  await refresh();
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
      void refresh();
    }
  });
}

void main();
