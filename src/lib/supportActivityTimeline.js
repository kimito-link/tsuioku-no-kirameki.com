/**
 * 応援タイムライン: コメントとギフト着弾を時刻順に統合する純関数（v0.1.340）。
 *
 * ねらい（OneComme 導入でユーザーが便利と感じた体験の移植）:
 *   コメントの流れの中にギフト着弾を時系列で差し込み、「誰がいつ何を投げたか」を
 *   コメントと同じ1本の流れの中で物語として読めるようにする。他ビューワーにない価値。
 *
 * 本モジュールは**マージとソートだけを純粋に担う**（DOM / storage / await なし）。
 * 描画は呼出側。コメントもギフトも `capturedAt`（epoch ms・Date.now() 基準）で統一
 * されているため、同一軸で安全に時系列マージできる（Explore で両者の時刻整合を確認済み）。
 *
 * @see src/lib/giftEventStore.js - StoredGiftEvent（ギフト1件の型）
 * @see src/extension/popup-entry.js - PopupCommentEntry（コメント1件の型）
 */

/**
 * タイムライン1要素（判別タグ付きの統合エントリ）。
 * - kind: 'comment' | 'gift'
 * - at: epoch ms（ソートキー）
 * - key: 重複除去・React 風 key 用の一意文字列
 * - 残りは描画に必要な最小フィールド（元データの安全な抜粋）
 * @typedef {{
 *   kind: 'comment',
 *   at: number,
 *   key: string,
 *   userId: string,
 *   nickname: string,
 *   text: string,
 *   commentNo: string,
 *   avatarUrl: string,
 *   selfPosted: boolean
 * }} TimelineCommentItem
 *
 * @typedef {{
 *   kind: 'gift',
 *   at: number,
 *   key: string,
 *   userId: string,
 *   nickname: string,
 *   itemName: string,
 *   point: number,
 *   message: string,
 *   avatarUrl: string
 * }} TimelineGiftItem
 *
 * @typedef {TimelineCommentItem | TimelineGiftItem} TimelineItem
 */

/** @param {unknown} v @returns {number} 有限な非負 epoch ms、無効なら 0 */
function safeAt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** @param {unknown} v @param {number} [max] */
function safeStr(v, max = 500) {
  return String(v == null ? '' : v)
    .trim()
    .slice(0, max);
}

/**
 * コメント配列を TimelineCommentItem[] に正規化（不正要素は捨てる）。
 * @param {readonly any[]} comments
 * @returns {TimelineCommentItem[]}
 */
function normalizeComments(comments) {
  if (!Array.isArray(comments)) return [];
  /** @type {TimelineCommentItem[]} */
  const out = [];
  for (const c of comments) {
    if (!c || typeof c !== 'object') continue;
    const at = safeAt(c.capturedAt);
    const commentNo = safeStr(c.commentNo, 40);
    const userId = safeStr(c.userId, 40);
    // 一意キー: id 優先、無ければ commentNo / userId+at で組む。
    const key =
      safeStr(c.id, 80) ||
      `c:${commentNo || 'x'}:${userId || 'anon'}:${at}`;
    out.push({
      kind: 'comment',
      at,
      key,
      userId,
      nickname: safeStr(c.nickname, 200),
      text: safeStr(c.text, 500),
      commentNo,
      avatarUrl: safeStr(c.avatarUrl, 400),
      selfPosted: c.selfPosted === true
    });
  }
  return out;
}

/**
 * ギフトイベント配列を TimelineGiftItem[] に正規化（不正要素は捨てる）。
 * @param {readonly any[]} gifts
 * @returns {TimelineGiftItem[]}
 */
function normalizeGifts(gifts) {
  if (!Array.isArray(gifts)) return [];
  /** @type {TimelineGiftItem[]} */
  const out = [];
  let i = 0;
  for (const g of gifts) {
    i += 1;
    if (!g || typeof g !== 'object') continue;
    const at = safeAt(g.capturedAt);
    const userId = safeStr(g.userId, 40);
    const itemId = safeStr(g.itemId, 80);
    const pointN = Number(g.point);
    const point = Number.isFinite(pointN) && pointN >= 0 ? Math.floor(pointN) : 0;
    // ギフトは id を持たないので 送信者+item+時刻+連番 で一意化（同時刻同item衝突回避）。
    const key = `g:${userId || 'anon'}:${itemId || 'x'}:${at}:${i}`;
    out.push({
      kind: 'gift',
      at,
      key,
      userId,
      nickname: safeStr(g.nickname, 200),
      itemName: safeStr(g.itemName, 120),
      point,
      message: safeStr(g.message, 300),
      // v0.1.342: 送信者アバター（呼出側が rememberedAvatarUrlForUserId で enrich して渡す）。
      avatarUrl: safeStr(g.avatarUrl, 400)
    });
  }
  return out;
}

/**
 * コメントとギフトを時刻順に統合する。
 *
 * - order: 'desc'（既定・新しい順＝ティッカー/フィード上部が最新）または 'asc'（古い順）。
 * - limit: 返す最大件数（既定 100）。order 適用後に先頭から limit 件。
 * - 同時刻はギフトを先（gift→comment）に寄せる＝「投げた瞬間」を見落としにくく。
 *   ただし order='asc' のときは時系列の自然さを保つため comment→gift。
 * - 安定性: 元の配列順を壊さないよう、同 at では正規化時の相対順を保つ安定ソート。
 *
 * @param {readonly any[]} comments PopupCommentEntry[] 相当
 * @param {readonly any[]} gifts StoredGiftEvent[] 相当
 * @param {{ order?: 'asc'|'desc', limit?: number }} [opts]
 * @returns {TimelineItem[]}
 */
export function buildSupportActivityTimeline(comments, gifts, opts) {
  const order = opts?.order === 'asc' ? 'asc' : 'desc';
  const rawLimit = Number(opts?.limit);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 100;

  /** @type {TimelineItem[]} */
  const merged = [...normalizeComments(comments), ...normalizeGifts(gifts)];

  // decorate-sort-undecorate で安定ソート（同 at は giftBias と元 index でタイブレーク）。
  const decorated = merged.map((item, index) => ({ item, index }));
  decorated.sort((a, b) => {
    if (a.item.at !== b.item.at) {
      return order === 'asc' ? a.item.at - b.item.at : b.item.at - a.item.at;
    }
    // 同時刻のタイブレーク。
    const aGift = a.item.kind === 'gift' ? 1 : 0;
    const bGift = b.item.kind === 'gift' ? 1 : 0;
    if (aGift !== bGift) {
      // desc(新しい順): ギフトを先に出す＝配列の前。asc(古い順): コメントを先に。
      return order === 'desc' ? bGift - aGift : aGift - bGift;
    }
    // 最終タイブレークは元の相対順（安定）。
    return a.index - b.index;
  });

  return decorated.slice(0, limit).map((d) => d.item);
}

/**
 * タイムラインのギフト要約（描画ヘッダ用）。件数・合計pt・ユニーク送信者数。
 * @param {readonly TimelineItem[]} timeline
 * @returns {{ giftCount: number, giftPoints: number, giftSenders: number }}
 */
export function summarizeTimelineGifts(timeline) {
  let giftCount = 0;
  let giftPoints = 0;
  const senders = new Set();
  if (Array.isArray(timeline)) {
    for (const it of timeline) {
      if (!it || it.kind !== 'gift') continue;
      giftCount += 1;
      giftPoints += Number(it.point) || 0;
      const uid = String(it.userId || '').trim();
      if (uid) senders.add(uid);
    }
  }
  return { giftCount, giftPoints, giftSenders: senders.size };
}

/**
 * epoch ms を「いつ」の相対時刻ラベルに（v0.1.341・タイムライン各行用）。
 *   〜10秒=「たった今」/ 〜60秒=「N秒前」/ 〜60分=「N分前」/ 〜24時間=「N時間前」/
 *   それ以上=「N日前」。未来や不正値は ''（出さない）。now 省略時は Date.now()。
 * @param {unknown} at epoch ms
 * @param {number} [now] epoch ms（テスト用に注入可）
 * @returns {string}
 */
export function formatRelativeTimeJa(at, now) {
  const t = Number(at);
  if (!Number.isFinite(t) || t <= 0) return '';
  const ref = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const diffMs = ref - t;
  // 未来（時計ずれ等）は出さない。わずかな未来は「たった今」に丸める。
  if (diffMs < -5000) return '';
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 10) return 'たった今';
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  return `${day}日前`;
}
