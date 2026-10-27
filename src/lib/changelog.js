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
    version: '0.1.1797',
    date: '2026-10-27',
    summary: '読み上げの遅れがたまったら少し早口で追いつく',
    items: Object.freeze([
      '1件の声が、次のコメントが来るまでの間隔より少しだけ長い状態が続くと、読み上げの遅れが1件ごとに積もり、10件目で6〜7秒遅れていました(PC 試験)。順番待ちが1.5秒を超えたら、待ちの長さに合わせて少し早口にして追いつくようにしました。落ち着いている時の声の速さは変わりません。',
      'コメビュにはこの追いつく仕組みが無く、放送ページより遅れやすかったのもそろえました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1796',
    date: '2026-10-27',
    summary: '短いコメントの声もメモリの少ない受け取り方に',
    items: Object.freeze([
      'VOICEVOX から声を受け取る方法を、メモリの少ない「少しずつ受け取る」方法にそろえました。2つの方法を混ぜると両方の分のメモリを取っていました(PC 実測: グラボ有り 3.6GB→2.1GB・無し 2.7GB→1.5GB)。声の中身は同じで、グラボ無しの PC では短いコメントが少し早く鳴ります。',
      'スマホへ声を送る係も、PC と同じ声の組から選ぶようにしました(全部の声を使ってメモリが膨らみ、同じ人の声がスマホと PC で違っていました)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1795',
    date: '2026-10-27',
    summary: '読み上げの声の組を変えてメモリを半分以下に',
    items: Object.freeze([
      'VOICEVOX は声のデータファイルを読み込むたびにメモリを取り、返しません(PC 実測: 全部で約14GB)。コメントする人が多い配信ほど重くなり、読み飛ばしが起きていました。普通のPCでも、4つのファイルに収まる26種類の声から割り当てるようにして、メモリが約3.7GBで止まるようにしました。',
      '人ごとの違いは声の高さと速さでも付くので、聞き分けはできます。常連さんの声はこの版で一度だけ変わることがあります。設定で絞り込みを「しない」にしている人は今までどおり全部の声を使います。'
    ])
  }),
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
