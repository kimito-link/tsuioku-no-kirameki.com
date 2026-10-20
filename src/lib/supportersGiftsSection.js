/**
 * supportersGiftsSection.js — マーケレポートの章「応援者とギフト(誰がどんなコメントをして・どんなギフトを出したか)」(2026-10-20)。
 *
 * 背景: ユーザー要望「以前の HTML レポートにあった、誰がどんなコメントをして、どんなアイテム・ギフトを出したかを復活させたい」。
 *   調査の結果、HTML レポートにユーザー別のコメント本文+ギフト明細の章が出荷されたことは一度も無かった(死蔵 lib のみ)。
 *   ギフトの「誰が・何を・いくら」は『ギフト投げ履歴』(200行上限)に、コメントは時系列の一覧(先頭80件)にあるだけで、
 *   【人ごとに両方を並べて見る】ものが無かった。この章でユーザーごとにまとめ、`<details>` で畳んで全員分を載せる。
 *
 * 規律:
 *   - 入力は全件(マーケの分析入力は v0.1.1708 から全件)。表示の切りは下の定数だけ・切った分は注記する(黙って切らない)。
 *   - 共有モード(maskShare=true)では、名前・サムネ・コメント本文・アイテムの個別行を出さず、件数と pt だけ(伏せ字の既存方針)。
 *   - AGENTS §3.5: 応援者は主役(サムネ・ID・名前・リンクをセットで出す)・匿名は匿名として識別できる形。ローカル保存の HTML のみ(外部送信なし)。
 *   - HTML 化する文字列はすべて escapeHtml を通す(コメント本文・アイテム名・名前は第三者の入力)。
 *   - 時点(capturedAt)の解釈は自前でせず timeAuthority.js の toEpochMs に委ねる(timeAuthorityRegistry の規律)。
 *
 * @module supportersGiftsSection
 */
import { escapeHtml } from './htmlEscape.js';
import { giftLedgerSenderKey } from './marketingGiftThrowLedger.js';
import { toEpochMs } from './timeAuthority.js';

/** 1人あたりに載せるコメント本文の最大件数(超えた分は「ほか N 件」と注記。件数そのものは実数)。 */
export const SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER = 1000;
/** ギフトを出していない(コメントだけの)人を載せる最大人数(ギフトを出した人は必ず載せる)。 */
export const SUPPORTERS_GIFTS_MAX_COMMENT_ONLY_USERS = 300;
/** 開いた状態で出す上位の人数。 */
export const SUPPORTERS_GIFTS_OPEN_TOP = 10;

/** 章専用の CSS(マーケの CSS 文字列へ連結する)。 */
export const SUPPORTERS_GIFTS_CSS = `
.mkt-sg-list{display:flex;flex-direction:column;gap:6px}
.mkt-sg{border:1px solid var(--mkt-line,#ddd);border-radius:8px;background:var(--mkt-card,#fff)}
.mkt-sg>summary{cursor:pointer;padding:8px 10px;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.mkt-sg__rank{font-weight:700;min-width:2.2em}
.mkt-sg__meta{opacity:.85;font-size:.92em}
.mkt-sg__body{padding:4px 12px 10px}
.mkt-sg__body h4{margin:8px 0 4px;font-size:.95em}
.mkt-sg__table{width:100%;border-collapse:collapse;font-size:.92em}
.mkt-sg__table th,.mkt-sg__table td{padding:3px 6px;text-align:left;border-bottom:1px solid var(--mkt-line,#eee);vertical-align:top;word-break:break-word}
.mkt-sg__time{white-space:nowrap;opacity:.8}
.mkt-sg__more{opacity:.75;font-size:.9em}
`;

const NUMERIC_UID = /^\d{1,18}$/;

/** @param {unknown} v */
const str = (v) => String(v == null ? '' : v).trim();

/**
 * コメント側の userId から、ギフト側の giftLedgerSenderKey と合流できるキーを作る。
 * @param {string} uid
 */
function commentUserKey(uid) {
  return NUMERIC_UID.test(uid) ? `uid:${uid}` : uid;
}

/**
 * @param {number} ms
 * @returns {string} JST の HH:mm:ss(不正なら —)
 */
export function formatClockJst(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '—';
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).format(new Date(n));
  } catch {
    return '—';
  }
}

/**
 * @typedef {{
 *   userKey: string, userId: string, label: string, avatarUrl: string,
 *   commentCount: number, comments: { at: number, text: string }[], commentsOmitted: number,
 *   giftCount: number, giftPoints: number,
 *   gifts: { timeLabel: string, itemName: string, points: number, thumbnailUrl: string, _sort?: number }[]
 * }} SupportersGiftsRow
 */

/**
 * ユーザーごとに コメント+ギフト をまとめる(純関数)。
 * @param {{
 *   comments?: readonly unknown[]|null,
 *   giftRows?: readonly unknown[]|null,
 *   broadcasterUserId?: string
 * }|null|undefined} input
 * @returns {SupportersGiftsRow[]} ギフト pt 降順→コメント件数降順。非列挙の omittedUsers=載せなかったコメントだけの人数。
 */
export function buildSupportersGiftsRows(input) {
  const comments = Array.isArray(input?.comments) ? input.comments : [];
  const giftRows = Array.isArray(input?.giftRows) ? input.giftRows : [];
  const bcUid = str(input?.broadcasterUserId);
  /** @type {Map<string, SupportersGiftsRow>} */
  const map = new Map();
  /** @param {string} key @param {string} userId */
  const ensure = (key, userId) => {
    let row = map.get(key);
    if (!row) {
      row = {
        userKey: key,
        userId,
        label: '',
        avatarUrl: '',
        commentCount: 0,
        comments: [],
        commentsOmitted: 0,
        giftCount: 0,
        giftPoints: 0,
        gifts: []
      };
      map.set(key, row);
    }
    return row;
  };

  for (const raw of comments) {
    const e = /** @type {Record<string, unknown>} */ (raw || {});
    const uid = str(e.userId);
    const text = str(e.text);
    if (!uid || !text) continue;
    if (bcUid && uid === bcUid) continue;
    const row = ensure(commentUserKey(uid), uid);
    row.commentCount += 1;
    const nick = str(e.nickname);
    if (nick && (!row.label || nick.length > row.label.length)) row.label = nick;
    const av = str(e.avatarUrl);
    if (av && /^https?:\/\//.test(av)) row.avatarUrl = av;
    row.comments.push({ at: toEpochMs(e.capturedAt), text });
  }

  for (const raw of giftRows) {
    const r = /** @type {any} */ (raw || {});
    const points = Number(r.points) || 0;
    if (!(points > 0)) continue;
    const key = giftLedgerSenderKey(r);
    const row = ensure(key, str(r.userId));
    row.giftCount += 1;
    row.giftPoints += points;
    const sender = str(r.senderLabel);
    if (sender && !row.label) row.label = sender;
    const av = str(r.senderAvatarUrl);
    if (av && !row.avatarUrl && /^https?:\/\//.test(av)) row.avatarUrl = av;
    row.gifts.push({
      timeLabel: str(r.timeLabel) || '—',
      itemName: str(r.itemName) || '（名称未取得）',
      points,
      thumbnailUrl: str(r.thumbnailUrl),
      _sort: Number(r.sortKey) || 0
    });
  }

  const all = [...map.values()];
  for (const row of all) {
    row.comments.sort((a, b) => a.at - b.at);
    if (row.comments.length > SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER) {
      row.commentsOmitted = row.comments.length - SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER;
      row.comments = row.comments.slice(0, SUPPORTERS_GIFTS_MAX_COMMENTS_PER_USER);
    }
    row.gifts.sort((a, b) => (a._sort || 0) - (b._sort || 0));
    for (const gft of row.gifts) delete gft._sort;
  }
  all.sort((a, b) => b.giftPoints - a.giftPoints || b.commentCount - a.commentCount || (a.userKey < b.userKey ? -1 : a.userKey > b.userKey ? 1 : 0));

  const gifted = all.filter((r) => r.giftCount > 0);
  const commentOnly = all.filter((r) => r.giftCount === 0);
  const keptCommentOnly = commentOnly.slice(0, SUPPORTERS_GIFTS_MAX_COMMENT_ONLY_USERS);
  const out = [...gifted, ...keptCommentOnly];
  out.sort((a, b) => b.giftPoints - a.giftPoints || b.commentCount - a.commentCount || (a.userKey < b.userKey ? -1 : a.userKey > b.userKey ? 1 : 0));
  Object.defineProperty(out, 'omittedUsers', { value: commentOnly.length - keptCommentOnly.length, enumerable: false });
  return out;
}

/** @param {number} n */
const fmt = (n) => Number(n || 0).toLocaleString('ja-JP');

/**
 * 章の HTML(畳める)。
 * @param {SupportersGiftsRow[]} rows buildSupportersGiftsRows の戻り
 * @param {{
 *   maskShare?: boolean,
 *   renderIdentity?: (row: SupportersGiftsRow) => { thumbCell: string, accountHtml: string, idHtml: string },
 *   openTop?: number
 * }} [opts]
 * @returns {string}
 */
export function sectionSupportersGiftsHtml(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const mask = opts.maskShare === true;
  const openTop = Number.isFinite(opts.openTop) ? Math.max(0, Number(opts.openTop)) : SUPPORTERS_GIFTS_OPEN_TOP;
  const head = `<h2>応援者とギフト（誰がどんなコメントをして・どんなギフトを出したか）</h2>`;
  if (!list.length) {
    return `<section class="mkt-section" id="mkt-supporters-gifts">
${head}
<p class="mkt-note">この配信のコメント・ギフトの記録がありません。</p>
</section>`;
  }
  const omittedUsers = Number(/** @type {any} */ (list).omittedUsers) || 0;
  const giftedUsers = list.filter((r) => r.giftCount > 0).length;
  const totalPts = list.reduce((n, r) => n + r.giftPoints, 0);
  const totalComments = list.reduce((n, r) => n + r.commentCount, 0);
  const note =
    `<p class="mkt-note">応援者ごとに、コメントとギフトをまとめています(畳んであります。上位${openTop}人は開いています)。` +
    ` <strong>${escapeHtml(`${fmt(list.length)}名(うちギフト ${fmt(giftedUsers)}名)・コメント ${fmt(totalComments)}件・ギフト合計 ${fmt(totalPts)} pt`)}</strong>` +
    (omittedUsers > 0 ? ` ギフトを出していない方のうち、コメントの少ない ${fmt(omittedUsers)}名は省略しています。` : '') +
    (mask ? ' 共有モード(伏せ字)のため、名前・コメント本文・アイテムの内訳は出していません。' : '') +
    `</p>`;

  const items = list.map((row, i) => {
    const meta = `<span class="mkt-sg__meta">コメント ${fmt(row.commentCount)} 件${row.giftCount > 0 ? ` ／ ギフト ${fmt(row.giftCount)} 回・${fmt(row.giftPoints)} pt` : ''}</span>`;
    if (mask) {
      return `<div class="mkt-sg mkt-sg--mask"><div class="mkt-sg__summary" style="padding:8px 10px"><span class="mkt-sg__rank">#${i + 1}</span> ${meta}</div></div>`;
    }
    const idc = typeof opts.renderIdentity === 'function'
      ? opts.renderIdentity(row)
      : { thumbCell: '', accountHtml: escapeHtml(row.label || row.userKey), idHtml: escapeHtml(row.userId) };
    const giftsHtml = row.gifts.length
      ? `<h4>ギフト(${fmt(row.gifts.length)}回)</h4><table class="mkt-sg__table"><thead><tr><th>時刻</th><th>アイテム</th><th>pt</th></tr></thead><tbody>${row.gifts
          .map((g) => `<tr><td class="mkt-sg__time">${escapeHtml(g.timeLabel)}</td><td>${escapeHtml(g.itemName)}</td><td>${fmt(g.points)} pt</td></tr>`)
          .join('')}</tbody></table>`
      : '';
    const commentsHtml = row.comments.length
      ? `<h4>コメント(${fmt(row.commentCount)}件)</h4><table class="mkt-sg__table"><thead><tr><th>時刻</th><th>コメント</th></tr></thead><tbody>${row.comments
          .map((cm) => `<tr><td class="mkt-sg__time">${escapeHtml(formatClockJst(cm.at))}</td><td>${escapeHtml(cm.text)}</td></tr>`)
          .join('')}</tbody></table>${row.commentsOmitted > 0 ? `<p class="mkt-sg__more">ほか ${fmt(row.commentsOmitted)} 件(長いため省略。件数は実数です)</p>` : ''}`
      : '';
    return `<details class="mkt-sg"${i < openTop ? ' open' : ''}><summary><span class="mkt-sg__rank">#${i + 1}</span>${idc.thumbCell} ${idc.accountHtml} ${idc.idHtml} ${meta}</summary><div class="mkt-sg__body">${giftsHtml}${commentsHtml}</div></details>`;
  });

  return `<section class="mkt-section" id="mkt-supporters-gifts">
${head}
${note}
<div class="mkt-sg-list">
${items.join('\n')}
</div>
</section>`;
}
