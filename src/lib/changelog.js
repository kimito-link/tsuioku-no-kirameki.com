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
    version: '0.1.2011',
    date: '2026-11-10',
    summary: '公式順位の名前の表を作り直さない',
    items: Object.freeze([
      'YouTube・Kick などで公式の応援順位を表示するとき、名前から人を引く表を記録が同じあいだは使い回すようにしました。コメントが数万件ある配信で、遅いPCの固まりが減ります。'
    ])
  }),
  Object.freeze({
    version: '0.1.2010',
    date: '2026-11-10',
    summary: '人の多い配信で遠い顔は後から読む',
    items: Object.freeze([
      '応援マスが600人以上ある配信では、画面から遠いマスの顔の画像を、近くにスクロールしてから読み込むようにしました。開いた直後に2,000人分の画像を一度に読んで、遅いPCで件数の表示が遅れるのを減らします。会場は今までどおりです。'
    ])
  }),
  Object.freeze({
    version: '0.1.2009',
    date: '2026-11-10',
    summary: '大きな記録で繰り返す計算を減らす',
    items: Object.freeze([
      'コメントが数万件ある記録で、名前マスを少しずつ作る途中の並びの確かめ直しと、裏で動く見比べの計算を減らしました。遅いPCで固まる時間が短くなります。'
    ])
  }),
  Object.freeze({
    version: '0.1.2008',
    date: '2026-11-10',
    summary: '数千人の応援マスを少しずつ足して固まらない',
    items: Object.freeze([
      '応援マスが数百人を超える段は、一度に全部作らず 250人ずつ足すようにしました。開いた直後と読み込みのあとの長い固まりが短くなります。既に出ているマスは消えません。'
    ])
  }),
  Object.freeze({
    version: '0.1.2007',
    date: '2026-11-10',
    summary: '大きな記録で同じ集計をやり直さない',
    items: Object.freeze([
      '数万行の配信で、記録が変わっていないのに描画のたびに全員分を数え直していた所を、前の結果を使うようにしました。ふつうの大きさの配信は今までと同じです。'
    ])
  }),
  Object.freeze({
    version: '0.1.2006',
    date: '2026-11-10',
    summary: '会場の数字が開いた直後の値で止まらない',
    items: Object.freeze([
      'ニコ生で会場モードを開くと、最初の約1分、数字が放送ページを開いた瞬間の値(記録 1 件など)のまま止まっていました。横の欄が動いていないときは、会場が自分で読んだ新しい数字をすぐ出すようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1997',
    date: '2026-11-10',
    summary: '大きな記録で長く固まらない(合間に手を返す)',
    items: Object.freeze([
      '数万行・数千人の配信で、記録の読み出しから描画までを1本で走らせず合間に画面へ手を返します。応援マスは1回の読み直しで最後の1回だけ組み立てます。遅いPC相当の計測で、いちばん長い固まりが約8.9秒から約3.9秒になりました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1996',
    date: '2026-11-10',
    summary: '横の欄を開かなくても会場に数字が出る',
    items: Object.freeze([
      '会場モードの数字(記録・推定同時接続・来場者数・経過など)は、横の欄を開いていないと「—」のままでした。横の欄を一度も開かなくても、会場が視聴ページから自分で数字を出すようにしました(15秒ごとに更新)。',
      '横の欄を開いているあいだは、これまでどおり横の欄と同じ数字を出します。',
      '記録件数が分からないときに「0件」と出ていたのを「—」に直しました。',
      'ニコ生・YouTube・Twitch の会場と、別窓の会場の両方で効きます(0.1.1995 の内容を、他の配信サイト対応の版へ取り込みました)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1987',
    date: '2026-11-10',
    summary: '数千人いる配信で応援マスを二度組み立てない',
    items: Object.freeze([
      'コメントした人が数千人いる配信(Kick など)では、応援マスを1回の描き直しで2回組み立てていました。ギフトと広告の列が変わっていないときは、2回目を省くようにしました。少人数の配信は今までどおりです。'
    ])
  }),
  Object.freeze({
    version: '0.1.1986',
    date: '2026-11-10',
    summary: '大きな配信で描き直しが切れ目なく続くのを止めた',
    items: Object.freeze([
      'コメントが数万件ある配信(Kick など)を遅いPCで開いているとき、横の欄の描き直しが終わるとすぐ次が始まり、休みなく続いていました。1回終わるごとに休みを入れるようにしました。あわせて、同じ人のコメントの名前と顔の確認を1回で済ませるようにしました。'
    ])
  }),
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
