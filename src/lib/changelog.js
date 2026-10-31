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
    version: '0.1.1843',
    date: '2026-10-31',
    summary: '過去コメントの埋め直しの読み違いを直す',
    items: Object.freeze([
      '途中から開いた配信で過去のコメントを埋める仕組みが、ニコ生の応答から「次に読む位置」を取り違えることがありました。正しい位置をたどるようにしたので、埋め直しが途中で止まりにくくなります'
    ])
  }),
  Object.freeze({
    version: '0.1.1842',
    date: '2026-10-31',
    summary: '止まった取り込みの立て直しを直す',
    items: Object.freeze([
      'コメントの取り込みが止まったときに自動で立て直す仕組みが、ニコ生の応答を読み違えて空振りしていました。スマホ版で確かめた読み方に揃え、次の位置を正しくたどれるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.1841',
    date: '2026-10-31',
    summary: 'VOICEVOX再起動後も準備中と正しく出す',
    items: Object.freeze([
      '読み上げを ON にするたびに、声の「初めて」と速さを数え直すようにしました。VOICEVOX を途中で再起動したり GPU に切り替えたりした後も、起動直後の遅れに「準備中」の案内が出て、古い速さで遅い PC と決めつけません'
    ])
  }),
  Object.freeze({
    version: '0.1.1840',
    date: '2026-10-31',
    summary: '読み上げの遅れの理由を画面で分かるように',
    items: Object.freeze([
      '読み上げが遅れたときの案内に、VOICEVOX を起動した直後は初めて使う声の準備で遅れること・続けて読むうちに速くなることを書くようにしました。準備が済んでも遅いときだけ GPU の案内を出します'
    ])
  }),
  Object.freeze({
    version: '0.1.1839',
    date: '2026-10-31',
    summary: 'イベント欄の拡張のエラーも止める',
    items: Object.freeze([
      'イベントに参加している配信で、順位の欄にあるりんくの絵の書き方が安全設定に止められ、拡張機能の管理画面にエラーが積もっていました。ギフト一覧と同じ直し方で、エラーが出ないようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1838',
    date: '2026-10-31',
    summary: 'ギフト一覧で出ていた拡張のエラーを止める',
    items: Object.freeze([
      'ギフトの投げ一覧を描くたびに、拡張機能の管理画面へ「Content Security Policy」のエラーが積もっていました。アイコンが読めないときの差し替えを安全設定に沿った書き方に直し、エラーが出ないようにしました。読めないアイコンは公式の既定アイコンになります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1837',
    date: '2026-10-31',
    summary: 'コメントを流す間は画面を消さない',
    items: Object.freeze([
      'iPhone アプリの「💬 コメントを流す」を押している間は、スマホの画面が自動で消えないようにしました。画面が消えるとアプリが止まり、コメントも読み上げも止まってしまうためです。止めると元に戻ります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1836',
    date: '2026-10-31',
    summary: 'つなぎ直しで同じコメントが二重に出ないように',
    items: Object.freeze([
      'iPhone アプリの「💬 コメントを流す」で、通信が切れて自動でつなぎ直したとき、直前のコメントがもう一度並ぶことがありました。一度並べたコメントとギフトは二度並べないようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1835',
    date: '2026-10-31',
    summary: 'アプリのコメントに顔アイコンを出す',
    items: Object.freeze([
      'iPhone アプリの「💬 コメントを流す」で、コメントの横にその人のアイコンを出すようにしました。アイコン未設定の人と匿名の人は、その人ごとのゆっくり顔になります。名前を押すとニコニコのユーザーページが開きます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1834',
    date: '2026-10-31',
    summary: 'アプリでコメントの接続が止められていたのを直す',
    items: Object.freeze([
      'iPhone アプリの「💬 コメントを流す」で、ページの安全設定がニコニコへの接続(WebSocket)まで止めてしまい、つながらない状態でした。ニコニコの接続先だけを許可して、受け取れるようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1833',
    date: '2026-10-29',
    summary: '読み上げの音質を選べるように',
    items: Object.freeze([
      '設定に「読み上げの音質」を足しました。標準(今までどおり)と高音質から選べます。高音質は声が少しくっきりしますが、作るのに時間がかかるので、グラボのある速いPC向けです。',
      '既定は標準のままです。変えると、会場・コメビュ・スマホへ送る声のどれも次の声から切り替わります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1832',
    date: '2026-10-29',
    summary: '席が無い人の吹き出しを診断の上に出し名前も',
    items: Object.freeze([
      '会場で、席が無い人の吹き出しがほとんど「①の診断」の行の上に重なって出ていたのを直しました。診断の行が見えているときは、その上に出します。',
      '席が無い人や一覧の外にいる人の吹き出しの名前が「コメント」とだけ出ていたのを、席と同じ「匿名NNN」(名前がある人は名前)で出すようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1831',
    date: '2026-10-28',
    summary: '視聴ページの確認用ログを毎回出さない',
    items: Object.freeze([
      'パネルの描画のたびに、確認用の大きな記録（約5KB）を視聴ページのコンソールへ自動で出し続けていました。必要なときだけ手で呼べるようにして、自動では出さないようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1830',
    date: '2026-10-28',
    summary: 'パネルを開くときの作り直しを1回に',
    items: Object.freeze([
      '視聴ページでパネルを開くたび、パネルの入れ物を4回作り直していました（作りたてを古いものと見なして捨てていた）。1回だけ作るようにしたので、開く瞬間の無駄な隠す・出すが減ります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1829',
    date: '2026-10-29',
    summary: 'コメビュの読み上げを少し早く',
    items: Object.freeze([
      'コメビュで読み上げを ON にしている間は、放送タブから新しいコメントを直接受け取って読むようにしました。これまでは保存のまとめ書き(最大1.5秒)を待ってから読んでいました。',
      '同じコメントを二度読むことはありません。表示は今までどおりです。コメビュの画面が隠れているときも、読み上げは遅れずに続きます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1828',
    date: '2026-10-29',
    summary: '席が無い人の吹き出しも会場の中に出す',
    items: Object.freeze([
      '会場で、席が無い人(会場が満席・会場に居ない人)の吹き出しが、「①の診断」の行に被ったり、PICK UP 枠より下(会場の外)に出たりしていたのを直しました。一覧の見えている下の端に、名前を付けて出します(指す席が無いので矢印と尻尾は付けません)。',
      '吹き出しが避ける物に「①の診断」の行も加えました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1827',
    date: '2026-10-29',
    summary: 'アプリのコメント欄にギフトも出す',
    items: Object.freeze([
      'iPhone アプリの「💬 コメントを流す」に、ギフトも「🎁 名前 さんが アイテム(ポイント)」として色付きで並ぶようにしました。読み上げはこれまでどおりコメントだけです。'
    ])
  }),
  Object.freeze({
    version: '0.1.1826',
    date: '2026-10-29',
    summary: 'アプリのコメントを自動でつなぎ直す',
    items: Object.freeze([
      'iPhone アプリの「💬 コメントを流す」は、通信が切れても自動でつなぎ直すようにしました(3秒・10秒・30秒・60秒あけて最大4回)。長い配信の途中で電波が途切れても、押し直さずに続きを受け取れます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1825',
    date: '2026-10-28',
    summary: '横付きパネルが右へはみ出さないように',
    items: Object.freeze([
      '狭めの窓で横付きパネルを挟むと公式コメント欄が画面の外へ押し出され横スクロールが出ていたのを直しました。置いた後に実際の位置を測り、縮めて収まるなら幅を詰め、収まらなければ動画の下へ出します。'
    ])
  }),
  Object.freeze({
    version: '0.1.1824',
    date: '2026-10-28',
    summary: 'アプリだけでコメントを流す',
    items: Object.freeze([
      'iPhone アプリで放送の URL を貼った画面に「💬 コメントを流す」を足しました。PC も配信者の協力も無しに、アプリがニコニコから直接その配信のコメントを受け取って並べ、🗣 で iPhone の声で読み上げます(数秒遅れ)。',
      '受け取ったコメントは iPhone の中だけで使い、当サイトのサーバーへは送りません。ブラウザでは出ません(ニコニコがブラウザからの読み取りを許していないため)。'
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
