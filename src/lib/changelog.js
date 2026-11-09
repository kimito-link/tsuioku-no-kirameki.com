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
    version: '0.1.1953',
    date: '2026-11-09',
    summary: '他サービスで新着が横の欄に出る遅れを減らす',
    items: Object.freeze([
      'YouTube・Kick・SHOWROOM などで、横の欄が裏のタブの配信の記録まで毎回組み立てていたため、見ている配信の新着が数秒遅れていました。見ている配信だけを組み立てるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.1952',
    date: '2026-11-09',
    summary: '他サービスの横の欄の描き直しすぎを直す',
    items: Object.freeze([
      'YouTube・Kick・SHOWROOM などで、コメントの束が届くたびに横の欄が描き直していたのを、ニコ生版と同じ間引きにしました(新しいコメントの表示の速さは変わりません)'
    ])
  }),
  Object.freeze({
    version: '0.1.1951',
    date: '2026-11-09',
    summary: '他サービスの横の欄で前面タブを正しく拾う',
    items: Object.freeze([
      'YouTube・Kick・SHOWROOM などの横の欄で、前面のウィンドウのタブも配信として読めるようにしました(ニコ生版と同じ)。あわせて、横の欄が何度も読み直している原因を調べる計器を足しました'
    ])
  }),
  Object.freeze({
    version: '0.1.1950',
    date: '2026-11-09',
    summary: '別タブの探り読みで横の欄が重くならない',
    items: Object.freeze([
      '横の欄(サイドパネル)が、配信でないページを前面にしているとき、開いている全部の配信タブの記録を読み込みに行く処理(最大27秒かかっていました)を YouTube 系では行わないようにしました。その間に表示の言葉が別のサービスに変わることもなくなります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1949',
    date: '2026-11-09',
    summary: '別サービスへ移ると横の欄をまっさらにする',
    items: Object.freeze([
      '横の欄(サイドパネル)で、YouTube・Twitch・Kick・ふわっち・SHOWROOM・ミクチャ・TikTok のあいだで別の配信のタブへ移ったら、ニコ生版と同じく中身を読み込み直すようにしました。前のサービスの言葉(「Kicks ランキング」など)が残らなくなります。YouTube のトップなど配信でないページでは、いま出している配信を保ちます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1948',
    date: '2026-11-09',
    summary: '横の欄が裏のタブの配信に引っ張られない',
    items: Object.freeze([
      'Kick・SHOWROOM・TikTok などの配信ページが「いま見ている配信」を自分で記録するようにしました(ニコ生版と同じ決まり)。横の欄とコメビュは、これまでの「記録が最近増えた配信」ではなく、最後に前面で見た配信を出します。裏で記録中の YouTube タブに引っ張られて表示が戻ることがなくなります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1947',
    date: '2026-11-09',
    summary: '記録の無い部屋で前の別の配信を出さない',
    items: Object.freeze([
      '横の欄(サイドパネル)で、まだ記録の無いチャンネル(配信前の部屋など)を前面にしたとき、前に見ていた別のサービスの配信を出し続けず、その部屋の「記録 0」を出すようにしました。配信者名は部屋のチャンネル名を出します。'
    ])
  }),
  Object.freeze({
    version: '0.1.1946',
    date: '2026-11-09',
    summary: '横の欄がどの配信を出したかを診断に記録',
    items: Object.freeze([
      '横の欄(サイドパネル)とコメビュが、どのサービスのどの配信を表示に選んだか・その理由を診断に記録するようにしました(Kick や SHOWROOM を見ていても横の欄が YouTube に戻る件の原因を数字で確かめるため。表示の動きはまだ変えていません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1945',
    date: '2026-11-09',
    summary: '拡張の入れ替え時に他サービスのタブも読み込み直す',
    items: Object.freeze([
      '拡張が新しい版に入れ替わったとき、YouTube だけでなく Twitch・Kick・ふわっち・SHOWROOM・ミクチャ・TikTok の配信ページのタブも自動で読み込み直すようにしました(古い版のまま止まり、記録が 0 のままになることがありました)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1944',
    date: '2026-11-09',
    summary: 'TikTok のスタンプだけのコメントも記録する',
    items: Object.freeze([
      'TikTok で、本文がなくスタンプだけのコメントが記録から漏れていたのを直しました。スタンプは「[スタンプ]」として個数ぶん残します(本文つきのときは本文の後ろに並べます)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1943',
    date: '2026-11-09',
    summary: 'ミクチャ・SHOWROOM の状態の記録を別タブで上書きしない',
    items: Object.freeze([
      'ミクチャと SHOWROOM でも、状態の記録が配信の終わった別のタブの値で上書きされないようにしました(TikTok と同じ守り)。記録そのものには影響ありません。'
    ])
  }),
  Object.freeze({
    version: '0.1.1942',
    date: '2026-11-09',
    summary: 'TikTok で漏れたコメントの理由を計器に残す',
    items: Object.freeze([
      'TikTok で画面には出たのに記録されなかったコメントがあったとき、その理由(送り主が読めない・本文が空・番号が無いなど)を状態の記録に数えて残すようにしました。記録の仕方そのものは変わりません。'
    ])
  }),
  Object.freeze({
    version: '0.1.1941',
    date: '2026-11-09',
    summary: '終わった配信のページで毎秒読みに行かない',
    items: Object.freeze([
      'TikTok・ミクチャ・SHOWROOM で、配信が終わったページや読み取りに失敗し続けるページを開いたままにすると、配信の情報を1秒おきに読みに行っていたのを直しました(配信していないときは1分おき・失敗したときは間を広げて最大5分おき)。',
      'TikTok の状態の記録が、配信の終わった別のタブの値で上書きされないようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1940',
    date: '2026-11-09',
    summary: 'TikTok LIVE の配信を記録する(試作)',
    items: Object.freeze([
      'TikTok LIVE の配信のページ(tiktok.com/@名前/live)を開くと、コメントとギフトを記録するようにしました。ニコ生・YouTube・Twitch・Kick・ふわっち・SHOWROOM・ミクチャと同じ画面で見られます。',
      'TikTok はログインしていないとコメントが届きません。ログインしていないときは、配信のページの右下に理由を出します。',
      'ギフトは TikTok のコインの数で数えます。連打のギフトは連打が終わったときに1回だけ数えます。',
      'TikTok のページを読む許可が増えました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1939',
    date: '2026-11-08',
    summary: 'ミクチャのギフトに絵を出す',
    items: Object.freeze([
      'ミクチャのギフトを、ミクチャで見えているのと同じ絵つきで記録するようにしました(投げ一覧・コメビュ・会場に出ます)。',
      '絵の置き場(ミクチャの画像サーバー)を読む許可が増えました。絵が取れないときは今までどおり絵なしで記録します。'
    ])
  }),
  Object.freeze({
    version: '0.1.1938',
    date: '2026-11-08',
    summary: 'コメビュでギフトが2行に見えるのを直す',
    items: Object.freeze([
      'ミクチャ・SHOWROOM・ふわっちのギフトが、コメビュで「ギフト」だけの行とギフトのカードの2行に見えていたのを、カードだけにしました。言葉が添えてあるギフトは今までどおり行も出します。'
    ])
  }),
  Object.freeze({
    version: '0.1.1937',
    date: '2026-11-08',
    summary: 'ミクチャの順位の単位と見出しを直す',
    items: Object.freeze([
      'ミクチャ・SHOWROOM の公式ランキングの数を「6,430 ギフト」ではなく「6,430 pt」と出すようにしました(コメビュのギフトの pt とそろえました)。',
      'ミクチャのランキングの見出しを「累計」から「今月」に直しました(ミクチャ公式の今月のファンランキングです)。',
      'ミクチャを未ログインで開いていると約5分でログイン画面に飛ばされ記録が止まります。止まった理由を診断に残すようにしました。',
      'ミクチャのギフトの値段を、先に取れる方の口から読むようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1936',
    date: '2026-11-08',
    summary: 'ミクチャの配信を記録(試作)',
    items: Object.freeze([
      'ミクチャの配信のページ(mixch.tv/u/番号/live)を開くと、コメントとギフトを記録するようにしました。ニコ生・YouTube・Twitch・Kick・ふわっち・SHOWROOM と同じ画面で見られます。',
      'ギフトはコイン(値段 × 個数)と絵つきで記録します。アイテムの名前はまだ取れないので「ギフト」と出します。',
      'ミクチャ公式の今月のファンランキングをギフト貢献度の欄に出します。',
      'SHOWROOM のページで、ふわっち用の読み取りが一緒に動いていたのを止めました。',
      '未ログインのときは送信の前に止めます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1935',
    date: '2026-11-08',
    summary: 'ふわっち・SHOWROOM の終わり際を直す',
    items: Object.freeze([
      'ふわっちの配信が終わったとき、終わる直前のコメントを取りこぼさないよう、もう一度読み直してから止めるようにしました。',
      'SHOWROOM の配信が終わったことに、これまでより早く(最大30秒→数秒)気づくようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1934',
    date: '2026-11-08',
    summary: 'ふわっちの匿名・運営・配信名を直す',
    items: Object.freeze([
      'ふわっちの匿名の人(たぬき)を、名前ごとに別の人として数えるようにしました。これまでは何十人もが1人にまとめられていました。',
      '「ふわっち運営＠催しの名前」のような運営のお知らせを、応援した人として数えないようにしました。',
      'コメビュの見出しなどに出ていた「ww.番号.番号」を、配信の題(無ければ配信者の名前)で出すようにしました。Twitch・Kick・SHOWROOM も同じです。',
      'ふわっちの匿名の人の ID 欄は空欄でなく「匿名」と出します。'
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
