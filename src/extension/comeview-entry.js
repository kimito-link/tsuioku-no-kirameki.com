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

import {
  commentDbSummaryKey,
  KEY_USER_COMMENT_PROFILE_CACHE
} from '../lib/storageKeys.js';
import { normalizeUserCommentProfileMap } from '../lib/userCommentProfileCache.js';
import { tailStorageKey } from '../lib/commentTailBuffer.js';
import { summaryStorageKey } from '../lib/commentSummary.js';
import {
  buildComeviewRows,
  pickNewComeviewRows,
  COMEVIEW_MAX_ROWS
} from '../lib/comeviewRows.js';
import {
  comeviewUserKeyForRow,
  comeviewUserPageUrl,
  resolveComeviewAvatarUrl,
  mergeComeviewRowWithProfile,
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
import {
  normalizeComeviewUserNotes,
  upsertComeviewUserNote,
  resolveComeviewDisplayName,
  formatComeviewTime,
  COMEVIEW_USER_NOTES_KEY
} from '../lib/comeviewUserNotes.js';

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
/** @type {Record<string,{nickname:string,label:string,memo:string,at:number}>} ユーザーノート(配信を跨いで永続)。 */
let _userNotes = {};
/**
 * @type {Record<string,{nickname?:string,avatarUrl?:string}>}
 * プロフィールキャッシュ(nls_user_comment_profile_v1)。パネルの応援タイムラインに
 * 名前・サムネが出るのと同じ情報源をそのまま使う(名前なし行の補完)。
 */
let _profileCache = {};

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

/**
 * v0.1.674: ?user=<uid>(&uname=<表示名>) で起動されたら、そのユーザーの詳細パネルを
 * 自動で開く(パネルの応援タイムラインの行クリックから飛んでくる)。
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

/** 軽量にコメント行(recent + tail)+ピン状態+ユーザーノートを読む。SW を起こさない。 */
async function readLightComments(lv) {
  if (!lv) return { rows: [], pin: null, notes: null };
  const cdbKey = commentDbSummaryKey(lv);
  const csKey = summaryStorageKey(lv);
  const tKey = tailStorageKey(lv);
  const pinKey = comeviewPinStorageKey(lv);
  let bag = {};
  try {
    bag = await chrome.storage.local.get([
      cdbKey,
      csKey,
      tKey,
      pinKey,
      COMEVIEW_USER_NOTES_KEY,
      KEY_USER_COMMENT_PROFILE_CACHE
    ]);
  } catch {
    return { rows: [], pin: null, notes: null };
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
  return {
    rows: [...recent, ...tail],
    pin,
    notes: normalizeComeviewUserNotes(bag[COMEVIEW_USER_NOTES_KEY]),
    profiles: normalizeUserCommentProfileMap(bag[KEY_USER_COMMENT_PROFILE_CACHE])
  };
}

/**
 * v0.1.669: ホバーアクションのモノクロ SVG アイコン(わんコメ同型のすっきりした見た目)。
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

/**
 * 行の名前部分(表示名+ラベルバッジ)を現在のユーザーノートで組み直す。
 * 新規描画(buildRowEl)とニックネーム保存時の追い掛け更新が同じ経路を通る。
 */
function updateRowIdentity(el) {
  if (!el || !el.dataset) return;
  const ukey = el.dataset.ukey || '';
  const rowLike = { userId: el.dataset.uid || '', name: el.dataset.name || '' };
  const displayName = resolveComeviewDisplayName(rowLike, _userNotes, ukey);
  const note = ukey ? _userNotes[ukey] : null;
  const body = el.querySelector('.cv-body');
  let nm = el.querySelector('.cv-name');
  if (!displayName && !(note && note.label)) {
    if (nm) nm.remove();
    return;
  }
  if (!nm) {
    if (!body) return;
    nm = document.createElement('div');
    nm.className = 'cv-name';
    body.insertBefore(nm, body.firstChild);
  }
  nm.textContent = '';
  const nmText = document.createElement('span');
  nmText.className = 'cv-name-text';
  nmText.textContent = el.classList.contains('is-self')
    ? `${displayName}（あなた）`
    : displayName;
  nm.appendChild(nmText);
  if (note && note.label) {
    const chip = document.createElement('span');
    chip.className = 'cv-label-chip';
    chip.textContent = note.label;
    nm.appendChild(chip);
  }
}

/**
 * ユーザーノート(ニックネーム/ラベル/メモ)を保存し、表示中の行へ即反映する。
 * 匿名(a:… ID)にも付けられる=わんコメ式の肝。storage 経由で他のコメビュ窓にも伝わる。
 */
function saveUserNotePatch(ukey, patch) {
  if (!ukey) return;
  _userNotes = upsertComeviewUserNote(_userNotes, ukey, patch, Date.now());
  try {
    void chrome.storage.local.set({ [COMEVIEW_USER_NOTES_KEY]: _userNotes });
  } catch {
    /* no-op */
  }
  const listEl = document.getElementById('cvList');
  if (!listEl) return;
  for (const el of [...listEl.querySelectorAll('.cv-row')]) {
    if (el.dataset && el.dataset.ukey === ukey) updateRowIdentity(el);
  }
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
 * ユーザー詳細パネル(わんコメ式+追憶独自):
 *   - ニックネーム/ラベル/メモ(配信を跨いで永続・【匿名にも付けられる】=わんコメ式の肝。
 *     ニコ生の匿名 ID は人ごとに安定しているので、名付ければ次の配信でも同じ名前で出る)
 *   - ID 表示+コピー
 *   - この配信での発言一覧(全件アーカイブから・時刻付き)=追憶だけの武器。
 * アーカイブはクリック時だけ一度読む。定期読みはしない(軽さ不変)。
 */
async function showUserDetail(row) {
  // 名前/サムネが空ならプロフィールキャッシュで補完(セット原則: 分かる情報は揃えて出す)。
  row = mergeComeviewRowWithProfile(row, _profileCache) || row;
  const ukey = comeviewUserKeyForRow(row);
  if (!ukey || !_liveId) return;
  const label =
    resolveComeviewDisplayName(row, _userNotes, ukey) || row.userId || 'この人';
  const bodyEl = openPanel(`👤 ${label}`);
  if (!bodyEl) return;

  // --- ヘッダ: サムネ・名前・ID・リンクは「分かる限りセット」で出す(原則) ---
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
  headBody.appendChild(idLine);
  head.appendChild(headBody);
  bodyEl.appendChild(head);

  // --- ニックネーム/ラベル/メモ(変更したら即保存・行へ即反映) ---
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
    'ニックネーム(表示名を上書き・匿名にも付けられます)',
    '例: 常連の柿ピーさん',
    note.nickname,
    'nickname',
    false
  );
  mkField('ラベル(名前の横にバッジ表示)', '例: 常連 / 初見 / 要注意', note.label, 'label', false);
  mkField('メモ(自分用・画面には出ません)', '', note.memo, 'memo', true);
  bodyEl.appendChild(form);

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
    // サムネ・名前・ID はセットで出す(原則)。key 'u:<id>' から userId を復元してサムネ解決。
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
    nm.textContent = e.name || resolveComeviewDisplayName({ userId: uid, name: '' }, {}, '') || e.key;
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

/** 1 行の DOM を作る(読みやすさ最優先・アイコン+名前+本文+ホバーアクション)。 */
function buildRowEl(row) {
  const el = document.createElement('div');
  el.className = 'cv-row' + (row.selfPosted ? ' is-self' : '');
  el.dataset.id = row.id;
  const ukey = comeviewUserKeyForRow(row);
  if (ukey) el.dataset.ukey = ukey;
  // ニックネーム保存時に表示名を追い掛け更新できるよう、元の素性を持たせておく。
  el.dataset.name = row.name || '';
  el.dataset.uid = row.userId || '';
  const displayName = resolveComeviewDisplayName(row, _userNotes, ukey);

  // v0.1.670: 本家と同じサムネを出す(取り込み済みURL > userIdから確定パターン生成 >
  //   匿名は公式の既定アイコン)。色付き丸は画像が無い/読めない時のフォールバックに格下げ。
  const avatarUrl = resolveComeviewAvatarUrl(row);
  if (avatarUrl) {
    const img = document.createElement('img');
    img.className = 'cv-avatar';
    img.src = avatarUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => {
      const fb = document.createElement('div');
      fb.className = 'cv-avatar-fallback';
      fb.style.background = avatarColor(row.userId || row.name);
      fb.textContent = initial(displayName || row.name);
      img.replaceWith(fb);
    };
    el.appendChild(img);
  } else {
    const fb = document.createElement('div');
    fb.className = 'cv-avatar-fallback';
    fb.style.background = avatarColor(row.userId || row.name);
    fb.textContent = initial(displayName || row.name);
    el.appendChild(fb);
  }

  const body = document.createElement('div');
  body.className = 'cv-body';
  const tx = document.createElement('div');
  tx.className = 'cv-text';
  tx.textContent = row.text;
  body.appendChild(tx);
  el.appendChild(body);
  // 名前行(ニックネーム/ラベル反映)は共通ロジックで組む(保存時の追い掛け更新と同じ経路)。
  updateRowIdentity(el);

  // ホバーアクション(わんコメ同型のモノクロアイコン列)。OBS モードでは CSS で非表示。
  const actions = document.createElement('div');
  actions.className = 'cv-actions';
  const mkBtn = (icon, title, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    // アイコンは固定の SVG 定数のみ(ユーザー由来の文字列は入れない)。
    b.innerHTML = CV_ACTION_ICONS[icon];
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick();
    });
    actions.appendChild(b);
  };
  mkBtn('trash', 'この行を隠す(この窓だけ)', () => {
    _hiddenIds.add(row.id);
    el.remove();
  });
  if (ukey) {
    mkBtn('block', 'この人のコメントを非表示にする', () => addNg(row));
    mkBtn('person', 'この人の詳細(名前付け・ラベル・メモ・発言一覧)', () =>
      void showUserDetail(row)
    );
  }
  mkBtn('copy', 'コメントをコピー', () => copyTextToClipboard(buildComeviewCopyText(row)));
  mkBtn('pin', 'ピン留め(全コメビュ窓・OBSにも表示)', () => {
    persistPin(row);
    renderPinBar({ id: row.id, name: row.name, text: row.text });
  });
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

  const { rows: raw, pin, notes, profiles } = await readLightComments(_liveId);
  if (notes) _userNotes = notes; // 他のコメビュ窓で付けた名前も追従する
  if (profiles) _profileCache = profiles; // パネルと同じプロフィール情報源
  renderPinBar(pin);
  const rows = buildComeviewRows(raw, COMEVIEW_MAX_ROWS);
  const fresh = pickNewComeviewRows(rows, _seenIds);

  // v0.1.672: 弱い行(no 無し)が先に描画され、あとから強い行(NDGR)が来て dedupe で
  //   消えた場合、DOM に残った古い弱い行を追い掛けて消す(ヘッダ件数と表示行数のズレ・
  //   二重表示の残骸の解消)。no: 始まりの強い行は触らない(通常の窓回転は pruneOverflow が担う)。
  const currentIds = new Set(rows.map((r) => r.id));
  for (const el of [...listEl.querySelectorAll('.cv-row')]) {
    const id = (el.dataset && el.dataset.id) || '';
    if ((id.startsWith('c:') || id.startsWith('id:')) && !currentIds.has(id)) {
      _seenIds.delete(id);
      el.remove();
    }
  }

  // v0.1.673: 名前なしで描画済みの行に、後から届いたプロフィールキャッシュの名前を追い掛け反映
  //   (タイムラインに出ている名前と同じ情報源。「情報あるのに反映されてない」の根治)。
  for (const el of [...listEl.querySelectorAll('.cv-row')]) {
    const d = el.dataset || {};
    if (d.name || !d.uid) continue;
    const e = _profileCache[d.uid];
    const nick = e && e.nickname ? String(e.nickname) : '';
    if (nick) {
      el.dataset.name = nick;
      updateRowIdentity(el);
    }
  }

  if (fresh.length) {
    const nearBottom =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80;
    const frag = document.createDocumentFragment();
    let appended = 0;
    for (const r of fresh) {
      _seenIds.add(r.id);
      // NG ユーザー/隠した行は「見たことにして」描画しない(毎 tick 再判定しない)。
      if (isComeviewRowHidden(r, _ngKeys, _hiddenIds)) continue;
      // 名前/サムネが空ならプロフィールキャッシュ(パネルと同じ情報源)で補完して描画。
      frag.appendChild(buildRowEl(mergeComeviewRowWithProfile(r, _profileCache)));
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
