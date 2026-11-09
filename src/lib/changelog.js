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
    version: '0.1.1959',
    date: '2026-11-09',
    summary: '同じ公式ランキングは書き直さない',
    items: Object.freeze([
      'TikTok・SHOWROOM などは、順位が変わっていなくても決まった間隔で同じ公式ランキングを送ってきます。そのたびに保存し直し、横の欄がすぐ描き直して、その配信の全コメントを組み立て直していました。順位・名前・数・顔・期間が前回と同じなら保存しないようにしました。表示は変わりません'
    ])
  }),
  Object.freeze({
    version: '0.1.1958',
    date: '2026-11-09',
    summary: '切り替わる直前の横の欄が次の配信を描かない',
    items: Object.freeze([
      '前面の配信を別のサービス(例: Kick から TikTok)に変えた瞬間、まもなく作り直される前の横の欄が、新しい配信のコメントを先に聞きに来て全行を組み立てることがありました(行の多い配信ではその分重くなります)。この食い違いのときは最大3秒だけ返事を待ち、作り直された新しい欄が描くようにしました。作り直されなかったときは3秒後にいつもどおり描きます'
    ])
  }),
  Object.freeze({
    version: '0.1.1957',
    date: '2026-11-09',
    summary: '描き直しが重いときは間隔を広げる',
    items: Object.freeze([
      'コメントが数千行ある配信や遅い PC では、横の欄の描き直し1回に時間がかかり、描き直しが休みなく続いて固まりがちでした。描き直しが重いときだけ、次の描き直しまでの間隔をその時間の3倍(最大1.5秒)まで広げます。軽いときは今までどおりです'
    ])
  }),
  Object.freeze({
    version: '0.1.1956',
    date: '2026-11-09',
    summary: '行が多いときの横の欄の描き直しを軽くする',
    items: Object.freeze([
      'コメントが数千行ある配信で、横の欄が描き直すたびに全員の顔画像を選び直し、行を並べ直していました。同じ人・同じ条件の顔は前の答えを使い、既に並んでいる行は並べ直さないようにしました。表示される顔と順番は変わりません'
    ])
  }),
  Object.freeze({
    version: '0.1.1955',
    date: '2026-11-09',
    summary: '行が多い配信で横の欄が遅くなるのを減らす',
    items: Object.freeze([
      'Kick などで記録が数千行になると、横の欄がコメントのたびに全部の行を読み直して組み立てていたため、新着が数秒遅れていました。あいだは新しい行だけを読み、続けて届いた知らせは1回にまとめるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.1954',
    date: '2026-11-09',
    summary: 'PC の声が止められたらクリックを案内する',
    items: Object.freeze([
      'ページを読み込み直したあと一度もクリックしていないと、Chrome は PC の声を鳴らしません。そのときは読み上げが無音のままでしたが、「この配信ページを1回クリックしてください」と会場に出すようにしました。クリックすると、すぐ PC の声で読み始めます'
    ])
  }),
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
