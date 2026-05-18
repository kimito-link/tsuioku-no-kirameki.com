/**
 * gift sub-app iframe（gift/koken/audition.nicovideo.jp）内の scrape が 0 件の
 * とき、その iframe DOM の「概形」だけを bounded・観測専用に要約する純関数。
 * 副作用なし・挙動不変（読み取りのみ）。
 *
 * 目的（Scope B＝公式イベント上位ランキング鏡 の安全修正の前提）:
 * relay heartbeat は届くのに contrib/eventBanner が 0 のとき、原因が
 *   (a) Vue 未 mount（warmup iframe が空シェルのまま）
 *   (b) mount 済だが selector 不一致（CSS-module hash 変化）
 *   (c) そもそも対象 DOM がその frame に無い
 * のどれかを、次の診断バンドルで実証可能にする（"取得可否の観測層を先に作る"）。
 * これにより、実機 cross-origin DOM サンプル無しでの盲目的 selector/warmup
 * 変更（v0.1.223 級回帰リスク）を避け、エビデンスベースで安全に直せる。
 *
 * PII 非収集: 収集対象は「構造的 class 名」「候補 selector の存在可否・件数」
 * 「本文テキストは"長さ"のみ（値は採らない）」。すべて長さ/件数を上限 cap。
 *
 * @param {Document|null|undefined} doc iframe の document
 * @returns {Record<string, unknown>}
 */
export function captureGiftSubAppIframeDomShape(doc) {
  try {
    if (!doc || typeof doc.querySelector !== 'function') {
      return { probe: 'no-doc' };
    }
    const body = doc.body || null;
    if (!body) return { probe: 'no-body' };
    const bodyClass = String(body.className || '').slice(0, 200);
    const childCount = Number(body.childElementCount || 0) || 0;
    const txtLen = String(body.textContent || '').trim().length;
    /** @param {string} sel */
    const qCount = (sel) => {
      try {
        return doc.querySelectorAll(sel).length;
      } catch {
        return -1;
      }
    };
    /** @param {string} sel */
    const has = (sel) => {
      try {
        return !!doc.querySelector(sel);
      } catch {
        return false;
      }
    };
    /** @type {string[]} */
    let classSamples = [];
    try {
      const els = doc.querySelectorAll('[class]');
      const arr = Array.prototype.slice.call(els, 0, 6);
      classSamples = arr.map((/** @type {any} */ el) => {
        // SVG 要素の className は SVGAnimatedString（String 化すると
        // "[object SVGAnimatedString]" になる）。getAttribute('class') は
        // HTML/SVG 双方で生の class 文字列を返すので一貫する。
        let raw = '';
        try {
          raw =
            (el && typeof el.getAttribute === 'function'
              ? el.getAttribute('class')
              : '') || '';
        } catch {
          raw = '';
        }
        if (!raw && el && el.className) {
          raw =
            typeof el.className === 'string'
              ? el.className
              : String((el.className && el.className.baseVal) || '');
        }
        return String(raw).slice(0, 64);
      });
    } catch {
      classSamples = [];
    }
    return {
      bodyClass,
      childCount,
      txtLen,
      sel: {
        contribList: has(
          '.contribution-ranking-list, [class*="contribution-ranking"]'
        ),
        ranker: qCount('.ranker, [class*="ranker"]'),
        ownerName: has('.owner-name, [class*="owner-name"]'),
        thumbnail: qCount('.thumbnail, [class*="thumbnail"]'),
        richview: has('[class*="rich-view"], [class*="richview"]'),
        eventName: has('[class*="event-name"], [class*="eventName"]'),
        appRoot: has('#app, [data-v-app], [id*="app"]'),
        // v0.1.282 観測拡充（会議室）: koken supporter 本体 / ランキング系
        // DOM の所在を実証するための候補。次の診断でどの selector が
        // 立つかで「mount したか / どの構造か」を判定し、安全な追補へ繋ぐ。
        supporter: has('[class*="supporter"], [class*="Supporter"]'),
        rankingWord: qCount(
          '[class*="ranking"], [class*="Ranking"], [class*="rank"]'
        ),
        rankingLink: has(
          'a[href*="ranking"], a[href*="supporter"], a[href*="gift"]'
        ),
        tabish: qCount('nav, [role="tab"], [role="tablist"], [class*="tab"]'),
        listItems: qCount('li, [role="listitem"]'),
        imgCount: qCount('img'),
        dataVApp: has('[data-v-app], [data-server-rendered]')
      },
      classSamples
    };
  } catch {
    return { probe: 'error' };
  }
}
