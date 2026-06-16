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
import {
  buildOverviewText,
  buildLiveBlockText,
  buildBackfillProgressLine,
  buildLaneStatusLine
} from '../lib/statusFormat.js';
import { resolveVisitorCount } from '../lib/resolveVisitorCount.js';
import { PERF_DIAG_PREFIX, isPerfDiag } from '../lib/perfDiag.js';
import { LIVE_ENDED_PREFIX, isLiveEndedFlag } from '../lib/liveEndedFlag.js';
import { buildLiveHealth, scoreToDots } from '../lib/liveHealthScore.js';
import { runStorageOpWithTimeout, STORAGE_OP_TIMED_OUT } from '../lib/storageOpTimeout.js';
import {
  NEXT_LIVE_REQUEST_TYPE,
  AUTOPATROL_ENABLED_KEY
} from '../lib/rankingPatrolMessages.js';
import {
  GOOGLE_SUGGEST_FETCH_MESSAGE_TYPE,
  parseGoogleSuggestResponse,
  isValidSuggestQuery
} from '../lib/googleSuggest.js';
import { analyzeNegativeSuggests } from '../lib/broadcasterReputationKeywords.js';
import {
  buildReputationViewModel,
  buildReputationAlertHtml
} from '../lib/broadcasterReputationView.js';
import { pickBroadcasterNameForReputation } from '../lib/pickBroadcasterNameForReputation.js';

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
/** v0.1.644: 直近の status refresh エラー(画面の自己診断表示用)。 */
let _statusLastErrorText = '';
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
  // バージョン + ビルド ID 表示(popup と同じ `v<version>・build<id>`)。
  //   v0.1.642: ビルド番号だけだと「今どのバージョンか」が分からず紛らわしいので
  //   manifest の version も併記する(watch パネルの「ビルド v0.1.642・b...」と揃える)。
  const buildIdEl = document.getElementById('metaBuildId');
  if (buildIdEl) {
    try {
      const ver = String(chrome.runtime.getManifest()?.version || '').trim();
      const bid = typeof NL_BUILD_ID !== 'undefined' ? NL_BUILD_ID : '?';
      buildIdEl.textContent = (ver ? `v${ver} · ` : '') + 'build ' + bid;
    } catch {
      buildIdEl.textContent = 'build ' + (typeof NL_BUILD_ID !== 'undefined' ? NL_BUILD_ID : '?');
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
    // v0.1.785: storage stall(storage_op_timeout)は status の自己診断 UI に画面表示済みで
    //   グレースフルに degrade する想定内の事象。console.warn は chrome://extensions のエラー欄に
    //   収集され「これ見てどうすればいいの?」を生むため console.debug に下げる(v0.1.776 と同方針=
    //   行動につながらない警告を目立つ場所に出さない)。実エラーは画面の概要欄/AI共有欄で確認できる。
    refresh().catch((err) => console.debug('[status] refresh err', err));
  }, REFRESH_INTERVAL_MS);
}

/**
 * v0.1.644: status の「読み込み中で固まる」を自己診断する。各ステップを timeout 有界化し、
 *   どこで詰まったか/エラー内容を画面(概要欄+AI共有欄)に書き出す。これでコンソールを開かなくても
 *   「status が固まった原因」が画面で分かる(ユーザー指摘「コンソールをスクショしなくてもいいように」)。
 */
async function refresh() {
  let step = 'init';
  try {
    step = 'enumerateActiveLives';
    const lvList = await runStorageOpWithTimeout(() => enumerateActiveLives(), 8000);
    step = `loadAllSummaries(${lvList.length}件)`;
    const summaries = await runStorageOpWithTimeout(() => loadAllSummaries(lvList), 8000);
    step = 'loadFastDiagSafe';
    const fastDiag = await runStorageOpWithTimeout(() => loadFastDiagSafe(), 8000);
    step = 'loadBackfillProgress';
    const backfillProgress = await runStorageOpWithTimeout(
      () => loadBackfillProgressSafe(),
      8000
    );
    step = 'renderAll';
    renderAll({ lvList, summaries, fastDiag, backfillProgress });
    updateLastUpdateMeta();
    _statusLastErrorText = '';
  } catch (err) {
    // どのステップで・何のエラーで止まったかを画面に出す(コンソール不要の自己診断)。
    const reason = err === STORAGE_OP_TIMED_OUT ? 'タイムアウト(8秒)' : String(err?.message || err);
    _statusLastErrorText =
      `⚠ 状態の読み込みでつまずきました\n  つまずいた処理: ${step}\n  原因: ${reason}\n` +
      `  (記録自体は watch タブ側で継続中です。storage が大きいと status の表示だけ遅れることがあります)`;
    try {
      const ovEl = document.getElementById('overviewBody');
      if (ovEl && /読み込み中/.test(ovEl.textContent || '')) {
        ovEl.textContent = _statusLastErrorText;
      }
      const livesEl = document.getElementById('livesBody');
      if (livesEl && /読み込み中/.test(livesEl.textContent || '')) {
        livesEl.className = 'empty-note';
        livesEl.textContent = `(${step} で停止。再試行します…)`;
      }
      // AI 共有欄にも出して、範囲選択コピーで開発者に渡せるように。
      const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('aiShareText'));
      if (ta && !ta.value) ta.value = _statusLastErrorText;
    } catch { /* no-op */ }
    // v0.1.785: timeout(storage_op_timeout)は上で _statusLastErrorText として画面に出し、記録自体は
    //   watch タブ側で継続している想定内の degrade。console.warn は chrome://extensions のエラー欄を
    //   汚し「どうすれば?」を生むため console.debug に下げる(DevTools verbose でのみ確認可・v0.1.776 と同方針)。
    console.debug('[status] refresh failed at', step, err);
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
    keys.push(PERF_DIAG_PREFIX + lv);
    keys.push(LIVE_ENDED_PREFIX + lv);
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

/**
 * v0.1.659: 過去ログ取得の診断(stopReason)を読む。「一気に取れない・50%停止」の真因を
 *   ユーザーが status を開くだけで AI に共有できるように、どの配信が何の理由で止まったかを表示。
 *   nls_backfill_progress_v1 はグローバル(直近1配信分)。
 * @returns {Promise<{lid:string, rows:number, done:number, stopReason:string, errMsg:string}|null>}
 */
async function loadBackfillProgressSafe() {
  try {
    const bag = await chrome.storage.local.get('nls_backfill_progress_v1');
    const p = bag?.['nls_backfill_progress_v1'];
    if (!p || typeof p !== 'object') return null;
    return {
      lid: String(p.lid || ''),
      rows: Number(p.rows) || 0,
      done: Number(p.done) || 0,
      stopReason: String(p.stopReason || ''),
      // v0.1.692: aborted の真因(crawl 例外メッセージ)。content 側 publishBackfillProgress が保全する。
      errMsg: String(p.errMsg || '')
    };
  } catch {
    return null;
  }
}

/* ============================================================================
 * レンダリング
 * ========================================================================== */

function renderAll({ lvList, summaries, fastDiag, backfillProgress }) {
  const livesData = lvList.map((lv) =>
    summarizeOneLive(
      lv,
      summaries[PANEL_SUMMARY_PREFIX + lv],
      summaries[WATCH_SNAPSHOT_PREFIX + lv],
      summaries[PERF_DIAG_PREFIX + lv],
      summaries[LIVE_ENDED_PREFIX + lv]
    )
  );

  // 概要セクション
  const overviewText = buildOverviewText(livesData);
  // v0.1.659: 過去ログ取得の診断(stopReason)を概要に併記。「一気に取れない・50%停止」の真因を
  //   ユーザーが status を開くだけで AI 共有できる(reached_start=完走 / no_progress=疎区間で停止 /
  //   backward_exhausted=入口無し / cap_*=上限 / rate_limited=混雑)。
  // v0.1.692: 行組み立てを純関数 buildBackfillProgressLine(statusFormat.js)へ移譲。
  //   aborted の真因(crawl 例外メッセージ errMsg)があれば「・エラー: ...」を併記する。
  const bpLine = buildBackfillProgressLine(backfillProgress);
  const backfillLine = bpLine ? `\n${bpLine}` : '';
  // v0.1.766(ユーザー要望「概要にレーン状況も入れたい」): 公式値レーン(北極星レーン)の状況を
  //   概要に併記。「レーンが出ていない時」を status を見るだけで分かる。視聴中の配信のみ取得可能
  //   (fastDiag.content.giftDiagnostics の「北極星レーン」)なので、取れたときだけ1行足す。
  const laneStr = buildLaneStatusLine(fastDiag?.content?.giftDiagnostics?.['北極星レーン']);
  const laneLine = laneStr ? `\n${laneStr}` : '';
  const overviewEl = document.getElementById('overviewBody');
  if (overviewEl) {
    overviewEl.textContent =
      (overviewText || '視聴中の配信はありません。') + backfillLine + laneLine;
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
      // 画面が広いとき方眼紙のように横へ並べるグリッド(狭いと1列)。
      livesEl.className = '';
      livesEl.style.display = 'grid';
      livesEl.style.gap = '12px';
      livesEl.style.gridTemplateColumns = 'repeat(auto-fill, minmax(320px, 1fr))';
      livesEl.innerHTML = '';
      for (const live of livesData) {
        const card = document.createElement('div');
        const isEnded = !!live.endedAt;
        const isBackground = live.perfDiag && live.perfDiag.tabVisible === false;
        let accent = 'var(--nl-border)';
        let bg = 'var(--nl-card-bg)';
        if (isEnded) {
          accent = '#f0a0a0';
          bg = 'rgba(240,160,160,0.08)';
        } else if (isBackground) {
          accent = '#9ca3af';
          bg = 'rgba(156,163,175,0.08)';
        } else {
          accent = 'var(--nl-accent)';
        }
        card.style.cssText =
          'padding:10px 12px;border-radius:8px;' +
          `border:1px solid var(--nl-border);border-left:4px solid ${accent};background:${bg};`;

        // 健康チェック(5段階・●○)を上部に。数値を読まなくても状態が一目で分かる。
        card.appendChild(buildHealthCheckEl(live));

        const pre = document.createElement('pre');
        pre.textContent = buildLiveBlockText(live);
        pre.style.margin = '0';
        card.appendChild(pre);
        livesEl.appendChild(card);
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

/**
 * 健康チェック(5段階 ●○)の DOM を作る。
 *   取得率 / 描画(白化リスク) / 鮮度 / スクロール軽さ の4指標。
 *   スコアが低いほど赤め、高いほど緑めに色づけして一目で分かるようにする。
 * @param {object} live
 * @returns {HTMLElement}
 */
function buildHealthCheckEl(live) {
  const h = buildLiveHealth(live);
  const items = [
    { label: '取得', score: h.capture },
    { label: '描画', score: h.render },
    { label: '鮮度', score: h.freshness },
    { label: '軽さ', score: h.scroll }
  ];
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:flex;flex-wrap:wrap;gap:8px 14px;margin-bottom:8px;' +
    'padding-bottom:8px;border-bottom:1px dashed var(--nl-border);font-size:11px;';
  for (const it of items) {
    const cell = document.createElement('span');
    cell.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;gap:1px;';
    const lab = document.createElement('span');
    lab.textContent = it.label;
    lab.style.color = 'var(--nl-text-soft)';
    const dots = document.createElement('span');
    dots.textContent = scoreToDots(it.score);
    // 0-1=赤 / 2-3=黄 / 4-5=緑。
    dots.style.color = it.score >= 4 ? '#16a34a' : it.score >= 2 ? '#d97706' : '#dc2626';
    dots.style.letterSpacing = '1px';
    cell.appendChild(lab);
    cell.appendChild(dots);
    wrap.appendChild(cell);
  }
  return wrap;
}

function summarizeOneLive(lv, summary, snapshot, perfDiag, endedFlag) {
  // panel_summary のスキーマは src/lib/panelLiveSummary.js を参照
  // 防御的に optional access のみで読む(型ガード省略でも UI が壊れない設計)
  const s = summary && typeof summary === 'object' ? summary : null;
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : null;
  const diag = isPerfDiag(perfDiag) ? perfDiag : null;
  const endedAt = isLiveEndedFlag(endedFlag) ? endedFlag.endedAt : null;
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
  // v0.1.646: 「来場」は累計来場者数。officialViewerCount は同接(direct)で意味が違うため
  //   来場枠から外す(これを先頭 fallback にしていたため、同接が取れた瞬間だけ来場が
  //   同接値=少ない数に化け「5,088 vs 5,164」のズレになっていた)。popup の
  //   buildWatchMetaCardAudienceViewModel は viewerCountFromDom のみを来場に使う=それに揃える。
  const watchCount = resolveVisitorCount({
    viewerCountFromDom: snap?.viewerCountFromDom,
    panelWatchCount: s?.watchCount
  });
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
    lastIngestAgoMs,
    perfDiag: diag,
    endedAt
  };
}

function buildAiShareFullText({ overviewText, livesData, fastDiag }) {
  const lines = [];
  lines.push('## 君斗りんくの追憶のきらめき 状態速報');
  lines.push(`生成: ${new Date().toISOString()}`);
  lines.push('');
  if (overviewText) {
    lines.push('### 概要');
    lines.push(overviewText);
    // v0.1.766: 概要に公式値レーン(北極星レーン)の状況も併記(視聴中の配信のみ)。
    const laneStr = buildLaneStatusLine(fastDiag?.content?.giftDiagnostics?.['北極星レーン']);
    if (laneStr) lines.push(laneStr);
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

/* ============================================================================
 * ボタン
 * ========================================================================== */

/**
 * ビルド時 define で注入されるアップロード設定(scripts/build.mjs の statusDefine)。
 *   未注入のローカル/テスト環境でも壊れないよう typeof ガードする。
 */
function getUploadConfig() {
  const ingestKey = typeof NL_STATUS_INGEST_KEY !== 'undefined' ? NL_STATUS_INGEST_KEY : '';
  const viewToken = typeof NL_STATUS_VIEW_TOKEN !== 'undefined' ? NL_STATUS_VIEW_TOKEN : '';
  const appOrigin =
    typeof NL_STATUS_APP_ORIGIN !== 'undefined' && NL_STATUS_APP_ORIGIN
      ? NL_STATUS_APP_ORIGIN
      : 'https://app.tsuioku-no-kirameki.com';
  return { ingestKey, viewToken, appOrigin };
}

/**
 * 現在の jsonBlob を app の /api/status へ POST する。
 *   - host_permissions に app オリジンがあるため CORS 不要。
 *   - 成功時は閲覧 URL を返す。
 * @returns {Promise<{ ok: boolean, url?: string, error?: string }>}
 */
async function uploadStatusSnapshot() {
  const { ingestKey, viewToken, appOrigin } = getUploadConfig();
  if (!ingestKey || !viewToken) {
    return { ok: false, error: 'キー未設定(ビルド時に NL_STATUS_INGEST_KEY / NL_STATUS_VIEW_TOKEN を注入してください)' };
  }
  const jsonBlob = _lastRenderedBundle?.jsonBlob;
  if (!jsonBlob) {
    return { ok: false, error: 'まだ送信できる状態がありません' };
  }
  try {
    const res = await fetch(`${appOrigin}/api/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-share-key': ingestKey },
      body: JSON.stringify({ ...jsonBlob, v: viewToken })
    });
    if (!res.ok) {
      return { ok: false, error: `送信失敗 (HTTP ${res.status})` };
    }
    return { ok: true, url: `${appOrigin}/?v=${encodeURIComponent(viewToken)}` };
  } catch (err) {
    return { ok: false, error: '通信エラー: ' + String(err?.message || err) };
  }
}

/** 自動巡回トグルボタンの文言を現在の有効状態に合わせる。 */
async function refreshAutopatrolToggleLabel() {
  const btn = document.getElementById('btnAutopatrolToggle');
  if (!btn) return;
  // background の getAutopatrolEnabled は「!== false」=既定 ON。
  //   未設定 or true は ON、明示的 false のときだけ OFF として表示を合わせる。
  let enabled = true;
  try {
    const bag = await chrome.storage.local.get(AUTOPATROL_ENABLED_KEY);
    enabled = bag?.[AUTOPATROL_ENABLED_KEY] !== false;
  } catch {
    /* read 失敗時は既定 ON 表示 */
  }
  btn.textContent = enabled ? '🔁 自動巡回 ON' : '🔁 自動巡回 OFF';
  btn.dataset.enabled = enabled ? '1' : '0';
}

function setupPatrolButtons() {
  // v0.1.652: 「コメビュを開く」: 独自コメビュ(comeview.html)を別ウィンドウで開く。
  //   lv は付けない=comeview 側が nls_last_watch_url から自己解決する(配信切替に追従)。
  const btnComeview = document.getElementById('btnComeview');
  if (btnComeview) {
    btnComeview.addEventListener('click', () => {
      const url = chrome.runtime.getURL('comeview.html');
      try {
        chrome.windows.create({ url, type: 'popup', width: 400, height: 640 });
      } catch {
        window.open(url, '_blank', 'width=400,height=640');
      }
    });
  }
  // 「次の上位配信へ」: SW にランキング巡回を1歩進めさせる。
  const btnNext = document.getElementById('btnNextLive');
  const resultEl = document.getElementById('patrolResult');
  if (btnNext) {
    btnNext.addEventListener('click', async () => {
      btnNext.disabled = true;
      const prev = btnNext.textContent;
      btnNext.textContent = '移動中...';
      try {
        const r = await chrome.runtime.sendMessage({ type: NEXT_LIVE_REQUEST_TYPE });
        if (resultEl) {
          if (r?.ok) {
            resultEl.textContent = `⏭ ${r.lv} へ移動しました`;
          } else if (r?.reason === 'no_more_lives') {
            resultEl.textContent = '巡回先が見つかりません(少し待つと補充されます)';
          } else if (r?.reason === 'no_watch_tab_open') {
            resultEl.textContent = 'ニコ生 watch タブを開いてから押してください';
          } else {
            resultEl.textContent = `移動できませんでした (${r?.reason || 'unknown'})`;
          }
        }
      } catch (err) {
        if (resultEl) resultEl.textContent = '通信エラー: ' + String(err?.message || err);
      }
      btnNext.textContent = prev;
      btnNext.disabled = false;
    });
  }

  // 自動巡回 ON/OFF トグル。
  const btnToggle = document.getElementById('btnAutopatrolToggle');
  if (btnToggle) {
    void refreshAutopatrolToggleLabel();
    btnToggle.addEventListener('click', async () => {
      btnToggle.disabled = true;
      try {
        const bag = await chrome.storage.local.get(AUTOPATROL_ENABLED_KEY);
        const cur = bag?.[AUTOPATROL_ENABLED_KEY] !== false; // 既定 ON
        await chrome.storage.local.set({ [AUTOPATROL_ENABLED_KEY]: !cur });
        await refreshAutopatrolToggleLabel();
        if (resultEl) {
          resultEl.textContent = !cur
            ? '🔁 自動巡回を ON にしました(背景で上位配信を巡回記録)'
            : '🔁 自動巡回を OFF にしました';
        }
      } catch (err) {
        if (resultEl) resultEl.textContent = '切替に失敗: ' + String(err?.message || err);
      }
      btnToggle.disabled = false;
    });
  }
}

/* ============================================================================
 * 配信者の評判チェック (PR R3 配線 + R4)
 *   - 配信者名は既存の summaries(snapshot/panel)から自動解決(R4)
 *   - 「チェック」で SW に Google サジェスト取得を依頼(R2)→ネガ判定(R1)→3キャラ表示(R3)
 *   - read-only 思想を壊さない: storage write しない・ボタン押下時だけ SW へ依頼
 * ========================================================================== */

/** summaries バッグから配信者名を自動解決して input に流し込む。 */
async function autofillBroadcasterName() {
  try {
    const lvList = await enumerateActiveLives();
    const summaries = await loadAllSummaries(lvList);
    const lv = Array.isArray(lvList) && lvList.length ? lvList[0] : '';
    const name = pickBroadcasterNameForReputation({ summaries, lv });
    const input = /** @type {HTMLInputElement|null} */ (
      document.getElementById('reputationQuery')
    );
    if (input && name && !input.value.trim()) input.value = name;
  } catch {
    /* 自動入力は best-effort。失敗しても手入力できる。 */
  }
}

/** 1つの配信者名で Google サジェストを取得→ネガ判定→3キャラ表示する。 */
async function runReputationCheck() {
  const input = /** @type {HTMLInputElement|null} */ (
    document.getElementById('reputationQuery')
  );
  const resultEl = document.getElementById('reputationResult');
  const btnRun = /** @type {HTMLButtonElement|null} */ (
    document.getElementById('btnReputationRun')
  );
  if (!resultEl) return;

  const query = String(input?.value ?? '').trim();
  if (!isValidSuggestQuery(query)) {
    resultEl.className = 'empty-note';
    resultEl.textContent = '配信者名を入力してね（1〜100文字）。';
    return;
  }

  if (btnRun) btnRun.disabled = true;
  resultEl.className = 'empty-note';
  resultEl.textContent = 'サジェストを調べているよ…';

  try {
    const res = await chrome.runtime.sendMessage({
      type: GOOGLE_SUGGEST_FETCH_MESSAGE_TYPE,
      query
    });
    if (!res || res.ok !== true) {
      resultEl.className = 'empty-note';
      resultEl.textContent =
        'サジェストを取得できませんでした（時間をおいて再度お試しください）。';
      return;
    }
    const suggests = parseGoogleSuggestResponse(res.json);
    const analyzed = analyzeNegativeSuggests(suggests);
    const vm = buildReputationViewModel({ query, analyzed });
    resultEl.className = '';
    // buildReputationAlertHtml は全入力を escape 済み(lib 側 test で担保)。
    resultEl.innerHTML = buildReputationAlertHtml(vm);
  } catch (err) {
    resultEl.className = 'empty-note';
    resultEl.textContent = '通信エラー: ' + String(err?.message || err);
  } finally {
    if (btnRun) btnRun.disabled = false;
  }
}

function setupReputationCheck() {
  const btnOpen = document.getElementById('btnReputationCheck');
  const lane = document.getElementById('reputationLane');
  if (btnOpen && lane) {
    btnOpen.addEventListener('click', () => {
      lane.hidden = false;
      void autofillBroadcasterName();
      lane.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  const btnRun = document.getElementById('btnReputationRun');
  if (btnRun) btnRun.addEventListener('click', () => void runReputationCheck());
  const input = document.getElementById('reputationQuery');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e instanceof KeyboardEvent && e.key === 'Enter') {
        e.preventDefault();
        void runReputationCheck();
      }
    });
  }
}

function setupButtons() {
  setupPatrolButtons();
  setupReputationCheck();
  const btnUpload = document.getElementById('btnUpload');
  if (btnUpload) {
    const { ingestKey, viewToken } = getUploadConfig();
    const resultEl = document.getElementById('uploadResult');
    if (!ingestKey || !viewToken) {
      // キー未注入のビルドではボタンを無効化して誤操作を防ぐ。
      btnUpload.disabled = true;
      btnUpload.title = 'スマホ送信キーが未設定のビルドです';
    } else {
      btnUpload.addEventListener('click', async () => {
        btnUpload.disabled = true;
        const prev = btnUpload.textContent;
        btnUpload.textContent = '送信中...';
        const r = await uploadStatusSnapshot();
        btnUpload.textContent = prev;
        btnUpload.disabled = false;
        if (resultEl) {
          if (r.ok) {
            resultEl.textContent = `✓ 送信しました。スマホで開く: ${r.url}`;
          } else {
            resultEl.textContent = `× ${r.error}`;
          }
        }
      });
    }
  }
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
