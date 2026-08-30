/**
 * 【層】L0 判定層（純関数・chrome/DOM/fetch に触らない）
 * 【この箱に入るもの】会場ホバーカードに出す「この人はここでどうしていたか」の一言を決める判定
 * 【この箱に入らないもの】DOM 生成・storage 読み書き・時刻の取得（nowMs は引数で受ける）
 * 【書けるstorageキー】なし
 * 【正本宣言】会場の「今どうしているか」の文言はこのファイルが正本
 *
 * venuePresenceNote.js — 会場に居る人の「今どうしているか」を一言にする。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★なぜ要るか（2026-08-29・X スペースの実物を観察して決めた）
 *
 *   X スペースはホバーカードの[プロフィールの要約]で Grok を呼び、
 *   ★36秒かけて「熱心に反応し、リアルタイムで短い感想を連投しています」と
 *   ★**推測**して見せていた（実測: スクリーンショットに「36秒間シンキングしました」）。
 *
 *   ★この拡張は「中に居る」ので、同じことを【待たせずに事実で】言える。
 *   誰が何回・いつ喋ったか・ギフトを何回投げたかを既に持っているため、
 *   AI も外部通信も要らない。
 *
 *   現在の会場カードは「発言 42(3分前) 🎁3 🥇1位」という★数字の羅列で、
 *   「この人がどういう人だったか」を言っていなかった。数字は読み解く手間が要る。
 *
 * ■ ★Presence（プレゼンス）は確立された UI パターン
 *   Figma のカーソル / Slack のオンライン表示 / Discord の参加者リストが同じ問題を解く。
 *   ★Discord の設計指針:「居るだけでなく【今どうしているか】を見せる」
 *   （発話中か・活動中か非活動中か）。ここはその「今どうしているか」に当たる。
 *
 * ■ ★守る原則（AGENTS.md §3.5）
 *   ★応援者は主役。隠す対象ではなく【表彰】として扱う。
 *   ★情報が少ない人を二級市民にしない。
 *   ⟹ だから「発言1回」の人にも必ず一言を返す。空文字で黙らない。
 *     （X は「無いものは行ごと消す」だったが、この製品は誰もが主役なので消さない）
 *
 * ■ ★この判定がしないこと
 *   ・人柄の推測をしない（「熱心」「常連」等の性格づけはしない）。事実だけを言う
 *   ・過去放送を見ない（★会場は放送中に動くので IndexedDB の全読みを持ち込めない。
 *     「かよい/はじまり」は過去12放送のコメント全読みが要るためここでは扱わない）
 * ───────────────────────────────────────────────────────────────────────────
 */

/** 「さっきまで居たのに静か」と言い始めるまでの間(ms)。 */
export const VENUE_PRESENCE_QUIET_MS = 5 * 60_000;

/** 「ずっと静か」に切り替わる間(ms)。これを超えたら経過を言わない。 */
export const VENUE_PRESENCE_LONG_QUIET_MS = 30 * 60_000;

/** この回数以上で「たくさん喋っている」側に寄せる。 */
export const VENUE_PRESENCE_TALKATIVE_MIN = 10;

/**
 * 会場に居る人の「今どうしているか」を一言にする。
 *
 * ★必ず何か返す（空文字を返さない）。情報が少ない人を黙らせないため。
 * ★ただし「何も分からない」ときだけは空文字を返してよい（uid も発言も無い＝
 *   そもそも人として成立していない）。呼び出し側はその時だけ行を出さない。
 *
 * 入力の意味:
 *   count       … 発言数。★null は「知らない」（0回とは違う）
 *   giftCount   … ギフト回数。★null は「知らない」
 *
 *   ★null を受ける理由（2026-08-29）:
 *     席なし経路がゼロ埋めリテラルを渡していたため、実機で「発言 0」「発言 1」という
 *     嘘が出た。「0回喋った」と「知らない」を同じ 0 で表すと区別が構造的に不可能になる。
 *     ⟹ resolveVenueHoverFacts（venueHoverFacts.js）が null を返すようにし、
 *       ここは ★null なら回数を言わない・ただし時刻が分かれば黙らない、と振る舞う。
 *       （AGENTS.md §3.5「情報が少ない人を二級市民にしない」）
 *   venueRank   … 会場での順位（1..3 のみ意味を持つ）
 *   lastAt      … 最後の発言時刻（epoch ms）
 *   nowMs       … いまの時刻（epoch ms）。★引数で受ける（純関数のため）
 *   isAnonymous … 匿名か（★文言は変えない。差別しないことをテストで固定している）
 *
 * @param {{
 *   count?: number|null,
 *   giftCount?: number|null,
 *   venueRank?: number,
 *   lastAt?: number,
 *   nowMs?: number,
 *   isAnonymous?: boolean
 * }} input
 * @returns {string} 一言（例: 「さっき来て、ここまで12回」）
 */
export function buildVenuePresenceNote(input) {
  const i = input && typeof input === 'object' ? input : {};
  /*
   * ★null は「見に行ったが分からなかった」。0 に丸めない。
   *   ここで 0 に潰すと「まだ数えていない人」が「0回の人」と同じ扱いになり、
   *   下の `count <= 0 && giftCount <= 0 → ''` に落ちて★一言ごと消える。
   *   （「一言が出たり出なかったりする」と言われた症状がこれ）
   *
   * ★null（明示的に「知らない」）と undefined（キーごと無い）を分けること。
   *   ・null      … resolveVenueHoverFacts が「調べたが不明」と答えた
   *                 ⟹ その人が【会場に居ることは確か】なので黙らない
   *   ・undefined … 呼び出し側が何も渡していない＝人として成立していない
   *                 ⟹ 既存契約どおり空を返す（buildVenuePresenceNote({}) === ''）
   *   両者を同一視すると、壊れた入力にまで「会場に居る」と言ってしまう。
   */
  const explicitlyUnknown = i.count === null || i.giftCount === null;
  const knowsCount = i.count !== null && i.count !== undefined;
  const knowsGift = i.giftCount !== null && i.giftCount !== undefined;
  const count = knowsCount ? Math.max(0, Math.floor(Number(i.count) || 0)) : null;
  const giftCount = knowsGift ? Math.max(0, Math.floor(Number(i.giftCount) || 0)) : null;
  const venueRank = Math.max(0, Math.floor(Number(i.venueRank) || 0));
  const lastAt = Number(i.lastAt);
  const nowMs = Number(i.nowMs);
  const hasTime = Number.isFinite(lastAt) && lastAt > 0 && Number.isFinite(nowMs) && nowMs > 0;
  // ★時計ズレで負値になることがある。0 に丸める（「未来から来た人」を作らない）。
  const sinceLast = hasTime ? Math.max(0, nowMs - lastAt) : -1;

  /*
   * ★何も分からない＝人として成立していない。ここだけ空を返す。
   *   ★既存契約（venuePresenceNote.test.js）: count:0 かつ giftCount:0 → ''。
   *     数えた結果ほんとうに0なら、言うことが無いので黙るのが正しい。
   *
   *   ★ただし「知らない(null)」は別。数は言えなくても
   *     【時刻が分かれば「いま喋っている」とは言える】ので、ここで落とさない。
   *     居ることまで消してしまうと二級市民になる。
   */
  const knowsSomething = knowsCount || knowsGift;
  const nothingHappened = (count || 0) <= 0 && (giftCount || 0) <= 0;
  if (knowsSomething && nothingHappened) return '';
  // ★キーごと無い＝人として成立していない。既存契約どおりここだけ空。
  if (!knowsSomething && !explicitlyUnknown) return '';

  /** @type {string[]} */
  const parts = [];

  /*
   * ① いま喋っているか / 静かか。
   *   ★「静か」は責める言葉にしない。居ることは変わらないので「聞いている」と言う。
   */
  if (sinceLast >= 0) {
    if (sinceLast < 60_000) parts.push('いま喋っている');
    else if (sinceLast < VENUE_PRESENCE_QUIET_MS) parts.push('さっきまで喋っていた');
    else if (sinceLast < VENUE_PRESENCE_LONG_QUIET_MS) parts.push('いまは聞いている');
    // ★30分以上は経過を言わない（古い情報を「今」のように見せない）。
  }

  /*
   * ② どれくらい喋ったか。
   *   ★1回だけの人にも必ず言う（二級市民にしない）。
   */
  // ★count が null＝知らない。★数を言わない（「発言1」の嘘を作らない）。
  if (count === 1) parts.push('ここで1回');
  else if (count !== null && count > 0) parts.push(`ここまで${count}回`);

  // ③ ギフト。★数ではなく「贈った」という事実を先に言う（表彰として扱う）。
  if (giftCount === 1) parts.push('ギフトを贈った');
  else if (giftCount !== null && giftCount > 1) parts.push(`ギフトを${giftCount}回`);

  // ④ 上位だけ。4位以下は言わない（順位で人を並べ替えて見せる場ではない）。
  if (venueRank === 1) parts.push('いちばん多い');
  else if (venueRank === 2 || venueRank === 3) parts.push(`${venueRank}番目に多い`);

  /*
   * ★ここまでで一言が空＝「知らないが、居ることは分かっている」状態。
   *   ★存在は必ず言う（AGENTS.md §3.5「応援者は主役」）。
   *   数を偽らずに、居ることだけを伝える。
   */
  if (parts.length === 0) return explicitlyUnknown ? '会場に居る' : '';

  return parts.join('・');
}
