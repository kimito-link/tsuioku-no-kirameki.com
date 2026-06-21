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
import { topSupportRankLineModels } from '../lib/topSupportRankStripLines.js';
import {
  isCommentDbAvailable,
  openCommentDb,
  countCommentsForLive,
  readAllCommentsForLive
} from '../lib/commentDb.js';

const PANEL_SUMMARY_PREFIX = 'nls_panel_summary_';
const WATCH_SNAPSHOT_PREFIX = 'nls_watch_snapshot_';
const KEY_REPORT_PREVIEW = 'nls_report_preview_v1';
const GIFT_USERS_PREFIX = 'nls_gift_users_';
const REFRESH_MS = 2000;
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
        GIFT_USERS_PREFIX + lv
      ]);
      return {
        summary: bag?.[PANEL_SUMMARY_PREFIX + lv] || null,
        snapshot: bag?.[WATCH_SNAPSHOT_PREFIX + lv] || null,
        reportPreview: bag?.[KEY_REPORT_PREVIEW] || null,
        giftUsers: bag?.[GIFT_USERS_PREFIX + lv] || null
      };
    } catch {
      return { summary: null, snapshot: null, reportPreview: null, giftUsers: null };
    }
  };
}

// v0.1.876: 応援者ランキングを popup 非依存で自前集計。reportPreview は popup を開いた時しか来ないため、
//   live-view 自身が IDB(commentDb)から全コメントを読み aggregateMarketingReport→buildSupporterRanking で
//   topSupporters を作る(popup と同じ純関数=同じ結果)。重いので 15 秒間引きキャッシュ。これで popup を
//   開いていなくても応援者が出る=「完全再現」。将来サーバー版はこの IDB 読みを fetch に差し替えるだけ。
let _supCacheAt = 0;
let _supCache = /** @type {any[]} */ ([]);
/** @param {string} lv @param {number} nowMs @param {string} broadcasterUserId */
async function computeSupportersFromDb(lv, nowMs, broadcasterUserId) {
  if (nowMs - _supCacheAt < 15000) return _supCache; // 15秒間引き(全件集計は重い)。
  _supCacheAt = nowMs;
  if (!isCommentDbAvailable()) return _supCache;
  let db = null;
  try {
    db = await openCommentDb();
    const cnt = await countCommentsForLive(db, lv);
    if (!Number.isFinite(cnt) || cnt <= 0) { _supCache = []; return _supCache; }
    const comments = await readAllCommentsForLive(db, lv);
    const mkt = aggregateMarketingReport(Array.isArray(comments) ? comments : [], lv, {
      broadcasterUserId: String(broadcasterUserId || '')
    });
    _supCache = buildSupporterRanking(mkt?.topUsers, { limit: 80 });
    return _supCache;
  } catch {
    return _supCache;
  } finally {
    try { if (db) db.close(); } catch { /* no-op */ }
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

// v0.1.877: popup の renderTopSupportRankStrip と同じ1行(タイル)DOM を作る。クラスは popup と完全一致。
//   model=topSupportRankLineModels の戻り(placeNumber/count/thumbSrc/idShort/nameLine/isUnknown/userKey)。
/** @param {any} m */
function buildRankLineEl(m) {
  const isLinkable = !m.isUnknown && !/^a:/i.test(String(m.userKey || '')) && /^\d{5,14}$/.test(String(m.userKey || ''));
  const el = document.createElement(isLinkable ? 'a' : 'div');
  el.className = 'nl-top-support-rank__line' + (isLinkable ? ' nl-top-support-rank__line--linkable' : '') + (m.isUnknown ? ' nl-top-support-rank__line--unknown' : '');
  el.setAttribute('role', 'listitem');
  if (m.fullLabelForTitle) el.setAttribute('title', String(m.fullLabelForTitle));
  if (isLinkable) {
    el.setAttribute('href', `https://www.nicovideo.jp/user/${encodeURIComponent(String(m.userKey))}`);
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');
  }
  const place = document.createElement('span');
  place.className = 'nl-top-support-rank__place' + (m.placeNumber != null ? '' : ' nl-top-support-rank__place--empty');
  place.setAttribute('aria-hidden', 'true');
  if (m.placeNumber != null) place.textContent = String(m.placeNumber);
  el.appendChild(place);
  const wrap = document.createElement('span');
  wrap.className = 'nl-top-support-rank__thumb-wrap';
  const img = document.createElement('img');
  img.className = 'nl-top-support-rank__thumb';
  img.src = String(m.thumbSrc || STORY_GRID_DEFAULT_TILE_IMG);
  img.alt = String(m.nameLine || '');
  img.decoding = 'async';
  if (/^https?:/i.test(String(m.thumbSrc || ''))) img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => { try { img.src = STORY_GRID_DEFAULT_TILE_IMG; } catch { /* no-op */ } });
  wrap.appendChild(img);
  el.appendChild(wrap);
  const cnt = document.createElement('span');
  cnt.className = 'nl-top-support-rank__count';
  cnt.textContent = `${Number(m.count || 0).toLocaleString('ja-JP')}件`;
  el.appendChild(cnt);
  const name = document.createElement('span');
  name.className = 'nl-top-support-rank__name';
  name.textContent = String(m.nameLine || '');
  el.appendChild(name);
  if (String(m.idShort || '').trim()) {
    const id = document.createElement('span');
    id.className = 'nl-top-support-rank__id';
    if (!m.isUnknown && m.idTitle) id.setAttribute('title', String(m.idTitle));
    id.textContent = String(m.idShort);
    el.appendChild(id);
  }
  return el;
}

// v0.1.877: 配信者タイル(popup の topSupportRankStripCasterTileHtml 相当・先頭固定)。snapshot から。
/** @param {any} snap */
function buildCasterTileEl(snap) {
  const name = String(snap?.broadcasterName || '').trim();
  if (!name) return null;
  const icon = String(snap?.broadcasterIconUrl || '').trim();
  const page = String(snap?.broadcasterPageUrl || '').trim();
  const el = document.createElement(page ? 'a' : 'div');
  el.className = 'nl-top-support-rank__caster';
  if (page) { el.setAttribute('href', page); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
  const lab = document.createElement('span');
  lab.className = 'nl-top-support-rank__caster-label';
  lab.textContent = '配信者';
  el.appendChild(lab);
  const img = document.createElement('img');
  img.className = 'nl-top-support-rank__caster-thumb';
  img.src = icon || STORY_GRID_DEFAULT_TILE_IMG;
  img.alt = name;
  if (/^https?:/i.test(icon)) img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => { try { img.src = STORY_GRID_DEFAULT_TILE_IMG; } catch { /* no-op */ } });
  el.appendChild(img);
  const nm = document.createElement('span');
  nm.className = 'nl-top-support-rank__caster-name';
  nm.textContent = name;
  el.appendChild(nm);
  if (page) {
    const f = document.createElement('span');
    f.className = 'nl-top-support-rank__caster-follow';
    f.textContent = 'プロフィール';
    el.appendChild(f);
  }
  return el;
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
    // v0.1.877: popup の renderTopSupportRankStrip と【同じ】純関数+同じHTML/クラスで描く(完全コピー)。
    //   topSupporters(rank/name/avatarUrl/count/userId)を TopSupportRankRoom に写し、topSupportRankLineModels で
    //   モデル化(thumb 解決/順位/匿名 fallback は popup と同一ロジック)。
    const stripRooms = rows.slice(0, 30).map((/** @type {any} */ r) => ({
      userKey: String(r.userId || ''),
      nickname: String(r.name || ''),
      count: Number(r.count || 0),
      avatarUrl: String(r.avatarUrl || '')
    }));
    const models = topSupportRankLineModels(stripRooms, {
      defaultThumbSrc: STORY_GRID_DEFAULT_TILE_IMG,
      anonymousFallbackThumbSrc: STORY_GRID_DEFAULT_TILE_IMG,
      colorScheme: 'light'
    });
    body.className = '';
    body.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'nl-top-support-rank__list';
    list.setAttribute('role', 'list');
    // 先頭=配信者タイル(popup と同じ位置・クラス)。
    const casterEl = buildCasterTileEl(snap);
    if (casterEl) list.appendChild(casterEl);
    for (const m of models) list.appendChild(buildRankLineEl(m));
    body.appendChild(list);
  } else {
    body.className = 'empty';
    body.textContent = '応援コメントを集計中です…(記録が貯まると順位が出ます)';
  }

  // v0.1.875: popup の全レーンを再現。①りんく列(数値ID+個人サムネ) ②ギフト列(ギフト投げた人)。
  renderLanes(lv, data, rows);

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
