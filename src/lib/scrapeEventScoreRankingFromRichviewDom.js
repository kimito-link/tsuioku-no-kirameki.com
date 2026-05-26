/**
 * audition richview（イベント💎順位リスト想定）の DOM から順位つきスコア行を掬う純関数（PR2）。
 *
 * scrapeContributionRankingFromDom との差分（HANDOFF・codex）:
 *   - DOM 走査順や index を順位として扱わない（1〜3 位 SVG だけ等での誤順位を避ける）。
 *   - 各行について rank と score が **明示テキストから確定**できなければ全体を不採用（null）。
 *   - 確定できた rank は昇順かつギャップのない連番・重複なしであることを検証する。
 */

/**
 * @typedef {{
 *   rank: number,
 *   score: number,
 *   name: string,
 *   isAnonymous: boolean,
 *   thumbnailUrl: string,
 *   userId?: string,
 * }} EventScoreRankingRow
 */

/**
 * scrapeContributionRankingFromDom と揃える（関数は export せず、このモジュール専用のコピー）。
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeRankerAltName(value) {
  let s = String(value == null ? '' : value).trim();
  if (!s) return '';
  s = s
    .replace(/\s+/g, ' ')
    .replace(
      /(?:さん)?(?:の)?(?:プロフィール画像|ユーザーアイコン|アイコン|サムネイル|avatar|icon|thumbnail)$/i,
      ''
    )
    .replace(/\s*さん\s*$/u, '')
    .trim();
  if (!s) return '';
  if (/^(?:ユーザー|ゲスト|匿名|名無し)?(?:アイコン|サムネイル|avatar|icon|thumbnail)$/i.test(s)) {
    return '';
  }
  return s;
}

/**
 * @param {HTMLElement|null} thumbEl
 * @returns {string}
 */
function pickRankerNameFromThumbAlt(thumbEl) {
  if (!(thumbEl instanceof HTMLElement)) return '';
  const img = thumbEl.matches('img') ? thumbEl : thumbEl.querySelector('img');
  const candidates = [
    img instanceof HTMLElement ? img.getAttribute('alt') : '',
    img instanceof HTMLElement ? img.getAttribute('title') : '',
    img instanceof HTMLElement ? img.getAttribute('aria-label') : '',
    thumbEl.getAttribute('title'),
    thumbEl.getAttribute('aria-label')
  ];
  for (const c of candidates) {
    const name = normalizeRankerAltName(c);
    if (name) return name;
  }
  return '';
}

/**
 * @param {HTMLElement|null} rankEl
 * @returns {number|null}
 */
function parseExplicitRank(rankEl) {
  if (!(rankEl instanceof HTMLElement)) return null;

  const tryDigits = (/** @type {string|null|undefined} */ txt) => {
    const digits = String(txt || '').replace(/[^\d]/g, '');
    if (/^\d+$/.test(digits)) return parseInt(digits, 10);
    return null;
  };

  let r = tryDigits(rankEl.textContent);
  if (r != null) return r;
  const span = rankEl.querySelector(':scope span');
  r = tryDigits(span?.textContent || '');
  if (r != null) return r;
  const strong = rankEl.querySelector(
    'strong.rank-num, strong[class*="rank-num"], strong[class*="RankNum"], [class*="rank-num"], [class*="RankNum"]'
  );
  r = strong instanceof HTMLElement ? tryDigits(strong.textContent || '') : null;
  return r != null ? r : null;
}

/**
 * @param {EventScoreRankingRow[]} rows
 * @returns {boolean}
 */
function ranksAreDenseAndUnique(rows) {
  if (rows.length === 0) return false;
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  /** @type {Set<number>} */
  const seen = new Set();
  for (let i = 0; i < sorted.length; i++) {
    const rk = sorted[i].rank;
    if (!Number.isFinite(rk)) return false;
    if (rk <= 0) return false;
    if (seen.has(rk)) return false;
    seen.add(rk);
    if (i > 0 && sorted[i].rank !== sorted[i - 1].rank + 1) return false;
  }
  return true;
}

/**
 * @param {HTMLElement} li
 * @returns {number|null}
 */
function findRankValueInElement(li) {
  const allElements = li.querySelectorAll('*');
  for (const el of allElements) {
    const text = String(el.textContent || '').trim();
    const m = text.match(/^\s*(\d+)\s*位?\s*$/);
    if (m) {
      const val = parseInt(m[1], 10);
      if (val >= 1 && val <= 100) {
        return val;
      }
    }
  }
  return null;
}

/**
 * @param {HTMLElement} li
 * @param {number} rank
 * @returns {number|null}
 */
function findScoreValueInElement(li, rank) {
  const allElements = li.querySelectorAll('*');
  for (const el of allElements) {
    if (el.children.length > 0) continue;
    const text = String(el.textContent || '').trim();
    if (text === String(rank) || text === `${rank}位` || text === `${rank} 位`) continue;

    const cleaned = text.replace(/,/g, '').replace(/[💎pt\s]/giu, '').trim();
    if (/^\d+$/.test(cleaned)) {
      const val = parseInt(cleaned, 10);
      if (val > 0) {
        return val;
      }
    }
  }
  return null;
}

/**
 * 実機 richview SPA（Emotion CSS）のサポーター順位リストを掬う（2026-05-26 実機採取）。
 *
 * 実DOM（[[reference_richview_event_ranking_emotion_dom]]）:
 *   div.e16w44943            ← 行
 *   ├ div.e1abt54u0          ← 順位（数字）
 *   ├ div.e16w44942          ← 名前+サムネ wrapper
 *   │ ├ a.e16w44941          ← 名前（リンク）
 *   │ └ span.e16w44940       ← 敬称「さん」
 *   └ div.css-vcb5i6         ← スコア wrapper（svg💎 + p[数字]）
 *
 * Emotion の後段ラベル（e16w44943 等）は source 由来で安定。前段 css-xxxxx は描画毎に変わる。
 * 順位は安定ラベル e1abt54u0 で確定。スコアは「行内・順位 div 以外の数字テキスト（💎の隣の p）」で位置同定し、
 * css-1d9a3hd のような不安定 hash はハードコードしない。
 *
 * @param {Document|Element} root
 * @returns {EventScoreRankingRow[]|null} 1 件以上採れたら配列、無ければ null
 */
function scrapeEmotionRichviewSupporterRows(root) {
  /** @type {NodeListOf<Element>|Element[]} */
  let rowEls = [];
  try {
    rowEls = /** @type {any} */ (root).querySelectorAll?.('[class~="e16w44943"]') || [];
  } catch {
    return null;
  }
  if (!rowEls || rowEls.length === 0) return null;

  /** @type {EventScoreRankingRow[]} */
  const rows = [];
  for (const row of /** @type {Iterable<Element>} */ (rowEls)) {
    if (!(row instanceof HTMLElement)) continue;

    // 順位（安定ラベル e1abt54u0・数字のみ）
    const rankEl = row.querySelector('[class~="e1abt54u0"], [class*="e1abt54u0"]');
    const rankDigits = String((rankEl && rankEl.textContent) || '').replace(/[^\d]/g, '');
    if (!/^\d+$/.test(rankDigits)) return null; // 順位が確定できなければ全体不採用（誤値ゼロ）
    const rank = parseInt(rankDigits, 10);
    if (!Number.isFinite(rank) || rank <= 0) return null;

    // 名前（a.e16w44941）。敬称 span.e16w44940 は除去。無ければ「名無し」で継続（行は捨てない）。
    const nameEl = row.querySelector('a[class~="e16w44941"], a[class*="e16w44941"]');
    /** @type {HTMLAnchorElement|null} */
    const nameAnchor = nameEl instanceof HTMLAnchorElement ? nameEl : null;
    let name = '';
    if (nameEl instanceof HTMLElement) {
      const clone = nameEl.cloneNode(true);
      if (clone instanceof HTMLElement) {
        for (const h of clone.querySelectorAll('[class~="e16w44940"], [class*="e16w44940"], .honorific, [class*="honorific"]')) {
          h.remove();
        }
        name = String(clone.textContent || '').replace(/\s+/g, ' ').trim();
      }
    }
    const isAnonymous = !name || name === '名無し';
    if (!name) name = '名無し';

    // userId（名前リンクの href /user/<uid> から拾えれば）。サムネ合成や記名リンクに使える。
    let userId = '';
    try {
      const href = nameAnchor ? String(nameAnchor.getAttribute('href') || '') : '';
      const m = href.match(/\/user\/(\d{2,})/);
      if (m) userId = m[1];
    } catch { /* no-op */ }

    // スコア: 行内で「順位 div 以外」かつ「数字のみ」のリーフ要素を探す。💎svg の隣の <p> が本命。
    let score = null;
    /** @type {HTMLElement[]} */
    const numLeaves = [];
    for (const el of row.querySelectorAll('p, span, div, strong, b')) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.children.length > 0) continue; // リーフのみ
      if (rankEl && (el === rankEl || rankEl.contains(el) || el.contains(rankEl))) continue;
      const t = String(el.textContent || '').trim();
      if (!t) continue;
      const cleaned = t.replace(/,/g, '').replace(/[💎pt\s]/giu, '').trim();
      if (/^\d+$/.test(cleaned)) numLeaves.push(el);
    }
    // スコアは順位より桁が大きい想定。複数あれば最大値（💎pt）を採る。
    for (const el of numLeaves) {
      const v = parseInt(String(el.textContent || '').replace(/[^\d]/g, ''), 10);
      if (Number.isFinite(v) && v > 0) {
        if (score == null || v > score) score = v;
      }
    }
    if (score == null) return null; // スコアが確定できない＝不採用

    // サムネ（遅延読み込みのことが多い・無ければ空）
    let thumbnailUrl = '';
    const thumbWrap = row.querySelector('[class~="e16w44942"], [class*="e16w44942"]') || row;
    if (thumbWrap instanceof HTMLElement) {
      const img = thumbWrap.querySelector('img[src]');
      if (img instanceof HTMLImageElement) {
        const u = String(img.currentSrc || img.src || '').trim();
        if (/^https?:\/\//i.test(u)) thumbnailUrl = u;
      }
      if (!thumbnailUrl) {
        for (const el of thumbWrap.querySelectorAll('[style*="background-image"]')) {
          const bg = el instanceof HTMLElement ? String(el.style?.backgroundImage || '') : '';
          const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
          if (m && /^https?:\/\//i.test(m[1])) { thumbnailUrl = m[1]; break; }
        }
      }
    }

    rows.push({
      rank,
      score,
      name,
      isAnonymous,
      thumbnailUrl,
      ...(userId ? { userId } : {})
    });
  }

  if (rows.length === 0 || !ranksAreDenseAndUnique(rows)) return null;
  rows.sort((a, b) => a.rank - b.rank);
  return rows;
}

/**
 * @param {Document|Element|null|undefined} root
 * @returns {EventScoreRankingRow[]|null}
 */
export function scrapeEventScoreRankingFromRichviewDom(root) {
  if (!root) return null;

  // 1) 実機 richview（Emotion CSS）の本命構造を最優先で試す。
  try {
    const emotionRows = scrapeEmotionRichviewSupporterRows(/** @type {any} */ (root));
    if (emotionRows && emotionRows.length > 0) return emotionRows;
  } catch {
    /* fall through to legacy paths */
  }

  /** @type {NodeListOf<Element>|Element[]} */
  let lis = [];
  try {
    lis =
      /** @type {any} */ (root).querySelectorAll?.(
        '.content-supporter-section ul.wrapper > li.item'
      ) || [];
    if (!lis || lis.length === 0) {
      lis =
        /** @type {any} */ (root).querySelectorAll?.('[class*="content-supporter"] ul > li[class*="item"]:not([class*="items"])') ||
        [];
    }
    if (!lis || lis.length === 0) {
      lis =
        /** @type {any} */ (root).querySelectorAll?.('[class*="contribution-ranking"] li[class*="item"]') || [];
    }
  } catch {
    return null;
  }

  /** @type {EventScoreRankingRow[]} */
  const rows = [];

  if (lis && lis.length > 0) {
    for (const li of /** @type {Iterable<Element>} */ (lis)) {
      if (!(li instanceof HTMLElement)) return null;

      const rankEl =
        li.querySelector('i.rank') ||
        li.querySelector('strong.rank-num, strong[class*="rank-num"]') ||
        li.querySelector('[class*="rank-num"]:not([class*="ranker"])') ||
        li.querySelector(':scope > [class*="rank"]:not([class*="ranker"])') ||
        li.querySelector('.rank');

      const rank = parseExplicitRank(rankEl instanceof HTMLElement ? rankEl : null);
      if (rank == null) return null;

      const rankerEl =
        li.querySelector('.ranker') ||
        li.querySelector('button.ranker') ||
        li.querySelector('[class*="ranker"]:not([class*="ranker-name"])');

      const nameEl =
        (rankerEl instanceof HTMLElement &&
          (rankerEl.querySelector(':scope > .name') || rankerEl.querySelector('.name'))) ||
        li.querySelector('.ranker-name-value') ||
        li.querySelector('[class*="ranker-name-value"]') ||
        null;

      const contribEl =
        li.querySelector('.contribution') ||
        li.querySelector('[class*="contribution"]:not([class*="contribution-ranking"]):not([class*="contribution-unit"])') ||
        null;

      const thumbEl =
        (rankerEl instanceof HTMLElement && rankerEl.querySelector('.thumbnail')) ||
        li.querySelector('.thumbnail') ||
        li.querySelector('[class*="thumbnail"]');

      const altName = pickRankerNameFromThumbAlt(thumbEl instanceof HTMLElement ? thumbEl : null);

      if (!(contribEl instanceof HTMLElement) || (!(nameEl instanceof HTMLElement) && !altName)) return null;

      const nameClone = nameEl instanceof HTMLElement ? nameEl.cloneNode(true) : null;
      if (nameClone instanceof HTMLElement) {
        const honorific = nameClone.querySelector('.honorific, [class*="honorific"]');
        if (honorific) honorific.remove();
      }
      const name = String(
        nameClone instanceof HTMLElement
          ? nameClone.textContent
          : nameEl instanceof HTMLElement
            ? nameEl.textContent || ''
            : altName
      ).trim() || altName;
      if (!name) return null;

      const contribDigits = String(contribEl.textContent || '').replace(/[^\d]/g, '');
      if (!/^\d+$/.test(contribDigits)) return null;
      const contribution = parseInt(contribDigits, 10);

      const isAnonymous =
        (rankerEl instanceof HTMLElement && rankerEl.hasAttribute('disabled')) ||
        (nameEl instanceof HTMLElement && nameEl.getAttribute('data-button-disabled') === 'true') ||
        name === '名無し';

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

      rows.push({
        rank,
        score: contribution,
        name,
        isAnonymous,
        thumbnailUrl
      });
    }
  }

  // --- FALLBACK SCRAPER FOR RANDOM/EMOTION DOM STRUCTURES ---
  if (rows.length === 0) {
    try {
      const allLis = root.querySelectorAll('li');
      for (const li of /** @type {Iterable<Element>} */ (allLis)) {
        if (!(li instanceof HTMLElement)) continue;

        // 1. Find rank
        const rank = findRankValueInElement(li);
        if (rank == null) continue;

        // 2. Find score
        const score = findScoreValueInElement(li, rank);
        if (score == null) continue;

        // 3. Find thumbnail and nickname from img element
        const img = li.querySelector('img');
        let thumbnailUrl = '';
        let name = '';
        if (img instanceof HTMLImageElement) {
          thumbnailUrl = String(img.currentSrc || img.src || '').trim();
          const alt = img.getAttribute('alt') || img.getAttribute('title') || '';
          name = normalizeRankerAltName(alt);
        }

        // 4. Fallback nickname extraction from leaf text nodes
        if (!name) {
          /** @type {string[]} */
          const candidates = [];
          const leafEls = li.querySelectorAll('*');
          for (const el of leafEls) {
            if (el.children.length > 0) continue; // leaf node
            const txt = String(el.textContent || '').trim();
            if (!txt) continue;
            if (txt === String(rank) || txt === `${rank}位`) continue;
            const cleaned = txt.replace(/,/g, '').replace(/[💎pt\s]/giu, '').trim();
            if (cleaned && /^\d+$/.test(cleaned)) continue;
            if (txt === 'さん' || txt === '💎' || txt === 'pt') continue;
            candidates.push(txt);
          }
          if (candidates.length > 0) {
            candidates.sort((a, b) => b.length - a.length);
            name = normalizeRankerAltName(candidates[0]);
          }
        }

        if (!name) continue;

        const isAnonymous = name === '名無し';

        rows.push({
          rank,
          score,
          name,
          isAnonymous,
          thumbnailUrl
        });
      }
    } catch {
      return null;
    }
  }

  if (rows.length === 0 || !ranksAreDenseAndUnique(rows)) return null;
  rows.sort((a, b) => a.rank - b.rank);
  return rows;
}
