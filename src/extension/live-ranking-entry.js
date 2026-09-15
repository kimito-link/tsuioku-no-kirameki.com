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
import { buildRecentCardHtml } from '../lib/liveRecentHoverCard.js';

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
 * ★1 行を「1 つのリンク」にまとめる(2026-09-15 ユーザー要望「アンカーはサムネ+テキストで1つに」)。
 *   数値 uid の行は 行全体を `<a class="rank-link">`(順位・サムネ・名前・件数を内包)にして
 *   ニコ生ユーザーページへ。url が無い行(匿名・comment の匿名)は `<a>` にせず素の中身のまま
 *   (匿名にはリンク先が無い=pointer カーソルも付けない。第3段のホバー対象)。
 *   ★`tracker.classFor`(is-bumped/is-new)は従来どおり `<li>` に付ける(演出の対象を壊さない)。
 *   ★comment 列は `<li>` に data-uid/data-lv を付け、ホバーで直近発言を出す(第3段)。
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
    // ★inline onerror は使わない(このリポの既存ページに1件も無く、CSP を足したときに黙って壊れる)。
    //   読み込み失敗の面倒は bindImgFallback が見る。
    const ava = (r.avatar && !isBlankIcon(r.avatar))
      ? `<img class="ava" src="${esc(r.avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : '<span class="ava"></span>';
    const inner = `<span class="no${n > 0 && n <= 3 ? ' top' : ''}">${n || '-'}</span>`
      + `${ava}<span class="nm">${esc(r.name)}</span>`
      + `<span class="pt">${num(r.point)}${kind === 'comment' ? '件' : 'pt'}</span>`;
    // ★comment 列だけ data-uid/data-lv を付ける(数値 uid・匿名 uid とも=ホバー対象)。
    const hoverAttr = (kind === 'comment' && r.uid) ? ` data-uid="${esc(r.uid)}" data-lv="${esc(liveId)}"` : '';
    // 行全体を 1 つのリンクに(url があるときだけ)。無い行は素の中身のまま。
    const rowHtml = r.url
      ? `<a class="rank-link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
      : inner;
    return `<li${cls ? ` class="${cls}"` : ''}${hoverAttr}>${rowHtml}</li>`;
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
    .then((data) => { _lastCapturedAt = Number(data && data.capturedAt) || _lastCapturedAt; render(data); prewarmRecent(data); })
    .catch((e) => showState(String(e && e.message ? e.message : e)))
    .finally(() => { setBusy(false); _nextAutoAt = Date.now() + AUTO_REFRESH_MS; });
}

/**
 * ★ホバーの初回待ち(実測 3.5 秒・主犯は NDGR の遡り)を消すための先読み。
 *   ページを開いた【最初の 1 回だけ】、いま見えている上位数配信の代表 uid で
 *   /api/live-recent-comments を投げ、サーバのメモリキャッシュ(60 秒)を温める。
 *   ★60 秒ごとの再読み込みでは温め直さない=視聴WS 握手(来場者+1)を増やさない。
 *   ★本文は保存しない(現行と同じエンドポイントを叩くだけ・privacy §14)。応答は捨てる。
 *   会議の裁定=council/hover-latency-SYNTHESIS.md(先読み上位3・逐次・スケルトン併用)。
 * @param {any} data 収集ペイロード
 */
let _didPrewarm = false;
async function prewarmRecent(/** @type {any} */ data) {
  if (_didPrewarm) return;
  _didPrewarm = true;
  try {
    const lives = data && Array.isArray(data.lives) ? data.lives : [];
    // 画面と同じ並び(賑わい順・pin 先頭)の上位 3 配信だけ温める。
    const nowMs = Date.now();
    const { lives: ordered } = pinLiveFirst(sortByEstimatedConcurrent(lives, nowMs), PINNED_LV);
    const targets = ordered.slice(0, 3);
    for (const l of targets) {
      const lv = String((l && l.liveId) || '').trim();
      const uid = l && l.comment && Array.isArray(l.comment.rankers) && l.comment.rankers[0]
        ? String(l.comment.rankers[0].uid || '').trim()
        : '';
      if (!lv || !uid) continue;
      try {
        // 逐次(並列にしない=Vercel Hobby の同時実行を圧迫しない)。応答は捨てる=キャッシュが温まるのが目的。
        await fetch('/api/live-recent-comments', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lv, uid }),
          cache: 'no-store'
        });
      } catch { /* 温めの失敗は無視(ホバー時に通常取得へフォールバック) */ }
    }
  } catch { /* 先読み全体の失敗は無視 */ }
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

/*
 * ★ホバーで「その時点の発言」(2026-09-15 ユーザー要望「live はホバーしたときだけその時の発言を出す」)
 *   - comment 列の行(li[data-uid])にマウスを乗せると、250ms 後に POST /api/live-recent-comments へ問い合わせ、
 *     その人の直近発言(最大 5 件)を小さなカードで出す。本文はサーバに保存しない(privacy §14)。
 *   - ★委譲は render() の外で 1 回だけ張る(render は 60 秒ごとに innerHTML を全置換するので、
 *     行ごとにリスナーを張ると消える)。elList に mouseover/mouseout を委譲する。
 *   - カードは body 直下に 1 個だけ(position:fixed・使い回し)。
 *   - 連打・戻りホバーはページ内キャッシュ(60 秒)で POST を抑える(サーバ側も 60 秒キャッシュ)。
 */
const HOVER_DELAY_MS = 250;
const HOVER_CACHE_TTL_MS = 60000;
/** @type {Map<string, { at: number, byUid: Record<string, string[]>, partial: boolean }>} lv 単位の短命キャッシュ。 */
const _recentCache = new Map();
/** @type {HTMLElement|null} 使い回すカード要素。 */
let _card = null;
/** @type {ReturnType<typeof setTimeout>|null} */
let _hoverTimer = null;
/** @type {AbortController|null} */
let _hoverAbort = null;
/** @type {HTMLElement|null} いま表示対象にしている行(mouseout の判定用)。 */
let _hoverLi = null;

function ensureCard() {
  if (_card) return _card;
  const el = document.createElement('div');
  el.className = 'recent-card';
  el.hidden = true;
  document.body.appendChild(el);
  _card = el;
  return el;
}

/**
 * カードを行(li)の下に置いて表示する。画面右端/下端では左/上へ折り返す。
 * @param {HTMLElement} li
 * @param {string} html
 */
function showCardFor(li, html) {
  const el = ensureCard();
  el.innerHTML = html;
  el.hidden = false;
  const r = li.getBoundingClientRect();
  // まず左下に仮置きしてから寸法を測り、はみ出す側を折り返す。
  el.style.left = '0px';
  el.style.top = '0px';
  const cw = el.offsetWidth;
  const ch = el.offsetHeight;
  let left = r.left;
  let top = r.bottom + 6;
  if (left + cw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - cw);
  if (top + ch > window.innerHeight - 8) top = Math.max(8, r.top - 6 - ch);
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function hideCard() {
  if (_card) _card.hidden = true;
  _hoverLi = null;
  if (_hoverTimer) { clearTimeout(_hoverTimer); _hoverTimer = null; }
  if (_hoverAbort) { try { _hoverAbort.abort(); } catch { /* 中断済みは無視 */ } _hoverAbort = null; }
}

/**
 * その人の直近発言を取得してカードに出す。
 * @param {HTMLElement} li @param {string} lv @param {string} uid
 */
async function requestRecent(li, lv, uid) {
  const cached = _recentCache.get(lv);
  if (cached && Date.now() - cached.at < HOVER_CACHE_TTL_MS) {
    renderRecentCard(li, cached, uid);
    return;
  }
  showCardFor(li, buildRecentCardHtml({ phase: 'loading' }));
  const ac = new AbortController();
  _hoverAbort = ac;
  let resp;
  try {
    resp = await fetch('/api/live-recent-comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lv, uid }),
      cache: 'no-store',
      signal: ac.signal
    });
  } catch {
    if (_hoverLi === li) showCardFor(li, buildRecentCardHtml({ phase: 'error' }));
    return;
  }
  if (_hoverLi !== li) return; // ホバーが別の行へ移った/離れた。
  if (resp.status === 501) { showCardFor(li, buildRecentCardHtml({ phase: 'unsupported' })); return; }
  if (resp.status === 410) { showCardFor(li, buildRecentCardHtml({ phase: 'empty' })); return; }
  if (resp.status === 202) { showCardFor(li, buildRecentCardHtml({ phase: 'loading' })); return; }
  if (!resp.ok) { showCardFor(li, buildRecentCardHtml({ phase: 'error' })); return; }
  let data = null;
  try { data = await resp.json(); } catch { data = null; }
  if (!data || !data.ok || !data.byUid || typeof data.byUid !== 'object') {
    if (_hoverLi === li) showCardFor(li, buildRecentCardHtml({ phase: 'error' }));
    return;
  }
  const rec = { at: Date.now(), byUid: data.byUid, partial: !!data.partial };
  _recentCache.set(lv, rec);
  if (_hoverLi === li) renderRecentCard(li, rec, uid);
}

/**
 * キャッシュ/応答から、その uid のカードを描く。
 * @param {HTMLElement} li
 * @param {{ at: number, byUid: Record<string, string[]>, partial: boolean }} rec
 * @param {string} uid
 */
function renderRecentCard(li, rec, uid) {
  const texts = rec.byUid && Array.isArray(rec.byUid[uid]) ? rec.byUid[uid] : [];
  const html = texts.length
    ? buildRecentCardHtml({ phase: 'ok', texts, partial: rec.partial })
    : buildRecentCardHtml({ phase: 'empty' });
  showCardFor(li, html);
}

elList.addEventListener('mouseover', (ev) => {
  const t = /** @type {HTMLElement} */ (ev.target);
  const li = /** @type {HTMLElement|null} */ (t && t.closest ? t.closest('li[data-uid]') : null);
  if (!li) return;
  if (li === _hoverLi) return;
  hideCard();
  _hoverLi = li;
  const lv = String(li.getAttribute('data-lv') || '').trim();
  const uid = String(li.getAttribute('data-uid') || '').trim();
  if (!lv || !uid) { _hoverLi = null; return; }
  _hoverTimer = setTimeout(() => { if (_hoverLi === li) requestRecent(li, lv, uid); }, HOVER_DELAY_MS);
});
elList.addEventListener('mouseout', (ev) => {
  const rel = /** @type {HTMLElement|null} */ (ev.relatedTarget);
  // 行の内側(サムネ↔名前)を移動しただけなら消さない。カードへ移ったときも消さない。
  if (rel && ((_hoverLi && _hoverLi.contains(rel)) || (_card && _card.contains(rel)))) return;
  hideCard();
});
