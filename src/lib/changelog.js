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
    version: '0.1.1622',
    date: '2026-10-14',
    summary: '開いた直後から応援レーンが件数順に並ぶ',
    items: Object.freeze([
      'パネルを開いた直後、最初に届く一部の人だけで並びが決まり、あとから来た大勢が後ろに回って件数順にならないことがありました。人数が一気に増えた最初の瞬間だけ、全員を件数の多い順に並べ直します。',
      'そのあとの並べ替えは、これまでどおり1分に1回までです。'
    ])
  }),
  Object.freeze({
    version: '0.1.1621',
    date: '2026-10-14',
    summary: 'りんく段を/live/と同じ定義に(応援した人だけ)',
    items: Object.freeze([
      'りんく段に並ぶのは「ギフトか広告で応援した人」だけになりました(/live/ と同じ)。コメントだけの人は、本物のサムネがあってもこん太段に出ます。',
      '人は段を移るだけで消えません。ギフト・広告の応援者がまだ1人も分かっていない間は、これまでどおりの並びのままです。'
    ])
  }),
  Object.freeze({
    version: '0.1.1620',
    date: '2026-10-14',
    summary: '応援レーンを件数の多い順に(動くのは1分に1回)',
    items: Object.freeze([
      '応援レーンのタイルの並びを、コメントの多い人が先に来る順にしました(段ごと。これまでは ID の文字順で、コメント数と関係ありませんでした)。',
      'コメントのたびに並びが入れ替わらないよう、並べ替えは1分に1回までです。その間に来た新しい人は末尾に足されるだけで、すでに出ている人は動きも消えもしません。',
      '状態速報に「レーン並び」の行を追加(取り直した回数・途中で足した人数)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1619',
    date: '2026-10-08',
    summary: 'ギフト・広告の列が空で消えないように',
    items: Object.freeze([
      'ギフトの列・広告の列は、保存データを読み直す一瞬に空で返ると、その回だけ列ごと消えて(人数が29人→14人のように)減って見えていました。前の回に人がいたのに今回が空のときは、前の人たちを残すようにしました。'
    ])
  }),
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
