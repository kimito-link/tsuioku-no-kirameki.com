/**
 * ytWording.js — ニコ生版の画面をそのまま使う YouTube 版で、画面に出る「ニコニコの言葉」を YouTube の言葉に直す。
 *
 * 画面とプログラムはニコ生版の写し(ニコ生版のソースは変えない)。描き上がった画面の文字だけを、
 * ytNicoShim の画面の直し(数字ID・リンクを直しているのと同じ所)でこの表の通りに置き換える。
 * コメント本文を誤って書き換えないよう、決まった文言だけを置き換える(「ニコ生」を一律に置き換えない)。
 */

// 「ギフト貢献度」欄の言葉。YouTube のトップファン(XP の順位表)を入れているときだけ使う。
const TOP_FAN_RULES = [
  [
    'ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。',
    'YouTube のトップファン（チャットでの応援の XP の順位・上位）を表示します。チャット欄のトップファンの画面から読み取ります。',
  ],
  ['公式の貢献度ランキング（niconico の表示に準拠）', 'YouTube 公式のトップファン（XP の順位）'],
  ['ギフト貢献度', 'トップファン'],
  // 数字のあとの単位「貢」→ XP(例: 410貢 → 410 XP)
  [/(\d[\d,]*)\s*貢(?![献])/g, '$1 XP'],
];

// トップファンの順位表が無い配信(アーカイブなど)は、入口がスパチャの合計の順位を入れている。XP ではないので pt にする。
const SUPERCHAT_RANK_RULES = [
  [
    'ニコニコ公式のギフト貢献度ランキング（上位）を表示します。ギフトを投げた人がいない配信では空になります（広告ポイントとは別系統です）。',
    'スーパーチャット・ギフトの合計の順位（上位）を表示します。トップファンの順位が出ていない配信（アーカイブなど）で使います。',
  ],
  ['公式の貢献度ランキング（niconico の表示に準拠）', 'スーパーチャット・ギフトの合計の順位'],
  ['ギフト貢献度', 'スパチャの合計順'],
  [/(\d[\d,]*)\s*貢(?![献])/g, '$1 pt'],
];

const RULES = [
  // ランキング欄の補足(title・aria-label)。どのサービスでも「ニコ生側」の一覧ではない(2026-11-08 Kick 実測で残りを発見)
  ['パーセントではありません。ニコ生側の一覧がDOMに出るまでの待機表示です。', 'パーセントではありません。一覧が出るまでの待機表示です。'],
  ['ニコ生プレイヤー表示の番組ギフト累計pt。', '配信全体のギフト累計pt。'],
  ['ニコ生 ランキング', 'ランキング'],
  // 折りたたみの中の説明(2026-11-08 Twitch 実測で残りを発見)。なふだはニコ生だけの部品(隠している)
  ['ニコ生のページが読み取る通信から', '配信のページが読み取る通信から'],
  ['ニコの匿名ID（a: 形式）はここには載せず、りんく条件を満たすときだけりんく、それ以外はたぬ姉側だよ。', ''],
  ['詳細設定（記録のON/OFF・なふだ・取り込み・', '詳細設定（記録のON/OFF・取り込み・'],
  ['「詳細設定（なふだ・取り込み・', '「詳細設定（取り込み・'],
  ['ニコ生の応援コメントを、このPCで見える化', 'YouTube の応援コメントを、このPCで見える化'],
  ['ニコニコ生放送 トップ', 'YouTube トップ'],
  ['ニコ生の視聴ページの右下に', 'YouTube の視聴ページの右下に'],
  ['ニコ生の画面改修でパネルが', 'YouTube の画面改修でパネルが'],
  ['ニコ生公式の表示は変わりません', 'YouTube 公式の表示は変わりません'],
  // マーケHTML の説明文(ニコ生版の文をそのまま使っている所)
  ['ニコニコユーザーID: ', 'YouTube チャンネル: '],
  ['配信者がニコニコでハンドル名を変更した場合、ここの表示と niconico の最新表示が異なることがあります', '配信者が YouTube でハンドル名を変更した場合、ここの表示と YouTube の最新表示が異なることがあります'],
  ['サムネ・名前は数値ID時のみ niconico ユーザーページへリンクします', 'サムネ・名前は YouTube のチャンネルへリンクします'],
  ['ニコ生は「誰がいつ入って、いつ出たか」を公開していません', 'YouTube は「誰がいつ入って、いつ出たか」を公開していません'],
  ['ニコ生の「この番組へのギフト履歴」に近い形で', 'YouTube のスーパーチャット・ギフトを'],
  ['ニコ生の匿名ギフトは「名無し」にまとまることがあります。', ''],
  ['ニコ生上で公開されている応援(コメント・ギフト)', 'YouTube 上で公開されている応援(コメント・スーパーチャット)'],
  ['ニコ生上で公開されているコメント・ギフト情報', 'YouTube 上で公開されているコメント・スーパーチャット情報'],
  ['ニコニコの公開プロフィールから', 'YouTube の公開ページから'],
  ['ニコ広告', '広告'],
  // YouTube には来場者数(延べの入場数)がない。「取れていない」と書くと故障に見えるので、無いものとして書く
  ['来場者数が取れていないため「来場 X 人中 Y 人がコメント」は表示できません。視聴ページを開いた状態で配信を記録し、再出力してください。', 'YouTube には来場者数（延べの入場数）がないため、「来場 X 人中 Y 人がコメント」は出しません。'],
  ['（来場者数は未取得）', ''],
  ['来場データ不足', 'YouTube に来場者数なし'],
  ['配信ページを開いたまま記録すると取得できます', 'YouTube には来場者数がありません'],
  ['手元記録の発言者数（来場者数が未取得のため参加率は出せません）', '手元記録の発言者数'],
  ['広告ランキング未取得（配信ページで記録）', 'YouTube に広告ランキングなし'],
  ['来場者数が未取得のため、来場とコメントの変換率は判定できません。', 'YouTube には来場者数がないため、来場とコメントの変換率は出しません。'],
  // 「ページの通信から人の情報をもらう」取り込みは YouTube では使わない(記録に名前と顔が入っている)。0件は正常
  ['取り込みは成功しましたが0件でした。watchを開いたままポップアップを更新するか、ページを再読み込みしてください。', 'YouTube 版では使いません（記録に名前と顔が入っているため・正常）。'],
];

/** 置き換えが起こりうる文字か(速く素通しするため) */
const QUICK = /貢|ニコ|niconico|来場|取得できます|広告ランキング|0件でした|なふだ/;

/**
 * @param {string} text
 * @param {{ topFans?: boolean }} [opts] topFans=false: ギフト貢献度の欄がスパチャの合計の順位のとき
 * @returns {string}
 */
export function ytWording(text, opts = {}) {
  const v = String(text ?? '');
  if (!QUICK.test(v)) return v;
  let out = v;
  const rules = [...(opts.topFans === false ? SUPERCHAT_RANK_RULES : TOP_FAN_RULES), ...RULES];
  for (const [from, to] of rules) {
    out = typeof from === 'string' ? out.split(from).join(/** @type {string} */ (to)) : out.replace(/** @type {RegExp} */ (from), /** @type {string} */ (to));
  }
  return out;
}

/**
 * 先に「トップファン」の言葉で直してしまった画面を、スパチャの合計の順位の言葉に戻す
 * (どちらを入れたかは、ギフト貢献度の欄を読んだときに初めて分かるため)。
 * @param {string} text
 * @returns {string}
 */
export function ytWordingTopFanToSuperChatRank(text) {
  let out = String(text ?? '');
  if (!/トップファン|XP/.test(out)) return out;
  out = swapOnce(out, TOP_FAN_RULES, SUPERCHAT_RANK_RULES);
  return out.replace(/(\d[\d,]*) XP\b/g, '$1 pt');
}

/**
 * 逆向き: 一度「スパチャの合計順」の言葉にした画面を、トップファンの言葉に戻す
 * (アーカイブを見たあと、トップファンの順位表がある配信へ移ったとき)。数字の単位は描き直しで直るので触らない。
 * @param {string} text
 * @returns {string}
 */
export function ytWordingSuperChatRankToTopFan(text) {
  const out = String(text ?? '');
  if (!/スパチャの合計順|スーパーチャット・ギフトの合計の順位/.test(out)) return out;
  return swapOnce(out, SUPERCHAT_RANK_RULES, TOP_FAN_RULES);
}

/**
 * 言い換えの1〜3番目(文・見出し・語)を、1回の走査で置き換える。順に置き換えると、置き換えた後の文の中の
 * 「トップファン」をもう一度置き換えて文を壊していた(「トップファンの順位が出ていない」→「スパチャの合計順の順位…」)。
 * @param {string} text
 * @param {any[]} fromRules
 * @param {any[]} toRules
 */
function swapOnce(text, fromRules, toRules) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (let i = 0; i < 3; i += 1) map.set(String(fromRules[i][1]), String(toRules[i][1]));
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return text.replace(re, (m) => map.get(m) ?? m);
}

// Twitch・Kick には YouTube のトップファン(XP の順位表)が無い。「ギフト貢献度」の欄には
//   この PC の記録から数えた Bits/Kicks・ギフトサブの合計の順位が入る。YouTube 版の言葉のどの段階の文でも
//   (トップファンの言葉で描いたあとスパチャの合計順へ入れ替えた途中の文も)ここでそのサービスの言葉にそろえる。
//   どれも決まった長い文言なので、コメント本文に当たることはない(2026-11-07 Twitch 実配信の計器で残りを発見)。

/** @param {string} s */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @typedef {{ name: string, paid: string, rankSentence: string, officialBoard?: string, boardPeriod?: string, noSubs?: boolean, boardUnit?: string, boardName?: string, boardPlace?: string }} WordingPlatform
 *   boardName: 公式ランキングの名前(無ければ「<paid> ランキング」・ツイキャスは「サポーターランキング」)
 *   boardPlace: 公式ランキングがある場所(無ければ「チャット欄のランキング」)
 *   name: 'Twitch' / 'Kick'、paid: 'Bits' / 'Kicks'(src/lib/platform/streamPlatform.js の表)
 *   officialBoard: そのサービスの画面での公式ランキングの名前(例: Kick の「歴代トップKICKユーザー」)
 *   boardPeriod: 公式ランキングの期間('ALLTIME' / 'MONTH' / 'WEEK' / 'DAY' / 'LEVEL'・無ければ累計)。Twitch はチャンネルごとに違う
 *   boardUnit: 公式ランキングの数の単位(無ければ paid。SHOWROOM・ミクチャは paid が「ギフト」なので「6,430 ギフト」にならないよう pt)
 */

/** @type {Map<string, Array<[RegExp, string]>>} */
const fixedRulesCache = new Map();
/** @param {WordingPlatform} p */
function fixedRules(p) {
  const k = `${p.name}|${p.paid}|${p.boardPeriod || ''}|${p.noSubs ? 1 : 0}`;
  const hit = fixedRulesCache.get(k);
  if (hit) return hit;
  const svc = `(?:YouTube|${esc(p.name)})`;
  const paid = `(?:スパチャ|${esc(p.paid)})`;
  // ふわっちにはサブスクが無いので「ギフトサブ」を書かない
  const heading = p.noSubs ? `${p.paid}の合計の順位` : `${p.paid}・ギフトサブの合計の順位`;
  const word = `${p.paid} の合計順`;
  const off = officialWords(p);
  /** @type {Array<[RegExp, string]>} */
  const rules = [
    // 公式ランキングの言葉で描いたあと、公式の順位表が無いと分かった(配信が変わった等)→ 記録から数えた言葉へ
    [new RegExp(esc(off.sentence), 'g'), p.rankSentence],
    [new RegExp(esc(off.heading), 'g'), heading],
    [new RegExp(esc(off.word), 'g'), word],
    [new RegExp(`${svc} のトップファン（チャットでの応援の XP の順位・上位）を表示します。チャット欄のトップファンの画面から読み取ります。`, 'g'), p.rankSentence],
    [new RegExp(`${svc} の${paid}の合計順（チャットでの応援の XP の順位・上位）を表示します。チャット欄の(?:トップファン|${paid}の合計順)の画面から読み取ります。`, 'g'), p.rankSentence],
    [new RegExp(`(?:スーパーチャット|${esc(p.paid)})・ギフトの合計の順位（上位）を表示します。(?:トップファン|${paid}の合計順)の順位が出ていない配信（アーカイブなど）で使います。`, 'g'), p.rankSentence],
    [new RegExp(`${svc} 公式のトップファン（XP の順位）`, 'g'), heading],
    [new RegExp(`(?:スーパーチャット|${esc(p.paid)})・ギフトの合計の順位`, 'g'), heading],
    [new RegExp(`${paid}の合計順`, 'g'), word],
  ];
  fixedRulesCache.set(k, rules);
  return rules;
}

/** 公式ランキングの期間の言葉 [文の中・見出し] */
const BOARD_PERIOD_WORDS = /** @type {Record<string, [string, string]>} */ ({
  ALLTIME: ['これまでの累計', '累計'],
  MONTH: ['今月', '今月'],
  WEEK: ['今週', '今週'],
  DAY: ['今日', '今日'],
  // ツイキャスのサポーターランキング: 配信者の今のサポーターレベルでのアイテムスコアの順(期間の切り替えは無い・2026-11-12 PC 実測)
  LEVEL: ['現在のレベルのアイテムスコア', '現在のレベル'],
});

/**
 * そのサービスの公式ランキング(Kick の Kicks ランキング・Twitch の Bits ランキング)を「ギフト貢献度」の欄に入れているときの言葉。
 * @param {WordingPlatform} p
 */
export function officialWords(p) {
  const [inSentence, inHeading] = BOARD_PERIOD_WORDS[String(p.boardPeriod || 'ALLTIME')] || BOARD_PERIOD_WORDS.ALLTIME;
  const board = p.boardName || `${p.paid} ランキング`;
  return {
    // Kick のチャット欄のランキングは6つあり、最初に見えるのは週間のサブ。どれと同じかを名前で書く(2026-11-08 PC 実測)
    sentence: `${p.name} 公式の ${board}（${inSentence}・上位）を表示します。${p.name} の${p.boardPlace || 'チャット欄のランキング'}${p.officialBoard ? `の${p.officialBoard}` : ''}と同じ値です。`,
    heading: `${p.name} 公式の ${board}（${inHeading}）`,
    word: board,
  };
}

/** @type {Map<string, Array<[RegExp, string]>>} */
const officialRulesCache = new Map();
/** @param {WordingPlatform} p */
function officialRules(p) {
  const k = `${p.name}|${p.paid}|${p.boardPeriod || ''}|${p.boardUnit || ''}|${p.boardName || ''}|${p.boardPlace || ''}`;
  const hit = officialRulesCache.get(k);
  if (hit) return hit;
  const off = officialWords(p);
  const svc = `(?:YouTube|${esc(p.name)})`;
  const paid = `(?:スパチャ|${esc(p.paid)})`;
  /** @type {Array<[RegExp, string]>} 長い文 → 見出し → 語 の順(文の中の語を先に変えて文を壊さない) */
  const rules = [
    [new RegExp(esc(p.rankSentence), 'g'), off.sentence],
    [new RegExp(`${svc} のトップファン（チャットでの応援の XP の順位・上位）を表示します。チャット欄のトップファンの画面から読み取ります。`, 'g'), off.sentence],
    [new RegExp(`${svc} の${paid}の合計順（チャットでの応援の XP の順位・上位）を表示します。チャット欄の(?:トップファン|${paid}の合計順)の画面から読み取ります。`, 'g'), off.sentence],
    [new RegExp(`(?:スーパーチャット|${esc(p.paid)})・ギフト(?:サブ)?の合計の順位（上位）を表示します。(?:トップファン|${paid}の合計順)の順位が出ていない配信（アーカイブなど）で使います。`, 'g'), off.sentence],
    [new RegExp(`${svc} 公式のトップファン（XP の順位）`, 'g'), off.heading],
    [new RegExp(`(?:スーパーチャット|${esc(p.paid)})・ギフト(?:サブ)?の合計の順位`, 'g'), off.heading],
    [new RegExp(`トップファン|${paid}の合計順|${esc(p.paid)} の合計順`, 'g'), off.word],
    // 公式の数は大きい(550,000 Kicks など)ので3桁ごとに区切る
    [/(\d[\d,]*) XP\b/g, /** @type {any} */ ((/** @type {string} */ _m, /** @type {string} */ n) => `${Number(n.replace(/,/g, '')).toLocaleString('ja-JP')} ${p.boardUnit || p.paid}`)],
  ];
  officialRulesCache.set(k, rules);
  return rules;
}

/**
 * 公式ランキングを出しているときの言葉に直す(どの段階の言葉で描いた文字に掛けてもよい・コメント本文に当たらない決まった文だけ)。
 * @param {string} text
 * @param {WordingPlatform} p
 */
export function ytWordingPlatformOfficial(text, p) {
  let out = String(text ?? '');
  if (!/トップファン|スパチャ|スーパーチャット|XP/.test(out) && !out.includes(p.paid)) return out;
  for (const [from, to] of officialRules(p)) out = out.replace(from, /** @type {any} */ (to));
  return out;
}

/**
 * Twitch/Kick の画面に残る、ランキング欄の決まった文言をそのサービスの言葉にする(どの文字に掛けてもよい)。
 * @param {string} text
 * @param {WordingPlatform} p
 */
export function ytWordingPlatformFixed(text, p) {
  let out = String(text ?? '');
  if (!/トップファン|スパチャ|スーパーチャット/.test(out) && !out.includes(p.paid)) return out;
  for (const [from, to] of fixedRules(p)) out = out.replace(from, to);
  return out;
}

/**
 * Twitch/Kick の配信を同じ画面で見せるとき、ytWording が YouTube の言葉にした所だけをそのサービスの言葉にする。
 *   ytWording が何も変えなかった文字(コメント本文など)には使わないこと。
 * @param {string} text ytWording の結果
 * @param {WordingPlatform} p
 */
export function ytWordingForPlatform(text, p) {
  return ytWordingPlatformFixed(String(text ?? ''), p)
    .split('スーパーチャット').join(p.paid)
    .split('スパチャ').join(p.paid)
    .split('トップファン').join(`${p.paid} の合計順`)
    .replace(/(\d[\d,]*) XP\b/g, '$1 pt')
    .split('YouTube').join(p.name);
}

/** Twitch の言葉(ytWording.test.js・既存の呼び出しのため) */
const TWITCH_WORDING = {
  name: 'Twitch',
  paid: 'Bits',
  rankSentence: 'Bits・ギフトサブの合計の順位（上位）を表示します。Twitch 公式のランキングが読めないため、このPCの記録から数えます。',
};

/** @param {string} text */
export function ytWordingTwitchFixed(text) {
  return ytWordingPlatformFixed(text, TWITCH_WORDING);
}

/** @param {string} text ytWording の結果 */
export function ytWordingForTwitch(text) {
  return ytWordingForPlatform(text, TWITCH_WORDING);
}
