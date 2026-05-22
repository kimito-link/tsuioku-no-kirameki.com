/**
 * 北極星 レーン 1「貢献度ランキング」専用の縦リスト HTML 生成 純関数。
 *
 * 設計意図（v0.1.287, Antigravity §6.2 を「3 年後楽」路線で実装）:
 *
 *   1) DOM 操作・I/O ゼロの純関数。popup-entry.js の refresh 関数は本関数の戻り
 *      文字列を `el.innerHTML` に流し込むだけ＝unit test で HTML 構造を構造的に
 *      固定できる（3 年後に誰かが装飾を壊しても test 落ちで検出）。
 *
 *   2) 既存の応援帯描画 `paintTopSupportRankStyleIntoElement()` には一切触らず、
 *      新 CSS クラス `nl-contrib-ranking-list*` 系を完全独立で導入。adRanking /
 *      giftHistory レーンの横スクロール表示は不変＝回帰リスクゼロ。
 *
 *   3) 入力は `topSupportRankLineModels()` の戻り（TopSupportRankLineModel[]）を
 *      そのまま受け取る＝経路ロジック（kokenContributionRankingApi / DOM bundle /
 *      iframe storage の優先度判定 = officialContributionRankingResolver.js）と
 *      表現ロジック（本ファイル）が責務分離されている。
 *
 *   4) 1-3 位の金/銀/銅装飾は CSS class の付与だけで実現。HTML 構造は全行
 *      同一＝CSS 変数で themed＝3 年後の配色変更も CSS 1 箇所修正で済む。
 *
 * 報告書 §1.2 目標仕様:
 *   ┌────────────────────────────┐
 *   │ 貢献度ランキング              │
 *   ├────────────────────────────┤
 *   │ ❶ フロア熱狂 さん     5,105 貢│ ← 1-3 位は金/銀/銅 tier
 *   │ ❷ めっちゃんこ... さん 2,575 貢│
 *   │ ❸ 310 さん            600 貢 │
 *   │ 4  あああ さん         110 貢 │ ← 4 位以降は normal tier
 *   │ ... (上限 10 位、resolver 側で slice 済)
 *   └────────────────────────────┘
 */

import { isHttpOrHttpsUrl, isAnonymousStyleNicoUserId } from './supportGrowthTileSrc.js';

/**
 * @typedef {import('./topSupportRankStripLines.js').TopSupportRankLineModel} TopSupportRankLineModel
 */

/**
 * 順位番号から tier（金/銀/銅/通常）を決める純関数。
 *
 * tier は CSS class suffix としてそのまま使う。既定の閾値は 1-3 が gold/silver/bronze、
 * 4 以降 normal。`opts.topTierThreshold` で閾値を上下できる（3 年後に「上位 5 位を
 * gold 系」等に変更したくなった時の拡張点）。
 *
 * @param {number|null} placeNumber 1-indexed
 * @param {{ topTierThreshold?: number }} [opts]
 * @returns {'gold'|'silver'|'bronze'|'normal'|'empty'}
 */
export function tierForRank(placeNumber, opts) {
  if (typeof placeNumber !== 'number' || !Number.isFinite(placeNumber) || placeNumber <= 0) {
    return 'empty';
  }
  const threshold =
    typeof opts?.topTierThreshold === 'number' &&
    Number.isFinite(opts.topTierThreshold) &&
    opts.topTierThreshold >= 0
      ? Math.floor(opts.topTierThreshold)
      : 3;
  if (placeNumber === 1 && threshold >= 1) return 'gold';
  if (placeNumber === 2 && threshold >= 2) return 'silver';
  if (placeNumber === 3 && threshold >= 3) return 'bronze';
  return 'normal';
}

/**
 * HTML 属性値 / テキストコンテンツ用 escape（外部依存ゼロでテスト容易化）。
 *
 * popup-entry.js の `escapeHtml` / `escapeAttr` と同一仕様（&<>"'）。本ファイルが
 * 単体 unit test で完結するように内部に持つ＝テストフレームワーク側でモック不要。
 *
 * @param {string} s
 * @returns {string}
 */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 数値のカンマ区切り（ja-JP 規約）。
 *
 * 既存応援帯は `${m.count}${unitSuffix}` で「5105 貢」と非区切り表示だが、
 * 公式貢献度ランキングは桁が大きく可読性が顕著に落ちる（実機 lv350553787 で
 * 1 位 5,105 が「5105」と表示されていた）ため、本リストでは toLocaleString()
 * で「5,105」に整形する。
 *
 * @param {number} n
 * @returns {string}
 */
function formatPt(n) {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  try {
    return v.toLocaleString('ja-JP');
  } catch {
    return String(v);
  }
}

/**
 * 1 行分の HTML を組み立てる内部純関数。
 *
 * @param {TopSupportRankLineModel} m
 * @param {{
 *   unitSuffix: string,
 *   nameSuffix: string,
 *   defaultThumbSrc: string,
 *   topTierThreshold?: number,
 *   showThumb: boolean
 * }} opts
 * @returns {string}
 */
function buildRowHtml(m, opts) {
  const tier = tierForRank(m.placeNumber, { topTierThreshold: opts.topTierThreshold });
  const rowClasses = [
    'nl-contrib-ranking-list__row',
    `nl-contrib-ranking-list__row--tier-${tier}`,
    m.isUnknown ? 'nl-contrib-ranking-list__row--unknown' : ''
  ]
    .filter(Boolean)
    .join(' ');

  // 順位番号: 1-3 位は medal 風アイコン文字（CSS で見せ方を変える）、4+ は素の数字。
  // 「empty」は順位 null（未取得行）＝ '—' を出す。
  let rankText;
  if (tier === 'gold') rankText = '1';
  else if (tier === 'silver') rankText = '2';
  else if (tier === 'bronze') rankText = '3';
  else if (tier === 'empty') rankText = '—';
  else rankText = String(m.placeNumber);

  // 名前: 「さん」suffix は未取得行には付けない。既存 nameLine が「—」「（未取得）」
  // のときは suffix 無しで透過表示。
  const isNameEmpty = m.isUnknown || m.nameLine === '—' || m.nameLine === '（未取得）';
  const nameSuffix = isNameEmpty ? '' : opts.nameSuffix;
  const nameInner = `${escHtml(m.nameLine)}${escHtml(nameSuffix)}`;
  // v0.1.316: userKey が実数値 uid（公式 API の userPageUrl 由来）のときだけ、
  // 名前を niconico ユーザーページへのリンクにする。匿名・合成キー・未取得行は
  // isAnonymousStyleNicoUserId が true を返すのでリンク化しない（推測ゼロ・公式提供分のみ）。
  const linkable = !m.isUnknown && !isAnonymousStyleNicoUserId(m.userKey);
  const nameHtml = linkable
    ? `<a class="nl-contrib-ranking-list__name-link" href="https://www.nicovideo.jp/user/${escHtml(
        m.userKey
      )}" target="_blank" rel="noopener noreferrer">${nameInner}</a>`
    : nameInner;

  // pt: カンマ区切り + unit suffix（'貢' 等）。数値を主役にし単位は弱める span で包む。
  const unit = String(opts.unitSuffix || '').trim();
  const unitHtml = unit
    ? ` <span class="nl-contrib-ranking-list__pt-unit">${escHtml(unit)}</span>`
    : '';
  const ptHtml = `${escHtml(formatPt(m.count))}${unitHtml}`;

  // 行 title（hover で full label）。
  const titleAttr = m.fullLabelForTitle ? escHtml(m.fullLabelForTitle) : '';

  const thumbHtml = opts.showThumb
    ? (() => {
        const src = String(m.thumbSrc || opts.defaultThumbSrc || '').trim();
        const rp = isHttpOrHttpsUrl(src) ? ' referrerpolicy="no-referrer"' : '';
        return `<span class="nl-contrib-ranking-list__thumb-wrap"><img class="nl-contrib-ranking-list__thumb" src="${escHtml(
          src
        )}" alt="" decoding="async"${rp} /></span>`;
      })()
    : '';

  return (
    `<div class="${rowClasses}" role="listitem" title="${titleAttr}" data-tier="${tier}">` +
    `<span class="nl-contrib-ranking-list__rank" aria-label="第${escHtml(String(m.placeNumber ?? '—'))}位">${escHtml(rankText)}</span>` +
    thumbHtml +
    `<span class="nl-contrib-ranking-list__name">${nameHtml}</span>` +
    `<span class="nl-contrib-ranking-list__pt">${ptHtml}</span>` +
    `</div>`
  );
}

/**
 * 縦リスト全体の HTML を組み立てる最上位純関数。
 *
 * 出力構造（CSS は popup.html の `<style>` に同時加法済 = nl-contrib-ranking-list*）:
 *   <section class="nl-contrib-ranking-list" role="list" aria-label="貢献度ランキング">
 *     <p class="nl-contrib-ranking-list__note">…説明…</p>
 *     <div class="nl-contrib-ranking-list__row nl-contrib-ranking-list__row--tier-gold" ...>
 *       <span class="nl-contrib-ranking-list__rank">1</span>
 *       <span class="nl-contrib-ranking-list__thumb-wrap"><img ... /></span>
 *       <span class="nl-contrib-ranking-list__name">フロア熱狂 さん</span>
 *       <span class="nl-contrib-ranking-list__pt">5,105 貢</span>
 *     </div>
 *     ...
 *   </section>
 *
 * @param {TopSupportRankLineModel[]} models - `topSupportRankLineModels()` の戻り
 * @param {{
 *   noteText: string,
 *   ariaLabel: string,
 *   unitSuffix: string,
 *   defaultThumbSrc: string,
 *   nameSuffix?: string,
 *   showThumb?: boolean,
 *   topTierThreshold?: number
 * }} opts
 * @returns {string} 全体 HTML 文字列（空 models のときは note のみの空リスト）
 */
export function buildContributionRankingListHtml(models, opts) {
  const list = Array.isArray(models) ? models : [];
  const o = {
    unitSuffix: String(opts?.unitSuffix ?? ''),
    nameSuffix: String(opts?.nameSuffix ?? ' さん'),
    defaultThumbSrc: String(opts?.defaultThumbSrc ?? ''),
    showThumb: opts?.showThumb !== false,
    topTierThreshold: opts?.topTierThreshold,
    noteText: String(opts?.noteText ?? ''),
    ariaLabel: String(opts?.ariaLabel ?? '貢献度ランキング')
  };
  const rowsHtml = list.map((m) => buildRowHtml(m, o)).join('');
  const noteHtml = o.noteText
    ? `<p class="nl-contrib-ranking-list__note">${escHtml(o.noteText)}</p>`
    : '';
  return (
    `<section class="nl-contrib-ranking-list" role="list" aria-label="${escHtml(o.ariaLabel)}">` +
    noteHtml +
    `<div class="nl-contrib-ranking-list__rows">${rowsHtml}</div>` +
    `</section>`
  );
}
