/**
 * 拡張の更新履歴データと semver 比較ヘルパ。
 * 直近20バージョンのみ同梱（旧版は changelog-archive.js）。
 *
 * 設計（0.1.12 D: 更新履歴 popup 表示）:
 *   ・version 文字列・日付・概要・項目配列を JSON-like なデータ構造で保持。
 *   ・popup-entry.js が <details id="changelogPanel"> の中身として描画する。
 *   ・各項目は HTML を含まずプレーンテキスト。
 *
 * @typedef {{
 *   version: string,
 *   date: string,
 *   summary: string,
 *   items: readonly string[]
 * }} ChangelogEntry
 */

/** @type {readonly ChangelogEntry[]} */
export const EXTENSION_CHANGELOG = Object.freeze([
  Object.freeze({
    version: '0.1.1794',
    date: '2026-10-27',
    summary: '会場とコメビュで同じコメントを二重に読まない',
    items: Object.freeze([
      '同じ配信を放送ページの会場とコメビュの両方で開いていると、同じコメントが2回読まれ、声も遅れていたのを直しました。先に読み始めた方だけが読み、そちらを閉じるか読み上げを切ると、数秒でもう片方が引き継ぎます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1793',
    date: '2026-10-27',
    summary: '低めの声の人の最初の長文も揃える',
    items: Object.freeze([
      '声を低めにずらした人の最初の長いコメントが、まだ少し小さく鳴ることがあったのを直しました。声ごとに、高さを変えたときの音量の変わり方を全127の声で測った表を使います。'
    ])
  }),
  Object.freeze({
    version: '0.1.1792',
    date: '2026-10-27',
    summary: '短いコメントも聞こえの大きさで揃える',
    items: Object.freeze([
      '短いコメントも、長いコメントと同じく「聞こえの大きさ」で音量を揃えるようにしました。声やコメントの長さが変わっても、音量がそろいやすくなります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1791',
    date: '2026-10-27',
    summary: '低めの声の人の1件目を小さくしない',
    items: Object.freeze([
      '声を低めにずらした人の、最初の長いコメントが小さく鳴ることがあったのを直しました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1790',
    date: '2026-10-27',
    summary: '低めの声の長いコメントを小さくしない',
    items: Object.freeze([
      '声を低めにずらした人の長いコメントが、小さく鳴ることがあったのを直しました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1789',
    date: '2026-10-27',
    summary: '短いコメントの音量のばらつきを戻す',
    items: Object.freeze([
      '0.1.1788 で、遅い PC で読む短いコメントの音量がばらつくようになっていたのを直しました。長いコメントの揃え方はそのままです。'
    ])
  }),
  Object.freeze({
    version: '0.1.1788',
    date: '2026-10-27',
    summary: '声ごとの音量を聞こえの大きさで揃える',
    items: Object.freeze([
      '長いコメントを読むとき、声ごとの音量を「聞こえの大きさ」で揃えるようにしました。2種類の声が混ざると、途中の文が大きすぎたり小さすぎたりしていたのを抑えます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1787',
    date: '2026-10-27',
    summary: '短い文の直後の長い文を大きくしない',
    items: Object.freeze([
      '短いコメントを続けて読んだ直後の長いコメントが、少し大きく鳴ることがあったのを直しました。声の大きさの覚え方を、長い文だけから覚えるようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1786',
    date: '2026-10-27',
    summary: '初めての声の1件目を上げすぎない',
    items: Object.freeze([
      '初めて使う声の1件目が、2件目以降より大きく鳴ることがあったのを抑えました。VOICEVOX の全127の声を測った値をもとに、上げすぎない側に見積もります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1785',
    date: '2026-10-27',
    summary: '最初の長文が大きすぎるのを抑える',
    items: Object.freeze([
      '読み上げを始めて最初に読む長いコメントが、ほかより大きく鳴ることがあったのを直しました。初めての声は、出だしの音の大きさから全体の大きさをより正しく見積もります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1784',
    date: '2026-10-27',
    summary: '読み上げ試験の開始待ちを直す',
    items: Object.freeze([
      '開発版の読み上げ試験で、読み上げを ON にしている途中に始めると「OFF です」と止まっていたのを、ON になり終わるまで待つようにしました(ふだんの動きは変わりません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1783',
    date: '2026-10-27',
    summary: '試験で声ごとの素の大きさを記録',
    items: Object.freeze([
      '開発版の読み上げ試験の記録に、声ごとの素の大きさ(最大振幅と聞こえの大きさ)を残すようにしました。声ごとの音量差を、実際の声の形を見てから直すための計器です(ふだんの動きは変わりません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1782',
    date: '2026-10-27',
    summary: '読み上げ中は声の裏読み込みを待つ',
    items: Object.freeze([
      '会場かコメビュが声を鳴らしている間や、次のコメントを待つ短い間に、もう片方のページが声の読み込みを始めないようにしました。グラボの無い PC で、起動直後に声が出るまでの遅れが減ります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1781',
    date: '2026-10-27',
    summary: '会場とコメビュで声の準備を譲り合う',
    items: Object.freeze([
      '会場とコメビュを同時に使っている時、片方が読み上げている間はもう片方が声の裏読み込みを始めないようにしました。グラボの無い PC で、読み上げを ON にした直後の遅れが減ります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1780',
    date: '2026-10-26',
    summary: '初めての声も聞こえの大きさをそろえる',
    items: Object.freeze([
      '初めて読み上げる声も、最初に届いた分で聞こえの大きさを見積もり、大きすぎる声を下げるようにしました(これまでは一度鳴らした声だけでした)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1779',
    date: '2026-10-26',
    summary: '声ごとの聞こえの大きさをそろえる',
    items: Object.freeze([
      '読み上げの音量を「一番大きい瞬間」だけでなく「聞こえの大きさ」でもそろえるようにしました。声によって大きく聞こえたり小さく聞こえたりする差が縮みます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1778',
    date: '2026-10-26',
    summary: '会場の声の裏読み込みが15秒止まるのを直す',
    items: Object.freeze([
      '会場(視聴ページ)で声を裏で読み込む時、VOICEVOX の「中身なし」の返事を受け取れず15秒の打ち切りまで止まっていたのを直しました。その間ほかの声の準備も待たされていました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1777',
    date: '2026-10-26',
    summary: '裏の声の準備で次のコメントを待たせない',
    items: Object.freeze([
      '読み上げ中や順番待ちがある間は、声の裏読み込みを始めないようにしました(読み込み中はエンジンが他の声を作れず、次のコメントの声が遅れていたため)。',
      '静かになって1.5秒たってから裏読み込みを始めます。開発版の試験で、裏読み込みの件数と最長時間も記録します。'
    ])
  }),
  Object.freeze({
    version: '0.1.1776',
    date: '2026-10-26',
    summary: '読み上げの列に来た件数を数える',
    items: Object.freeze([
      '読み上げの列に来たコメントの件数を数えるようにしました(開発版の試験で、本物のコメントがどれだけ混ざったかを分けて見るため)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1775',
    date: '2026-10-26',
    summary: '読み上げの途中で急に小さくならないように',
    items: Object.freeze([
      '長いコメントを少しずつ読むとき、出だしが静かだと音量を上げすぎて、途中で急に小さく下げ直すことがあったのを、その声の前回の大きさを覚えて最初から合わせるようにしました。',
      'ほかの読み上げを準備している最中は、少しずつ読まずに丸ごと作ってから読むようにしました(途中で声が途切れるのを防ぐため)。'
    ])
  })
]);


/**
 * 先頭（最新）の changelog エントリを返す。
 * @returns {ChangelogEntry}
 */
export function getLatestChangelogEntry() {
  return EXTENSION_CHANGELOG[0];
}

/**
 * `MAJOR.MINOR.PATCH` の semver を数値として比較する。
 *   compareSemver('0.1.10', '0.1.9') > 0  // 文字列比較だと逆になるので注意
 * @param {string} a
 * @param {string} b
 * @returns {number} a > b で正、a < b で負、同値で 0
 */
export function compareSemver(a, b) {
  const pa = String(a || '0.0.0').split('.').map((n) => Number(n) || 0);
  const pb = String(b || '0.0.0').split('.').map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}
