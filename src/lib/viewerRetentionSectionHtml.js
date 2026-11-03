/**
 * マーケ分析レポートの章「視聴維持率（最後まで見たか・推定）」。
 * 計算は viewerRetentionEstimate.js。ここは HTML を組むだけ（純関数）。
 */

import { escapeAttr, escapeHtml } from '../shared/html/escape.js';
import { maskLabelForShare } from './privacyDisplay.js';
import { displayUserLabel } from './userRooms.js';
import { buildUserProfileLinkedLabelHtml } from './userProfileLinkHtml.js';
import { resolveReportUserThumbSrc } from './reportUserThumb.js';
import { NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS } from './supportGrowthTileSrc.js';

export const VIEWER_RETENTION_SECTION_ID = 'mkt-viewer-retention';
/** 表に出す人数の上限（重い配信で HTML が膨らみすぎないように）。超えた分は件数だけ書く。 */
export const VIEWER_RETENTION_TABLE_CAP = 500;

/** @param {number} ms */
function minLabel(ms) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m}分`;
  return `${Math.floor(m / 60)}時間${m % 60}分`;
}

/**
 * @param {import('./viewerRetentionEstimate.js').ViewerRetentionEstimate} est
 * @returns {string}
 */
export function viewerRetentionBasisHtml(est) {
  const startText =
    est.startSource === 'program' ? '番組の開始時刻' : '最初に記録したコメントの時刻（番組の開始時刻が取れなかったため）';
  const edge = minLabel(est.edgeWindowMs);
  return `<details class="mkt-vr__basis" open>
<summary>この数字の出し方（推定の根拠）</summary>
<ul>
<li>ニコ生は「誰がいつ入って、いつ出たか」を公開していません。そこで<strong>コメントした時刻</strong>から在席を推し量っています。見ているだけでコメントしなかった人は数に入りません。</li>
<li>配信の始まり = ${escapeHtml(startText)}。配信の終わり = 最後に記録したコメントの時刻（配信中に保存したときは、その時点まで）。</li>
<li><strong>最後まで見た</strong> = その人の最後のコメントが、終わりの${escapeHtml(edge)}以内にある。${escapeHtml(edge)}は配信の長さの10%（3分〜10分）です。</li>
<li><strong>一人ずつの視聴維持率</strong> = 推定視聴時間 ÷ 配信の長さ。最初のコメントから最後のコメントまではずっと見ていたとみなします。始まりから${escapeHtml(edge)}以内にコメントした人は始まりから、最後まで見た人は終わりまで見たとみなします。</li>
<li><strong>全体の視聴維持率</strong> = 最後まで見た人 ÷ コメントした人。</li>
<li>コメントが1回だけの人は、その1回の時刻だけで決まるので判定が粗くなります（表に「1回」と出ます）。配信者本人と「〇〇が好きな人が来場しました」の通知は除いています。</li>
</ul>
</details>`;
}

/**
 * @param {import('./viewerRetentionEstimate.js').ViewerRetentionEstimate} est
 * @param {{ maskShare?: boolean, identiconResolver?: (uid: string) => string }} [opts]
 * @returns {string}
 */
export function buildViewerRetentionSectionHtml(est, opts = {}) {
  if (!est || est.totalUsers === 0) return '';
  const maskShare = opts.maskShare === true;
  const head = `<section class="mkt-section" id="${VIEWER_RETENTION_SECTION_ID}">
<h2>視聴維持率（最後まで見たか・推定）</h2>`;
  if (!est.ok) {
    return `${head}
<p class="mkt-note">${escapeHtml(est.reason || '判定できませんでした。')}</p>
</section>`;
  }
  const cards = [
    ['全体の視聴維持率', `${est.stayedPct}%`, `コメントした ${est.totalUsers}人のうち ${est.stayedCount}人が最後まで`],
    [
      '始まりから最後まで',
      est.fromStartCount > 0 ? `${est.fromStartStayedPct}%` : '—',
      `序盤にいた ${est.fromStartCount}人のうち ${est.fromStartStayedCount}人`
    ],
    ['一人あたりの平均', `${est.avgRetentionPct}%`, `配信の長さ ${minLabel(est.durationMs)} に対する推定視聴時間`]
  ]
    .map(
      ([k, v, sub]) =>
        `<div class="mkt-vr__card"><div class="mkt-vr__k">${escapeHtml(k)}</div><div class="mkt-vr__v">${escapeHtml(v)}</div><div class="mkt-vr__sub">${escapeHtml(sub)}</div></div>`
    )
    .join('');

  const shown = est.users.slice(0, VIEWER_RETENTION_TABLE_CAP);
  const rows = shown
    .map((u, i) => {
      const rawLabel = displayUserLabel(u.userId, u.nickname || '');
      const nameHtml = maskShare
        ? escapeHtml(maskLabelForShare(rawLabel))
        : buildUserProfileLinkedLabelHtml(u.userId, rawLabel);
      const thumb = maskShare
        ? ''
        : resolveReportUserThumbSrc({ userId: u.userId, avatarUrl: u.avatarUrl || '', identiconResolver: opts.identiconResolver });
      const thumbHtml = thumb
        ? `<img class="mkt-vr__av" src="${escapeAttr(thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${escapeAttr(NICONICO_OFFICIAL_DEFAULT_USERICON_HTTPS)}'">`
        : '<span class="mkt-vr__av mkt-vr__av--empty"></span>';
      const verdict = u.stayedToEnd
        ? '<span class="mkt-vr__tag mkt-vr__tag--stay">最後まで</span>'
        : '<span class="mkt-vr__tag mkt-vr__tag--left">途中まで</span>';
      const single = u.singleComment ? ' <span class="mkt-vr__tag">1回</span>' : '';
      const join = u.fromStart ? '始まりから' : `${minLabel(u.firstAt - est.startMs)}〜`;
      const last = minLabel(u.lastAt - est.startMs);
      return `<tr>
<td>${i + 1}</td><td>${thumbHtml}</td><td>${nameHtml}</td>
<td>${verdict}${single}</td>
<td class="mkt-vr__bar"><div class="mkt-vr__fill" style="width:${u.retentionPct}%"></div><span>${u.retentionPct}%</span></td>
<td>${escapeHtml(join)}</td><td>${escapeHtml(last)}</td><td>${u.count}</td>
</tr>`;
    })
    .join('');
  const more =
    est.users.length > shown.length
      ? `<p class="mkt-note">ほか ${est.users.length - shown.length}人は表を軽くするため省略しています（全体の数字には入っています）。</p>`
      : '';
  const maskNote = maskShare ? '<p class="mkt-note">共有向け: 表示名は伏せ字です。</p>' : '';
  return `${head}
<style>
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.6rem;margin:.6rem 0}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__card{background:#111c31;border:1px solid #26364f;border-radius:10px;padding:.7rem .8rem}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__k{font-size:.8rem;color:#93a4be}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__v{font-size:1.6rem;font-weight:700;color:#e2e8f0}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__sub{font-size:.78rem;color:#93a4be}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__basis{margin:.6rem 0;font-size:.85rem;line-height:1.6}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__basis summary{cursor:pointer;color:#93c5fd}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__table-wrap{overflow-x:auto}
#${VIEWER_RETENTION_SECTION_ID} table{width:100%;border-collapse:collapse;font-size:.84rem}
#${VIEWER_RETENTION_SECTION_ID} th,#${VIEWER_RETENTION_SECTION_ID} td{padding:.35rem .45rem;border-bottom:1px solid #1f2a44;text-align:left;white-space:nowrap}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__av{width:24px;height:24px;border-radius:50%;object-fit:cover;display:inline-block;background:#1f2a44}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__tag{display:inline-block;font-size:.72rem;padding:.05rem .4rem;border-radius:999px;background:#1f2a44;color:#cbd5e1}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__tag--stay{background:#14532d;color:#bbf7d0}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__tag--left{background:#3f2a14;color:#fed7aa}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__bar{position:relative;min-width:120px}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__fill{position:absolute;left:0;top:25%;height:50%;background:#7c3aed55;border-radius:4px}
#${VIEWER_RETENTION_SECTION_ID} .mkt-vr__bar span{position:relative}
</style>
<p class="mkt-note">コメントした人ひとりずつについて、配信の最後まで見ていたかを<strong>コメントの時刻から推定</strong>しました。</p>
<div class="mkt-vr__cards">${cards}</div>
${viewerRetentionBasisHtml(est)}
${maskNote}
<div class="mkt-vr__table-wrap"><table>
<thead><tr><th>#</th><th>サムネ</th><th>ユーザー</th><th>判定</th><th>視聴維持率</th><th>見始め</th><th>最後のコメント</th><th>コメント数</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
${more}
</section>`;
}
