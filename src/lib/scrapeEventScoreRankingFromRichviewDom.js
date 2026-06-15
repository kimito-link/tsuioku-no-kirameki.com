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
 * richview の「軽い署名」を作る純関数（v0.1.385・codex 会議の二段化用）。
 * 順位/名前/スコアの**テキストのみ**を連結する（getComputedStyle もサムネ走査もしない）。
 * これが前回と同じなら重い full scrape（サムネの getComputedStyle 等）を skip できる。
 * イベント名の切替も検知できるよう select の選択値も含める。
 *
 * @param {Document|Element|null|undefined} root
 * @returns {string} 変化検知用の署名（空なら算出不可）
 */
export function computeRichviewEventCheapSig(root) {
  if (!root) return '';
  /** @type {any} */
  const r = root;
  try {
    /** @type {string[]} */
    const parts = [];
    // ハッシュ非依存の構造ベース抽出を最優先（getComputedStyle を呼ばずテキストのみ）。
    let usedStructural = false;
    try {
      const core = extractEventRankingRowsCore(/** @type {any} */ (root));
      if (core && core.length > 0) {
        usedStructural = true;
        for (const row of core) {
          parts.push(String(row.rank) + ':' + row.name.replace(/\s+/g, '') + ':' + String(row.score));
        }
      }
    } catch { /* fall back to class-based below */ }

    if (!usedStructural) {
      const rows = r.querySelectorAll?.('[class~="el69c2m4"]') || [];
      for (const row of /** @type {Iterable<Element>} */ (rows)) {
        if (!(row instanceof HTMLElement)) continue;
        const rankEl = row.querySelector('[class~="ebq6m481"], [class*="ebq6m481"]');
        const nameEl = row.querySelector('[class~="el69c2m1"], [class*="el69c2m1"]');
        const scoreEl = row.querySelector('[class~="css-z40gn4"], [class*="css-z40gn4"]');
        const rk = String((rankEl && rankEl.textContent) || '').replace(/\s+/g, '');
        const nm = String((nameEl && nameEl.textContent) || '').replace(/\s+/g, '');
        const sc = String((scoreEl && scoreEl.textContent) || '').replace(/\s+/g, '');
        parts.push(rk + ':' + nm + ':' + sc);
      }
    }
    // バナーの本人順位/スコア + 選択中イベント名も署名に含める
    const selfRank = r.querySelector?.('[class~="e1awe04q0"], [class*="e1awe04q0"]');
    const sel = r.querySelector?.('select');
    let selTxt = '';
    try {
      if (sel && sel.options) {
        const o = sel.options[sel.selectedIndex >= 0 ? sel.selectedIndex : 0];
        selTxt = o ? String(o.textContent || '').replace(/\s+/g, '') : '';
      }
    } catch { /* no-op */ }
    parts.push('self:' + String((selfRank && selfRank.textContent) || '').replace(/\s+/g, ''));
    parts.push('ev:' + selTxt);
    return parts.join('|');
  } catch {
    return '';
  }
}

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
 * 取得成功したサムネ URL を要素単位でキャッシュ（getComputedStyle 再呼び出し回避）。
 * 同じ行要素は再描画されない限り URL が変わらないため、成功分は WeakMap で再利用する。
 * @type {WeakMap<HTMLElement, string>}
 */
const _thumbUrlCache = typeof WeakMap === 'function' ? new WeakMap() : /** @type {any} */ (null);

/**
 * 要素（またはその子孫）からサムネ画像 URL を拾う。
 * richview のアバターは `el69c2m3` 空 div に Emotion クラス由来の CSS background-image で
 * 描画されるため、inline style だけでなく **computed style** も見る必要がある。
 * 成功 URL は WeakMap キャッシュ（4 秒ごとの getComputedStyle 連打を避ける／挙動不変）。
 *
 * @param {HTMLElement|null} el
 * @param {{ searchDescendants?: boolean }} [opts]
 * @returns {string}
 */
function pickThumbnailUrlFromElement(el, opts) {
  if (!(el instanceof HTMLElement)) return '';
  if (_thumbUrlCache) {
    const cached = _thumbUrlCache.get(el);
    if (typeof cached === 'string' && cached) return cached;
  }
  const fromBg = (/** @type {string} */ bg) => {
    const m = String(bg || '').match(/url\(["']?([^"')]+)["']?\)/);
    return m && /^https?:\/\//i.test(m[1]) ? m[1] : '';
  };
  const probe = (/** @type {HTMLElement} */ node) => {
    // 1) inline background-image
    let u = fromBg(node.style?.backgroundImage || '');
    if (u) return u;
    // 2) computed background-image（Emotion クラス由来。getComputedStyle が使える環境のみ）
    try {
      const gcs = typeof globalThis !== 'undefined' && typeof globalThis.getComputedStyle === 'function'
        ? globalThis.getComputedStyle(node)
        : null;
      if (gcs) {
        u = fromBg(gcs.backgroundImage || '');
        if (u) return u;
      }
    } catch { /* no-op */ }
    // 3) <img src> / lazy data-src
    const img = node.matches('img') ? node : node.querySelector('img[src], img[data-src]');
    if (img instanceof HTMLImageElement) {
      const s = String(img.currentSrc || img.src || '').trim();
      if (/^https?:\/\//i.test(s)) return s;
      const ds = String(img.getAttribute('data-src') || '').trim();
      if (/^https?:\/\//i.test(ds)) return ds;
    }
    return '';
  };
  const direct = probe(el);
  if (direct) {
    if (_thumbUrlCache) _thumbUrlCache.set(el, direct);
    return direct;
  }
  if (opts?.searchDescendants) {
    for (const d of el.querySelectorAll('*')) {
      if (!(d instanceof HTMLElement)) continue;
      const u = probe(d);
      if (u) {
        if (_thumbUrlCache) _thumbUrlCache.set(el, u);
        return u;
      }
    }
  }
  return '';
}

/**
 * niconico のアバター URL から user id を取り出す（リンク化用）。
 * 例: https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/388/3882670.jpg?xxxx
 *     → '3882670'（パスの shard ディレクトリではなくファイル名側が uid）。
 * richview のイベントランキング行は a[href] を持たないが、アバター背景画像の URL に
 * uid が埋まっているので、ここから記名配信者のユーザーページリンクを復元できる。
 *
 * @param {unknown} url
 * @returns {string} 数値 uid（取れたとき）または ''
 */
function extractUserIdFromNicoAvatarUrl(url) {
  const s = String(url == null ? '' : url);
  const m = s.match(/\/usericon\/\d+\/(\d{2,18})\.(?:jpe?g|png|gif|webp)/i);
  return m ? m[1] : '';
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
 * @typedef {{
 *   rank: number|null,
 *   score: number|null,
 *   diffToNext: number|null,
 *   eventName: string,
 *   broadcasterName: string,
 * }} EventSelfStatus
 */

/**
 * richview バナーから「配信者本人の現在順位 / 累計スコア / 順位UPまでの差 / 参加中イベント名」を掬う。
 * 実DOM（2026-05-26 実機採取 lv350612434・[[reference_richview_event_ranking_emotion_dom]]）:
 *   バナーは Emotion クラスタ e1awe04q*:
 *     span.e1awe04q12 "現在" / span.e1awe04q11 "位"(ラベル) / span.e1awe04q10 "○○さん"(配信者名)
 *     span.e1awe04q0  本人の順位の数字（例 "2"）
 *     p.css-1qqb6me   本人の累計スコア（9桁・例 3,453,400）  ← css hash 不安定なので位置でも同定
 *     p.css-1d9a3hd   順位UPまでの差（例 1,517,300）
 *   イベント名は <select> の選択中 option（複数イベント参加時の現在表示分）。
 *
 * fail-soft: 取れない項目は null/空。順位が無くてもイベント名だけ返すこともある。
 *
 * @param {Document|Element|null|undefined} root
 * @returns {EventSelfStatus|null}
 */
export function scrapeEventSelfStatusFromRichviewDom(root) {
  if (!root) return null;
  /** @type {any} */
  const r = root;
  const q = (/** @type {string} */ sel) => {
    try { return r.querySelector?.(sel) || null; } catch { return null; }
  };

  // 本人の順位（span.e1awe04q0・数字）
  let rank = null;
  const rankEl = q('[class~="e1awe04q0"], [class*="e1awe04q0"]');
  if (rankEl) {
    const d = String(rankEl.textContent || '').replace(/[^\d]/g, '');
    if (/^\d+$/.test(d)) { const n = parseInt(d, 10); if (Number.isFinite(n) && n > 0) rank = n; }
  }

  // 配信者名（span.e1awe04q10）「○○さん」→「さん」除去
  let broadcasterName = '';
  const nameEl = q('[class~="e1awe04q10"], [class*="e1awe04q10"]');
  if (nameEl) broadcasterName = String(nameEl.textContent || '').replace(/\s+/g, ' ').replace(/\s*さん\s*$/u, '').trim();

  // バナー領域内の 9 桁前後の数値2つ＝累計スコア / 順位UPまでの差。
  // css hash に依存せず、e1awe04q0(順位)の祖先パネル内の数字リーフを大きい順に。
  let score = null;
  let diffToNext = null;
  try {
    let panel = rankEl instanceof HTMLElement ? rankEl : null;
    for (let i = 0; i < 6 && panel && panel.parentElement; i++) panel = panel.parentElement;
    const scope = panel || (rankEl instanceof HTMLElement ? rankEl : null);
    if (scope instanceof HTMLElement) {
      /** @type {number[]} */
      const nums = [];
      for (const el of scope.querySelectorAll('p, span, strong, b')) {
        if (!(el instanceof HTMLElement) || el.children.length > 0) continue;
        if (rankEl && (el === rankEl || el.contains(rankEl) || rankEl.contains(el))) continue;
        const t = String(el.textContent || '').trim();
        if (!/^[\d,]+$/.test(t)) continue; // 数字のみ（「現在」「位」等は除外）
        const v = parseInt(t.replace(/[^\d]/g, ''), 10);
        if (Number.isFinite(v) && v >= 100) nums.push(v); // 順位の 1-2 桁は拾わない
      }
      // 累計スコア = 最初の数値、差 = 2 番目。
      // Antigravity 指摘バグ修正(2026-06-08): 旧実装は大きい順ソートで「スコア>差」を仮定していたが、
      // イベント序盤/格上相手では「スコア1,000 / 差19,000」と差の方が大きい状況が普通に起きる。
      // 実バナーの DOM 出現順は score(css-1qqb6me) → diff(css-1d9a3hd) で安定なので、
      // 大小でなく出現順で割り当てる(querySelectorAll は文書順を保証)。
      if (nums.length >= 1) score = nums[0];
      if (nums.length >= 2) diffToNext = nums[1];
    }
  } catch { /* no-op */ }

  // 参加中イベント名 = richview バナーが「今表示しているイベント」をそのまま反映する。
  // ＝ <select> の選択中 option をそのまま使う（公式バナーと完全一致）。
  // ※ 以前「広告除外/始球式優先」のヒューリスティックを入れたが誤りだった：
  //   配信者が参加中で順位を競っているのは選択中イベント（例「5月病なんか銀河系まで
  //   飛んでいけ！」）であり、別 option（始球式等）は無関係なことがある。公式が選んで
  //   表示しているものが正＝推測しない（ユーザー指示「バナーをそのまま反映」2026-05-26）。
  const eventName = pickSelectedEventName(q('select'));

  // 配信者名は richview から取らない（e1awe04q10 は「を応援しよう！」という断片を拾うため）。
  // 呼び出し側（popup）が持つ正本 broadcasterName を使う。ここでは空で返す。
  void broadcasterName;

  // 全部空なら null
  if (rank == null && score == null && !eventName) return null;
  return { rank, score, diffToNext, eventName, broadcasterName: '' };
}

/**
 * richview の <select>（参加中イベント切替）の「選択中 option」をそのまま返す。
 * 公式バナーが表示中のイベントと一致させるため、推測・絞り込みはしない。
 *
 * @param {any} sel
 * @returns {string}
 */
function pickSelectedEventName(sel) {
  try {
    if (!sel || !sel.options) return '';
    const idx = typeof sel.selectedIndex === 'number' && sel.selectedIndex >= 0 ? sel.selectedIndex : 0;
    const o = sel.options[idx] || sel.options[0];
    return o ? String(o.textContent || '').replace(/\s+/g, ' ').trim() : '';
  } catch {
    return '';
  }
}

/**
 * 見出し「イベントランキング」のテキストを起点に、Emotion クラスハッシュへ一切
 * 依存せず**構造＋テキストだけ**で行を掬う堅牢版（2026-06-01 実機 lv350658954 で確定）。
 *
 * 背景: 2026-06 にニコ生が Emotion クラスタを改名（行 el69c2m4→e1oms6s84 / 名前
 *   el69c2m1→e1oms6s81 等）。前段ラベルは「安定」と思われていたが実際は再デプロイで
 *   変わるため、クラス名追従は再発する。見出しテキストと「N位」「💎スコア」という
 *   ユーザー可視の不変要素を頼りにすれば、次の改名でも壊れない。
 *
 * スコープ確定の安全性:
 *   - 見出しの祖先を上に辿り「位」リーフを1つ以上含む最小の祖先だけを採用する。
 *     バナー(参加中のイベント/現在N位)とサポーターランキング(○○さんのサポーター)は
 *     **別サブツリー**＝この祖先には入らない（実機で supInScope=0 を確認）。
 *
 * @type {(root: Document|Element) => Array<{rank:number,score:number,name:string,isAnonymous:boolean,rowEl:HTMLElement}>|null}
 */
function extractEventRankingRowsCore(root) {
  const heading = findEventRankingHeading(root);
  if (!heading) return null;
  const scope = findEventRankingScope(heading);
  if (!scope) return null;

  // スコープ内の「位」リーフ＝各行の順位ラベル。
  /** @type {HTMLElement[]} */
  const iLeaves = [];
  for (const el of scope.querySelectorAll('*')) {
    if (!(el instanceof HTMLElement) || el.children.length > 0) continue;
    if (String(el.textContent || '').trim() === '位') iLeaves.push(el);
  }
  if (iLeaves.length === 0) return null;

  /** @type {Array<{rank:number,score:number,name:string,isAnonymous:boolean,rowEl:HTMLElement}>} */
  const rows = [];
  /** @type {Set<HTMLElement>} */
  const seenRows = new Set();
  for (const iLeaf of iLeaves) {
    const rank = pickRankNearILeaf(iLeaf);
    if (rank == null) return null; // 確定不能は全体不採用（誤値ゼロ方針）

    const row = climbToRowWithScore(iLeaf, scope);
    if (!(row instanceof HTMLElement)) return null;
    if (seenRows.has(row)) continue;
    seenRows.add(row);

    const score = pickScoreInRow(row, iLeaf);
    if (score == null || score <= 0) return null;

    let name = pickNameInRow(row, iLeaf);
    const isAnonymous = !name || name === '名無し';
    if (!name) name = '名無し';

    rows.push({ rank, score, name, isAnonymous, rowEl: row });
  }

  if (rows.length === 0 || !ranksAreDenseAndUnique(/** @type {any} */ (rows))) return null;
  rows.sort((a, b) => a.rank - b.rank);
  return rows;
}

/**
 * テキスト完全一致「イベントランキング」の見出しを、最も末端（子孫数最小）で返す。
 * @param {Document|Element} root
 * @returns {HTMLElement|null}
 */
function findEventRankingHeading(root) {
  /** @type {HTMLElement|null} */
  let best = null;
  let bestCount = Infinity;
  let cands;
  try {
    cands = /** @type {any} */ (root).querySelectorAll?.('*') || [];
  } catch {
    return null;
  }
  for (const el of cands) {
    if (!(el instanceof HTMLElement)) continue;
    if (String(el.textContent || '').trim() !== 'イベントランキング') continue;
    const c = el.getElementsByTagName('*').length;
    if (c < bestCount) {
      best = el;
      bestCount = c;
    }
  }
  return best;
}

/**
 * 見出しから上方向に、「位」リーフを含む最小の祖先（=ランキングリスト領域）を探す。
 * @param {HTMLElement} heading
 * @returns {HTMLElement|null}
 */
function findEventRankingScope(heading) {
  /** @type {HTMLElement|null} */
  let scope = heading;
  for (let i = 0; i < 8 && scope && scope.parentElement; i++) {
    scope = scope.parentElement;
    if (countILeaves(scope) >= 1) return scope;
  }
  return null;
}

/**
 * @param {HTMLElement} el
 * @returns {number}
 */
function countILeaves(el) {
  let n = 0;
  for (const node of el.querySelectorAll('*')) {
    if (!(node instanceof HTMLElement) || node.children.length > 0) continue;
    if (String(node.textContent || '').trim() === '位') n++;
  }
  return n;
}

/**
 * 「位」リーフの近傍から順位の数字を確定する。直前の兄弟→同ブロック内リーフの順。
 * @param {HTMLElement} iLeaf
 * @returns {number|null}
 */
function pickRankNearILeaf(iLeaf) {
  let sib = iLeaf.previousElementSibling;
  while (sib) {
    if (sib instanceof HTMLElement && sib.children.length === 0) {
      const d = String(sib.textContent || '').replace(/[^\d]/g, '');
      if (/^\d+$/.test(d)) {
        const n = parseInt(d, 10);
        if (n > 0) return n;
      }
    }
    sib = sib.previousElementSibling;
  }
  const block = iLeaf.parentElement;
  if (block instanceof HTMLElement) {
    for (const el of block.querySelectorAll('*')) {
      if (!(el instanceof HTMLElement) || el.children.length > 0 || el === iLeaf) continue;
      const d = String(el.textContent || '').replace(/[^\d]/g, '');
      if (/^\d+$/.test(d)) {
        const n = parseInt(d, 10);
        if (n > 0) return n;
      }
    }
  }
  return null;
}

/**
 * 「位」リーフから上方向に、スコア（カンマ付き or 100 以上の数値リーフ）を含む
 * 最初の祖先＝行要素を返す。
 * @param {HTMLElement} iLeaf
 * @param {HTMLElement} scope
 * @returns {HTMLElement|null}
 */
function climbToRowWithScore(iLeaf, scope) {
  let node = iLeaf.parentElement;
  for (let i = 0; i < 8 && node && node !== scope; i++) {
    if (hasScoreLeaf(node)) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * @param {HTMLElement} row
 * @returns {boolean}
 */
function hasScoreLeaf(row) {
  for (const el of row.querySelectorAll('*')) {
    if (!(el instanceof HTMLElement) || el.children.length > 0) continue;
    const t = String(el.textContent || '').trim();
    const cleaned = t.replace(/,/g, '').replace(/[💎pt\s]/giu, '').trim();
    if (/^\d+$/.test(cleaned)) {
      if (t.includes(',') || parseInt(cleaned, 10) >= 100) return true;
    }
  }
  return false;
}

/**
 * 行内で「スコアの数値リーフ」を構造的に特定して返す（要素 + 値）。
 * Antigravity 指摘バグ修正(2026-06-08): 旧実装は「行内の最大数値」をスコアにしていたため、
 * 「99999999」のような数字ユーザー名が実スコア(例150)を乗っ取っていた(BUG3)。
 * 💎 svg 隣接 / カンマ区切り表記 を「本物のスコアの印」として優先し、数字名と区別する。
 * @param {HTMLElement} row
 * @param {HTMLElement} iLeaf 順位「位」リーフ（順位ブロックは除外用）
 * @returns {{ el: HTMLElement, value: number } | null}
 */
function findScoreLeafInRow(row, iLeaf) {
  const rankBlock = iLeaf.parentElement;
  /** @type {Array<{el:HTMLElement, value:number, hasComma:boolean, nearGem:boolean}>} */
  const cands = [];
  for (const el of row.querySelectorAll('*')) {
    if (!(el instanceof HTMLElement) || el.children.length > 0) continue;
    if (el === iLeaf || (rankBlock && rankBlock.contains(el))) continue;
    const t = String(el.textContent || '').trim();
    const cleaned = t.replace(/,/g, '').replace(/[💎pt\s]/giu, '').trim();
    if (!/^\d+$/.test(cleaned)) continue;
    const v = parseInt(cleaned, 10);
    if (!(v > 0)) continue;
    const hasComma = t.includes(',');
    // 💎 svg / pt との隣接 = 本物のスコアの構造的印
    const parent = el.parentElement;
    const nearGem = !!parent && (
      !!parent.querySelector('svg') || /💎|pt/iu.test(parent.textContent || '')
    );
    cands.push({ el, value: v, hasComma, nearGem });
  }
  if (cands.length === 0) return null;
  // 優先順位: (1)💎/pt隣接 (2)カンマ区切り表記 (3)それも無ければ最大値(従来挙動の保険)。
  const gem = cands.filter((c) => c.nearGem);
  if (gem.length) return gem.sort((a, b) => b.value - a.value)[0];
  const comma = cands.filter((c) => c.hasComma);
  if (comma.length) return comma.sort((a, b) => b.value - a.value)[0];
  return cands.sort((a, b) => b.value - a.value)[0];
}

/**
 * 行内のスコア値を返す（順位ブロックは除外）。findScoreLeafInRow に委譲。
 * @param {HTMLElement} row
 * @param {HTMLElement} iLeaf
 * @returns {number|null}
 */
function pickScoreInRow(row, iLeaf) {
  const found = findScoreLeafInRow(row, iLeaf);
  return found ? found.value : null;
}

/**
 * 行内の「名前」リーフを返す。
 * Antigravity 指摘バグ修正(2026-06-08): 旧実装は純粋な数字テキストを名前候補から弾いていたため、
 * 「777」「12345」等の数字のみユーザー名が消えて「名無し」化していた(BUG2)。
 * スコアリーフ(構造特定)と順位リーフを除外したうえで、残るテキストリーフから名前を採る
 * (数字のみでも採用する)。スコア/順位は除外済みなので数字名がスコアと衝突しない。
 * @param {HTMLElement} row
 * @param {HTMLElement} [iLeaf] 順位「位」リーフ（あれば順位ブロックとスコアリーフを除外）
 * @returns {string}
 */
function pickNameInRow(row, iLeaf) {
  const scoreEl = iLeaf ? (findScoreLeafInRow(row, iLeaf)?.el || null) : null;
  const rankBlock = iLeaf ? iLeaf.parentElement : null;
  let best = '';
  for (const el of row.querySelectorAll('*')) {
    if (!(el instanceof HTMLElement) || el.children.length > 0) continue;
    if (el === scoreEl) continue;                                  // スコアリーフは名前にしない
    if (iLeaf && (el === iLeaf || (rankBlock && rankBlock.contains(el)))) continue; // 順位ブロック除外
    const t = String(el.textContent || '').trim();
    if (!t) continue;
    if (t === '位' || t === 'さん' || t === '💎' || t === 'pt' || t === '更新') continue;
    const cleaned = t.replace(/,/g, '').replace(/[💎pt\s]/giu, '').trim();
    // スコア/順位を除外済なので、数字のみの名前(「777」等)もここで採用する(BUG2修正)。
    // ただし カンマ付き数値(=スコアの可能性が高い)は名前にしない安全策。
    if (/^\d+$/.test(cleaned) && t.includes(',')) continue;
    if (t.length > best.length) best = t;
  }
  return normalizeRankerAltName(best);
}

/**
 * {@link extractEventRankingRowsCore} を EventScoreRankingRow[] に変換（上位10名のみサムネ取得）。
 * @param {Document|Element} root
 * @returns {EventScoreRankingRow[]|null}
 */
function scrapeEventRankingByStructure(root) {
  const core = extractEventRankingRowsCore(root);
  if (!core || core.length === 0) return null;
  return core.map((r) => {
    let thumbnailUrl = '';
    if (r.rank <= 10) {
      thumbnailUrl = pickThumbnailUrlFromElement(r.rowEl, { searchDescendants: true });
    }
    const userId = extractUserIdFromNicoAvatarUrl(thumbnailUrl);
    return {
      rank: r.rank,
      score: r.score,
      name: r.name,
      isAnonymous: r.isAnonymous,
      thumbnailUrl,
      ...(userId ? { userId } : {})
    };
  });
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
      // Antigravity 指摘バグ修正(BUG3, 2026-06-08): 「行内最大数値」だと数字ユーザー名
      // (例「99999999」)が実スコアを乗っ取る。名前リーフ(el69c2m1)を除外し、さらに
      // カンマ付き表記 or 💎/pt 隣接 を本物スコアの印として優先する。
      /** @type {Array<{value:number, hasComma:boolean, nearGem:boolean}>} */
      const cands = [];
      for (const el of row.querySelectorAll('p, span, div, strong, b')) {
        if (!(el instanceof HTMLElement) || el.children.length > 0) continue;
        if (rankEl && (el === rankEl || rankEl.contains(el) || el.contains(rankEl))) continue;
        if (nameEl && (el === nameEl || (nameEl instanceof HTMLElement && nameEl.contains(el)))) continue;
        const t = String(el.textContent || '').trim();
        const cleaned = t.replace(/,/g, '').replace(/[💎pt\s]/giu, '').trim();
        if (!/^\d+$/.test(cleaned)) continue;
        const v = parseInt(cleaned, 10);
        if (!(Number.isFinite(v) && v > 0)) continue;
        const parent = el.parentElement;
        const nearGem = !!parent && (!!parent.querySelector('svg') || /💎|pt/iu.test(parent.textContent || ''));
        cands.push({ value: v, hasComma: t.includes(','), nearGem });
      }
      const gem = cands.filter((c) => c.nearGem);
      const comma = cands.filter((c) => c.hasComma);
      const pool = gem.length ? gem : (comma.length ? comma : cands);
      if (pool.length) score = pool.sort((a, b) => b.value - a.value)[0].value;
    }
    if (score == null || score <= 0) return null;

    // サムネ抽出は重い（getComputedStyle・行内走査）。表示は上位 10 名だけなので、
    // **rank<=10 の行だけ**サムネを取る（順位/名前/スコアの検証は全行のまま＝dense-unique 維持）。
    // ＝4 秒ごとの周期コストを最大25行→10行に削減（codex 会議 2026-05-26 の最小修正）。
    // 取得済み URL は WeakMap キャッシュで getComputedStyle 再呼び出しを避ける。
    let thumbnailUrl = '';
    if (rank <= 10) {
      const thumbEl = row.querySelector('[class~="el69c2m3"], [class*="el69c2m3"]');
      const thumbHost = thumbEl instanceof HTMLElement ? thumbEl : null;
      thumbnailUrl = pickThumbnailUrlFromElement(thumbHost);
      // el69c2m3 が空（CSS クラス由来背景）の保険＝行内探索。これも rank<=10 限定。
      if (!thumbnailUrl) {
        thumbnailUrl = pickThumbnailUrlFromElement(row, { searchDescendants: true });
      }
    }

    const userId = extractUserIdFromNicoAvatarUrl(thumbnailUrl);
    rows.push({ rank, score, name, isAnonymous, thumbnailUrl, ...(userId ? { userId } : {}) });
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

  // 0) ★最優先★ 見出し「イベントランキング」起点のハッシュ非依存・構造ベース抽出。
  //    Emotion クラスタ改名（el69c2m*→e1oms6s8* 等）でも壊れない正本経路。
  try {
    const structRows = scrapeEventRankingByStructure(/** @type {any} */ (root));
    if (structRows && structRows.length > 0) return structRows;
  } catch {
    /* fall through */
  }

  // 1) ★本命(旧)★ クラス固定の実機イベントランキング抽出（古い DOM / fixture 互換の高速路）。
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
