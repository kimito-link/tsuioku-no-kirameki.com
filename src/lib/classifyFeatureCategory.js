/**
 * classifyFeatureCategory.js — ファイルを機能カテゴリへ自動分類する純関数(v0.1.840・マップ網羅化 第1)。
 *
 * 背景(council/map-coverage-SYNTHESIS.md): 機能逆引き「○○を司るのはここ」は手書き FEATURES 辞書で
 * 31本しか載せておらず、src/lib 435本中404本(93%)が逆引きに無い(ギフト/読み上げ/吹き出し/タイミング系が
 * 引けない)。手書きで404本書くのは腐る。そこで【全ファイルの役割(先頭コメントから機械抽出済)を
 * カテゴリ別に自動分類して逆引きに全部出す】。本純関数はその分類の正本。
 *
 * 分類の優先順(誤分類を抑える):
 *   1. ファイル名/パスの接頭辞・キーワード(voice / venue / gift 等は名前で自明=最優先・確実)
 *   2. 役割テキスト(先頭コメント1行目)のキーワード
 *   3. どれも当たらねば 'その他'(=未分類・tree-map:check が件数を警告し分類キー追加を喚起)
 *
 * 返すカテゴリ文字列は repo-tree-map.mjs の CATEGORY_ORDER と一致させる(emoji 付き)。
 * 手書き FEATURES は最優先で上書きする(呼び出し側でマージ)。@tags 強制はしない(既存コメント破壊しない)。
 * 副作用なし。設計正本=council/map-coverage-SYNTHESIS.md。
 */

/** repo-tree-map.mjs の CATEGORY_ORDER と一致させる(変更時は両方直す)。 */
export const FEATURE_CATEGORIES = Object.freeze([
  '📤 送信',
  '📥 取得',
  '💾 記録',
  '🧮 集計',
  '🪟 表示・演出',
  '🔊 読み上げ',
  '📊 レポート',
  '🩺 診断・地図',
  'その他'
]);

/**
 * パス/ファイル名のキーワード → カテゴリ(最優先・確実な分類)。
 * 上から順に最初に当たったものを採用(順序が優先度)。
 * @type {Array<[RegExp, string]>}
 */
const PATH_RULES = [
  [/voice|読み上げ|speak|tts|voicevox/i, '🔊 読み上げ'],
  // 集計は表示より先に判定(laneCandidates/aggregate を「lane=表示」に取られないように)。
  [/laneCandidates|aggregate|personProfiles|kiramekiAwards|ranking|contribution|畳み込み/i, '🧮 集計'],
  [/venue|bubble|balloon|crowd|seat|throwProjectile|gift.*throw|projectile/i, '🪟 表示・演出'],
  [/lane|personTile|storyUserLane|supportGrid|avatar|nickname|userThumb/i, '🪟 表示・演出'],
  [/scroll|paint|render|viewport|layout|sceneFrame|characterScene/i, '🪟 表示・演出'],
  // インラインパネル(配置/サイズ/ドック)・公式iframe表示は表示・演出寄り。
  [/inline|panelPlacement|hostBeside|hostDock|quickbar|belowWideRow|focusGate/i, '🪟 表示・演出'],
  [/official.*iframe|iframeOfficial|hiddenOfficial|relay|reinject/i, '📥 取得'],
  [/backfill|ndgrBackfill|harvest|deepHarvest/i, '📥 取得'],
  [/ndgr|commentHarvest|nicoliveDom|intercept|commentObserv|commentIngest|commentPipeline/i, '📥 取得'],
  [/commentSubmit|submitConfirm/i, '📤 送信'],
  [/record|persist|storageKeys|chunk|tail|commentRecord|monotonic|idb|backup|sessionSummary/i, '💾 記録'],
  [/report|htmlReport|mediaKit|marketing|export|narrative|sessionSummary|engagement/i, '📊 レポート'],
  // 集計・分析(視聴者数推定/コメント分析/配信者評判 など)。
  [/concurrent|estimate|calibration|analytics|survivalCurve|velocity|fatigue|silence|echo|peak|engagementGap|reputation|crossCompare|fingerprint|waveform/i, '🧮 集計'],
  // コメビュ(comment viewer)・コメント装飾・お知らせ系は表示・演出。
  [/comeview|ticker|cheer|palette|celebration|pika|name.?link|emoji|sticker/i, '🪟 表示・演出'],
  // 配信者メタ・視聴者プロフィール・フォロー情報は集計(人物データ)。
  [/broadcaster|broadcast|channel|commenter|follow|identity|userNote|observationStore/i, '🧮 集計'],
  [/report|htmlReport|mediaKit|marketing|export/i, '📊 レポート'],
  [/diag|status|mindmap|siteLink|impact|featureMap|advisor|health|warning|changelog|verify/i, '🩺 診断・地図'],
  [/gift/i, '🪟 表示・演出'] // gift は演出寄り(送信者集計は role で 🧮 に寄せる)
];

/**
 * 役割テキスト(先頭コメント1行目)のキーワード → カテゴリ(②次点)。
 * @type {Array<[RegExp, string]>}
 */
const ROLE_RULES = [
  [/読み上げ|音声|発話|ボイス/, '🔊 読み上げ'],
  [/会場|吹き出し|席|群衆|演出|タイル|サムネ|アバター|レーン描画|描画|スクロール|表示/, '🪟 表示・演出'],
  [/送信|投稿/, '📤 送信'],
  [/過去ログ|バックフィル|収穫|取得|観測|デコード|NDGR|重複除去/, '📥 取得'],
  [/記録|保存|永続|storage|チャンク|テール|単調化/, '💾 記録'],
  [/集計|畳み込み|集約|ランキング|貢献度|スコア|候補/, '🧮 集計'],
  [/レポート|マーケ|メディアキット|HTML/, '📊 レポート'],
  [/診断|状態速報|マインドマップ|健全性|影響範囲|地図|警告|対処/, '🩺 診断・地図']
];

/**
 * ファイルを機能カテゴリへ分類する。
 * @param {string} path  例 'src/lib/voiceReadQueue.js'
 * @param {string} [role]  先頭コメントから抽出した役割の1行(任意)
 * @returns {string} FEATURE_CATEGORIES のいずれか('その他' を含む)
 */
export function classifyFeatureCategory(path, role) {
  const p = String(path ?? '');
  const name = p.split('/').pop() || p;
  // ① ファイル名/パス優先(確実)。テストファイルは呼び出し側で除外する想定だが念のため素通し対象外に。
  for (const [re, cat] of PATH_RULES) {
    if (re.test(name) || re.test(p)) return cat;
  }
  // ② 役割テキスト。
  const r = String(role ?? '');
  if (r) {
    for (const [re, cat] of ROLE_RULES) {
      if (re.test(r)) return cat;
    }
  }
  // ③ 未分類。
  return 'その他';
}
