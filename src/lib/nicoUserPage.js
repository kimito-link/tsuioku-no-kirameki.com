// 汎用: ニコ生ユーザーの公開ページ URL / 表示名 を作る純関数。
// 「サムネ・ハンドルネーム・アカウントID アンカーテキストは分かる限りセットで出す」原則の
// 共有部品。会場モード(venueBar / venue.html)・コメビュ(comeview)・パネルから再利用する。
//
// 元は comeviewActions.js の comeviewUserPageUrl にあった実装を、画面非依存の汎用 lib へ
// 切り出したもの。匿名(a:…)・数値でない ID には公開ページが無いので '' を返す。

/**
 * 数値 userId のみ公開ユーザーページ URL を作る。匿名(a:…)や ID なしは ''。
 * @param {string|number|null|undefined} userId
 * @returns {string} 'https://www.nicovideo.jp/user/<id>' または ''
 */
export function nicoUserPageUrl(userId) {
  const uid = String(userId == null ? '' : userId).trim();
  if (!/^\d{1,18}$/.test(uid)) return '';
  return `https://www.nicovideo.jp/user/${uid}`;
}

/**
 * 数値 userId かどうか(=公開ページ・アンカーを作れる本物のアカウント)。
 * 匿名(a:… や空)は false。
 * @param {string|number|null|undefined} userId
 * @returns {boolean}
 */
export function isLinkableNicoUserId(userId) {
  return nicoUserPageUrl(userId) !== '';
}

/**
 * 匿名ユーザーの安定した表示ラベルを作る。userId が無い/匿名でも「匿名NNN」のように
 * 人ごとに一定の番号を振り、原則(誰が誰か分かる)を顔だけの観客席でも満たす。
 * 数値が拾えない場合でもキー文字列から決定的な 1〜999 を導く(描画ごとに変わらない)。
 * @param {string|number|null|undefined} anonKey 匿名キー(a:… や name など)
 * @returns {string} '匿名123'
 */
export function anonymousDisplayLabel(anonKey) {
  const key = String(anonKey == null ? '' : anonKey).trim();
  const digits = key.replace(/\D+/g, '');
  if (digits.length > 0) {
    // 末尾3桁を採用(匿名IDは長いので下3桁が人ごとにばらける)。
    const tail = digits.slice(-3);
    const n = Number(tail);
    if (Number.isFinite(n) && n > 0) return `匿名${n}`;
  }
  // 数字が無いキーは文字コードから決定的ハッシュで 1〜999 を作る。
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) % 100000;
  }
  return `匿名${(h % 999) + 1}`;
}
