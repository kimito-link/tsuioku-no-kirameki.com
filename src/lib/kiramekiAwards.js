/**
 * 「きらめきの賞」判定ロジック（純関数）。
 *
 * 思想：
 *   - 「順位＝価値ではない」を注釈でなく構造で実現する。
 *   - 単一ランキングを廃し、多軸の賞に変える。誰も負けない土台。
 *   - 固定賞（積み重ね）とその日限りの賞を混在させる。
 *   - スコア数字は前面に出さず、名前のついた光（賞）として見せる。
 *
 * 賞一覧：
 *   参加賞（全員）:
 *     - ともしびのきらめき: コメント/ギフト/広告のいずれかで反応した人全員
 *   固定賞（積み重ね）:
 *     - かよいのきらめき: 過去枠からの継続参加（皆勤）
 *     - はじまりのきらめき: 初参加・初コメ
 *     - ことばのきらめき: 長文・凝った応援（文字数が多い）
 *   その日限りの賞:
 *     - ひかりのきらめき: その日いちばん場を照らした人（複数可）
 *     - えがおのきらめき: 短くても場を動かした一言
 *     - そっとのきらめき: あたたかいコメント・初見を迎えた人
 *
 * @module kiramekiAwards
 */

/**
 * @typedef {Object} CommentRow
 * @property {string} [userId]
 * @property {string} [text]
 * @property {number} [vpos]
 * @property {number} [capturedAt]
 */

/**
 * @typedef {Object} AggregatedRoom
 * @property {string} userKey
 * @property {string} [nickname]
 * @property {string} [avatarUrl]
 * @property {number} count
 * @property {string} [lastText]
 * @property {number} [totalChars]
 */

/**
 * @typedef {Object} KiramekiAward
 * @property {string} id         賞ID（例: 'tomoshibi'）
 * @property {string} name       賞名（例: 'ともしびのきらめき'）
 * @property {string} emoji      絵文字アイコン
 * @property {'all'|'fixed'|'daily'} category 参加賞/固定賞/その日限り
 * @property {string} description 賞の説明（表示用）
 * @property {string[]} userKeys  受賞者の userKey 一覧
 */

/**
 * @typedef {Object} KiramekiAwardsInput
 * @property {CommentRow[]} comments           全コメント
 * @property {AggregatedRoom[]} aggregatedRooms ユーザー別集計（broadcaster除外済み）
 * @property {string[]} [returningUserKeys]     過去枠参加者の userKey（皆勤判定用）
 * @property {string[]} [firstTimeUserKeys]     初参加者の userKey（はじまり判定用）
 * @property {string} [broadcasterUserId]       配信者ID（除外用）
 */

/**
 * @typedef {Object} KiramekiAwardsResult
 * @property {KiramekiAward[]} awards  全賞一覧（受賞者0人の賞も含む）
 * @property {Map<string, string[]>} userKeyToAwardIds ユーザーが持つ賞IDの逆引きマップ
 */

// 賞の定義（順序＝表示順）
export const AWARD_DEFS = /** @type {const} */ ([
  {
    id: 'tomoshibi',
    name: 'ともしびのきらめき',
    emoji: '🕯️',
    category: 'all',
    description: 'この配信に参加してくれたすべての人へ。コメント・ギフト・広告—どんな形でも、あなたの灯りが届いていました。'
  },
  {
    id: 'kayoi',
    name: 'かよいのきらめき',
    emoji: '🌿',
    category: 'fixed',
    description: '前の枠から引き続き来てくれた常連さんへ。継続する応援が配信の土台を作っています。'
  },
  {
    id: 'hajimari',
    name: 'はじまりのきらめき',
    emoji: '🌱',
    category: 'fixed',
    description: 'はじめて参加してくれた方へ。その最初の一歩が、配信の世界を広げてくれます。'
  },
  {
    id: 'kotoba',
    name: 'ことばのきらめき',
    emoji: '✍️',
    category: 'fixed',
    description: '手間をかけた長文・凝った応援を書いてくれた人へ。その丁寧さはちゃんと届いています。'
  },
  {
    id: 'hikari',
    name: 'ひかりのきらめき',
    emoji: '✨',
    category: 'daily',
    description: '今日の配信でいちばん場を照らした人へ。あなたの存在感が配信を輝かせました。'
  },
  {
    id: 'egao',
    name: 'えがおのきらめき',
    emoji: '😊',
    category: 'daily',
    description: '短くても場を笑わせた・動かした一言を放った人へ。軽やかな応援も立派な光です。'
  },
  {
    id: 'sotto',
    name: 'そっとのきらめき',
    emoji: '🤍',
    category: 'daily',
    description: 'あたたかいコメントで場を包んでくれた人へ。数や勢いに関係なく、その優しさは輝いていました。'
  }
]);

/** 長文判定の文字数しきい値 */
const KOTOBA_MIN_CHARS_TOTAL = 50;
/** ひかり判定: 上位N人（複数可） */
const HIKARI_TOP_N = 3;
/** えがお判定: 短文しきい値（1コメが短いが場を動かした人） */
const EGAO_MAX_CHARS_PER_COMMENT = 10;
/** えがお判定: 短文コメントの最低件数 */
const EGAO_MIN_SHORT_COUNT = 3;
/** そっと判定: あたたかい語彙リスト */
const SOTTO_WARM_WORDS = [
  'ありがとう', 'おつかれ', 'お疲れ', 'がんばって', '頑張って', 'すごい', '素晴らしい',
  'うれしい', '嬉しい', 'たのしい', '楽しい', 'だいすき', '大好き', 'かわいい', '可愛い',
  'よかった', '良かった', 'さすが', '応援', 'おうえん', 'ファイト', 'ぎゅー', 'なでなで',
  'いつもありがとう', 'またくるね', 'また来るね', 'おかえり', 'おめでとう'
];

/**
 * テキストに「そっと」語彙が含まれるか。
 * @param {string} text
 * @returns {boolean}
 */
function hasWarmWord(text) {
  const t = String(text || '').toLowerCase();
  return SOTTO_WARM_WORDS.some((w) => t.includes(w));
}

/**
 * 各ユーザーの総文字数マップを作る。
 * @param {CommentRow[]} comments
 * @param {string} [broadcasterUserId]
 * @returns {Map<string, number>}
 */
function buildUserTotalCharsMap(comments, broadcasterUserId) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const c of comments) {
    const uid = String(c?.userId || '').trim() || '__anon__';
    if (broadcasterUserId && uid === broadcasterUserId) continue;
    const len = String(c?.text ?? '').length;
    map.set(uid, (map.get(uid) || 0) + len);
  }
  return map;
}

/**
 * 各ユーザーの短文コメント件数マップを作る。
 * @param {CommentRow[]} comments
 * @param {string} [broadcasterUserId]
 * @returns {Map<string, number>}
 */
function buildUserShortCommentCountMap(comments, broadcasterUserId) {
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const c of comments) {
    const uid = String(c?.userId || '').trim() || '__anon__';
    if (broadcasterUserId && uid === broadcasterUserId) continue;
    const len = String(c?.text ?? '').length;
    if (len > 0 && len <= EGAO_MAX_CHARS_PER_COMMENT) {
      map.set(uid, (map.get(uid) || 0) + 1);
    }
  }
  return map;
}

/**
 * そっとのきらめき対象ユーザーを判定する。
 * @param {CommentRow[]} comments
 * @param {string} [broadcasterUserId]
 * @returns {Set<string>}
 */
function buildSottoUserSet(comments, broadcasterUserId) {
  /** @type {Set<string>} */
  const set = new Set();
  for (const c of comments) {
    const uid = String(c?.userId || '').trim() || '__anon__';
    if (broadcasterUserId && uid === broadcasterUserId) continue;
    if (hasWarmWord(String(c?.text ?? ''))) {
      set.add(uid);
    }
  }
  return set;
}

/**
 * きらめきの賞を判定する。
 *
 * @param {KiramekiAwardsInput} input
 * @returns {KiramekiAwardsResult}
 */
export function computeKiramekiAwards(input) {
  const {
    comments = [],
    aggregatedRooms = [],
    returningUserKeys = [],
    firstTimeUserKeys = [],
    broadcasterUserId = ''
  } = input || {};

  // 防御フィルタ: userKey が空・count が数値でない room を除外（NaN ソート防止）
  const validRooms = aggregatedRooms.filter(
    (r) => r != null && typeof r.userKey === 'string' && r.userKey.trim() !== '' &&
      typeof r.count === 'number' && Number.isFinite(r.count)
  );
  const allUserKeys = validRooms.map((r) => r.userKey);
  const returningSet = new Set(returningUserKeys);
  const firstTimeSet = new Set(firstTimeUserKeys);
  const userTotalCharsMap = buildUserTotalCharsMap(comments, broadcasterUserId);
  const userShortCountMap = buildUserShortCommentCountMap(comments, broadcasterUserId);
  const sottoSet = buildSottoUserSet(comments, broadcasterUserId);

  // ひかり: コメント件数の多い上位N人（同率は全員）
  const sortedByCount = [...validRooms].sort((a, b) => b.count - a.count);
  const hikariThreshold = sortedByCount[HIKARI_TOP_N - 1]?.count ?? 0;
  const hikariSet = new Set(
    hikariThreshold > 0
      ? sortedByCount.filter((r) => r.count >= hikariThreshold).map((r) => r.userKey)
      : []
  );

  // えがお: 短文コメントが EGAO_MIN_SHORT_COUNT 以上の人（上位N人・同率含む）
  const sortedByShort = [...userShortCountMap.entries()]
    .filter(([, v]) => v >= EGAO_MIN_SHORT_COUNT)
    .sort((a, b) => b[1] - a[1]);
  const egaoThreshold = sortedByShort[HIKARI_TOP_N - 1]?.[1] ?? (sortedByShort[0]?.[1] ?? 0);
  const egaoSet = new Set(
    egaoThreshold >= EGAO_MIN_SHORT_COUNT
      ? sortedByShort.filter(([, v]) => v >= egaoThreshold).map(([k]) => k)
      : []
  );

  // ことば: 総文字数が閾値以上
  const kotobaSet = new Set(
    [...userTotalCharsMap.entries()]
      .filter(([, v]) => v >= KOTOBA_MIN_CHARS_TOTAL)
      .map(([k]) => k)
  );

  /** @type {Map<string, string[]>} */
  const userKeyToAwardIds = new Map();
  const addAward = (/** @type {string} */ userKey, /** @type {string} */ awardId) => {
    const list = userKeyToAwardIds.get(userKey) || [];
    if (!list.includes(awardId)) list.push(awardId);
    userKeyToAwardIds.set(userKey, list);
  };

  // 各賞の受賞者を確定
  const awardRecipients = {
    tomoshibi: allUserKeys,
    kayoi: allUserKeys.filter((k) => returningSet.has(k)),
    hajimari: allUserKeys.filter((k) => firstTimeSet.has(k)),
    kotoba: allUserKeys.filter((k) => kotobaSet.has(k)),
    hikari: allUserKeys.filter((k) => hikariSet.has(k)),
    egao: allUserKeys.filter((k) => egaoSet.has(k)),
    sotto: allUserKeys.filter((k) => sottoSet.has(k))
  };

  // 逆引きマップ構築
  for (const [awardId, keys] of Object.entries(awardRecipients)) {
    for (const k of keys) addAward(k, awardId);
  }

  const awards = AWARD_DEFS.map((def) => ({
    ...def,
    userKeys: awardRecipients[def.id] || []
  }));

  return { awards, userKeyToAwardIds };
}
