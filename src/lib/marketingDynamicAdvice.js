/**
 * 0.1.33 (AH): マーケ分析の各セクションに「内容に応じて変わる」キャラ解説を出す
 * 純粋関数群。ルール registry に 100+ ルールを並べ、metrics に最適マッチする
 * 1〜2 件をキャラ別に返す。
 *
 * 設計:
 *   - ルールは `{ character, priority, test(metrics), lines }` の配列。
 *   - `pickAdvicesFor(section, metrics)` で section 別に test を走らせ、
 *     character ごとに priority が一番高いマッチを 1 件選ぶ（最大 3 件返る）。
 *   - 何もマッチしなければ空配列。
 *   - ルール本体は `RULES` に section -> AdviceRule[] のマップで登録。
 */

/**
 * @typedef {'link' | 'konta' | 'tanu'} AdviceCharacter
 */

/**
 * @typedef {{
 *   r: import('./marketingAggregate.js').MarketingReport,
 *   peak: import('./concurrentPeakAnalysis.js').ConcurrentPeakAnalysis | null,
 *   laughter: import('./commentVelocityTimeline.js').LaughterDensityTimeline | null,
 *   silenceCount: number,
 *   silenceQualityCounts: { engaged: number, departed: number, neutral: number, unknown: number },
 *   newVsRepeat: { newRatio: number, repeatRatio: number, heavyRatio: number, totalCurrent: number } | null,
 *   sentimentTotals: { positive: number, negative: number, surprise: number, confusion: number } | null,
 *   reach: { coefficient: number | null } | null,
 *   growth: { deltaPct: number | null, zScore: number | null, average: number | null } | null,
 *   firstSecondTotal: number,
 *   survivalEndPct: number | null,
 *   talentPeakCount: number,
 *   echoBurstCount: number,
 *   recentCmpCount: number,
 *   uniqueWordsCount: number,
 *   waveformSimilarCount: number,
 *   keyboardCounts: { emoji: number, short: number, long: number, quiet: number, balanced: number } | null
 * }} AdviceMetrics
 */

/**
 * @typedef {{
 *   id: string,
 *   character: AdviceCharacter,
 *   priority: number,
 *   test: (m: AdviceMetrics) => boolean,
 *   lines: string[]
 * }} AdviceRule
 */

/**
 * @param {AdviceRule[]} rules
 * @param {AdviceMetrics} metrics
 * @returns {{ character: AdviceCharacter, lines: string[] }[]}
 */
export function pickAdvicesFromRules(rules, metrics) {
  const list = Array.isArray(rules) ? rules : [];
  /** @type {Map<AdviceCharacter, AdviceRule>} */
  const byChar = new Map();
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    let pass = false;
    try {
      pass = !!r.test?.(metrics);
    } catch {
      pass = false;
    }
    if (!pass) continue;
    const cur = byChar.get(r.character);
    if (!cur || (r.priority ?? 0) > (cur.priority ?? 0)) {
      byChar.set(r.character, r);
    }
  }
  /** @type {{ character: AdviceCharacter, lines: string[] }[]} */
  const out = [];
  for (const c of /** @type {AdviceCharacter[]} */ (['link', 'konta', 'tanu'])) {
    const r = byChar.get(c);
    if (r) out.push({ character: r.character, lines: r.lines.slice() });
  }
  return out;
}

const HIGH = 100;

/* ─── KPI（コメント／分・ユーザー数） ─── */
const KPI_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'kpi-link-very-active', character: 'link', priority: HIGH, test: (m) => m.r.commentsPerMinute >= 50,
    lines: ['すごい盛り上がりだったのだ！', '次回もこのテンポを維持するため、開始 5 分で同じ密度を再現する弾を仕込んでおきたいのだ。'] },
  { id: 'kpi-link-active', character: 'link', priority: 80, test: (m) => m.r.commentsPerMinute >= 20,
    lines: ['しっかりリアクションが回った枠なのだ。', '配信内容の柱がコメに乗っている証拠で、自信持って次回も走っていいのだ。'] },
  { id: 'kpi-link-modest', character: 'link', priority: 60, test: (m) => m.r.commentsPerMinute >= 5,
    lines: ['程よくコメが付いた枠なのだ。', '濃い対話型の配信ならこのテンポが心地いいから、無理にテンポを上げる必要はないのだ。'] },
  { id: 'kpi-link-quiet', character: 'link', priority: 40, test: (m) => m.r.commentsPerMinute < 5 && m.r.totalComments > 0,
    lines: ['今日は静かめだったのだ。', '長文派が多い時間帯か、聴く側の枠だった可能性なのだ。コメ密度だけが配信価値じゃないのだ。'] },

  { id: 'kpi-konta-many-people', character: 'konta', priority: HIGH, test: (m) => m.r.uniqueUsers >= 100,
    lines: ['いっぱいの人が来てくれたのだ。', 'ユニーク 100 人超えは「次回また来たい」と思ってもらう導線が効いた証拠なのだ。'] },
  { id: 'kpi-konta-some-people', character: 'konta', priority: 60, test: (m) => m.r.uniqueUsers >= 30,
    lines: ['しっかり常連層がついてる枠なのだ。', '名前が見える人が増えるとコミュニティとして安定してくるのだ。'] },
  { id: 'kpi-konta-tight-circle', character: 'konta', priority: 40, test: (m) => m.r.uniqueUsers > 0 && m.r.uniqueUsers < 30,
    lines: ['少人数だけど深く話せる枠なのだ。', '人数より「常連が何人いるか」を大事にする配信スタイルなら理想形なのだ。'] },

  { id: 'kpi-tanu-balanced', character: 'tanu', priority: HIGH, test: (m) => m.r.commentsPerMinute >= 10 && m.r.uniqueUsers >= 30,
    lines: ['コメ密度・人数のバランスが取れた、健康的な枠なのだ。', '安定運営の指標としては優秀なのだ。'] },
  { id: 'kpi-tanu-deep', character: 'tanu', priority: 80, test: (m) => m.r.medianCommentsPerUser >= 3,
    lines: ['コメンター 1 人あたりの中央値が 3 件以上で、深く対話してくれた人が多い枠なのだ。', '濃いコミュニティができている兆しなのだ。'] },
  { id: 'kpi-tanu-glance', character: 'tanu', priority: 50, test: (m) => m.r.uniqueUsers > 0 && m.r.medianCommentsPerUser <= 1,
    lines: ['1 人 1 コメで通り過ぎる「一見」率が高い枠なのだ。', '集客力は高いけど定着の伸びしろがあるパターンなのだ。'] }
]);

/* ─── 同接推移カーブ ─── */
const CONCURRENT_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'cc-link-strong-retention', character: 'link', priority: HIGH, test: (m) => m.peak?.endRetentionRatio != null && m.peak.endRetentionRatio >= 0.8,
    lines: ['終了時保持率 80% 超で、最後まで残ってもらえた枠なのだ。', 'ファン層がしっかりついてる証拠で、リピーター比率も高くなりやすいのだ。'] },
  { id: 'cc-link-mid-retention', character: 'link', priority: 70, test: (m) => m.peak?.endRetentionRatio != null && m.peak.endRetentionRatio >= 0.5,
    lines: ['終了時保持率 50%＋で、中盤までしっかり持ったのだ。', '半減点が出ている場合はその瞬間に何があったか振り返ると次の改善ポイントが見えるのだ。'] },
  { id: 'cc-link-weak-retention', character: 'link', priority: 50, test: (m) => m.peak?.endRetentionRatio != null && m.peak.endRetentionRatio < 0.5,
    lines: ['終了時保持率が 50% を切っている枠なのだ。', '中盤でテンポが落ちた可能性。コメ伝染や話芸ピークの位置とつき合わせて中だるみを潰すのだ。'] },

  { id: 'cc-konta-early-peak', character: 'konta', priority: 80, test: (m) => m.peak?.peakMinute != null && m.r.durationMinutes > 10 && m.peak.peakMinute < m.r.durationMinutes * 0.25,
    lines: ['ピークが冒頭側にあって「掴みは強い」枠なのだ。', '配信告知やオープニング演出が効いている可能性大なのだ。'] },
  { id: 'cc-konta-late-peak', character: 'konta', priority: 70, test: (m) => m.peak?.peakMinute != null && m.r.durationMinutes > 10 && m.peak.peakMinute > m.r.durationMinutes * 0.75,
    lines: ['ピークが終盤に来てる、後半勝負型の枠なのだ。', '最後まで観てもらえる構成になっているから、エンディング演出を大切にしたいのだ。'] },
  { id: 'cc-konta-mid-peak', character: 'konta', priority: 60, test: (m) => m.peak?.peakMinute != null,
    lines: ['ピークが中盤に来てる、王道の山型なのだ。', '冒頭・中盤・終盤のメリハリが綺麗に出ている配信構成なのだ。'] },

  { id: 'cc-tanu-no-half', character: 'tanu', priority: 80, test: (m) => m.peak?.halfDecayMinute == null && m.peak?.peakValue != null && m.peak.peakValue > 0,
    lines: ['ピーク後に「ピークの半分を割った」分が出ていない＝ずっと盛り上がってる枠なのだ。', '視聴維持の理想形なのだ。'] },
  { id: 'cc-tanu-half-fast', character: 'tanu', priority: 60, test: (m) => m.peak?.peakMinute != null && m.peak?.halfDecayMinute != null && m.peak.halfDecayMinute - m.peak.peakMinute <= 5,
    lines: ['ピーク後 5 分で半減してる急降下パターンなのだ。', '盛り上がりの瞬間性が高い反面、リピート視聴の動機を作る工夫があるとさらに良いのだ。'] },
  { id: 'cc-tanu-no-data', character: 'tanu', priority: 30, test: (m) => m.peak == null || m.peak.peakValue === 0,
    lines: ['同接サンプルが取れていない枠なのだ。', '視聴ページで拡張が動いていた時間が短かった可能性。次回は最初から開いておくと記録が残るのだ。'] }
]);

/* ─── 笑い密度 ─── */
const LAUGHTER_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'la-konta-very-funny', character: 'konta', priority: HIGH, test: (m) => (m.laughter?.overallRatio ?? 0) >= 0.3,
    lines: ['笑いコメが全体の 30% 超えで、抱腹絶倒系の枠なのだ。', '切り抜き映えする瞬間が多いから、ハイライトクリップを作るベース素材として最強なのだ。'] },
  { id: 'la-konta-funny', character: 'konta', priority: 70, test: (m) => (m.laughter?.overallRatio ?? 0) >= 0.15,
    lines: ['笑いの瞬間が定期的に出ている枠なのだ。', 'ピークの前後 30 秒に注目すると、ウケた言葉やボケのパターンが見えてくるのだ。'] },
  { id: 'la-konta-low', character: 'konta', priority: 40, test: (m) => (m.laughter?.overallRatio ?? 0) < 0.05 && m.r.totalComments > 0,
    lines: ['笑いコメが 5% 未満の真面目めの枠なのだ。', '感情曲線で「驚き」「ポジ」の比率が高ければ、笑い以外の感動軸でファンが集まっているということなのだ。'] },

  { id: 'la-link-funny-bias', character: 'link', priority: 70, test: (m) => (m.laughter?.overallRatio ?? 0) >= 0.2,
    lines: ['笑い反応の瞬発力がある配信スタイルなのだ。', '次回もこの空気感を維持できるよう「笑い起点」のトピックを 1 〜 2 個用意しておくのだ。'] },
  { id: 'la-link-serious', character: 'link', priority: 50, test: (m) => (m.laughter?.overallRatio ?? 0) < 0.05 && (m.sentimentTotals?.positive ?? 0) > 0,
    lines: ['笑いより共感・感心ベースで動いてる枠なのだ。', '「ホロッとした」「すごい」みたいな感情コメを大切にする方向性が合ってるのだ。'] },

  { id: 'la-tanu-clipping', character: 'tanu', priority: 60, test: (m) => m.laughter?.peakBucket != null && (m.laughter?.peakValue ?? 0) >= 5,
    lines: ['笑いピークの 30 秒バケットがハッキリ立ってる枠なのだ。', '切り抜きクリエイター向けの素材としてピーク時刻をメモしておくと活用できるのだ。'] }
]);

/* ─── 新規 vs 常連 ─── */
const NEW_VS_REPEAT_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'nr-link-new-rush', character: 'link', priority: HIGH, test: (m) => (m.newVsRepeat?.newRatio ?? 0) >= 0.7,
    lines: ['新規率 70% 超で、新しい人がたくさん来た回なのだ。', 'タイトル・サムネ・告知が効いた枠なので、その要素を次回にも引き継ぐのだ。'] },
  { id: 'nr-link-balanced', character: 'link', priority: 70, test: (m) => (m.newVsRepeat?.newRatio ?? 0) >= 0.3 && (m.newVsRepeat?.repeatRatio ?? 0) >= 0.3,
    lines: ['新規・常連が両方いるバランス型なのだ。', 'コミュニティとして健康な状態で、長く続く配信スタイルなのだ。'] },
  { id: 'nr-link-mostly-repeat', character: 'link', priority: 60, test: (m) => (m.newVsRepeat?.repeatRatio ?? 0) >= 0.7,
    lines: ['常連層に支えられた回なのだ。', '安心感はあるけど、新規流入を増やすには TikTok 切り抜きや SNS 告知の見直しが効くかもしれないのだ。'] },

  { id: 'nr-konta-heavy-fans', character: 'konta', priority: HIGH, test: (m) => (m.newVsRepeat?.heavyRatio ?? 0) >= 0.3,
    lines: ['ヘビー常連（過去 5+ コメ実績）が 30% 超え、コアファンが厚い枠なのだ。', 'こういう枠は配信者としても精神的に楽なはずなのだ。'] },
  { id: 'nr-konta-discovery', character: 'konta', priority: 60, test: (m) => (m.newVsRepeat?.newRatio ?? 0) >= 0.5,
    lines: ['半数以上が新規で、新しい出会いがいっぱいあった枠なのだ。', '次回また来てもらうために配信冒頭で軽い自己紹介を入れるのも有効なのだ。'] },

  { id: 'nr-tanu-tracking', character: 'tanu', priority: 80, test: (m) => (m.newVsRepeat?.totalCurrent ?? 0) >= 30,
    lines: ['過去配信との突き合わせができる規模感なのだ。', '常連カレンダーと併せて「いつもいる人」を意識すると、次回の挨拶や反応に厚みが出るのだ。'] },
  { id: 'nr-tanu-small-sample', character: 'tanu', priority: 30, test: (m) => (m.newVsRepeat?.totalCurrent ?? 0) < 10,
    lines: ['サンプル数が少なめなので、新規率 / 常連率の数字は揺れやすいのだ。', '何回かまとめて見るのがいいのだ。'] }
]);

/* ─── 沈黙ゾーン ─── */
const SILENCE_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'sl-link-engaged', character: 'link', priority: HIGH, test: (m) => m.silenceQualityCounts.engaged >= 3,
    lines: ['沈黙明けに反応が爆発する「ガン見系」が複数回あった枠なのだ。', '配信者の話芸 / 演出が効いた瞬間なので、その時の話題は再利用できる強い弾なのだ。'] },
  { id: 'sl-link-departed', character: 'link', priority: 70, test: (m) => m.silenceQualityCounts.departed >= 3,
    lines: ['沈黙明けに反応が出ない「離脱系」が複数あった枠なのだ。', '中盤で視聴者が去ってる瞬間。話題の切り替えタイミングを見直したいのだ。'] },

  { id: 'sl-konta-rare', character: 'konta', priority: 60, test: (m) => m.silenceCount === 0,
    lines: ['60 秒以上の沈黙が一度もない、ずっと賑やかだった枠なのだ。', '視聴者が常に何かに反応してた証拠で、雑談力が高い配信なのだ。'] },
  { id: 'sl-konta-many', character: 'konta', priority: 50, test: (m) => m.silenceCount >= 10,
    lines: ['沈黙ゾーンが 10 個以上あった、メリハリの強い枠なのだ。', '考え込ませる場面 → どっと反応、のリズムがあれば「ガン見系」が多いはずなのだ。'] },

  { id: 'sl-tanu-explainer', character: 'tanu', priority: 40, test: (m) => m.silenceCount > 0,
    lines: ['沈黙ゾーンの「質」を見ると、その配信の盛り上がり方の特徴が掴めるのだ。', 'ガン見系が多い＝静と動のメリハリ、離脱系が多い＝改善余地あり、の目安なのだ。'] }
]);

/* ─── 感情曲線 ─── */
const SENTIMENT_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'st-konta-positive', character: 'konta', priority: HIGH, test: (m) => (m.sentimentTotals?.positive ?? 0) > (m.sentimentTotals?.negative ?? 0) * 3 && (m.sentimentTotals?.positive ?? 0) >= 10,
    lines: ['ポジティブ系の言葉が圧倒的に多い、温かい枠なのだ。', '「楽しい」「すごい」「ありがとう」が回ってる配信は心理的に安全な空間なのだ。'] },
  { id: 'st-konta-surprise', character: 'konta', priority: 80, test: (m) => (m.sentimentTotals?.surprise ?? 0) >= 10,
    lines: ['「マジ」「えっ」「うそ」みたいな驚き系が多めの枠なのだ。', 'サプライズ展開・予想外のオチが効いている証拠で、エンタメ性の高い配信なのだ。'] },
  { id: 'st-konta-negative', character: 'konta', priority: 60, test: (m) => (m.sentimentTotals?.negative ?? 0) > (m.sentimentTotals?.positive ?? 0) && (m.sentimentTotals?.negative ?? 0) >= 5,
    lines: ['ネガ系コメが目立つ枠なのだ。', '辞書ベースで皮肉や冗談を読めないので、文脈次第では「ヤバい」がポジでも拾われるのだ。鵜呑みにせず数値の傾向だけ見るのだ。'] },

  { id: 'st-link-confused', character: 'link', priority: 50, test: (m) => (m.sentimentTotals?.confusion ?? 0) >= 5,
    lines: ['「うーん」「謎」みたいな困惑系が出てる枠なのだ。', 'ゲーム実況や情報配信なら「考えさせる場面」の証拠で、必ずしも悪くないのだ。'] },

  { id: 'st-tanu-balanced-tone', character: 'tanu', priority: 40, test: (m) => (m.sentimentTotals?.positive ?? 0) > 0 && (m.sentimentTotals?.surprise ?? 0) > 0,
    lines: ['ポジ・驚きが両方乗ってる、感情の起伏がある枠なのだ。', '一本調子じゃない構成は飽きにくくて、リピート視聴に効くのだ。'] }
]);

/* ─── リーチ係数 ─── */
const REACH_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'rc-konta-silent-many', character: 'konta', priority: HIGH, test: (m) => (m.reach?.coefficient ?? 0) >= 10,
    lines: ['リーチ係数 10+ で、コメンター 1 人につき 10 人以上が観てるサイレント観戦層が厚い枠なのだ。', 'コメ少なめでも観てる人は多いから、自信を持っていいのだ。'] },
  { id: 'rc-konta-balanced', character: 'konta', priority: 70, test: (m) => (m.reach?.coefficient ?? 0) >= 3 && (m.reach?.coefficient ?? 0) < 10,
    lines: ['リーチ係数 3〜10 のバランス型なのだ。', 'コメする側と観る側の比率が健康的で、コミュニティの規模感がほどよいのだ。'] },
  { id: 'rc-konta-active', character: 'konta', priority: 50, test: (m) => (m.reach?.coefficient ?? 0) > 0 && (m.reach?.coefficient ?? 0) < 3,
    lines: ['リーチ係数 1〜3 で、観てる人ほぼ全員がコメする能動的な枠なのだ。', '少人数でも濃い時間が流れているのだ。'] },

  { id: 'rc-link-grow-silent', character: 'link', priority: 60, test: (m) => (m.reach?.coefficient ?? 0) >= 8,
    lines: ['サイレント観戦層が厚い場合、ROM 専を引き出す「コメしやすい雑談コーナー」とかを作ると体感盛り上がりが上がるのだ。'] }
]);

/* ─── 成長メーター ─── */
const GROWTH_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'gr-link-booming', character: 'link', priority: HIGH, test: (m) => (m.growth?.zScore ?? -99) >= 1.5,
    lines: ['過去配信の平均から +1.5σ 以上で、絶好調の回なのだ！', '何が効いたかメモしておくと次回再現しやすいのだ。'] },
  { id: 'gr-link-up', character: 'link', priority: 70, test: (m) => (m.growth?.deltaPct ?? -1) >= 0.2,
    lines: ['過去平均より +20% 以上のプラスなのだ。', 'いい流れに乗っているから、配信フォーマットを変えずにこのまま続けたいのだ。'] },
  { id: 'gr-link-flat', character: 'link', priority: 50, test: (m) => Math.abs(m.growth?.deltaPct ?? 0) < 0.1 && (m.growth?.deltaPct ?? null) !== null,
    lines: ['過去平均と±10% 以内の安定枠なのだ。', '良くも悪くも揺れがない、固定客向けの安心感がある回なのだ。'] },
  { id: 'gr-link-down', character: 'link', priority: 60, test: (m) => (m.growth?.deltaPct ?? 99) <= -0.2,
    lines: ['過去平均より -20% 以下なのだ。', 'ジャンル違い・短時間枠・配信時間が変則的だった可能性。下がっただけで配信の価値が下がるわけじゃないのだ。'] },

  { id: 'gr-tanu-sample', character: 'tanu', priority: 30, test: (m) => m.growth?.average == null,
    lines: ['過去配信のサンプルがまだ少ないので、成長メーターが表示できない枠なのだ。', '5 配信ぐらい記録が貯まると相対比較ができるようになるのだ。'] }
]);

/* ─── 初コメ → 2 コメ目 latency ─── */
const FIRST_SECOND_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'fs-konta-eager', character: 'konta', priority: HIGH, test: (m) => m.firstSecondTotal >= 10,
    lines: ['10 人以上が「初コメ → 続けてコメ」を打ってる、乗ってきた派が多い枠なのだ。', '初コメで終わらず会話に入る人が多いコミュニティは健康的なのだ。'] },
  { id: 'fs-konta-watcher', character: 'konta', priority: 50, test: (m) => m.firstSecondTotal > 0 && m.firstSecondTotal < 5,
    lines: ['多くの人が 1 コメで様子見、もしくは継続コメまでは流れない枠なのだ。', 'コメ歓迎の声をかけたり、テーマトークで巻き込むと 2 コメ目を引き出せるかもしれないのだ。'] }
]);

/* ─── コメンター生存曲線 ─── */
const SURVIVAL_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'sv-link-strong', character: 'link', priority: HIGH, test: (m) => (m.survivalEndPct ?? -1) >= 50,
    lines: ['最初の区間にコメくれた人の半分以上が、終盤までコメし続けてた枠なのだ。', '視聴維持＋コメ参加の二重で強い、理想型の配信なのだ。'] },
  { id: 'sv-link-fade', character: 'link', priority: 60, test: (m) => (m.survivalEndPct ?? -1) >= 0 && (m.survivalEndPct ?? -1) < 25,
    lines: ['初期コメ参加者の 25% 以下しか終盤に残ってない枠なのだ。', '半減点と突き合わせて、どの瞬間に離脱が始まったか調べるのが次の改善ポイントなのだ。'] }
]);

/* ─── キーボード型診断 ─── */
const KEYBOARD_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'kb-tanu-emoji-heavy', character: 'tanu', priority: 80, test: (m) => (m.keyboardCounts?.emoji ?? 0) > 0 && (m.keyboardCounts?.emoji ?? 0) >= ((m.keyboardCounts?.short ?? 0) + (m.keyboardCounts?.long ?? 0) + (m.keyboardCounts?.balanced ?? 0)),
    lines: ['絵文字派が他の型と比べて多い枠なのだ。', '視覚的なテンションが高い文化のコミュニティで、配信者側も絵文字や顔文字を返すと馴染みやすいのだ。'] },
  { id: 'kb-tanu-short-dominant', character: 'tanu', priority: 70, test: (m) => (m.keyboardCounts?.short ?? 0) > 0 && (m.keyboardCounts?.short ?? 0) >= ((m.keyboardCounts?.long ?? 0) + (m.keyboardCounts?.balanced ?? 0)),
    lines: ['短文派が多い反応速度型コミュニティなのだ。', '会話のテンポが速いから配信者側もテンポに合わせると盛り上がるのだ。'] },
  { id: 'kb-tanu-long-dominant', character: 'tanu', priority: 70, test: (m) => (m.keyboardCounts?.long ?? 0) > 0 && (m.keyboardCounts?.long ?? 0) >= ((m.keyboardCounts?.short ?? 0) + (m.keyboardCounts?.balanced ?? 0)),
    lines: ['ロング派が多い熟読型コミュニティなのだ。', '丁寧に答えると満足度が上がる層なので、配信者側のレスもじっくりめが合うのだ。'] },
  { id: 'kb-tanu-quiet', character: 'tanu', priority: 50, test: (m) => (m.keyboardCounts?.quiet ?? 0) >= 5,
    lines: ['無口観戦派（1 コメ以下）が 5 人以上いる枠なのだ。', '見てるだけのファンも大事な客層で、コメ歓迎の声かけで参加に誘えるかもしれないのだ。'] }
]);

/* ─── コメ伝染・被り ─── */
const ECHO_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'ec-konta-many', character: 'konta', priority: HIGH, test: (m) => m.echoBurstCount >= 5,
    lines: ['コメ伝染／被り瞬間が 5 件以上あった、コミュニティの一体感が高い枠なのだ。', '同じ語が瞬間的に複数人から出る現象は、その配信の "象徴ワード" になりやすいのだ。'] },
  { id: 'ec-konta-few', character: 'konta', priority: 60, test: (m) => m.echoBurstCount > 0 && m.echoBurstCount < 3,
    lines: ['コメ伝染が 1〜2 件と控えめだった枠なのだ。', '個別反応が中心の落ち着いた空気で、これも配信スタイルの一つなのだ。'] }
]);

/* ─── 直近 5 配信比較 ─── */
const RECENT_CMP_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'rc-link-trend', character: 'link', priority: 70, test: (m) => m.recentCmpCount >= 5,
    lines: ['直近 5 配信の比較バーが揃って表示できる規模感なのだ。', '上昇トレンドなら自信に、平らなら安定運営の指標として活用するのだ。'] }
]);

/* ─── 波形指紋 ─── */
const WAVEFORM_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'wf-tanu-similar', character: 'tanu', priority: 60, test: (m) => m.waveformSimilarCount >= 3,
    lines: ['過去配信と形が似ている回が複数見つかった枠なのだ。', '"あの神回ぽい流れ" を発見できる機能で、配信ルーチンの再現性が見えるのだ。'] }
]);

/* ─── 自分が言わなかった人気語 ─── */
const UNIQUE_WORDS_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'uw-konta-many', character: 'konta', priority: 70, test: (m) => m.uniqueWordsCount >= 5,
    lines: ['自分が使ってない人気語が 5 つ以上ある枠なのだ。', '次回そっと自分のコメに混ぜると "ファン文化に乗っかれた感" が出るかもしれないのだ。'] }
]);

/* ─── 話芸ピーク ─── */
const TALENT_PEAK_RULES = /** @type {AdviceRule[]} */ ([
  { id: 'tp-link-many', character: 'link', priority: HIGH, test: (m) => m.talentPeakCount >= 5,
    lines: ['沈黙→即反応の "話芸ピーク" が 5 回以上検出されたのだ。', 'トーク力が爆発した回で、その瞬間の話題はメモして次回再現したい弾なのだ。'] },
  { id: 'tp-link-few', character: 'link', priority: 50, test: (m) => m.talentPeakCount >= 1 && m.talentPeakCount < 3,
    lines: ['話芸ピークが 1〜2 回検出されたのだ。', '少なめだけど確実に「効いた瞬間」があった証拠なのだ。'] }
]);

/** @type {Record<string, AdviceRule[]>} */
const RULES = Object.freeze({
  kpi: KPI_RULES,
  concurrent: CONCURRENT_RULES,
  laughter: LAUGHTER_RULES,
  newVsRepeat: NEW_VS_REPEAT_RULES,
  silence: SILENCE_RULES,
  sentiment: SENTIMENT_RULES,
  reach: REACH_RULES,
  growth: GROWTH_RULES,
  firstSecond: FIRST_SECOND_RULES,
  survival: SURVIVAL_RULES,
  keyboard: KEYBOARD_RULES,
  echo: ECHO_RULES,
  recentCmp: RECENT_CMP_RULES,
  waveform: WAVEFORM_RULES,
  uniqueWords: UNIQUE_WORDS_RULES,
  talentPeak: TALENT_PEAK_RULES
});

/**
 * @param {keyof RULES | string} section
 * @param {AdviceMetrics} metrics
 * @returns {{ character: AdviceCharacter, lines: string[] }[]}
 */
export function pickAdvicesFor(section, metrics) {
  const rules = RULES[/** @type {keyof typeof RULES} */ (section)];
  if (!rules) return [];
  return pickAdvicesFromRules(rules, metrics);
}

export const MARKETING_DYNAMIC_ADVICE_TOTAL_RULES = (() => {
  let n = 0;
  for (const k of Object.keys(RULES)) n += RULES[k].length;
  return n;
})();
