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
  cacheBust, supporterRows, identifiedSupporters, identifiedSupportersByName, commentRows, isBlankIcon, createRowChangeTracker, rowKey,
  LIVE_ID_RE, pinLiveFirst, liveShareText
} from '../lib/liveRankingView.js';
import { buildXIntentUrl } from '../lib/xIntentUrl.js';
import { buildRecentCardHtml } from '../lib/liveRecentHoverCard.js';
import { readDetailQuery, withDetail, withoutDetail, findLive, detailBanner } from '../lib/liveDetailView.js';

const elList = /** @type {HTMLElement} */ (document.getElementById('list'));
const elMeta = /** @type {HTMLElement} */ (document.getElementById('meta'));
/**
 * ★2026-09-26: 配信詳細モーダル(council-fable設計)。null チェック必須
 *   (HTML と JS バンドルのキャッシュずれで、新 JS だけ届き HTML が古いままの瞬間があり得る)。
 */
const elDialog = /** @type {HTMLDialogElement|null} */ (document.getElementById('liveDetail'));

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
 *
 *   ★2026-09-25 ユーザー要望「サムネ付きは全部拾って、そのあとにハンドルネームのみも入れる」。
 *   第2段(namedPeople)はコメントだけで応援した人のうち、サムネは無いが強い表示名がある人
 *   (判定は liveRankingView.identifiedSupportersByName)。サムネフィールドを持たない型
 *   (NamedSupporter)なので、ここでも avatar を参照しない(=推測URLを本物のサムネとして
 *   出さない・AGENTS.md §3.6)。
 * @param {import('../lib/liveRankingView.js').IdentifiedSupporter[]} people
 * @param {import('../lib/liveRankingView.js').NamedSupporter[]} namedPeople
 */
function renderKnown(people, namedPeople) {
  const head = `<h3><img src="${esc(FACE.linkSmile)}" alt="" loading="lazy" decoding="async">サムネ付きで応援した人 `
    + `<span class="cnt">${people.length}人</span><span class="hint">数値ID＋個人サムネが揃った人</span></h3>`;
  const thumbBlock = people.length
    ? `<ul class="tiles">${people.map((p) => {
        const pts = (p.giftPt ? `🎁${num(p.giftPt)}` : '') + (p.giftPt && p.adPt ? ' ' : '') + (p.adPt ? `📣${num(p.adPt)}` : '');
        return `<li><a class="tile" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" title="${esc(p.name)}（ID ${esc(p.uid)}）">`
          + `<img class="tava" src="${esc(p.avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
          + `<span class="tname">${esc(p.name)}</span><span class="tid">${esc(p.uid)}</span><span class="tpt">${esc(pts)}</span></a></li>`;
      }).join('')}</ul>`
    : `<p class="empty"><img src="${esc(FACE.linkBlink)}" alt="" loading="lazy" decoding="async">まだいません（ID と個人サムネが両方揃った人だけ載ります）</p>`;

  const namedHead = namedPeople.length
    ? `<h3 class="named"><img src="${esc(FACE.linkNormal)}" alt="" loading="lazy" decoding="async">ハンドルネームで応援した人 `
      + `<span class="cnt">${namedPeople.length}人</span><span class="hint">サムネ未確定・名前は分かる人</span></h3>`
      + `<ul class="tiles tiles-named">${namedPeople.map((p) => {
          // ★2026-09-25: gift/ad/comment の合算内訳を「サムネ付き」と同じ書式(🎁 📣 💬)で見せる
          //   (どの経路で応援したかが一目で分かるように。ユーザー確定の方針)。
          const pts = (p.giftPt ? `🎁${num(p.giftPt)}` : '')
            + (p.giftPt && p.adPt ? ' ' : '') + (p.adPt ? `📣${num(p.adPt)}` : '')
            + ((p.giftPt || p.adPt) && p.commentCount ? ' ' : '') + (p.commentCount ? `💬${num(p.commentCount)}` : '');
          // ★avatar は data:image/svg+xml(anonymousIdenticonDataUrl)で、読み込み失敗が原理上
          //   起きないため、bindImgFallback の対象(img.tava)には含めない専用クラス
          //   (tava-identicon)にする。「サムネ付き」枠(tava)と誤って同じ扱いにされ、
          //   万一エラーが起きた場合に行ごと消えてしまう事故を防ぐ。
          return `<li><a class="tile tile-identicon" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" title="${esc(p.name)}（ID ${esc(p.uid)}）">`
            + `<img class="tava-identicon" src="${esc(p.avatar)}" alt="" loading="lazy" decoding="async">`
            + `<span class="tname">${esc(p.name)}</span><span class="tid">${esc(p.uid)}</span><span class="tpt">${esc(pts)}</span></a></li>`;
        }).join('')}</ul>`
    : '';

  return `<div class="known">${head}${thumbBlock}${namedHead}</div>`;
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
 * @param {{ classFor: (key: string, point: number) => string }} [tr] 配信詳細モーダル用の
 *   追跡器差し替え(2026-09-26)。一覧と別の追跡器を持つ(共有すると is-bumped/is-new を奪う)。
 *   既定は一覧用の tracker。
 */
function renderRows(rows, liveId, kind, tr = tracker) {
  if (!rows.length) {
    return `<p class="empty"><img src="${esc(EMPTY_FACE[kind] || FACE.tanuHalf)}" alt="" loading="lazy" decoding="async">まだいません</p>`;
  }
  const html = rows.map((r) => {
    const n = Number(r.rank) || 0;
    const cls = tr.classFor(rowKey(liveId, kind, r), Number(r.point) || 0);
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
 * @param {{ classFor: (key: string, point: number) => string }} [tr] renderRows と同じ理由(2026-09-26)。
 */
function renderCommentCol(l, tr = tracker) {
  const c = (l && l.comment && typeof l.comment === 'object') ? l.comment : null;
  const sum = c ? `<span class="sum">${num(c.commenters)}人</span>` : '';
  const head = `<h3><img src="${esc(FACE.linkSmile)}" alt="" loading="lazy" decoding="async">💬 コメントで応援した人 ${sum}</h3>`;
  if (!c) {
    return `<div class="col">${head}<p class="empty"><img src="${esc(FACE.linkBlink)}" alt="" loading="lazy" decoding="async">コメント集計待ち（約 10 分ごとに更新）</p></div>`;
  }
  const note = c.partial ? '<p class="col-note">直近ぶんの集計です（古い側は順次さかのぼり中）</p>' : '';
  return `<div class="col">${head}${renderRows(commentRows(l), l.liveId, 'comment', tr)}${note}</div>`;
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
      // ★2026-09-26: 配信詳細モーダルを開くトリガー(council-fable設計)。elDialog が無ければ描かない
      //   (HTML/JS のキャッシュずれで #liveDetail が無い瞬間の安全策)。
      + (elDialog ? `<button type="button" class="detail-btn" data-detail="${esc(l.liveId)}" aria-haspopup="dialog">🔍 詳しく見る</button>` : '')
      + `<a class="ext-link" href="${esc(STORE_URL)}" target="_blank" rel="noopener noreferrer" title="Chrome 拡張を入れると、この配信の応援コメント・ギフトを配信中にそのまま記録できます">🧩 この配信を拡張で記録する</a>`
      + (sx ? `<a class="share-x" href="${esc(sx)}" target="_blank" rel="noopener noreferrer" title="X（旧 Twitter）の投稿画面が新しいタブで開くだけよ。押したことも含めて、当サイトは何も記録しないわ">X でシェア</a>` : '')
      + '</span>'
      + '</div>'
      + renderKnown(identifiedSupporters(l), identifiedSupportersByName(l))
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
/** ★2026-09-26: 配信詳細モーダルが「開く材料」として参照する、直近の成功応答。 */
/** @type {any} */
let _lastData = null;

/** @param {boolean} busy */
function setBusy(busy) {
  _loading = busy;
  for (const b of elRefreshBtns) {
    b.disabled = busy;
    b.classList.toggle('is-busy', busy);
    b.setAttribute('aria-busy', busy ? 'true' : 'false');
  }
}

/**
 * @param {{ refresh?: boolean }} [opts]
 * @returns {Promise<void>}
 */
function load(opts) {
  if (_loading) return Promise.resolve();
  const refresh = !!(opts && opts.refresh);
  setBusy(true);
  return fetch(refresh ? '/api/live-ranking?refresh=1' : '/api/live-ranking', { cache: 'no-store' })
    .then((r) => {
      if (r.status === 404) throw new Error('まだ集計されていません。しばらくお待ちください。');
      if (!r.ok) throw new Error(`読み込みに失敗しました (${r.status})`);
      return r.json();
    })
    .then((data) => {
      _lastCapturedAt = Number(data && data.capturedAt) || _lastCapturedAt;
      _lastData = data;
      render(data);
      prewarmRecent(data);
      consumePendingDetailFromUrl(data);
      safeDetailSync(data);
    })
    .catch((e) => {
      const msg = String(e && e.message ? e.message : e);
      showState(msg);
      safeDetailSyncError(msg);
    })
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
/*
 * ★初回だけ「まず保存済みをすぐ見せる」(2026-09-26 ユーザー要望「最初の読み込みだけ速く」)。
 *   従来は初回から refresh:1 を投げており、スロットル(PUBLIC_REFRESH_MIN_MS=60秒)が
 *   切れているタイミングの訪問者は、サーバ側の実収集(watch並列プローブ+koken/nicoad、
 *   コード内実測コメントで1.2〜5秒)が終わるまで「読み込み中…」のまま待たされていた。
 *   保存済みデータ(GET、Redis 読み出しのみ＝数十〜数百ms)を先に描画し、
 *   その直後に refresh:1 を投げて裏で新鮮化する。表示が一度も出ない待ち時間を無くす。
 *   2回目以降(60秒ごとの自動更新・タブ復帰)は従来どおり refresh:1 のみ(挙動不変)。
 */
load().finally(() => { load({ refresh: true }); });
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

/*
 * ★配信詳細モーダル(2026-09-26 council-fable設計。正本 = _docs/live-detail-modal-DESIGN.md)。
 *
 * 設計の核心(★最重要): 「data.lives から対象配信が見つからない」は異常ではなく通常状態
 * (配信は 60 秒ごとに終わる・MAX_LIVES=20 から押し出される)。よって例外を握りつぶす設計
 * ではなく、「見つからない」を第一級の状態として描く(バナー3状態・本文は最後の姿を凍結)。
 *
 * モーダルは【独立した fetch ループを持たない】。既存 load() の .then/.catch から
 * safeDetailSync/safeDetailSyncError を呼ぶだけ(#list の 60 秒全置換とは無関係な DOM 位置)。
 */
const elLdTitle = /** @type {HTMLElement|null} */ (elDialog && document.getElementById('ldTitle'));
const elLdFresh = /** @type {HTMLElement|null} */ (elDialog && document.getElementById('ldFresh'));
const elLdBanner = /** @type {HTMLElement|null} */ (elDialog && document.getElementById('ldBanner'));
const elLdHead = /** @type {HTMLElement|null} */ (elDialog && elDialog.querySelector('.ld-head'));
const elLdKnown = /** @type {HTMLElement|null} */ (elDialog && elDialog.querySelector('.ld-known'));
const elLdCols = /** @type {HTMLElement|null} */ (elDialog && elDialog.querySelector('.ld-cols'));

/** 開いている配信。'' = 閉じている。 */
let _detailLv = '';
/** @type {{ live: any, capturedAt: number }|null} 最後に見つかった姿(見つからなくなっても保持し続ける)。 */
let _detailSnapshot = null;
/** モーダル専用の追跡器。開くたびに作り直す(一覧側の is-bumped/is-new を奪わないため)。 */
let _detailTracker = createRowChangeTracker();
/** この履歴エントリは自分が pushState したものか(閉じるときに history.back() すべきか判定)。 */
let _detailPushed = false;
/** popstate 起点の close 処理中フラグ(URL 同期を二重にしない)。 */
let _closingFromHistory = false;
/** 初回 load 成功まで待つ ?detail=1 の lv。 */
let _pendingDetailFromUrl = '';

/**
 * 賑わい順(pinLiveFirst 適用後)での順位を求める。render() 内のローカル変数 `ordered` は
 * 外に出ていないため、必要な時だけここで同じ式を再計算する(≤20件・純関数呼び出しなので軽い)。
 * @param {any} data
 * @param {string} lv
 * @returns {number} 見つからなければ 0
 */
function detailRank(data, lv) {
  const lives = (data && Array.isArray(data.lives)) ? data.lives : [];
  const nowMs = Date.now();
  const { lives: ordered } = pinLiveFirst(sortByEstimatedConcurrent(lives, nowMs), PINNED_LV);
  const idx = ordered.findIndex((l) => String((l && l.liveId) || '').trim().toLowerCase() === lv);
  return idx >= 0 ? idx + 1 : 0;
}

/**
 * モーダルの中身を、直近の応答から描き直す。findLive が外れても本文は消さない(凍結)。
 * @param {any} data /api/live-ranking の応答(直近の成功分。無ければ null 可)
 * @param {string} fetchError 直近の fetch 失敗メッセージ(成功時は '')
 */
function paintDetail(data, fetchError) {
  if (!elDialog || !elLdBanner) return;
  const live = findLive(data, _detailLv);
  if (live) _detailSnapshot = { live, capturedAt: Number(data && data.capturedAt) || Date.now() };
  const b = detailBanner(
    { found: !!live, snapshotAt: (_detailSnapshot && _detailSnapshot.capturedAt) || 0, fetchError },
    Date.now()
  );
  elLdBanner.hidden = (b.kind === 'ok');
  elLdBanner.textContent = b.text;
  elLdBanner.classList.toggle('is-error', b.kind === 'error');
  if (!live) {
    // ★snapshot が無い(一度も見つかったことが無い)ときだけ本文を空にする。
    //   一度でも見つかっていれば、以降は最後の姿を保つ(凍結)。
    if (!_detailSnapshot && elLdHead && elLdKnown && elLdCols) {
      elLdHead.innerHTML = ''; elLdKnown.innerHTML = ''; elLdCols.innerHTML = '';
      if (elLdTitle) elLdTitle.textContent = '配信の詳しい様子';
      if (elLdFresh) elLdFresh.textContent = '';
    }
    return;
  }
  const l = live;
  const nowMs = Date.now();
  const rankNo = detailRank(data, _detailLv);
  if (elLdTitle) elLdTitle.textContent = `${String((l.streamer && l.streamer.name) || '配信者')} ― ${l.title || l.liveId}`;
  if (elLdFresh) elLdFresh.textContent = freshness(data.capturedAt, nowMs).text;
  hideCard(); // 差し替え前に、旧 li を指していたホバーカードを消す(孤児参照防止)。
  _detailTracker.begin();
  if (elLdHead) elLdHead.innerHTML = renderHead(l, rankNo, data.capturedAt, nowMs);
  if (elLdKnown) elLdKnown.innerHTML = renderKnown(identifiedSupporters(l), identifiedSupportersByName(l));
  if (elLdCols) {
    const rows = supporterRows(l);
    elLdCols.innerHTML =
      `<div class="col"><h3><img src="${esc(FACE.kontaSmile)}" alt="" loading="lazy" decoding="async">ギフトで支えた人 <span class="sum">${num(l.giftTotal)}pt</span></h3>${renderRows(rows.gift, l.liveId, 'gift', _detailTracker)}</div>`
      + `<div class="col"><h3><img src="${esc(FACE.tanuNormal)}" alt="" loading="lazy" decoding="async">広告で支えた人 <span class="sum">${num(l.adTotal)}pt</span></h3>${renderRows(rows.ad, l.liveId, 'ad', _detailTracker)}</div>`
      + renderCommentCol(l, _detailTracker);
  }
  _detailTracker.end();
  bindImgFallback(elDialog);
}

/** バナーを「表示に失敗した」に倒す。本文は触らない・閉じない(§D-5の設計方針)。 */
function showDetailPaintError() {
  if (!elLdBanner) return;
  elLdBanner.hidden = false;
  elLdBanner.classList.add('is-error');
  elLdBanner.textContent = '表示に失敗したわ。「いま更新」で取り直せるわ';
}

/**
 * load() 成功時に呼ぶ。★例外を load() の Promise 連鎖へ絶対に漏らさない
 * (漏れると .catch → showState に流れ、ページ全体が偽の障害表示になる)。
 * @param {any} data
 */
function safeDetailSync(data) {
  if (!elDialog || !elDialog.open) return;
  try { paintDetail(data, ''); } catch { showDetailPaintError(); }
}

/**
 * load() 失敗時に呼ぶ。直近の良い応答(_lastData)を使って本文は保ち、バナーだけ error にする。
 * @param {string} msg
 */
function safeDetailSyncError(msg) {
  if (!elDialog || !elDialog.open) return;
  try { paintDetail(_lastData, msg); } catch { showDetailPaintError(); }
}

/**
 * @param {string} lv
 * @param {{ fromHistory?: boolean }} [opts]
 */
function openDetail(lv, opts) {
  if (!elDialog) return;
  if (!LIVE_ID_RE.test(lv)) return;
  const fromHistory = !!(opts && opts.fromHistory);
  if (elDialog.open && _detailLv === lv) return; // showModal は open 中に呼ぶと InvalidStateError。
  _detailLv = lv;
  _detailSnapshot = null;
  _detailTracker = createRowChangeTracker();
  paintDetail(_lastData, '');
  if (!elDialog.open) elDialog.showModal();
  document.documentElement.classList.add('has-modal');
  if (!fromHistory) {
    try {
      history.pushState({ liveDetail: lv }, '', withDetail(location.search, lv));
      _detailPushed = true;
    } catch {
      _detailPushed = false;
    }
  } else {
    _detailPushed = !!(history.state && history.state.liveDetail);
  }
}

/**
 * モーダルが閉じた後の後始末(class 除去・ホバーカード掃除・URL 同期・フォーカス復帰)。
 * ★2026-09-26 実機検証で判明: 一部の環境(自動化 Chrome を含む)で `close` イベントが
 *   期待どおりに発火しないことがある(open は正しく false になるのに 'close' が来ない)。
 *   そのため `closeDetail()` からも直接呼び、`close` イベント経由でも呼ばれる前提で
 *   `_detailLv` の値取得を先頭に固定して冪等にする(二重に呼ばれても実害が無い)。
 * @param {string} lvAtClose 閉じた時点で開いていた lv(二重呼び出しでも同じ値を使う)
 */
function finishCloseDetail(lvAtClose) {
  document.documentElement.classList.remove('has-modal');
  hideCard();
  _detailLv = '';
  _detailSnapshot = null;
  if (!_closingFromHistory) {
    if (_detailPushed) {
      _detailPushed = false;
      try { history.back(); } catch { /* no-op */ }
    } else {
      try { history.replaceState(history.state, '', withoutDetail(location.search) || location.pathname); } catch { /* no-op */ }
    }
  }
  if (lvAtClose) {
    const btn = elList.querySelector(`[data-detail="${lvAtClose}"]`);
    if (btn instanceof HTMLElement) btn.focus();
  }
}

/** @param {{ fromHistory?: boolean }} [opts] */
function closeDetail(opts) {
  if (!elDialog || !elDialog.open) return;
  _closingFromHistory = !!(opts && opts.fromHistory);
  const lv = _detailLv;
  try { elDialog.close(); } finally { _closingFromHistory = false; }
  // ★'close' イベントに頼り切らない(上記コメント参照)。イベントが来た場合は
  //   _detailLv が既に '' なので finishCloseDetail 内の focus 対象探索が空振りするだけで安全。
  finishCloseDetail(lv);
}

if (elDialog) {
  // ★Esc/背景クリック/× は全て closeDetail() を経由させる(cancel イベントには処理を置かない。
  //   Chrome の close watcher が連続 Esc で 'cancel' を飛ばすことがあるため)。
  //   'close' イベントは「closeDetail() を経由しない外部要因での close()」の保険として残す
  //   (_detailLv は closeDetail 側で既に '' にしているため、ここでの呼び出しは基本的に no-op)。
  elDialog.addEventListener('close', () => {
    if (!_detailLv) return; // closeDetail() 経由で既に後始末済み。
    finishCloseDetail(_detailLv);
  });
  // 背景クリックで閉じる(dialog 自身に padding が無いことが前提。§C-3)。
  elDialog.addEventListener('click', (e) => { if (e.target === elDialog) closeDetail(); });
  const closeBtn = elDialog.querySelector('[data-ld-close]');
  if (closeBtn) closeBtn.addEventListener('click', () => closeDetail());
}

elList.addEventListener('click', (e) => {
  const t = /** @type {HTMLElement} */ (e.target);
  const btn = t && t.closest ? t.closest('[data-detail]') : null;
  if (!btn) return;
  e.preventDefault();
  openDetail(btn.getAttribute('data-detail') || '');
});

window.addEventListener('popstate', () => {
  // ★URL を読んで状態を合わせる(冪等。イベント発火回数に依存しない)。
  const q = readDetailQuery(location.search);
  if (q.detail) openDetail(q.lv, { fromHistory: true });
  else closeDetail({ fromHistory: true });
});

// 初回: ?detail=1 は「最初に lives が取れた render の直後」に開く(404/エラーの間は待つ)。
{
  const q = readDetailQuery(location.search);
  if (q.detail) _pendingDetailFromUrl = q.lv;
}

/**
 * load() が初めて成功した時に、保留していた ?detail=1 直リンクを処理する。
 * 見つかればモーダルを開く(履歴は積まない=直リンクを閉じたら detail だけ落とす)。
 * 見つからなければモーダルは開かず、既存の pin-missing 文言(render 側)に任せる。
 * @param {any} data
 */
function consumePendingDetailFromUrl(data) {
  if (!_pendingDetailFromUrl) return;
  const lv = _pendingDetailFromUrl;
  _pendingDetailFromUrl = '';
  if (findLive(data, lv)) {
    openDetail(lv, { fromHistory: true }); // push しない(history.state に liveDetail が無い→_detailPushed=false)。
  } else {
    try { history.replaceState(null, '', withoutDetail(location.search)); } catch { /* no-op */ }
  }
}
