/**
 * adMessageLines.js — 広告主が入れた文字を、そのままレポートに残すための整形。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ 何を解くか(2026-08-18 ユーザー確定)
 *   ユーザー:「広告はメッセージがおくれるという価値があるので、そのメッセージも記録したい」
 *
 *   ★実測(司令塔が実ブラウザでニコニ広告APIを直接叩いた):
 *     ranking/contribution が返すのは userId/advertiserName/totalContribution/rank/
 *     userPageUrl/thumbnailUrl/ownerReward の7つだけ。
 *     メッセージ専用フィールドは無く、**advertiserName に本文が載る**。
 *       「ゲスト」「とねりん」            … 名前として入れた人
 *       「コメリにも１６ｃｍ自慢行くの？」 … メッセージとして入れた人
 *
 * ■ ★仕分けない(ユーザー確定・v0.1.1430 の反省)
 *   一度「名前かメッセージか」を機械が判定する実装を入れたが、取り下げた。
 *   ユーザーの指摘:
 *     「人の名前をメッセージとして晒す 意味が分からない」
 *     「だれがめっせーじおくったか人してもらえてうれしいのに」
 *     「ユーザー側で匿名とかはニコニコの機能で選べるし」
 *   ＝どちらも広告主が公開の出稿画面に自分で入れた文字。隠す理由が無く、
 *     「誰が何を言ってくれたか」が分かること自体に価値がある。
 *   ★仕分けをやめたので、取りこぼしも誤判定も起きない。
 *
 * ■ 掟
 *   - 原文を【1文字も変えない】(記録の価値はそこにある)。
 *   - 0件なら '' を返す(ノイズにしない)。
 *   - 並びは公式の貢献pt順(rows の順)をそのまま使う=独自に並べ替えない。
 *
 * @module adMessageLines
 */

/** 1件あたりの表示上限(長すぎる本文でレポートが崩れないように)。★切ったことは明示する。 */
export const AD_MESSAGE_LINE_MAX_CHARS = 60;

/** レポートに載せる最大件数。 */
export const AD_MESSAGE_MAX_ROWS = 20;

/**
 * @typedef {{ name?: unknown, contribution?: unknown, isAnonymous?: unknown }} AdRankingRow
 */

/**
 * 広告ランキング行を「誰が・いくら・何と言ったか」の複数行テキストにする。
 *
 * ★rows は nicoadContributionRankingApi.js の normalizeNicoadRankingResponse が返す形
 *   （name は advertiserName の trim のみ＝原文）。
 *
 * @param {ReadonlyArray<AdRankingRow>|null|undefined} rows
 * @param {{ max?: number, maxChars?: number }} [opts]
 * @returns {string} 0件なら ''
 */
export function buildAdMessageLines(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '';
  const max = Math.max(1, Math.min(50, Math.floor(Number(opts.max) || AD_MESSAGE_MAX_ROWS)));
  const maxChars = Math.max(
    10,
    Math.floor(Number(opts.maxChars) || AD_MESSAGE_LINE_MAX_CHARS)
  );

  const lines = [];
  for (const r of list) {
    if (lines.length >= max) break;
    const raw = String(r?.name ?? '').trim();
    if (!raw) continue; // 文字が無い行は載せない(空行を作らない)
    // ★コードポイント単位で切る(絵文字を壊さない)
    const cps = [...raw];
    const shown = cps.length > maxChars ? cps.slice(0, maxChars).join('') + '…' : raw;
    const pt = Math.max(0, Math.floor(Number(r?.contribution) || 0));
    const ptText = pt > 0 ? ` ${pt.toLocaleString('ja-JP')}pt` : '';
    lines.push(`  ${shown}${ptText}`);
  }
  if (!lines.length) return '';
  return `広告でひとこと(${lines.length}件):\n${lines.join('\n')}`;
}
