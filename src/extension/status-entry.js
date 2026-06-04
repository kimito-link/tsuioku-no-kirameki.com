// @ts-nocheck — status UI: read-only DOM/Chrome API。popup と独立。
/**
 * v0.1.629: 固定 URL 状態表示ページ。
 *
 * 目的:
 *   - chrome-extension://[拡張ID]/status.html で常時最新の全配信状態+診断 JSON を表示
 *   - スクショ撮影/コピペ作業を不要にする(AI共有時のフリクション削減)
 *   - 完全リードオンリー: storage write しない・background SW を起こさない・popup の重い初期化と独立
 *
 * データソース(全て chrome.storage.local の既存キー・触らない):
 *   - nls_panel_summary_<lv>       軽量サマリ(主要データ)
 *   - nls_ai_share_fast_diag_v1    fastDiag キャッシュ(視聴中 lives 列挙)
 *   - nls_last_watch_url           最後に視聴した URL(フォールバック)
 *
 * 自動更新:
 *   - setInterval 2 秒
 *   - document.hidden で停止(電池/CPU 節約)
 *   - storage.onChanged で増分 refresh(panel_summary 変化のみ反応)
 *
 * @module status-entry
 */

import { KEY_AI_SHARE_FAST_DIAG } from '../lib/aiShareFastDiagKey.js';

/** 自動更新間隔(ms)。 */
const REFRESH_INTERVAL_MS = 2000;

/** panel_summary キーのプレフィックス。 */
const PANEL_SUMMARY_PREFIX = 'nls_panel_summary_';

/**
 * v0.1.631: 配信者名・タイトル・watch/comment 数の正本は nls_watch_snapshot_<lv>。
 * panel_summary には broadcasterName が無い(空文字)ため、両方読んでマージする。
 */
const WATCH_SNAPSHOT_PREFIX = 'nls_watch_snapshot_';

/** 最後に視聴した URL の storage key。 */
const KEY_LAST_WATCH_URL = 'nls_last_watch_url';

/** 自動更新の一時停止フラグ。 */
let _refreshPausedByUser = false;
/** 自動更新タイマー ID。 */
let _refreshTimerId = /** @type {number|null} */ (null);
/** 直近 render の結果(コピー/ダウンロード用)。 */
let _lastRenderedBundle = /** @type {{ overview: string, lives: object[], textBlob: string, jsonBlob: object }|null} */ (
  null
);

/* ============================================================================
 * 起動
 * ========================================================================== */

bootstrap().catch((err) => {
  console.error('[status] bootstrap failed:', err);
});

async function bootstrap() {
  // ビルド ID 表示(define NL_BUILD_ID 経由・popup と同じ)
  const buildIdEl = document.getElementById('metaBuildId');
  if (buildIdEl) {
    try {
      buildIdEl.textContent = 'build ' + (typeof NL_BUILD_ID !== 'undefined' ? NL_BUILD_ID : '?');
    } catch {
      buildIdEl.textContent = 'build ?';
    }
  }
  // 自分の URL を footer に
  const urlEl = document.getElementById('statusPageUrl');
  if (urlEl) urlEl.textContent = location.href;

  setupButtons();
  setupVisibilityHandler();
  setupStorageChangeListener();

  await refresh();
  startRefreshLoop();
}

/* ============================================================================
 * リフレッシュサイクル
 * ========================================================================== */

function startRefreshLoop() {
  if (_refreshTimerId != null) return;
  _refreshTimerId = window.setInterval(() => {
    if (_refreshPausedByUser) return;
    if (document.hidden) return;
    refresh().catch((err) => console.warn('[status] refresh err', err));
  }, REFRESH_INTERVAL_MS);
}

async function refresh() {
  try {
    const lvList = await enumerateActiveLives();
    const summaries = await loadAllSummaries(lvList);
    const fastDiag = await loadFastDiagSafe();
    renderAll({ lvList, summaries, fastDiag });
    updateLastUpdateMeta();
  } catch (err) {
    console.warn('[status] refresh failed:', err);
    // 失敗してもページを壊さない: 既存 DOM を維持
  }
}

function updateLastUpdateMeta() {
  const el = document.getElementById('metaLastUpdate');
  if (!el) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  el.textContent = `最終更新 ${hh}:${mm}:${ss}`;
}

/* ============================================================================
 * lv 列挙(v0.1.630 修正: 「今開いているニコ生タブ」だけに限定)
 *
 *   v0.1.629 では nls_panel_summary_<lv> を全部列挙していたが、過去に視聴したものが
 *   全部残るため 400+ 配信が「視聴中」扱いになる実機問題が出た(ユーザー証言)。
 *   chrome.tabs.query で実際に開いているタブから lv を抽出する経路を最優先にする。
 *
 *   - 経路1: chrome.tabs.query で live.nicovideo.jp/watch/lvXXX のタブから抽出 ← 最優先
 *   - 経路2: fastDiag.lives(視聴中フラグ付き)
 *   - 経路3: last_watch_url から 1 件(フォールバック)
 * ========================================================================== */

async function enumerateActiveLives() {
  /** @type {string[]} */
  const lvList = [];
  // 経路1: 実際に開いているニコ生 watch タブから lv 抽出
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://live.nicovideo.jp/watch/*', 'https://sp.live.nicovideo.jp/watch/*']
    });
    for (const tab of tabs || []) {
      const url = String(tab?.url || '');
      const m = url.match(/\/watch\/(lv\d{1,15})/);
      if (m) lvList.push(m[1].toLowerCase());
    }
  } catch {
    /* fallthrough */
  }
  if (lvList.length > 0) return uniqLvSorted(lvList);

  // 経路2: fastDiag.lives(視聴中タブ由来のキャッシュ)
  try {
    const fastDiag = await loadFastDiagSafe();
    const lives = Array.isArray(fastDiag?.lives) ? fastDiag.lives : [];
    for (const r of lives) {
      const lv = String(r?.liveId || r?.lv || '').trim().toLowerCase();
      if (/^lv\d{1,15}$/.test(lv)) lvList.push(lv);
    }
  } catch {
    /* fallthrough */
  }
  if (lvList.length > 0) return uniqLvSorted(lvList);

  // 経路3: last_watch_url から lv 抽出
  try {
    const bag = await chrome.storage.local.get(KEY_LAST_WATCH_URL);
    const url = String(bag?.[KEY_LAST_WATCH_URL] || '');
    const m = url.match(/lv\d{1,15}/);
    if (m) lvList.push(m[0].toLowerCase());
  } catch {
    /* fallthrough */
  }
  return uniqLvSorted(lvList);
}

function uniqLvSorted(arr) {
  return [...new Set(arr)].sort();
}

/* ============================================================================
 * サマリ読込(1 回の get() で全配信分一括)
 * ========================================================================== */

async function loadAllSummaries(lvList) {
  if (!Array.isArray(lvList) || !lvList.length) return {};
  /** @type {string[]} */
  const keys = [];
  for (const lv of lvList) {
    keys.push(PANEL_SUMMARY_PREFIX + lv);
    keys.push(WATCH_SNAPSHOT_PREFIX + lv);
  }
  try {
    const bag = await chrome.storage.local.get(keys);
    return bag || {};
  } catch {
    return {};
  }
}

async function loadFastDiagSafe() {
  try {
    const bag = await chrome.storage.local.get(KEY_AI_SHARE_FAST_DIAG);
    return bag?.[KEY_AI_SHARE_FAST_DIAG] || null;
  } catch {
    return null;
  }
}

/* ============================================================================
 * レンダリング
 * ========================================================================== */

function renderAll({ lvList, summaries, fastDiag }) {
  const livesData = lvList.map((lv) =>
    summarizeOneLive(
      lv,
      summaries[PANEL_SUMMARY_PREFIX + lv],
      summaries[WATCH_SNAPSHOT_PREFIX + lv]
    )
  );

  // 概要セクション
  const overviewText = buildOverviewText(livesData);
  const overviewEl = document.getElementById('overviewBody');
  if (overviewEl) {
    overviewEl.textContent = overviewText || '視聴中の配信はありません。';
    overviewEl.classList.toggle('empty-note', !overviewText);
  }

  // 配信ごとのカード
  const livesEl = document.getElementById('livesBody');
  if (livesEl) {
    if (!livesData.length) {
      livesEl.className = 'empty-note';
      livesEl.textContent =
        '視聴中の配信が見つかりませんでした。ニコ生 watch ページを開いてから戻ってきてください。';
    } else {
      livesEl.className = '';
      livesEl.innerHTML = '';
      for (const live of livesData) {
        const pre = document.createElement('pre');
        pre.textContent = buildLiveBlockText(live);
        const wrap = document.createElement('div');
        wrap.style.marginBottom = '12px';
        wrap.appendChild(pre);
        livesEl.appendChild(wrap);
      }
    }
  }

  // AI 共有用テキスト
  const fullText = buildAiShareFullText({ overviewText, livesData, fastDiag });
  const ta = /** @type {HTMLTextAreaElement|null} */ (
    document.getElementById('aiShareText')
  );
  if (ta) {
    if (ta.value !== fullText) ta.value = fullText;
  }

  _lastRenderedBundle = {
    overview: overviewText,
    lives: livesData,
    textBlob: fullText,
    jsonBlob: {
      generatedAt: new Date().toISOString(),
      overview: overviewText,
      lives: livesData,
      fastDiag
    }
  };
}

/* ============================================================================
 * 集計/整形ヘルパ(純関数寄り・テスト容易)
 * ========================================================================== */

function summarizeOneLive(lv, summary, snapshot) {
  // panel_summary のスキーマは src/lib/panelLiveSummary.js を参照
  // 防御的に optional access のみで読む(型ガード省略でも UI が壊れない設計)
  const s = summary && typeof summary === 'object' ? summary : null;
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : null;
  // v0.1.631: 配信者名/タイトル/各種値は snapshot を優先(panel_summary には無いか古い)。
  //   broadcasterName は snapshot にしか無いため必須。
  const broadcasterName = String(
    snap?.broadcasterName || snap?.programProvider?.name || s?.broadcasterName || ''
  );
  const title = String(snap?.title || snap?.programTitle || s?.title || '');
  const recordedCount = numOr(s?.recordedCount, 0);
  // 公式コメ数は panel_summary.officialCount にあるが、snapshot.officialCommentCount も
  //   読みに行く(片方しか入っていないケースに耐える)。
  const officialCommentCount =
    numOrNull(s?.officialCount) ?? numOrNull(snap?.officialCommentCount);
  const watchCount =
    numOrNull(snap?.officialViewerCount) ??
    numOrNull(snap?.viewerCountFromDom) ??
    numOrNull(s?.watchCount);
  const adPoints = numOrNull(snap?.officialAdPointsNdgr) ?? numOrNull(s?.adPoints);
  const giftPoints = numOrNull(snap?.officialGiftPointsNdgr) ?? numOrNull(s?.giftPoints);
  // 経過時間は snapshot.streamAgeMin(分)→秒に変換、無ければ panel_summary.elapsedSec。
  const elapsedSec =
    snap && typeof snap.streamAgeMin === 'number' && Number.isFinite(snap.streamAgeMin)
      ? Math.max(0, Math.floor(snap.streamAgeMin * 60))
      : numOrNull(s?.elapsedSec);
  const capturedAt =
    numOrNull(s?.lastIngestAt) ??
    numOrNull(s?.capturedAt) ??
    numOrNull(snap?.officialStatsUpdatedAt);
  const lastIngestAgoMs =
    capturedAt && capturedAt > 0 ? Math.max(0, Date.now() - capturedAt) : null;
  const officialRatePct =
    recordedCount > 0 && officialCommentCount && officialCommentCount > 0
      ? Math.round((recordedCount / officialCommentCount) * 100)
      : null;

  return {
    lv,
    broadcasterName,
    title,
    recordedCount,
    officialCommentCount,
    officialRatePct,
    watchCount,
    adPoints,
    giftPoints,
    elapsedSec,
    capturedAt,
    lastIngestAgoMs
  };
}

function buildOverviewText(livesData) {
  if (!livesData.length) return '';
  const lines = [];
  const total = livesData.length;
  let recordedSum = 0;
  let officialSum = 0;
  for (const r of livesData) {
    recordedSum += r.recordedCount || 0;
    officialSum += r.officialCommentCount || 0;
  }
  const ratePct = officialSum > 0 ? Math.round((recordedSum / officialSum) * 100) : null;
  lines.push(`記録中 ${total} 配信 / 累計 記録 ${recordedSum.toLocaleString('ja-JP')} 件`);
  if (officialSum > 0) {
    lines.push(`公式累計 ${officialSum.toLocaleString('ja-JP')} 件 (取得率 ${ratePct}%)`);
  }
  return lines.join('\n');
}

function buildLiveBlockText(live) {
  const lines = [];
  const head =
    `[${live.lv}] ${live.broadcasterName || '(配信者名 不明)'}` +
    (live.elapsedSec != null ? ` ・ 経過 ${formatElapsed(live.elapsedSec)}` : '');
  lines.push(head);
  // v0.1.631: 配信タイトル表示(snapshot から取れた場合のみ)。
  if (live.title) {
    lines.push(`  「${live.title}」`);
  }
  const numLine =
    `  記録 ${(live.recordedCount || 0).toLocaleString('ja-JP')}` +
    (live.officialCommentCount != null
      ? ` / 公式 ${live.officialCommentCount.toLocaleString('ja-JP')}`
      : '') +
    (live.officialRatePct != null ? ` (取得率 ${live.officialRatePct}%)` : '');
  lines.push(numLine);
  if (live.watchCount != null) {
    lines.push(`  来場 ${live.watchCount.toLocaleString('ja-JP')} 人`);
  }
  const ptParts = [];
  if (live.adPoints != null) ptParts.push(`広告 ${live.adPoints.toLocaleString('ja-JP')}pt`);
  if (live.giftPoints != null) ptParts.push(`ギフト ${live.giftPoints.toLocaleString('ja-JP')}pt`);
  if (ptParts.length) lines.push('  ' + ptParts.join(' / '));
  if (live.lastIngestAgoMs != null) {
    lines.push(`  最終取り込み ${formatAgo(live.lastIngestAgoMs)}前`);
  }
  return lines.join('\n');
}

function buildAiShareFullText({ overviewText, livesData, fastDiag }) {
  const lines = [];
  lines.push('## 君斗りんくの追憶のきらめき 状態速報');
  lines.push(`生成: ${new Date().toISOString()}`);
  lines.push('');
  if (overviewText) {
    lines.push('### 概要');
    lines.push(overviewText);
    lines.push('');
  }
  if (livesData.length) {
    lines.push('### 配信ごと');
    for (const live of livesData) {
      lines.push(buildLiveBlockText(live));
      lines.push('');
    }
  }
  lines.push('### 診断 JSON (fastDiag)');
  lines.push('```json');
  try {
    lines.push(JSON.stringify(fastDiag || {}, null, 2));
  } catch {
    lines.push('{}');
  }
  lines.push('```');
  return lines.join('\n');
}

function numOr(v, dflt) {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function formatElapsed(sec) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '?';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatAgo(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '?';
  if (ms < 60_000) return `${Math.round(ms / 1000)}秒`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}分`;
  return `${Math.round(ms / 3_600_000)}時間`;
}

/* ============================================================================
 * ボタン
 * ========================================================================== */

function setupButtons() {
  const btnSelect = document.getElementById('btnSelectAll');
  if (btnSelect) {
    btnSelect.addEventListener('click', () => {
      const ta = /** @type {HTMLTextAreaElement|null} */ (
        document.getElementById('aiShareText')
      );
      if (ta) {
        ta.focus();
        ta.select();
      }
    });
  }
  const btnCopy = document.getElementById('btnCopy');
  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      const text = _lastRenderedBundle?.textBlob || '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        btnCopy.textContent = 'コピーしました ✓';
        setTimeout(() => {
          btnCopy.textContent = 'クリップボードへコピー';
        }, 1500);
      } catch (err) {
        console.warn('[status] clipboard failed:', err);
        btnCopy.textContent = 'コピー失敗(範囲選択して Ctrl+C)';
        setTimeout(() => {
          btnCopy.textContent = 'クリップボードへコピー';
        }, 2000);
      }
    });
  }
  const btnDownload = document.getElementById('btnDownload');
  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      const blob = _lastRenderedBundle?.jsonBlob || {};
      const text = JSON.stringify(blob, null, 2);
      const file = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `nicolivelog-status-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 500);
    });
  }
  const btnPause = document.getElementById('btnTogglePause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      _refreshPausedByUser = !_refreshPausedByUser;
      btnPause.textContent = _refreshPausedByUser
        ? '自動更新を再開'
        : '自動更新を一時停止';
      const meta = document.getElementById('metaAutoRefresh');
      if (meta) {
        meta.textContent = _refreshPausedByUser ? '自動更新: 停止中' : '自動更新: 2秒';
      }
    });
  }
}

/* ============================================================================
 * visibilitychange + storage onChanged
 * ========================================================================== */

function setupVisibilityHandler() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // 何もしない(setInterval 内で hidden チェック)
    } else {
      // 可視に戻ったら即時 refresh して反応性を上げる
      refresh().catch(() => {});
    }
  });
}

function setupStorageChangeListener() {
  try {
    chrome.storage.local.onChanged.addListener((changes) => {
      if (_refreshPausedByUser) return;
      // panel_summary / watch_snapshot 変化のみで refresh(高頻度の他キー変化で過剰 refresh しない)
      for (const k of Object.keys(changes)) {
        if (
          k.startsWith(PANEL_SUMMARY_PREFIX) ||
          k.startsWith(WATCH_SNAPSHOT_PREFIX)
        ) {
          refresh().catch(() => {});
          return;
        }
      }
    });
  } catch {
    /* onChanged が無い環境では setInterval だけ稼働 */
  }
}
