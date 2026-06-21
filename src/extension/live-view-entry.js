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

const PANEL_SUMMARY_PREFIX = 'nls_panel_summary_';
const WATCH_SNAPSHOT_PREFIX = 'nls_watch_snapshot_';
const KEY_REPORT_PREVIEW = 'nls_report_preview_v1';
const REFRESH_MS = 2000;

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
 * @returns {() => Promise<{summary:any, snapshot:any, reportPreview:any}>}
 */
function createLiveViewDataSource(lv) {
  return async () => {
    try {
      const bag = await chrome.storage.local.get([
        PANEL_SUMMARY_PREFIX + lv,
        WATCH_SNAPSHOT_PREFIX + lv,
        KEY_REPORT_PREVIEW
      ]);
      return {
        summary: bag?.[PANEL_SUMMARY_PREFIX + lv] || null,
        snapshot: bag?.[WATCH_SNAPSHOT_PREFIX + lv] || null,
        reportPreview: bag?.[KEY_REPORT_PREVIEW] || null
      };
    } catch {
      return { summary: null, snapshot: null, reportPreview: null };
    }
  };
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

  // 応援者ランキング(reportPreview がこの配信のものなら表示)。
  const rp = data?.reportPreview;
  const rows =
    rp && String(rp.liveId || '').trim().toLowerCase() === lv && Array.isArray(rp.topSupporters)
      ? rp.topSupporters
      : null;
  const body = $('rankBody');
  if (rows && rows.length) {
    body.className = 'rank-grid';
    body.innerHTML = '';

    // v0.1.873: popup と同じく先頭に「配信者タイル」(ラベル+アイコン+名前+フォロー)。snapshot から。
    const casterName = broadcaster;
    const casterIcon = String(snap.broadcasterIconUrl || '').trim();
    const casterPage = String(snap.broadcasterPageUrl || '').trim();
    if (casterName) {
      const ct = document.createElement('div');
      ct.className = 'rank-tile caster-tile';
      const lab = document.createElement('div');
      lab.className = 'tile-caster-label';
      lab.textContent = '配信者';
      ct.appendChild(lab);
      const cav = document.createElement('div');
      cav.className = 'tile-av';
      if (casterIcon) {
        const img = document.createElement('img');
        img.src = casterIcon;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => { try { img.remove(); cav.textContent = '🎤'; } catch { /* no-op */ } });
        cav.appendChild(img);
      } else {
        cav.textContent = '🎤';
      }
      ct.appendChild(cav);
      const cn = document.createElement('div');
      cn.className = 'tile-name';
      cn.textContent = casterName;
      ct.appendChild(cn);
      if (casterPage) {
        const f = document.createElement('a');
        f.className = 'tile-follow';
        f.href = casterPage;
        f.target = '_blank';
        f.rel = 'noopener';
        f.textContent = 'プロフィール';
        ct.appendChild(f);
      }
      body.appendChild(ct);
    }

    const medals = ['🥇', '🥈', '🥉'];
    for (const r of rows.slice(0, 30)) {
      // v0.1.872: popup の応援者タイル(アイコン+名前+件数+userId)を live-view に再現。
      const tile = document.createElement('div');
      tile.className = 'rank-tile';

      const badge = document.createElement('span');
      badge.className = 'tile-rank';
      badge.textContent = medals[r.rank - 1] || `${r.rank}`;
      tile.appendChild(badge);

      const av = document.createElement('div');
      av.className = 'tile-av';
      if (r.avatarUrl) {
        const img = document.createElement('img');
        img.src = r.avatarUrl;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => { try { img.remove(); av.textContent = r.isAnonymous ? '👤' : '🙂'; } catch { /* no-op */ } });
        av.appendChild(img);
      } else {
        av.textContent = r.isAnonymous ? '👤' : '🙂';
      }
      tile.appendChild(av);

      const name = document.createElement('div');
      name.className = 'tile-name';
      name.textContent = String(r.name || '');
      tile.appendChild(name);

      const cnt = document.createElement('div');
      cnt.className = 'tile-count';
      cnt.textContent = `${Number(r.count || 0).toLocaleString('ja-JP')}件`;
      tile.appendChild(cnt);

      const uid = document.createElement('div');
      uid.className = 'tile-uid';
      uid.textContent = r.isAnonymous ? '匿名' : String(r.userId || '');
      tile.appendChild(uid);

      body.appendChild(tile);
    }
  } else {
    body.className = 'empty';
    body.textContent = 'この配信を拡張ポップアップで開くと、応援者ランキングがここにリアルタイムで出ます。';
  }

  const d = new Date(nowMs);
  $('updatedAt').textContent = `最終更新 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
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
      const data = await fetchData();
      renderLiveView(lv, data, Date.now());
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
