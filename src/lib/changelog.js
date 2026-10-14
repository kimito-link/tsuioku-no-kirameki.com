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
    version: '0.1.1618',
    date: '2026-10-08',
    summary: '拡張が/live/と同じ数え方で差を測る',
    items: Object.freeze([
      '拡張の中でも、/live/ と同じ数え方(配信者を除く・ID なしは数えない・コメントの多い順)で応援レーンを作り、いまの応援レーンと並べて違いを数えるようにしました(表示はまだ変えません。状態速報の「/live/規則との差」の行で確認できます)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1617',
    date: '2026-10-08',
    summary: 'ギフト・広告の列が一瞬消えるのを防ぐ',
    items: Object.freeze([
      '視聴中の配信が一瞬なくなって同じ配信へ戻ると、ギフト列・広告列の人が一度消えて、取り直すまで29人→14人のように減って見えていました。同じ配信へ戻るときは、前の人たちを引き継ぐようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1616',
    date: '2026-10-08',
    summary: 'グリッドの中身の入替を数える',
    items: Object.freeze([
      '応援コメントのアイコングリッドで、同じマスに別のコメントが入った回数と、ID が後から付いた回数を数えて状態速報に出すようにしました(ちらつきの原因を調べるための計器です)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1615',
    date: '2026-10-08',
    summary: '忙しい配信で読み上げ文を短くする',
    items: Object.freeze([
      'コメントが速くて読み上げが追いつかないとき、速度を上げるのと同じ段で、読み上げる文字数も短く(最短30文字)するようにしました。長いコメントを長いまま合成して詰まる状態を減らします。'
    ])
  }),
  Object.freeze({
    version: '0.1.1614',
    date: '2026-10-08',
    summary: 'IDなしコメントを同じ人扱いしない',
    items: Object.freeze([
      '応援コメントのアイコングリッドで、ID が取れていない匿名コメントが「同じ人の×2〜×75」のように並んで見えていたのを直しました。ID が分からないコメントは、1件ずつ別の人として数えます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1613',
    date: '2026-10-08',
    summary: '会場のタイルの大きさを①と同じにした',
    items: Object.freeze([
      '会場の段(ギフト・広告など)のタイルが、サイドパネルの同じ人より少し大きく(アイコン46px・①は44px)出ていたのを揃えました。原因は、会場がニコ生ページ上で別の寸法規則(枠線が外側に足される)で描かれていたことです。'
    ])
  }),
  Object.freeze({
    version: '0.1.1612',
    date: '2026-10-08',
    summary: '会場の人数が途中で減らないようにした',
    items: Object.freeze([
      '会場が、いま出している人数より少ない鏡を受け取っても採らず、直前の良い状態を保つようにしました(配信が替わったとき・15分以上古いときは除く)。採らなかった回数は状態速報の「会場の人数」行に出ます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1611',
    date: '2026-10-08',
    summary: '会場の人数の増減を状態速報に出す',
    items: Object.freeze([
      '会場で人数が減ったとき、いつ・何人から何人に・何が原因かを状態速報に出すようにしました(観測だけで、ふだんの動きは変えません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1610',
    date: '2026-10-08',
    summary: 'サムネが出ない人の顔をPOPと会場で揃える',
    items: Object.freeze([
      'アイコン未設定の人が、POPでは白い丸、会場ではゆっくり顔と別々の見た目になっていました。どちらも同じ、その人ごとのゆっくり顔に揃えました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1609',
    date: '2026-10-08',
    summary: '会場で重複する人のタイルが消えるのを直す',
    items: Object.freeze([
      '同じ人が2つの列(例: りんく列と広告列)にいるとき、会場では片方のタイルが消えていました。POPと同じように両方の列に出るようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1608',
    date: '2026-10-08',
    summary: '会場が席を毎回書き直すのをやめて軽く',
    items: Object.freeze([
      '会場モードを開くと、視聴ページが席の見た目を1秒に何千回も書き直していて重くなっていました。変わった所だけ書くようにして、書き直しを約98%減らしました(見た目は変わりません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1607',
    date: '2026-10-08',
    summary: '複数タブで配信が入れ替わるのを止める',
    items: Object.freeze([
      'ニコ生のタブを複数開いていると、タブ同士が『最後に見た配信』を書き合い、パネルの配信が入れ替わったり、全パネルが描き直しを繰り返したりしていました。URLが変わった時と前面に来た時だけ書くようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1606',
    date: '2026-10-08',
    summary: '会場カードが空の原因を診断に出す',
    items: Object.freeze([
      '会場のカードで発言の中身が出なかったとき、状態速報に『発言回数・何秒前・データの出所・本文の有無』が出るようにしました(原因の切り分け用。ふだんの動きは変えません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1605',
    date: '2026-10-08',
    summary: '全員分の再計算を使い回して軽く',
    items: Object.freeze([
      'パネルが描き直すたびに全員分やり直していた顔画像の生成・ニックネーム判定・数字の整形を、使い回すようにしました(見た目は変わりません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1604',
    date: '2026-10-08',
    summary: '頻繁な保存で何度も描き直さない',
    items: Object.freeze([
      'パネルが、配信者情報や放送終了などの頻繁な保存のたびに描き直していたのを、3秒に1回にまとめました。診断専用の保存では描き直しません。実データ入りの計測で、パネルが忙しい時間が約4割減りました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1603',
    date: '2026-10-08',
    summary: '診断キーの保存で描き直さない',
    items: Object.freeze([
      'パネルが、診断・ログ専用の保存(読み込み記録・音声診断など)に反応して描き直す無駄を減らしました。書き込みの多いデータ(プロフィール表・ギフト履歴)は間引き側に回しています。'
    ])
  }),
  Object.freeze({
    version: '0.1.1602',
    date: '2026-10-08',
    summary: '診断ページの余分な描き直しを減らす',
    items: Object.freeze([
      '診断ページが、保存のたびに追加で描き直していたため、更新が必要以上に多く走っていました。2秒ごとの定期更新だけで描くようにして、更新の回数を約半分にしました(診断の鮮度は2秒周期のまま)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1601',
    date: '2026-10-08',
    summary: '会場のセリフが出ているか診断に追加',
    items: Object.freeze([
      '会場のホバーカードに、その人の発言(セリフ)が出ない人がいました。会場を開く前に発言した人の発言が、鏡には載っているのにカードまで届いていなかったためです。届くように直し、状態速報に「会場セリフ」の1行を足して、ちゃんと出ているかを数えるようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1600',
    date: '2026-10-08',
    summary: 'メモリが増え続ける漏れを直す',
    items: Object.freeze([
      'コメントの多い配信で、拡張のメモリが時間とともに増え続け、PC全体が重くなることがありました。アイコン画像を作るたびに使い終わったあとも消えない一時データが積み上がっていたためで、積み上がらない形に直しました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1599',
    date: '2026-10-08',
    summary: 'コメントが多い配信でパネルの負荷を下げる',
    items: Object.freeze([
      'コメントが多い配信で、パネルが読み込みの1分後から処理を使い切りやすくなっていました。パネルが毎回コメント全件を一時保存へ丸ごと複製していたためで、再オープンの速さを保てる範囲(増えた分が約15%以上)だけ書き直すようにしました。'
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
