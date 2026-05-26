/**
 * audition.nicovideo.jp `/embedded/richview/live` 向けの診断ペイロード（PR1）。
 *
 * イベント💎スコア順ランキングは cross-origin richview iframe 内にあり、親は
 * DOM を読めない。iframe 内 content script が本当に注入されているか・DOM 概形を
 * postMessage 経由で観測するための bounded 純関数（本文 raw ・ PII は持たない）。
 *
 * 副作用なし。
 */

import { scrapeContributionRankingFromDom } from './officialEventBannerDom.js';

/**
 * @param {string|null|undefined} href
 * @returns {boolean}
 */
export function isAuditionRichviewLivePath(href) {
  try {
    const u = new URL(String(href || ''));
    if (u.hostname.toLowerCase() !== 'audition.nicovideo.jp') return false;
    const p = u.pathname.toLowerCase();
    return p.includes('/embedded/richview/live');
  } catch {
    return false;
  }
}

/**
 * @param {Document|null|undefined} doc
 * @param {{ contribRowCount?: number }} [opts]
 * @returns {Record<string, unknown>}
 */
export function captureAuditionRichviewEventScoreDiagProbe(doc, opts) {
  /** @type {Record<string, unknown>} */
  const out = {
    probe: 'richview-event-score-diag-v1',
    readyState: 'unknown',
    bodyTextLen: null,
    contribRowCountFromScrape: null,
    counts: /** @type {Record<string, number>} */ ({}),
    classSamples: /** @type {string[]} */ ([])
  };
  try {
    if (!doc || typeof doc.querySelector !== 'function') {
      out.probe = 'no-doc';
      return out;
    }
    out.readyState = String(doc.readyState || 'unknown');
    const body = doc.body;
    if (!body) {
      out.probe = 'no-body';
      return out;
    }
    try {
      const t = body.innerText || body.textContent || '';
      const n = String(t).length;
      out.bodyTextLen = Math.min(Math.max(0, n), 2000000);
    } catch {
      out.bodyTextLen = null;
    }

    if (typeof opts?.contribRowCount === 'number' && Number.isFinite(opts.contribRowCount)) {
      out.contribRowCountFromScrape = Math.max(0, Math.floor(opts.contribRowCount));
    } else {
      try {
        const rows = scrapeContributionRankingFromDom(doc);
        out.contribRowCountFromScrape =
          rows === null ? 0 : Array.isArray(rows) ? rows.length : 0;
      } catch {
        out.contribRowCountFromScrape = null;
      }
    }

    /** @param {string} sel */
    const qCount = (sel) => {
      try {
        return doc.querySelectorAll(sel).length;
      } catch {
        return -1;
      }
    };
    /** @type {Array<[string, string]>} */
    const selectors = [
      ['supporter_li', '.content-supporter-section ul.wrapper > li.item'],
      ['ranker_li', '.contribution-ranking-list .ranker'],
      ['contrib_ranking_any', '[class*="contribution-ranking"]'],
      ['ranker_any', '[class*="ranker"]'],
      ['owner_name', '.owner-name, [class*="owner-name"]'],
      ['content_module', '[class*="___content___"]'],
      ['rank_num_strong', 'strong.rank-num, [class*="rank-num"]'],
      ['score_like', '[class*="score"]']
    ];
    const counts = /** @type {Record<string, number>} */ ({});
    for (const [k, sel] of selectors) {
      counts[k] = qCount(sel);
    }
    out.counts = counts;

    try {
      /** @type {string[]} */
      const samples = [];
      const els = doc.querySelectorAll('[class]');
      const MAX = 8;
      for (let i = 0; i < els.length && samples.length < MAX; i++) {
        const el = els[i];
        let raw = '';
        try {
          raw =
            el && typeof el.getAttribute === 'function' ? el.getAttribute('class') || '' : '';
        } catch {
          raw = '';
        }
        if (!raw && el && /** @type {any} */ (el).className) {
          const cn = /** @type {any} */ (el).className;
          raw = typeof cn === 'string' ? cn : String((cn && cn.baseVal) || '');
        }
        const s = String(raw).slice(0, 80);
        const lower = s.toLowerCase();
        if (
          s &&
          (s.includes('___') ||
            lower.includes('rank') ||
            lower.includes('supporter') ||
            lower.includes('contribution'))
        ) {
          samples.push(s);
        }
      }
      if (samples.length === 0) {
        const arr = Array.prototype.slice.call(els, 0, 4);
        for (const el of arr) {
          let raw = '';
          try {
            raw = el?.getAttribute?.('class') || '';
          } catch {
            raw = '';
          }
          samples.push(String(raw).slice(0, 80));
        }
      }
      out.classSamples = samples.slice(0, MAX);
    } catch {
      out.classSamples = [];
    }

    return out;
  } catch {
    out.probe = 'throw';
    return out;
  }
}
