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
  }),
  Object.freeze({
    version: '0.1.1534',
    date: '2026-09-21',
    summary: '会場の席のちらつきを修正',
    items: Object.freeze([
      '会場モードで、同じ配信の一瞬だけ空になる瞬間に席(応援タイル)が消えてすぐ戻る「ちらつき」を修正しました。配信を切り替えたときは従来どおり前の配信の席は残しません。'
    ])
  }),
  Object.freeze({
    version: '0.1.1533',
    date: '2026-09-21',
    summary: '使っていない内部コードを整理',
    items: Object.freeze([
      'どこからも使われていない内部モジュール5件を削除しました。動作は変わらず、配布物が少し軽くなります。'
    ])
  }),
  Object.freeze({
    version: '0.1.1532',
    date: '2026-09-21',
    summary: 'パチンコ風の点滅演出を削除しました',
    items: Object.freeze([
      'リーチ/フィーバーのパチンコ風の点滅・BGM・ボイス演出を削除しました。画面がすっきりし、動作も軽くなります。ギフト・広告の効果音や読み上げは従来どおりです(内部整理を含む)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1531',
    date: '2026-09-21',
    summary: 'パネルを開く瞬間の黒帯を修正',
    items: Object.freeze([
      'watch を開いた瞬間、パネルの土台が一瞬黒くなることがあったのを直しました(土台に不透明の地色を敷き、下の黒が透けないようにしました)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1530',
    date: '2026-09-20',
    summary: 'パネルの一瞬黒とレーンのちらつきを修正',
    items: Object.freeze([
      'サイドパネルを開いた瞬間に一瞬黒くなることがあったのを直しました(背景の地色を必ず敷くようにしました)。また、応援レーンのアイコンが開いた直後に一瞬減って見えるちらつきを、描画のもとを一本化して抑えました(内部改善・見た目の安定)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1529',
    date: '2026-09-20',
    summary: '拡張の識別子を固定し反映を安定化',
    items: Object.freeze([
      '拡張の内部識別子を固定しました。これまで読み込むフォルダの場所によって識別子が変わり、記録の紐づけが不安定になる・更新のたびに固まることがありました。識別子を固定したことで、フォルダを移動しても記録が保たれ、反映も安定します(内部改善・体感は変わりません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1528',
    date: '2026-09-18',
    summary: '先読み表示を応援レーンだけに絞りました',
    items: Object.freeze([
      '前版の「開いた直後の先読み表示」で、記録件数カードが一瞬前回の値を挟むと祝い演出が誤って出る恐れがあったため、先読みは応援レーンだけに絞りました。上段カードは従来どおり少し後に表示されます(誤演出の防止)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1527',
    date: '2026-09-18',
    summary: 'パネルを開いた直後の表示を速く',
    items: Object.freeze([
      'サイドパネルを開いた直後、前回までの応援レーンと上段カードを先に表示するようにしました。重い読み込みを待たずに中身が出るので、開いてから見えるまでの待ち時間が短くなります(一度開いた配信でのみ効きます)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1526',
    date: '2026-09-18',
    summary: '内部整理(表示や動作は変わりません)',
    items: Object.freeze([
      '開発モニタのデータ書き出し処理を別ファイルへ整理しました(操作・出力は変わりません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1525',
    date: '2026-09-18',
    summary: '内部整理(表示や動作は変わりません)',
    items: Object.freeze([
      '配色プリセット(枠テーマ)まわりの内部コードを別ファイルへ整理しました(見た目・操作は変わりません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1524',
    date: '2026-09-18',
    summary: '内部整理(表示や動作は変わりません)',
    items: Object.freeze([
      '内部の純粋な処理をさらに共通の場所へ移して見通しをよくしました(表示や動作は変わりません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1523',
    date: '2026-09-18',
    summary: '内部整理(表示や動作は変わりません)',
    items: Object.freeze([
      '内部の純粋な処理を共通の場所へ移して見通しをよくしました(表示や動作は変わりません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1522',
    date: '2026-09-18',
    summary: '内部整理(表示や動作は変わりません)',
    items: Object.freeze([
      '内部の重複していた初期化処理を1つ整理しました(バージョン表示や動作は変わりません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1521',
    date: '2026-09-17',
    summary: '内部整理の安全網(挙動は変わりません)',
    items: Object.freeze([
      '今後の内部整理でうっかり大きくなりすぎないよう、開発用の見張りを追加しました(表示や動作は変わりません)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1520',
    date: '2026-09-16',
    summary: 'カード画像の配信者名の括弧欠けを修正',
    items: Object.freeze([
      'シェアカード画像で、配信者名が途中で切れて開き括弧だけが残ることがあったのを直しました。'
    ])
  }),
  Object.freeze({
    version: '0.1.1519',
    date: '2026-09-15',
    summary: 'シェアカードの画像に応援の数字を合成',
    items: Object.freeze([
      'カード画像が、配信サムネに来場・コメント・ギフト・広告の数字と時刻を重ねたものになりました(放送中の配信のみ・数字は貼った時点の目安)。'
    ])
  }),
  Object.freeze({
    version: '0.1.1518',
    date: '2026-09-15',
    summary: 'シェアカードの説明文に応援の数字',
    items: Object.freeze([
      '配信リンクのカード説明文に、来場・コメント・ギフト・広告の数字(取得時点)が入るようになりました。',
      '応援した人の名前・コメント本文は引き続き載せません。'
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
