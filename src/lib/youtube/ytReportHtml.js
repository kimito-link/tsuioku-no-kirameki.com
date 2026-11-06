// ytReportHtml.js — YouTube 版の「💾 HTML（記録レポート）」と「📊 マーケ（分析レポート）」を組み立てる純粋関数
// @layer L0 — 純粋計算（副作用・ブラウザ API なし）。出力は保存用の1枚 HTML 文字列。
//
// ニコ生版のマーケ分析（src/lib/marketingChartsHtml.js）はギフト・広告・pt・184 など
// ニコ生固有の項目が中心なので、そのまま流すと YouTube では「未取得」だらけになる。
// ここでは分析の部品（コメント速度・笑いの山・沈黙）だけをニコ生版と共有し、
// YouTube の応援（スーパーチャット通貨別・メンバー）を主役にした章立てで出す。

import { escapeHtml, formatNumberJa } from '../htmlText.js';
import {
  buildCommentVelocityTimeline,
  buildLaughterDensityTimeline,
} from '../commentVelocityTimeline.js';
import { detectCommentSilenceZones } from '../commentSilenceZones.js';
import { aggregateYtSupportRanking, buildYtChannelUrl } from './ytSupportRanking.js';

/**
 * @typedef {{
 *   videoId?: string,
 *   title?: string,
 *   broadcasterName?: string,
 *   broadcasterChannelId?: string,
 *   broadcasterIconUrl?: string,
 *   concurrentViewers?: number,
 *   peakConcurrentViewers?: number
 * }} YtReportSummary
 */

const KIND_LABEL = Object.freeze({
  text: 'コメント',
  superchat: 'スーパーチャット',
  sticker: 'スーパーステッカー',
  membership: 'メンバー加入',
  membership_gift: 'メンバーシップギフト',
});

/** @param {unknown} v */
function attr(v) {
  return escapeHtml(String(v == null ? '' : v));
}

/** @param {unknown} url */
function safeImg(url) {
  const s = String(url || '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

/**
 * IndexedDB の記録行を、ニコ生版の分析部品が読める形（capturedAt / text）に写す。
 * @param {any[]} items
 * @returns {{ capturedAt: number, text: string, userId: string }[]}
 */
export function toYtAnalyticsComments(items) {
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== 'object') continue;
    const at = Number(it.recordedAt || 0);
    if (!Number.isFinite(at) || at <= 0) continue;
    out.push({ capturedAt: at, text: String(it.text || ''), userId: String(it.channelId || '') });
  }
  out.sort((a, b) => a.capturedAt - b.capturedAt);
  return out;
}

/**
 * @param {number} ms
 * @returns {string} 例 "2026/11/03 21:05"
 */
function formatDateTimeJa(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const d = new Date(ms);
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** @param {number} ms */
function formatClock(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** @param {number} ms */
function formatDurationJa(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0分';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}分`;
  return `${Math.floor(min / 60)}時間${min % 60}分`;
}

/**
 * ファイル名（日時・配信タイトル入り）。Windows で使えない文字は除く。
 * @param {'html'|'marketing'} kind
 * @param {YtReportSummary | null | undefined} summary
 * @param {number} nowMs
 */
export function buildYtReportFilename(kind, summary, nowMs) {
  const d = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  const title = String(summary?.title || summary?.videoId || 'youtube')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[^\S ]/g, ' ')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  const head = kind === 'marketing' ? 'yt-marketing' : 'yt-comments';
  return `${head}-${stamp}-${title || 'youtube'}.html`;
}

const BASE_CSS = `
:root{color-scheme:light;--bg:#fff7ec;--soft:#fff1f4;--surface:#fffdf9;--text:#4a3b34;--sub:#7a6458;--muted:#9c8678;--border:#e3c9b5;--accent:#f06aa0;--accent-soft:#ffd9e6;--gift:#c8721c;--ok:#3fa66a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:"M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Yu Gothic UI",system-ui,sans-serif;font-size:14px;line-height:1.6}
main{max-width:980px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:16px;margin:0 0 10px;padding-left:8px;border-left:4px solid var(--accent)}
.sub{color:var(--sub);font-size:12px}
section{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin:14px 0;box-shadow:0 1px 6px rgba(120,80,50,.08)}
.head{display:flex;gap:12px;align-items:center}
.head img{width:56px;height:56px;border-radius:50%;border:2px solid var(--accent-soft);object-fit:cover}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.card{background:var(--soft);border:1px solid var(--border);border-radius:12px;padding:8px 10px}
.card .k{font-size:11px;color:var(--sub);font-weight:700}
.card .v{font-size:20px;font-weight:800}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:5px 6px;border-bottom:1px solid color-mix(in srgb,var(--border) 60%,transparent);text-align:left;vertical-align:top}
th{font-size:11px;color:var(--sub)}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.who{display:inline-flex;align-items:center;gap:6px}
.who img{width:24px;height:24px;border-radius:50%;object-fit:cover;background:var(--accent-soft)}
.who a{color:var(--text);font-weight:700;text-decoration:none}
.who a:hover{text-decoration:underline}
.id{font-size:10px;color:var(--muted)}
.chart{width:100%;height:auto;display:block}
.note{font-size:12px;color:var(--sub);margin:6px 0 0}
.pill{display:inline-block;border-radius:999px;padding:0 8px;font-size:11px;font-weight:700;background:var(--accent-soft)}
.pill.paid{background:#ffe7c7;color:var(--gift)}
.pill.member{background:#e1f5e8;color:var(--ok)}
ul.tips{margin:0;padding-left:20px}
footer{color:var(--muted);font-size:11px;text-align:center;margin-top:24px}
input[type=search]{width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:14px;margin-bottom:8px;background:#fff}
`;

/**
 * @param {string} title
 * @param {string} body
 * @param {string} [extraScript]
 */
function wrapDocument(title, body, extraScript = '') {
  return (
    '<!doctype html><html lang="ja"><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    `<title>${escapeHtml(title)}</title><style>${BASE_CSS}</style></head>` +
    `<body><main>${body}</main>${extraScript}</body></html>`
  );
}

/**
 * @param {{ name?: string, channelId?: string, iconUrl?: string }} u
 */
function whoCell(u) {
  const name = String(u?.name || u?.channelId || 'リスナー');
  const ch = String(u?.channelId || '');
  const url = buildYtChannelUrl(ch);
  const img = safeImg(u?.iconUrl);
  const imgTag = img ? `<img src="${attr(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : '<img alt="" />';
  const nameTag = url
    ? `<a href="${attr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>`
    : `<span>${escapeHtml(name)}</span>`;
  const idTag = ch ? `<span class="id">${escapeHtml(ch)}</span>` : '';
  return `<span class="who">${imgTag}<span>${nameTag}<br />${idTag}</span></span>`;
}

/**
 * @param {YtReportSummary | null | undefined} summary
 * @param {string} heading
 */
function headerSection(summary, heading) {
  const icon = safeImg(summary?.broadcasterIconUrl);
  const title = String(summary?.title || summary?.videoId || 'YouTube Live');
  const bName = String(summary?.broadcasterName || '');
  const vid = String(summary?.videoId || '');
  const watchUrl = /^[A-Za-z0-9_-]{11}$/.test(vid) ? `https://www.youtube.com/watch?v=${vid}` : '';
  const chUrl = buildYtChannelUrl(String(summary?.broadcasterChannelId || ''));
  return (
    '<section class="head">' +
    (icon ? `<img src="${attr(icon)}" alt="" referrerpolicy="no-referrer" />` : '') +
    '<div>' +
    `<div class="sub">${escapeHtml(heading)}</div>` +
    `<h1>${watchUrl ? `<a href="${attr(watchUrl)}" target="_blank" rel="noopener noreferrer" style="color:inherit">${escapeHtml(title)}</a>` : escapeHtml(title)}</h1>` +
    (bName
      ? `<div class="sub">配信者: ${chUrl ? `<a href="${attr(chUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(bName)}</a>` : escapeHtml(bName)}</div>`
      : '') +
    '</div></section>'
  );
}

/**
 * 1分ごとのコメント数の棒グラフ（SVG）。
 * @param {{ count: number, rolling5: number, atStart: number }[]} buckets
 */
function velocitySvg(buckets) {
  if (!buckets.length) return '<p class="note">まだグラフにできるほど記録がありません。</p>';
  const W = 940;
  const H = 180;
  const pad = 24;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const bw = (W - pad * 2) / buckets.length;
  let bars = '';
  buckets.forEach((b, i) => {
    const h = Math.round(((H - pad * 2) * b.count) / max);
    const x = pad + i * bw;
    bars += `<rect x="${x.toFixed(1)}" y="${H - pad - h}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${h}" fill="#f06aa0" opacity="0.75"><title>${escapeHtml(formatClock(b.atStart))} ${b.count}件</title></rect>`;
  });
  let line = '';
  buckets.forEach((b, i) => {
    const y = H - pad - ((H - pad * 2) * b.rolling5) / max;
    const x = pad + i * bw + bw / 2;
    line += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
  });
  const first = formatClock(buckets[0].atStart).slice(0, 5);
  const last = formatClock(buckets[buckets.length - 1].atStart).slice(0, 5);
  return (
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="1分ごとのコメント数">` +
    `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#e3c9b5" />` +
    bars +
    `<path d="${line}" fill="none" stroke="#c8721c" stroke-width="2" />` +
    `<text x="${pad}" y="${H - 6}" font-size="11" fill="#7a6458">${escapeHtml(first)}</text>` +
    `<text x="${W - pad}" y="${H - 6}" font-size="11" fill="#7a6458" text-anchor="end">${escapeHtml(last)}</text>` +
    `<text x="${pad}" y="14" font-size="11" fill="#7a6458">最大 ${max}件/分</text>` +
    '</svg>'
  );
}

/**
 * 📊 マーケ（分析レポート）。
 * @param {{ summary?: YtReportSummary | null, items: any[], nowMs?: number }} input
 * @returns {string}
 */
export function buildYtMarketingReportHtml(input) {
  const nowMs = Number.isFinite(input?.nowMs) ? Number(input.nowMs) : Date.now();
  const summary = input?.summary || null;
  const items = Array.isArray(input?.items) ? input.items : [];
  const ranking = aggregateYtSupportRanking(items);
  const comments = toYtAnalyticsComments(items);
  const velocity = buildCommentVelocityTimeline(comments, { bucketMs: 60_000, rollingWindowMin: 5 });
  const laughter = buildLaughterDensityTimeline(comments, { bucketMs: 60_000 });
  const silences = detectCommentSilenceZones(comments, { thresholdMs: 60_000, quality: { windowMs: 30_000 } });

  const firstAt = comments.length ? comments[0].capturedAt : 0;
  const lastAt = comments.length ? comments[comments.length - 1].capturedAt : 0;
  const commenters = Array.isArray(ranking.commenters) ? ranking.commenters : [];
  const currencies = Object.keys(ranking.totalsByCurrency || {}).sort(
    (a, b) => (ranking.currencyItemCounts[b] || 0) - (ranking.currencyItemCounts[a] || 0),
  );
  const paidUsers = commenters.filter((c) => c.superchatCount + c.stickerCount > 0).length;
  const memberUsers = commenters.filter((c) => c.isMember || c.membershipCount > 0 || c.giftCount > 0).length;
  const peakViewers = Number(summary?.peakConcurrentViewers || summary?.concurrentViewers || 0);

  // 1. 概要カード
  const card = (/** @type {string} */ k, /** @type {string} */ v) => `<div class="card"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;
  const superchatText = currencies.length
    ? currencies.map((c) => `${c} ${formatNumberJa(ranking.totalsByCurrency[c])}`).join(' / ')
    : '—';
  let body = headerSection(summary, '追憶のきらめき for YouTube — マーケ分析レポート');
  body +=
    '<section><h2>この配信の規模</h2><div class="cards">' +
    card('記録したコメント', `${formatNumberJa(items.length)}件`) +
    card('コメントした人', `${formatNumberJa(commenters.length)}人`) +
    card('記録した時間', formatDurationJa(lastAt - firstAt)) +
    card('同時視聴（最大の記録）', peakViewers > 0 ? `${formatNumberJa(peakViewers)}人` : '未取得') +
    card('スパチャした人', `${formatNumberJa(paidUsers)}人`) +
    card('メンバー関係', `${formatNumberJa(memberUsers)}人`) +
    '</div>' +
    `<p class="note">スーパーチャット合計（通貨別）: ${escapeHtml(superchatText)}</p>` +
    `<p class="note">記録期間: ${escapeHtml(formatDateTimeJa(firstAt))} 〜 ${escapeHtml(formatDateTimeJa(lastAt))}。拡張がチャット欄を見ていた間の記録です（開く前のコメントは YouTube の仕様で取れません）。</p>` +
    '</section>';

  // 2. コメント速度
  const peaks = velocity.buckets
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .filter((b) => b.count > 0);
  body +=
    '<section><h2>コメントの勢い（1分ごと）</h2>' +
    velocitySvg(velocity.buckets) +
    '<p class="note">棒＝1分ごとの件数、線＝直近5分の平均。</p>' +
    (peaks.length
      ? '<p class="note">盛り上がった時間: ' +
        peaks.map((b) => `<span class="pill">${escapeHtml(formatClock(b.atStart).slice(0, 5))} ${b.count}件</span>`).join(' ') +
        '</p>'
      : '') +
    '</section>';

  // 3. 笑いと沈黙
  const laughPeaks = laughter.buckets
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .filter((b) => b.count > 0);
  const longSilences = silences.slice().sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);
  body +=
    '<section><h2>笑いの山と、静かになった時間</h2>' +
    `<p class="note">笑い系コメント（w・草・8888 など）: ${formatNumberJa(laughter.totalLaughter)}件（全体の ${Math.round((laughter.overallRatio || 0) * 100)}%）</p>` +
    (laughPeaks.length
      ? '<p class="note">笑いが多かった時間: ' +
        laughPeaks.map((b) => `<span class="pill">${escapeHtml(formatClock(b.atStart).slice(0, 5))} ${b.count}件</span>`).join(' ') +
        '</p>'
      : '') +
    (longSilences.length
      ? '<table><thead><tr><th>静かになった時間</th><th>長さ</th><th>直前のコメント</th><th>再開したコメント</th></tr></thead><tbody>' +
        longSilences
          .map(
            (z) =>
              `<tr><td>${escapeHtml(formatClock(z.startAt))}</td><td class="num">${Math.round(z.durationMs / 1000)}秒</td><td>${escapeHtml(z.beforeText || '')}</td><td>${escapeHtml(z.afterText || '')}</td></tr>`,
          )
          .join('') +
        '</tbody></table>'
      : '<p class="note">1分以上コメントが止まった時間はありませんでした。</p>') +
    '</section>';

  // 4. スパチャ（通貨別）
  let paidHtml = '';
  for (const cur of currencies) {
    const list = (ranking.byCurrency?.[cur] || []).slice(0, 20);
    paidHtml +=
      `<h3 style="font-size:14px;margin:10px 0 4px">${escapeHtml(cur)}（合計 ${escapeHtml(formatNumberJa(ranking.totalsByCurrency[cur]))}・${formatNumberJa(ranking.currencyItemCounts[cur] || 0)}件）</h3>` +
      '<table><thead><tr><th>#</th><th>応援してくれた人</th><th>金額</th><th>回数</th></tr></thead><tbody>' +
      list
        .map(
          (u) =>
            `<tr><td class="num">${u.rank}</td><td>${whoCell(u)}</td><td class="num">${escapeHtml(u.formattedAmount || '')}</td><td class="num">${u.count}回</td></tr>`,
        )
        .join('') +
      '</tbody></table>';
  }
  body +=
    '<section><h2>スーパーチャット・ステッカー（通貨別ランキング）</h2>' +
    (paidHtml || '<p class="note">この記録の間にスーパーチャットはありませんでした。</p>') +
    '<p class="note">通貨が違う金額は足し合わせず、通貨ごとに並べています。</p></section>';

  // 5. メンバー
  const members = commenters
    .filter((c) => c.giftCount > 0 || c.membershipCount > 0)
    .sort((a, b) => b.giftCount + b.membershipCount - (a.giftCount + a.membershipCount))
    .slice(0, 30);
  body +=
    '<section><h2>メンバー加入・メンバーシップギフト</h2>' +
    `<p class="note">メンバー加入 ${formatNumberJa(ranking.counts.membership)}件・ギフト ${formatNumberJa(ranking.counts.membershipGift)}件</p>` +
    (members.length
      ? '<table><thead><tr><th>人</th><th>加入</th><th>ギフト</th><th>コメント</th></tr></thead><tbody>' +
        members
          .map(
            (u) =>
              `<tr><td>${whoCell(u)}</td><td class="num">${u.membershipCount}</td><td class="num">${u.giftCount}</td><td class="num">${u.commentCount}</td></tr>`,
          )
          .join('') +
        '</tbody></table>'
      : '') +
    '</section>';

  // 6. よく話した人
  const talkers = commenters.slice(0, 30);
  body +=
    '<section><h2>よくコメントしてくれた人（上位30人）</h2>' +
    (talkers.length
      ? '<table><thead><tr><th>#</th><th>人</th><th>コメント</th><th>応援</th></tr></thead><tbody>' +
        talkers
          .map((u) => {
            const tags = [];
            if (u.superchatCount + u.stickerCount > 0) tags.push(`<span class="pill paid">${escapeHtml(u.primaryFormattedAmount || 'スパチャ')}</span>`);
            if (u.isMember) tags.push('<span class="pill member">メンバー</span>');
            return `<tr><td class="num">${u.rank}</td><td>${whoCell(u)}</td><td class="num">${u.commentCount}件</td><td>${tags.join(' ')}</td></tr>`;
          })
          .join('') +
        '</tbody></table>'
      : '<p class="note">まだコメントがありません。</p>') +
    '</section>';

  // 7. 次の配信への打ち手（数字から言えることだけ）
  const tips = [];
  if (peaks.length) tips.push(`いちばん盛り上がったのは ${formatClock(peaks[0].atStart).slice(0, 5)} ごろ（${peaks[0].count}件/分）。その時の話題を次回の冒頭に持ってくると入りやすいです。`);
  if (longSilences.length && longSilences[0].durationMs >= 120_000) tips.push(`${formatClock(longSilences[0].startAt).slice(0, 5)} ごろに ${Math.round(longSilences[0].durationMs / 60000)}分ほどコメントが止まりました。質問や二択を挟むと戻りやすいです。`);
  if (commenters.length > 0) {
    const once = commenters.filter((c) => c.commentCount === 1).length;
    tips.push(`1回だけコメントした人が ${formatNumberJa(once)}人（${Math.round((once / commenters.length) * 100)}%）。名前を呼んで返すと2回目が出やすくなります。`);
  }
  if (paidUsers > 0) tips.push(`スパチャをくれた ${formatNumberJa(paidUsers)}人は、配信の最後にまとめてお礼を読むと次も応援しやすくなります。`);
  body += `<section><h2>次の配信へのヒント</h2><ul class="tips">${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('') || '<li>記録が増えるとヒントが出ます。</li>'}</ul></section>`;

  body += `<footer>追憶のきらめき for YouTube（試作）・${escapeHtml(formatDateTimeJa(nowMs))} に作成・このファイルは利用者のPCの中だけで作られました</footer>`;
  return wrapDocument(`マーケ分析 — ${String(summary?.title || 'YouTube Live')}`, body);
}

/**
 * 💾 HTML（記録レポート）: 記録した全コメントを、検索できる1枚の HTML にする。
 * @param {{ summary?: YtReportSummary | null, items: any[], nowMs?: number }} input
 * @returns {string}
 */
export function buildYtCommentLogReportHtml(input) {
  const nowMs = Number.isFinite(input?.nowMs) ? Number(input.nowMs) : Date.now();
  const summary = input?.summary || null;
  const items = (Array.isArray(input?.items) ? input.items : [])
    .filter((it) => it && typeof it === 'object')
    .slice()
    .sort((a, b) => Number(a.recordedAt || 0) - Number(b.recordedAt || 0));
  const ranking = aggregateYtSupportRanking(items);

  let body = headerSection(summary, '追憶のきらめき for YouTube — 記録レポート');
  body +=
    '<section><div class="cards">' +
    `<div class="card"><div class="k">記録したコメント</div><div class="v">${formatNumberJa(items.length)}件</div></div>` +
    `<div class="card"><div class="k">コメントした人</div><div class="v">${formatNumberJa(ranking.uniqueCommenterCount)}人</div></div>` +
    `<div class="card"><div class="k">スーパーチャット</div><div class="v">${formatNumberJa(ranking.counts.superchat + ranking.counts.sticker)}件</div></div>` +
    `<div class="card"><div class="k">メンバー加入・ギフト</div><div class="v">${formatNumberJa(ranking.counts.membership + ranking.counts.membershipGift)}件</div></div>` +
    '</div></section>';
  body +=
    '<section><h2>コメント一覧</h2>' +
    '<input type="search" id="q" placeholder="名前・本文で絞り込み" aria-label="名前・本文で絞り込み" />' +
    '<table id="log"><thead><tr><th>時刻</th><th>人</th><th>種類</th><th>本文</th></tr></thead><tbody>' +
    items
      .map((it) => {
        const kind = /** @type {keyof typeof KIND_LABEL} */ (String(it.kind || 'text'));
        const label = KIND_LABEL[kind] || 'コメント';
        const amount = Number(it.amount || 0) > 0 ? ` ${escapeHtml(String(it.currency || ''))} ${escapeHtml(formatNumberJa(it.amount))}` : '';
        const cls = kind === 'superchat' || kind === 'sticker' ? 'pill paid' : kind === 'text' ? 'pill' : 'pill member';
        return (
          `<tr data-s="${attr(`${it.name || ''} ${it.text || ''}`.toLowerCase())}">` +
          `<td class="num">${escapeHtml(formatClock(Number(it.recordedAt || 0)))}</td>` +
          `<td>${whoCell(it)}</td>` +
          `<td><span class="${cls}">${escapeHtml(label)}${amount}</span></td>` +
          `<td>${escapeHtml(String(it.text || ''))}</td></tr>`
        );
      })
      .join('') +
    '</tbody></table></section>';
  body += `<footer>追憶のきらめき for YouTube（試作）・${escapeHtml(formatDateTimeJa(nowMs))} に作成</footer>`;
  const script =
    '<script>(function(){var q=document.getElementById("q");var rows=document.querySelectorAll("#log tbody tr");' +
    'q&&q.addEventListener("input",function(){var v=q.value.toLowerCase().trim();rows.forEach(function(r){r.style.display=!v||r.getAttribute("data-s").indexOf(v)>=0?"":"none";});});})();</script>';
  return wrapDocument(`記録レポート — ${String(summary?.title || 'YouTube Live')}`, body, script);
}
