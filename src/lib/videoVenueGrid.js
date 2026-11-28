// videoVenueGrid.js — 会場モードの「動画のページ」だけに出す、席+吹き出しの並び(純関数・DOM なし・通信なし)。
// v0.1.2270(TNKC-50・りんく 11-27 承認の見た目の案 v3): 動画では、全員の吹き出しを最初から出す(漫画のように読める)。
//   並びは横の欄と同じ新しいコメント順(compareVideoRows)。段は「新しい / 少し前 / それより前」。
//   ライブの会場はこれを使わない(呼ぶ側で contentKind === 'video' のときだけ)。
import { compareVideoRows } from './viewerBehavior.js';
import { commentSentiment } from './commentSentiment.js';
import { parseLikeText } from './likeText.js';

/** 「新しい」の段に入れる古さの上限(7日) */
export const VIDEO_GRID_NEW_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** 「少し前」の段に入れる古さの上限(60日) */
export const VIDEO_GRID_RECENT_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
/** 一度に出す席の上限(会場の重さを増やしすぎない) */
export const VIDEO_GRID_MAX_SEATS = 120;

export const VIDEO_GRID_LEGEND = '枠の色：明るい＝前向き／灰色＝気になる点';

const BAND_HINTS = [
  'この動画の、新しいコメントです。再生位置が分かるものは時刻を付けています。',
  '少し前のコメントです。',
  'それより前のコメントです。',
];

/**
 * @typedef {{
 *   key: string,
 *   userId: string,
 *   tileUserId: string,
 *   name: string,
 *   avatarUrl: string,
 *   text: string,
 *   timeLabel: string,
 *   timeKind: 'play' | 'relative' | '',
 *   likeLabel: string,
 *   likeBand: '' | 'mid' | 'high',
 *   sentiment: 'positive' | 'neutral' | 'negative',
 *   lastAt: number,
 *   count: number,
 *   recentTexts: string[],
 * }} VideoGridSeat
 * @typedef {{ band: number, hint: string, seats: VideoGridSeat[] }} VideoGridBand
 * @typedef {{ bands: VideoGridBand[], seatCount: number, legend: string, sig: string }} VideoGridModel
 */

/**
 * 「00:21」「0:03:10」「1:05」を「0:21」「3:10」「1:05」に。再生位置でなければ ''。
 * @param {unknown} raw
 * @returns {string}
 */
export function playTimeLabel(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return '';
  let h = 0;
  let min = Number(m[1]);
  let sec = Number(m[2]);
  if (m[3] != null) {
    h = Number(m[1]);
    min = Number(m[2]);
    sec = Number(m[3]);
  }
  if (min > 59 && m[3] != null) return '';
  if (sec > 59) return '';
  if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/**
 * 吹き出しの時刻: 再生位置(録画のチャットの時刻・コメントの中の 1:05 など)が分かればそれ、無ければ「2週間前」のような時刻。
 * @param {any} c
 * @returns {{ label: string, kind: 'play' | 'relative' | '' }}
 */
export function videoCommentTimeLabel(c) {
  const t = String(c?.timeText || '').trim();
  const asPlay = playTimeLabel(t);
  if (asPlay) return { label: asPlay, kind: 'play' };
  const marks = Array.isArray(c?.timeMarks) ? c.timeMarks : [];
  for (const m of marks) {
    const p = playTimeLabel(m);
    if (p) return { label: p, kind: 'play' };
  }
  if (t) return { label: t, kind: 'relative' };
  return { label: '', kind: '' };
}

/**
 * 高評価の数(likeCount があればそれ、無ければ表示の文字を読む)。0・分からない → null。
 * @param {any} c
 * @returns {{ n: number, label: string } | null}
 */
export function videoCommentLikes(c) {
  const count = Number(c?.likeCount);
  if (Number.isFinite(count) && count > 0) return { n: Math.floor(count), label: `👍${Math.floor(count).toLocaleString('ja-JP')}` };
  const text = String(c?.likes || '').trim();
  const p = parseLikeText(text);
  if (p.state !== 'ok' || p.value == null || !(p.value > 0)) return null;
  const shown = p.exact ? p.value.toLocaleString('ja-JP') : text.replace(/\s+/g, '');
  return { n: p.value, label: `👍${shown}` };
}

/**
 * 枠の太さ(高評価が多いほど少し目立つ)。4以上 'mid'・10以上 'high'。
 * @param {number | null | undefined} n
 * @returns {'' | 'mid' | 'high'}
 */
export function likeBandOf(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  if (v >= 10) return 'high';
  if (v >= 4) return 'mid';
  return '';
}

/**
 * 席の札に使う id。YouTube のチャンネル id(UC…・24 文字)は、ライブの席と同じ札の決まりでは匿名の id に見えて顔が出ないので、
 *   ライブの席と同じく @ を外したハンドル(例 KatuMa-x3g)を使う。ハンドルが無ければ元の id。
 * @param {any} r
 * @returns {string}
 */
export function tileUserIdOf(r) {
  const handle = String(r?.handle || '').trim() || (String(r?.name || '').trim().startsWith('@') ? String(r.name).trim() : '');
  const h = handle.replace(/^@/, '').trim();
  return h || String(r?.id || '').trim();
}

/**
 * @param {any} row
 * @param {number} nowMs
 * @returns {number | null}
 */
function ageOf(row, nowMs) {
  const a = row?.pageAgeMs;
  if (a != null && Number.isFinite(Number(a)) && Number(a) >= 0) return Number(a);
  const at = Number(row?.pageAt);
  if (Number.isFinite(at) && at > 0 && Number.isFinite(nowMs) && nowMs >= at) return nowMs - at;
  return null;
}

/**
 * @param {number | null} age
 * @returns {number}
 */
function bandOfAge(age) {
  if (age == null) return 0;
  if (age <= VIDEO_GRID_NEW_MAX_AGE_MS) return 0;
  if (age <= VIDEO_GRID_RECENT_MAX_AGE_MS) return 1;
  return 2;
}

/**
 * 横の欄と同じ動画のボード(buildViewerBehaviorBoard の結果・contentKind:'video')から、会場の席と吹き出しを作る。
 * 動画のボードでなければ null(ライブでは使わない)。
 * @param {any} board
 * @param {{ nowMs?: number, maxSeats?: number }} [opts]
 * @returns {VideoGridModel | null}
 */
export function buildVideoVenueGridModel(board, opts = {}) {
  if (!board || typeof board !== 'object' || board.contentKind !== 'video') return null;
  const nowMs = Number.isFinite(Number(opts.nowMs)) ? Number(opts.nowMs) : Date.now();
  const max = Math.max(1, Math.floor(Number(opts.maxSeats) || VIDEO_GRID_MAX_SEATS));
  /** @type {any[]} */
  const all = Array.isArray(board.rows) ? board.rows : [];
  const rows = all
    .filter((/** @type {any} */ r) => r && !r.isAnonymous && String(r.id || '').trim() && Array.isArray(r.comments) && r.comments.some((/** @type {any} */ c) => String(c?.text || '').trim()))
    .slice()
    .sort(compareVideoRows)
    .slice(0, max);
  /** @type {VideoGridBand[]} */
  const bands = [];
  let band = 0;
  for (const r of rows) {
    const c = r.comments.find((/** @type {any} */ x) => String(x?.text || '').trim());
    // 並びは新しい順のまま。古さが分からない人は前の人と同じ段(段が行き来しない)
    const age = ageOf(r, nowMs);
    if (age != null) band = Math.max(band, bandOfAge(age));
    const time = videoCommentTimeLabel(c);
    const likes = videoCommentLikes(c);
    const text = String(c.text || '').replace(/\s+/g, ' ').trim();
    /** @type {VideoGridSeat} */
    const seat = {
      key: `u:${String(r.id).trim()}`,
      userId: String(r.id).trim(),
      tileUserId: tileUserIdOf(r),
      name: String(r.name || '').trim(),
      avatarUrl: /^https?:/i.test(String(r.avatarUrl || '')) ? String(r.avatarUrl).trim() : '',
      text,
      timeLabel: time.label,
      timeKind: time.kind,
      likeLabel: likes ? likes.label : '',
      likeBand: likes ? likeBandOf(likes.n) : '',
      sentiment: commentSentiment(text),
      lastAt: Number(r.pageAt) > 0 ? Math.floor(Number(r.pageAt)) : 0,
      count: Math.max(1, Math.floor(Number(r.commentCount) || 0) || r.comments.length),
      recentTexts: r.comments.map((/** @type {any} */ x) => String(x?.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 5),
    };
    let cur = bands[bands.length - 1];
    if (!cur || cur.band !== band) {
      cur = { band, hint: '', seats: [] };
      bands.push(cur);
    }
    cur.seats.push(seat);
  }
  for (const b of bands) b.hint = `${BAND_HINTS[b.band]}${b.seats.length.toLocaleString('ja-JP')}人`;
  const seatCount = rows.length;
  const sig = bands
    .map((b) => `${b.band}[${b.seats.map((s) => `${s.key}|${s.text}|${s.timeLabel}|${s.likeLabel}|${s.avatarUrl}|${s.name}`).join('\u0001')}]`)
    .join('\u0002');
  return { bands, seatCount, legend: VIDEO_GRID_LEGEND, sig };
}
