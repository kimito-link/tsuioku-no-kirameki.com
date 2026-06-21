/**
 * 応援ライブビュー(live-view.html)のエントリ(v0.1.871)。
 *
 * 背景(ユーザー構想 2026-06-21):
 *   ちくらんカードをクリックすると Chrome の新規タブで開く「リアルタイムで盛り上がってる感」のある専用
 *   ページ。将来はサーバーに上げて拡張を使っていない人でも URL で見られる公開ページに育てる。
 *
 * 移植性の設計(将来 Web/iOS/Android):
 *   - データ取得を createLiveViewDataSource() の1か所に隔離(拡張版=chrome.storage 購読)。将来サーバー版は
 *     ここを fetch に差し替えるだけで描画はそのまま再利用できる。
 *   - 盛り上がり判定は純関数 computeHeatLevel(heatLevel.js)・応援者は supporterRanking(共有)=拡張非依存。
 *   - 描画(renderLiveView)はデータを受け取って DOM を更新するだけ(副作用は DOM のみ)。
 */

import { computeHeatLevel } from '../lib/heatLevel.js';
import { categorizeUsersForThumbGrid } from '../lib/userThumbGrid.js';
import { buildGiftThrowerLaneEntries } from '../lib/userLaneMergeGiftThrowers.js';
import { buildNiconicoDefaultUserIconUrl } from '../lib/reportUserThumb.js';
import { aggregateMarketingReport } from '../lib/marketingAggregate.js';
import { buildSupporterRanking } from '../lib/supporterRanking.js';
import { anonymousIdenticonDataUrl } from '../lib/anonymousIdenticon.js';
// v0.1.879: popup の公式値レーン(北極星レーン)を完全コピーするための純関数。
//   貢献度ランキングの3経路(Koken API / DOM bundle / iframe storage)優先解決と、公式行→strip room 変換。
//   popup-entry.js の resolveOfficialContributionRankingRows / officialDomRankingRowsToStripRooms と同一。
import { resolveContributionRankingRowsFromSources } from '../lib/officialContributionRankingResolver.js';
import { officialDomRankingRowsToStripRooms } from '../lib/officialDomRankingRowsToStripRooms.js';
// v0.1.881: popup と【同じ本物の描画関数】を使う(自作の再現を撤回=完全コピー)。会議結論。
import { renderTopSupportRankStripInto } from '../lib/paintTopSupportRankStyleIntoElement.js';
// v0.1.880: ギフト履歴レーン(北極星)を popup と完全コピーで移植するための純関数。
//   buildGiftHistoryNorthStarViewModel = popup の computeGiftHistoryNorthStarRoomsContext と同じ VM。
import { buildGiftHistoryNorthStarViewModel } from '../lib/giftHistoryViewModel.js';
import { giftSubAppHistoryStorageKey } from '../lib/storageKeys.js';
import { giftHistoryThrowsStorageKey } from '../lib/kokenGiftHistoryApi.js';
import { GIFT_HISTORY_LANE_MAX } from '../lib/giftRankStripConfig.js';
import { resolveGiftHistorySummaryPoints, reconcileGiftHistoryNorthStarContext } from '../lib/giftHistoryOfficialReconcile.js';
import {
  isCommentDbAvailable,
  openCommentDb,
  countCommentsForLive,
  readAllCommentsForLive as readAllCommentsFromDb
} from '../lib/commentDb.js';
// v0.1.881: popup と同じ多段ソース(IDB→storageチャンク→テール)でコメントを読む共有リーダ。
//   IDB に無いだけ(=chrome.storage チャンクに在る)で応援者ランキングが空になる退行を断つ。
import { readAllCommentsForLive } from '../lib/readAllCommentsForLive.js';

const PANEL_SUMMARY_PREFIX = 'nls_panel_summary_';
const WATCH_SNAPSHOT_PREFIX = 'nls_watch_snapshot_';
const KEY_REPORT_PREVIEW = 'nls_report_preview_v1';
const GIFT_USERS_PREFIX = 'nls_gift_users_';
// v0.1.879: 公式値レーン(北極星レーン)の storage キー(popup-entry.js と同一の正本)。
const KOKEN_CONTRIB_PREFIX = 'nls_koken_api_contrib_'; // 貢献度ランキング(Koken API)
const IFRAME_OFFICIAL_DOM_PREFIX = 'nls_iframe_official_dom_'; // 貢献度ランキング(iframe relay フォールバック)
const NICOAD_API_RANKING_PREFIX = 'nls_nicoad_api_ranking_'; // 広告ランキング(nicoad API)
const REFRESH_MS = 2000;
// v0.1.880: ギフト履歴レーンの storage キー(popup と同じ正本・関数経由で取る)。
// popup と同じ「ゆっくり画像」フォールバック(STORY_GRID_DEFAULT_TILE_IMG・拡張内相対パス)。
const STORY_GRID_DEFAULT_TILE_IMG =
  'images/yukkuri-charactore-english/link/link-yukkuri-half-eyes-mouth-closed.png';

/** URL の ?lv= から live id を取り出す(検証付き)。 */
function liveIdFromUrl() {
  try {
    const lv = String(new URLSearchParams(location.search).get('lv') || '').trim().toLowerCase();
    return /^lv\d{1,15}$/.test(lv) ? lv : '';
  } catch {
    return '';
  }
}

/**
 * データ取得を隔離した「データソース」。拡張版は chrome.storage を読む。将来サーバー版はこの関数だけ
 *   fetch 実装に差し替える(描画は不変)。
 * @param {string} lv
 * @returns {() => Promise<{summary:any, snapshot:any, reportPreview:any, giftUsers:any}>}
 */
function createLiveViewDataSource(lv) {
  return async () => {
    try {
      const bag = await chrome.storage.local.get([
        PANEL_SUMMARY_PREFIX + lv,
        WATCH_SNAPSHOT_PREFIX + lv,
        KEY_REPORT_PREVIEW,
        GIFT_USERS_PREFIX + lv,
        // v0.1.879: 公式値レーン(北極星レーン)。popup と同じ storage 由来=popup 非依存で再現。
        KOKEN_CONTRIB_PREFIX + lv,
        IFRAME_OFFICIAL_DOM_PREFIX + lv,
        NICOAD_API_RANKING_PREFIX + lv,
        // v0.1.880: ギフト履歴レーン(送り主別累計pt+個別投げ一覧)。popup と同じ storage キー。
        giftSubAppHistoryStorageKey(lv),
        giftHistoryThrowsStorageKey(lv)
      ]);
      return {
        summary: bag?.[PANEL_SUMMARY_PREFIX + lv] || null,
        snapshot: bag?.[WATCH_SNAPSHOT_PREFIX + lv] || null,
        reportPreview: bag?.[KEY_REPORT_PREVIEW] || null,
        giftUsers: bag?.[GIFT_USERS_PREFIX + lv] || null,
        kokenContrib: bag?.[KOKEN_CONTRIB_PREFIX + lv] || null,
        iframeOfficialDom: bag?.[IFRAME_OFFICIAL_DOM_PREFIX + lv] || null,
        nicoadApiRanking: bag?.[NICOAD_API_RANKING_PREFIX + lv] || null,
        giftSubAppHistory: bag?.[giftSubAppHistoryStorageKey(lv)] || null,
        giftHistoryThrows: bag?.[giftHistoryThrowsStorageKey(lv)] || null
      };
    } catch {
      return {
        summary: null, snapshot: null, reportPreview: null, giftUsers: null,
        kokenContrib: null, iframeOfficialDom: null, nicoadApiRanking: null,
        giftSubAppHistory: null, giftHistoryThrows: null
      };
    }
  };
}

// v0.1.876: 応援者ランキングを popup 非依存で自前集計。reportPreview は popup を開いた時しか来ないため、
//   live-view 自身が popup と同じ多段ソース(IDB→chrome.storage チャンク→テール)で全コメントを読み、
//   aggregateMarketingReport→buildSupporterRanking で topSupporters を作る(popup と同じ純関数=同じ結果)。
//   v0.1.881: IDB のみ読みだと「IDB に無いだけ(=storage チャンクに在る)」で空になっていた退行を、
//   popup の本物のリーダ(readAllCommentsForLive)を共有して根治。重いので 15 秒間引きキャッシュ。
let _supCacheAt = 0;
let _supCache = /** @type {any[]} */ ([]);

/** 拡張オリジン IDB から全件(無ければ null)。popup の readAllCommentsFromCommentDb と同型。 @param {string} lv */
async function readAllFromCommentDbForLiveView(lv) {
  if (!isCommentDbAvailable()) return null;
  let db = null;
  try {
    db = await openCommentDb();
    const cnt = await countCommentsForLive(db, lv);
    if (!Number.isFinite(cnt) || cnt <= 0) return null;
    return await readAllCommentsFromDb(db, lv);
  } catch {
    return null;
  } finally {
    try { if (db) db.close(); } catch { /* no-op */ }
  }
}

/** @param {string} lv @param {number} nowMs @param {string} broadcasterUserId */
async function computeSupportersFromDb(lv, nowMs, broadcasterUserId) {
  if (nowMs - _supCacheAt < 15000) return _supCache; // 15秒間引き(全件集計は重い)。
  _supCacheAt = nowMs;
  try {
    // popup と同じ多段ソース: IDB → chrome.storage チャンク → テール。
    const comments = await readAllCommentsForLive(lv, {
      readAllFromCommentDb: readAllFromCommentDbForLiveView,
      getMany: (keys) => chrome.storage.local.get(keys),
      nowMs
    });
    if (!Array.isArray(comments) || comments.length === 0) { _supCache = []; return _supCache; }
    const mkt = aggregateMarketingReport(comments, lv, {
      broadcasterUserId: String(broadcasterUserId || '')
    });
    _supCache = buildSupporterRanking(mkt?.topUsers, { limit: 80 });
    return _supCache;
  } catch {
    return _supCache;
  }
}

/** @param {unknown} v */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** h:mm:ss / m:ss(live-view 内製・依存を増やさない)。 @param {unknown} sec */
function elapsedText(sec) {
  const s = num(sec);
  if (s == null || s < 0) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  /** @param {number} n */
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

// 分速の自前トラッキング(recordedCount の増分 ÷ 経過分)。直近サンプルとの差から算出。
let _prevCount = /** @type {number|null} */ (null);
let _prevAtMs = 0;
let _lastCpm = 0;

/** recordedCount の増分から分速を更新(2サンプル目以降)。 @param {unknown} recorded @param {number} nowMs */
function updateCpm(recorded, nowMs) {
  const cur = num(recorded);
  if (cur == null) return _lastCpm;
  if (_prevCount != null && nowMs > _prevAtMs) {
    const dCount = cur - _prevCount;
    const dMin = (nowMs - _prevAtMs) / 60000;
    if (dMin > 0 && dCount >= 0) {
      // 直近値と前回値をなだらかに(急な0/スパイクで炎が点滅しないよう簡易平滑化)。
      const inst = dCount / dMin;
      _lastCpm = Math.round((_lastCpm * 0.5 + inst * 0.5) * 10) / 10;
    }
  }
  _prevCount = cur;
  _prevAtMs = nowMs;
  return _lastCpm;
}

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

// v0.1.878: popup の統計カード(記録/来場/本家コメ/経過/広告pt/ギフトpt)を再現。値が無い項目は「—」。
/** @param {{recorded:number|null, watch:number|null, official:number|null, elapsedText:string|null, adPt:number|null, giftPt:number|null}} v */
function renderStatCards(v) {
  const el = $('statCards');
  if (!el) return;
  const fmt = (/** @type {number|null} */ n) => (n == null ? '—' : Number(n).toLocaleString('ja-JP'));
  const cards = [
    ['記録', fmt(v.recorded), '応援コメント'],
    ['来場', fmt(v.watch), '人'],
    ['本家コメ', fmt(v.official), '公式'],
    ['経過', v.elapsedText || '—', ''],
    ['広告pt', fmt(v.adPt), ''],
    ['ギフトpt', fmt(v.giftPt), '']
  ];
  el.innerHTML = '';
  for (const [label, value, sub] of cards) {
    const c = document.createElement('div');
    c.className = 'stat-card';
    const l = document.createElement('div');
    l.className = 'stat-label';
    l.textContent = label;
    const val = document.createElement('div');
    val.className = 'stat-value';
    val.textContent = value;
    c.append(l, val);
    if (sub) {
      const sb = document.createElement('div');
      sb.className = 'stat-sub';
      sb.textContent = sub;
      c.appendChild(sb);
    }
    el.appendChild(c);
  }
}

/**
 * データを受け取って DOM を更新する(副作用は DOM のみ・将来 Web/モバイルでも同型)。
 * @param {string} lv @param {any} data @param {number} nowMs
 */
function renderLiveView(lv, data, nowMs) {
  const snap = data?.snapshot || {};
  const s = data?.summary || {};
  const title = String(snap.title || snap.programTitle || s.title || '配信');
  const broadcaster = String(snap.broadcasterName || s.broadcasterName || '');
  const thumb = String(snap.thumbnailUrl || '').trim();
  const watch = num(snap.viewerCountFromDom) ?? num(s.watchCount);
  const recorded = num(s.recordedCount) ?? 0;
  const elSec =
    snap.streamAgeMin != null && Number.isFinite(Number(snap.streamAgeMin))
      ? Math.floor(Number(snap.streamAgeMin) * 60)
      : num(s.elapsedSec);

  document.title = `🔥 ${broadcaster || title} — 応援ライブビュー`;
  $('lvTitle').textContent = title;
  $('lvBroadcaster').textContent = broadcaster || '(配信者名 不明)';

  if (thumb) {
    const box = $('lvThumb');
    box.innerHTML = '';
    const img = document.createElement('img');
    img.src = thumb;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { try { img.remove(); } catch { /* no-op */ } });
    box.appendChild(img);
  }

  const meta = [];
  const et = elapsedText(elSec);
  if (et) meta.push(`⏱ ${et}`);
  if (watch != null) meta.push(`👤 ${watch.toLocaleString('ja-JP')}`);
  if (recorded != null) meta.push(`💬 ${recorded.toLocaleString('ja-JP')}`);
  $('lvMeta').innerHTML = '';
  for (const m of meta) {
    const sp = document.createElement('span');
    sp.textContent = m;
    $('lvMeta').appendChild(sp);
  }

  // v0.1.878: popup の統計カード(記録/来場/本家コメ/経過/広告pt/ギフトpt)を再現。値は summary/snapshot から。
  const official = num(s.officialCount) ?? num(snap.officialCommentCount);
  const adPt = num(snap.officialAdPointsNdgr) ?? num(s.adPoints);
  const giftPt = num(snap.officialGiftPointsNdgr) ?? num(s.giftPoints);
  renderStatCards({
    recorded, watch, official, elapsedText: elapsedText(elSec), adPt, giftPt
  });

  // 盛り上がりメーター(分速→熱量)。
  const cpm = updateCpm(recorded, nowMs);
  const heat = computeHeatLevel(cpm);
  $('heatValue').textContent = `${heat.label}  ・  ${cpm.toLocaleString('ja-JP')}/分`;
  $('heatFill').style.width = `${heat.score}%`;
  const box = $('heatBox');
  if (box) box.classList.toggle('pulse', heat.stage === 'hot' || heat.stage === 'blazing');

  // 応援者ランキング。v0.1.876: 自前集計(IDB から・popup 非依存)を最優先。無ければ reportPreview(popup 由来)。
  const rp = data?.reportPreview;
  const rpRows =
    rp && String(rp.liveId || '').trim().toLowerCase() === lv && Array.isArray(rp.topSupporters)
      ? rp.topSupporters
      : null;
  const rows = Array.isArray(data?.supporters) && data.supporters.length ? data.supporters : rpRows;
  const body = $('rankBody');
  if (rows && rows.length) {
    // v0.1.884: popup の本物の描画関数(renderTopSupportRankStripInto)で描く=完全コピー。
    //   自作の buildRankLineEl/buildCasterTileEl(アレンジ)は撤回。応援者(userId/name/avatarUrl/count)を
    //   strip room に写して本物に渡すだけ=popup の応援帯と 1px 違わない。
    const stripRooms = rows.slice(0, 30).map((/** @type {any} */ r) => ({
      userKey: String(r.userId || ''),
      nickname: String(r.name || ''),
      count: Number(r.count || 0),
      avatarUrl: String(r.avatarUrl || '')
    }));
    body.className = '';
    // 応援帯は北極星レーンではない=popup と同じく isNorthStarBody は付けない(本物を直接呼ぶ)。
    renderTopSupportRankStripInto(body, stripRooms, {
      noteText: '応援コメントが多い順',
      unitSuffix: '件',
      ariaLabel: '応援者ランキング',
      colorScheme: 'light',
      defaultThumbSrc: STORY_GRID_DEFAULT_TILE_IMG,
      anonymousFallbackThumbSrc: STORY_GRID_DEFAULT_TILE_IMG,
      anonymousIdenticonResolver: (/** @type {string} */ uid) => anonymousIdenticonDataUrl(uid, 64)
    });
  } else {
    body.className = 'empty';
    body.textContent = '応援コメントを集計中です…(記録が貯まると順位が出ます)';
  }

  // v0.1.875: popup の全レーンを再現。①りんく列(数値ID+個人サムネ) ②ギフト列(ギフト投げた人)。
  renderLanes(lv, data, rows);

  // v0.1.879: popup の公式値レーン(北極星レーン=貢献度/広告ランキング)を完全コピーで再現。
  renderNorthStarLanes(lv, data);

  const d = new Date(nowMs);
  $('updatedAt').textContent = `最終更新 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/** ユーザー行({thumbSrc,userId,nickname,count?})からアイコンタイル DOM を作る(popup の人物タイル相当)。 @param {any} u */
function buildLaneTile(u) {
  const tile = document.createElement('div');
  tile.className = 'lane-tile';
  const av = document.createElement('div');
  av.className = 'lane-av';
  const src = String(u?.thumbSrc || u?.avatarUrl || '').trim();
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { try { img.remove(); av.textContent = '👤'; } catch { /* no-op */ } });
    av.appendChild(img);
  } else {
    av.textContent = '👤';
  }
  tile.appendChild(av);
  const name = document.createElement('div');
  name.className = 'lane-name';
  name.textContent = String(u?.nickname || u?.userId || '');
  tile.appendChild(name);
  const uid = document.createElement('div');
  uid.className = 'lane-uid';
  const c = Number(u?.count);
  uid.textContent = Number.isFinite(c) && c > 0 ? `${String(u?.userId || '')} ・ ${c}件` : String(u?.userId || '');
  tile.appendChild(uid);
  return tile;
}

/** りんく列・ギフト列を描画(popup の全レーン再現)。データが無ければそのレーンを隠す(死にリンクにしない)。 @param {string} lv @param {any} data @param {any[]|null} supporters 解決済み応援者(自前集計優先) */
function renderLanes(lv, data, supporters) {
  // ① りんく列(数値ID+個人サムネが揃った応援だけ)。応援者を categorizeUsersForThumbGrid で振り分け。
  const linkSec = $('linkLaneSec');
  const linkBody = $('linkLaneBody');
  if (linkSec && linkBody) {
    const sup = Array.isArray(supporters) ? supporters : [];
    // 応援者(rank/name/avatarUrl/count/userId)を RawThumbGridUser 形に。
    const raw = sup.map((/** @type {any} */ r) => ({ userId: r.userId, nickname: r.name, avatarUrl: r.avatarUrl, count: r.count }));
    const { numericIdUsers } = categorizeUsersForThumbGrid(raw, { maxNumeric: 80 });
    if (numericIdUsers.length) {
      linkSec.hidden = false;
      linkBody.innerHTML = '';
      for (const u of numericIdUsers) linkBody.appendChild(buildLaneTile(u));
    } else {
      linkSec.hidden = true;
    }
  }
  // ② ギフト列(この放送でギフト/広告を投げた人・数値IDで記録できた順)。storage の nls_gift_users_<lv>。
  const giftSec = $('giftLaneSec');
  const giftBody = $('giftLaneBody');
  if (giftSec && giftBody) {
    const entries = buildGiftThrowerLaneEntries(Array.isArray(data?.giftUsers) ? data.giftUsers : [], { liveId: lv });
    if (entries.length) {
      giftSec.hidden = false;
      giftBody.innerHTML = '';
      for (const e of entries.slice(0, 60)) {
        // ギフト列は avatarUrl 空=数値IDの CDN アイコンで補う(popup と同じ「個人サムネ→ゆっくり画像」の前段)。
        giftBody.appendChild(buildLaneTile({
          userId: e.userId,
          nickname: e.nickname,
          thumbSrc: e.avatarUrl || buildNiconicoDefaultUserIconUrl(e.userId)
        }));
      }
    } else {
      giftSec.hidden = true;
    }
  }
}

// ============================================================================
// v0.1.879: 公式値レーン(北極星レーン)。popup-entry.js の完全コピー。
//   描画(paintNorthStarStripInto)は popup の paintTopSupportRankStyleIntoElement と
//   【同じHTML/クラス】を生成(同じ純関数 topSupportRankLineModels + 同じ escape + 同じ
//   nl-top-support-rank__* クラス)。レーンの開閉も popup と同じ(rows>0 で show・空は hide)。
//   データは storage(nls_koken_api_contrib_/nls_iframe_official_dom_/nls_nicoad_api_ranking_)由来
//   =popup を開いていなくても再現できる。アレンジは一切足さない。
// ============================================================================

/**
 * v0.1.881: popup と【同じ本物の描画関数 renderTopSupportRankStripInto】に委譲する薄いラッパ。
 *   自作の再現(旧 paintNorthStarStripInto)は撤回。live-view 固有の値だけ注入(ライト配色・
 *   ゆっくり画像フォールバック・匿名 identicon)。北極星レーンの DOM 同期/待機UI teardown は
 *   live-view に無いので省略(既定 no-op)=popup と 1px 違わない描画になる。
 * @param {HTMLElement} body `#northStarLaneBody-<laneId>`
 * @param {{ userKey: string; nickname: string; count: number; avatarUrl?: string }[]} rooms
 * @param {{ noteText: string; unitSuffix: string; ariaLabel: string; pointsSumAll?: number; pointsSumDisplayed?: number; officialProgramGiftPts?: number|null }} opts
 */
function paintNorthStarStripInto(body, rooms, opts) {
  renderTopSupportRankStripInto(body, rooms, {
    ...opts,
    isNorthStarBody: true,
    colorScheme: 'light',
    defaultThumbSrc: STORY_GRID_DEFAULT_TILE_IMG,
    anonymousFallbackThumbSrc: STORY_GRID_DEFAULT_TILE_IMG,
    anonymousIdenticonResolver: (/** @type {string} */ uid) => anonymousIdenticonDataUrl(uid, 64)
  });
}

/** 北極星レーンを畳む(rows が無い時=popup と同じ「静かに隠す」)。 @param {string} laneId */
function hideNorthStarLane(laneId) {
  const lane = document.querySelector(`.nl-north-star-lane[data-lane="${laneId}"]`);
  if (lane instanceof HTMLElement) lane.hidden = true;
}

/** 北極星レーンを表示(rows が来た時)。 @param {string} laneId */
function showNorthStarLane(laneId) {
  const lane = document.querySelector(`.nl-north-star-lane[data-lane="${laneId}"]`);
  if (lane instanceof HTMLElement) lane.hidden = false;
}

// v0.1.880: ギフト履歴レーンの ctx を storage から作る(popup の computeGiftHistoryNorthStarRoomsContext と同型)。
//   源0(最優先)= nls_gift_subapp_history_<lv>(koken/sub-app 履歴)を buildGiftHistoryNorthStarViewModel で VM 化。
//   源1(フォールバック)= nls_gift_history_throws_<lv>(保存済み公式履歴 throws)を送り主別 pt 降順に。
//   live-view は popup の in-memory 源(bundle.giftHistory / NDGR live nls_gift_events_)は持たないので storage 2 源のみ。
/** @param {any} data @returns {{rooms:any[], noteText:string, unitSuffix:string, ariaLabel:string, throwsTableHtml:string, pointsSumAll:number, pointsSumDisplayed:number}|null} */
function computeGiftHistoryForLiveView(data) {
  // --- 源0: koken / sub-app 個別履歴。popup と同じく VM 化(rooms + 個別投げ一覧 throwsTableHtml)。
  const subRaw = data?.giftSubAppHistory;
  if (subRaw && typeof subRaw === 'object' && !Array.isArray(subRaw)) {
    const vm = buildGiftHistoryNorthStarViewModel(
      /** @type {{ history?: unknown[] }} */ (subRaw),
      { maxRooms: GIFT_HISTORY_LANE_MAX, maxThrows: 20 }
    );
    if (vm && vm.rooms.length > 0) {
      const senderN = vm.senderCount;
      const shownN = vm.rooms.length;
      const rankCap = shownN < senderN ? `（表示${shownN}名・上位${GIFT_HISTORY_LANE_MAX}まで）` : '';
      const srcLabel = vm.source === 'koken-api' ? 'koken 公式 API' : 'ギフトサイドバー履歴';
      return {
        rooms: vm.rooms.map((/** @type {any} */ r) => ({
          userKey: String(r.userKey || ''),
          nickname: String(r.nickname || ''),
          count: Number(r.count) || 0,
          avatarUrl: String(r.avatarUrl || '').trim()
        })),
        noteText: `${srcLabel}の個別履歴（history）から送り主別累計pt順。送り主${senderN}名・投げ${vm.throwCount}件${rankCap}（番組累計ポイントとは別指標）`,
        unitSuffix: 'pt',
        ariaLabel: 'koken 公式ギフト履歴の送り主別集計',
        throwsTableHtml: String(vm.throwsTableHtml || ''),
        pointsSumAll: Number(vm.pointsSumAll) || 0,
        pointsSumDisplayed: Number(vm.pointsSumDisplayed) || 0
      };
    }
  }
  // --- 源1: 保存済み公式履歴 throws(送り主別 pt 降順・popup の throws フォールバックと同じ)。
  const throwsRows = Array.isArray(data?.giftHistoryThrows) ? data.giftHistoryThrows : [];
  if (throwsRows.length > 0) {
    const sorted = [...throwsRows].sort(
      (/** @type {any} */ a, /** @type {any} */ b) => (Number(b?.totalPoints) || 0) - (Number(a?.totalPoints) || 0)
    );
    const senderN = sorted.length;
    const throwM = sorted.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + (Number(r?.throwCount) || 0), 0);
    const rooms = sorted.slice(0, GIFT_HISTORY_LANE_MAX).map((/** @type {any} */ r) => ({
      userKey: String(r?.userId || ''),
      nickname: String(r?.nickname || ''),
      count: Number(r?.totalPoints) || 0,
      avatarUrl: String(r?.avatarUrl || '').trim()
    }));
    const pointsSumAll = sorted.reduce((/** @type {number} */ s, /** @type {any} */ r) => s + (Number(r?.totalPoints) || 0), 0);
    const pointsSumDisplayed = rooms.reduce((s, r) => s + (Number(r.count) || 0), 0);
    return {
      rooms,
      noteText: `保存済み公式履歴からユーザー別累計pt順。送り主${senderN}名・投げ${throwM}件（番組累計ポイントとは別指標）`,
      unitSuffix: 'pt',
      ariaLabel: '公式サイドバー履歴のユーザー別集計',
      throwsTableHtml: '',
      pointsSumAll,
      pointsSumDisplayed
    };
  }
  return null;
}

// v0.1.880: ギフト履歴レーンの summary gadget(表示の合計pt)を popup と同じ純関数で塗る。
/** @param {{pointsSumAll:number, pointsSumDisplayed:number, officialProgramGiftPts:number|null, roomCount:number}} t */
function paintGiftHistorySummaryGadgetLV(t) {
  const summary = document.getElementById('northStarLaneGadgetSummary-giftHistory');
  if (!(summary instanceof HTMLElement)) return;
  const resolved = resolveGiftHistorySummaryPoints({
    historySumAll: t.pointsSumAll,
    historySumDisplayed: t.pointsSumDisplayed,
    officialProgramGiftPts: t.officialProgramGiftPts
  });
  const showPts = resolved.usesOfficialSummary
    ? resolved.summaryPoints
    : Math.max(0, Math.floor(Number(t.pointsSumDisplayed) || 0));
  const numEl = summary.querySelector('.nl-north-star-lane__summary-pt-num');
  const unitEl = summary.querySelector('.nl-north-star-lane__summary-pt-unit');
  const noteEl = summary.querySelector('.nl-north-star-lane__summary-note');
  if (numEl instanceof HTMLElement) numEl.textContent = String(showPts);
  if (unitEl instanceof HTMLElement) unitEl.textContent = 'pt';
  if (noteEl instanceof HTMLElement) {
    if (resolved.usesOfficialSummary) {
      noteEl.textContent = resolved.gapPoints > 0
        ? `公式番組累計（内訳に履歴未取得 ${resolved.gapPoints.toLocaleString('ja-JP')}pt を含む）`
        : '公式番組累計（プレイヤー表示と同じ）';
    } else if (Math.floor(Number(t.pointsSumAll) || 0) > showPts) {
      noteEl.textContent = `表示中${t.roomCount}名の合計（全${Math.floor(Number(t.pointsSumAll) || 0)}pt）`;
    } else {
      noteEl.textContent = '履歴一覧からの合計';
    }
  }
  summary.hidden = false;
  summary.removeAttribute('aria-hidden');
}

/** ギフト履歴ヘッダ右の「公式累計pt」を塗る(popup の syncGiftHistoryHeaderProgramPt 相当)。 @param {number|null} v */
function syncGiftHistoryHeaderProgramPtLV(v) {
  const wrap = document.getElementById('giftHistoryProgramPt');
  if (!(wrap instanceof HTMLElement)) return;
  const numEl = wrap.querySelector('.nl-north-star-lane__program-pt-num');
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
    wrap.classList.remove('is-placeholder');
    if (numEl instanceof HTMLElement) numEl.textContent = Math.floor(v).toLocaleString('ja-JP');
  } else {
    wrap.classList.add('is-placeholder');
    if (numEl instanceof HTMLElement) numEl.textContent = '—';
  }
}

/** ギフト履歴の個別投げ一覧パネルを塗る(popup の paintNorthStarGiftThrowsPanel 相当)。 @param {string} html */
function paintGiftThrowsPanelLV(html) {
  const panel = document.getElementById('northStarLaneThrows-giftHistory');
  if (!(panel instanceof HTMLElement)) return;
  const trimmed = String(html || '').trim();
  if (!trimmed) {
    panel.innerHTML = '';
    panel.hidden = true;
    panel.setAttribute('aria-hidden', 'true');
    return;
  }
  panel.innerHTML = trimmed;
  panel.hidden = false;
  panel.removeAttribute('aria-hidden');
  // 壊れ画像は消す(popup の bindOnErrorHandlersWithin 相当の最小版)。
  for (const img of panel.querySelectorAll('img')) {
    img.addEventListener('error', () => { try { /** @type {HTMLElement} */ (img).style.visibility = 'hidden'; } catch { /* no-op */ } });
  }
}

// v0.1.879: 公式値レーンを storage から描画(popup の refreshNorthStar*Lane 相当)。
//   貢献度=3経路優先解決→officialDomRankingRowsToStripRooms→paint。広告=nicoad API rows。
//   北極星セクション全体は、何か1レーンでも出れば show・全部空なら hide。
/** @param {string} lv @param {any} data */
function renderNorthStarLanes(lv, data) {
  const section = $('northStarLanes');
  let anyShown = false;

  // ① 貢献度ランキング(Koken API → DOM bundle → iframe storage の優先解決・popup と同一)。
  {
    const body = document.getElementById('northStarLaneBody-contributionRanking');
    const ranking = resolveContributionRankingRowsFromSources({
      kokenStorage: data?.kokenContrib || null,
      domBundle: null, // live-view は DOM bundle を持たない(storage 経由のみ)。
      iframeStorage: data?.iframeOfficialDom || null,
      liveId: lv
    });
    if (body && Array.isArray(ranking) && ranking.length > 0) {
      // popup と同じ: 10 位まで・officialDomRankingRowsToStripRooms で room 化(userKeyKind=contrib)。
      const top10 = ranking.slice(0, 10);
      const rooms = officialDomRankingRowsToStripRooms(top10, { userKeyKind: 'contrib' });
      paintNorthStarStripInto(body, rooms, {
        noteText: '公式の貢献度ランキング（niconico の表示に準拠）',
        unitSuffix: '貢',
        ariaLabel: '貢献度ランキング'
      });
      showNorthStarLane('contributionRanking');
      anyShown = true;
    } else {
      hideNorthStarLane('contributionRanking');
    }
  }

  // ② 広告ランキング(nicoad API rows・popup と同一の検証)。
  {
    const body = document.getElementById('northStarLaneBody-adRanking');
    const apiVal = data?.nicoadApiRanking;
    const adRows =
      apiVal &&
      typeof apiVal === 'object' &&
      String(apiVal.liveId || '').trim().toLowerCase() === lv &&
      Array.isArray(apiVal.rows) &&
      apiVal.rows.length > 0
        ? apiVal.rows
        : null;
    if (body && adRows) {
      const rooms = officialDomRankingRowsToStripRooms(adRows, { userKeyKind: 'ad' });
      paintNorthStarStripInto(body, rooms, {
        noteText:
          'ニコニ広告の貢献度ランキング（公式ページ相当）。画面上部の累計ptなどと、各行の「貢」は指標や期間が異なり一致しないことがあります',
        unitSuffix: '貢',
        ariaLabel: '広告ランキング'
      });
      showNorthStarLane('adRanking');
      anyShown = true;
    } else {
      hideNorthStarLane('adRanking');
    }
  }

  // ③ ギフト履歴(送り主別累計pt + 個別投げ一覧)。storage(subapp history / 保存 throws)由来=popup と同型。
  {
    const body = document.getElementById('northStarLaneBody-giftHistory');
    // 公式番組累計pt(ヘッダ右 + summary gadget で使う)= snapshot/summary 由来。
    const snap = data?.snapshot || {};
    const s = data?.summary || {};
    const officialGiftPts = num(snap.officialGiftPointsNdgr) ?? num(s.giftPoints);
    syncGiftHistoryHeaderProgramPtLV(officialGiftPts);
    const ctxRaw = computeGiftHistoryForLiveView(data);
    if (body && ctxRaw && ctxRaw.rooms.length > 0) {
      // popup と同じ: 公式番組累計との整合を取り直す(reconcile)。
      const rec = reconcileGiftHistoryNorthStarContext({
        rooms: ctxRaw.rooms,
        pointsSumAll: ctxRaw.pointsSumAll,
        pointsSumDisplayed: ctxRaw.pointsSumDisplayed,
        officialProgramGiftPts: officialGiftPts,
        maxRooms: GIFT_HISTORY_LANE_MAX
      });
      const rooms = rec.rooms;
      paintNorthStarStripInto(body, rooms, {
        noteText: ctxRaw.noteText,
        unitSuffix: ctxRaw.unitSuffix,
        ariaLabel: ctxRaw.ariaLabel
      });
      // 個別投げ一覧(throws-panel)+ summary gadget(表示の合計pt)。
      paintGiftThrowsPanelLV(ctxRaw.throwsTableHtml);
      paintGiftHistorySummaryGadgetLV({
        pointsSumAll: rec.pointsSumAll,
        pointsSumDisplayed: rec.pointsSumDisplayed,
        officialProgramGiftPts: officialGiftPts,
        roomCount: rooms.length
      });
      showNorthStarLane('giftHistory');
      anyShown = true;
    } else {
      paintGiftThrowsPanelLV('');
      hideNorthStarLane('giftHistory');
    }
  }

  // live-view では storage から取れない他レーン(イベント系・番組累計pt は履歴ヘッダに統合済)は静かに畳む。
  for (const laneId of ['programPoints', 'eventRank', 'eventScore', 'eventBroadcasters', 'eventVotingSupporters']) {
    hideNorthStarLane(laneId);
  }

  // 何も出ない時はセクションごと隠す(死んだ見出しを残さない=star-romi 失敗体験の除去)。
  if (section instanceof HTMLElement) section.hidden = !anyShown;
}

function start() {
  const lv = liveIdFromUrl();
  if (!lv) {
    $('lvTitle').textContent = '配信が指定されていません(?lv=lv... が必要です)';
    return;
  }
  const fetchData = createLiveViewDataSource(lv);
  const tick = async () => {
    try {
      const now = Date.now();
      const base = await fetchData();
      // v0.1.876: 応援者を popup 非依存で自前集計(IDB から・15秒間引き)。配信者は集計から除外。
      const broadcasterUserId = String(base?.snapshot?.broadcasterUserId || '');
      const supporters = await computeSupportersFromDb(lv, now, broadcasterUserId);
      renderLiveView(lv, { ...base, supporters }, now);
    } catch {
      /* best-effort: 次の tick で回復 */
    }
  };
  void tick();
  setInterval(() => {
    if (!document.hidden) void tick();
  }, REFRESH_MS);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
