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
    version: '0.1.1985',
    date: '2026-11-10',
    summary: '重い描き直しのあとは間隔を空ける',
    items: Object.freeze([
      'コメントがとても多い配信で、重い描き直しが終わった直後に次の描き直しが始まらないようにしました(かかった時間の3倍は空けます)。普通の配信の速さは変わりません。'
    ])
  }),
  Object.freeze({
    version: '0.1.1984',
    date: '2026-11-10',
    summary: '人の多い配信で描き直しが続くのを直す',
    items: Object.freeze([
      '5,000人を超える人がコメントした配信を開くと、何も変わっていないのに描き直しが続いて横の欄が重くなる問題を直しました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1983',
    date: '2026-11-10',
    summary: '生放送中の大きな記録を軽くする',
    items: Object.freeze([
      'コメントがとても多い配信を生放送中に開いているとき、3秒ごとの見回りが新着だけを扱うようにして、横の欄が固まる時間を減らしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1982',
    date: '2026-11-10',
    summary: '大きな記録で診断の数え直しを減らす',
    items: Object.freeze([
      'コメントがとても多い記録を開いているとき、診断用の数え上げを1分に1回にして、横の欄が固まる時間を減らしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1981',
    date: '2026-11-10',
    summary: '大きな記録で横の欄が固まりにくく',
    items: Object.freeze([
      'コメントが数万件ある配信(Kick など)で、横の欄が3秒ごとに全部をやり直して固まっていたのを軽くしました。何も変わっていないときは前の結果を使い、重いときは見回りの間隔を空けます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1980',
    date: '2026-11-10',
    summary: '吹き出しを待たせた数の計器を直す',
    items: Object.freeze([
      '会場の吹き出しを声に合わせて待たせた件のうち、待っている間に読み上げから外れた件も数えるようにしました(計器だけ・見た目は同じ)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1979',
    date: '2026-11-10',
    summary: '吹き出しを読み上げの声と一緒に出す',
    items: Object.freeze([
      '会場の吹き出しを、読み上げの声が鳴り始める時に出すようにしました。3秒待っても声が始まらないコメントは、読まずにすぐ吹き出しだけ出します。読み上げを使っていないときは今までどおりすぐ出ます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1978',
    date: '2026-11-10',
    summary: '大きな記録でも開いてすぐ記録の件数を出す',
    items: Object.freeze([
      'YouTube・Kick などで横の欄を開いたとき、全件を読み終わる前に「記録 N 件」を先に出すようにしました(ニコ生と同じ出し方)。8万行の配信では、数字が出るまで遅いPCで2分以上かかっていました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1977',
    date: '2026-11-10',
    summary: '大きな記録を少しずつ読み、開いた直後も固まらない',
    items: Object.freeze([
      'YouTube・Kick などの記録を開くとき、5,000行ずつ読んで合間に画面へ手を返すようにしました(8万行を一度に読むと、遅いPCでは約48秒返事がありませんでした)。読む行と順番は同じです。'
    ])
  }),
  Object.freeze({
    version: '0.1.1976',
    date: '2026-11-10',
    summary: '人の多い配信で名前と顔の控えを書く回数を減らす',
    items: Object.freeze([
      '名前と顔の控えが2,000人を超えたら、横の欄から控え全体を書くのを30秒に1回にしました(8万行の配信で110秒に3.6MB書いていた)。横の欄の中ではこれまでどおりすぐ使います。'
    ])
  }),
  Object.freeze({
    version: '0.1.1975',
    date: '2026-11-10',
    summary: '人がとても多い配信は応援レーンを2,000人までに',
    items: Object.freeze([
      '応援レーンの候補が2,000人を超える配信(Kick の大きな配信など)だけ、段の順(りんく→こん太→たぬ姉)・コメントの多い順に2,000人まで顔を並べ、残りはレーン下の「ほか M人」に人数で出します。約6,500人の記録で横の欄が開いた直後から固まっていた件の手当て(りんく決定 2026-11-10)。普段の配信は今までどおり全員です。'
    ])
  }),
  Object.freeze({
    version: '0.1.1974',
    date: '2026-11-10',
    summary: 'YouTube系でコメントの控えの全件書き込みをやめる',
    items: Object.freeze([
      'Kick など YouTube 系の横の欄が、記録のコメント全部(1万2千行で約5.5MB)を90秒に39回書き直していた件。YouTube 系のコメントの正本は記録係の保存(IndexedDB)で、この控えは誰も読まないので書かないようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1973',
    date: '2026-11-10',
    summary: '人が多い配信は応援レーンの写しの書き込みを間引く',
    items: Object.freeze([
      '記録が数万行ある配信(Kick など)で、横の欄が開いた直後から長く固まる件の手当て。新しい人が来るたびに応援レーンの写し(数百KB)を書き直し、それが拡張の全画面へ配られていた。人数が500人を超えたら、写しを書く間隔を人数に応じて延ばします(最長30秒・最後の状態は必ず書きます・配信が替わったときは待ちません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1972',
    date: '2026-11-10',
    summary: '裏方が古いままなら自分で入れ替わる',
    items: Object.freeze([
      '新しい版にしたのに裏で動く記録係が前の版のまま動いていたら、それに気づいて自分で読み込み直すようにしました(繰り返さないよう30分に1回まで・ストア版では何もしません)'
    ])
  }),
  Object.freeze({
    version: '0.1.1971',
    date: '2026-11-10',
    summary: '裏方の更新が古いまま残る件を直す',
    items: Object.freeze([
      '拡張を新しい版に入れ替えても、裏で動く記録係(YouTube・Twitch・Kick などの分)が古い中身のまま動き続けることがありました。版ごとに裏方の本体も必ず入れ替わるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.1970',
    date: '2026-11-10',
    summary: '声の割り当ての間引きを作り直し後も保つ',
    items: Object.freeze([
      'YouTube・Twitch・Kick などで、裏の記録係が作り直された直後でも、人ごとの声の割り当てをすぐ書き直さないようにしました(30秒に1回の間引きが混んだ配信で効いていなかった件の手当てと、原因を確かめる計器)。声の割り当ては変わりません'
    ])
  }),
  Object.freeze({
    version: '0.1.1969',
    date: '2026-11-10',
    summary: '記録の多い配信は全件の読み直しを間引く',
    items: Object.freeze([
      'YouTube・Twitch・Kick などで、横の欄や会場が記録を全件読み直すのを、行数に関係なく30秒ごとにしていたのを、行数に応じて30秒〜5分ごとにしました(5,000行までは今までどおり)。新しいコメントはこれまでどおりすぐ届きます'
    ])
  }),
  Object.freeze({
    version: '0.1.1968',
    date: '2026-11-10',
    summary: '声の割り当ての書き直しを30秒に1回へ',
    items: Object.freeze([
      'YouTube・Twitch・Kick などで、人ごとの声の割り当て(数百KB)をコメントの束ごとに丸ごと書き直していたのを、変わったときだけ・最短30秒に1回にしました。人の多い配信で横の欄やコメビュが長く固まるのを和らげます。声の割り当ては変わりません'
    ])
  }),
  Object.freeze({
    version: '0.1.1967',
    date: '2026-11-09',
    summary: '応援レーンの塗り直しで動かす枚数を最小に',
    items: Object.freeze([
      '応援レーン(アイコンの列)を塗り直すたびに、全員のアイコンをいったん外して付け直していたのを、順番が変わった人・増えた人・減った人だけ動かすようにしました。人数の多い配信で横の欄が重くなるのを和らげます。表示は変わりません'
    ])
  }),
  Object.freeze({
    version: '0.1.1966',
    date: '2026-11-09',
    summary: '横の欄を開いた直後の読み込みを同時に',
    items: Object.freeze([
      'YouTube・Twitch・Kick などで横の欄が記録を組み立てるとき、記録と顔の控え3つを1つずつ順番に読んでいたのを、同時に読み始めるようにしました。開いた直後の最初の表示がどこで待っているかを測る計器も足しました。表示は変わりません'
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
