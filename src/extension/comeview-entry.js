// @ts-nocheck — comeview UI: read-only DOM/Chrome API。popup と独立。
/**
 * v0.1.652: 独自コメビュ「KIRAMEKI Comment View」(comeview.html)。
 *
 * 設計(会議 wf_66d21f13-078 + ユーザー指摘): わんコメの「飲みやすさ=普段ずっと開ける
 *   読みやすさ」をまず土台にする。切り離し可能な独立ウィンドウ。?obs=1 で透過=OBS向け。
 *   弾幕/3キャラ演出は後段PR(土台 danmakuLaneScheduler.js は実装済)。
 *
 * v0.1.666: コメント単位アクション(わんコメ同等+追憶独自)。
 *   ホバーで 📋コピー / 📌ピン留め / ✕この行を隠す / 🚫この人を非表示 / 🕘この人の発言。
 *   - ピン留めは storage(nls_comeview_pin_<lv>)経由で同じ配信の全コメビュ窓(OBS透過窓
 *     含む)に同期=配信者が質問を画面に固定できる。
 *   - NG はグローバル(nls_comeview_ng_v1)で配信を跨いで効く。ヘッダの NG ボタンから解除。
 *   - 「この人の発言」はクリック時だけ全件アーカイブ(チャンク)を一度読み、その人の
 *     全コメントを表示する(わんコメ/NCV に無い追憶だけの武器)。定期読みはしない=軽さ不変。
 *
 * ほぼリードオンリー: 定期処理は read だけ・background SW を起こさない・popup の重い初期化と
 *   独立。書込は「ユーザー操作したときの小さな UI 状態(NG リスト/ピン)」のみ。
 *   入力源(軽量・既存キー): nls_cdb_summary_<lv>.recent + nls_ctail_<lv>(SW を起こさず読める)。
 *   全件配列は定期では読まない=普段使いで延々開いても軽い。
 *
 * @module comeview-entry
 */

import { commentDbSummaryKey } from '../lib/storageKeys.js';
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import { summaryStorageKey } from '../lib/commentSummary.js';
import {
  buildComeviewRows,
  pickNewComeviewRows,
  COMEVIEW_MAX_ROWS
} from '../lib/comeviewRows.js';
import {
  comeviewUserKeyForRow,
  buildComeviewCopyText,
  normalizeComeviewNgList,
  addComeviewNgEntry,
  removeComeviewNgEntry,
  isComeviewRowHidden,
  extractUserCommentRows,
  comeviewPinStorageKey,
  COMEVIEW_NG_STORAGE_KEY
} from '../lib/comeviewActions.js';
import {
  chunkIndexKey,
  chunkKeysFromIndex,
  isChunkIndex
} from '../lib/commentChunkStore.js';

const REFRESH_INTERVAL_MS = 1200;
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';

/** @type {Set<string>} 既に画面に出した行 id(差分 append 用)。 */
const _seenIds = new Set();
let _liveId = '';
let _paused = false;
let _timer = null;

/** @type {Array<{key:string,name:string,at:number}>} ユーザーNG リスト(storage 永続)。 */
let _ngList = [];
/** @type {Set<string>} NG 中ユーザーキー(高速判定用)。 */
let _ngKeys = new Set();
/** @type {Set<string>} 行単位の非表示 id(この窓だけ・セッション限り)。 */
const _hiddenIds = new Set();
/** @type {string} 表示中ピンの id(再描画抑止用)。 */
let _pinShownId = '';

/** URL or storage から対象 lv を解決する。 */
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

/** 軽量にコメント行(recent + tail)+ピン状態を読む。SW を起こさない。 */
async function readLightComments(lv) {
  if (!lv) return { rows: [], pin: null };
  const cdbKey = commentDbSummaryKey(lv);
  const csKey = summaryStorageKey(lv);
  const tKey = tailStorageKey(lv);
  const pinKey = comeviewPinStorageKey(lv);
  let bag = {};
  try {
    bag = await chrome.storage.local.get([cdbKey, csKey, tKey, pinKey]);
  } catch {
    return { rows: [], pin: null };
  }
  const cdb = bag[cdbKey];
  const cs = bag[csKey];
  const recent =
    (cdb && Array.isArray(cdb.recent) && cdb.recent) ||
    (cs && Array.isArray(cs.recent) && cs.recent) ||
    [];
  const tail = Array.isArray(bag[tKey]) ? bag[tKey] : [];
  const pinRaw = bag[pinKey];
  const pin =
    pinRaw && typeof pinRaw === 'object' && String(pinRaw.text || '').trim()
      ? pinRaw
      : null;
  // recent(古い→新しい) の後ろに tail(未畳み込み新着) を足す。重複は id で後段 dedupe。
  return { rows: [...recent, ...tail], pin };
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

/** クリップボードへコピー(失敗時は選択コピーにフォールバック)。 */
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

/** NG リストを storage に保存(小さな UI 状態のみ・SW を起こさない)。 */
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
}

/** NG 追加: 既存行も即座に畳む。 */
function addNg(row) {
  const { list, added, key } = addComeviewNgEntry(_ngList, row, Date.now());
  if (!added) return;
  setNgList(list);
  const listEl = document.getElementById('cvList');
  if (listEl && key) {
    for (const el of [...listEl.querySelectorAll('.cv-row')]) {
      if (el.dataset && el.dataset.ukey === key) el.remove();
    }
  }
}

function updateNgButton() {
  const btn = document.getElementById('cvBtnNg');
  if (!btn) return;
  const n = _ngList.length;
  btn.textContent = `NG ${n}`;
  btn.style.display = n > 0 ? '' : 'none';
}

/** ピンを storage に書く(同じ配信の全コメビュ窓へ同期)。null で解除。 */
function persistPin(rowOrNull) {
  if (!_liveId) return;
  const key = comeviewPinStorageKey(_liveId);
  try {
    if (rowOrNull) {
      void chrome.storage.local.set({
        [key]: {
          id: rowOrNull.id,
          name: rowOrNull.name,
          text: rowOrNull.text,
          at: Date.now()
        }
      });
    } else {
      void chrome.storage.local.remove(key);
    }
  } catch {
    /* no-op */
  }
}

/** ピンバーを描画する(pin=null で畳む)。 */
function renderPinBar(pin) {
  const bar = document.getElementById('cvPinBar');
  if (!bar) return;
  const id = pin ? String(pin.id || `${pin.name}:${pin.text}`) : '';
  if (id === _pinShownId) return; // 変化なし
  _pinShownId = id;
  bar.textContent = '';
  if (!pin) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = '';
  const icon = document.createElement('span');
  icon.className = 'cv-pin-icon';
  icon.textContent = '📌';
  bar.appendChild(icon);
  const body = document.createElement('div');
  body.className = 'cv-pin-body';
  if (pin.name) {
    const nm = document.createElement('span');
    nm.className = 'cv-pin-name';
    nm.textContent = pin.name;
    body.appendChild(nm);
  }
  const tx = document.createElement('span');
  tx.className = 'cv-pin-text';
  tx.textContent = String(pin.text || '');
  body.appendChild(tx);
  bar.appendChild(body);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cv-pin-close';
  close.title = 'ピン留めを外す';
  close.textContent = '✕';
  close.addEventListener('click', () => {
    persistPin(null);
    renderPinBar(null);
  });
  bar.appendChild(close);
}

/** 画面内パネル(この人の発言/NG 管理)を開く。 */
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
 * 追憶独自「この人の発言だけ」: クリック時だけ全件アーカイブ(チャンク)を一度読み、
 * その人の全コメントを表示する。定期読みはしない(軽さ不変)。
 */
async function showUserHistory(row) {
  const ukey = comeviewUserKeyForRow(row);
  if (!ukey || !_liveId) return;
  const label = row.name || row.userId || 'この人';
  const bodyEl = openPanel(`🕘 ${label} の発言(この配信)`);
  if (!bodyEl) return;
  const loading = document.createElement('div');
  loading.className = 'cv-panel-note';
  loading.textContent = 'アーカイブから読み込み中…';
  bodyEl.appendChild(loading);

  let rawRows = [];
  try {
    const idxKey = chunkIndexKey(_liveId);
    const idxBag = await chrome.storage.local.get(idxKey);
    const index = idxBag[idxKey];
    if (isChunkIndex(index, _liveId)) {
      const keys = chunkKeysFromIndex(_liveId, index);
      if (keys.length) {
        const bag = await chrome.storage.local.get(keys);
        for (const k of keys) {
          const arr = bag[k];
          if (Array.isArray(arr)) rawRows.push(...arr);
        }
      }
    }
  } catch {
    /* no-op: 取れなければ recent/tail だけで出す */
  }
  if (!rawRows.length) {
    // チャンク未形成の配信は軽量ソース(recent+tail)から。
    const light = await readLightComments(_liveId);
    rawRows = light.rows;
  }

  const { rows, total } = extractUserCommentRows(rawRows, ukey, 200);
  loading.remove();
  const note = document.createElement('div');
  note.className = 'cv-panel-note';
  note.textContent = total
    ? `全 ${total} 件${total > rows.length ? `(新しい ${rows.length} 件を表示)` : ''}`
    : 'この配信の記録にはまだ発言がありません';
  bodyEl.appendChild(note);
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
    frag.appendChild(line);
  }
  bodyEl.appendChild(frag);
  bodyEl.scrollTop = bodyEl.scrollHeight;
}

/** NG 管理パネル(解除ボタン付き一覧)。 */
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
    const nm = document.createElement('span');
    nm.className = 'cv-panel-text';
    nm.textContent = e.name || e.key;
    line.appendChild(nm);
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

/** 1 行の DOM を作る(読みやすさ最優先・アイコン+名前+本文+ホバーアクション)。 */
function buildRowEl(row) {
  const el = document.createElement('div');
  el.className = 'cv-row' + (row.selfPosted ? ' is-self' : '');
  el.dataset.id = row.id;
  const ukey = comeviewUserKeyForRow(row);
  if (ukey) el.dataset.ukey = ukey;

  if (row.avatar) {
    const img = document.createElement('img');
    img.className = 'cv-avatar';
    img.src = row.avatar;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => {
      const fb = document.createElement('div');
      fb.className = 'cv-avatar-fallback';
      fb.style.background = avatarColor(row.userId || row.name);
      fb.textContent = initial(row.name);
      img.replaceWith(fb);
    };
    el.appendChild(img);
  } else {
    const fb = document.createElement('div');
    fb.className = 'cv-avatar-fallback';
    fb.style.background = avatarColor(row.userId || row.name);
    fb.textContent = initial(row.name);
    el.appendChild(fb);
  }

  const body = document.createElement('div');
  body.className = 'cv-body';
  if (row.name) {
    const nm = document.createElement('div');
    nm.className = 'cv-name';
    nm.textContent = row.selfPosted ? `${row.name}（あなた）` : row.name;
    body.appendChild(nm);
  }
  const tx = document.createElement('div');
  tx.className = 'cv-text';
  tx.textContent = row.text;
  body.appendChild(tx);
  el.appendChild(body);

  // ホバーアクション(わんコメ同等+追憶独自)。OBS モードでは CSS で非表示。
  const actions = document.createElement('div');
  actions.className = 'cv-actions';
  const mkBtn = (label, title, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick();
    });
    actions.appendChild(b);
  };
  mkBtn('📋', 'コメントをコピー', () => copyTextToClipboard(buildComeviewCopyText(row)));
  mkBtn('📌', 'ピン留め(全コメビュ窓・OBSにも表示)', () => {
    persistPin(row);
    renderPinBar({ id: row.id, name: row.name, text: row.text });
  });
  mkBtn('✕', 'この行を隠す(この窓だけ)', () => {
    _hiddenIds.add(row.id);
    el.remove();
  });
  if (ukey) {
    mkBtn('🚫', 'この人のコメントを非表示にする', () => addNg(row));
    mkBtn('🕘', 'この人の発言だけ見る(アーカイブから)', () => void showUserHistory(row));
  }
  el.appendChild(actions);
  return el;
}

function pruneOverflow(listEl) {
  while (listEl.childElementCount > COMEVIEW_MAX_ROWS) {
    const first = listEl.firstElementChild;
    if (!first) break;
    if (first.dataset && first.dataset.id) _seenIds.delete(first.dataset.id);
    first.remove();
  }
}

async function refresh() {
  if (_paused || document.hidden) return;
  const listEl = document.getElementById('cvList');
  const emptyEl = document.getElementById('cvEmpty');
  const countEl = document.getElementById('cvCount');
  if (!listEl) return;

  const { rows: raw, pin } = await readLightComments(_liveId);
  renderPinBar(pin);
  const rows = buildComeviewRows(raw, COMEVIEW_MAX_ROWS);
  const fresh = pickNewComeviewRows(rows, _seenIds);

  if (fresh.length) {
    const nearBottom =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80;
    const frag = document.createDocumentFragment();
    let appended = 0;
    for (const r of fresh) {
      _seenIds.add(r.id);
      // NG ユーザー/隠した行は「見たことにして」描画しない(毎 tick 再判定しない)。
      if (isComeviewRowHidden(r, _ngKeys, _hiddenIds)) continue;
      frag.appendChild(buildRowEl(r));
      appended += 1;
    }
    if (appended) {
      if (emptyEl) emptyEl.remove();
      listEl.appendChild(frag);
      pruneOverflow(listEl);
      // 最下部付近に居たときだけ追従(読み返し中は邪魔しない)。
      if (nearBottom) listEl.scrollTop = listEl.scrollHeight;
    }
  }
  if (countEl) countEl.textContent = `${rows.length} 件`;
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
        chrome.windows.create({
          url,
          type: 'popup',
          width: 400,
          height: 640
        });
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

async function main() {
  if (isObsMode()) document.body.classList.add('is-obs');
  _liveId = resolveLiveIdFromUrl() || (await resolveLiveIdFromStorage());
  const meta = document.getElementById('cvLiveMeta');
  if (meta) meta.textContent = _liveId ? _liveId : '配信が見つかりません';
  wireButtons();
  await loadNgList();
  await refresh();
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
