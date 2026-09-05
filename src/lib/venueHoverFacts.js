/**
 * 【層】L0 判定層（純関数・chrome/DOM/fetch に触らない）
 * 【この箱に入るもの】会場ホバーカードに出す「発言数・ギフト数・時刻」をどこから採るかの決定
 * 【この箱に入らないもの】DOM 走査・roster の構築・時刻の取得（採取は呼び出し側）
 * 【書けるstorageキー】なし
 * 【正本宣言】★会場ホバーの数字の出所はこのファイルが正本（3経路すべてがここを通る）
 *
 * venueHoverFacts.js — ホバーカードに出す事実を1本に決める。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★なぜ要るか（2026-08-29・実機で確認した症状）
 *
 *   同じ人（同じ uid）が同じ時刻に「発言 1」と「発言 70」で表示された。
 *   原因はホバーデータの登録経路が3つあり、渡す値が違ったこと:
 *
 *     ・トップバー経路 / 席あり経路 … participant から正しい値
 *     ・★席なし経路            … count: 0, giftCount: 0, lastAt: 0 のゼロ埋めリテラル
 *
 *   ⟹ 経路を個別に直すと「2つの真実を同期し続ける」失敗の再演になる
 *     （AGENTS.md §12.8 が戒めた形。記録件数が6カウンタに分裂した実績）。
 *     ★合流点1箇所に関所を置く。
 *
 * ■ ★戻り値を number|null にするのが設計の要
 *
 *   今までは「知らない」を count: 0 で表していた。
 *   ★「0回喋った」と「知らない」が同じ値だと、区別が構造的に不可能になる。
 *   だから画面に「発言 0」という嘘が出た。
 *
 *   世の中の作法でも null state design（読み込み中／0件／失敗を区別せよ）として
 *   確立している。このリポ自身も「確かめられなかったときは『一致』と言わず
 *   ★『未計測』と正直に出す」という作法を既に持っており、ホバーカードだけが漏れていた。
 *
 * ■ ★禁止事項（ここを破ると症状が戻る）
 *
 *   1. ★`Math.max(registered, roster)` を書かないこと。
 *      2つの出所を混ぜた瞬間に「どちらの数字か」が言えなくなる。
 *      registered が有効なら **early return** し、roster を同じ実行パスで参照しない
 *      ＝ Math.max を書く場所が構造的に存在しない形にしてある。
 *      毒テスト: venueHoverFacts.test.js「registered がある限り roster を見ない」
 *
 *   2. ★「有効」の判定を `count > 0` にしないこと。
 *      本当に0発言の人が roster に落ちてしまう。有効の定義は
 *      **count が有限数であること**（0 も有効な答え）。
 *
 *   3. ★どちらも無いとき 0 を返さないこと。null を返す（fail-closed）。
 *
 * ■ ★上流の下駄は触らない（実測して確認した）
 *
 *   `venueLaneMirrorSupply.js:103` の `Math.max(1, ...)` が
 *   「まだ数えていない」を「発言1回」に化けさせている。だが同じ下駄は
 *   venueLaneMirrorSupply / venueLiveRoster / venueSeats の3ファイル計6箇所にあり、
 *   `venueLiveRoster.js:17` に理由が明記されている:
 *     「これが無いと collectVenueParticipants が全員 count=1 扱いになり
 *       ★VIP常連光らせが死ぬ(v0.1.734 の轍)」
 *   ⟹ 撤去せず、★ホバー側（表示の末端）で吸収する。
 *     これは既にこのリポで確立された流儀（venueHoverCard.js:174-176 の
 *     「投擲段では件数を出すとその1が『発言1』の嘘になるので時刻だけ出す」と同じ型）。
 *
 * ■ 型だけ写した先
 *   `storyDiagTotalSource.js`（正本優先・不在時のみ fallback・max で混ぜない）。
 *   ★import はしない。あちらは recordedCount フィールドに固着した1値用で流用できない。
 * ───────────────────────────────────────────────────────────────────────────
 */

/** 会場ホバーの事実の出所。★どちらを見たか後から言えるようにする。 */
export const VENUE_HOVER_SOURCE_REGISTERED = 'registered';
export const VENUE_HOVER_SOURCE_ROSTER = 'roster';
export const VENUE_HOVER_SOURCE_NONE = 'none';

/**
 * 回数を正規化する。★負の数と小数を作らない。
 * @param {unknown} v
 * @returns {number}
 */
function toCount(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/**
 * 時刻を正規化する。0 以下・非数は 0（＝時刻不明）に倒す。
 * @param {unknown} v
 * @returns {number}
 */
function toStamp(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * 本文配列を正規化する。★必ず配列を返す（呼び出し側に null を渡さない）。
 * @param {unknown} v
 * @returns {string[]}
 */
function toTexts(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((t) => typeof t === 'string' && t !== '');
}

/**
 * ホバーカードに出す事実を1本に決める。
 *
 * 入力の意味:
 *   registered  … 登録済みのホバーデータ（トップバー/席ありの経路が持っている正しい値）
 *   rosterEntry … 会場の生名簿の1件（席なし経路の補完に使う）
 *
 * 戻り値の count / giftCount は ★number|null。
 *   number … 数えた結果（0 も有効な答え）
 *   null   … ★知らない。呼び出し側は「数を言わない」こと
 *
 * @param {{
 *   registered?: { count?: number, giftCount?: number, venueRank?: number,
 *                  lastAt?: number, lastText?: string, recentTexts?: string[] } | null,
 *   rosterEntry?: { commentCount?: number, giftCount?: number, venueRank?: number,
 *                   lastSeen?: number, lastAt?: number, lastText?: string,
 *                   recentTexts?: string[] } | null
 * } | null | undefined} input
 * @returns {{ count: number|null, giftCount: number|null, venueRank: number,
 *             lastAt: number, lastText: string, recentTexts: string[], source: string }}
 */
export function resolveVenueHoverFacts(input) {
  const i = input && typeof input === 'object' ? input : {};

  const registered = i.registered && typeof i.registered === 'object' ? i.registered : null;

  /*
   * ★正本優先。ここで early return するので、この下の roster 参照へは進めない。
   *   ＝ Math.max(registered, roster) を書く場所が構造的に存在しない。
   *
   * ★「有効」は count が有限数であること。> 0 にしない
   *   （本当に0発言の人を roster に落とさないため）。
   */
  if (registered && Number.isFinite(Number(registered.count))) {
    return {
      count: toCount(registered.count),
      giftCount: toCount(registered.giftCount),
      venueRank: toCount(registered.venueRank),
      lastAt: toStamp(registered.lastAt),
      lastText: typeof registered.lastText === 'string' ? registered.lastText : '',
      recentTexts: toTexts(registered.recentTexts),
      source: VENUE_HOVER_SOURCE_REGISTERED
    };
  }

  const roster = i.rosterEntry && typeof i.rosterEntry === 'object' ? i.rosterEntry : null;

  if (roster && Number.isFinite(Number(roster.commentCount))) {
    return {
      count: toCount(roster.commentCount),
      giftCount: toCount(roster.giftCount),
      venueRank: toCount(roster.venueRank),
      // 生名簿は最後に見かけた時刻を lastSeen で持つ。lastAt を持つ形も許す。
      lastAt: toStamp(roster.lastSeen) || toStamp(roster.lastAt),
      lastText: typeof roster.lastText === 'string' ? roster.lastText : '',
      recentTexts: toTexts(roster.recentTexts),
      source: VENUE_HOVER_SOURCE_ROSTER
    };
  }

  /*
   * ★どちらも無い＝知らない。0 と言わない。
   *   ここで 0 を返すと画面に「発言 0」という嘘が出る（それが今回直した症状）。
   */
  return {
    count: null,
    giftCount: null,
    venueRank: 0,
    lastAt: 0,
    lastText: '',
    recentTexts: [],
    source: VENUE_HOVER_SOURCE_NONE
  };
}
