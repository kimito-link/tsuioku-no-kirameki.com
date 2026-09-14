/**
 * live-ranking-entry.js — `/live/`「追憶のきらめき ランキング」(tsuioku-no-kirameki/live/index.html)の描画。
 *
 * ★2026-09-14: ページ内 inline JS を廃止してここへ。純ロジックは src/lib/liveRankingView.js、
 *   HTML/URL の検疫は src/lib/htmlText.js(★どちらも他の画面と共有。ここで同じ関数を書き直さない)。
 *   esbuild で app/dist/live-ranking.js にまとまり、ページは <script src="../../app/dist/live-ranking.js">
 *   で読む(app/ は vercel.json の rewrite 対象外＝主ドメインでもそのまま配信される)。
 *
 * ■ このファイルに残るのは DOM だけ: 取得(fetch)・組み立て(innerHTML)・画像失敗時の差し替え・再取得の間隔。
 */

import { escapeHtml as esc, safeHttpUrl, formatNumberJa as num } from '../lib/htmlText.js';
import {
  watchUrlOf, jstClock, elapsedText, freshness, estimateConcurrentForLive, sortByEstimatedConcurrent,
  cacheBust, supporterRows, identifiedSupporters, commentRows, isBlankIcon, createRowChangeTracker, rowKey,
  LIVE_ID_RE, pinLiveFirst, liveShareText
} from '../lib/liveRankingView.js';
import { buildXIntentUrl } from '../lib/xIntentUrl.js';

const elList = /** @type {HTMLElement} */ (document.getElementById('list'));
const elMeta = /** @type {HTMLElement} */ (document.getElementById('meta'));

/** キャラ画像(正本は extension/images/。ページからの相対 = LP index.html と同じ実体)。 */
const IMG_BASE = '../../extension/images/yukkuri-charactore-english/';
const FACE = {
  linkBlink: IMG_BASE + 'link/link-yukkuri-blink-mouth-closed.thumb128.png',
  linkNormal: IMG_BASE + 'link/link-yukkuri-normal-mouth-closed.thumb128.png',
  linkSmile: IMG_BASE + 'link/link-yukkuri-smile-mouth-open.thumb128.png',
  kontaSmile: IMG_BASE + 'konta/kitsune-yukkuri-smile-mouth-open.thumb128.png',
  kontaHalf: IMG_BASE + 'konta/kitsune-yukkuri-half-eyes-mouth-closed.thumb128.png',
  tanuNormal: IMG_BASE + 'tanunee/tanuki-yukkuri-normal-mouth-open.thumb128.png',
  tanuHalf: IMG_BASE + 'tanunee/tanuki-yukkuri-half-eyes-mouth-closed.thumb128.png'
};

const tracker = createRowChangeTracker();

/** 本体(Chrome 拡張)のストア URL。★LP index.html と同じ ID(AGENTS.md §2 の拡張 ID)。 */
const STORE_URL = 'https://chromewebstore.google.com/detail/cjbabignmmodaickpeckiojjabnlogdb';

/**
 * ★シェアされる URL は本番 canonical に固定する(プレビューや app. から押しても本番 URL が投稿される)。
 *   本文・URL の組み立ては純関数(liveShareText / buildXIntentUrl)。ここには DOM と location だけ残す。
 */
const SHARE_PAGE_URL = 'https://tsuioku-no-kirameki.com/live/';
const SHARE_HASHTAGS = ['ニコ生'];

/** 起動時に 1 回だけ ?lv= を読む。形が違えば ''(エラーを出さずに通常表示へ倒す)。 */
function liveIdFromQuery() {
  try {
    const lv = String(new URLSearchParams(location.search).get('lv') || '').trim().toLowerCase();
    return LIVE_ID_RE.test(lv) ? lv : '';
  } catch {
    return '';
  }
}
const PINNED_LV = liveIdFromQuery();

/**
 * 1 配信ぶんの「X でシェア」リンクの href。空なら呼び出し側はリンクを描かない。
 * @param {any} l
 * @returns {string}
 */
function shareHref(l) {
  const id = String((l && l.liveId) || '').trim().toLowerCase();
  const url = LIVE_ID_RE.test(id) ? `${SHARE_PAGE_URL}?lv=${id}` : SHARE_PAGE_URL;
  return buildXIntentUrl({ text: liveShareText(l), url, hashtags: SHARE_HASHTAGS });
}

/**
 * ★「サムネ付きで応援した人」の枠(2026-09-14 ユーザー要望・全配信に出す)。
 *   数値ユーザーID と個人サムネの両方が揃った人だけ(判定は liveRankingView.identifiedSupporters)。
 *   サイドパネルの「アイコン列」と同じ考え方で、サムネ・名前・ID・リンクをセットで出す(AGENTS.md §3.5)。
 * @param {import('../lib/liveRankingView.js').IdentifiedSupporter[]} people
 */
function renderKnown(people) {
  const head = `<h3><img src="${esc(FACE.linkSmile)}" alt="" loading="lazy" decoding="async">サムネ付きで応援した人 `
    + `<span class="cnt">${people.length}人</span><span class="hint">数値ID＋個人サムネが揃った人</span></h3>`;
  if (!people.length) {
    return `<div class="known">${head}<p class="empty"><img src="${esc(FACE.linkBlink)}" alt="" loading="lazy" decoding="async">まだいません（ID と個人サムネが両方揃った人だけ載ります）</p></div>`;
  }
  const tiles = people.map((p) => {
    const pts = (p.giftPt ? `🎁${num(p.giftPt)}` : '') + (p.giftPt && p.adPt ? ' ' : '') + (p.adPt ? `📣${num(p.adPt)}` : '');
    return `<li><a class="tile" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" title="${esc(p.name)}（ID ${esc(p.uid)}）">`
      + `<img class="tava" src="${esc(p.avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      + `<span class="tname">${esc(p.name)}</span><span class="tid">${esc(p.uid)}</span><span class="tpt">${esc(pts)}</span></a></li>`;
  }).join('');
  return `<div class="known">${head}<ul class="tiles">${tiles}</ul></div>`;
}

/** 空のときに出す顔。★3 枠目(コメント)はりんく。 */
const EMPTY_FACE = { gift: FACE.kontaHalf, ad: FACE.tanuHalf, comment: FACE.linkBlink };

/**
 * @param {import('../lib/liveRankingView.js').SupporterRow[]} rows
 * @param {string} liveId
 * @param {'gift'|'ad'|'comment'} kind
 */
function renderRows(rows, liveId, kind) {
  if (!rows.length) {
    return `<p class="empty"><img src="${esc(EMPTY_FACE[kind] || FACE.tanuHalf)}" alt="" loading="lazy" decoding="async">まだいません</p>`;
  }
  const html = rows.map((r) => {
    const n = Number(r.rank) || 0;
    const cls = tracker.classFor(rowKey(liveId, kind, r), Number(r.point) || 0);
    const nameHtml = r.url
      ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a>`
      : esc(r.name);
    // ★inline onerror は使わない(このリポの既存ページに1件も無く、CSP を足したときに黙って壊れる)。
    //   読み込み失敗の面倒は bindImgFallback が見る。
    const ava = (r.avatar && !isBlankIcon(r.avatar))
      ? `<img class="ava" src="${esc(r.avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : '<span class="ava"></span>';
    return `<li${cls ? ` class="${cls}"` : ''}><span class="no${n > 0 && n <= 3 ? ' top' : ''}">${n || '-'}</span>`
      + `${ava}<span class="nm">${nameHtml}</span><span class="pt">${num(r.point)}${kind === 'comment' ? '件' : 'pt'}</span></li>`;
  }).join('');
  return `<ol class="rank">${html}</ol>`;
}

/**
 * 読み込みに失敗した画像を代替へ落とす(壊れた画像アイコンを出さない)。
 * 応援者アイコン → 素の丸 / 配信者アイコン → りんくの顔 / 配信サムネ → キャラの幕。
 * @param {HTMLElement} root
 */
function bindImgFallback(root) {
  const imgs = root.querySelectorAll('img.ava, img.sicon, img.tava, .shot img.shotimg');
  for (const img of imgs) {
    img.addEventListener('error', function () {
      const el = /** @type {HTMLImageElement} */ (this);
      if (!el.parentNode) return;
      if (el.classList.contains('tava')) {
        // ★「サムネ付き」の枠なのにサムネが読めない(CDN 404)→ その人はこの枠から外す(嘘の枠にしない)。
        const li = el.closest('li');
        if (li && li.parentNode) li.parentNode.removeChild(li);
      } else if (el.classList.contains('ava')) {
        const span = document.createElement('span'); span.className = 'ava';
        el.parentNode.replaceChild(span, el);
      } else if (el.classList.contains('sicon')) {
        el.src = FACE.linkNormal;
      } else {
        const box = document.createElement('span'); box.className = 'noimg';
        box.innerHTML = `<img src="${esc(FACE.linkBlink)}" alt="">`;
        el.parentNode.replaceChild(box, el);
      }
    }, { once: true });
  }
}

/**
 * 3 枠目「💬 コメントで応援した人」。
 *
 * ★ギフト・広告は「ニコ生が公開している値そのまま」だが、ここは【当サイトが数えた件数】。
 *   集計は約 10 分ごとの別ジョブなので、まだ来ていない配信がある(そのときは黙らず「待ち」と出す)。
 * ★上限に当たった配信は「直近ぶんの集計」と正直に添える(全部を数えたふりをしない)。
 * @param {any} l
 */
function renderCommentCol(l) {
  const c = (l && l.comment && typeof l.comment === 'object') ? l.comment : null;
  const sum = c ? `<span class="sum">${num(c.commenters)}人</span>` : '';
  const head = `<h3><img src="${esc(FACE.linkSmile)}" alt="" loading="lazy" decoding="async">💬 コメントで応援した人 ${sum}</h3>`;
  if (!c) {
    return `<div class="col">${head}<p class="empty"><img src="${esc(FACE.linkBlink)}" alt="" loading="lazy" decoding="async">コメント集計待ち（約 10 分ごとに更新）</p></div>`;
  }
  const note = c.partial ? '<p class="col-note">直近ぶんの集計です（古い側は順次さかのぼり中）</p>' : '';
  return `<div class="col">${head}${renderRows(commentRows(l), l.liveId, 'comment')}${note}</div>`;
}

/**
 * 配信カードの頭(順位・サムネ・配信者・時間・URL・推定同時視聴)。
 * @param {any} l 収集ペイロードの 1 配信(形は liveRankingView.js の冒頭コメント)
 * @param {number} rankNo
 * @param {unknown} capturedAt
 * @param {number} nowMs
 */
function renderHead(l, rankNo, capturedAt, nowMs) {
  const wurl = watchUrlOf(l.liveId);
  const th = (l.thumbnail && typeof l.thumbnail === 'object') ? l.thumbnail : {};
  // ★サムネはニコ生が定期的に差し替える画像。収集時刻を付けてキャッシュを割る。
  const shotSrc = cacheBust(th.small || th.middle || th.large || th.micro, capturedAt);
  const shotImg = shotSrc
    ? `<img class="shotimg" src="${esc(shotSrc)}" width="352" height="198" alt="配信画面のサムネイル" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : `<span class="noimg"><img src="${esc(FACE.linkBlink)}" alt=""></span>`;
  const rankCls = rankNo <= 3 ? ` r${rankNo}` : '';
  const shot = `<a class="shot" href="${esc(wurl)}" target="_blank" rel="noopener noreferrer" aria-label="配信ページを開く（新しいタブ）">`
    + `${shotImg}<span class="rankno${rankCls}">${rankNo}</span><span class="onair">LIVE</span></a>`;

  const s = (l.streamer && typeof l.streamer === 'object') ? l.streamer : {};
  const sIcon = safeHttpUrl(s.icon50 || s.icon150);
  const sPage = safeHttpUrl(s.pageUrl);
  const sName = String(s.name || '').trim() || '配信者';
  const iconHtml = (sIcon && !isBlankIcon(sIcon))
    ? `<img class="sicon" src="${esc(sIcon)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : `<img class="sicon" src="${esc(FACE.linkNormal)}" alt="">`;
  const nameHtml = sPage
    ? `<a class="sname" href="${esc(sPage)}" target="_blank" rel="noopener noreferrer">${esc(sName)}</a>`
    : `<span class="sname">${esc(sName)}</span>`;

  const begin = jstClock(l.beginTime);
  const end = jstClock(l.endTime);
  const elapsed = elapsedText(l.beginTime, nowMs);
  const times = '<div class="times">'
    + (begin ? `<span>▶ ${esc(begin)} 開始</span>` : '')
    + (elapsed ? `<span>経過 <b>${esc(elapsed)}</b></span>` : '')
    + (end ? `<span>〜${esc(end)} 予定</span>` : '')
    + '</div>';
  const urlHtml = wurl ? `<a class="url" href="${esc(wurl)}" target="_blank" rel="noopener noreferrer">${esc(wurl.replace(/^https?:\/\//, ''))}</a>` : '';

  const now = estimateConcurrentForLive(l, nowMs);
  const nowHtml = `<div class="now"><b>${now ? `約${num(now)}人` : '—'}</b><span>推定同時視聴</span></div>`;

  return `<div class="live__head">${shot}<div class="live__info"><div class="streamer">${iconHtml}${nameHtml}</div>`
    + `<h2><a href="${esc(wurl)}" target="_blank" rel="noopener noreferrer">${esc(l.title || l.liveId)}</a></h2>`
    + `${times}${urlHtml}</div>${nowHtml}</div>`;
}

/** @param {any} data /api/live-ranking の応答 */
function render(data) {
  const lives = (data && Array.isArray(data.lives)) ? data.lives : [];
  if (!lives.length) {
    elMeta.innerHTML = `<img class="face" src="${esc(FACE.tanuHalf)}" alt="">いま表示できる配信がありません。`;
    elList.innerHTML = '';
    return;
  }
  const nowMs = Date.now();
  const f = freshness(data.capturedAt, nowMs);
  // ★合成順序は「賑わい順を作ってから 1 件を先頭へ」(逆だと sort が pin を壊す)。
  const { lives: ordered, found } = pinLiveFirst(sortByEstimatedConcurrent(lives, nowMs), PINNED_LV);
  const missing = !!PINNED_LV && !found;
  // ★コメントの集計は別ジョブ(約 10 分ごと)。ギフト/広告の鮮度とは別に、いつ数えた値かを添える。
  const cf = freshness(data.commentsCapturedAt, nowMs);
  const cMin = cf.text ? cf.text.replace(/^⚠ /, '').replace(/ 更新$/, '').replace(/の情報です.*$/, '') : '';
  elMeta.innerHTML = `<img class="face" src="${esc(f.stale ? FACE.tanuNormal : (missing ? FACE.tanuHalf : FACE.kontaSmile))}" alt="">`
    + `放送中 <b>${lives.length}</b> 配信`
    + (f.text ? `・<span${f.stale ? ' class="stale"' : ''}>${esc(f.text)}</span>` : '')
    + (cMin ? `・<span${cf.stale ? ' class="stale"' : ''}>コメント集計 ${esc(cMin)}</span>` : '')
    + (missing ? '・<span class="pin-missing">その配信はもう放送が終わったみたい。いま支えている人の一覧は、そのまま見られるわ</span>' : '');

  tracker.begin();
  elList.innerHTML = ordered.map((l, i) => {
    const rows = supporterRows(l);
    const sx = shareHref(l);
    return '<section class="live">'
      + renderHead(l, i + 1, data.capturedAt, nowMs)
      + '<div class="stats">'
      + `<span>👥 来場 <b>${num(l.watchCount)}</b></span>`
      + `<span>💬 コメント <b>${num(l.commentCount)}</b></span>`
      + `<span>🎁 ギフト <b>${num(l.giftTotal)}pt</b></span>`
      + `<span>📣 広告 <b>${num(l.adTotal)}pt</b></span>`
      // ★本体(Chrome 拡張)への導線。配信ごとに「この配信を拡張で記録する」を置く。
      // ★🧩(本体への導線)と X でシェアは一塊で右端へ(.stats が折り返しても離ればなれにならない)。
      + '<span class="stats-actions">'
      + `<a class="ext-link" href="${esc(STORE_URL)}" target="_blank" rel="noopener noreferrer" title="Chrome 拡張を入れると、この配信の応援コメント・ギフトを配信中にそのまま記録できます">🧩 この配信を拡張で記録する</a>`
      + (sx ? `<a class="share-x" href="${esc(sx)}" target="_blank" rel="noopener noreferrer" title="X（旧 Twitter）の投稿画面が新しいタブで開くだけよ。押したことも含めて、当サイトは何も記録しないわ">X でシェア</a>` : '')
      + '</span>'
      + '</div>'
      + renderKnown(identifiedSupporters(l))
      + '<div class="cols">'
      + `<div class="col"><h3><img src="${esc(FACE.kontaSmile)}" alt="" loading="lazy" decoding="async">ギフトで支えた人 <span class="sum">${num(l.giftTotal)}pt</span></h3>${renderRows(rows.gift, l.liveId, 'gift')}</div>`
      + `<div class="col"><h3><img src="${esc(FACE.tanuNormal)}" alt="" loading="lazy" decoding="async">広告で支えた人 <span class="sum">${num(l.adTotal)}pt</span></h3>${renderRows(rows.ad, l.liveId, 'ad')}</div>`
      + renderCommentCol(l)
      + '</div></section>';
  }).join('');
  tracker.end();
  bindImgFallback(elList);
}

/** @param {string} msg */
function showState(msg) {
  elMeta.innerHTML = `<img class="face" src="${esc(FACE.tanuHalf)}" alt="">${esc(msg)}`;
  if (!elList.children.length) {
    elList.innerHTML = `<div class="state"><img src="${esc(FACE.linkBlink)}" alt="">${esc(msg)}</div>`;
  }
}

/*
 * ★リアルタイム取得(2026-09-14 ユーザー要望「リアルタイム取得を売りにしたい」「リロード機能もつけて」)
 *   - 自動: 60 秒ごとに ?refresh=1 で【サーバに集め直させる】(サーバ側は前回から 60 秒未満なら保存済みを返す=ニコ生を乱打しない)
 *   - 手動: 「いま更新」ボタン。押した瞬間に ?refresh=1(同じ throttle)
 *   - 画面には「最終更新 N 秒前」と「次の自動更新まで N 秒」を出す(止まっているときに黙らない)
 */
const AUTO_REFRESH_MS = 60000;
const elRefreshBtns = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('[data-refresh]'));
const elCountdown = /** @type {HTMLElement|null} */ (document.getElementById('refreshCountdown'));
let _loading = false;
let _nextAutoAt = Date.now() + AUTO_REFRESH_MS;
let _lastCapturedAt = 0;

/** @param {boolean} busy */
function setBusy(busy) {
  _loading = busy;
  for (const b of elRefreshBtns) {
    b.disabled = busy;
    b.classList.toggle('is-busy', busy);
    b.setAttribute('aria-busy', busy ? 'true' : 'false');
  }
}

/** @param {{ refresh?: boolean }} [opts] */
function load(opts) {
  if (_loading) return;
  const refresh = !!(opts && opts.refresh);
  setBusy(true);
  fetch(refresh ? '/api/live-ranking?refresh=1' : '/api/live-ranking', { cache: 'no-store' })
    .then((r) => {
      if (r.status === 404) throw new Error('まだ集計されていません。しばらくお待ちください。');
      if (!r.ok) throw new Error(`読み込みに失敗しました (${r.status})`);
      return r.json();
    })
    .then((data) => { _lastCapturedAt = Number(data && data.capturedAt) || _lastCapturedAt; render(data); })
    .catch((e) => showState(String(e && e.message ? e.message : e)))
    .finally(() => { setBusy(false); _nextAutoAt = Date.now() + AUTO_REFRESH_MS; });
}

function tickCountdown() {
  if (!elCountdown) return;
  const left = Math.max(0, Math.ceil((_nextAutoAt - Date.now()) / 1000));
  const ago = _lastCapturedAt ? Math.max(0, Math.round((Date.now() - _lastCapturedAt) / 1000)) : null;
  elCountdown.textContent = (_loading ? '更新中…' : `次の自動更新まで ${left} 秒`) + (ago != null ? `・データは ${ago < 60 ? `${ago} 秒前` : `${Math.floor(ago / 60)} 分前`}の収集` : '');
}

for (const b of elRefreshBtns) b.addEventListener('click', () => load({ refresh: true }));
load({ refresh: true });
// ★見ていないときは止める(無駄に叩かない)。裏タブから戻った瞬間に取り直す。
setInterval(() => { if (!document.hidden && Date.now() >= _nextAutoAt) load({ refresh: true }); }, 1000);
setInterval(tickCountdown, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load({ refresh: true }); });
