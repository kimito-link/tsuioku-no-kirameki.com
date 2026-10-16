/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】「この人は実際に発言したか」の証拠(実コメント数・最終発言時刻・本文)の型と正規化・合流
 * 【この箱に入らないもの】表示の文言(venueHoverCard.js)・どの出所を採るかの優先順(venueHoverFacts.js)・DOM・storage
 * 【書けるstorageキー】なし
 * 【正本宣言】「何を発言の証拠と認めるか」はこのファイルのみ
 *
 * ★なぜ(2026-10-16・会場ホバーカードで「発言 1(たった今)・いま喋っている」なのにセリフが無い人): 原因は2系統。
 *   (A) 発言していない広告/ギフト支援者に、件数 Math.max(1,…)・鏡の発行時刻(fallbackAt)で「発言1・たった今」が【捏造】される。
 *       守りは段名(tier ad/gift)の例外処理だけで、v1620(支援者をりんく段へ昇格)で効かなくなった。
 *   (B) 実際に発言した人の本文が、差分集計(mergeUserLaneAggregates)・名簿の hydrate で落ちる。
 *   構造的な真因 = 人物の行が「発言の証拠」を型として持たず、UI が段名で嘘を抑えていた。
 *   → 行に `speech: SpeechEvidence` を持たせ、UI は【証拠が無ければ「発言」を一切出さない】(段名は見ない)。
 *   設計: docs/handoff/person-evidence-SPEC-2026-10-16.md(MAP も同じ場所)。
 *
 * ■ 型
 *   comments: number|null  … 実コメント行数。null=不明 / 0=数えた結果ゼロ / n>0=有り
 *   lastAt:   number|null  … 最終【発言】時刻(ms)。証拠が無ければ null(鏡の発行時刻・lastSeen・capturedAt を入れない)
 *   texts:    string[]     … 本文(新しい順・最大 RECENT_TEXT_KEEP)
 *
 * ■ 掟(変異テストで固定)
 *   - ★このファイルに `Math.max(1` を書かない(0 や「不明」を 1 にする下駄が嘘の根)。
 *   - texts から件数を捏造しない(comments は null のまま)。comments===0 && texts>0 の矛盾は null(不明)へ倒す。
 *   - 鏡セル(FromMirrorCell)は時刻を作らない(capturedAt を受け取らない)。
 * @module speechEvidence
 */

import { RECENT_TEXT_KEEP } from './recentTextRing.js';
import { toEpochMs } from './timeAuthority.js'; // 時点の解釈は正本(timeAuthority)へ委譲する

/** @typedef {{ comments: number|null, lastAt: number|null, texts: readonly string[] }} SpeechEvidence */

/** 不明(何も言えない)。 */
export const SPEECH_UNKNOWN = Object.freeze(
  /** @type {SpeechEvidence} */ ({ comments: null, lastAt: null, texts: Object.freeze([]) })
);

/** @param {unknown} v @returns {string[]} 非空の本文だけ・空白正規化・上限 */
function toTexts(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const raw of v) {
    if (out.length >= RECENT_TEXT_KEEP) break;
    const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out;
}

/** @param {unknown} v @returns {number|null} 有限数なら 0 以上の整数、それ以外 null */
function toCount(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

/** @param {unknown} v @returns {number|null} 有効な時点(>0)のときだけ(0 や不正は「時刻なし」) */
function toAt(v) {
  // 数として読めるものは数のまま(負・0 は時刻なし)。★toEpochMs は Date.parse に落ちるので -5 を過去の日付にしてしまう(timeAuthority.js の注記)。
  const num = Number(v);
  if (v != null && v !== '' && Number.isFinite(num)) return num > 0 ? Math.floor(num) : null;
  const n = toEpochMs(v); // ISO 文字列など数でないものだけ正本へ委譲
  return n > 0 ? Math.floor(n) : null;
}

/**
 * 正規化の関所(全ての出所はここを通す)。
 * @param {{ comments?: unknown, lastAt?: unknown, texts?: unknown }|null|undefined} input
 * @returns {SpeechEvidence}
 */
export function speechEvidence(input) {
  const texts = toTexts(input?.texts);
  let comments = toCount(input?.comments);
  // 矛盾(0件なのに本文がある)は【不明】へ倒す。本文の件数から件数を作らない(捏造しない)。
  if (comments === 0 && texts.length > 0) comments = null;
  const lastAt = toAt(input?.lastAt);
  return Object.freeze({ comments, lastAt, texts: Object.freeze(texts) });
}

/**
 * 発言の証拠があるか。UI が「発言」を出してよい唯一の条件。
 * @param {SpeechEvidence|null|undefined} e
 */
export function hasSpeech(e) {
  if (!e) return false;
  return (Number(e.comments) > 0) || (Array.isArray(e.texts) && e.texts.length > 0);
}

/**
 * 2つの証拠を合流する(同じ人の複数の行)。
 * comments: 両方 null→null / 片方以上既知→既知の和。lastAt: null-safe max。texts: newer の非空を優先、無ければ older。
 * @param {SpeechEvidence|null|undefined} older
 * @param {SpeechEvidence|null|undefined} newer
 * @returns {SpeechEvidence}
 */
export function mergeSpeechEvidence(older, newer) {
  const a = older || SPEECH_UNKNOWN;
  const b = newer || SPEECH_UNKNOWN;
  const comments = a.comments == null && b.comments == null ? null : (a.comments || 0) + (b.comments || 0);
  const lastAt = a.lastAt == null ? b.lastAt : b.lastAt == null ? a.lastAt : Math.max(a.lastAt, b.lastAt);
  const texts = b.texts.length ? b.texts : a.texts;
  return speechEvidence({ comments, lastAt, texts });
}

/**
 * storage 集計の候補(userLaneCandidatesFromStorage の出力)から。
 * @param {{ commentCount?: unknown, _laneSortAt?: unknown, recentTexts?: unknown }|null|undefined} c
 * @returns {SpeechEvidence}
 */
export function speechEvidenceFromCandidate(c) {
  if (!c || typeof c !== 'object') return SPEECH_UNKNOWN;
  const comments = toCount(c.commentCount);
  return speechEvidence({
    comments,
    // 件数が正のときだけ最終発言時刻とみなす(0 件の候補の _laneSortAt は発言の時刻ではない)。
    lastAt: comments != null && comments > 0 ? c._laneSortAt : null,
    texts: c.recentTexts
  });
}

/**
 * 鏡のセルから。★時刻は作らない(鏡の発行時刻は「居る」の根拠であって「発言した」根拠ではない)。
 * @param {{ stats?: { c?: unknown, commentCount?: unknown }, recentTexts?: unknown }|null|undefined} cell
 * @returns {SpeechEvidence}
 */
export function speechEvidenceFromMirrorCell(cell) {
  if (!cell || typeof cell !== 'object') return SPEECH_UNKNOWN;
  const st = cell.stats && typeof cell.stats === 'object' ? cell.stats : null;
  const c = toCount(st?.c ?? st?.commentCount);
  return speechEvidence({
    comments: c != null && c > 0 ? c : null, // 0 は「数えていない/落ちた」と区別できない(positiveOrNull)=不明
    lastAt: null,
    texts: cell.recentTexts
  });
}

/**
 * 在席名簿(venueLiveRoster の RosterEntry)から。
 * @param {{ commentCount?: unknown, realComments?: unknown, lastTextAt?: unknown, lastSeen?: unknown, recentTexts?: unknown, lastText?: unknown }|null|undefined} e
 * @returns {SpeechEvidence}
 */
export function speechEvidenceFromRoster(e) {
  if (!e || typeof e !== 'object') return SPEECH_UNKNOWN;
  // realComments(実際に本文を受けた回数)があればそれを使う。commentCount は hydrate で最低1の下駄が付くので発言の根拠にしない。
  const comments = toCount('realComments' in e ? e.realComments : e.commentCount);
  const texts = toTexts(Array.isArray(e.recentTexts) && e.recentTexts.length ? e.recentTexts : e.lastText ? [e.lastText] : []);
  const lastTextAt = toAt(e.lastTextAt);
  return speechEvidence({
    comments,
    // lastTextAt(本文行を受けた時刻)があればそれ。無い旧エントリは件数が正のときだけ lastSeen を使う。
    lastAt: lastTextAt != null ? lastTextAt : comments != null && comments > 0 ? e.lastSeen : null,
    texts
  });
}

/**
 * 生の発言行(本文つき・preCount 等の集約情報が無い行)から。本文があれば1件の発言。
 * @param {{ text?: unknown, capturedAt?: unknown, isGift?: unknown }|null|undefined} r
 * @returns {SpeechEvidence}
 */
export function speechEvidenceFromRow(r) {
  if (!r || typeof r !== 'object') return SPEECH_UNKNOWN;
  const text = String(r.text ?? '').trim();
  if (!text || r.isGift === true) return SPEECH_UNKNOWN;
  return speechEvidence({ comments: 1, lastAt: r.capturedAt, texts: [text] });
}

/**
 * 証拠の本文が空で、別の出所(鏡のセルなど)が本文を持っているとき、【本文だけ】を借りる。
 * 件数・時刻は借りない(数と本文を別々の出所から混ぜて捏造しないため)。
 * @param {SpeechEvidence|null|undefined} base
 * @param {unknown} fallbackTexts
 * @returns {SpeechEvidence}
 */
export function speechWithFallbackTexts(base, fallbackTexts) {
  const b = base || SPEECH_UNKNOWN;
  if (b.texts.length > 0 || !Array.isArray(fallbackTexts) || fallbackTexts.length === 0) return b;
  return speechEvidence({ comments: b.comments, lastAt: b.lastAt, texts: fallbackTexts });
}
