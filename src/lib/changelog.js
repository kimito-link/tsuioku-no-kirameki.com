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
    version: '0.1.2142',
    date: '2026-11-17',
    summary: '各サービスの記録を章に出す',
    items: Object.freeze([
      '分析レポートに、その配信の記録にあるギフトの名前、サブスクの段階、連続視聴、リワード、ファン登録、ページの順位を、数があるときだけ出すようにしました。',
      '記録に無いフォローやレイドは足していません。ニコ生の分析レポートの見た目は変えていません。'
    ])
  }),
  Object.freeze({
    version: '0.1.2141',
    date: '2026-11-17',
    summary: '分析を各配信サービス向けにした',
    items: Object.freeze([
      'ニコ生以外の分析レポートでは、そのサービスに無い数（広告・来場・184）を出さないようにしました。同時に見ている人数は、そのサービスの呼び方で出します。',
      'レイド・加入のようなシステムの行を、コメントの件数に数えないようにしました。',
      'ミクチャのファン登録を記録するようにしました。円に換算した合計は「推定」と書きます。'
    ])
  }),
  Object.freeze({
    version: '0.1.2140',
    date: '2026-11-17',
    summary: '分析レポートの見た目は今までどおり',
    items: Object.freeze([
      'ニコ生の分析レポートの見た目は、この更新では変えていません。'
    ])
  }),
  Object.freeze({
    version: '0.1.2139',
    date: '2026-11-16',
    summary: '読み足した過去コメントを吹き出しに出さない',
    items: Object.freeze([
      'Kick・Twitch などで配信の最初からさかのぼって読み足した過去コメントが、会場の吹き出し(と読み上げ)に「いま来たコメント」として出ていたのを直しました。読み足した分は記録にだけ入れ、吹き出し・読み上げには新しく来たコメントだけを出します。'
    ])
  }),
  Object.freeze({
    version: '0.1.2138',
    date: '2026-11-16',
    summary: 'Kick・ABEMA・Twitch等で開始からの過去コメントも記録',
    items: Object.freeze([
      'Kick・ABEMA・Twitch(配信中の公開アーカイブがあるとき)で、配信を途中から開いても配信開始からのコメントをさかのぼって記録に読み足すようにしました。',
      'ふわっち・SHOWROOM・ミクチャでも、開いた直後に取れる上限まで過去分を読み足します。読み足した過去分は読み上げと PICK UP には流しません。'
    ])
  }),
  Object.freeze({
    version: '0.1.2137',
    date: '2026-11-16',
    summary: 'ツイキャスで開く前のコメントをさかのぼって記録',
    items: Object.freeze([
      'ツイキャスで配信を途中から開いても、それまでのコメントをツイキャスのコメント一覧からさかのぼって記録に入れるようにしました(1ページずつ間をあけて読むので、千件ほどで1分ほどかかります)。ツイキャスがログインなしで見せているのは直近の約1000件までで、コメントがとても多い配信では直近の約20件しか見せていないことがあります。そのぶんは取れません。'
    ])
  }),
  Object.freeze({
    version: '0.1.2136',
    date: '2026-11-16',
    summary: '使わない権限を拡張から外した',
    items: Object.freeze([
      '準備していた「ローカル補助アプリ」との連携をやめ、そのための追加の権限(nativeMessaging)を拡張から外しました。本物の VOICEVOX で試したところ、補助アプリを使っても読み上げは速くならなかったためです。読み上げの動きは今までどおりです。'
    ])
  }),
  Object.freeze({
    version: '0.1.2135',
    date: '2026-11-16',
    summary: 'ツイキャスで開く前のコメントも記録',
    items: Object.freeze([
      'ツイキャスで、追憶を開く前に書かれたコメントが記録に入らず、開いた後に届いた分しか溜まっていませんでした(18件の配信を途中で開くと3件だけ)。開いたときに、ページ自身と同じ方法で直前のコメント(ツイキャスが出している直近の約20件)を読み足すようにしました。',
      'つながりが一度切れてつなぎ直したときも、切れていた間のコメントを読み足します。同じコメントが二重に入ることはありません。',
      '拡張が新しい版に入れ替わったあと、前から開いていたツイキャスのタブで「Extension context invalidated」のエラーが出ていたのを、古い読み取りが黙って止まるようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.2134',
    date: '2026-11-16',
    summary: '混んだ配信でも指定の声で読みやすく',
    items: Object.freeze([
      'コメントが多いとき、VOICEVOX の声づくりを1件ずつではなく、PC の余裕に合わせて少しずつ並べて進めるようにしました。人ごとの声のまま読める件数が増えやすくなります。',
      '大事なコメント(配信者・初コメント・モデレーター・ギフトなど)は、声ができた順より優先して読みます。'
    ])
  }),
  Object.freeze({
    version: '0.1.2133',
    date: '2026-11-16',
    summary: 'Twitch などで数え始めた時刻を出す',
    items: Object.freeze([
      'Twitch・Kick・YouTube では、拡張を開く前に来たサブスク・ギフト・Bits・スパチャをさかのぼって数えられません(過去の分を出す口が公開されていないため)。横の欄と会場の数字の並びに「数え始め 13:02〜」のように、どの時刻から後の分かを出すようにしました。これより後に来た分は全部数えています。'
    ])
  }),
  Object.freeze({
    version: '0.1.2132',
    date: '2026-11-16',
    summary: 'ニコ生以外で横の欄がさらに軽くなる',
    items: Object.freeze([
      'ニコ生以外の配信で、コメントが流れるあいだ横の欄が同じ中身を何度も書き直していた所(数字の帯の表示切り替え・ランキングの欄の出し入れ・ルーム一覧の作り直しなど)を、中身が変わったときだけ書くようにしました。見た目は変わらず、低スペックの PC でも軽くなります。'
    ])
  }),
  Object.freeze({
    version: '0.1.2130',
    date: '2026-11-16',
    summary: '混んだ配信でも読み上げが止まらない',
    items: Object.freeze([
      '読み上げが ON なら、会場を閉じていても新しいコメントを読み続けるようにしました。画面を開き直したり ON/OFF したりする必要はありません。',
      'コメントが届いているのに声が長く止まったときは、詰まった処理を自動で片付け、PC の軽い声へ切り替えて大事なコメントを読み続けます。落ち着けば人ごとの VOICEVOX の声へ戻ります。'
    ])
  }),
  Object.freeze({
    version: '0.1.2129',
    date: '2026-11-16',
    summary: 'ニコ生以外でコメントのたびの書き直しを減らした',
    items: Object.freeze([
      'Kick・YouTube などニコ生以外の配信で、コメントが1つ来るたびに応援マスの全員分の説明文を書き直し、それを各サービスの言葉に直す処理と取り合っていたのを止めました。Kick の実機でコメントが流れている間、5秒で約2万回あった画面の書き換えが大きく減ります。見た目は変わりません。'
    ])
  }),
  Object.freeze({
    version: '0.1.2128',
    date: '2026-11-16',
    summary: '大きな記録でコメントの流れ欄を軽くした',
    items: Object.freeze([
      '記録が多い配信で、コメントの流れ欄に出す1件を選ぶたびに全部の記録を重いやり方で見比べていたのを、1件につき1回読むだけにしました。8万件の記録で選び直し1回がおよそ7分の1の時間になります。選ばれるコメントは変わりません。'
    ])
  }),
  Object.freeze({
    version: '0.1.2127',
    date: '2026-11-15',
    summary: '大きな記録で開いた直後の固まりを減らした',
    items: Object.freeze([
      '記録が2万件を超える配信で横の欄を開いたとき、裏で確かめるだけの集計(画面には出ない)が開いた直後に走って、件数や応援マスの表示を遅らせていました。この集計を開いてから2分後に回し、開いた直後の固まりを減らしました。見た目は変わりません。'
    ])
  }),
  Object.freeze({
    version: '0.1.2126',
    date: '2026-11-15',
    summary: 'ニコ生以外の横の欄が裏で回り続けるのを止めた',
    items: Object.freeze([
      'YouTube・Twitch・Kick などニコ生以外の配信で横の欄を開いていると、数字のチップを整える処理が自分の書き換えに反応して1秒に60回動き続けていたのを直しました。何もしていない間の画面の書き換えが約20分の1になり、遅いPCでも軽くなります。見た目は変わりません。'
    ])
  }),
  Object.freeze({
    version: '0.1.2125',
    date: '2026-11-15',
    summary: '人が少ない順位のカードが横に伸びない',
    items: Object.freeze([
      '公式ランキングなどの順位カードが1〜4人しかいないとき、広い画面でカードが画面いっぱいに横へ伸びていたのを直しました。カード1枚の幅を300pxまでにして、まん中に並べます。細い横パネルでの見え方は変わりません。'
    ])
  }),
  Object.freeze({
    version: '0.1.2122',
    date: '2026-11-13',
    summary: '拡張の短い説明文を見直した',
    items: Object.freeze([
      'Chrome ウェブストアに出る拡張の短い説明を「ライブ配信の応援コメントをこのPCの中だけに記録し、配信後に3つのレーンで振り返れます」にしました。使い方や動きは変わりません。'
    ])
  }),
  Object.freeze({
    version: '0.1.2121',
    date: '2026-11-13',
    summary: '文字にくっついたスタンプ名も読まない',
    items: Object.freeze([
      '文字のすぐ後ろに YouTube のスタンプが続くと(例「fraudface-blue-smiling」)、スタンプの名前を英語のまま読んでいました。くっついていても名前は読まないようにしました。'
    ])
  }),
  Object.freeze({
    version: '0.1.2120',
    date: '2026-11-13',
    summary: 'スタンプの名前を読み上げない',
    items: Object.freeze([
      'YouTube のスタンプ(face-fuchsia-tongue-out や :_xxx: のような名前)を、英語の名前のまま読み上げていました。スタンプの名前は読まないようにしました(画面の表示は今までどおりです)。'
    ])
  }),
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
