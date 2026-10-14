/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】「りんく段に置いてよい人か」の判定(/live/ と同じ定義: ギフト/広告で支えた人だけ)
 * 【この箱に入らないもの】DOM・storage・chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】りんく段(tier 3)の資格判定はこのファイルのみ
 *
 * ★なぜ(2026-10-14・ユーザー「りんくの意味は /live/ に揃える」)
 *   /live/ のりんく = ギフト/広告で支えて、本物のサムネが確定した人。コメントだけの人は(本物のサムネがあっても)こん太。
 *   拡張は「コメント集計で本物のサムネが取れた人=りんく」だったため、同じ人が画面ごとに別の段に出ていた。
 *   本物のサムネ(tier 3)の判定は従来どおり。そこへ「ギフト/広告の応援者であること」を足すだけ(段を下げるだけ・人は消さない)。
 *
 * ★ギフト/広告の応援者が1人も分かっていない間(読み込み前・ギフトも広告も無い配信)は何も下げない:
 *   読み込み前に全員を下げると、読み込み後に段をまたいで動いてしまう。
 * @module laneLinkTier
 */

/**
 * @param {readonly unknown[]|null|undefined} giftPicks
 * @param {readonly unknown[]|null|undefined} adPicks
 * @returns {Set<string>} ギフト/広告の応援者の uid(空文字は含めない)
 */
export function supporterUidSet(giftPicks, adPicks) {
  const out = new Set();
  for (const list of [giftPicks, adPicks]) {
    for (const p of Array.isArray(list) ? list : []) {
      const uid = String(/** @type {any} */ (p)?.entry?.userId ?? '').trim();
      if (uid) out.add(uid);
    }
  }
  return out;
}

/**
 * @param {number} tier 従来の段(3=りんく/2=こん太/1=たぬ姉)
 * @param {unknown} userId
 * @param {ReadonlySet<string>} supporters supporterUidSet の結果
 * @returns {number} りんく(3)の資格が無ければ 2 に下げる。それ以外は不変。
 */
export function linkTierFor(tier, userId, supporters) {
  if (tier !== 3) return tier;
  if (!supporters || supporters.size === 0) return tier;
  return supporters.has(String(userId ?? '').trim()) ? 3 : 2;
}
