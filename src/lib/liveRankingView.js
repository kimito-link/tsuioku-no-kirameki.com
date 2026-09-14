/**
 * liveRankingView.js — `/live/`「追憶のきらめき ランキング」の純ロジック(DOM を触らない)。
 *
 * ★2026-09-14: ページ内 inline JS から切り出した。式・正規化・検疫は【既存の正本を呼ぶ】:
 *   - 滞留率            → concurrentEstimate.js の retentionRate(式をコピーしない)
 *   - ギフト/広告の行    → kokenContributionRankingApi.js / nicoadContributionRankingApi.js の normalize*
 *   - アイコン URL       → deriveAvatarUrlFromUid.js(AGENTS.md §3.5 の確定パターン)
 *   - HTML/URL の検疫    → htmlText.js
 *   ここに残るのは「このページにしか無い判定」(経過時間の文言・鮮度のしきい値・行の変化追跡)だけ。
 *
 * ■ 入力の形(api/live-ranking.js が保存する 1 配信)
 *   { liveId, title, watchCount, commentCount, beginTime, endTime, watchUrl,
 *     streamer:{ id, name, pageUrl, icon50, icon150 }, thumbnail:{ large, middle, small, micro },
 *     giftTotal, adTotal, gift:{ rankers:[...] }|null, ad:{ ranking:[...] }|null }
 */

import { retentionRate } from './concurrentEstimate.js';
import { normalizeKokenRankingResponse } from './kokenContributionRankingApi.js';
import { normalizeNicoadRankingResponse } from './nicoadContributionRankingApi.js';
import { deriveAvatarUrlFromUid } from './deriveAvatarUrlFromUid.js';
import { safeHttpUrl } from './htmlText.js';
// ★時点(capturedAt)の解釈は timeAuthority.js に委ねる(独自に Number(x.capturedAt) しない。
//   timeAuthorityRegistry の祖父条項=「時点フィールドを独自に持つファイルを増やさない」)。
import { toEpochMs, ageMsOf } from './timeAuthority.js';

/** ニコ生の番組 ID の形。★watch URL は外から来た値ではなく、この形を通った ID から組み立てる。 */
export const LIVE_ID_RE = /^lv\d{6,15}$/i;

/**
 * ★収集が古くなったことを画面で言うしきい値(分)。
 *   根拠(★数字を発明しない): 収集は GitHub Actions の cron で 5 分間隔に設定しているが、
 *   GitHub は負荷分散で実行を遅らせる仕様。★実測(2026-09-05)では 8〜13 分間隔。その 2 倍以上を「異常」とする。
 */
export const STALE_MIN = 30;

/**
 * @param {unknown} liveId
 * @returns {string} '' なら形が違う
 */
export function watchUrlOf(liveId) {
  const id = String(liveId == null ? '' : liveId).trim().toLowerCase();
  return LIVE_ID_RE.test(id) ? `https://live.nicovideo.jp/watch/${id}` : '';
}

/**
 * UNIX 秒 → "HH:MM"(JST 固定。見る人がどこに居ても配信の時計で揃える)。
 * @param {unknown} sec
 * @returns {string}
 */
export function jstClock(sec) {
  const t = Number(sec) || 0;
  if (!t) return '';
  try {
    return new Date(t * 1000).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
  } catch {
    return '';
  }
}

/**
 * 経過時間の文言("2時間54分" / "51分")。開始が無い・未来なら ''。
 * @param {unknown} beginSec UNIX 秒
 * @param {number} nowMs
 * @returns {string}
 */
export function elapsedText(beginSec, nowMs) {
  const b = Number(beginSec) || 0;
  if (!b) return '';
  const m = Math.floor((nowMs / 1000 - b) / 60);
  if (m < 0) return '';
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}時間${m % 60}分` : `${m}分`;
}

/**
 * 収集時刻の鮮度。★しきい値超えは stale:true で明示する(古い値が黙って表示され続けないように)。
 * @param {unknown} capturedAt ms
 * @param {number} nowMs
 * @param {number} [staleMin]
 * @returns {{ text: string, stale: boolean }}
 */
export function freshness(capturedAt, nowMs, staleMin = STALE_MIN) {
  const at = toEpochMs(capturedAt);
  if (!at) return { text: '', stale: false };
  if (at > Number(nowMs)) return { text: '', stale: false };  // ★時計ずれ(未来の時点)。嘘を書くより何も言わない
  const age = ageMsOf(at, nowMs);
  if (age == null) return { text: '', stale: false };
  const min = Math.floor(age / 60000);
  if (min >= staleMin) return { text: `⚠ ${min}分前の情報です（更新が止まっている可能性があります）`, stale: true };
  if (min < 1) return { text: 'たった今 更新', stale: false };
  return { text: `${min}分前 更新`, stale: false };
}

/**
 * 推定同時視聴 = 累計来場 × 滞留率(concurrentEstimate.js の Signal B)。
 * ★ニコ生に同時視聴数の API は無い(同ファイルが実測の末に明記)。beginTime が無ければ fallback 率。
 * @param {{ watchCount?: unknown, beginTime?: unknown }|null|undefined} live
 * @param {number} nowMs
 * @returns {number}
 */
export function estimateConcurrentForLive(live, nowMs) {
  const visitors = Number(live && live.watchCount) || 0;
  if (!visitors) return 0;
  const begin = Number(live && live.beginTime) || 0;
  const ageMin = begin ? (nowMs / 1000 - begin) / 60 : NaN;
  return Math.round(visitors * retentionRate(ageMin));
}

/**
 * 賑わっている順(推定同時視聴の降順)。★元の配列は壊さない。
 * @template T
 * @param {T[]} lives
 * @param {number} nowMs
 * @returns {T[]}
 */
export function sortByEstimatedConcurrent(lives, nowMs) {
  const arr = Array.isArray(lives) ? lives.slice() : [];
  return arr.sort((a, b) => estimateConcurrentForLive(/** @type {any} */ (b), nowMs) - estimateConcurrentForLive(/** @type {any} */ (a), nowMs));
}

/**
 * 同じ URL のまま画像が差し替わるサムネに、収集時刻を付けてキャッシュを割る。
 * @param {string} url
 * @param {unknown} t
 * @returns {string} url が空なら ''
 */
export function cacheBust(url, t) {
  const u = safeHttpUrl(url);
  if (!u) return '';
  return `${u}${u.includes('?') ? '&' : '?'}t=${Number(t) || 0}`;
}

/**
 * ニコ生の「アイコン未設定」プレースホルダ(defaults/blank.jpg)。★実際には読めない
 * (実測: 63枚中4枚が失敗し全部これ)。<img> にすると壊れた画像アイコンが出る。
 * @param {unknown} src
 */
export function isBlankIcon(src) {
  return /\/defaults\/blank\.jpg(\?|$)/.test(String(src == null ? '' : src));
}

/**
 * ニコ生ユーザーページ URL から数値 uid を取り出す(無ければ '')。
 * @param {unknown} url
 * @returns {string}
 */
export function uidFromUserPageUrl(url) {
  const u = safeHttpUrl(url);
  const m = u ? u.match(/\/user\/(\d{1,18})(?:[/?#]|$)/) : null;
  return m ? m[1] : '';
}

/** @typedef {{ rank: number, name: string, point: number, avatar: string, url: string, uid: string }} SupporterRow */

/**
 * 収集ペイロードの gift/ad を、既存の正規化関数を通して画面用の行にする。
 * ★収集側は `gift:{rankers}` / `ad:{ranking}` と生の形で載せている(meta/data の包みは外してある)ので、
 *   正規化関数が期待する `{ data: {...} }` に包み直す(meta は省略可=関数側の仕様)。
 * ★nicoad の正規化は URL を運ばず「アイコン未設定か」だけを運ぶ(v0.1.1307)。アイコンはユーザーページの
 *   UID から確定パターンで導出する(AGENTS.md §3.5)。未設定(hasNoIcon)なら空。
 * @param {{ gift?: any, ad?: any }|null|undefined} live
 * @returns {{ gift: SupporterRow[], ad: SupporterRow[] }}
 */
export function supporterRows(live) {
  const g = live && live.gift && Array.isArray(live.gift.rankers)
    ? normalizeKokenRankingResponse({ data: { rankers: live.gift.rankers } })
    : null;
  const a = live && live.ad && Array.isArray(live.ad.ranking)
    ? normalizeNicoadRankingResponse({ data: { ranking: live.ad.ranking } })
    : null;
  const gift = (g || []).map((r) => {
    const url = safeHttpUrl(r.userPageUrl);
    return {
      rank: r.rank,
      name: r.name,
      point: r.contribution,
      avatar: safeHttpUrl(r.thumbnailUrl),
      url,
      uid: uidFromUserPageUrl(url)
    };
  });
  const ad = (a || []).map((r) => {
    const url = safeHttpUrl(r.userPageUrl);
    const uid = uidFromUserPageUrl(url);
    return {
      rank: r.rank,
      name: r.name,
      point: r.contribution,
      avatar: r.hasNoIcon || !uid ? '' : deriveAvatarUrlFromUid(uid),
      url,
      uid
    };
  });
  return { gift, ad };
}

/** @typedef {{ uid: string, name: string, avatar: string, url: string, giftPt: number, adPt: number, total: number }} IdentifiedSupporter */

/**
 * ★「身元が分かっている応援した人」= 数値ユーザーID と個人サムネの【両方】が揃った人だけ。
 *   サイドパネルの「アイコン列」と同じ基準(AGENTS.md §3.5: サムネ・ID・名前・リンクをセットで出す。
 *   匿名や、ID はあるがアイコン未設定の人はこの枠に載せない=下の通常の順位表に残る)。
 *   ギフトと広告の両方に居る人は uid で1人にまとめ、ポイントは種別ごとに持つ。並びは合計の降順。
 * @param {{ gift?: any, ad?: any }|null|undefined} live
 * @returns {IdentifiedSupporter[]}
 */
export function identifiedSupporters(live) {
  const { gift, ad } = supporterRows(live);
  /** @type {Map<string, IdentifiedSupporter>} */
  const byUid = new Map();
  /** @param {SupporterRow} r @param {'gift'|'ad'} kind */
  const put = (r, kind) => {
    if (!r.uid || !r.avatar || isBlankIcon(r.avatar)) return;
    const cur = byUid.get(r.uid) || { uid: r.uid, name: r.name, avatar: r.avatar, url: r.url, giftPt: 0, adPt: 0, total: 0 };
    if (kind === 'gift') cur.giftPt += Number(r.point) || 0; else cur.adPt += Number(r.point) || 0;
    cur.total = cur.giftPt + cur.adPt;
    byUid.set(r.uid, cur);
  };
  for (const r of gift) put(r, 'gift');
  for (const r of ad) put(r, 'ad');
  return Array.from(byUid.values()).sort((x, y) => y.total - x.total);
}

/**
 * 「前回から何が変わったか」を行ごとに出す追跡器。
 * ★変わっていない行は光らせない(全部光らせると「動いて見える」だけの嘘になる)。
 * ★描画のたびに begin()→classFor()×N→end() と呼ぶ。end() で今回出なかったキーを捨てる
 *   (開きっぱなしのタブで記録が青天井に増えるのを防ぐ。実測で 248→248 に安定)。
 * ★初回描画では全行が「新規」になってしまうので、初回は '' を返す。
 * @returns {{ begin: () => void, classFor: (key: string, point: number) => ('' | 'is-new' | 'is-bumped'), end: () => void }}
 */
export function createRowChangeTracker() {
  /** @type {Record<string, number>} */
  let prev = Object.create(null);
  /** @type {Record<string, true>} */
  let seen = Object.create(null);
  /** @type {Record<string, number>|null} */
  let touched = null;
  let firstPaint = true;
  return {
    begin() { touched = Object.create(null); },
    classFor(key, point) {
      const p = prev[key];
      prev[key] = point;
      if (touched) touched[key] = point;
      if (firstPaint) { seen[key] = true; return ''; }
      if (!seen[key]) { seen[key] = true; return 'is-new'; }
      return (p !== undefined && point > p) ? 'is-bumped' : '';
    },
    end() {
      if (touched) {
        prev = touched;
        seen = Object.create(null);
        for (const k of Object.keys(touched)) seen[k] = true;
      }
      touched = null;
      firstPaint = false;
    }
  };
}

/**
 * 行のキー("lv|種別|名前")。名前が同じなら同じ人として追跡する(ID は匿名で欠けるため名前を使う)。
 * @param {string} liveId
 * @param {'gift'|'ad'} kind
 * @param {{ name?: unknown }} r
 */
export function rowKey(liveId, kind, r) {
  return `${liveId}|${kind}|${String(r && r.name ? r.name : '')}`;
}

/**
 * ★シェア本文の長さの上限(コードポイント単位)。
 *   固定部の最大 16 字と合わせても SHARE_TEXT_MAX に構造的に収まる値を選んである
 *   (18+15+24=57 / 16+24=40 / 18+13=31 / 14。テストが 4 分岐の最大長を固定している)。
 */
export const SHARE_NAME_MAX = 18;
export const SHARE_TITLE_MAX = 24;
export const SHARE_TEXT_MAX = 60;

/**
 * シェアされた `?lv=` の配信を一覧の先頭に固定する。★状態を持たない(呼ぶたびに判定)。
 * 並びは「賑わい順を作ってから 1 件を先頭へ」の順で合成する(逆だと sort が pin を壊す)。
 * @template {{ liveId?: unknown }} T
 * @param {T[]} lives
 * @param {unknown} lv
 * @returns {{ lives: T[], found: boolean }} 不正な lv・不在なら恒等(コピー)で found:false
 */
export function pinLiveFirst(lives, lv) {
  const arr = Array.isArray(lives) ? lives.slice() : [];
  const id = String(lv ?? '').trim().toLowerCase();
  if (!LIVE_ID_RE.test(id)) return { lives: arr, found: false };
  const at = arr.findIndex((l) => String((l && l.liveId) ?? '').trim().toLowerCase() === id);
  if (at < 0) return { lives: arr, found: false };
  const [hit] = arr.splice(at, 1);
  arr.unshift(hit);
  return { lives: arr, found: true };
}

/**
 * 文字列を 1 行に正規化して、コードポイント単位で切り詰める(サロゲートペアを割らない)。
 * @param {unknown} v
 * @param {number} max
 * @returns {string}
 */
function trimTo(v, max) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  const cp = Array.from(s);
  return cp.length > max ? `${cp.slice(0, max - 1).join('')}…` : s;
}

/**
 * シェアの下書き本文。★中立(誰が押しても成立する見出し体)・数値と時刻を入れない
 *   (投稿した瞬間に古くなる値は載せない)。材料は配信者名と番組名だけ。
 * @param {{ streamer?: { name?: unknown }|null, title?: unknown }|null|undefined} live
 * @returns {string}
 */
export function liveShareText(live) {
  const name = trimTo(live && live.streamer ? live.streamer.name : '', SHARE_NAME_MAX);
  const title = trimTo(live ? live.title : '', SHARE_TITLE_MAX);
  if (name && title) return `${name}の配信「${title}」を、いま支えている人`;
  if (title) return `この配信「${title}」を、いま支えている人`;
  if (name) return `${name}の配信を、いま支えている人`;
  return 'この配信を、いま支えている人';
}
