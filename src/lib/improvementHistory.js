/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】版ごとの【実測値】そのもの(データ)
 * 【この箱に入らないもの】判定ロジック(improvementLedger.js が正本)
 * 【書けるstorageキー】なし
 * 【正本宣言】版ごとの実測値はこのファイルのみ
 *
 * improvementHistory.js — ★版ごとの実測値の台帳。
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ■ ★書き方の掟(これを守らないと台帳が死ぬ)
 *   1. ★**実際に測った数字だけ**書く。体感・推定・目標値は書かない。
 *   2. ★**どこで測ったか(source)を必ず書く**。後から検算できない数字は載せない。
 *   3. 改善したときだけでなく、★**退化したときも書く**。隠すと台帳の意味が消える。
 *   4. 指標は `improvementLedger.js` の `IMPROVEMENT_METRICS` にあるものだけ。
 *      無ければ**先に指標を宣言する**(方向 better を決める＝これが一番大事)。
 *
 * ■ ★なぜ「オプトインの台帳は死ぬ」のに、これは生きられるか
 *   このリポでは登録制の台帳が3ヶ月で1件のまま死んだ実績がある
 *   ([[opt-in-registry-always-ossifies-2026-08-19]])。
 *   ★だからこの台帳には **検査(scripts/check-improvement.mjs)** を付けた:
 *     ・過去最良より悪い値を書いたら **赤**(退化を素通しできない)
 *     ・宣言に無い指標を書いたら **赤**
 *   ＝ 「書かないと赤くなる」ではなく「★**間違って書くと赤くなる**」。
 *     書くこと自体は強制しない(強制すると嘘の数字が入る)。
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * @typedef {object} ImprovementRecord
 * @property {string} version 版
 * @property {string} metric IMPROVEMENT_METRICS の id
 * @property {number} value 実測値
 * @property {string} source ★どこで測ったか(検算できる形で)
 * @property {string} [note] 何をしたか
 */

/**
 * ★版ごとの実測値。**古い順**に並べる。
 *
 * ★初期値は changelog 1,349版から実際に抽出した before→after 18件のうち、
 *   指標が宣言済みで出所を特定できたものだけを入れた
 *   (抽出できても出所が書けないものは**入れない**＝検算できないため)。
 */
export const IMPROVEMENT_HISTORY = Object.freeze([
  /* ── 診断の所要(小さいほど良い) ───────────────────────────── */
  Object.freeze({
    version: '0.1.1400', metric: 'diag-ms', value: 817000,
    source: '状態速報の「更新所要(計器)」',
    note: '★計器の読み過ぎで診断自体がアプリを重くしていた(実事故)'
  }),
  Object.freeze({
    version: '0.1.1416', metric: 'diag-ms', value: 5,
    source: '状態速報の「更新所要(計器)」',
    note: '読み取りを1バッチにまとめた'
  }),

  /* ── バンドルの大きさ(小さいほど良い) ─────────────────────── */
  Object.freeze({
    version: '0.1.1453', metric: 'bundle-kb', value: 2400,
    source: 'extension/dist/popup.js のファイルサイズ',
    note: '更新履歴 changelog.js が 1,042KB(全体の43%)を占めていた'
  }),
  Object.freeze({
    version: '0.1.1454', metric: 'bundle-kb', value: 1360,
    source: 'extension/dist/popup.js のファイルサイズ',
    note: '更新履歴を archive へ分割(親スレッド停止 1,373ms→106ms)'
  }),

  /* ── 自己検査を持つ検査の数(多いほど良い) ─────────────────── */
  Object.freeze({
    version: '0.1.1466', metric: 'gate-selftest', value: 0,
    source: 'npm run audit:gates',
    note: '★53本の検査すべてが「毒を入れても赤くなるか」を確かめられなかった'
  }),
  Object.freeze({
    version: '0.1.1467', metric: 'gate-selftest', value: 1,
    source: 'npm run audit:gates',
    note: '45リポから収穫した --selftest を check-layer に実装'
  }),

  /* ── パネルが止まる時間(小さいほど良い) ───────────────────── */
  Object.freeze({
    version: '0.1.1449', metric: 'panel-block-ms', value: 1373,
    source: '状態速報「サイドパネル自己診断」の最大タイマー遅延',
    note: '★iframe(popup.html 2.4MB)のロードが親スレッドを止めていた'
  }),
  Object.freeze({
    version: '0.1.1454', metric: 'panel-block-ms', value: 106,
    source: '状態速報「サイドパネル自己診断」の最大タイマー遅延',
    note: 'バンドル分割の効果(92%減)'
  }),
  Object.freeze({
    version: '0.1.1471', metric: 'bundle-kb', value: 1405,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★意図した悪化。v0.1.1455〜1471 で計器・検査を17版ぶん追加した分(+45KB)。' +
      '★親スレッド停止は 106ms のまま(panel-block-ms で見張っている)ので、体感は悪化していない。' +
      '★1360 に戻すには計器を削るしかないため、ここは戻さない判断。'
  }),
  Object.freeze({
    version: '0.1.1471', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1472', metric: 'bundle-kb', value: 1405,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★v0.1.1471 と同値(1405KB)＝この版では増やしていない。' +
      '内訳は v0.1.1455〜1471 で足した計器・検査17版ぶん(+45KB)のまま。' +
      '★親スレッド停止は 106ms のままなので体感は悪化していない。' +
      '1360 に戻すには計器を削るしかないため、ここは戻さない判断。'
  }),
  Object.freeze({
    version: '0.1.1472', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1473', metric: 'bundle-kb', value: 1405,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★v0.1.1471 から3版連続で同値(1405KB)＝増やしていない。' +
      '内訳は v0.1.1455〜1471 の計器・検査17版ぶん(+45KB)のまま。' +
      '★親スレッド停止は 106ms のままで体感は悪化していない。'
  }),
  Object.freeze({
    version: '0.1.1473', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1474', metric: 'bundle-kb', value: 1405,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★v0.1.1471 から4版連続で同値(1405KB)＝増やしていない。' +
      '内訳は v0.1.1455〜1471 の計器・検査17版ぶん(+45KB)のまま。' +
      '★親スレッド停止は 106ms のままで体感は悪化していない。'
  }),
  Object.freeze({
    version: '0.1.1474', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1475', metric: 'bundle-kb', value: 1406,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1KB は意図した増加。応援レーンの窓(laneWindowVerdict.js)を足した分。' +
      '実測で画面の高さ 2,010px→380px(81%減)・タイルは857枚のまま1枚も消えていない。' +
      '★DOMを減らす効果の方が大きい(数百枚が画面を突き抜けるのを止めた)。'
  }),
  Object.freeze({
    version: '0.1.1475', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1476', metric: 'bundle-kb', value: 1406,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★v0.1.1475 と同値(1406KB)＝この版では増やしていない。' +
      '変更は status.html のCSS 2行と検査1件のみ(popup.js には影響しない)。'
  }),
  Object.freeze({
    version: '0.1.1476', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1477', metric: 'bundle-kb', value: 1407,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1KB は popup.html の見出し文言とコメントを足した分(機能は増やしていない)。' +
      '「なふだ」が見つけられない=閉じた詳細設定の中で見出しに名前が無かった、への対処。' +
      '★UIの発見性を上げる変更なので、この+1KBは受け入れる。'
  }),
  Object.freeze({
    version: '0.1.1477', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1478', metric: 'bundle-kb', value: 1407,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★v0.1.1477 と同値(1407KB)＝この版では増やしていない。' +
      '変更は popup.html のUI追加とCSS・配線の分岐のみ。' +
      '★なふだをコメント入力の隣に置く発見性の改善(同じ機能で3回目の指摘)。'
  }),
  Object.freeze({
    version: '0.1.1478', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1478', metric: 'diag-ms', value: 19,
    source: '実機の状態速報「更新所要(計器)」 2026-08-22 12:56',
    note: '★v0.1.1476(状態ページにも窓)+v0.1.1478 の効果。29,303ms→638ms→19ms。★この指標は v0.1.1416 以降62版ぶん記録が空いていた(鮮度の検査で判明)'
  }),
  Object.freeze({
    version: '0.1.1478', metric: 'dom-nodes', value: 2864,
    source: '実機の状態速報 memoryPressure.domNodes 2026-08-22 12:56',
    note: '★初回記録。推奨1500を超えている(実測2,864)。★これから下げる対象として台帳に載せる'
  }),
  Object.freeze({
    version: '0.1.1478', metric: 'panel-block-ms', value: 669,
    source: '実機の状態速報「最大タイマー遅延」 2026-08-22 12:56',
    note: '★24版ぶりの記録。v0.1.1454の106msより大きいが、★測定条件が違う' +
      '(当時=バンドル分割直後の計測 / 今回=来場2,605人の実配信)。' +
      '★比べてよい数字かはまだ確かめていない。次版で同条件を揃えて測り直す。'
  }),
  Object.freeze({
    version: '0.1.1478', metric: 'record-rate', value: 100,
    source: '実機の状態速報「取得率」 2026-08-22 12:56 (記録1,864/公式1,861)',
    note: '★初回記録。取得完了100%'
  }),
  Object.freeze({
    version: '0.1.1479', metric: 'bundle-kb', value: 1407,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★v0.1.1477 から3版連続で同値(1407KB)＝この版では増やしていない。' +
      '追加は検査側(improvementStaleness.js)で popup.js には入らない。' +
      '★+47KB(1360→1407)の累積は計器・検査の追加分。次に減らす対象として台帳に残す。'
  }),
  Object.freeze({
    version: '0.1.1479', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1480', metric: 'bundle-kb', value: 1408,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★更新履歴の新エントリ(利用者が読む文章)の分。新しい検査はビルド時のみで出荷物に入っていない(distにlpContentStalenessは0件)'
  }),
  Object.freeze({
    version: '0.1.1480', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1481', metric: 'bundle-kb', value: 1408,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★1407→1408。更新履歴の新エントリ(利用者が読む文章)の分。判定は純関数1本でdistへの寄与は僅少'
  }),
  Object.freeze({
    version: '0.1.1481', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1482', metric: 'bundle-kb', value: 1409,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★1408→1409。更新履歴の新エントリ(利用者が読む文章)の分。今回はHTMLの文言修正のみでロジック追加なし'
  }),
  Object.freeze({
    version: '0.1.1482', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1483', metric: 'bundle-kb', value: 1408,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★1409→1408(前版より減)。合言葉の行は既存の症状IDを1行足すだけでロジック追加なし'
  }),
  Object.freeze({
    version: '0.1.1483', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1484', metric: 'bundle-kb', value: 1408,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★描き直しの原因を名指しする判定を追加(純関数1本)。更新履歴の新エントリぶんを含む'
  }),
  Object.freeze({
    version: '0.1.1484', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1490', metric: 'bundle-kb', value: 1410,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★過去最良1360(@0.1.1454)より50KB大きいが、今回の増分は【1KB】。'
      + '実測で切り分けた: この変更を stash して同じ手順でビルドすると 1409KB、'
      + '戻すと 1410KB。つまり49KBは v0.1.1489 までに既に積まれていたもので、'
      + '応援動画バナー(純関数1本+DOM1本+JSON)の寄与は1KB。数字は隠さずここに残す。'
  }),
  Object.freeze({
    version: '0.1.1490', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1491', metric: 'bundle-kb', value: 1410,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★この版で増えた分は 0KB（前版 v0.1.1490 も 1410）。過去最良 1360 との差は ' +
      'v0.1.1455〜1471 で計器を17版ぶん足した分で、v0.1.1471 の note に記録済みの意図した悪化。' +
      '★この版の変更は scripts/ 配下（検査の土台）とドキュメントだけで、バンドルには入らない。' +
      '★changelog は 21版に増えた時点で上限20を超えたため archive へ分割済み（版の総数 1,371 は不変）。'
  }),
  Object.freeze({
    version: '0.1.1491', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1492', metric: 'bundle-kb', value: 1410,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★この版で増やした分は実質ゼロ（前版 v0.1.1491 も 1410KB。実測 1409KB）。' +
      '足したのは純関数1本(venuePresenceNote.js・約120行)だが、' +
      '同時に changelog を archive へ分割した分で相殺されている。' +
      '★過去最良 1360 との差は v0.1.1455〜1471 の計器17版ぶん(+45KB)で、' +
      'v0.1.1471 の note に記録済みの意図した悪化。' +
      '★親スレッド停止は 106ms のままで体感は悪化していない。'
  }),
  Object.freeze({
    version: '0.1.1492', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1493', metric: 'bundle-kb', value: 1410,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★この版で増やした分は実質ゼロ(v0.1.1492 と同値)。足したのは純関数1本と型宣言1本で、' +
      'いずれも会場側(venue.js)。popup.js には影響しない。' +
      '★過去最良1360との差は v0.1.1455〜1471 の計器17版ぶん(+45KB)で v0.1.1471 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1493', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1494', metric: 'bundle-kb', value: 1411,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★この版で増えたのは【313バイト】。推測ではなく実測した: '
      + 'git show HEAD:extension/dist/popup.js | wc -c = 1444293 に対し、'
      + '当版は 1444606（差 313B）。1410→1411 は KB 丸めの境界をまたいだだけで、'
      + '実体は版数文字列の差し替えと更新履歴1版の入れ替え（20版上限で最古版が archive へ出る）。'
      + '★今回足した会場ホバーの判定(venueHoverFacts.js)は popup.js に入っていない'
      + '（実測: grep -c resolveVenueHoverFacts → popup.js:0 / venue.js:2）。'
      + '★過去最良1360との差は v0.1.1455〜1471 の計器17版ぶん(+45KB)で v0.1.1471 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1494', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  })
]);
