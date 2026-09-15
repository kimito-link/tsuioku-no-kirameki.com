/**
 * liveOgHtml.js — 配信ごとの OGP カード用の最小 HTML を組み立てる純関数(v0.1.1517)。
 *
 * ★DOM も fetch も持たない。1 配信ぶんの保存データ(api/live-ranking.js が SET したもの)を
 *   渡すと、og:* / twitter:* を並べた完全な HTML 文字列を返すだけ。テストは HTML 文字列を検査する。
 *
 * ■ 何を出すか / 出さないか(設計 §5〜§10)
 *   - 出す: 番組名・配信者名・配信サムネ URL(いずれもニコ生が公開している 3 点)。
 *   - 出さない: 支援者名・コメント本文・数値(来場/pt)。buildLiveOgHtml の入力に
 *     gift/ad/comment を渡さない設計なので、そもそも材料が無い。
 *   - リダイレクトを一切含めない(スクリプト実行も meta refresh も無し)。
 *     ループ回避は「目印パラメータ」ではなく「リダイレクトが無いこと」で担保する(設計 §5.4)。
 *     ★この禁止は静的検査でも守る(設計 §12-3 が本ファイルにリダイレクト用トークンが
 *       1 つも無いことを数える)。だから本コメントにもそれらの語を書かない。
 *
 * ■ 全 content は escapeHtml、URL は safeHttpUrl を通す。サムネが取れない/不正なら
 *   フォールバック PNG(第1段の生成物)に倒す(AGENTS.md §3.6 fail-soft)。
 *
 * @module liveOgHtml
 */

import { escapeHtml, safeHttpUrl } from './htmlText.js';
import { liveOgTitle, LIVE_ID_RE } from './liveRankingView.js';
import { liveOgDescription } from './liveOgStats.js';

/** カードの絶対 URL を組み立てる基点。 */
export const LIVE_OG_ORIGIN = 'https://tsuioku-no-kirameki.com';
/** サムネが取れないときの汎用カード画像(第1段の生成物・実在)。 */
export const LIVE_OG_FALLBACK_IMAGE = 'https://tsuioku-no-kirameki.com/images/og-live-ranking.png';
/**
 * description(live なしのとき用・配信で変えない・支援者名/数値なし)。
 * ★live ありのときは liveOgDescription(live) が数字入りの文を作る(v0.1.1518)。
 *   この定数は liveOgStats.liveOgDescription が live なしで返す文と同文(向こうが正本)。
 */
export const LIVE_OG_DESCRIPTION =
  'いまこの瞬間、この配信をギフト・広告・コメントで支えている人を、配信サムネ・配信者つきでリアルタイムに。主役は配信者ではなく「応援した人」。';
/** site_name(/live/index.html:24 と同文)。 */
const LIVE_OG_SITE_NAME = '追憶のきらめき ランキング';
/** サムネ URL パスの寸法を読む正本の形(実 URL 例 …/thumbnail-854x480/screenshot.jpg)。 */
const THUMBNAIL_SIZE_RE = /thumbnail-(\d{1,5})x(\d{1,5})/;

/**
 * 正規化された lv(不正なら '')。og:url を組み立てる前に必ず通す。
 * @param {unknown} lv
 * @returns {string}
 */
function normalizeLv(lv) {
  const id = String(lv == null ? '' : lv).trim().toLowerCase();
  return LIVE_ID_RE.test(id) ? id : '';
}

/**
 * サムネ URL(safeHttpUrl 済み)からパスの寸法を読む。読めなければ null。
 * @param {string} imageUrl
 * @returns {{ width: number, height: number }|null}
 */
function thumbnailSize(imageUrl) {
  const m = String(imageUrl || '').match(THUMBNAIL_SIZE_RE);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * 配信ごとの OGP カード用 HTML を返す。
 * ★live が null/不在/不正でも汎用カードを 200 で返せる形にする(呼び出し側は例外を live=null に倒す)。
 * @param {{ lv?: unknown, live?: any }} [input]
 * @returns {string} 完全な HTML 文字列
 */
export function buildLiveOgHtml(input) {
  const lv = normalizeLv(input && input.lv);
  const live = input && input.live && typeof input.live === 'object' ? input.live : null;

  const title = liveOgTitle(live);
  // twitter:image:alt 用の素材(取れなければ空)。
  const name = live && live.streamer ? String(live.streamer.name == null ? '' : live.streamer.name).trim() : '';
  const programTitle = live ? String(live.title == null ? '' : live.title).trim() : '';

  // og:image = 配信サムネ(large)。safeHttpUrl を通らなければフォールバック PNG(設計 §7)。
  const thumbLarge = live && live.thumbnail ? safeHttpUrl(live.thumbnail.large) : '';
  const image = thumbLarge || LIVE_OG_FALLBACK_IMAGE;
  const isFallback = image === LIVE_OG_FALLBACK_IMAGE;
  // 寸法はサムネ URL のパスから読めたときだけ(数字を発明しない)。フォールバック PNG では出さない。
  const size = isFallback ? null : thumbnailSize(image);
  // image:type はサムネ=jpeg / フォールバック=png(1 パターンに絞る)。
  const imageType = isFallback ? 'image/png' : 'image/jpeg';

  // og:url は取得された URL と同じにする(FB 系は og:url が違うと再取得する・設計 §5.3)。
  // lv が正で live があるなら配信ごと URL、そうでなければ静的ページと同じ /live/ へ収束。
  const url = lv && live ? `${LIVE_OG_ORIGIN}/live/?lv=${lv}` : `${LIVE_OG_ORIGIN}/live/`;

  const altText = name && programTitle
    ? `${name}の配信「${programTitle}」の配信画面`
    : (name ? `${name}の配信画面` : '追憶のきらめき ランキングの配信サムネ');

  const t = escapeHtml(title);
  // live ありなら数字入りの description、なしなら現行の汎用文(liveOgStats が正本)。
  const desc = escapeHtml(liveOgDescription(live));
  const img = escapeHtml(image);
  const ogUrl = escapeHtml(url);
  const alt = escapeHtml(altText);
  const site = escapeHtml(LIVE_OG_SITE_NAME);
  const imgType = escapeHtml(imageType);

  const dims = size
    ? `<meta property="og:image:width" content="${escapeHtml(String(size.width))}"><meta property="og:image:height" content="${escapeHtml(String(size.height))}">`
    : '';

  // ★リダイレクト(スクリプト実行・meta refresh)は一切含めない(設計 §5.4)。body は最小の一言 + リンクだけ。
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">` +
    `<title>${t}</title><meta name="robots" content="noindex">` +
    `<meta property="og:type" content="website"><meta property="og:site_name" content="${site}">` +
    `<meta property="og:url" content="${ogUrl}">` +
    `<meta property="og:title" content="${t}"><meta property="og:description" content="${desc}">` +
    `<meta property="og:image" content="${img}"><meta property="og:image:type" content="${imgType}">` +
    dims +
    `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${img}">` +
    `<meta name="twitter:image:alt" content="${alt}">` +
    `</head><body><p>${t}</p>` +
    `<p><a href="${ogUrl}">追憶のきらめき ランキングで、いま支えている人を見る</a></p>` +
    `</body></html>`;
}
