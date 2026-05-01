/**
 * MV3 Service Worker
 *
 * - 初回インストール/ブラウザ起動時: 既存 watch タブへ注入して即利用可能にする
 * - 拡張更新時: 既存 watch タブをリロードし、古い extension context を残さない
 */

// @ts-nocheck — service worker; Chrome API と動的インデックスが多く checkJs コストが高い

const MATCH_PATTERNS = [
  'https://*.nicovideo.jp/*',
  'http://127.0.0.1:3456/*',
  'http://localhost:3456/*'
];
const KEY_AUTO_BACKUP_STATE = 'nls_auto_backup_state';
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';
const AUTO_BACKUP_ALARM = 'nls_auto_backup_every_5m';
const AUTO_BACKUP_PERIOD_MINUTES = 5;
const AUTO_BACKUP_DB_NAME = 'nls_auto_backup_v1';
const AUTO_BACKUP_DB_STORE = 'snapshots';
const AUTO_BACKUP_DB_VERSION = 1;
const AUTO_BACKUP_MAX_PER_LIVE = 24;

function commentsStorageKey(liveId) {
  const id = String(liveId || '').trim().toLowerCase();
  return `nls_comments_${id}`;
}

function normalizeAutoBackupState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawLives =
    src &&
    typeof src === 'object' &&
    'lives' in src &&
    src.lives &&
    typeof src.lives === 'object'
      ? src.lives
      : {};
  const lives = {};
  for (const [liveId, meta] of Object.entries(rawLives)) {
    const lid = String(liveId || '').trim().toLowerCase();
    if (!lid) continue;
    const row = meta && typeof meta === 'object' ? meta : {};
    lives[lid] = {
      liveId: lid,
      commentCount: Math.max(0, Number(row.commentCount) || 0),
      updatedAt: Math.max(0, Number(row.updatedAt) || 0),
      lastCommentAt: Math.max(0, Number(row.lastCommentAt) || 0),
      watchUrl: String(row.watchUrl || '').trim(),
      lastBackupAt: Math.max(0, Number(row.lastBackupAt) || 0),
      lastBackedUpdatedAt: Math.max(0, Number(row.lastBackedUpdatedAt) || 0),
      lastBackupCount: Math.max(0, Number(row.lastBackupCount) || 0)
    };
  }
  return { lives };
}

function canonicalWatchUrl(liveId, rawUrl) {
  const lid = String(liveId || '').trim().toLowerCase();
  const url = String(rawUrl || '').trim();
  if (url && url.includes(lid)) return url;
  return `https://live.nicovideo.jp/watch/${lid}`;
}

function isIndexedDbAvailable() {
  return typeof indexedDB !== 'undefined';
}

function openAutoBackupDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUTO_BACKUP_DB_NAME, AUTO_BACKUP_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUTO_BACKUP_DB_STORE)) {
        const store = db.createObjectStore(AUTO_BACKUP_DB_STORE, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('byLive', 'liveId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveInternalAutoBackup(payload) {
  if (!isIndexedDbAvailable()) return false;
  const db = await openAutoBackupDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(AUTO_BACKUP_DB_STORE, 'readwrite');
      const store = tx.objectStore(AUTO_BACKUP_DB_STORE);
      const idx = store.index('byLive');
      const liveId = String(payload?.liveId || '').trim().toLowerCase();

      const addReq = store.add({
        liveId,
        exportedAt: Number(payload?.exportedAtEpochMs || Date.now()) || Date.now(),
        updatedAt: Number(payload?.updatedAt || 0) || 0,
        lastCommentAt: Number(payload?.lastCommentAt || 0) || 0,
        commentCount: Math.max(0, Number(payload?.commentCount) || 0),
        watchUrl: String(payload?.watchUrl || '').trim(),
        payload
      });
      addReq.onerror = () => reject(addReq.error);
      addReq.onsuccess = () => {
        const getReq = idx.getAll(liveId);
        getReq.onerror = () => reject(getReq.error);
        getReq.onsuccess = () => {
          const all = Array.isArray(getReq.result) ? getReq.result : [];
          all.sort(
            (a, b) =>
              (Number(a?.exportedAt || 0) - Number(b?.exportedAt || 0)) ||
              (Number(a?.id || 0) - Number(b?.id || 0))
          );
          const overflow = Math.max(0, all.length - AUTO_BACKUP_MAX_PER_LIVE);
          for (let i = 0; i < overflow; i += 1) {
            const id = Number(all[i]?.id || 0);
            if (id > 0) store.delete(id);
          }
        };
      };

      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

async function ensureAutoBackupAlarm() {
  try {
    const existing = await chrome.alarms.get(AUTO_BACKUP_ALARM);
    if (existing) return;
    chrome.alarms.create(AUTO_BACKUP_ALARM, {
      delayInMinutes: AUTO_BACKUP_PERIOD_MINUTES,
      periodInMinutes: AUTO_BACKUP_PERIOD_MINUTES
    });
  } catch {
    // no-op
  }
}

async function backupLiveCommentsIfNeeded(liveId, meta, lastWatchUrl) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return null;
  if ((Number(meta?.commentCount) || 0) <= 0) return null;
  if ((Number(meta?.updatedAt) || 0) <= (Number(meta?.lastBackedUpdatedAt) || 0)) {
    return null;
  }

  const key = commentsStorageKey(lid);
  const bag = await chrome.storage.local.get(key);
  const comments = Array.isArray(bag[key]) ? bag[key] : [];
  if (!comments.length) return null;

  const exportedAt = Date.now();
  const payload = {
    kind: 'nicolivelog-auto-backup',
    version: 1,
    exportedAt: new Date(exportedAt).toISOString(),
    exportedAtEpochMs: exportedAt,
    liveId: lid,
    watchUrl: canonicalWatchUrl(lid, meta?.watchUrl || lastWatchUrl),
    commentCount: comments.length,
    updatedAt: Number(meta?.updatedAt) || 0,
    lastCommentAt: Number(meta?.lastCommentAt) || 0,
    comments
  };
  const saved = await saveInternalAutoBackup(payload);
  if (!saved) return null;
  return {
    liveId: lid,
    backupAt: exportedAt,
    backedUpdatedAt: Number(meta?.updatedAt) || 0,
    backupCount: comments.length
  };
}

async function runAutoBackupCycle() {
  const bag = await chrome.storage.local.get([KEY_AUTO_BACKUP_STATE, KEY_LAST_WATCH_URL]);
  const state = normalizeAutoBackupState(bag[KEY_AUTO_BACKUP_STATE]);
  const lastWatchUrl = String(bag[KEY_LAST_WATCH_URL] || '').trim();
  const entries = Object.entries(state.lives).sort(
    (a, b) => (Number(a[1]?.updatedAt) || 0) - (Number(b[1]?.updatedAt) || 0)
  );
  if (!entries.length) return;

  const results = [];
  for (const [liveId, meta] of entries) {
    try {
      const done = await backupLiveCommentsIfNeeded(liveId, meta, lastWatchUrl);
      if (done) results.push(done);
    } catch {
      // no-op
    }
  }
  if (!results.length) return;

  const freshBag = await chrome.storage.local.get(KEY_AUTO_BACKUP_STATE);
  const freshState = normalizeAutoBackupState(freshBag[KEY_AUTO_BACKUP_STATE]);
  let changed = false;
  for (const res of results) {
    const cur = freshState.lives[res.liveId];
    if (!cur) continue;
    freshState.lives[res.liveId] = {
      ...cur,
      lastBackupAt: Math.max(Number(cur.lastBackupAt) || 0, res.backupAt),
      lastBackedUpdatedAt: Math.max(
        Number(cur.lastBackedUpdatedAt) || 0,
        res.backedUpdatedAt
      ),
      lastBackupCount: Math.max(0, Number(res.backupCount) || 0)
    };
    changed = true;
  }
  if (changed) {
    await chrome.storage.local.set({
      [KEY_AUTO_BACKUP_STATE]: freshState
    });
  }
}

async function queryTargetTabs() {
  try {
    return await chrome.tabs.query({ url: MATCH_PATTERNS });
  } catch {
    return [];
  }
}

async function injectIntoExistingTabs() {
  const tabs = await queryTargetTabs();
  for (const tab of tabs) {
    if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['dist/page-intercept.js'],
        world: 'MAIN'
      });
    } catch {
      // タブがクラッシュ済み等
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['dist/content.js']
      });
    } catch {
      // no-op
    }
  }
}

async function reloadExistingWatchTabs() {
  const tabs = await queryTargetTabs();
  for (const tab of tabs) {
    if (!tab.id || tab.id === chrome.tabs.TAB_ID_NONE) continue;
    try {
      await chrome.tabs.reload(tab.id);
    } catch {
      // no-op
    }
  }
}

/**
 * manifest に side_panel があると、環境によってツールバー押下がサイドパネル側に取られ、
 * iframe 経由の表示が空に見えることがある。サイドパネル自動オープンは抑止する。
 * （ツールバー本体は onClicked でインライン前面化 or popup 窓。default_popup は使わない）
 */
function ensureToolbarOpensPopupNotSidePanel() {
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.sidePanel &&
      typeof chrome.sidePanel.setPanelBehavior === 'function'
    ) {
      void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    }
  } catch {
    // API 未対応・ポリシー制限
  }
}

/**
 * 内容は src/lib/migrateInlinePanelFloatToDock.js と同一（SW は ESM バンドル外のため重複）。
 */
async function migrateFloatingPanelToDockProfileOnce() {
  const K_PLACEMENT = 'nls_inline_panel_placement';
  const K_DONE = 'nls_inline_panel_float_to_dock_migrated';
  try {
    const bag = await chrome.storage.local.get([K_PLACEMENT, K_DONE]);
    if (bag[K_DONE] === true) return;
    if (String(bag[K_PLACEMENT] || '').trim().toLowerCase() !== 'floating') {
      return;
    }
    await chrome.storage.local.set({
      [K_PLACEMENT]: 'dock_bottom',
      [K_DONE]: true
    });
  } catch {
    // no-op
  }
}

/**
 * 0.1.63 (AS): below → dock_bottom のワンショット移行（SW 側コピー）。
 * 内容は src/lib/migrateInlinePanelBelowToDock.js と同一。
 */
async function migrateBelowPanelToDockProfileOnce() {
  const K_PLACEMENT = 'nls_inline_panel_placement';
  const K_DONE = 'nls_inline_panel_below_to_dock_migrated';
  try {
    const bag = await chrome.storage.local.get([K_PLACEMENT, K_DONE]);
    if (bag[K_DONE] === true) return;
    const p = String(bag[K_PLACEMENT] || '').trim().toLowerCase();
    if (p !== 'below') {
      // 既に dock_bottom 等なら値は変えず flag だけ立てる
      await chrome.storage.local.set({ [K_DONE]: true });
      return;
    }
    await chrome.storage.local.set({
      [K_PLACEMENT]: 'dock_bottom',
      [K_DONE]: true
    });
  } catch {
    // no-op
  }
}

/**
 * 0.1.7 / 0.1.8 / 0.1.9 で焼き込まれた古い `selfPosted: true` を全 `nls_comments_*` から
 * 剥がす後方互換 migration（D-4）。SW は ESM バンドル外のため、純関数を import せず
 * 同等ロジックを SW 内にハードコピー（`migrateInlinePanelFloatToDockProfileOnce` と同パターン）。
 *
 * 起動条件:
 *   ・details.previousVersion が `'0.1.0'`〜`'0.1.9'` のいずれか（fresh install では走らない）
 *   ・nls_migration_clear_stale_selfposted_done_v1 がまだ true でない
 *
 * 動作:
 *   ・chrome.storage.local の全 key を走査し、`nls_comments_` プレフィックスを集める
 *   ・各配列の各行から `selfPosted` フィールドを物理削除
 *   ・done flag を立てて再実行を防ぐ
 *
 * 副作用:
 *   ・真に自コメだった行は、次の persist サイクルで content-entry の
 *     `consumeMatchedSelfPostedRecents` が KEY_SELF_POSTED_RECENTS の pending と
 *     再マッチして `selfPosted: true` を再付与する（24h TTL 内なら）。
 *
 * @param {string|undefined} previousVersion
 */
async function migrateClearStaleSelfPostedOnce(previousVersion) {
  const K_DONE = 'nls_migration_clear_stale_selfposted_done_v1';
  const BASELINE = '0.1.10';
  try {
    // semver 比較（major.minor.patch）。不正な値は走らせない（fresh install を含む）。
    const m = String(previousVersion || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return;
    const prev = [Number(m[1]), Number(m[2]), Number(m[3])];
    const base = BASELINE.split('.').map(Number);
    let runRequired = false;
    for (let i = 0; i < 3; i += 1) {
      if (prev[i] < base[i]) {
        runRequired = true;
        break;
      }
      if (prev[i] > base[i]) break;
    }
    if (!runRequired) return;

    const allBag = await chrome.storage.local.get(null);
    if (allBag[K_DONE] === true) return;

    /** @type {Record<string, unknown>} */
    const writes = {};
    let touchedKeys = 0;
    let strippedRows = 0;
    for (const [key, value] of Object.entries(allBag)) {
      if (!key.startsWith('nls_comments_')) continue;
      if (!Array.isArray(value)) continue;
      let changed = false;
      const next = value.map((row) => {
        if (row == null || typeof row !== 'object') return row;
        if (!('selfPosted' in row)) return row;
        if (row.selfPosted === true) strippedRows += 1;
        const cleaned = { ...row };
        delete cleaned.selfPosted;
        changed = true;
        return cleaned;
      });
      if (changed) {
        writes[key] = next;
        touchedKeys += 1;
      }
    }
    writes[K_DONE] = true;
    await chrome.storage.local.set(writes);
    if (typeof console !== 'undefined' && console?.info) {
      console.info(
        `[nicolivelog] stale selfPosted cleanup migration: ${strippedRows} rows ` +
          `stripped across ${touchedKeys} live(s) (previousVersion=${previousVersion})`
      );
    }
  } catch (err) {
    if (typeof console !== 'undefined' && console?.warn) {
      console.warn('[nicolivelog] stale selfPosted cleanup migration failed:', err);
    }
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  ensureToolbarOpensPopupNotSidePanel();
  void ensureAutoBackupAlarm();
  void (async () => {
    await migrateFloatingPanelToDockProfileOnce();
    await migrateBelowPanelToDockProfileOnce();
    // D-4: 0.1.10 未満からの自動更新で「他人コメントへの誤焼き込み selfPosted」を剥がす。
    // 'install'（fresh）では走らないよう previousVersion を渡す。
    if (details?.reason === 'update') {
      await migrateClearStaleSelfPostedOnce(details?.previousVersion);
    }
    if (details?.reason === 'update') {
      await reloadExistingWatchTabs();
    } else {
      await injectIntoExistingTabs();
    }
  })();
});

chrome.runtime.onStartup.addListener(() => {
  ensureToolbarOpensPopupNotSidePanel();
  void ensureAutoBackupAlarm();
  void migrateFloatingPanelToDockProfileOnce();
  void migrateBelowPanelToDockProfileOnce();
  void injectIntoExistingTabs();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name !== AUTO_BACKUP_ALARM) return;
  void runAutoBackupCycle();
});

/* ------------------------------------------------------------------ */
/* ツールバー: ページ内インラインがあれば前面化、なければ popup 窓（src/lib/uiUxOpenStrategy と整合） */
/* ------------------------------------------------------------------ */

const KEY_TOOLBAR_ACTION_POLICY = 'nls_toolbar_action_policy';

/**
 * @returns {'prefer_focus_inline' | 'always_open_popup'}
 */
async function getToolbarActionPolicy() {
  try {
    const bag = await chrome.storage.local.get(KEY_TOOLBAR_ACTION_POLICY);
    const v = String(bag[KEY_TOOLBAR_ACTION_POLICY] || '').trim();
    if (v === 'always_open_popup') return 'always_open_popup';
    return 'prefer_focus_inline';
  } catch {
    return 'prefer_focus_inline';
  }
}

/**
 * 既存の popup 窓があれば前面化、なければ作成（default_popup 廃止後の代替）。
 *
 * 0.1.58 (AN) → 0.1.59 (AO): popup window のサイズを毎回 420×780 に
 *   リセットするだけでなく、Chrome が以前の resize を強く保持する
 *   ケースに対処するため、既存 popup を **閉じてから** 新規作成する形に
 *   変更。フォーカス継続は失われるが、サイズが必ず 420×780 になる。
 *   さらに `state: 'normal'` を明示して maximized 等の異常状態を解除し、
 *   `top`/`left` を画面中央寄せに。
 */
const POPUP_WINDOW_WIDTH = 420;
const POPUP_WINDOW_HEIGHT = 780;
async function openOrFocusPopupWindow() {
  const url = chrome.runtime.getURL('popup.html');
  const urlBase = url.replace(/[?#].*$/, '');
  // 既存 popup を見つけたら一度閉じる（サイズリセットの確実性のため）
  try {
    const all = await chrome.windows.getAll({ populate: true });
    for (const w of all) {
      if (w.type !== 'popup' || w.id == null) continue;
      const t = w.tabs && w.tabs[0];
      const u = String(t?.url || '');
      if (u && (u === url || u.startsWith(urlBase))) {
        try {
          await chrome.windows.remove(w.id);
        } catch {
          // already closed
        }
      }
    }
  } catch {
    // no-op
  }
  /*
   * 0.1.61 (AQ) → 0.1.62 (AR) → 0.1.64 (AT3): popup を Chrome window の
   *   「右内側」に配置する。
   *
   *   経緯:
   *     0.1.62 では Chrome の右**外**側 (left = lastNormal.left + width) に
   *     置いていた。Chrome がモニタ A の右寄りにいると、外側＝モニタ B
   *     （隣のモニタ）になる。多モニタ環境（5 モニタ等）では popup が別の
   *     モニタに飛んでしまう報告。
   *   修正:
   *     popup の left を「Chrome の右端 - POPUP_WIDTH」にし、Chrome window の
   *     **内側**右上に出す。Chrome content の右側と少し被るが、必ず Chrome の
   *     いるモニタに popup が出るので「別モニタに飛ぶ」事故を完全に防げる。
   *     ユーザー要望「Chrome から離れて出るのはおかしい」（=右側に並べたい）の
   *     趣旨も保つ。
   *     Chrome window が POPUP_WIDTH より狭い極端ケースでは window 全体に
   *     被るが、その場合は元々が異常状態なので無視（左端を超えない clamp で
   *     十分）。
   */
  /** @type {{ left?: number, top?: number }} */
  const positionHint = {};
  try {
    const lastNormal = await chrome.windows.getLastFocused({
      windowTypes: ['normal']
    });
    if (
      lastNormal &&
      typeof lastNormal.left === 'number' &&
      typeof lastNormal.top === 'number' &&
      typeof lastNormal.width === 'number'
    ) {
      // Chrome window の右**内側**に popup の右端を合わせる（content の右側と被るが必ず同モニタ）
      const left = lastNormal.left + lastNormal.width - POPUP_WINDOW_WIDTH;
      const top = lastNormal.top;
      positionHint.left = Math.max(lastNormal.left, Math.round(left));
      positionHint.top = Math.max(0, Math.round(top));
    }
  } catch {
    // no-op: getLastFocused が取れなければ Chrome のデフォルト位置にする
  }
  try {
    await chrome.windows.create({
      url,
      type: 'popup',
      width: POPUP_WINDOW_WIDTH,
      height: POPUP_WINDOW_HEIGHT,
      focused: true,
      state: 'normal',
      ...positionHint
    });
  } catch {
    // no-op
  }
}

/**
 * 0.1.67 (AW): 関係ないタブ（watch じゃない）でツールバーアイコンを押した時、
 *   旧来の standalone popup window ではなく Chrome 統合の **side panel** を
 *   開くよう変更。ユーザー報告「(配信中の inline panel と違って) 関係ない
 *   タブで開いた popup が Chrome から離れて見える」への対応で、視覚的に
 *   Chrome window と一体化させる。
 *
 *   - watch ページ: 従来通り inline panel に focus（NLS_FOCUS_INLINE_PANEL）
 *   - watch じゃないタブ: chrome.sidePanel.open({windowId}) で side panel
 *   - 旧 popup window は API 不在・エラー時の fallback として残す
 *   - getToolbarActionPolicy() === 'always_open_popup' は旧挙動を保つ（互換）
 *
 *   sidepanel.html は popup.html?inline=1&dock=sidepanel を iframe で読み込む
 *   既存実装。popup-entry.js の sidepanel 用 UI 切り替えロジック (search param
 *   `dock=sidepanel`) がそのまま機能する。
 *
 * @param {import('chrome').tabs.Tab|undefined} tab
 */
async function handleBrowserActionClick(tab) {
  const policy = await getToolbarActionPolicy();
  if (policy === 'always_open_popup') {
    // 旧設定の人は popup window を維持（互換）
    await openOrFocusPopupWindow();
    return;
  }
  const tid = tab && tab.id != null ? tab.id : chrome.tabs.TAB_ID_NONE;
  if (tid !== chrome.tabs.TAB_ID_NONE) {
    try {
      /*
       * 0.1.16 (P): frameId: 0 を明示し、top frame の listener にのみ届ける。
       * manifest.json の content.js は all_frames: true で iframe（プレイヤー埋込
       * 等）にも注入されている。frameId 指定なしで sendMessage するとすべての
       * フレームに broadcast され、iframe の listener が
       *   if (!isWatchInlinePanelTopFrame()) return false;
       * で同期 false を返して port を閉じてしまう。top frame の async listener が
       * sendResponse({focused:true}) する前に port closed エラーになり、
       * background が popup 窓を fallback として開いてしまう（user 報告：
       * インラインパネル + popup 窓が同時に出る）。
       */
      const res = await chrome.tabs.sendMessage(
        tid,
        { type: 'NLS_FOCUS_INLINE_PANEL' },
        { frameId: 0 }
      );
      if (res && res.focused) return;
    } catch {
      // コンテンツ未注入・対象外 URL
    }
  }
  // 0.1.67 (AW): watch じゃないタブ → Chrome 統合の side panel を試みる
  try {
    if (
      tab &&
      typeof tab.windowId === 'number' &&
      typeof chrome !== 'undefined' &&
      chrome.sidePanel &&
      typeof chrome.sidePanel.open === 'function'
    ) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    }
  } catch {
    // sidePanel.open が使えない / user gesture が失われた / 環境制約 → popup window へ fallback
  }
  await openOrFocusPopupWindow();
}

chrome.action.onClicked.addListener((tab) => {
  void handleBrowserActionClick(tab);
});
