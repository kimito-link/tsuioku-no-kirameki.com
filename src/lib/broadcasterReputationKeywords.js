/**
 * 配信者の評判チェック - ネガティブキーワード判定エンジン
 *
 * dns-osint-pro-ver2.0 の src/features/suggest/negative-keywords.js から
 * 「判定ロジックの純関数だけ」を移植 (2026-06-07)。
 *
 * 移植方針 ([[reference_broadcaster_reputation_check_from_dns_osint]] §2 視点2):
 *   - detectNegativeKeyword / analyzeNegativeSuggests / getOverallRiskLevel のみ移植
 *   - ❌ NEGATIVE_DOMAINS(5ch/爆サイ等への誘導リンク) は移植しない
 *       = 誹謗中傷サイトへの導線になり OSINT 戦略「侵襲的特定NG」に反するため
 *   - ❌ 営業CTA(リバースハック/LINE) は移植しない = 追憶は非営利方針
 *   - chrome.* 非依存の純関数 = Web版にも布石
 *
 * 位置づけ: 配信者「本人」の自己診断ツール。第三者を晒す道具にしない。
 */

/**
 * ネガティブキーワード辞書 (dns-osint v8.4.29 のチューニング済み版を踏襲)
 * リスクレベル: high(高) / medium(中) / low(低)
 */
export const NEGATIVE_KEYWORDS = {
  // 高リスク: 深刻な風評
  high: [
    '詐欺', '騙された', '被害', '悪質', '危険', '違法', '訴訟', '裁判', '逮捕',
    '告訴', '悪徳', 'ブラック', '最悪', 'やばい', 'ヤバい', 'ヤバイ', '炎上',
    'パワハラ', 'セクハラ', 'モラハラ', 'マタハラ', '未払い', '給料未払い',
    '倒産', '破産', '反社', '暴力団', '詐欺師', '犯罪', '横領', '不正', '汚職',
    '賄賂', '事件', '摘発', '告発', '被告', '有罪', '脱税', '裏金', '悪徳商法',
    'ネズミ講', 'ねずみ講', 'マルチ商法', 'ポンジスキーム', '情報商材',
    '高額請求', '架空請求', '洗脳', '勧誘しつこい', '強引な勧誘', '盗撮',
    '盗聴', '窃盗', 'フィッシング', '不当解雇', 'ヤクザ', 'やくざ', 'レイプ',
    'ネグレクト', '罪人', '誤報', '虚偽', '無免許',
    // 侮蔑語
    'ブタ', '豚', 'ハゲ', 'デブ', 'ブス', 'ゴリラ', 'チビ', 'キモい', 'キモオタ',
    // トラブル系
    '返金', '返金依頼', '返金保証', '返金不可', '返金対応', 'キャンセル',
    'クレーム', '退会', '解約', '中途解約', 'トラブル', '嫌悪',
    // プライベート系
    '離婚', '不倫', '浮気', '出会い', '暴露', '裏垢', '裏アカ', '退職', '離職',
    '辞めた', '残業',
    // 競合/MLM 系
    'デイトラ', 'アフィリエイト', 'MLM', 'マルチ',
    // ネット侮辱/疑惑系
    'なんJ', 'アンチ', '苦情', '苦言', '失敗', '捏造', '改ざん', '偽装',
    '内部告発', '逃亡', '失踪', '消えた', 'サギ', '嘘', '嘘つき', '疑惑',
    'スキャンダル', '嫌い', '怪しい', '不審',
    // 複合語のみ(単体「電話」「営業」は中立)
    '迷惑電話', '迷惑行為', '迷惑客', '営業電話', '勧誘電話', 'しつこい電話',
    '鳴り止まない', '無言電話'
  ],

  // 中リスク: ネガティブな印象
  medium: [
    '評判悪い', '悪評', '最低', 'ひどい', '酷い', 'クソ', 'くそ', 'うざい',
    'ウザい', 'しつこい', '怪しい', '苦情', 'クレーム', '不信', '嘘', 'ウソ',
    'うそつき', 'デマ', '無能', '対応悪い', '態度悪い', 'ぼったくり', '粗悪',
    '不良品', '欠陥', '炎上した', '不祥事', '隠蔽', 'ごまかし', '逃げた',
    '閉店', '廃業', '夜逃げ', '音信不通', 'ネットワークビジネス', '会員勧誘',
    '稼げない', 'ステマ', 'スパム', '解雇', 'リストラ'
  ],

  // 低リスク: 警告系のみ
  low: [
    'おすすめしない', 'やめとけ', '後悔', '失敗', '気をつけろ', '注意'
  ]
};

/**
 * 中立文脈の除外リスト (false positive 削減・dns-osint v8.4.29)
 * NG 語を含むが文脈は中立なフレーズを除外する。
 */
export const NEUTRAL_CONTEXT_PATTERNS = [
  { neutral: '迷惑メール対策', ng_in_neutral: ['迷惑'] },
  { neutral: '迷惑メール拒否', ng_in_neutral: ['迷惑'] },
  { neutral: '迷惑電話拒否', ng_in_neutral: ['迷惑'] },
  { neutral: '迷惑防止', ng_in_neutral: ['迷惑'] },
  { neutral: '電話番号', ng_in_neutral: ['電話'] },
  { neutral: '電話受付', ng_in_neutral: ['電話'] },
  { neutral: 'お電話', ng_in_neutral: ['電話'] },
  { neutral: '不安解消', ng_in_neutral: ['不安'] },
  { neutral: '不安払拭', ng_in_neutral: ['不安'] },
  { neutral: '失敗しない', ng_in_neutral: ['失敗'] },
  { neutral: '失敗しないため', ng_in_neutral: ['失敗'] },
  { neutral: '裏メニュー', ng_in_neutral: ['裏'] },
  { neutral: '裏技', ng_in_neutral: ['裏'] },
  { neutral: '闇市', ng_in_neutral: ['闇'] },
  { neutral: 'クレーム対応', ng_in_neutral: ['クレーム'] },
  { neutral: 'クレーム処理', ng_in_neutral: ['クレーム'] },
  { neutral: '苦情処理', ng_in_neutral: ['苦情'] },
  { neutral: '苦情対応', ng_in_neutral: ['苦情'] },
  { neutral: '事故防止', ng_in_neutral: ['事故'] },
  { neutral: '事故対策', ng_in_neutral: ['事故'] },
  { neutral: '危険物', ng_in_neutral: ['危険'] },
  { neutral: '危険予知', ng_in_neutral: ['危険'] }
];

// 中立文脈の「外側」にこれらがあれば NG 判定を維持する強NG語
const STRONG_NG_WORDS = ['詐欺', '騙された', '違法', '逮捕', '横領', 'パワハラ', 'セクハラ'];

/**
 * 検出された NG 語が「中立文脈の中の語」か判定
 * @param {string} lowerText - 小文字化済みテキスト
 * @param {string} matchedKeyword - 検出された NG 語
 * @returns {boolean} true なら中立文脈とみなし NG 判定から外す
 */
export function isInNeutralContext(lowerText, matchedKeyword) {
  for (const rule of NEUTRAL_CONTEXT_PATTERNS) {
    if (
      lowerText.includes(rule.neutral.toLowerCase()) &&
      rule.ng_in_neutral.includes(matchedKeyword)
    ) {
      // 中立フレーズの「外側」に別の強NG語があるなら NG 維持
      const textOutsideNeutral = lowerText.split(rule.neutral.toLowerCase()).join(' ');
      for (const strongNg of STRONG_NG_WORDS) {
        if (textOutsideNeutral.includes(strongNg)) return false;
      }
      return true;
    }
  }
  return false;
}

/**
 * テキストからネガティブキーワードを検出
 * @param {string} text
 * @returns {{ level: ('high'|'medium'|'low'|null), keyword: (string|null) }}
 */
export function detectNegativeKeyword(text) {
  if (!text || typeof text !== 'string') {
    return { level: null, keyword: null };
  }

  const lowerText = text.toLowerCase();

  /** @type {Array<'high'|'medium'|'low'>} */
  const levels = ['high', 'medium', 'low'];
  for (const level of levels) {
    for (const keyword of NEGATIVE_KEYWORDS[level]) {
      if (lowerText.includes(keyword.toLowerCase())) {
        if (isInNeutralContext(lowerText, keyword)) continue;
        return { level, keyword };
      }
    }
  }

  return { level: null, keyword: null };
}

/**
 * サジェストリストからネガティブキーワードを検出
 * @param {Array<string>} suggests
 * @returns {Array<{ text: string, level: (string|null), keyword: (string|null) }>}
 */
export function analyzeNegativeSuggests(suggests) {
  if (!Array.isArray(suggests)) return [];
  return suggests.map((suggest) => {
    const { level, keyword } = detectNegativeKeyword(suggest);
    return { text: suggest, level, keyword };
  });
}

/**
 * 全体のリスクレベルを取得
 * @param {Array<{ level: (string|null) }>} analyzedSuggests
 * @returns {'high'|'medium'|'low'|'safe'}
 */
export function getOverallRiskLevel(analyzedSuggests) {
  if (!Array.isArray(analyzedSuggests) || analyzedSuggests.length === 0) {
    return 'safe';
  }
  if (analyzedSuggests.some((s) => s.level === 'high')) return 'high';
  if (analyzedSuggests.some((s) => s.level === 'medium')) return 'medium';
  if (analyzedSuggests.some((s) => s.level === 'low')) return 'low';
  return 'safe';
}
