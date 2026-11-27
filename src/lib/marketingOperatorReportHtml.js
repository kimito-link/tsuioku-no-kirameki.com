// @ts-nocheck
/**
 * 運営者向けマーケHTMLの見た目（暖色）。章の中身は buildOperatorReportModel の結果だけを描く。
 */

import { escapeHtml, escapeAttr } from '../shared/html/escape.js';
import { isSiteDefaultSilhouetteUrl, faceForRowKey } from './avatarFallbackFromUrl.js';
import { buildNiconicoDefaultUserIconUrl } from './reportUserThumb.js';
import { faceForCommentRow } from './commentRecord.js';

export const OPERATOR_REPORT_CSS = `
.mkt-shell--warm{background:#fff7ec;color:#4a3b34}
.mkt-shell--warm .mkt-header{background:linear-gradient(180deg,#fff4e4,#fff7ec);border-bottom:1px solid #e3c9b5;padding:1.6rem 1.5rem 1rem}
.mkt-shell--warm .mkt-header__title{color:#4a3b34;font-size:1.55rem;letter-spacing:-.02em}
.mkt-shell--warm .mkt-header__kicker{margin:0 0 .35rem;font-size:.75rem;font-weight:700;letter-spacing:.08em;color:#e85a8a}
.mkt-shell--warm .mkt-header__sub,.mkt-shell--warm .mkt-header__source{color:#7a6458;font-size:.85rem;margin:.25rem 0 0}
.mkt-shell--warm .mkt-header__source{font-size:.75rem;color:#9c8678}
.mkt-shell--warm .mkt-main{max-width:1120px}
.mkt-shell--warm .mkt-footer{color:#9c8678;background:transparent;border:0;text-align:center;padding:1rem}
.mkt-shell--warm .mkt-section{background:#fffdf9;border:1px solid #e3c9b5;box-shadow:0 10px 30px rgba(74,59,52,.06);color:#4a3b34}
.mkt-shell--warm .mkt-section h2{color:#4a3b34;border-left-color:#e85a8a}
.mkt-shell--warm .mkt-note,.mkt-shell--warm .mkt-op-why{color:#7a6458;font-size:.84rem;margin:0 0 1rem}
.mkt-op-lead{background:#fffdf9;border:1px solid #e3c9b5;border-radius:16px;box-shadow:0 10px 30px rgba(74,59,52,.06);padding:1.3rem 1.5rem 1.2rem;margin:0 0 1.2rem}
.mkt-op-lead p{font-size:1.15rem;line-height:1.7;font-weight:700;margin:0 0 1rem;letter-spacing:-.01em}
.mkt-op-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.75rem}
.mkt-op-kpi{background:#fff7ec;border:1px solid #e3c9b5;border-radius:12px;padding:.7rem .8rem}
.mkt-op-kpi b{display:block;font-size:1.45rem;line-height:1.15;letter-spacing:-.03em}
.mkt-op-kpi span{display:block;font-size:.72rem;color:#7a6458;margin-top:.2rem}
.mkt-op-kpi em{display:block;font-style:normal;font-size:.68rem;color:#9c8678}
.mkt-op-num{font-size:.72rem;font-weight:800;color:#e85a8a;letter-spacing:.08em;margin-right:.45rem}
.mkt-op-comment{background:#fff7ec;border:1px solid #e3c9b5;border-radius:12px;padding:.75rem .9rem;margin:0 0 .65rem}
.mkt-op-person{display:flex;gap:.7rem;align-items:flex-start}
.mkt-op-av{flex:0 0 36px;width:36px;height:36px;border-radius:50%;object-fit:cover;background:#e3c9b5;display:grid;place-items:center;color:#fff;font-weight:800;font-size:.8rem}
.mkt-op-name{font-weight:700}
.mkt-op-meta{font-size:.75rem;color:#9c8678}
.mkt-op-body{margin:.3rem 0 .4rem;font-size:.92rem}
.mkt-op-tags{display:flex;flex-wrap:wrap;gap:.35rem}
.mkt-op-tag{font-size:.68rem;font-weight:700;border-radius:999px;padding:1px 8px;background:#fff1f4;color:#b83b68}
.mkt-op-tag--teal{background:#e7f6f3;color:#1c6f65}
.mkt-op-tag--gold{background:#fff4df;color:#8a5a12}
.mkt-op-tag--blue{background:#e8f0f8;color:#3b6ea5}
.mkt-op-tag--mute{background:#f3eee8;color:#9c8678}
.mkt-op-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem}
.mkt-op-who{display:flex;align-items:center;gap:.6rem;background:#fff7ec;border:1px solid #e3c9b5;border-radius:12px;padding:.45rem .6rem;margin:0 0 .45rem}
.mkt-op-bars{display:flex;align-items:flex-end;gap:6px;height:120px;margin:.4rem 0 .3rem}
.mkt-op-bar-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;min-width:0}
.mkt-op-bar{width:100%;border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,#f06aa0,#e85a8a);min-height:4px}
.mkt-op-bar.is-peak{background:linear-gradient(180deg,#2bbbad,#2a9d8f)}
.mkt-op-bar-col span{font-size:.62rem;color:#9c8678;margin-top:4px;white-space:nowrap}
.mkt-op-table{width:100%;border-collapse:collapse;font-size:.88rem}
.mkt-op-table th,.mkt-op-table td{text-align:left;padding:.45rem .4rem;border-bottom:1px solid #f0e2d4;vertical-align:top}
.mkt-op-table th{font-size:.7rem;color:#9c8678;font-weight:700}
.mkt-op-table .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.mkt-op-reply{margin-top:.5rem;padding-left:.75rem;border-left:3px solid #c9e8e3}
.mkt-op-vids{display:grid;grid-template-columns:repeat(auto-fill,minmax(11rem,1fr));gap:.65rem}
.mkt-op-vid{background:#fff7ec;border:1px solid #e3c9b5;border-radius:12px;padding:.7rem .75rem}
.mkt-op-vid.is-own{outline:2px solid #e85a8a;outline-offset:-2px}
.mkt-op-vid b{display:block;font-size:.82rem;line-height:1.35;margin:0 0 .2rem}
.mkt-op-vid span{font-size:.7rem;color:#9c8678}
.mkt-op-own{display:inline-block;margin-top:.25rem;font-size:.65rem;font-weight:800;color:#e85a8a}
.mkt-op-chip{display:inline-block;border:1px solid #e3c9b5;background:#fff;color:#7a6458;border-radius:999px;padding:.3rem .7rem;font-size:.8rem;font-weight:700;margin:0 .3rem .4rem 0}
.mkt-op-chip.is-on{background:#4a3b34;color:#fff;border-color:#4a3b34}
.mkt-appendix{background:#fffdf9;border:1px solid #e3c9b5;border-radius:16px;padding:.4rem 1rem 1rem;margin:1.5rem 0 0}
.mkt-appendix>summary{cursor:pointer;font-weight:700;padding:.9rem .2rem;color:#4a3b34;list-style:revert}
.mkt-appendix[open]>summary{border-bottom:1px solid #f0e2d4;margin-bottom:1rem}
.mkt-shell--warm .mkt-kpi{background:#fff7ec;border-color:#e3c9b5}
.mkt-shell--warm .mkt-kpi__val,.mkt-shell--warm .mkt-rank td,.mkt-shell--warm .mkt-subhead{color:#4a3b34}
.mkt-shell--warm .mkt-kpi__label,.mkt-shell--warm .mkt-rank th,.mkt-shell--warm .mkt-axis{color:#9c8678;fill:#9c8678}
.mkt-shell--warm .mkt-rank th{background:#fff4e4}
.mkt-shell--warm .mkt-rank th,.mkt-shell--warm .mkt-rank td{border-bottom-color:#f0e2d4}
.mkt-shell--warm .mkt-toc__link{background:#fff7ec;border-color:#e3c9b5;color:#3b6ea5}
.mkt-shell--warm .mkt-section--toc{background:#fff7ec}
.mkt-shell--warm .mkt-participation-lead-card{background:#fff7ec;border-color:#e3c9b5}
.mkt-shell--warm .mkt-participation-lead-card__value,.mkt-shell--warm .mkt-hero-stat__val{color:#4a3b34}
.mkt-shell--warm .mkt-hero-card{background:#fffdf9;border-color:#e3c9b5;box-shadow:0 10px 30px rgba(74,59,52,.06)}
.mkt-shell--warm .mkt-bar{background:#f3e4d4}

.mkt-shell--warm .mkt-section--bcaster{background:#fffdf9;border-color:#e3c9b5}
.mkt-shell--warm .mkt-section--bcaster h2{border-left-color:#e85a8a;color:#4a3b34}
.mkt-shell--warm .mkt-bcaster__avatar{background:#fff7ec;border-color:#e3c9b5;color:#e85a8a}
.mkt-shell--warm .mkt-bcaster__name{color:#4a3b34}
.mkt-shell--warm .mkt-bcaster__name .nl-user-profile-link{color:#3b6ea5}
.mkt-shell--warm .mkt-bcaster__metas,.mkt-shell--warm .mkt-bcaster__meta{color:#7a6458}
.mkt-shell--warm .mkt-bcaster__chip{border-color:#e3c9b5;background:#fff7ec;color:#4a3b34}
.mkt-shell--warm .mkt-bcaster__chip--prem{border-color:#e8c48a;background:#fff4df;color:#8a5a12}
.mkt-shell--warm .mkt-bcaster__chip--reg{border-color:#e3c9b5;background:#f3eee8;color:#7a6458}
.mkt-shell--warm .mkt-bcaster__link{color:#3b6ea5}
.mkt-shell--warm .mkt-bcaster__link--wish{color:#b83b68}
.mkt-shell--warm .mkt-bcaster__link--sns{color:#1c6f65}
.mkt-shell--warm .mkt-bcaster__bio-link{color:#3b6ea5}
.mkt-shell--warm .mkt-bcaster__bio{border-left-color:#e3c9b5;background:#fff7ec;color:#4a3b34}
.mkt-shell--warm .mkt-acct-badge--prem{border-color:#e8c48a;background:#fff4df;color:#8a5a12}
.mkt-shell--warm .mkt-acct-badge--reg{border-color:#e3c9b5;background:#f3eee8;color:#7a6458}
.mkt-shell--warm .mkt-ext-link-chip{border-color:#e3c9b5;background:#fff7ec;color:#3b6ea5}
.mkt-shell--warm .mkt-ext-link-chip:hover{border-color:#e85a8a}
.mkt-shell--warm .nl-user-thumb-link:hover{outline-color:#e85a8a}
.mkt-shell--warm .mkt-gift-thumb{background:#fff7ec}
.mkt-shell--warm .mkt-gift-thumb--empty{border-color:#e3c9b5}
`;

/** @param {string} name */
function initialOf(name) {
  const s = String(name || '').trim();
  return (s[0] || '?').slice(0, 1);
}

/** @param {string} name */
function avColor(name) {
  const colors = ['#e85a8a', '#2a9d8f', '#c9842a', '#3b6ea5', '#7a5cbf', '#d1664a', '#4a8f6a', '#b85c8a'];
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h + s.charCodeAt(i) * (i + 1)) % colors.length;
  return colors[h];
}

/**
 * @param {any} p
 * @param {{ maskShare?: boolean, identiconResolver?: Function, platformId?: string, liveId?: string }} ctx
 */
function avPersonKey(p) {
  return String(p?.uid || p?.userId || p?.channelId || p?.login || p?.name || '').trim();
}

function avFallbackSrc(p, ctx) {
  const uid = avPersonKey(p);
  const identiconResolver = ctx?.identiconResolver;
  if (typeof identiconResolver === 'function' && uid) {
    const r = identiconResolver(uid, 36);
    if (typeof r === 'string' && /^data:/i.test(r)) return r;
  }
  const liveId = String(ctx?.liveId || '').trim();
  const comments = Array.isArray(p?.comments) ? p.comments : [];
  if (liveId && comments[0]) {
    const face = faceForCommentRow(liveId, comments[0]);
    if (face && /^data:/i.test(face)) return face;
  }
  if (uid) {
    const face = faceForRowKey(uid);
    if (face && /^data:/i.test(face)) return face;
  }
  const name = String(p?.name || '').trim();
  if (name) {
    const face = faceForRowKey(name);
    if (face && /^data:/i.test(face)) return face;
  }
  return '';
}

function avHttpSrc(p, platformId) {
  const url = String(p?.avatarUrl || p?.iconUrl || '').trim();
  if (/^https:\/\//i.test(url) && !isSiteDefaultSilhouetteUrl(url)) return url;
  if (platformId === 'niconico') {
    const nico = buildNiconicoDefaultUserIconUrl(String(p?.uid || p?.userId || '').trim());
    if (nico) return nico;
  }
  return '';
}

function avImg(src, fallback) {
  const fb = fallback && fallback !== src ? fallback : '';
  const fbAttr = fb ? ` data-mkt-av-fb="${escapeAttr(fb)}"` : '';
  const onerr = ` onerror="this.onerror=null;var f=this.getAttribute('data-mkt-av-fb');if(f){this.removeAttribute('data-mkt-av-fb');this.src=f;}else{this.remove();}"`;
  return `<img class="mkt-op-av" src="${escapeAttr(src)}" alt="" width="36" height="36" referrerpolicy="no-referrer" decoding="async"${fbAttr}${onerr}>`;
}

function avHtml(p, ctx = {}) {
  if (ctx.maskShare) {
    return `<div class="mkt-op-av" style="background:${avColor('')}">?</div>`;
  }
  const fallback = avFallbackSrc(p, ctx);
  const http = avHttpSrc(p, String(ctx.platformId || ''));
  if (http) return avImg(http, fallback);
  if (fallback) return avImg(fallback, '');
  const name = String(p?.name || '');
  return `<div class="mkt-op-av" style="background:${avColor(name)}">${escapeHtml(initialOf(name))}</div>`;
}

function tag(text, kind) {
  const cls = kind ? ` mkt-op-tag--${kind}` : '';
  return `<span class="mkt-op-tag${cls}">${escapeHtml(text)}</span>`;
}

/**
 * @param {import('./marketingOperatorReport.js').buildOperatorReportModel extends Function ? any : any} model
 * @param {{ maskShare?: boolean, identiconResolver?: Function }} [opts]
 */
export function renderOperatorReportHtml(model, opts = {}) {
  if (!model) return '';
  const maskShare = opts.maskShare === true;
  const identiconResolver = opts.identiconResolver;
  const avCtxBase = {
    maskShare,
    identiconResolver,
    platformId: String(model.platformId || ''),
    liveId: String(model.liveId || ''),
  };
  const displayName = (name) => (maskShare ? '視聴者' : String(name || ''));
  const kpis = (Array.isArray(model.kpis) ? model.kpis : [])
    .map(
      (k) =>
        `<div class="mkt-op-kpi"><b>${escapeHtml(k.value)}</b><span>${escapeHtml(k.label)}</span>${
          k.hint ? `<em>${escapeHtml(k.hint)}</em>` : ''
        }</div>`,
    )
    .join('');
  const lead = `<div class="mkt-op-lead" id="mkt-op-lead">${
    model.leadSentence ? `<p>${escapeHtml(model.leadSentence)}</p>` : ''
  }${kpis ? `<div class="mkt-op-kpis">${kpis}</div>` : ''}</div>`;

  const parts = [lead];
  const sections = Array.isArray(model.sections) ? model.sections : [];
  let n = 0;
  for (const s of sections) {
    n += 1;
    const num = String(n).padStart(2, '0');
    parts.push(
      `<section class="mkt-section mkt-op-section" id="${escapeAttr(s.id)}">` +
        `<h2><span class="mkt-op-num">${num}</span>${escapeHtml(s.title)}</h2>` +
        (s.why ? `<p class="mkt-op-why">${escapeHtml(s.why)}</p>` : '') +
        renderSectionBody(s, { ...avCtxBase, displayName, programWord: model.programWord }) +
        `</section>`,
    );
  }
  return parts.join('\n');
}

function renderSectionBody(s, ctx) {
  if (s.key === 'thanks') return renderThanks(s.data, ctx);
  if (s.key === 'who') return renderWho(s.data, ctx);
  if (s.key === 'top') return renderTop(s.data, ctx);
  if (s.key === 'threads') return renderThreads(s.data, ctx);
  if (s.key === 'gifts') return renderGifts(s.data, ctx);
  if (s.key === 'peaks') return renderPeaks(s.data);
  if (s.key === 'related') return renderRelated(s.data);
  return '';
}

function renderThanks(data, ctx) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const cards = items
    .map((it) => {
      const tags = [];
      if (it.likeCount != null) tags.push(tag(`いいね ${Number(it.likeCount).toLocaleString('ja-JP')}`));
      if (it.replyCount === 0) tags.push(tag('返信 0（画面に見えている範囲）', 'mute'));
      if (it.giftLabel) tags.push(tag(it.giftLabel, 'gold'));
      if (it.kind === 'first') tags.push(tag('この配信が初めて', 'teal'));
      if (it.returning) tags.push(tag('以前の配信でもコメント', 'teal'));
      return `<div class="mkt-op-comment"><div class="mkt-op-person">${avHtml(it, ctx)}<div>
        <div class="mkt-op-name">${escapeHtml(ctx.displayName(it.name))}${it.timeText ? ` <span class="mkt-op-meta">・ ${escapeHtml(it.timeText)}</span>` : ''}</div>
        ${it.text ? `<div class="mkt-op-body">${escapeHtml(it.text)}</div>` : ''}
        ${tags.length ? `<div class="mkt-op-tags">${tags.join('')}</div>` : ''}
      </div></div></div>`;
    })
    .join('');
  const more = Number(data?.more) > 0
    ? `<p class="mkt-note">ほか ${Number(data.more).toLocaleString('ja-JP')}件あります。画面に出ていたコメントだけを数えています。</p>`
    : '';
  const note = data?.firstTimerNote ? `<p class="mkt-note">${escapeHtml(data.firstTimerNote)}</p>` : '';
  return cards + more + note;
}

function renderWho(data, ctx) {
  const returning = Array.isArray(data?.returning) ? data.returning : [];
  const left = data?.basisOk
    ? `<div><h3 class="mkt-subhead">以前の配信でも書いてくれた人 ${Number(data.returningCount || 0).toLocaleString('ja-JP')}人</h3>${
        returning
          .map(
            (p) =>
              `<div class="mkt-op-who">${avHtml(p, ctx)}<div><div class="mkt-op-name">${escapeHtml(ctx.displayName(p.name))}</div><div class="mkt-op-meta">過去 ${Number(p.pastBroadcasts || 0).toLocaleString('ja-JP')}配信・今回 ${Number(p.commentCount || 0).toLocaleString('ja-JP')}件</div></div></div>`,
          )
          .join('')
      }${Number(data.returningCount) > returning.length ? `<p class="mkt-note">ほか ${(Number(data.returningCount) - returning.length).toLocaleString('ja-JP')}人は表の続きにあります。</p>` : ''}</div>`
    : `<div><h3 class="mkt-subhead">過去との照合</h3><p class="mkt-note">過去の配信を読み込んでいないため、また来てくれた人の数は出していません。</p></div>`;
  const rightBits = [];
  if (data.visitorCount != null) {
    rightBits.push(`来場 ${Number(data.visitorCount).toLocaleString('ja-JP')}人のうち、コメントしたのは ${Number(data.commenterCount || 0).toLocaleString('ja-JP')}人です。`);
  }
  if (data.basisOk) {
    rightBits.push(
      `コメントした ${Number(data.commenterCount || 0).toLocaleString('ja-JP')}人のうち、<b>${Number(data.returningCount || 0).toLocaleString('ja-JP')}人</b>は過去の配信記録と重なりました。<b>${Number(data.unmatchedCount || 0).toLocaleString('ja-JP')}人</b>はこのPCの過去記録には出ていません。`,
    );
    if (Number(data.incomparableCount) > 0) {
      rightBits.push(`<b>${Number(data.incomparableCount).toLocaleString('ja-JP')}人</b>は、匿名などにより過去との照合ができませんでした。`);
    }
  }
  if (data.isVideo && data.pageCommentCount != null) {
    rightBits.push(`ページのコメント見出しは ${Number(data.pageCommentCount).toLocaleString('ja-JP')}件。書き出したときに画面へ読み込まれていたのは ${Number(data.loadedCommentCount || 0).toLocaleString('ja-JP')}件です。`);
  }
  const right = `<div><h3 class="mkt-subhead">数の読み方</h3>${rightBits.map((t) => `<p class="mkt-note">${t}</p>`).join('')}</div>`;
  return `<div class="mkt-op-split">${left}${right}</div>`;
}

function renderTop(data, ctx) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const hasLikes = data?.hasLikes === true;
  const hasGifts = Boolean(data?.giftWord) && rows.some((p) => String(p.giftLabel || '').trim());
  const head = `<tr><th></th><th>名前</th><th class="num">コメント</th>${hasLikes ? '<th class="num">コメントのいいね合計</th>' : ''}${hasGifts ? '<th>応援</th>' : ''}<th>メモ</th></tr>`;
  const body = rows
    .map((p, i) => {
      const memo = [];
      if (p.pending) memo.push('おへんじできるコメントあり');
      if (p.returning) memo.push('以前の配信でもコメント');
      const likeCell = hasLikes
        ? `<td class="num">${p.likeTotal != null ? Number(p.likeTotal).toLocaleString('ja-JP') : ''}</td>`
        : '';
      const giftCell = hasGifts ? `<td>${escapeHtml(p.giftLabel || '')}</td>` : '';
      return `<tr><td class="num">${i + 1}</td><td><div class="mkt-op-person">${avHtml(p, ctx)}<div class="mkt-op-name">${escapeHtml(ctx.displayName(p.name))}</div></div></td><td class="num">${Number(p.commentCount || 0).toLocaleString('ja-JP')}</td>${likeCell}${giftCell}<td class="mkt-op-meta">${escapeHtml(memo.join('・'))}</td></tr>`;
    })
    .join('');
  return `<div class="mkt-table-scroll"><table class="mkt-op-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function renderThreads(data, ctx) {
  const cards = Array.isArray(data?.cards) ? data.cards : [];
  return cards
    .map((t) => {
      const tags = [];
      if (t.likeCount != null) tags.push(tag(`いいね ${Number(t.likeCount).toLocaleString('ja-JP')}`));
      const replies = Array.isArray(t.replies) ? t.replies : [];
      const creatorReplies = replies.filter((r) => r.isCreator);
      const viewerReplies = replies.filter((r) => !r.isCreator);
      if (creatorReplies.length) tags.push(tag('投稿者が返信', 'teal'));
      if (t.creatorHeart) tags.push(tag('ハートあり', 'gold'));
      if (viewerReplies.length) {
        const names = viewerReplies.map((r) => ctx.displayName(r.name)).filter(Boolean).slice(0, 3).join('、');
        tags.push(tag(`視聴者の返信 ${viewerReplies.length}${names ? `（${names}）` : ''}`, 'blue'));
      }
      if (t.pending) tags.push(tag('おへんじできる', 'mute'));
      const replyHtml = creatorReplies
        .map(
          (r) =>
            `<div class="mkt-op-reply"><span class="mkt-op-name">${escapeHtml(ctx.displayName(r.name) || '投稿者')}</span> <span class="mkt-op-meta">（投稿者）${r.timeText ? `・ ${escapeHtml(r.timeText)}` : ''}</span>${r.text ? `<div class="mkt-op-body">${escapeHtml(r.text)}</div>` : ''}</div>`,
        )
        .join('');
      return `<div class="mkt-op-comment"><div class="mkt-op-person">${avHtml(t, ctx)}<div>
        <div class="mkt-op-name">${escapeHtml(ctx.displayName(t.name))}${t.timeText ? ` <span class="mkt-op-meta">・ ${escapeHtml(t.timeText)}</span>` : ''}</div>
        ${t.text ? `<div class="mkt-op-body">${escapeHtml(t.text)}</div>` : ''}
        ${tags.length ? `<div class="mkt-op-tags">${tags.join('')}</div>` : ''}
        ${replyHtml}
      </div></div></div>`;
    })
    .join('');
}

function renderGifts(data) {
  const cards = Array.isArray(data?.cards) ? data.cards : [];
  const kpi = cards.length
    ? `<div class="mkt-op-kpis" style="margin-bottom:1rem">${cards
        .map((k) => `<div class="mkt-op-kpi"><b>${escapeHtml(k.value)}</b><span>${escapeHtml(k.label)}</span>${k.hint ? `<em>${escapeHtml(k.hint)}</em>` : ''}</div>`)
        .join('')}</div>`
    : '';
  const estNotes = (Array.isArray(data?.estimates) ? data.estimates : [])
    .map((e) => `<p class="mkt-note">${escapeHtml(e.note)}${e.sourceUrl ? `（出典: ${escapeHtml(e.sourceUrl)}）` : ''}</p>`)
    .join('');
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const table = rows.length
    ? `<div class="mkt-table-scroll"><table class="mkt-op-table"><thead><tr><th>時刻</th><th>名前</th><th>内容</th><th class="num">数量</th></tr></thead><tbody>${rows
        .map((r) => `<tr><td>${escapeHtml(r.timeText || '')}</td><td>${escapeHtml(r.name || '')}</td><td>${escapeHtml(r.label || '')}</td><td class="num">${escapeHtml(r.amount || '')}</td></tr>`)
        .join('')}</tbody></table></div>`
    : '';
  return kpi + table + estNotes;
}

function renderPeaks(data) {
  const buckets = Array.isArray(data?.buckets) ? data.buckets : [];
  const max = Math.max(1, ...buckets.map((b) => Number(b.count) || 0));
  const peak = buckets.slice().sort((a, b) => Number(b.count) - Number(a.count))[0];
  const bars = buckets
    .map((b) => {
      const h = Math.max(4, Math.round(((Number(b.count) || 0) / max) * 100));
      const isPeak = peak && b.startAt === peak.startAt;
      return `<div class="mkt-op-bar-col"><div class="mkt-op-bar${isPeak ? ' is-peak' : ''}" style="height:${h}%"></div><span>${escapeHtml(b.label)}</span></div>`;
    })
    .join('');
  const conc = data?.concurrentPeak != null
    ? `<p class="mkt-note">${escapeHtml(data.concurrentLabel || '同時接続')}の山は ${Number(data.concurrentPeak).toLocaleString('ja-JP')} です。</p>`
    : '';
  return `<div class="mkt-op-bars">${bars}</div>${data?.note ? `<p class="mkt-note">${escapeHtml(data.note)}</p>` : ''}${conc}`;
}

function renderRelated(data) {
  const snap = data?.snapshot;
  if (!snap) return '';
  const chips = (Array.isArray(snap.chipLabels) ? snap.chipLabels : [])
    .map((c) => `<span class="mkt-op-chip${c === snap.chipLabel ? ' is-on' : ''}">${escapeHtml(c)}</span>`)
    .join('');
  const videos = (Array.isArray(snap.videos) ? snap.videos : [])
    .map((v) => {
      const meta = [v.channel, v.duration].filter(Boolean).join(' ・ ');
      return `<div class="mkt-op-vid${v.isOwn ? ' is-own' : ''}"><b>${escapeHtml(v.title || '')}</b><span>${escapeHtml(meta)}</span>${v.isOwn ? '<span class="mkt-op-own">自分の動画</span>' : ''}</div>`;
    })
    .join('');
  const own = Number(snap.ownCount) || 0;
  const total = Array.isArray(snap.videos) ? snap.videos.length : 0;
  const line = snap.chipLabel
    ? `<p class="mkt-note">書き出したとき選ばれていたチップは「${escapeHtml(snap.chipLabel)}」。${
        total ? `見えていた ${total.toLocaleString('ja-JP')}本のうち、自分のチャンネルの動画は <b>${own.toLocaleString('ja-JP')}本</b> でした。` : '関連動画のカードは画面に出ていませんでした。'
      }</p>`
    : '';
  return `${line}${chips ? `<div>${chips}</div>` : ''}${videos ? `<div class="mkt-op-vids">${videos}</div>` : ''}<p class="mkt-note">他のチップの中身は、開くと新しい通信が走ることがあるため、自動では開いていません。</p>`;
}

/**
 * 従来の分析を折りたたみの中に入れる。
 * @param {string} innerHtml
 */
export function wrapLegacyAnalysisAppendix(innerHtml) {
  const inner = String(innerHtml || '');
  if (!inner.trim()) return '';
  return `<details class="mkt-appendix" id="mkt-appendix"><summary>詳しい分析（従来のグラフと表）</summary>\n${inner}\n</details>`;
}
