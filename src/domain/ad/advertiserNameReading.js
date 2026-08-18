/**
 * advertiserNameReading.js — 広告主名の欄にある文字列を「名前」「広告メッセージ」「判定不能」に読み分ける純関数。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ 何を解くか(2026-08-18 ユーザー確定)
 *   ユーザー:「広告はメッセージが送れるという価値があるので、そのメッセージも記録したい」
 *
 *   ★司令塔が実ブラウザでニコニ広告APIを直接叩いて確定した事実:
 *     https://api.nicoad.nicovideo.jp/v1/contents/live/<lv>/ranking/contribution
 *     が返すフィールドは userId / advertiserName / totalContribution / rank /
 *     userPageUrl / thumbnailUrl / ownerReward の【7つだけ】。
 *     message/comment/body/text といった【メッセージ専用フィールドは存在しない】。
 *
 *   ところが advertiserName の実データは名前とメッセージが混在していた(実測20件):
 *     「ゲスト」「ON」「とねりん」          … 名前
 *     「コメリにも１６ｃｍ自慢行くの？」     … ★メッセージ
 *   ＝ニコ生は【広告メッセージを advertiserName の欄に載せて配信している】。
 *
 * ■ ★設計の核心: 保存には一切焼き付けない(C1)
 *   原文は既に `nicoadContributionRankingApi.js` が `name` として【無加工で】保存している。
 *   この関数は【表示のたびに原文から計算する】だけ。判定結果はどこにも保存しない。
 *   → 判定を後で改善したら、過去の記録も次の描画から新しい判定で読まれる
 *     (マイグレーション不要・再判定バッチ不要)。
 *
 * ■ ★誤りの非対称性(会議の合意)
 *   誤り①「人の名前をメッセージとして晒す」= 取り返しがつかない
 *   誤り②「メッセージを名前のまま扱う」    = 現状と同じ(価値が増えないだけ)
 *   → **判定不能は必ず名前側に倒す**。①を構造的に封じる。
 *
 * ■ ★文法の特徴を使わない(批判役の反証への回答)
 *   当初案は「助詞・句読点・動詞終止形」をスコア化する重み付き合議だった。
 *   批判役の反証: 広告主は絵文字のみ("💖✨")・英数字のみ("GET NOW 2026!")・
 *   単語列も自由に入れられる。文法特徴のスコアは全部「名前」か「判定不能」に偏り、
 *   かえって誤判定が増える。しかも実データ20件では重みを決められない(過学習)。
 *   → **内容を解析する規則を持たない**。見るのは次の3つだけ:
 *       ①userIdの有無 ②最後の1文字が終端記号か ③長さ
 *
 * ■ 掟
 *   - 純関数。DOM も storage も触らない。構造を返す(文字列に閉じない)。
 *   - 判定を変えたら必ず ADVERTISER_NAME_READING_VERSION を上げる。
 *   - ★unknown が多くても壊れていない。unknown を減らす改善は実データを増やしてから。
 *
 * @module advertiserNameReading
 */

/** 判定の版。規則を変えたら必ず上げる(スナップショットに判定当時の版を刻めるように)。 */
export const ADVERTISER_NAME_READING_VERSION = 1;

/**
 * メッセージ確定に使う終端記号。
 * ★ASCII の '.' は【意図的に除外】: 「hoge Inc.」型の固有名をメッセージと誤読すると
 *   誤り①(人の名前を晒す)になるため。
 */
export const AD_MESSAGE_TERMINAL_MARKS = Object.freeze(['。', '？', '！', '?', '!']);

/**
 * 終端記号があっても、これ未満の長さならメッセージと断定しない。
 * ★「推せ！」のような【短い名前】を守るため(誤り①の封鎖)。
 */
export const AD_MESSAGE_MIN_CODEPOINTS = 6;

/**
 * @typedef {{
 *   version: number,
 *   reading: 'name' | 'message' | 'unknown',
 *   hasUserId: boolean,
 *   endsWithTerminalMark: boolean,
 *   lengthCp: number
 * }} AdvertiserNameReading
 */

/**
 * 広告主名の欄を読み分ける。
 *
 * 判定順(上から順に確定):
 *   1. 空 → unknown
 *   2. userId あり → name（記名広告の advertiserName はアカウント名。実測20件と整合）
 *   3. 終端記号で終わる かつ 6文字以上 → message
 *   4. それ以外 → unknown（★名前と同じ扱いで表示する＝誤り①が起きない）
 *
 * @param {{ advertiserName?: unknown, hasUserId?: unknown }} input
 * @returns {AdvertiserNameReading}
 */
export function readAdvertiserName(input) {
  const text = String(input?.advertiserName ?? '').trim();
  const hasUserId = input?.hasUserId === true;
  // ★[...text] でコードポイント単位に分ける(サロゲートペア=絵文字を1文字と数える)。
  //   text.length だと "💖" が2文字になり長さの判定が狂う。
  const cps = [...text];
  const lengthCp = cps.length;
  const endsWithTerminalMark =
    lengthCp > 0 && AD_MESSAGE_TERMINAL_MARKS.includes(cps[lengthCp - 1]);

  /** @type {'name' | 'message' | 'unknown'} */
  let reading = 'unknown';
  if (!text) {
    reading = 'unknown';
  } else if (hasUserId) {
    reading = 'name';
  } else if (endsWithTerminalMark && lengthCp >= AD_MESSAGE_MIN_CODEPOINTS) {
    reading = 'message';
  }
  // ★上のどれにも当たらなければ unknown のまま = 表示は名前側に倒れる。

  return {
    version: ADVERTISER_NAME_READING_VERSION,
    reading,
    hasUserId,
    endsWithTerminalMark,
    lengthCp
  };
}
