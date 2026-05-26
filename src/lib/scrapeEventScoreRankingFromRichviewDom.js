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
 * ★本命★ 実機 richview の「イベントランキング」（=このイベントに参加している
 * 配信者たちの💎スコア順位。1位あめ / 2位この / … 25位）を掬う（2026-05-26 ユーザー提供生HTMLで確定）。
 *
 * 実DOM（[[reference_richview_event_ranking_emotion_dom]] の「本物のイベントランキング」）:
 *   <h2 class="e1hv4cge4">イベントランキング</h2>
 *   div.el69c2m4               ← 行（1〜25 位の繰り返し）
 *   ├ div.ebq6m483             ← 順位ブロック（1-3 位は王冠 svg）
 *   │ ├ span.ebq6m481 "2"      ← 順位の数字
 *   │ └ span.ebq6m480 "位"
 *   ├ div.el69c2m3             ← サムネ（背景画像 or 空）
 *   └ div
 *     ├ p.el69c2m2
 *     │ ├ span.el69c2m1 "この" ← 名前
 *     │ └ span.el69c2m0 "さん" ← 敬称（除去）
 *     └ div.css-8zj0aw（💎svg + p.css-z40gn4 "3,452,500"）← スコア
 *
 * ⚠️ サポーター貢献ランキング（行 e16w44943）とは別物。こちらが配信者順位＝ユーザー要望。
 * Emotion 後段ラベル（el69c2m4 等）は source 由来で安定。前段 css-xxxxx は描画毎に変わる。
 *
 * @param {Document|Element} root
 * @returns {EventScoreRankingRow[]|null} 1 件以上採れたら配列、無ければ null
 */
function scrapeRealEventRankingRows(root) {
  /** @type {NodeListOf<Element>|Element[]} */
  let rowEls = [];
  try {
    rowEls = /** @type {any} */ (root).querySelectorAll?.('[class~="el69c2m4"]') || [];
  } catch {
    return null;
  }
  if (!rowEls || rowEls.length === 0) return null;

  /** @type {EventScoreRankingRow[]} */
  const rows = [];
  for (const row of /** @type {Iterable<Element>} */ (rowEls)) {
    if (!(row instanceof HTMLElement)) continue;

    // 順位（span.ebq6m481・数字のみ。「位」= span.ebq6m480 は別なので混ざらない）
    const rankEl = row.querySelector('[class~="ebq6m481"], [class*="ebq6m481"]');
    const rankDigits = String((rankEl && rankEl.textContent) || '').replace(/[^\d]/g, '');
    if (!/^\d+$/.test(rankDigits)) return null; // 順位が確定できなければ全体不採用（誤値ゼロ）
    const rank = parseInt(rankDigits, 10);
    if (!Number.isFinite(rank) || rank <= 0) return null;

    // 名前（span.el69c2m1）。敬称 span.el69c2m0「さん」は別 span なので含まれない。
    const nameEl = row.querySelector('[class~="el69c2m1"], [class*="el69c2m1"]');
    let name = nameEl instanceof HTMLElement
      ? String(nameEl.textContent || '').replace(/\s+/g, ' ').trim()
      : '';
    const isAnonymous = !name || name === '名無し';
    if (!name) name = '名無し';

    // スコア（p.css-z40gn4・💎svg の隣）。安定ラベルが無い hash なので、
    // まず css-z40gn4 を狙い、無ければ行内の「順位以外の数字リーフ」最大値にフォールバック。
    let score = null;
    const scoreEl = row.querySelector('[class~="css-z40gn4"], [class*="css-z40gn4"]');
    if (scoreEl instanceof HTMLElement) {
      const d = String(scoreEl.textContent || '').replace(/[^\d]/g, '');
      if (/^\d+$/.test(d)) score = parseInt(d, 10);
    }
    if (score == null) {
      for (const el of row.querySelectorAll('p, span, div, strong, b')) {
        if (!(el instanceof HTMLElement) || el.children.length > 0) continue;
        if (rankEl && (el === rankEl || rankEl.contains(el) || el.contains(rankEl))) continue;
        const t = String(el.textContent || '').trim();
        const cleaned = t.replace(/,/g, '').replace(/[💎pt\s]/giu, '').trim();
        if (/^\d+$/.test(cleaned)) {
          const v = parseInt(cleaned, 10);
          if (Number.isFinite(v) && v > 0 && (score == null || v > score)) score = v;
        }
      }
    }
    if (score == null || score <= 0) return null;

    // サムネ（el69c2m3 の背景画像。1-3 位以外は空のことが多い→空許容）
    let thumbnailUrl = '';
    const thumbEl = row.querySelector('[class~="el69c2m3"], [class*="el69c2m3"]');
    if (thumbEl instanceof HTMLElement) {
      const bg = String(thumbEl.style?.backgroundImage || '');
      const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
      if (m && /^https?:\/\//i.test(m[1])) thumbnailUrl = m[1];
      if (!thumbnailUrl) {
        const img = thumbEl.querySelector('img[src]');
        if (img instanceof HTMLImageElement) {
          const u = String(img.currentSrc || img.src || '').trim();
          if (/^https?:\/\//i.test(u)) thumbnailUrl = u;
        }
      }
    }

    rows.push({ rank, score, name, isAnonymous, thumbnailUrl });
  }

  if (rows.length === 0 || !ranksAreDenseAndUnique(rows)) return null;
  rows.sort((a, b) => a.rank - b.rank);
  return rows;
}

/**
 * 実機 richview SPA（Emotion CSS）のサポーター順位リストを掬う（2026-05-26 実機採取）。
 *
 * ⚠️ これは「サポーター貢献ランキング」（この番組へギフトを贈った応援者）であって、
 * ユーザーが欲しい「イベント参加配信者の順位」ではない。本命は scrapeRealEventRankingRows。
 * 後方互換・フォールバック用に温存（本命が取れないときのみ最後に試す）。
 *
 * 実DOM:
 *   div.e16w44943 ← 行 / div.e1abt54u0 ← 順位 / a.e16w44941 ← 名前 / span.e16w44940 ← 敬称
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

  // 1) ★本命★ 実機 richview の「イベントランキング」（参加配信者の💎順位）を最優先。
  try {
    const realRows = scrapeRealEventRankingRows(/** @type {any} */ (root));
    if (realRows && realRows.length > 0) return realRows;
  } catch {
    /* fall through */
  }

  // 2) フォールバック: サポーター貢献ランキング（応援者順位）。本命が無いときのみ。
  //    ⚠️ ユーザー要望は本命(1)。これは別物だが後方互換で温存。
  try {
    const supporterRows = scrapeEmotionRichviewSupporterRows(/** @type {any} */ (root));
    if (supporterRows && supporterRows.length > 0) return supporterRows;
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
