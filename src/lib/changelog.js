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
    version: '0.1.1556',
    date: '2026-10-01',
    summary: '/live/ に Kick の配信一覧(別欄)を準備',
    items: Object.freeze([
      'ライブビュー(/live/)に、Kick で配信中の日本語配信を同時視聴数の多い順に並べる欄を用意しました。値は Kick の公式 API が返したものをそのまま表示し、ニコ生の一覧とは混ぜません。Kick 側の準備が整い次第、表示が始まります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1555',
    date: '2026-09-30',
    summary: '脈拍レーンが開いた直後から動くように修正',
    items: Object.freeze([
      'ライブビュー(/live/)の脈拍レーンが、実測データが2回届くまで(数分〜十数分)動かなかった不具合を修正しました。配信開始からの平均速度で開いた直後から動くようにしています。'
    ])
  }),
  Object.freeze({
    version: '0.1.1554',
    date: '2026-09-30',
    summary: '脈拍レーン: いま話している人を強調',
    items: Object.freeze([
      'ライブビュー(/live/)の脈拍レーンで、直近でコメントが増えた人を大きく・繰り返し表示するようにしました。件数のみで、コメント本文は表示していません。'
    ])
  }),
  Object.freeze({
    version: '0.1.1553',
    date: '2026-09-30',
    summary: '/live/ 脈拍レーンに応援者の名前とサムネ',
    items: Object.freeze([
      'ライブビュー(/live/)の脈拍レーンに、丸いサムネと名前つきのチップを流し「誰が応援したか」が見えるようにしました。コメント本文は表示していません。'
    ])
  }),
  Object.freeze({
    version: '0.1.1552',
    date: '2026-09-30',
    summary: '/live/ コメント速度の脈拍レーンを追加',
    items: Object.freeze([
      'ライブビュー(/live/)の番組合計コメント数を実測値の間でなめらかに表示し、実測2点から求めた速度と脈拍レーンを添えました。個人別の値やコメント本文は動かしていません。'
    ])
  }),
  Object.freeze({
    version: '0.1.1551',
    date: '2026-09-28',
    summary: '/live/ 発言カードの先読みを配信ホバーに拡大',
    items: Object.freeze([
      'ライブビュー(/live/)の配信カードに少し滞在すると、直近発言カードの取得を先に始めるようにしました。取得中の応答も自動再試行し、名前へ移ったときにすぐ表示しやすくなります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1550',
    date: '2026-09-28',
    summary: '/live/ 応援者を4段のアイコン列で表示',
    items: Object.freeze([
      'ライブビュー(/live/)の応援者を、りんく・こん太・ギフト・たぬ姉の4段に分けて表示するようにしました。ギフトの増分や匿名人数も段ごとに確認できます。'
    ])
  }),
  Object.freeze({
    version: '0.1.1549',
    date: '2026-09-27',
    summary: '/live/ ギフト増分を+ptで表示',
    items: Object.freeze([
      'ライブビュー(/live/)のギフト順位表で、前回取得から増えたポイントを「+Npt」として表示するようにしました。増分が大きい人ほど帯の色が濃くなります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1548',
    date: '2026-09-26',
    summary: '配信詳細モーダルを一旦取り下げ',
    items: Object.freeze([
      '前バージョンで追加した「詳しく見る」ボタンと詳細モーダルは、内容が一覧の拡大表示に留まり体験として不十分だったため、いったん取り下げました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1546',
    date: '2026-09-26',
    summary: 'ライブビューの最初の表示を高速化',
    items: Object.freeze([
      'ライブビュー(/live/)を開いた瞬間、まず手元にある最新の集計をすぐに表示し、その裏で新しい集計に更新するようにしました。「読み込み中…」で待たされる時間が短くなります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1545',
    date: '2026-09-26',
    summary: 'ライブビューの応援した人の取りこぼしを修正',
    items: Object.freeze([
      'ライブビュー(/live/)で、ギフトや広告で応援してくれた人のうち、アイコンが未設定というだけで一覧から漏れていた不具合を修正しました。ゆっくり顔つきで「ハンドルネームで応援した人」の枠に表示されるようになります。',
      '収集の更新間隔の表示しきい値を、実際の間隔のばらつきに合わせて調整しました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1544',
    date: '2026-09-26',
    summary: '多タブ視聴で描画が長時間止まる不具合を修正',
    items: Object.freeze([
      '同じ配信を複数タブで同時に見ているとき、まれに画面の描画が数分間止まって見えることがある不具合を修正しました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1542',
    date: '2026-09-24',
    summary: 'イベント未参加時の誤表示・文字化けタイトルを根治',
    items: Object.freeze([
      'イベントに参加していない配信で、順位やスコアが誤って表示されたり、文字化けしたイベント名が出ることがある不具合を修正しました。公式のイベント参加が確認できる時だけ表示するようにしています。'
    ])
  }),
  Object.freeze({
    version: '0.1.1541',
    date: '2026-09-23',
    summary: 'マーケ分析に横断応援者ランキングを追加',
    items: Object.freeze([
      'マーケ分析(HTMLレポート)に、過去の配信もまたいで応援してくれている人が分かる「横断応援者ランキング」を追加しました。公開や他PCとの集約はせず、このPC内の記録だけで完結します。'
    ])
  }),
  Object.freeze({
    version: '0.1.1540',
    date: '2026-09-22',
    summary: '内部整理(表示や動作は変わりません)',
    items: Object.freeze([
      '出荷手順の異常検知を強化しました(配布物には影響ありません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1539',
    date: '2026-09-22',
    summary: '内部整理(表示や動作は変わりません)',
    items: Object.freeze([
      '開発時の出荷手順のコード説明を強化しました(配布物には影響ありません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1538',
    date: '2026-09-21',
    summary: '内部整理(表示や動作は変わりません)',
    items: Object.freeze([
      '開発時の出荷手順を見直しました(配布物には影響ありません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1537',
    date: '2026-09-21',
    summary: '即時コメント表示の重さ・停止を軽減',
    items: Object.freeze([
      'コメントが届くたびに応援レーンを即座に描き直していた処理を、短時間に複数届いても1回にまとめて描くよう変更しました。表示が固まる・重くなる場面を減らしています。'
    ])
  }),
  Object.freeze({
    version: '0.1.1536',
    date: '2026-09-21',
    summary: '応援レーンのタイル競合(18→1)の残る原因を解消',
    items: Object.freeze([
      '応援レーンで、鏡(別画面用のスナップショット)で描いた席が直後に1枚へ減ることがある競合の残る原因を解消しました。鏡経路も「描いた配信」を記録して縮小ガードが正しく効くようにしています。'
    ])
  }),
  Object.freeze({
    version: '0.1.1535',
    date: '2026-09-21',
    summary: '終了配信の経過時間が伸び続ける不具合を修正',
    items: Object.freeze([
      '配信が終わっても「配信時間」が伸び続けて何十時間にもなる不具合を修正しました。終了を検知した時点の経過時間で止まります。'
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
