/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】ギフト列・広告列の「候補(picks)」を、配信 ID が切り替わったときに持ち越す/捨てるの判定
 * 【この箱に入らないもの】DOM・storage・chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】gift/ad picks の持ち越し判定はこのファイルのみ
 *
 * ★なぜ要るか(2026-10-14・実機の状態速報「レーンの人数 29→14枚に減った(直前の供給元 heavy_refresh=確定・縮小ガード素通り)」):
 *   popup の syncStorySourceEntries は、配信 ID が変わるたびに gift/ad の picks を空にしていた(v0.1.1042 の「切替時だけ」)。
 *   ところが popup は「配信 ID なし(視聴中の配信が無い瞬間)」を経由して同じ配信へ戻ることがある。
 *   このとき picks が空になり、非同期の再取得(paintStoryUserLaneCoalesced)が終わるまでの描画で
 *   ギフト11人+広告4人のタイルが消える(29→14)。確定供給を名乗るので縮小ガードも通らない。
 *   ★同じ配信へ戻るなら、前の picks をそのまま使う(中身は同じ配信のもの)。別の配信へ替わるときだけ空にする。
 */

/** @typedef {{ lid: string, gift: readonly unknown[], ad: readonly unknown[] }} GiftAdPicksCarry */

/** @returns {GiftAdPicksCarry} */
export function createGiftAdPicksCarry() {
  return { lid: '', gift: Object.freeze([]), ad: Object.freeze([]) };
}

/** @param {unknown} v @returns {string} */
const normLid = (v) => String(v ?? '').trim().toLowerCase();

/**
 * 配信 ID が変わるとき(prevLid→nextLid)に、新しい state へ入れる gift/ad picks を決める。
 *
 * - prevLid が実在する配信なら、その配信ぶんの picks を carry に控える(空の配信は控えない)。
 * - nextLid が控えてある配信と同じなら、控えを返す(restored)。
 * - それ以外は空(cleared)。★別の配信の picks を新しい配信へ持ち越さない。
 *
 * @param {GiftAdPicksCarry} carry in-place で更新する
 * @param {{ prevLid: unknown, nextLid: unknown, gift: readonly unknown[], ad: readonly unknown[] }} ev
 *   gift/ad は切替【前】の state の picks
 * @returns {{ gift: readonly unknown[], ad: readonly unknown[], action: 'restored'|'cleared' }}
 */
export function resolvePicksOnLiveChange(carry, ev) {
  const prev = normLid(ev?.prevLid);
  const next = normLid(ev?.nextLid);
  const gift = Array.isArray(ev?.gift) ? ev.gift : [];
  const ad = Array.isArray(ev?.ad) ? ev.ad : [];
  if (prev && (gift.length > 0 || ad.length > 0)) {
    carry.lid = prev;
    carry.gift = gift;
    carry.ad = ad;
  }
  if (next && carry.lid === next && (carry.gift.length > 0 || carry.ad.length > 0)) {
    return { gift: carry.gift, ad: carry.ad, action: 'restored' };
  }
  return { gift: Object.freeze([]), ad: Object.freeze([]), action: 'cleared' };
}

/**
 * 保存データの読み直し(描くたび)で候補が【一瞬空】になっても、直前の人たちを消さない。
 *
 * ★なぜ要るか(2026-10-14・実機の状態速報で2回): レーンの人数が 29→14(ギフト11+広告4が空)・54→48(広告6が空)に減った。
 *   どちらも「減った枚数 = ギフト列/広告列の人数」にちょうど一致し、配信ID の切替(giftAdPicksCarry の restored)は0回=別の経路。
 *   描画のたびに保存データ(ギフト/広告の公式順位)を読み直して候補を作り直すので、その読み込みが一瞬空で返ると
 *   (空を保存する成功0件・読み取りの失敗・配信なしの瞬間)、その回の描画でその列が丸ごと消える。確定供給を名乗るため
 *   縮小ガードも通らない。同じ配信の公式順位は【増えるだけ】(AGENTS.md §3.6「rows>0 のときだけ上書き」と同じ考え方)。
 * ★同じ配信のなかで「前は人がいたのに、今回は空」のときだけ前を残す。別の配信への切替は呼び出し側が先に空へ戻す。
 *
 * @param {readonly unknown[]|null|undefined} prev いま保持している候補(同じ配信)
 * @param {readonly unknown[]|null|undefined} next 今回作り直した候補
 * @returns {{ picks: readonly unknown[], kept: boolean }}
 */
export function keepPicksIfEmptied(prev, next) {
  const p = Array.isArray(prev) ? prev : [];
  const n = Array.isArray(next) ? next : [];
  if (n.length === 0 && p.length > 0) return { picks: p, kept: true };
  return { picks: n, kept: false };
}
