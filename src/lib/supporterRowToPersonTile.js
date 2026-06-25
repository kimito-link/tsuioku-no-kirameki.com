/**
 * 応援者ランキングの行(SupporterRow)を、本物の人物タイル(buildPersonTileEl)が要求する
 * PersonTileItem へ変換する純関数。
 *
 * AGENTS.md §3.5「人が画面に出る場所ではサムネ・ID・ハンドル・リンクをセットで出す」を、
 * status の「🏆 応援者ランキング」でも満たすための変換。avatar は
 *   ① row.avatarUrl(あれば最優先) → ② 数値uid から公式サムネ導出 → ③ 匿名 identicon
 * の順で解決(§3.5 の「サムネが直接取れないとき userId から公式確定パターンで導出」)。
 *
 * meta(idLine/nameLine)は応援レーンと同じ正本 storyUserLaneMetaLines に寄せる(似せて自作しない・
 * 匿名は「匿名」+識別の形に揃う)。リンク可否・URL 組み立ては buildPersonTileEl 側が
 * entry.userId から判定するので、ここでは entry.userId を素直に渡すだけ。
 *
 * 純関数: chrome / DOM / 可変グローバルに依存しない。avatar 導出・meta 構築は引数で注入する。
 *
 * @module supporterRowToPersonTile
 */

/**
 * @typedef {{
 *   rank: number, userId: string, name: string,
 *   avatarUrl: string, count: number, isAnonymous: boolean
 * }} SupporterRow
 */

/**
 * @typedef {{
 *   deriveAvatarUrlFromUid: (uid: string) => string,
 *   anonymousIdenticonDataUrl: (uid: string, sizePx?: number) => string,
 *   storyUserLaneMetaLines: (entry: {userId?: string, nickname?: string}, httpCandidate: string) => { idLine: string, nameLine: string }
 * }} SupporterRowTileIo
 */

/**
 * SupporterRow 1件 → PersonTileItem(buildPersonTileEl の入力)。
 *
 * @param {SupporterRow} row 応援者ランキングの1行
 * @param {SupporterRowTileIo} io avatar 導出・meta 構築の注入
 * @returns {{ displaySrc: string, title: string, meta: { idLine: string, nameLine: string }, entry: { userId: string } }}
 */
export function supporterRowToPersonTile(row, io) {
  const userId = String(row?.userId || '').trim();
  const name = String(row?.name || '').trim();
  const avatarUrl = String(row?.avatarUrl || '').trim();

  // displaySrc: ① 既存 avatarUrl → ② 数値uid から公式サムネ → ③ 匿名 identicon。
  let displaySrc = avatarUrl;
  if (!displaySrc) {
    const derived = io.deriveAvatarUrlFromUid(userId);
    if (derived) {
      displaySrc = derived;
    } else if (row?.isAnonymous || userId) {
      // 数値uid でない(匿名 a: 等)= identicon で識別できる形にする(§3.5・一律グレー化禁止)。
      displaySrc = io.anonymousIdenticonDataUrl(userId || name, 64);
    }
  }

  // meta は応援レーンと同じ正本。nickname は SupporterRow の name を渡す
  //   (匿名は storyUserLaneMetaLines 側で「匿名」フォールバックに揃う)。
  const meta = io.storyUserLaneMetaLines({ userId, nickname: name }, displaySrc);

  return {
    displaySrc,
    title: name || userId || '応援者',
    meta,
    entry: { userId }
  };
}
