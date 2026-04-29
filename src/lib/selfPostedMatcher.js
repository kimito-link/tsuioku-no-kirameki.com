/**
 * 自己投稿コメント（self-posted recents）と、保存済みコメント一覧の
 * 1対1 ペアリング・ロジック。
 *
 * popup-entry.js 側で `chrome.storage.local` から復元した recents キューと、
 * IndexedDB から読み込んだ entries を突き合わせ、どの entry がこの拡張で送った
 * コメントと同一かを判定する。同文コメントが他人から投下されても、自分が送った
 * 件数ぶんだけを self 扱いにする（recent 1 件 = entry 1 件の消費）。
 *
 * 本ファイルは:
 * - chrome.storage, DOM, timer, グローバル state に一切依存しない
 * - 正規化済みの `{id, textNorm, capturedAt, index}` エントリ配列と、
 *   正規化済みの `{itemIndex, at, textNorm}` recent 配列を受け取り、
 *   マッチ結果の `{matchedIds, consumedIndexes}` を返す
 * - 時間窓（early/late）のパラメータを opts で注入可能
 * - vitest で純粋に単体検証できる
 */

/** 実送信後に storage へ反映される前の遅延を許容する early 側（ms） */
export const SELF_POST_MATCH_EARLY_MS = 30 * 1000;
/** ネットワーク遅延・リトライなどで遅れて届く late 側（ms） */
export const SELF_POST_MATCH_LATE_MS = 10 * 60 * 1000;
/** recents キューの寿命（ms）。TTL を過ぎたら破棄 */
export const SELF_POST_RECENT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {Object} SelfPostedRecent
 * @property {string} liveId 放送 ID（大小区別しない、呼び出し側で lowercase 想定）
 * @property {number} at epoch ms で送信した時刻
 * @property {string} textNorm 正規化済コメント本文
 * @property {string} [textRaw] 正規化前の生本文（改行・空白を保持）。pending 表示時に
 *   normalize 済み本文だけだと改行・トリム差で UI がちらつくため、optional で持つ。
 */

/**
 * @typedef {Object} SelfPostedMatchEntry
 * @property {string} id entry の安定 ID（storage 上で一意）
 * @property {string} textNorm 正規化済コメント本文
 * @property {number} capturedAt epoch ms
 * @property {number} index 呼び出し側の元配列での位置（tie-break に使う）
 */

/**
 * @typedef {Object} SelfPostedMatchRecent
 * @property {number} itemIndex `selfPostedRecentsCache` 等の元配列上の位置
 * @property {number} at epoch ms
 * @property {string} textNorm 正規化済コメント本文
 */

/**
 * `chrome.storage.local.get` で読み取った `raw` から、形式が正しくかつ TTL 内の
 * recents だけを取り出す。
 * raw の想定: `{ items: SelfPostedRecent[] }`
 * @param {unknown} raw
 * @param {number} [now=Date.now()]
 * @returns {SelfPostedRecent[]}
 */
export function filterValidSelfPostedRecents(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return [];
  const items = /** @type {{ items?: unknown }} */ (raw).items;
  if (!Array.isArray(items)) return [];
  /** @type {SelfPostedRecent[]} */
  const out = [];
  for (const x of items) {
    if (!x || typeof x !== 'object') continue;
    const rec = /** @type {{liveId?: unknown, at?: unknown, textNorm?: unknown, textRaw?: unknown}} */ (x);
    if (
      typeof rec.liveId === 'string' &&
      typeof rec.textNorm === 'string' &&
      typeof rec.at === 'number' &&
      now - rec.at < SELF_POST_RECENT_TTL_MS
    ) {
      /** @type {SelfPostedRecent} */
      const item = { liveId: rec.liveId, textNorm: rec.textNorm, at: rec.at };
      if (typeof rec.textRaw === 'string') item.textRaw = rec.textRaw;
      out.push(item);
    }
  }
  return out;
}

/**
 * recents 全体から、指定 liveId に所属するものだけを取り出して
 * ペアリング可能な形に整形・時刻昇順ソートする。
 * @param {SelfPostedRecent[]} recents
 * @param {string} liveId (推奨: lowercase で渡す)
 * @returns {SelfPostedMatchRecent[]}
 */
export function prepareSelfPostedMatchRecents(recents, liveId) {
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return [];
  const src = Array.isArray(recents) ? recents : [];
  return src
    .map((it, itemIndex) => ({
      itemIndex,
      liveId: String(it?.liveId || '').trim().toLowerCase(),
      at: Number(it?.at) || 0,
      textNorm: String(it?.textNorm || '')
    }))
    .filter((it) => it.liveId === lid && it.at > 0 && it.textNorm)
    .sort((a, b) => a.at - b.at || a.itemIndex - b.itemIndex)
    .map(({ itemIndex, at, textNorm }) => ({ itemIndex, at, textNorm }));
}

/**
 * 自己投稿の 1対1 ペアリング本体。
 *
 * アルゴリズム:
 * 1. entries を textNorm でバケットに分け、各バケットを capturedAt 昇順
 *    （同時刻は index 昇順）でソート。
 * 2. recents を順（呼び出し側で時刻昇順になっている前提）に走査し、各 recent
 *    について：
 *    - textNorm が一致するバケットの中で、capturedAt が
 *      `[recent.at - earlyMs, recent.at + lateMs]` 区間にある未マッチ候補を
 *      探す。
 *    - スコア = `|delta| + (delta < 0 ? earlyMs + 1 : 0)` が最小のものを選ぶ。
 *      late 側（送信 → 届くまでの遅延）を優先するため、early 側（送信前の
 *      タイムスタンプ）にはペナルティを乗せる。
 *    - スコアが同点なら元 index が小さい方を優先。
 *    - 見つかればその候補 id を matched に、recent の itemIndex を consumed に。
 *
 * @param {SelfPostedMatchEntry[]} entries
 * @param {SelfPostedMatchRecent[]} recents
 * @param {{earlyMs?: number, lateMs?: number}} [opts]
 * @returns {{ matchedIds: Set<string>, consumedIndexes: Set<number> }}
 */
export function matchSelfPostedRecents(entries, recents, opts = {}) {
  const earlyMs = Number.isFinite(opts.earlyMs)
    ? /** @type {number} */ (opts.earlyMs)
    : SELF_POST_MATCH_EARLY_MS;
  const lateMs = Number.isFinite(opts.lateMs)
    ? /** @type {number} */ (opts.lateMs)
    : SELF_POST_MATCH_LATE_MS;
  /** @type {Set<string>} */
  const matchedIds = new Set();
  /** @type {Set<number>} */
  const consumedIndexes = new Set();
  const entryList = Array.isArray(entries) ? entries : [];
  const recentList = Array.isArray(recents) ? recents : [];
  if (!entryList.length || !recentList.length) {
    return { matchedIds, consumedIndexes };
  }

  /** @type {Map<string, SelfPostedMatchEntry[]>} */
  const byText = new Map();
  for (const e of entryList) {
    if (!e || !e.textNorm || !e.id) continue;
    const bucket = byText.get(e.textNorm) || [];
    bucket.push(e);
    byText.set(e.textNorm, bucket);
  }
  for (const bucket of byText.values()) {
    bucket.sort((a, b) => {
      if (a.capturedAt !== b.capturedAt) return a.capturedAt - b.capturedAt;
      return a.index - b.index;
    });
  }

  for (const recent of recentList) {
    const bucket = byText.get(recent.textNorm);
    if (!bucket?.length) continue;
    /** @type {SelfPostedMatchEntry|null} */
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestIndex = Number.POSITIVE_INFINITY;
    for (const candidate of bucket) {
      if (matchedIds.has(candidate.id)) continue;
      const cap = candidate.capturedAt;
      if (cap < recent.at - earlyMs || cap > recent.at + lateMs) continue;
      const delta = cap - recent.at;
      const score = Math.abs(delta) + (delta >= 0 ? 0 : earlyMs + 1);
      if (score < bestScore || (score === bestScore && candidate.index < bestIndex)) {
        best = candidate;
        bestScore = score;
        bestIndex = candidate.index;
      }
    }
    if (!best) continue;
    matchedIds.add(best.id);
    consumedIndexes.add(recent.itemIndex);
  }

  return { matchedIds, consumedIndexes };
}

/**
 * entries（フォールバックや部分照合用）が無い場合の、recent 1 件への「同文+時間窓」
 * 判定。`isOwnPostedSupportComment` のフォールバック枝で使う想定。
 * @param {{textNorm: string, capturedAt: number}} entry
 * @param {SelfPostedRecent[]} recents
 * @param {string} liveId
 * @param {{earlyMs?: number, lateMs?: number}} [opts]
 * @returns {boolean}
 */
export function matchesAnySelfPostedRecent(entry, recents, liveId, opts = {}) {
  const earlyMs = Number.isFinite(opts.earlyMs)
    ? /** @type {number} */ (opts.earlyMs)
    : SELF_POST_MATCH_EARLY_MS;
  const lateMs = Number.isFinite(opts.lateMs)
    ? /** @type {number} */ (opts.lateMs)
    : SELF_POST_MATCH_LATE_MS;
  const norm = String(entry?.textNorm || '');
  if (!norm) return false;
  const lid = String(liveId || '').trim().toLowerCase();
  if (!lid) return false;
  const cap = Number(entry?.capturedAt) || 0;
  const list = Array.isArray(recents) ? recents : [];
  for (const it of list) {
    if (String(it?.liveId || '').toLowerCase() !== lid) continue;
    if (it?.textNorm !== norm) continue;
    if (cap >= it.at - earlyMs && cap <= it.at + lateMs) return true;
  }
  return false;
}
