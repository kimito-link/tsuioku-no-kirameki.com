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

/** @param {unknown} src 本物の個人サムネの URL か(識別絵・ゆっくり顔・未設定の既定画像は除く) */
export function isRealThumbSrc(src) {
  const s = String(src ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return false;
  return !/usericon\/defaults\/|blank\.(jpg|png)/i.test(s);
}

/**
 * ギフト/広告の行から直接「りんく」の候補を作る(/live/ の identifiedSupporters と同じ発想)。
 * コメント集計に居なくても、ギフト/広告で支えて本物のサムネが確定した人はりんく。
 *   - 既にコメント由来の候補に居る人: その候補を tier 3 へ上げる(本物のサムネがある場合のみ)
 *   - 居ない人: ギフト/広告の行から新しい候補を作る
 * 同じ人がギフトと広告の両方に居ても1人(先に見つけた行を使う)。
 * @param {readonly unknown[]|null|undefined} giftPicks
 * @param {readonly unknown[]|null|undefined} adPicks
 * @param {Array<any>} candidates in-place(追加・tier 更新)
 * @returns {{ added: number, promoted: number }}
 */
export function mergeSupporterLinkCandidates(giftPicks, adPicks, candidates) {
  const byUid = new Map();
  for (const c of candidates) {
    const u = String(c?.entry?.userId ?? '').trim();
    if (u) byUid.set(u, c);
  }
  let added = 0;
  let promoted = 0;
  for (const list of [giftPicks, adPicks]) {
    for (const p of Array.isArray(list) ? list : []) {
      const uid = String(/** @type {any} */ (p)?.entry?.userId ?? '').trim();
      if (!uid) continue;
      const pick = /** @type {any} */ (p);
      if (!isRealThumbSrc(pick.displaySrc)) continue;
      const cur = byUid.get(uid);
      if (cur) {
        if ((Number(cur.profileTier) || 0) < 3) { cur.profileTier = 3; promoted += 1; }
        continue;
      }
      const row = {
        entryIndex: 0,
        profileTier: 3,
        thumbScore: 1000,
        displaySrc: pick.displaySrc,
        title: pick.title,
        entry: pick.entry,
        recentTexts: /** @type {string[]} */ ([]),
        commentCount: 0,
        meta: pick.meta,
        ...(pick.stats ? { stats: pick.stats } : {})
      };
      candidates.push(row);
      byUid.set(uid, row);
      added += 1;
    }
  }
  return { added, promoted };
}
