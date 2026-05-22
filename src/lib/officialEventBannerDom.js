/**
 * niconico の watch ページに描画される「○○さんが参加しています！」グリーンバナーから
 * 配信者のイベント参加情報（順位 / スコア / イベント名 / アイコン / リンク）を掬う純関数。
 *
 * niconico 側の実 DOM 構造（2026-05 時点で確認）:
 *
 *   <a class="wrapper" href="https://audition.nicovideo.jp/embedded/richview/live?content_id=lv...">
 *     <p class="owner-name">○○さんが参加しています！</p>
 *     <div class="info">
 *       <div class="image">
 *         <img class="thumbnail" src="..." alt="...">
 *       </div>
 *       <div class="text">
 *         <div class="name-wrapper">
 *           <p class="marquee-target">
 *             <span class="name">クリエイターズギフトスタジオで使える！...</span>
 *           </p>
 *         </div>
 *         <p class="status">
 *           <span class="rank-field"> 現在 <strong class="rank-num">2</strong> 位 </span>
 *           <span class="score"><svg ...></svg> 207,835</span>
 *         </p>
 *       </div>
 *     </div>
 *   </a>
 *
 * Vue scoped 属性（`data-v-4ab3c338`）は無視。class 名は静的なのでそのまま使う。
 * 「さんが参加しています」というテキストで対象を識別し、誤認を避ける。
 */

import {
  pickAdvertiserAvatarUrlFromGiftHistoryLi,
  resolveGiftHistoryGiftImageEl
} from './scrapeGiftHistoryList.js';

/**
 * @typedef {{
 *   rank: number|null,
 *   score: number|null,
 *   title: string,
 *   iconUrl: string,
 *   ownerText: string,
 *   href: string
 * }} OfficialEventBannerData
 */

/**
 * @param {Document|Element} root
 * @returns {OfficialEventBannerData|null} バナーが見つからないときは null
 */
export function scrapeOfficialEventBannerFromDom(root) {
  if (!root) return null;
  /** @type {Document} */
  const doc =
    /** @type {any} */ (root).nodeType === 9
      ? /** @type {Document} */ (root)
      : (/** @type {Element} */ (root).ownerDocument || document);
  const base = /** @type {any} */ (root).nodeType === 9 ? doc : root;
  /** @type {HTMLElement|null} */
  let wrapper = null;
  try {
    /** @type {NodeListOf<HTMLElement>|Element[]} */
    let owners =
      /** @type {any} */ (base).querySelectorAll?.('.owner-name') ||
      doc.querySelectorAll('.owner-name');
    if (!owners || owners.length === 0) {
      // CSS Modules ハッシュ化対応
      owners =
        /** @type {any} */ (base).querySelectorAll?.('[class*="owner-name"]') ||
        doc.querySelectorAll('[class*="owner-name"]');
    }
    for (const el of owners) {
      if (!(el instanceof HTMLElement)) continue;
      const t = String(el.textContent || '');
      if (!/(?:さんが|が)参加(?:しています|中)?/.test(t)) continue;
      const a = el.closest && el.closest('a');
      const w = (a instanceof HTMLElement ? a : el.parentElement) || null;
      if (w instanceof HTMLElement) {
        wrapper = w;
        break;
      }
    }
  } catch {
    return null;
  }
  // v0.1.319: 旧 `.owner-name`「参加しています」wrapper が無い場合、audition iframe の
  // 新 CSS-modules DOM（「<配信者>さんを応援しよう！」+「現在N位」）から取得を試みる。
  if (!wrapper) return scrapeEventBannerFromNewAuditionDom(base, doc);

  /**
   * simple class selector を試し、空なら CSS Modules ハッシュ化用の partial match に
   * フォールバックする querySelector ヘルパ。
   * @param {string} simpleSel
   * @param {string} fragment
   * @param {string} [excludeFragment]
   */
  const q2 = (simpleSel, fragment, excludeFragment) => {
    try {
      const r = wrapper.querySelector(simpleSel);
      if (r) return r;
    } catch { /* no-op */ }
    if (!fragment) return null;
    try {
      const sel = excludeFragment
        ? `[class*="${fragment}"]:not([class*="${excludeFragment}"])`
        : `[class*="${fragment}"]`;
      return wrapper.querySelector(sel) || null;
    } catch {
      return null;
    }
  };
  const rankEl = q2('.rank-num', 'rank-num');
  const scoreEl = q2('.score', 'score', 'score-icon');
  // `.name` は紛らわしい（owner-name / ranker-name / advertiser-name 等）ので
  //   ① name-wrapper or marquee-target 配下に絞った simple
  //   ② 同パターンの partial match（CSS Modules ハッシュ化対応）
  //   ③ どちらも無ければ wrapper 配下の素朴な .name（旧 test 互換、owner-name は除外）
  const nameEl =
    wrapper.querySelector('.name-wrapper .name') ||
    wrapper.querySelector('.marquee-target .name') ||
    wrapper.querySelector('[class*="name-wrapper"] [class*="name"]:not([class*="name-wrapper"])') ||
    wrapper.querySelector('[class*="marquee-target"] [class*="name"]') ||
    wrapper.querySelector('.name:not(.owner-name)') ||
    wrapper.querySelector('[class*="name"]:not([class*="owner-name"]):not([class*="ranker-name"]):not([class*="advertiser-name"])');
  const thumbEl = q2('.thumbnail', 'thumbnail');
  const ownerEl = q2('.owner-name', 'owner-name');

  const rankText = String(rankEl?.textContent || '').trim();
  const rank = /^\d+$/.test(rankText) ? parseInt(rankText, 10) : null;

  const scoreDigits = String(scoreEl?.textContent || '').replace(/[^\d]/g, '');
  const score = /^\d+$/.test(scoreDigits) ? parseInt(scoreDigits, 10) : null;

  const title = String(nameEl?.textContent || '').trim();
  const iconUrl =
    thumbEl instanceof HTMLImageElement
      ? String(thumbEl.src || '').trim()
      : (thumbEl?.getAttribute?.('src') || '').trim();
  const ownerText = String(ownerEl?.textContent || '').trim();
  const href =
    wrapper instanceof HTMLAnchorElement
      ? String(wrapper.href || '').trim()
      : (wrapper.getAttribute?.('href') || '').trim();

  if (rank == null && score == null && !title) {
    // 旧 wrapper は居たが中身が空＝新 DOM の可能性。フォールバック。
    return scrapeEventBannerFromNewAuditionDom(base, doc);
  }
  return { rank, score, title, iconUrl, ownerText, href };
}

/**
 * v0.1.319: audition iframe の新 CSS-modules DOM から「現在順位」「累計スコア」
 * 「配信者名」を掬う純関数（旧 `.owner-name`/`.rank-num` 構造に当たらない時の
 * フォールバック）。emotion ハッシュ `css-XXXX` は不安定なので使わず、テキスト
 * パターン（`現在N位`）と安定 suffix（`eNNNN`）・構造を主軸にする。
 *
 * 取り違え防止: rank は「現在」と「位」の間の数字のみ（目標/達成まで/順位UPの数値は
 * 採らない）。score は現在順位パネル内の「累計スコア」位置（rank を含む `p` の
 * 近傍・ギフトアイコン svg 隣）の数値。
 *
 * @param {Document|Element} base
 * @param {Document} doc
 * @returns {OfficialEventBannerData|null}
 */
function scrapeEventBannerFromNewAuditionDom(base, doc) {
  /** @type {ParentNode} */
  const scope = /** @type {any} */ (base) || doc;
  if (!scope || typeof (/** @type {any} */ (scope).querySelectorAll) !== 'function') {
    return null;
  }

  // v0.1.323: 「現在50位」誤表示の根本修正（Scrapling 流のテキストアンカー近傍限定）。
  //   旧実装は scope 全体の p/div/span から `現在(\d+)位` を総当りで拾い、配信者本人の
  //   イベント参加とは独立に rank を採っていた。そのため配信者がイベント不参加でも、
  //   audition iframe 内の別 UI（サポーター順位リスト等）の「現在N位」を誤検出して
  //   「現在50位」のような無関係な順位を表示していた（実機 lv350582635: eventRank 全 null
  //   なのに 50 が出る）。
  //   修正方針: ①配信者本人の「<名>さんを応援しよう！」見出し(headEl)を先に確定する。
  //   ②rank は headEl が取れた時だけ、かつ headEl の祖先ブロック(イベントパネル)内に
  //   限定して採る＝配信者本人の現在順位だけを拾う。見出しが無ければイベント参加が
  //   確証できないので rank も score も採らない（根拠なき数値を出さない＝正確性優先）。

  // 1) 配信者名と、その見出し要素（アンカー）を先に確定する。
  /** @type {HTMLElement|null} */
  let headEl = null;
  /** @type {string} */
  let title = '';
  try {
    const heads = /** @type {NodeListOf<HTMLElement>} */ (
      scope.querySelectorAll('h2, h1, [class*="e1awe04q"]')
    );
    for (const h of heads) {
      if (!(h instanceof HTMLElement)) continue;
      const t = String(h.textContent || '').trim();
      if (/を応援しよう/.test(t)) {
        // 「を応援しよう！」「さん」を除いた配信者名
        const name = t
          .replace(/を応援しよう[！!]?\s*$/, '')
          .replace(/さん\s*$/, '')
          .trim();
        if (name) {
          title = name;
          headEl = h;
          break;
        }
      }
    }
  } catch { /* no-op */ }

  // 2) 「現在N位」を、配信者本人の見出しの近傍（祖先イベントパネル内）に限定して採る。
  //    見出し(headEl)が無い＝イベント参加が確証できないので rank は採らない。
  /** @type {HTMLElement|null} */
  let rankHostEl = null;
  /** @type {number|null} */
  let rank = null;
  try {
    if (headEl) {
      // 見出しの祖先を数階層辿り、最初に「現在N位」を含むブロックを順位パネルとみなす。
      // これにより、配信者本人のイベントパネルの外（別 UI のサポーター順位等）は対象外。
      // 順位パネルは「見出し＋現在順位＋累計＋順位UPまで」が同居する compact なブロック。
      // 誤検出（実機 lv350582635「現在50位」/ 見出しと別枝の順位）を防ぐため、順位パネルは
      //   ① 現在N位を含む
      //   ② stripped テキストが上限以内（共通祖先まで昇った巨大ブロックを除外）
      //   ③ headEl から DOM 距離が近い（見出しと同じ枝に順位がある）
      // の 3 条件を満たす「見出しの直近の tight な祖先」だけを採る。
      const RANK_PANEL_MAX_TEXT = 200;
      // headEl の祖先集合（距離付き）。順位要素がこの近傍にあるかの判定に使う。
      /** @type {Map<HTMLElement, number>} */
      const headAncestorDist = new Map();
      {
        let a = headEl;
        let d = 0;
        while (a instanceof HTMLElement && d <= 3) {
          headAncestorDist.set(a, d);
          a = a.parentElement;
          d++;
        }
      }
      /** @type {HTMLElement|null} */
      let panel = headEl.parentElement instanceof HTMLElement ? headEl.parentElement : null;
      /** @type {HTMLElement|null} */
      let rankPanel = null;
      for (let depth = 0; depth < 3 && panel instanceof HTMLElement; depth++) {
        const stripped = String(panel.textContent || '').replace(/[\s,]/g, '');
        if (/現在\d+位/.test(stripped)) {
          if (stripped.length <= RANK_PANEL_MAX_TEXT) {
            // ③ panel 配下の「現在N位」要素が headEl の近傍（共通祖先が headEl から
            //   2 階層以内）にあるか確認＝見出しと別枝の順位（far block）を弾く。
            const rankNodes = /** @type {NodeListOf<HTMLElement>} */ (
              panel.querySelectorAll('p, div, span')
            );
            let nearRank = false;
            for (const rn of rankNodes) {
              if (!(rn instanceof HTMLElement)) continue;
              if (!/現在\d+位/.test(String(rn.textContent || '').replace(/[\s,]/g, ''))) {
                continue;
              }
              // rn の祖先を辿り、headEl の祖先集合に最初に当たる距離（共通祖先の headEl 側距離）
              let p2 = rn;
              let found = -1;
              let up = 0;
              while (p2 instanceof HTMLElement && up <= 4) {
                if (headAncestorDist.has(p2)) {
                  found = headAncestorDist.get(p2);
                  break;
                }
                p2 = p2.parentElement;
                up++;
              }
              // 共通祖先が headEl から 1 階層以内（headEl 自身か headEl.parentElement）
              //   ＝見出しと順位が同じ枝にある。実 DOM では見出し h2 と「現在N位」p は
              //   共通の親 div 配下（距離 1）。距離 2 以上＝共通祖先の別々の子に分かれる
              //   ＝別枝（far block）なので弾く。
              if (found >= 0 && found <= 1) {
                nearRank = true;
                break;
              }
            }
            if (nearRank) rankPanel = panel;
          }
          break; // 最初に現在N位を含む祖先で打ち切り
        }
        panel = panel.parentElement instanceof HTMLElement ? panel.parentElement : null;
      }
      if (rankPanel) {
        const candidates = /** @type {NodeListOf<HTMLElement>} */ (
          rankPanel.querySelectorAll('p, div, span')
        );
        for (const el of candidates) {
          if (!(el instanceof HTMLElement)) continue;
          // 自要素直下のテキスト + 子 span のテキストを連結（`現在<span>17</span>位`）
          const t = String(el.textContent || '').replace(/[\s,]/g, '');
          const m = /現在(\d+)位/.exec(t);
          if (m) {
            // 最も内側（テキストが短い）要素を採用＝親の長文に巻き込まれない
            const n = parseInt(m[1], 10);
            if (Number.isFinite(n) && n > 0) {
              if (
                rankHostEl == null ||
                t.length <
                  String(rankHostEl.textContent || '').replace(/[\s,]/g, '').length
              ) {
                rankHostEl = el;
                rank = n;
              }
            }
          }
        }
      }
    }
  } catch { /* no-op */ }

  // 3) 累計スコア: 現在順位パネル（rankHostEl の祖先ブロック）内で、rank/目標等を
  //    除いた「累計」位置の数値。安定的に取りにくいので、rank が取れた時のみ
  //    「rankHostEl の最も近い共通祖先配下の、rank と異なる最初のカンマ区切り数値」を採る。
  //    取り違えが疑わしいときは score=null（誤値を出さない＝正確性優先）。
  /** @type {number|null} */
  let score = null;
  try {
    if (rankHostEl) {
      // 現在順位パネルらしいブロック（rank の p の親＝rank と score を兄弟に持つ階層）を
      // 起点に。closest は自要素を返すので使わず、親を 1〜2 階層辿る。
      const panel =
        (rankHostEl.parentElement instanceof HTMLElement ? rankHostEl.parentElement : null) ||
        null;
      if (panel instanceof HTMLElement) {
        // パネル直下テキストから最初の「N,NNN」形（rank の裸数字より桁が大きい累計）を拾う。
        // 「達成まで/順位UPまで」は別ブロック（e1izyqjk* / e1awe04q6）なので、
        // rank と同じ最上段パネル（e1awe04q4 付近）に限定して誤認を避ける。
        const numEls = /** @type {NodeListOf<HTMLElement>} */ (
          panel.querySelectorAll('p, span')
        );
        for (const ne of numEls) {
          if (!(ne instanceof HTMLElement)) continue;
          const raw = String(ne.textContent || '');
          if (/現在\d+位/.test(raw.replace(/[\s,]/g, ''))) continue; // rank 行は除外
          if (/あと|まで|達成|目標/.test(raw)) continue; // 差分・目標は除外
          const digits = raw.replace(/[^\d]/g, '');
          if (/^\d+$/.test(digits) && digits.length >= 2) {
            const v = parseInt(digits, 10);
            if (Number.isFinite(v) && v > 0 && v !== rank) {
              score = v;
              break;
            }
          }
        }
      }
    }
  } catch { /* no-op */ }

  if (rank == null && score == null && !title) return null;
  return {
    rank,
    score,
    title,
    iconUrl: '',
    ownerText: title ? `${title}さんを応援しよう！` : '',
    href: ''
  };
}

/**
 * niconico 側のバルーン（リロードボタン付きの累計表示パネル）から
 * 「イベント累計スコア」と「番組累計ポイント」を掬う純関数。
 *
 * 実 DOM 構造（2026-05 時点で確認）:
 *
 *   <div class="balloon">
 *     <div class="point">
 *       <table class="point-field">
 *         <tr>
 *           <th class="point-title">イベント累計スコア：</th>
 *           <td class="point-value score-value"><svg.../> 207,835</td>
 *         </tr>
 *         <tr>
 *           <th class="point-title">番組累計ポイント：</th>
 *           <td class="point-value">1,740 <small class="point-unit">pt</small></td>
 *         </tr>
 *       </table>
 *     </div>
 *     ...
 *   </div>
 *
 * th テキストで行を識別し、td の数字部分のみ抽出。
 *
 * @typedef {{
 *   eventTotalScore: number|null,
 *   programTotalPoints: number|null
 * }} OfficialEventBalloonData
 */

/**
 * @param {Document|Element} root
 * @returns {OfficialEventBalloonData|null}
 */
export function scrapeOfficialEventBalloonFromDom(root) {
  if (!root) return null;
  const base = root;
  /** @type {NodeListOf<Element>|Element[]} */
  let rows;
  try {
    rows =
      /** @type {any} */ (base).querySelectorAll?.('.point-field tr') ||
      [];
  } catch {
    return null;
  }
  if (!rows || rows.length === 0) return null;
  /** @param {string} s */
  const onlyDigits = (s) => s.replace(/[^\d]/g, '');
  let eventTotalScore = /** @type {number|null} */ (null);
  let programTotalPoints = /** @type {number|null} */ (null);
  for (const tr of /** @type {Iterable<Element>} */ (rows)) {
    const th = tr.querySelector?.('.point-title');
    const td = tr.querySelector?.('.point-value');
    if (!(th instanceof HTMLElement) || !(td instanceof HTMLElement)) continue;
    const label = String(th.textContent || '').trim();
    const valueDigits = onlyDigits(String(td.textContent || ''));
    if (!/^\d+$/.test(valueDigits)) continue;
    const num = parseInt(valueDigits, 10);
    if (/イベント累計スコア/.test(label)) {
      eventTotalScore = num;
    } else if (/番組累計ポイント/.test(label)) {
      programTotalPoints = num;
    }
  }
  if (eventTotalScore == null && programTotalPoints == null) return null;
  return { eventTotalScore, programTotalPoints };
}

/**
 * niconico の「貢献度ランキング」一覧から、視聴者の順位・名前・貢献度・アイコンを掬う純関数。
 *
 * 実 DOM 構造（2026-05 時点で確認）:
 *
 *   <ul class="contribution-ranking-list">
 *     <li class="ranker">
 *       <button class="button">
 *         <p class="rank">
 *           <svg class="rank-icon">...</svg>     ← 上位3位は王冠SVG（テキスト無し）
 *           OR
 *           <span>4</span>                       ← 4位以降は数値テキスト
 *         </p>
 *         <p class="text">
 *           <span class="ranker-name">
 *             <strong class="ranker-name-value" data-button-disabled="false">なぎ</strong>
 *             <small class="honorific">さん</small>
 *           </span>
 *           <span class="reward-sticker">                <!-- 任意 -->
 *             <i class="body">...
 *               <span class="thumbnail" style="background-image: url('...')"></span>
 *             </i>
 *           </span>
 *         </p>
 *         <p class="contribution">5,000 <svg class="contribution-unit"></svg></p>
 *       </button>
 *     </li>
 *     ...
 *   </ul>
 *
 * 同点が居るので順位は単純な配列 index ではなく `<span>` テキストを優先。
 * 上位3位は SVG だけでテキスト無しなので、配列先頭3件は positional に 1/2/3 を当てる。
 * 「名無し」匿名は `data-button-disabled="true"` で識別。
 *
 * @typedef {{
 *   rank: number,
 *   name: string,
 *   contribution: number,
 *   isAnonymous: boolean,
 *   thumbnailUrl: string,
 *   userPageUrl?: string
 * }} ContributionRankerRow
 */

/**
 * @param {Document|Element} root
 * @returns {ContributionRankerRow[]|null}
 */
export function scrapeContributionRankingFromDom(root) {
  if (!root) return null;
  /** @type {NodeListOf<Element>|Element[]} */
  let lis;
  try {
    // 実 DOM 構造（2026-05-05 ユーザー提供サンプルで確認）：
    //   .content-supporter-section .wrapper > ul.wrapper > li.item
    //   各 li.item は i.rank, div.info > button.ranker / p.contribution を持つ
    //   button.ranker[disabled] は「視聴者ページに飛べない（匿名/退会等）」相当
    lis =
      /** @type {any} */ (root).querySelectorAll?.(
        '.content-supporter-section ul.wrapper > li.item'
      ) || [];
    // 旧構造（古いビルド or test 用）
    if (!lis || lis.length === 0) {
      lis =
        /** @type {any} */ (root).querySelectorAll?.(
          '.contribution-ranking-list .ranker'
        ) || [];
    }
    // CSS Modules ハッシュ化対応（保険）
    if (!lis || lis.length === 0) {
      lis =
        /** @type {any} */ (root).querySelectorAll?.(
          '[class*="content-supporter"] ul > li[class*="item"]:not([class*="items"])'
        ) || [];
    }
  } catch {
    return null;
  }
  if (!lis || lis.length === 0) return null;

  /** @type {ContributionRankerRow[]} */
  const rows = [];
  let i = 0;
  for (const li of /** @type {Iterable<Element>} */ (lis)) {
    const idx = i++;
    if (!(li instanceof HTMLElement)) continue;
    // rank: i.rank の textContent（4 位以降は数字、1〜3 位は SVG で空）
    const rankEl =
      li.querySelector('i.rank') ||
      li.querySelector(':scope > [class*="rank"]:not([class*="ranker"])') ||
      li.querySelector('.rank');
    // ranker（button）: ユーザー名と匿名判定の起点
    const rankerEl =
      li.querySelector('.ranker') ||
      li.querySelector('button.ranker') ||
      li.querySelector('[class*="ranker"]:not([class*="ranker-name"])');
    // name: .ranker > .name（実 DOM）または .ranker-name-value（旧 DOM）
    const nameEl =
      (rankerEl instanceof HTMLElement &&
        (rankerEl.querySelector(':scope > .name') ||
          rankerEl.querySelector('.name'))) ||
      li.querySelector('.ranker-name-value') ||
      li.querySelector('[class*="ranker-name-value"]') ||
      null;
    // contribution
    const contribEl =
      li.querySelector('.contribution') ||
      li.querySelector('[class*="contribution"]:not([class*="contribution-ranking"]):not([class*="contribution-unit"])');
    // thumbnail: .ranker 内の .thumbnail（背景画像）
    const thumbEl =
      (rankerEl instanceof HTMLElement && rankerEl.querySelector('.thumbnail')) ||
      li.querySelector('.thumbnail') ||
      li.querySelector('[class*="thumbnail"]');

    if (!(nameEl instanceof HTMLElement) || !(contribEl instanceof HTMLElement)) {
      continue;
    }
    /** @type {number|null} */
    let rank = null;
    if (rankEl instanceof HTMLElement) {
      // 直接の textContent から数字を抽出（4位以降は "4", "5" 等）
      const directTxt = String(rankEl.textContent || '').replace(/[^\d]/g, '');
      if (/^\d+$/.test(directTxt)) rank = parseInt(directTxt, 10);
      // 旧 DOM 互換: span 直下にテキストがあるパターン
      if (rank == null) {
        const span = rankEl.querySelector('span');
        const sTxt = String(span?.textContent || '').replace(/[^\d]/g, '');
        if (/^\d+$/.test(sTxt)) rank = parseInt(sTxt, 10);
      }
    }
    if (rank == null && idx < 3) {
      rank = idx + 1;
    }
    // 先頭付近で rank 要素周りに紛れ込んだ数字を拾い、実順位より小さい順位になることがある
    // （例: 3 人目が 2 位扱い）。既に確定した行数より進んでいない順位は、DOM 行の序数で矯正する。
    const nextOrdinal = rows.length + 1;
    if (rank != null && nextOrdinal <= 3 && rank <= rows.length) {
      rank = nextOrdinal;
    }
    if (rank == null) continue;

    // name 抽出時に honorific（「さん」）が含まれていたら除く
    const nameClone = nameEl.cloneNode(true);
    if (nameClone instanceof HTMLElement) {
      const honorific = nameClone.querySelector('.honorific, [class*="honorific"]');
      if (honorific) honorific.remove();
    }
    const name = String(
      nameClone instanceof HTMLElement ? nameClone.textContent : nameEl.textContent || ''
    ).trim();
    if (!name) continue;
    const isAnonymous =
      (rankerEl instanceof HTMLElement && rankerEl.hasAttribute('disabled')) ||
      nameEl.getAttribute('data-button-disabled') === 'true' ||
      name === '名無し';

    const contribDigits = String(contribEl.textContent || '').replace(/[^\d]/g, '');
    if (!/^\d+$/.test(contribDigits)) continue;
    const contribution = parseInt(contribDigits, 10);

    let thumbnailUrl = '';
    if (thumbEl instanceof HTMLElement) {
      const bg = String(thumbEl.style?.backgroundImage || '');
      const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
      if (m) thumbnailUrl = m[1];
      if (!thumbnailUrl) {
        const img = thumbEl.querySelector('img[src]');
        if (img instanceof HTMLImageElement) {
          const u = String(img.currentSrc || img.src || '').trim();
          if (/^https?:\/\//i.test(u)) thumbnailUrl = u;
        }
      }
      if (!thumbnailUrl) {
        const lazy =
          String(thumbEl.getAttribute('data-src') || '').trim() ||
          String(thumbEl.querySelector('img[data-src]')?.getAttribute('data-src') || '').trim();
        if (/^https?:\/\//i.test(lazy)) thumbnailUrl = lazy;
      }
    }

    rows.push({ rank, name, contribution, isAnonymous, thumbnailUrl });
  }
  if (rows.length === 0) return null;
  return rows;
}

/**
 * 貢献度ランキングが DOM 上に「`scrapeContributionRankingFromDom` が解釈可能な形」で存在するか。
 * `tryAutoOpenGiftSidebarOnceForScrape` のポーリングとスクレイパの成功条件を一致させる
 * （`.contribution-ranking-list .ranker` のみを見ると、`.content-supporter-section` 新構造で
 * 常に false になり得るため）。
 *
 * @param {Document|Element|null|undefined} root
 * @returns {boolean}
 */
export function hasContributionRankingDomSignal(root) {
  const rows = scrapeContributionRankingFromDom(root);
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * niconico の番組統計メニュー（プレイヤー上部のリアルタイム数値ティッカー）から
 * 来場者数・コメント数・タイムシフト予約数・広告pt・ギフトpt を掬う純関数。
 *
 * 実 DOM 構造（2026-05 時点で確認）:
 *
 *   <ul class="___program-statistics-menu___W9_FZ ___program-statistics-menu___IuMeU">
 *     <li class="___watch-count-item___..." title="来場者数">
 *       <span class="___count___..." data-update-version="16" data-value="3266">
 *         <span class="...inner-content">3,266</span>
 *       </span>
 *     </li>
 *     <li class="___comment-count-item___..." title="コメント数">
 *       <span class="...count" data-update-version="3" data-value="1060">...</span>
 *     </li>
 *     <li class="___timeshift-reservation-count-item___..." title="タイムシフト予約数">
 *       <button class="...count" data-value="1">...</button>
 *     </li>
 *     <li class="___nicoad-count-item___..." title="ニコニ広告ポイント">
 *       <button class="...count" data-value="55800">...</button>
 *     </li>
 *     <li class="___gift-count-item___..." title="ギフトポイント">
 *       <button class="...count" data-value="1770">...</button>
 *     </li>
 *   </ul>
 *
 * `data-value` 属性に整数値がそのまま入っているので、表示テキストの "3,266" を
 * パースしないで済む。`title` 属性 or `___xxx-count-item___` クラス命名で識別。
 * niconico の CSS Modules ハッシュ命名（___gift-count-item___HASH）に追随するため
 * `[class*="gift-count-item"]` のようなサブストリングマッチを使う。
 *
 * @typedef {{
 *   watchCount: number|null,
 *   commentCount: number|null,
 *   timeshiftReservationCount: number|null,
 *   adPoints: number|null,
 *   giftPoints: number|null
 * }} ProgramStatisticsMenuData
 */

/**
 * @param {Document|Element} root
 * @returns {ProgramStatisticsMenuData|null}
 */
export function scrapeProgramStatisticsMenuFromDom(root) {
  if (!root) return null;
  /** @type {Element|null} */
  let ul = null;
  try {
    ul =
      /** @type {any} */ (root).querySelector?.('[class*="program-statistics-menu"]') ||
      null;
  } catch {
    return null;
  }
  if (!ul) return null;

  let watchCount = /** @type {number|null} */ (null);
  let commentCount = /** @type {number|null} */ (null);
  let timeshiftReservationCount = /** @type {number|null} */ (null);
  let adPoints = /** @type {number|null} */ (null);
  let giftPoints = /** @type {number|null} */ (null);

  /** @param {Element} item @returns {number|null} */
  const readDataValue = (item) => {
    const c = item.querySelector?.('[data-value]');
    const dv = c instanceof HTMLElement ? c.getAttribute('data-value') : null;
    if (!dv || !/^\d+$/.test(dv)) return null;
    return parseInt(dv, 10);
  };

  let lis;
  try {
    lis = ul.querySelectorAll?.('li') || [];
  } catch {
    return null;
  }
  for (const li of /** @type {Iterable<Element>} */ (lis)) {
    if (!(li instanceof HTMLElement)) continue;
    const cls = String(li.className || '');
    const title = String(li.getAttribute('title') || '');
    const v = readDataValue(li);
    if (v == null) continue;
    if (/watch-count-item/.test(cls) || title === '来場者数') {
      watchCount = v;
    } else if (/comment-count-item/.test(cls) || title === 'コメント数') {
      commentCount = v;
    } else if (
      /timeshift-reservation-count-item/.test(cls) ||
      title === 'タイムシフト予約数'
    ) {
      timeshiftReservationCount = v;
    } else if (/nicoad-count-item/.test(cls) || title === 'ニコニ広告ポイント') {
      adPoints = v;
    } else if (/gift-count-item/.test(cls) || title === 'ギフトポイント') {
      giftPoints = v;
    }
  }
  if (
    watchCount == null &&
    commentCount == null &&
    timeshiftReservationCount == null &&
    adPoints == null &&
    giftPoints == null
  ) {
    return null;
  }
  return {
    watchCount,
    commentCount,
    timeshiftReservationCount,
    adPoints,
    giftPoints
  };
}

/**
 * niconico ギフトサイドバーの「履歴」タブから個別ギフト履歴を掬う。
 * 貢献度ランキング（.contribution-ranking-list）はランキングタブを開かないと
 * DOM に出ないが、履歴タブは多くの場合デフォルト or ユーザーがすぐ開く位置にあるので、
 * ここから集約することで「貢献度ランキング相当」のデータが取れる。
 *
 * 実 DOM 構造（2026-05 時点で確認）:
 *
 *   <ul class="gift-history-list">
 *     <li class="item">
 *       （任意）送り主の user icon（`nicoaccount/usericon` を含む img）と
 *       <img class="thumbnail" src="..." alt="ギフト名">（ギフト画像）
 *       <p class="time">19:58</p>
 *       <p class="text">
 *         <span class="advertiser-name">くろかな <small class="honorific">さん</small></span>
 *       </p>
 *       <p class="point">30 <small class="point-unit">pt</small></p>
 *     </li>
 *   </ul>
 *
 * 「名無し」は匿名（不特定多数を区別不能）なので isAnonymous フラグで識別。
 *
 * @typedef {{
 *   time: string,
 *   advertiserName: string,
 *   isAnonymous: boolean,
 *   point: number,
 *   thumbnailUrl: string,
 *   giftName: string,
 *   advertiserAvatarUrl: string
 * }} GiftHistoryEntry
 */

/**
 * @param {Document|Element} root
 * @returns {GiftHistoryEntry[]|null}
 */
export function scrapeGiftHistoryFromDom(root) {
  if (!root) return null;
  /** @type {NodeListOf<Element>|Element[]} */
  let items;
  try {
    items =
      /** @type {any} */ (root).querySelectorAll?.('.gift-history-list .item') ||
      [];
    // CSS Modules ハッシュ化対応：simple selector が空なら partial match を試す
    if (!items || items.length === 0) {
      items =
        /** @type {any} */ (root).querySelectorAll?.(
          '[class*="gift-history-list"] [class*="item"]:not([class*="items"])'
        ) || [];
    }
  } catch {
    return null;
  }
  if (!items || items.length === 0) return null;
  /** @type {GiftHistoryEntry[]} */
  const out = [];
  for (const li of /** @type {Iterable<Element>} */ (items)) {
    if (!(li instanceof HTMLElement)) continue;
    const thumb = resolveGiftHistoryGiftImageEl(li);
    const timeEl =
      li.querySelector('.time') ||
      li.querySelector('[class*="time"]');
    const nameEl =
      li.querySelector('.advertiser-name') ||
      li.querySelector('[class*="advertiser-name"]');
    const pointEl =
      li.querySelector('.point') ||
      li.querySelector('[class*="point"]:not([class*="point-unit"])');
    if (!(nameEl instanceof HTMLElement) || !(pointEl instanceof HTMLElement)) {
      continue;
    }
    // 名前から honorific（「さん」）を除いたテキストだけ取る
    const nameClone = nameEl.cloneNode(true);
    if (nameClone instanceof HTMLElement) {
      const honorific =
        nameClone.querySelector('.honorific') ||
        nameClone.querySelector('[class*="honorific"]');
      if (honorific) honorific.remove();
    }
    const name = String(
      nameClone instanceof HTMLElement ? nameClone.textContent : ''
    )
      .trim();
    if (!name) continue;
    // ポイントから unit（「pt」）を除いた数字だけ取る
    const pointClone = pointEl.cloneNode(true);
    if (pointClone instanceof HTMLElement) {
      const unit =
        pointClone.querySelector('.point-unit') ||
        pointClone.querySelector('[class*="point-unit"]');
      if (unit) unit.remove();
    }
    const pointText = String(
      pointClone instanceof HTMLElement ? pointClone.textContent : ''
    ).replace(/[^\d]/g, '');
    if (!/^\d+$/.test(pointText)) continue;
    const point = parseInt(pointText, 10);
    const time = String(timeEl?.textContent || '').trim();
    const thumbnailUrl =
      thumb instanceof HTMLImageElement ? String(thumb.src || '') : '';
    const giftName =
      thumb instanceof HTMLImageElement ? String(thumb.alt || '').trim() : '';
    const isAnonymous = name === '名無し';
    const advertiserAvatarUrl = pickAdvertiserAvatarUrlFromGiftHistoryLi(li);
    out.push({
      time,
      advertiserName: name,
      isAnonymous,
      point,
      thumbnailUrl,
      giftName,
      advertiserAvatarUrl
    });
  }
  if (out.length === 0) return null;
  return out;
}

/**
 * gift-history を「ユーザー名でアグリゲート」して貢献度ランキング相当に整形する。
 * 名無しは個々を区別できないので 1 つのバケットに統合する（順位上は妥当な扱い）。
 *
 * @typedef {{
 *   name: string,
 *   isAnonymous: boolean,
 *   totalPoints: number,
 *   giftCount: number,
 *   lastTime: string,
 *   advertiserAvatarUrl: string
 * }} GiftContributorAggregated
 *
 * @param {GiftHistoryEntry[]} history
 * @returns {GiftContributorAggregated[]} totalPoints 降順
 */
export function aggregateGiftHistoryByUser(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  /** @type {Map<string, GiftContributorAggregated>} */
  const map = new Map();
  for (const h of history) {
    if (!h || typeof h !== 'object') continue;
    const name = String(h.advertiserName || '').trim();
    if (!name) continue;
    const point = Number(h.point);
    if (!Number.isFinite(point) || point < 0) continue;
    const time = String(h.time || '').trim();
    let agg = map.get(name);
    if (!agg) {
      agg = {
        name,
        isAnonymous: !!h.isAnonymous || name === '名無し',
        totalPoints: 0,
        giftCount: 0,
        lastTime: '',
        advertiserAvatarUrl: ''
      };
      map.set(name, agg);
    }
    agg.totalPoints += point;
    agg.giftCount += 1;
    if (time && (!agg.lastTime || time > agg.lastTime)) agg.lastTime = time;
    const av = String(h.advertiserAvatarUrl || '').trim();
    if (av) agg.advertiserAvatarUrl = av;
  }
  return [...map.values()].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.giftCount !== a.giftCount) return b.giftCount - a.giftCount;
    return a.name.localeCompare(b.name);
  });
}

/**
 * 【メモ・未実装】ギフト購入ボタン (.payment-text を含む `<button>`)
 *
 * 例:
 *   <button class="button">
 *     <small class="description">
 *       <span class="point">53,165 <span class="unit">pt</span></span>
 *       不足しています
 *     </small>
 *     <strong class="payment-text">ニコニコポイントを購入する</strong>
 *   </button>
 *
 * - 視聴者本人がギフト（例：プレゼント付き召喚獣 = 55,000 pt）を投げようとした時の購入動線。
 * - 「N pt 不足しています」のテキストから不足額を取れる。
 * - 用途候補：
 *   - 「あと N pt で X が贈れる」サジェスト
 *   - 高額ギフト（バハムート級）が投げられた時の強調表示
 *   - ギフト種別×価格テーブル化
 * - 今ターンでは実装しない。要件が固まってから別関数として追加。
 */

/**
 * v0.1.237: 北極星「鏡のように貼り付け」用の outerHTML 取得関数。
 *
 * watch ページ secondary content section にあるタブ式 UI（`<nav class="tabs">`
 * 内の「貢献度ランキング」/「広告履歴」）の active タブの中身 = 広告ランキング
 * を outerHTML で取り出す。`scrapeContributionRankingFromDom` と同じセレクタを
 * 使うが、戻り値を構造化せず HTML 文字列のまま返すのが本関数の責務（鏡用）。
 *
 * 関数名は **実体に合わせて Ad Ranking** を冠する（既存
 * `scrapeContributionRankingFromDom` は名前と取得対象がミスマッチで、実体は
 * 広告ランキングを取っていた）。
 *
 * 「貢献度ランキング」（イベント参加時のギフトサイドバー内ランカー、
 * `ul.contribution-ranking-list`）は別 DOM・別 scraper（v0.1.240 で追加予定）。
 *
 * @param {Document|Element} root
 * @returns {string|null} 取れなかった時は null
 */
export function scrapeAdRankingMirrorHtml(root) {
  if (!root) return null;

  const anyRoot = /** @type {any} */ (root);

  /** @param {Element} ul */
  const countRankingItems = (ul) => {
    try {
      return ul.querySelectorAll('li[class*="item"], li.item').length;
    } catch {
      return 0;
    }
  };

  /** @param {Element|null|undefined} sec */
  const bestRankingListInSection = (sec) => {
    if (!(sec instanceof Element)) return null;
    try {
      const uls = sec.querySelectorAll('ul[class*="wrapper"], ul.wrapper');
      /** @type {Element|null} */
      let best = null;
      let bestScore = 0;
      for (const ul of uls) {
        const n = countRankingItems(ul);
        if (n > bestScore) {
          bestScore = n;
          best = ul;
        }
      }
      return bestScore > 0 ? best : null;
    } catch {
      return null;
    }
  };

  /** @param {Element|null} fromList */
  const resolveSupporterSection = (fromList) =>
    (fromList instanceof Element &&
      fromList.closest?.('[class*="content-supporter"]')) ||
    anyRoot.querySelector?.('[class*="content-supporter"]') ||
    anyRoot.querySelector?.('.content-supporter-section') ||
    null;

  /** @type {Element|null} */
  let list = null;
  try {
    list = anyRoot.querySelector?.('.content-supporter-section ul.wrapper') || null;
    if (!list) {
      // CSS Modules ハッシュ化保険（A/B テスト分岐への耐性、Gemini 視点 #17）
      list =
        anyRoot.querySelector?.('[class*="content-supporter"] ul[class*="wrapper"]') ||
        null;
    }
    // 先頭にマッチした ul がタブ用など空殻のとき、同一 section 内で li 数最大の ul を選ぶ
    const nItems = list instanceof Element ? countRankingItems(list) : 0;
    if (list instanceof Element && nItems === 0) {
      const sec = resolveSupporterSection(list);
      const better = bestRankingListInSection(sec);
      if (better) {
        list = better;
      }
    }
    if (!list) {
      list = bestRankingListInSection(resolveSupporterSection(null));
    }
  } catch {
    return null;
  }

  if (!(list instanceof Element)) return null;

  const html = String(list.outerHTML || '').trim();
  return html || null;
}

/**
 * 広告ランキングの構造化行と北極星「鏡」HTMLを同一 doc から取得（nicoad publish fetch 等）。
 * 呼び出し側のペア取得を固定し、将来の短絡・キャッシュをここに集約しやすくする。
 *
 * @param {Document|Element} root
 * @returns {{
 *   ranking: ReturnType<typeof scrapeContributionRankingFromDom>,
 *   mirrorHtml: ReturnType<typeof scrapeAdRankingMirrorHtml>
 * }}
 */
export function scrapeAdContributionRankingRowsAndMirrorFromDom(root) {
  const ranking = scrapeContributionRankingFromDom(root);
  const mirrorHtml = scrapeAdRankingMirrorHtml(root);
  return { ranking, mirrorHtml };
}

/**
 * v0.1.240: 北極星「鏡のように貼り付け」用、レーン 3 (イベント累計スコア) +
 * レーン 5 (イベント現在順位) のソース DOM の outerHTML 取得関数。
 *
 * audition.nicovideo.jp/embedded/richview/live を fetch して得られる HTML 内、
 * 「○○さんが参加しています！」グリーンバナーの `<a class="wrapper">` 配下、
 * `<p class="status">` 内の `<span class="score">` と `<span class="rank-field">`
 * の outerHTML をそれぞれ抜き出す純関数。
 *
 * 実 DOM 構造（2026-05 時点で確認）:
 *
 *   <a class="wrapper" href="...">
 *     <p class="owner-name">○○さんが参加しています！</p>
 *     <div class="info">
 *       <div class="text">
 *         <p class="status">
 *           <span class="rank-field"> 現在 <strong class="rank-num">2</strong> 位 </span>
 *           <span class="score"><svg class="score-icon"></svg> 207,835</span>
 *         </p>
 *       </div>
 *     </div>
 *   </a>
 *
 * - レーン 3 (イベント累計スコア): `<span class="score">` の outerHTML
 * - レーン 5 (イベント現在順位): `<span class="rank-field">` の outerHTML
 *
 * 既存 `scrapeOfficialEventBannerFromDom` と同じ「さんが参加しています」テキストで
 * バナーを識別する誤検出回避ガードを通す。
 *
 * @param {Document|Element} root
 * @returns {{scoreHtml: string|null, rankHtml: string|null}|null}
 *   バナー DOM が見つからない場合は null、wrapper はあるが両 span ともに取れない
 *   場合も null（部分取得の場合は取れた方のみ outerHTML、取れない方は null）。
 */
export function scrapeEventInfoMirrorParts(root) {
  if (!root) return null;
  /** @type {Document} */
  const doc =
    /** @type {any} */ (root).nodeType === 9
      ? /** @type {Document} */ (root)
      : (/** @type {Element} */ (root).ownerDocument || document);
  const base = /** @type {any} */ (root).nodeType === 9 ? doc : root;
  /** @type {HTMLElement|null} */
  let wrapper = null;
  try {
    /** @type {NodeListOf<HTMLElement>|Element[]} */
    let owners =
      /** @type {any} */ (base).querySelectorAll?.('.owner-name') ||
      doc.querySelectorAll('.owner-name');
    if (!owners || owners.length === 0) {
      owners =
        /** @type {any} */ (base).querySelectorAll?.('[class*="owner-name"]') ||
        doc.querySelectorAll('[class*="owner-name"]');
    }
    for (const el of owners) {
      if (!(el instanceof HTMLElement)) continue;
      const t = String(el.textContent || '');
      if (!/(?:さんが|が)参加(?:しています|中)?/.test(t)) continue;
      const a = el.closest && el.closest('a');
      const w = (a instanceof HTMLElement ? a : el.parentElement) || null;
      if (w instanceof HTMLElement) {
        wrapper = w;
        break;
      }
    }
  } catch {
    return null;
  }
  if (!wrapper) return null;

  // `.score` は static class（直接マッチ）→ partial match の順でフォールバック。
  // `.score-icon`（内側 SVG）と `.score-value`（balloon の td 修飾子）は別物なので除外。
  const scoreEl =
    wrapper.querySelector('p.status > span.score') ||
    wrapper.querySelector('.status .score:not(.score-icon):not(.score-value)') ||
    wrapper.querySelector('.score:not(.score-icon):not(.score-value)') ||
    wrapper.querySelector(
      '[class*="score"]:not([class*="score-icon"]):not([class*="score-value"])'
    );

  const rankFieldEl =
    wrapper.querySelector('p.status > span.rank-field') ||
    wrapper.querySelector('.rank-field') ||
    wrapper.querySelector('[class*="rank-field"]');

  const scoreHtml =
    scoreEl instanceof Element
      ? String(scoreEl.outerHTML || '').trim() || null
      : null;
  const rankHtml =
    rankFieldEl instanceof Element
      ? String(rankFieldEl.outerHTML || '').trim() || null
      : null;

  if (!scoreHtml && !rankHtml) return null;
  return { scoreHtml, rankHtml };
}
