/**
 * watch ページ（live.nicovideo.jp＝content script と同一 origin）の gift
 * サイドバー「貢献度ランキング」DOM の **概形のみ** を bounded・観測専用に
 * 要約する純関数。副作用なし・読み取りのみ・挙動不変。
 *
 * 背景（会議室 critic 2026-05-19 の指摘を反映した安全設計）:
 * - ユーザーは画面で「1位 フロア熱狂 5,105…」を見えているのに拡張の
 *   `scrapeContributionRankingFromDom` が現行 niconico のハッシュ化 CSS-module
 *   DOM に当たらず空 → レーンが fallback 断片を表示する不具合がある。
 * - しかし `scrapeContributionRankingFromDom` は広告ランキング scraper 等と
 *   **共有**のため、実 DOM サンプル無しで selector を広げると v0.1.226-229 の
 *   広告混入事故（lv350481542）を再発させる（critic 致命判定）。
 * - よって「盲目 selector 変更」ではなく **まず実 DOM 構造を観測層で実証** し、
 *   確定トークンで専用 selector ＋汚染回帰テストを後続で安全投入する
 *   （memory: 取得可否の観測層を先に作る / v0.1.223 教訓）。
 *
 * critic 安全化の遵守:
 * - (i) full document を `[class]` 全列挙しない＝候補コンテナにスコープ。
 * - (ii) 診断 export 時に 1 回だけ評価（hot tick で回さない＝throttle 不要）。
 * - (iii) classSamples はコンテナ内の row 状要素に限定（ページ枠を拾わない）。
 * - (iv) content 側診断ビルダーに同梱（北極星描画連鎖に触れない）。
 * - 共有 scraper を一切変更しない（広告経路へ波及させない）。
 *
 * PII 非収集: 収集対象は構造的 class 名 / 候補 selector の件数・存在可否 /
 * テキストは「長さ」と「数字を含むか」のみ（貢献度の値そのものは採らない）。
 * すべて長さ・件数を上限 cap。
 */

/**
 * 貢献度ランキングの候補コンテナ selector（具体→広め順）。
 * いずれも観測専用に "存在すれば中を覗く" だけで、scraper には一切渡さない
 * （critic: 共有 scraper を広げない／広告経路へ波及させない）。
 * @type {readonly string[]}
 */
const CONTAINER_CANDIDATES = Object.freeze([
  '.content-supporter-section',
  '[class*="content-supporter"]',
  '[class*="contribution-ranking"]',
  '[class*="supporter-section"]',
  '[class*="contributionRanking"]',
  '[class*="gift-sidebar"] [class*="ranking"]',
  'aside [class*="ranking"]'
]);

/**
 * @param {Document|Element|null|undefined} root watch ページの document（同一 origin）
 * @returns {Record<string, unknown>}
 */
export function captureSameOriginContributionRankingDomShape(root) {
  try {
    if (!root || typeof (/** @type {any} */ (root).querySelector) !== 'function') {
      return { probe: 'no-doc' };
    }
    /** @type {Element|null} */
    let container = null;
    let matchedBy = '';
    for (const sel of CONTAINER_CANDIDATES) {
      try {
        const el = /** @type {any} */ (root).querySelector(sel);
        if (el) {
          container = el;
          matchedBy = sel;
          break;
        }
      } catch {
        /* selector 不正は無視 */
      }
    }
    if (!container) {
      // 「貢献度ランキングのコンテナがこの document に居ない」＝definitive な
      // 信号（サイドバー未展開 or 構造が候補と全く別）。次の改善判断に使う。
      return { probe: 'no-container' };
    }

    /** @param {string} sel */
    const cCount = (sel) => {
      try {
        return container ? container.querySelectorAll(sel).length : -1;
      } catch {
        return -1;
      }
    };
    /** @param {string} sel */
    const cHas = (sel) => {
      try {
        return !!(container && container.querySelector(sel));
      } catch {
        return false;
      }
    };
    // root スコープの単発 querySelector（[class] 全列挙はしない＝critic (i) 準拠。
    // 単一の狙い撃ち query は安価で、広告混入の有無検出に必須）。
    /** @param {string} sel */
    const rHas = (sel) => {
      try {
        return !!(/** @type {any} */ (root).querySelector(sel));
      } catch {
        return false;
      }
    };
    /** @param {Element} el */
    const classOf = (el) => {
      let raw = '';
      try {
        raw =
          (el && typeof el.getAttribute === 'function'
            ? el.getAttribute('class')
            : '') || '';
      } catch {
        raw = '';
      }
      if (!raw && /** @type {any} */ (el)?.className) {
        const cn = /** @type {any} */ (el).className;
        raw = typeof cn === 'string' ? cn : String(cn?.baseVal || '');
      }
      return String(raw).slice(0, 100);
    };

    // row 状の繰り返し要素を最大 8 件、構造フィンガープリントだけ採る。
    // 専用 selector ＋汚染回帰テストを後続で書くのに必要十分な情報。
    /** @type {Record<string, unknown>[]} */
    const rowSamples = [];
    /** @type {Element[]} */
    let rowEls = [];
    try {
      const nodeList = container.querySelectorAll(
        'li, [role="listitem"], [class*="item"], [class*="ranker"], [class*="row"]'
      );
      rowEls = Array.prototype.slice.call(nodeList, 0, 8);
    } catch {
      rowEls = [];
    }
    for (const el of rowEls) {
      if (!el || typeof (/** @type {any} */ (el).querySelector) !== 'function') {
        continue;
      }
      let txt = '';
      try {
        txt = String(el.textContent || '').trim();
      } catch {
        txt = '';
      }
      rowSamples.push({
        tag: String(/** @type {any} */ (el).tagName || '').toLowerCase().slice(0, 16),
        cls: classOf(el),
        childCount: Number(/** @type {any} */ (el).childElementCount || 0) || 0,
        hasNameish: !!el.querySelector('[class*="name"], [class*="Name"]'),
        hasRankerish: !!el.querySelector('[class*="ranker"], button'),
        hasThumb: !!el.querySelector('[class*="thumb"], [class*="Thumb"], img'),
        // 値そのものは採らない（PII/正確性配慮）。数字を含むか＋長さのみ。
        hasDigits: /\d/.test(txt),
        txtLen: txt.length
      });
    }

    let containerClass = '';
    let childCount = 0;
    let descendantCount = 0;
    let txtLen = 0;
    try {
      containerClass = classOf(container).slice(0, 200);
      childCount = Number(/** @type {any} */ (container).childElementCount || 0) || 0;
      descendantCount = Math.min(
        9999,
        container.querySelectorAll('*').length || 0
      );
      txtLen = String(container.textContent || '').trim().length;
    } catch {
      /* bounded best-effort */
    }

    return {
      probe: 'ok',
      matchedBy,
      containerClass,
      childCount,
      descendantCount,
      txtLen,
      sel: {
        // すべて container スコープ（full document を走査しない＝critic (i)）
        contribListish: cHas(
          '[class*="contribution-ranking"], [class*="contributionRanking"], .contribution-ranking-list'
        ),
        rankerish: cCount('[class*="ranker"], .ranker'),
        nameish: cCount('[class*="name"], [class*="Name"]'),
        contributionish: cCount(
          '[class*="contribution"]:not([class*="contribution-ranking"]):not([class*="contribution-unit"])'
        ),
        thumbish: cCount('[class*="thumb"], [class*="Thumb"], img'),
        listItems: cCount('li, [role="listitem"]'),
        // 広告ランキング混入の有無を後続の専用 selector 設計／汚染回帰
        // テストで切り分けるための観測（document スコープの単発 query）
        adIshNearby: rHas('[class*="advertiser"], [href*="nicoad"], [class*="nicoad"]')
      },
      rowSamples
    };
  } catch {
    return { probe: 'error' };
  }
}
