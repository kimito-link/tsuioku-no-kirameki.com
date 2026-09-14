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
  cacheBust, supporterRows, identifiedSupporters, isBlankIcon, createRowChangeTracker, rowKey
} from '../lib/liveRankingView.js';

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

/**
 * @param {import('../lib/liveRankingView.js').SupporterRow[]} rows
 * @param {string} liveId
 * @param {'gift'|'ad'} kind
 */
function renderRows(rows, liveId, kind) {
  if (!rows.length) {
    return `<p class="empty"><img src="${esc(kind === 'gift' ? FACE.kontaHalf : FACE.tanuHalf)}" alt="" loading="lazy" decoding="async">まだいません</p>`;
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
      + `${ava}<span class="nm">${nameHtml}</span><span class="pt">${num(r.point)}pt</span></li>`;
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
  elMeta.innerHTML = `<img class="face" src="${esc(f.stale ? FACE.tanuNormal : FACE.kontaSmile)}" alt="">`
    + `放送中 <b>${lives.length}</b> 配信`
    + (f.text ? `・<span${f.stale ? ' class="stale"' : ''}>${esc(f.text)}</span>` : '');

  tracker.begin();
  elList.innerHTML = sortByEstimatedConcurrent(lives, nowMs).map((l, i) => {
    const rows = supporterRows(l);
    return '<section class="live">'
      + renderHead(l, i + 1, data.capturedAt, nowMs)
      + '<div class="stats">'
      + `<span>👥 来場 <b>${num(l.watchCount)}</b></span>`
      + `<span>💬 コメント <b>${num(l.commentCount)}</b></span>`
      + `<span>🎁 ギフト <b>${num(l.giftTotal)}pt</b></span>`
      + `<span>📣 広告 <b>${num(l.adTotal)}pt</b></span>`
      // ★本体(Chrome 拡張)への導線。配信ごとに「この配信を拡張で記録する」を置く。
      + `<a class="ext-link" href="${esc(STORE_URL)}" target="_blank" rel="noopener noreferrer" title="Chrome 拡張を入れると、この配信の応援コメント・ギフトを配信中にそのまま記録できます">🧩 この配信を拡張で記録する</a>`
      + '</div>'
      + renderKnown(identifiedSupporters(l))
      + '<div class="cols">'
      + `<div class="col"><h3><img src="${esc(FACE.kontaSmile)}" alt="" loading="lazy" decoding="async">ギフトで支えた人 <span class="sum">${num(l.giftTotal)}pt</span></h3>${renderRows(rows.gift, l.liveId, 'gift')}</div>`
      + `<div class="col"><h3><img src="${esc(FACE.tanuNormal)}" alt="" loading="lazy" decoding="async">広告で支えた人 <span class="sum">${num(l.adTotal)}pt</span></h3>${renderRows(rows.ad, l.liveId, 'ad')}</div>`
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

function load() {
  fetch('/api/live-ranking', { cache: 'no-store' })
    .then((r) => {
      if (r.status === 404) throw new Error('まだ集計されていません。しばらくお待ちください。');
      if (!r.ok) throw new Error(`読み込みに失敗しました (${r.status})`);
      return r.json();
    })
    .then(render)
    .catch((e) => showState(String(e && e.message ? e.message : e)));
}

load();
// ★見ていないときは止める(無駄に叩かない)。裏タブから戻った瞬間に取り直す。
setInterval(() => { if (!document.hidden) load(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
