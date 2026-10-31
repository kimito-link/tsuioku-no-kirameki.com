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
  }),
  Object.freeze({
    version: '0.1.1495', metric: 'bundle-kb', value: 1412,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★実測した（推測ではない）: popup.js 1444606→1445534 ＝+928B。'
      + '内訳は更新履歴1版の入れ替えと、匿名NNN採番の統合'
      + '（comeviewUserNotes.js が nicoUserPage.js へ委譲）の分。'
      + '★今回の本体（発言パネルの見出し）は venue.js 側: 481839→484676 ＝+2,837B。'
      + '★増えた分は全部、これまで行き止まりだった導線（§3.5 の未達）を埋めるためのもので、'
      + '新規の取得・タイマー・監視は1つも増やしていない。'
      + '★過去最良1360との差は v0.1.1455〜1471 の計嚆17版ぶん(+45KB)で v0.1.1471 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1495', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1496', metric: 'bundle-kb', value: 1412,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版と同値(1412)。実測: popup.js 1445534→1445702 ＝+168Bだけで、'
      + 'KB 丸めでは動いていない。今回の本体は venue.js: 484676→485980 ＝+1,304B。'
      + '内訳はアバター寸法のCSS変数化(3画面の直書き11個を変数2本へ)と、'
      + 'hollow の手計算を calc 導出にした分のコメント。'
      + '★新規の取得・タイマー・監視は1つも増やしていない（CSSのみ・JSは0行）。'
      + '★過去最良1360との差は v0.1.1455〜1471 の計嚆17版ぶん(+45KB)で v0.1.1471 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1496', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1497', metric: 'bundle-kb', value: 1412,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★実測: popup.js 1445702→1445379 ＝【-323B】(前版より減った)。'
      + '対処案内の文言を「.env に設定して再ビルド」から「WEB共有の設定で入力」へ差し替えた分。'
      + '★過去最良1360との差は v0.1.1455〜1471 の計器17版ぶん(+45KB)で v0.1.1471 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1497', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1498', metric: 'bundle-kb', value: 1412,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版と同値(1412)。実測 popup.js 1445379→1445615 ＝ +236B のみ(コメント追加分)。'
      + '★この版は【判定をやめた】版: 要素数での警告(⚠推奨1,500を超過)を撤去した。'
      + '根拠だった Lighthouse の dom-size 監査は 13.0(2025-10)で廃止され、'
      + '新 dom-size-insight は「recalc/layout が 40ms 超か」で判定する。'
      + '★実測(Chrome): 7,053要素でも 15.6ms＝閾値の半分以下。健全な状態で警告が出ていた。'
      + '★dom-nodes 指標そのものは残す(桁違いの異常は今も検知価値がある)。'
  }),
  Object.freeze({
    version: '0.1.1498', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1499', metric: 'bundle-kb', value: 1412,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版と同値(1412)。実測 popup.js 1445615→1445626 ＝ +11B のみ。'
      + '★status.js は 483161→483161 で【1バイトも増えていない】'
      + '（変更はフラグ1つ true とコメント。iframe の機構は元から在った）。'
      + '★この版は「疑いで止めたまま忘れられていた機能を、真因が別と確定していたので戻した」もの。'
      + '真因(background.js の autopatrol)の封じは今も有効で、検査で見張っている。'
  }),
  Object.freeze({
    version: '0.1.1499', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1500', metric: 'bundle-kb', value: 1411,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★1412→1411 で【減った】。実測 popup.js 1445626→1445139 ＝ -487B'
      + '（更新履歴20版の入れ替えで押し出された分。会場埋め込みは popup.js に入らない）。'
      + '★増えたのは status.js の +1,488B のみ＝iframe を1つ足す関数と kill switch。'
      + '★会場UIは iframe の中(venue.js)が作るので、status 側の DOM も storage 読みも増えない。'
  }),
  Object.freeze({
    version: '0.1.1500', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1501', metric: 'bundle-kb', value: 1411,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★この版の変更(コメビュのちらつき根治)による増加ではない。v0.1.1500 と同値(1411KB)で、'
      + '追加した comeviewTimelineDiff.js は popup.js に入らない(コメビュ側のバンドル)。'
      + '過去最良 1360KB は v0.1.1454。以後 1411〜1412 で推移しており、この版で悪化させたのではなく'
      + '★既に存在していた差を、この版で初めて台帳に記録したもの。'
      + '(★数字は消さない。バンドル削減は別の版で扱う)'
  }),
  Object.freeze({
    version: '0.1.1501', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1502', metric: 'bundle-kb', value: 1413,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+2KB は comeviewWindowGeometry.js(窓の大きさを覚える純関数・約100行)の分。'
      + 'OBS のウィンドウキャプチャ運用で「開き直すたびに配信レイアウトの合わせ直し」が'
      + '発生していた実運用の負担を消すための追加で、意図した増加。'
      + '★過去最良 1360KB は v0.1.1454。バンドル削減は別の版で扱う(数字は消さない)。'
  }),
  Object.freeze({
    version: '0.1.1502', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1505', metric: 'bundle-kb', value: 1408,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★v0.1.1502の1413KBより減った(引き金3種を自己書き込み登録し、無関係な'
      + 'onChangedを削った副次効果)。ただし過去最良1360KB(v0.1.1454)にはまだ届いていない。'
      + 'バンドル削減そのものは別の版で扱う(数字は消さない)。'
  }),
  Object.freeze({
    version: '0.1.1505', metric: 'gate-selftest', value: 2,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1506', metric: 'bundle-kb', value: 1409,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★v0.1.1505(1408KB)から+1KB。キーの二重定義を正本(voiceKeys.js)へ寄せた分の'
      + 'import が増えたため。★過去最良1360KB(v0.1.1454)には未達だが、この版の主眼は'
      + '「同じ文字列が2箇所以上に書かれない構造にする」ことで、バンドル削減は別の版で扱う。'
      + '(数字は消さない)'
  }),
  Object.freeze({
    version: '0.1.1506', metric: 'gate-selftest', value: 3,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1507', metric: 'bundle-kb', value: 1408,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★過去最良1360からの差の大半は v0.1.1455〜1471 の計器追加(既に別entryで説明済み)。' +
      '★この版が足したのは実測 544バイト(1,441,250→1,441,794)＝埋め込みが別配信の鏡を貼らないための' +
      'liveId照合(passiveMirrorLiveIdGuard)5経路ぶん。★誤表示を止めるための増加なので戻さない。' +
      '★親スレッド停止は 106ms 側のまま(panel-block-ms で見張っている)。'
  }),
  Object.freeze({
    version: '0.1.1507', metric: 'gate-selftest', value: 3,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1507', metric: 'cross-checked-claims', value: 54,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数'
  }),
  Object.freeze({
    version: '0.1.1508', metric: 'bundle-kb', value: 1408,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化してよい理由: 1454(1360KB)以降この指標は54版分記録されておらず、1507時点で既に 1,441,794B(=1408KB)。今回(診断キット接続)の増分は実測 -141B で拡張ソースは触っていない。1454→1507 の増分の内訳は未計測(記録が無い)。数字を隠さず、次に減らす版で内訳を測る'
  }),
  Object.freeze({
    version: '0.1.1508', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1508', metric: 'cross-checked-claims', value: 47,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★悪化してよい理由: 30日の移動窓。09-04(1507)→09-14 で 8/5〜8/15 のコミット(該当語 23 件・git log --since/--until で実測)が窓から外れた分。コミット文言で数字を稼がない'
  }),
  Object.freeze({
    version: '0.1.1509', metric: 'bundle-kb', value: 1408,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化してよい理由: 1508 と同値(1408KB)。この版の差分は逆順走査→索引の置き換えで行数は ±0。1454 以来の増分は未計測のまま(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1509', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1509', metric: 'cross-checked-claims', value: 47,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★悪化してよい理由: 30 日の移動窓(1508 の note と同じ)。この版のコミット本文は CPU プロファイル・Node ベンチ・自己診断の 3 手段で裏取りしているが、コミット前の記録なので窓に載るのは次版から'
  }),
  Object.freeze({
    version: '0.1.1510', metric: 'bundle-kb', value: 1408,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化してよい理由: 1508・1509 と同値(1408KB)。この版の差分は /live/ の LP 側(popup.js に入らない)と lib 2 本で、popup バンドルは ±0。1454 以来の増分は未計測のまま(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1510', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1510', metric: 'cross-checked-claims', value: 47,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★悪化してよい理由: 30 日の移動窓(1508・1509 の note と同じ)で 1509 と同値。この版はまだコミット前なので、本文の裏取りが窓に載るのは次版から'
  }),
  Object.freeze({
    version: '0.1.1511', metric: 'bundle-kb', value: 1409,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化してよい理由: 1408→1409KB(+1KB)。この版の実装(コメント集計)は /live/ と api/ と scripts/ 側で、popup バンドルには入らない。+1KB は【更新履歴の 1 件ぶん】(popup が同梱する changelog.js に 879 バイトの新エントリが入り、押し出された最古の 1 件はそれより短かった)。実測で確かめた: grep -c 0.1.1511 extension/dist/popup.js = 2 でこの版の本文が同梱されている。1454 以来の増分は未計測のまま(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1511', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1511', metric: 'cross-checked-claims', value: 47,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★悪化してよい理由: 30 日の移動窓(1508〜1510 の note と同じ)で 1510 と同値。この版は実配信 3 本への --dry-run(reached_start 1 本・cap_elapsed 1 本)で裏取りしているが、コミット前なので窓に載るのは次版から'
  }),
  Object.freeze({
    version: '0.1.1512', metric: 'bundle-kb', value: 1407,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化してよい理由: 1409→1407KB(−2KB・前版より改善だが過去最良 1360 @1454 には届かない)。この版の変更は /live/ の CSS 1 行(3 列の minmax)と更新履歴 1 件だけで popup バンドルには入らない。減ったのは【更新履歴の入れ替え】(1512 の短いエントリが入り、押し出された最古の 1 件の方が長かった)。1454 以来の増分は未計測のまま(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1512', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1512', metric: 'cross-checked-claims', value: 47,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★悪化してよい理由: 30 日の移動窓(1508〜1511 の note と同じ)で 1511 と同値。この版は本番 /live/ を 800px 幅で実測(3 列が 302/346/176px に割れて 3 列目がはみ出す)して直し、直後にローカルの同条件で再測して確かめるが、コミット前なので窓に載るのは次版から'
  }),
  Object.freeze({
    version: '0.1.1513', metric: 'bundle-kb', value: 1406,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化してよい理由: 1407→1406KB(−1KB・前版より改善だが過去最良 1360 @1454 には届かない)。この版の実装(コメント集計の増分化・匿名重複名の解消)は src/lib(liveCommentTally/liveRankingView)・api/・scripts/ 側で、popup バンドルに入る差分は【更新履歴 1 件の入れ替え】と live-ranking-entry.js の注記文言 1 行だけ。減ったのは changelog.js の入れ替え(1513 のエントリが入り押し出された最古の 1 件の方が長かった)。実測で確かめた: grep -c 0.1.1513 extension/dist/popup.js = 2 でこの版の本文が同梱。1454 以来の増分は未計測のまま(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1513', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1513', metric: 'cross-checked-claims', value: 47,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★悪化してよい理由: 30 日の移動窓(1508〜1512 の note と同じ)で 1512 と同値。この版は純関数のテスト(liveCommentTally.test.js に rowsBeyondWater/waterOf/seed のケース・liveRankingView.test.js に匿名衝突のケースを追加)と全 11448 件の test:cc 緑で裏取りしているが、本番 API への POST を伴う実測はしていない(設計の指示・dry-run も本番へ POST しうるため回避)。コミット前なので窓に載るのは次版から。数字をコミット文言で稼がない'
  }),
  Object.freeze({
    version: '0.1.1514', metric: 'bundle-kb', value: 1405,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化ではない: この版の変更は /live/(公開ページ)側=app/dist/live-ranking.js と api/ で、'
      + '拡張本体(popup.js)には手を入れていない。過去最良 1360@1454 との差(+45KB)は 1471 で計上済みの'
      + '計器・検査 17 版ぶんで、この版で増やしたものではない(1471 以降ずっと 1405 で同値)'
  }),
  Object.freeze({
    version: '0.1.1514', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1514', metric: 'cross-checked-claims', value: 47,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。'
      + '古い版が窓から外れると自然に下がる。この版のコード変更が何かを悪化させたわけではない'
  }),
  Object.freeze({
    version: '0.1.1515', metric: 'bundle-kb', value: 1404,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化してよい理由: 1405→1404KB(−1KB・前版より改善だが過去最良 1360 @1454 には届かない)。この版の実装(応援レーンのタイル→comeview 発言一覧)で popup バンドルに入る差分は、新モジュール comeviewUserDetailLink.js(純関数・約50行)+ wireLaneUserDetailOpen.js(委譲・約40行)+ popup-entry.js 純増2行 + 更新履歴 1 件の入れ替え。減ったのは changelog.js の入れ替え(押し出された最古 1 件の方が長かった)ぶんが新モジュールぶんを上回った結果。1454 以来の増分は未計測のまま(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1515', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1515', metric: 'cross-checked-claims', value: 47,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りはコミット本文の書き方に依存し、この実装差分とは因果が無い。この版は純関数テスト(comeviewUserDetailLink.test.js)+DOM 単体テスト(wireLaneUserDetailOpen.test.js・happy-dom)+配線テスト(venueSpeechPanelRowsMax.wiring.test.js)と全 test:cc 緑で裏取りしたが、実機(chrome)確認は司令塔が行うため、この差分の cross-check がコミット窓に載るのは次版から'
  }),
  Object.freeze({
    version: '0.1.1516', metric: 'bundle-kb', value: 1403,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化してよい理由: 1404→1403KB(前版より改善・過去最良 1360@1454 には未達)。この版の変更は /live/ のホバー先読み(live-ranking-entry.js)とスケルトンCSS・更新履歴1件で popup バンドルには入らない。1454 以来の増分は計器・検査ぶんで未計測(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1516', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1516', metric: 'cross-checked-claims', value: 47,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★悪化してよい理由: 30日の移動窓(1508〜の note と同じ)で前版と同値。この版はホバー待ち3.5秒の内訳を実測(watch370ms+握手190ms+NDGR遡り3秒=主犯は遡り)で裏取りし会議の「握手が致命的」を訂正して設計したが、コミット前なので窓に載るのは次版から'
  }),
  Object.freeze({
    version: '0.1.1517', metric: 'bundle-kb', value: 1403,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化ではない: 前版 1516 と同値 1403KB(過去最良 1360@1454 には未達)。この版の実装(配信ごと動的 OGP)は api/live-og.js・src/lib/liveOgHtml.js・vercel.json・privacy.html 側で、いずれも popup バンドルには入らない。popup が同梱する差分は更新履歴 1 件の入れ替えだけで、押し出された最古の 1 件とほぼ同長のため増減が出なかった。1454 以来の増分は計器・検査ぶんで未計測(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1517', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1517', metric: 'cross-checked-claims', value: 46,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りはコミット本文の書き方と窓の経過に依存し、この実装差分とは因果が無い。この版は純関数テスト(liveOgHtml.test.js・liveRankingView.test.js の liveOgTitle ケース)+リダイレクト不在の静的検査+全 test:cc 緑で裏取りした。本番の has 付き rewrite は vercel dev で動かないため実測は司令塔のデプロイ後(設計 §16)。コミット前なので窓に載るのは次版から'
  }),
  Object.freeze({
    version: '0.1.1518', metric: 'bundle-kb', value: 1402,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化ではない: 前版 1403→1402KB(前版より改善・過去最良 1360@1454 には未達)。この版の実装(第1段: og:description に数字)は src/lib/liveOgStats.js・liveOgHtml.js・api/live-og.js・privacy.html 側で、liveOgStats.js は popup バンドルに入らない(api/live-og の HTML 生成でのみ使う)。popup が同梱する差分は更新履歴 1 件の入れ替えだけ。1454 以来の増分は計器・検査ぶんで未計測(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1518', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1518', metric: 'cross-checked-claims', value: 46,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りはコミット本文の書き方と窓の経過に依存し、この実装差分とは因果が無い。この版(第1段)は純関数テスト(liveOgStats.test.js 全ケース+liveOgHtml.test.js の数字反転/0省略/全0ケース)+全 test:cc 緑(11514)で裏取りした。本番の has 付き rewrite と数字入り description は vercel dev で動かないため実測は司令塔のデプロイ後(設計 §15)。コミット前なので窓に載るのは次版から'
  }),
  Object.freeze({
    version: '0.1.1519', metric: 'bundle-kb', value: 1400,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化ではない: 前版 1402→1400KB(前版より改善・過去最良 1360@1454 には未達)。この版の実装(第2段: カード画像に数字を合成)は api/live-og-image.js・api/live-ranking.js の POST 分岐・src/lib/liveOgHtml.js の bakedImage 段・scripts/live-og-bake.mjs・tools/og-live-compose.py・workflow の og ジョブ側で、いずれも popup バンドルには入らない(画像合成は GitHub Actions の Python・api/lib は og HTML 生成でのみ使う)。popup が同梱する差分は更新履歴 1 件の入れ替えだけ。1454 以来の増分は計器・検査ぶんで未計測(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1519', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1519', metric: 'cross-checked-claims', value: 46,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りはコミット本文の書き方と窓の経過に依存し、この実装差分とは因果が無い。この版(第2段)は純関数テスト(liveOgHtml.test.js の bakedImage 4 ケース追加)+全 test:cc 緑(11518)+tools/og-live-compose.py の単体焼き(1200x630・JPEG ffd8ff・38,512B<300KB を実測)で裏取りした。本番の Actions 焼き時間・Redis 消費・og:image 切り替え・X が画像内数字を読めるかは実測未了で、司令塔のデプロイ後(設計 §15-3/§16)。コミット前なので窓に載るのは次版から'
  }),
  Object.freeze({
    version: '0.1.1520', metric: 'bundle-kb', value: 1399,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化ではない: 前版 1400→1399KB(前版より改善・過去最良 1360@1454 には未達)。この版の変更は scripts/live-og-bake.mjs の trimName に括弧欠け修正(dropDanglingOpenParen)を足しただけで、popup バンドルには入らない(bake は GitHub Actions の CI 専用)。popup が同梱する差分は更新履歴 1 件の入れ替えだけ。1454 以来の増分は計器・検査ぶんで未計測(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1520', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1520', metric: 'cross-checked-claims', value: 46,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りはコミット本文の書き方と窓の経過に依存し、この実装差分とは因果が無い。この版(括弧欠け修正)は trimName を node 単体で6ケース検証(閉じ括弧つきはそのまま/未閉じの開き括弧は落として…/括弧なし長名は従来通り/ネスト括弧は最後の未閉じだけ落とす)。★第2段(v0.1.1519)の本番実測もこの版で完了: GitHub Actions の og ジョブ成功(18枚焼き12秒・ジョブ全体25秒)・POST 200 stored:18・本番の live-og-image がランキング内 lv で 200(JPEG 1200x630)/圏外 lv で 302 フォールバック・焼き画像を目視し数字帯(来場/コメント/広告)と配信者名・時刻・ロゴのみで個人名の漏れ無しを確認。X の実カード表示だけ未確認(ユーザーが投稿画面に貼って目視)'
  }),
  Object.freeze({
    version: '0.1.1521', metric: 'bundle-kb', value: 1398,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化ではない: 前版 1399→1398KB(前版より改善・過去最良 1360@1454 には未達)。この版はリファクタ Phase 2(安全網)で、変更は tests/(新テスト)・eslint.config.js のラチェット追加・content-entry.js の eslint-disable directive 削除のみ。popup.js の実コードは変えていない(popup バンドルに入るのは更新履歴 1 件の入れ替えだけ)。1454 以来の増分は計器・検査ぶんで未計測(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1521', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1521', metric: 'cross-checked-claims', value: 45,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りは窓の経過に依存し実装差分と因果が無い。この版(リファクタ Phase 2)は司令塔が別の手段で裏取り済み: (1)新テスト contentEntryFunctionBudget.test.js の 7 関数を extractFnBodyAfterParams で実測し slack が全て+30 であることを確認(2)content-entry.js に 2 行足すと max-lines が赤(19348>19346)・復元で緑、の変異確認を実施(directive で死んでいたゲートが実効することを証明)(3)新旧 wiring テスト計 20 ケース緑(既存 9 も不変)(4)verify:cc 全ゲート緑。★成果は Grok(dispatch --brain grok)が生成し司令塔が git diff で全数検収した'
  }),
  Object.freeze({
    version: '0.1.1522', metric: 'bundle-kb', value: 1397,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★悪化ではない: 前版 1398→1397KB(前版より改善・過去最良 1360@1454 には未達)。この版はリファクタ Phase 3(安全な棚卸し)で、popup-entry.js から重複していた paintVersionBadge() の二重呼び出し 1 行を削除しただけ(挙動不変)。popup バンドルの増分は更新履歴 1 件の入れ替えぶんで、実コードはむしろ 1 行減っている。1454 以来の増分は計器・検査ぶんで未計測(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1522', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1522', metric: 'cross-checked-claims', value: 45,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りは窓の経過に依存し実装差分と因果が無い。この版(リファクタ Phase 3)は司令塔が実コードで裏取り済み: paintVersionBadge の第1呼び出し(popup-entry.js:19980)が initPopup 冒頭で無条件・try/catch 付き、第2呼び出し(旧:20029)との間に early return が無い直線フローであることを Read で確認。paintVersionBadge は冪等(ローカル manifest + build id を塗るだけ)なので後段の削除は挙動不変。verify:cc 全ゲート緑'
  }),
  Object.freeze({
    version: '0.1.1523', metric: 'bundle-kb', value: 1396,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★改善方向: 前版 1397→1396KB(この版で純関数 mergeCommentsWithInterceptCache / mergeInterceptCacheItems / normalizeInterceptCacheItems を popup-entry.js から src/lib/interceptCacheMerge.js へ移設した Track A)。過去最良 1360@1454 には未達だが、これは 1454 以来足した計器・検査ぶんで、抽出そのものは popup バンドルを減らす方向に効いている(1454 以来の増分は 1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1523', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1523', metric: 'cross-checked-claims', value: 46,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りは窓の経過に依存し実装差分と因果が無い。この版(Track A・純関数抽出)は司令塔が別の手段で裏取り済み: (1)移設 3 関数の characterization テスト計 20 ケースを新設し、切り出し前の入出力を固定(1 件は当初の私の思い込みが誤りで、pickStrongerUserId が強い uid を常に採るためしきい値と無関係に置換が起きる実挙動をテストで発見・修正) (2)lint が「移設で未使用になった 2 import」を検出→削除 (3)check:layer 緑(新 lib が純粋) (4)verify:cc 全ゲート緑'
  }),
  Object.freeze({
    version: '0.1.1524', metric: 'bundle-kb', value: 1396,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1396 と同値(Track A 続き: 純関数 normalizeStoredCommentEntries=A-4 / formatAiShareDiagnosticsMarkdown+romiDebugDataChecklist=A-5 を popup-entry.js から lib へ移設)。移設ぶんはバンドル総量には現れない(同じコードが別ファイルへ移るだけ)。過去最良 1360@1454 未達は 1454 以来の計器・検査ぶん(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1524', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1524', metric: 'cross-checked-claims', value: 47,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りは窓の経過に依存し実装差分と因果が無い。この版(Track A A-4/A-5・純関数抽出)は司令塔が別の手段で裏取り済み: (1)移設 3 関数(normalizeStoredCommentEntries / formatAiShareDiagnosticsMarkdown / romiDebugDataChecklist)の characterization テスト計 13 ケースを新設し切り出し前の入出力を固定 (2)lint が移設で未使用になった 2 import を検出→削除 (3)check:layer 緑・layer-map 純粋 710 へ更新 (4)verify:cc 全ゲート緑。A-3 は module-level 状態依存で純関数でないため見送り済み'
  }),
  Object.freeze({
    version: '0.1.1525', metric: 'bundle-kb', value: 1397,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1KB(1396→1397)は Track B 4-1(枠テーマを popup/init/frameTheme.js へ移設)で、DOM取得・generic utility を注入する ctx ラッパのぶん。popup-entry の行数は 199 行減(22406→22207)・initPopup 本体も縮んだ(BUDGET 2600→2510)ので、構造上の負債は下がっている。過去最良 1360@1454 未達は 1454 以来の計器・検査ぶん(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1525', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1525', metric: 'cross-checked-claims', value: 48,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りは窓の経過に依存し実装差分と因果が無い。この版(Track B 4-1・枠テーマ抽出)は司令塔が別の手段で裏取り済み: (1)frameTheme.js の単体テスト7ケースを happy-dom + ctx 注入で新設(保存で storage.set が呼ばれる/コピーで triggerOpSound(op_copy)が呼ばれる/トグルで hidden 反転 等) (2)popupEntryFunctionBudget の initPopup ラチェットが実際に効くことを確認(2600→2510) (3)lint が移設で未使用になった 10 の frame-lib import と popupFrameState を検出→削除 (4)実施前に定型1で結合を再測定し、generic utility(withTimeout=24/copyTextToClipboard=6箇所)は移さず注入する設計に修正(司令塔がユーザーに範囲を確認) (5)verify:cc 全ゲート緑'
  }),
  Object.freeze({
    version: '0.1.1526', metric: 'bundle-kb', value: 1396,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★改善方向: 前版 1397→1396KB(Track B 4-2 で開発モニタの DL 系 4 関数と listener を popup/init/devMonitorExport.js へ移設)。popup-entry は 133 行減(22207→22074)。過去最良 1360@1454 未達は 1454 以来の計器・検査ぶん(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1526', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1526', metric: 'cross-checked-claims', value: 49,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りは窓の経過に依存し実装差分と因果が無い。この版(Track B 4-2・開発モニタ DL 抽出)は司令塔が別の手段で裏取り済み: (1)devMonitorExport.js の単体テスト7ケースを happy-dom + chrome/downloads スタブで新設(snapshot 無しは DL しない/消去で storage.set/busy 中は session summary を DL しない 等) (2)initPopup ラチェットを 2510→2480 へ下げて効くことを確認 (3)KEY_CONCURRENT_CALIBRATION_RING_V1 はハードコードせず storageKeys.js から import(重複リテラルを作らない) (4)lint が移設で未使用になった 2 import(serializeCalibrationCsv/Json)を検出→削除 (5)verify:cc 全ゲート緑。★initPopup は 2477 でまだ 2000 超=指示書の完了条件(initPopup<2000)には未到達。残りは別クラスタの抽出が要る'
  }),
  Object.freeze({
    version: '0.1.1527', metric: 'bundle-kb', value: 1396,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1396 と同値(この版は /live/ 作法の逆輸入 Step1/2=既存 mirror 高速描画を initPopup 冒頭へ引き上げる並べ替え数十行のみ・新機構ゼロ・fetch なし)。バンドルはほぼ不変。過去最良 1360@1454 未達は 1454 以来の計器・検査ぶん(1508 の note 参照)。★体感速度の指標(初期ロードの blind ms)は実機測定が必要で、この台帳の bundle-kb では捉えられない=次の実機で status 速報の blind/panel-block を測る'
  }),
  Object.freeze({
    version: '0.1.1527', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1527', metric: 'cross-checked-claims', value: 50,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りは窓の経過に依存し実装差分と因果が無い。この版(逆輸入 Step1/2)は司令塔が別の手段で裏取り済み: (1)会議 Explore×3+Plan×1 で /live/ が軽い真因(非対称設計)と拡張が重い真因(refresh の Promise.all が mirror 高速描画の前でクリティカルパスを占有)を実コードで確定 (2)mirror/3カードの先行起動先関数が module-level・自前 lid フォールバック・heavy 譲りガード(countStoryUserLaneDomTiles>0)を持つことを Read で確認=stale 配信を貼らない (3)initPopup ラチェット 2480→2500・file max-lines 22075→22092 を実測で更新 (4)typecheck/lint 緑・verify:bump 全7 OK。★体感の実測は次の実機(status 速報 blind ms)で reality-checker に委任'
  }),
  Object.freeze({
    version: '0.1.1528', metric: 'bundle-kb', value: 1395,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★改善方向: 前版 1396→1395KB。この版は前版(1527)の逆輸入 Step2 を先行起動から外す修正(コメント数行の差)。過去最良 1360@1454 未達は 1454 以来の計器・検査ぶん(1508 の note 参照)'
  }),
  Object.freeze({
    version: '0.1.1528', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1528', metric: 'cross-checked-claims', value: 51,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★この版の変更とは無関係な指標(過去30日のコミット本文の語数の移動窓)。54@1507 からの目減りは窓の経過に依存し実装差分と因果が無い。この版は reality-checker の判定(PLAUSIBLE)を受けた安全側の絞り込み: 1527 の Step2(上段3カード先行)は setCountDisplay が num>_prevSupportCount で triggerCharaReaction(お祝い)を発火するため、鏡値→heavy値の差で偽お祝いが出る恐れを reality-checker が指摘(未検証点#1)。お祝い演出を持たない Step1(応援レーン鏡)だけ先行に残し、3カードは従来の tick(400ms後)に戻した。stale配信を貼らない(snap.liveId!==lid で return)は 1527 で CONFIRMED 済み。★体感の実測は次の実機(status 速報 blind ms)で確認'
  }),
  Object.freeze({
    version: '0.1.1528', metric: 'panel-block-ms', value: 405,
    source: '実機の状態速報「サイドパネル自己診断・最大タイマー遅延」 2026-09-18 05:19 (lv351411586・来場1,838・記録78件)',
    note: '★逆輸入 Step1(mirror先行起動)の実機実測。同じ速報で「更新所要(計器) 5,167ms→98ms(-98%)」「描画完了まで 2,095ms→23ms(-99%)」「中身が見えなかった合計=801ms(主因=初回シェード)」を観測=cold boot で mirror が重い await の後ろに並んでいた構造(会議で特定)を先行起動で解消できた。★過去最良 106ms@1454 とは【測定対象が違う】: 当時=バンドル分割直後の同条件計測 / 今回=逆輸入後の実配信で「中身が見えなかった合計801ms」の内の最大タイマー遅延405ms。数字を単純比較しない(archive の panel-block-ms 群と同じ注意)。★残る801msの主因は初回シェード=Step3(重いrefreshをidle後回し)で更に短縮の余地あり(未着手)'
  }),
  Object.freeze({
    version: '0.1.1529', metric: 'bundle-kb', value: 1394,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    // 過去最良 1360(@0.1.1454)より 34KB 大きいが、これは 1454→1529 の75版ぶんの機能追加が積もった
    // 結果で、本版(リロード固着の恒久根治)の変更が増やしたものではない。本版が触ったのは
    // manifest の key(バンドルに入らない)・ビルド配置・検査スクリプトのみで popup.js のコードは不変。
    note: 'key追加はmanifest側でバンドル非関与。34KB超過は前版までの累積(本版の変更由来ではない)'
  }),
  Object.freeze({
    version: '0.1.1529', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1529', metric: 'cross-checked-claims', value: 51,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    // 過去最良 54(@0.1.1507)より 3 少ないが、これは「直近30日のコミット本文」を数える窓が
    // スライドしただけ(古いコミットが窓から外れた)で、検証の質が落ちたわけではない。悪化ではない。
    note: '直近30日窓のスライドによる自然な増減。検証の質の低下ではない'
  }),
  Object.freeze({
    version: '0.1.1530', metric: 'bundle-kb', value: 1393,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '1454(過去最良)以降の機能追加の累積。本版は mirror先行描画の撤去+CSS地色追加でむしろ微減(1394→1393)'
  }),
  Object.freeze({
    version: '0.1.1530', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1530', metric: 'cross-checked-claims', value: 51,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '直近30日窓のスライドによる自然増減。検証の質の低下ではない'
  }),
  Object.freeze({
    version: '0.1.1531', metric: 'bundle-kb', value: 1392,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '1454以降の機能追加の累積。本版はCSS地色1行のみでコード非増'
  }),
  Object.freeze({
    version: '0.1.1531', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1531', metric: 'cross-checked-claims', value: 51,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '直近30日窓のスライドによる自然増減'
  }),
  Object.freeze({
    version: '0.1.1532', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'パチンコ演出削除で減少（1392→1361・約31KB減）。死んだコード除去の効果'
  }),
  Object.freeze({
    version: '0.1.1532', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1532', metric: 'cross-checked-claims', value: 51,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '直近30日窓のスライドによる自然増減'
  }),
  Object.freeze({
    version: '0.1.1533', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '死んだ内部モジュール5件を削除。popup.js 実測は増減なしだが src/lib は縮小'
  }),
  Object.freeze({
    version: '0.1.1533', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1533', metric: 'cross-checked-claims', value: 51,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '直近30日窓のスライドによる自然増減'
  }),
  Object.freeze({
    version: '0.1.1534', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '会場ちらつき修正(会場に空keepガードを配線)。popup.js は実測増減なし'
  }),
  Object.freeze({
    version: '0.1.1534', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1534', metric: 'cross-checked-claims', value: 52,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '調査で plan の前提を実コード裏取りした分が増加'
  }),
  Object.freeze({
    version: '0.1.1535', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '46時間問題の修正(終了時の経過秒を凍結)。popup.js は実測増減なし'
  }),
  Object.freeze({
    version: '0.1.1535', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1535', metric: 'cross-checked-claims', value: 53,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '純関数テストが null 取扱いのバグを1件検出=別の手段で確認できた実例'
  }),
  Object.freeze({
    version: '0.1.1536', metric: 'bundle-kb', value: 1360,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '鏡経路の lastTiled 記録を1行足す小改修(大改修は却下)。実測1361→1360'
  }),
  Object.freeze({
    version: '0.1.1536', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1536', metric: 'cross-checked-claims', value: 54,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '段5の前提(18→1)が既に1530で解決済みと git で裏取り→大改修を回避'
  }),
  Object.freeze({
    version: '0.1.1537', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1KBは意図した増加。即時プッシュrepaintのrAF束ねスケジューラ(coalescedRepaintScheduler.js)を' +
      '新規追加した分。過去最良1360(@0.1.1454)との差は v0.1.1455〜1471 の計器17版ぶん(+45KB)で既に' +
      'v0.1.1471のnoteに記録済み・そこからの純増は今回の+1KBのみ。実測1360(@0.1.1536)→1361。'
  }),
  Object.freeze({
    version: '0.1.1537', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1537', metric: 'cross-checked-claims', value: 55,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数'
  }),
  Object.freeze({
    version: '0.1.1538', metric: 'bundle-kb', value: 1360,
    source: '[auto] extension/dist/popup.js のファイルサイズ'
  }),
  Object.freeze({
    version: '0.1.1538', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1538', metric: 'cross-checked-claims', value: 54,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(55→54・古いコミットが窓外に出た分)。' +
      '今回の実装自体はcouncil-fable(会議5体+Fable設計)+毒テスト4件(build忘れ/ツールチェーン変更/' +
      'add漏れ/pre-commitブロック)を実機で確認済み・別の手段での確認は今回も行っている。'
  }),
  Object.freeze({
    version: '0.1.1539', metric: 'bundle-kb', value: 1360,
    source: '[auto] extension/dist/popup.js のファイルサイズ'
  }),
  Object.freeze({
    version: '0.1.1539', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1539', metric: 'cross-checked-claims', value: 52,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(55→52・古いコミットが窓外に出た分)。' +
      '今回はLP本文の鮮度警告(61版滞留)をLP本文更新で解消・dist-fingerprint-gateの' +
      'コンポーネント化(責務コメント追加)を実施し、いずれも実測(テスト緑・build指紋不変)で確認済み。'
  }),
  Object.freeze({
    version: '0.1.1540', metric: 'bundle-kb', value: 1360,
    source: '[auto] extension/dist/popup.js のファイルサイズ'
  }),
  Object.freeze({
    version: '0.1.1540', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1540', metric: 'cross-checked-claims', value: 52,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(55→52で横ばい)。今回はesbuildのmetafile仕様変更で' +
      '指紋が静かに空になる穴をExplore2本+Plan1本で調査し、毒テスト(実際にrawInputsを空にして' +
      'throwを実機確認)で別の手段の確認を行っている。またe2e失敗8件が今回PR由来でないことも' +
      'popup.js等のバイト単位比較(buildId/version/changelog差分を正規化除去して完全一致確認)で' +
      '別の手段による裏取りを実施済み。'
  }),
  Object.freeze({
    version: '0.1.1541', metric: 'bundle-kb', value: 1360,
    source: '[auto] extension/dist/popup.js のファイルサイズ'
  }),
  Object.freeze({
    version: '0.1.1541', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1541', metric: 'cross-checked-claims', value: 53,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(55→53で横ばい圏)。今回は段B(横断応援者ランキング)の' +
      '実装前にExplore2本+Plan1本で既存関数(indexPastUsers/buildSupporterRanking)の型・実運用経路を' +
      '実コードで裏取りし、buildSupporterRankingが自律tick経由で単一配信専用として実運用中であることを' +
      '確認した上でSupporterRow型を無改変にする設計を選んだ。統合テスト4件で実際にHTML内に' +
      'セクションが出る/出ないを別の手段(marketingChartsHtml.test.js)で確認済み。'
  }),
  Object.freeze({
    version: '0.1.1542', metric: 'bundle-kb', value: 1360,
    source: '[auto] extension/dist/popup.js のファイルサイズ'
  }),
  Object.freeze({
    version: '0.1.1542', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1542', metric: 'cross-checked-claims', value: 53,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(過去最良55→53)。今回はPR #141(イベント誤表示' +
      '根治)をmaster起点で再実装するにあたり、Exploreエージェントでbefore側diffと現行master' +
      'をバイト単位で突き合わせ該当2ケース(eventScore/eventRank)がv0.1.359以降無変更であることを' +
      '実コードで裏取りした上で、northStarLaneReason.test.js/ndgrDecode.test.jsの単体テスト' +
      '(69+88件)で実際に緑になることを別の手段(npx vitest run単体実行)で確認済み。'
  }),
  Object.freeze({
    version: '0.1.1544', metric: 'bundle-kb', value: 1360,
    source: '[auto] extension/dist/popup.js のファイルサイズ'
  }),
  Object.freeze({
    version: '0.1.1544', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1544', metric: 'cross-checked-claims', value: 53,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(過去最良55→53)。今回はmultitab-storage-' +
      'contention.spec.jsの真因(refresh()の完走待ちであるinitialRefreshDoneをスロットル判定に' +
      '使っていたため、多タブ環境でrefresh()が完走できないと恒久的にスロットル無効になる自己言及的' +
      'デッドロック)をconsole.logでの実測(refreshGenが1ms未満で50以上暴走)で特定し、修正前後で' +
      'ローカルe2e実行(300秒超timeout→41.3秒成功)・関連e2e13件・単体テスト923ファイル/11487件を' +
      '別の手段(npx playwright test単体実行・npx vitest run単体実行)で確認済み。'
  }),
  Object.freeze({
    version: '0.1.1545', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '過去最良1360(@0.1.1454)から+1KB。/live/ の応援者取りこぼし修正で' +
      'identifiedSupportersByName の集計ロジック・identicon呼び出しを追加した分の' +
      '自然増(新機能追加による正当な増加、意図した変更)。'
  }),
  Object.freeze({
    version: '0.1.1545', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1545', metric: 'cross-checked-claims', value: 53,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '過去最良55(@0.1.1537)から-2。この指標は30日ローリングウィンドウのため、' +
      '時間経過で古いコミットが自然に窓外へ出て減少する(今回のコード変更とは無関係)。'
  }),
  Object.freeze({
    version: '0.1.1546', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '過去最良1360(@0.1.1454)から+1KB(0.1.1545の1361と同水準)。live-ranking-entry.js の' +
      'load()をPromise返却に変更し初回描画を高速化した分の自然増(新機能追加による正当な増加)。'
  }),
  Object.freeze({
    version: '0.1.1546', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1546', metric: 'cross-checked-claims', value: 53,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '過去最良55(@0.1.1537)から-2。この指標は30日ローリングウィンドウのため、' +
      '時間経過で古いコミットが自然に窓外へ出て減少する(今回のコード変更とは無関係)。' +
      '今回の修正はモックサーバーでconsole.logタイムスタンプを仕込み、STALE即返し(t=83ms)→' +
      'REFRESHED反映(t=2601ms)の2段階描画を実測で確認済み(別の手段=ブラウザconsole実測)。'
  }),
  Object.freeze({
    version: '0.1.1548', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '過去最良1360(@0.1.1454)から+1KBのまま変化なし。今回はPR #262(配信詳細モーダル・' +
      'live-ranking-entry.js/liveDetailView.js)をrevertしたが、これらはWebサイト側の' +
      '/live/専用ファイルでpopup.jsには含まれないため、popup.jsのサイズには影響しない' +
      '(1361は0.1.1545の応援者取りこぼし修正由来のまま、今回の変更とは無関係)。'
  }),
  Object.freeze({
    version: '0.1.1548', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1548', metric: 'cross-checked-claims', value: 53,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '過去最良55(@0.1.1537)から-2。この指標は30日ローリングウィンドウのため、' +
      '時間経過で古いコミットが自然に窓外へ出て減少する(今回のrevertとは無関係)。'
  }),
  Object.freeze({
    version: '0.1.1549', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '過去最良1360(@0.1.1454)から+1KB。/live/ にギフト増分バッジ(+pt表示・帯色)を' +
      '追加(council-fable2回目設計)。既存の取りこぼし修正版(0.1.1545)と同水準の増加。'
  }),
  Object.freeze({
    version: '0.1.1549', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1549', metric: 'cross-checked-claims', value: 53,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '過去最良55(@0.1.1537)から-2。この指標は30日ローリングウィンドウのため、' +
      '時間経過で古いコミットが自然に窓外へ出て減少する(今回の実装とは無関係)。'
  }),
  Object.freeze({
    version: '0.1.1550', metric: 'bundle-kb', value: 1362,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '過去最良1360(@0.1.1454)から+2KB。今回の4段アイコン列の実装はWebサイト側の' +
      'live-ranking.jsに入りpopup.jsには含まれないが、更新履歴(0.1.1550)の追加分で' +
      'popup.jsが+1KB増えた。新機能の掲載に伴う正当な増加。'
  }),
  Object.freeze({
    version: '0.1.1550', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1550', metric: 'cross-checked-claims', value: 52,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '過去最良55(@0.1.1537)から-3。この指標は30日ローリングウィンドウのため、' +
      '時間経過で古いコミットが自然に窓外へ出て減少したもので、今回のコード変更とは無関係。'
  }),
  Object.freeze({
    version: '0.1.1551', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '過去最良1360(@0.1.1454)から+1KBで横ばい。/live/ 発言カードの先読みを' +
      '配信ホバーに拡大(council-fable4回目設計)。'
  }),
  Object.freeze({
    version: '0.1.1551', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1551', metric: 'cross-checked-claims', value: 52,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '過去最良55(@0.1.1537)から-3。この指標は30日ローリングウィンドウのため、' +
      '時間経過で古いコミットが自然に窓外へ出て減少する(今回の実装とは無関係)。'
  }),
  Object.freeze({
    version: '0.1.1552', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '過去最良1360(@0.1.1454)から+1KB。/live/ コメント速度演出はlive-ranking.js側だけに配線しており、popup.jsへ依存を追加していないため、丸め境界の意図しない悪化として記録する。'
  }),
  Object.freeze({
    version: '0.1.1552', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1552', metric: 'cross-checked-claims', value: 48,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '過去最良55(@0.1.1537)から-7。この指標は30日ローリングウィンドウのため、時間経過で古いコミットが自然に窓外へ出て減少したもので、今回のコード変更とは無関係。'
  }),
  Object.freeze({
    version: '0.1.1553', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '前版0.1.1552と同値(1361)＝この版では増やしていない。/live/ 脈拍レーンの応援者チップは' +
      'live-ranking.js側だけに配線しておりpopup.jsへ依存を追加していない。過去最良1360(@0.1.1454)との' +
      '差は0.1.1552のnoteに記録済みの丸め境界。'
  }),
  Object.freeze({
    version: '0.1.1553', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1553', metric: 'cross-checked-claims', value: 48,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '前版0.1.1552と同値(48)。過去最良55(@0.1.1537)との差は30日ローリングウィンドウで' +
      '古いコミットが自然に窓外へ出たもので、今回のコード変更とは無関係(0.1.1552のnoteに既出)。'
  }),
  Object.freeze({
    version: '0.1.1554', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '前版0.1.1553と同値(1361)＝この版では増やしていない。/live/ 熱いチップ(コメント増分の' +
      '強調表示)はlive-ranking.js側だけに配線しておりpopup.jsへ依存を追加していない。' +
      '過去最良1360(@0.1.1454)との差は0.1.1552のnoteに記録済みの丸め境界。'
  }),
  Object.freeze({
    version: '0.1.1554', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1554', metric: 'cross-checked-claims', value: 48,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '前版0.1.1553と同値(48)。過去最良55(@0.1.1537)との差は30日ローリングウィンドウで' +
      '古いコミットが自然に窓外へ出たもので、今回のコード変更とは無関係(0.1.1552のnoteに既出)。'
  }),
  Object.freeze({
    version: '0.1.1555', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '前版0.1.1554と同値(1361)＝この版では増やしていない。/live/ 脈拍レーンの初動修正' +
      '(fallbackRate)はlive-ranking.js側だけに配線しておりpopup.jsへ依存を追加していない。' +
      '過去最良1360(@0.1.1454)との差は0.1.1552のnoteに記録済みの丸め境界。'
  }),
  Object.freeze({
    version: '0.1.1555', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1555', metric: 'cross-checked-claims', value: 48,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '前版0.1.1554と同値(48)。過去最良55(@0.1.1537)との差は30日ローリングウィンドウで' +
      '古いコミットが自然に窓外へ出たもので、今回のコード変更とは無関係(0.1.1552のnoteに既出)。'
  }),
  Object.freeze({
    version: '0.1.1556', metric: 'bundle-kb', value: 1361,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '前版0.1.1555と同値(1361)＝この版では増やしていない。/live/ の Kick セクションは' +
      'live-ranking.js と api/ 側だけに配線しておりpopup.jsへ依存を追加していない。' +
      '過去最良1360(@0.1.1454)との差は0.1.1552のnoteに記録済みの丸め境界。'
  }),
  Object.freeze({
    version: '0.1.1556', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1556', metric: 'cross-checked-claims', value: 48,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '前版0.1.1555と同値(48)。過去最良55(@0.1.1537)との差は30日ローリングウィンドウで' +
      '古いコミットが自然に窓外へ出たもので、今回のコード変更とは無関係(0.1.1552のnoteに既出)。'
  }),
  Object.freeze({
    version: '0.1.1560', metric: 'bundle-kb', value: 1364,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+3KB(1361@0.1.1556→1364)は意図した増加。v0.1.1557〜1560 のタイムシフト3バグ修正で popup が読む共有 lib に' +
      '匿名判定の hashed 形(nicoAnonymousDisplay.js: 正規表現+設計コメント)と a: 直書き4箇所の正本寄せ(各 import 1 行)が増えた分。' +
      '過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537 の note に記録済み。計器は足していない(判定は lib・配線は content/page-intercept)。'
  }),
  Object.freeze({
    version: '0.1.1560', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1560', metric: 'cross-checked-claims', value: 36,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(48@0.1.1556→36・9月上旬の計器集中期のコミットが窓外に出た分)。' +
      '今回(v0.1.1557〜1560)は devtools Chrome でタイムシフト lv342383970 を実際に開いて NDGR の view 2本・backward 0byte・' +
      '匿名IDの a: 無しを実測してから直し、各版で変異テスト(ロジックを壊して赤→復元で緑)も行った。別の手段での確認は今回も行っている。'
  }),
  Object.freeze({
    version: '0.1.1561', metric: 'bundle-kb', value: 1365,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1KB(1364@0.1.1560→1365)は更新履歴1版ぶん(直近20版は popup バンドルに同梱される仕様)。' +
      'サイドパネルの覆い(v0.1.1561)は sidepanel.html/sidepanel.js 側の変更で popup.js には入っていない。' +
      '過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1561', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1561', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(55@0.1.1537→37。v0.1.1560 の note と同じ理由)。' +
      '今回は devtools Chrome で sidepanel.html を 5 回測り、opacity:0 の iframe が見せた後まで描画されない事実と、' +
      '覆い方式で黒の窓が 0 になることを first-paint の時刻で確かめた。別の手段での確認は今回も行っている。'
  }),
  Object.freeze({
    version: '0.1.1562', metric: 'bundle-kb', value: 1371,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+6KB(1365@0.1.1561→1371)は意図した増加。応援レーンのタイル3行目(🎁📣💬)の合成 laneTileStats.js・' +
      '鏡の stats 往復・レンダラの属性同期・更新履歴1版ぶんが popup に入った(判定は lib・DOM要素は+0)。' +
      '計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1562', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1562', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(37@0.1.1561→19。9月中旬のコミットが窓外に出た分で、v0.1.1560 の note と同じ理由)。' +
      '今回の変更で確認の手を抜いたわけではない(変異テスト6件で赤を確認し復元した)。'
  }),
  Object.freeze({
    version: '0.1.1563', metric: 'bundle-kb', value: 1372,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1372KB 台(前版 1371KB から微増)は意図した増加。段見出しに人数を出す配線(storyUserLaneGuideHtml の count 引数とレンダラの受け渡し)。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1563', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1563', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1564', metric: 'bundle-kb', value: 1372,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1372KB 台(前版 1372KB から微増)は意図した増加。CSS 1行(識別絵の点線枠)は dist に影響しないはずで、更新履歴1版ぶんの増加。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1564', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1564', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1565', metric: 'bundle-kb', value: 1377,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1377KB 台(前版 1372KB から微増)は意図した増加。ギフト増分(標本間差分)の合成・鏡の pulse 往復・レンダラの属性同期とCSS。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1565', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1565', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1566', metric: 'bundle-kb', value: 1380,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1380KB 台(前版 1372KB から微増)は意図した増加。熱い人(laneHeatTracker・commentDeltaTier の葉モジュール化)と pulse の heat 往復。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1566', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1566', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1567', metric: 'bundle-kb', value: 1382,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1382KB 台(前版 1372KB から微増)は意図した増加。公式コメント速度(officialCommentRate.js)とチップ配線。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1567', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1567', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1568', metric: 'bundle-kb', value: 1382,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1382KB 台(前版 1372KB から微増)は意図した増加。更新追従の照合キー確認(数行)と更新履歴1版ぶん。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1568', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1568', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1569', metric: 'bundle-kb', value: 1382,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1382KB 台(前版 1372KB から微増)は意図した増加。別窓CSSの追加(dist は更新履歴1版ぶんのみ)。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1569', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1569', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1570', metric: 'bundle-kb', value: 1383,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1383KB 台(前版 1372KB から微増)は意図した増加。テスト追加のみ(dist は更新履歴1版ぶん)。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1570', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1570', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1571', metric: 'bundle-kb', value: 1383,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1383KB 台(前版 1372KB から微増)は意図した増加。テスト追加のみ(dist は更新履歴1版ぶん)。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1571', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1571', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1572', metric: 'bundle-kb', value: 1383,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1383KB 台(前版 1372KB から微増)は意図した増加。skipStoryUserLanePaint(入口1本化・理由別カウンタ)と更新履歴1版ぶん。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1572', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1572', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1573', metric: 'bundle-kb', value: 1384,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1384KB 台(前版 1372KB から微増)は意図した増加。公式コメ速度の逆行3回リセット(数行)と更新履歴1版ぶん。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1573', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1573', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1574', metric: 'bundle-kb', value: 1384,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1384KB 台(前版 1372KB から微増)は意図した増加。熱い人の測り直し閾値(数行)と更新履歴1版ぶん。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1574', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1574', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1575', metric: 'bundle-kb', value: 1384,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1384KB 台(前版 1372KB から微増)は意図した増加。別窓の鏡 sig に contentHash を足す(1行)と更新履歴1版ぶん。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1575', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1575', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1576', metric: 'bundle-kb', value: 1385,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1385KB 台(前版 1372KB から微増)は意図した増加。別窓CSS追加のみ(dist は更新履歴1版ぶん)。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1576', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1576', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1577', metric: 'bundle-kb', value: 1385,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1385KB 台(前版 1372KB から微増)は意図した増加。公式コメ速度の鮮度(数行)と更新履歴1版ぶん。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1577', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1577', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1578', metric: 'bundle-kb', value: 1385,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1385KB 台は前版(1385KB)と同じ水準。今回は CSS の規則の書き換えと更新履歴1版ぶんだけ(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1578', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1578', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577 の note と同じ理由)。今回は変異テスト2件で赤を確認して復元し、devtools の実ブラウザで layout-shift を修正前10回→修正後0回と別の手段でも確かめている。'
  }),
  Object.freeze({
    version: '0.1.1579', metric: 'bundle-kb', value: 1385,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1385KB 台は前版(1385KB)と同じ水準。今回は案内帯を『同じ内容なら書かない』ヘルパー(十数行)と更新履歴1版ぶんだけ(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1579', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1579', metric: 'cross-checked-claims', value: 19,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577/1578 の note と同じ理由)。今回は変異テスト3件で赤を確認して復元し、devtools の実ブラウザで会場の見出し系ノードの追加を更新10回あたり 100〜110個→0個と別の手段でも確かめている。'
  }),
  Object.freeze({
    version: '0.1.1580', metric: 'bundle-kb', value: 1389,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+4KB(前版 1385KB → 1389KB)は意図した増加: 拡張プロセスの忙しさ台帳(文書別・純関数と起動処理と状態速報の文言)と更新履歴1版ぶん(直近20版は popup バンドルに同梱される仕様)。★この版は計器を足す版(文書別の忙しさ台帳)。次の v0.1.1581 は必ず【削る】版にする(計器だけの版を連続で出さない契約・docs/handoff/ext-process-busy-census-DESIGN.md §E)。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1580', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1580', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1579 の note と同じ理由)。今回は変異テスト4件で赤を確認して復元し、測定用 Chrome の実ブラウザ(拡張の文書7つを同時に開く)で、各文書の報告→SW の台帳→状態速報の文言まで通ることを別の手段でも確かめている。'
  }),
  Object.freeze({
    version: '0.1.1581', metric: 'bundle-kb', value: 1390,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1KB(前版 1389KB → 1390KB)は意図した増加: 鏡の書き込み抑制ゲート(純関数・署名と60秒の鮮度床)と更新履歴1版ぶん(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1581', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1581', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1579 の note と同じ理由)。今回は変異テスト5件(鮮度床・時刻を署名に含める・署名をcontentHashだけにする・popupがゲートを渡さない・最終コードでの時刻除外)で赤を確認して復元し、実行して数える形のテスト(同じ鏡を100回publishして書き込み1回)でも別の手段で確かめている。'
  }),
  Object.freeze({
    version: '0.1.1582', metric: 'bundle-kb', value: 1391,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1KB(前版 1390KB → 1391KB)は更新履歴1版ぶん(直近20版は popup バンドルに同梱される仕様)。コードの変更は status の既定オフ2行だけで、バンドルを太らせる追加は無い。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1582', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1582', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1581 の note と同じ理由)。今回の根拠は実機の二分探索(status を閉じると拡張プロセスのCPUが約半分・メモリ1,229→570MB、視聴ページも閉じると0.2%)で、プロセス別CPUとタスクマネージャーの両方で確かめた。'
  }),
  Object.freeze({
    version: '0.1.1583', metric: 'bundle-kb', value: 1392,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1KB(前版 1391KB → 1392KB)は意図した増加: 視聴ページの popup を隠れている間は止めるための判定部品(panelActivity.js・約90行)と更新履歴1版ぶん。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1583', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1583', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1582 の note と同じ理由)。今回の根拠は実機の測定(視聴ページを閉じると拡張プロセスのCPUが消える・メインスレッド1本が約94%)と、変異テスト3種(content が通知しない・3秒refreshが生の document.hidden に戻る・既定を隠れている側にする)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1584', metric: 'bundle-kb', value: 1394,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+2KB(前版 1392KB → 1394KB)は意図した増加: ギフト列を公式のギフト貢献度で補う純関数(giftLaneOfficialFill.js・約70行)と配線、更新履歴1版ぶん。広告列の変換(adLanePicksFromRooms)を再利用しており新しい取得処理は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1584', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1584', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1583 の note と同じ理由)。今回の根拠は実機の画面(会場のギフト列が「該当者がいません」)と公式API(/api/live-ranking にギフト貢献者3人)の突き合わせ、変異テスト3種(公式を足さない・kokenを読まない・同じIDを重ねる)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1585', metric: 'bundle-kb', value: 1393,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1394KB → 1393KB(-1KB・更新履歴の入れ替わり)。今回はコード側の増加はほぼ無し(content 側の判定の純関数 timelineMirrorWriteGate.js は popup バンドルに入らない)。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1585', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1585', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1584 の note と同じ理由)。今回の根拠は実機の census(35分で各拡張画面に届いた通知の内訳: タイムライン鏡が約1,670回・242MB)と、変異テスト3種(ゲート素通し・再試行タイマー無効・常に書く)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1586', metric: 'bundle-kb', value: 1394,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1393KB → 1394KB(+1KB): 鏡のまとめ書きの部品に『変わっていない鏡を書かない』判定(約15行)と、更新履歴1版ぶん。署名は既存の laneMirrorWriteSignature を再利用しており新しい仕組みは足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1586', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1586', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1585 の note と同じ理由)。今回の根拠は実機 census(35分で各画面に届く通知)と、測定用ブラウザでの古い版(v0.1.1577)と新しい版(v0.1.1585)の保存量の並べ比較(旧v1鏡57回・タイムライン鏡83回が減っていない=まとめ書き経路が残っていた)、変異テスト3種(床を0・差分判定を無効・空でも書く)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1587', metric: 'bundle-kb', value: 1395,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1394KB → 1395KB(+1KB): 数字カードの要求を間引く純関数(panelMetricsRequestPolicy.js・約30行)の popup への取り込みと、更新履歴1版ぶん。判定を popup-entry.js に直接書かず lib に出している。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1587', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1587', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1586 の note と同じ理由)。今回の根拠は実機 census(panel_summary が35分で各画面に約7,200回・51分で約7,700回=閉ループが続いている)と、コードの閉ループの確認(popup の要求→content の強制書込→onChanged→再描画)、変異テスト4種(content を強制書込に戻す・popup がポリシーを通さない・ポリシーが常に true・記録経路に1文字足す)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1588', metric: 'bundle-kb', value: 1396,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1395KB → 1396KB(+1KB): 取り込みログの tail 規則(約12行)と更新履歴1版ぶん。popup は parseCommentIngestLog を読むだけで、間引きの本体は content 側の lib。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1588', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1588', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1587 の note と同じ理由)。今回の根拠は実機 census(ingest_log が新しい画面で1分あたり約42回・58KB)と、コードの確認(source:tail が有効 source に無く unknown に丸められ規則に当たらない)、変異テスト4種(tail の規則を消す・tail を有効 source から外す・常に追記・間隔を無限)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1589', metric: 'bundle-kb', value: 1397,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1396KB → 1397KB(+1KB): 会場の鏡の採用判定(約15行)と更新履歴1版ぶん。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1589', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1589', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1587 の note と同じ理由)。今回の根拠は実機の速報(20:39 に会場の りんく0/ギフト0/広告0/こん太5/たぬ姉72 = 代替経路の形、同時刻の鏡は りんく14/ギフト5/広告5)と、コードの確認(onChanged が旧グローバルキーの別配信の鏡を採用していた)、変異テスト2種(採用判定を外す・常に採用)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1590', metric: 'bundle-kb', value: 1398,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1397KB → 1398KB(+1KB): 配信別ハイライト台帳の読み書き(約40行・純関数)と更新履歴1版ぶん。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1590', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1590', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1587 の note と同じ理由)。今回の根拠は、コードの確認(appendHighlight が別配信だと台帳を空にする: highlightLedger.js の rows 置換)と、変異テスト5種(書き手が plan を捨てる・読み手の選別を外す・掃除の呼び出しを消す・別配信の台帳を返す・現配信を保護しない)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1591', metric: 'bundle-kb', value: 1398,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1398KB → 1398KB(±0): 公開先の照合(約50行・純関数)は live-view 側の別バンドルで、popup は変わらず。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1591', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1591', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1587 の note と同じ理由)。今回の根拠は、コードの確認(live-view-entry.js の公開ボタンが全配信共通の KEY_LIVEVIEW_PUBLISH_PAYLOAD をページの ?lv= と照合せずに POST していた)と、変異テスト4種(送信前のガードを消す・初回 read の描画ガードを外す・常に ok・ページ lv 不明で必ず止める)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1592', metric: 'bundle-kb', value: 1399,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1398KB → 1399KB(+1KB): 配信別の鏡の読み取り選択(約30行・純関数)と更新履歴1版ぶん。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1592', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1592', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1587 の note と同じ理由)。今回の根拠は、コードの確認(受け身popupと通常popup代替読み込みが共通キー nls_lane_mirror_v1 しか読まず、2配信記録中は別配信が最後に書くと自配信の鏡が消える)と、変異テスト4種(受け身が共通だけ読む・代替読み込みが共通だけ読む・配信別キーの通知で描き直さない・pick が共通を先に選ぶ)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1593', metric: 'bundle-kb', value: 1399,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1399KB → 1399KB(±0): 索引化(約12行)と更新履歴1版ぶん。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1593', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1593', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1587 の note と同じ理由)。今回の根拠は、CPU プロファイルによる前後比較(同じ配信・同じ手順で、修正前は10秒の窓のうち暇が0.15秒/bestNicknameFromEntries が自分の時間 20.1秒、修正後は暇 8.1秒)と、ランダム1500ケースでの旧実装との出力同一性テスト、変異テスト4種(キーのtrimを外す・並べ替えを逆にする・束ねる順序を崩す・総当たりに戻す)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1594', metric: 'bundle-kb', value: 1399,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1399KB → 1399KB(±0): canvas の書き出し関数(約15行)と更新履歴1版ぶん。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1594', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1594', metric: 'cross-checked-claims', value: 20,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1587 の note と同じ理由)。今回の根拠は、CPU プロファイルの前後比較(同じ配信・同じ手順・続けて2回: 起動の主スレッド総時間 9.8〜11.3秒 → 6.5〜6.7秒、toDataURL 3.1〜3.8秒が消えた)と、振る舞いテスト(toBlob を使う・null や非対応では toDataURL に戻る)、変異テスト4種(toBlob を使わない・null のフォールバックを外す・直書きに戻す・createObjectURL の有無を見ない)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1595', metric: 'bundle-kb', value: 1399,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1399KB → 1399KB(±0): 設定スイッチ(約10行)と更新履歴1版ぶん。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1595', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1595', metric: 'cross-checked-claims', value: 22,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562/1577〜1587 の note と同じ理由)。今回の根拠は、ユーザー要望(浮かぶだけ)とコードの確認(キャラライブの吹き出し=.nlcl-chara__bubble と考え中の…=.nlcl-chara__think が会場の内容に被る)と、振る舞いテスト5件+配線2件、変異テスト5種(相槌・考え中・返事のガードを外す・既定を false にする・会場が talk:false を渡さない)で赤を確認して復元した別の手段。'
  }),
  Object.freeze({
    version: '0.1.1596', metric: 'bundle-kb', value: 1401,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★+1401KB 台(前版 1399KB から微増)は意図した増加。鏡を書く直前に保存済みの鏡を確かめて譲る処理(約25行)と書き手ID。' +
      '更新履歴1版ぶんも含む(直近20版は popup バンドルに同梱される仕様)。計器は足していない。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1596', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1596', metric: 'cross-checked-claims', value: 22,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1597', metric: 'bundle-kb', value: 1401,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1401KB → 1401KB(±0): 会場(venueBar.js)側の変更で popup バンドルは更新履歴1版ぶんのみ。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1597', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1597', metric: 'cross-checked-claims', value: 22,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★前版と同値(±0)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1598', metric: 'bundle-kb', value: 1401,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1401KB → 1401KB(±0): CSS の4行(キャラの hidden)と更新履歴1版ぶん。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1598', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1598', metric: 'cross-checked-claims', value: 22,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★前版と同値(±0)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1599', metric: 'bundle-kb', value: 1401,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1401KB → 1401KB(±0): 判定関数(約25行)と更新履歴1版ぶん。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1599', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1599', metric: 'cross-checked-claims', value: 22,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★前版と同値(±0)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1600', metric: 'bundle-kb', value: 1401,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1401KB → 1401KB(±0): 画像URLの作り方を blob から data: 文字列へ(同程度の行数)と更新履歴1版ぶん。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1600', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1600', metric: 'cross-checked-claims', value: 22,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★前版と同値(±0)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1601', metric: 'bundle-kb', value: 1401,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1401KB → 1401KB(±0): 会場(venueBar.js)側の診断と鏡の引き継ぎ(popup バンドルは更新履歴1版ぶんのみ)。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1601', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1601', metric: 'cross-checked-claims', value: 22,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★前版と同値(±0)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1602', metric: 'bundle-kb', value: 1400,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1401KB → 1400KB(-1KB): 診断ページの通知リスナー呼び出しを外した(popup バンドルは更新履歴の入れ替わりで微減)。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1602', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1602', metric: 'cross-checked-claims', value: 22,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★前版と同値(±0)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1603', metric: 'bundle-kb', value: 1400,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版と同値(±0): 追加は純関数1つと正規表現の登録のみ(診断専用キーを描き直しの引き金から外す)。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1603', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1603', metric: 'cross-checked-claims', value: 22,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★前版と同値(±0)。今回も変異テスト2種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1604', metric: 'bundle-kb', value: 1401,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版 1400KB → 1401KB(+1KB): 遅い側のキー判定(正規表現3本)とスケジューラの遅い側の分岐を足した(意図した増加)。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1604', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1604', metric: 'cross-checked-claims', value: 22,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★前版と同値(±0)。今回も変異テスト2種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1605', metric: 'bundle-kb', value: 1401,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版と同値(±0): 使い回しの小さな表(顔画像・数字の文字列)と非ASCII判定の書き換えのみ(意図した増減なし)。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1605', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1605', metric: 'cross-checked-claims', value: 23,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1606', metric: 'bundle-kb', value: 1400,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版1401KBとほぼ同値: 診断の手がかり(空のときだけ評価する関数)を足したのみ。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1606', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1606', metric: 'cross-checked-claims', value: 23,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1607', metric: 'bundle-kb', value: 1399,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版とほぼ同値: 書き込みの抑止(1変数・1判定)と focus/visibilitychange の2リスナーのみ。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1607', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1607', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テストで赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1608', metric: 'bundle-kb', value: 1399,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版とほぼ同値: 席の状態を『変わった所だけ書く』小さな部品(venueSeatDomState.js)を足して、直接書いていた行を置き換えたのみ。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1608', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1608', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト5種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1609', metric: 'bundle-kb', value: 1399,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版とほぼ同値: 席の持ち主を決める十数行・段の作り直しを促す口・診断の重複の基準(データ内の重複)を足したのみ。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1609', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1609', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト4種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1610', metric: 'bundle-kb', value: 1399,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版とほぼ同値: 会場にあった代替顔の関数を共通部品(avatarFallbackFromUrl.js)へ移し、POP も使うようにしたのみ(重複を1つに)。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1610', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1610', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト4種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1611', metric: 'bundle-kb', value: 1398,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版とほぼ同値: 会場の人数の増減を数える純関数(累計と直近の変化だけ)と配線を足したのみ(観測のみ・描画は変えない)。過去最良1360(@0.1.1454)との差分の内訳は v0.1.1471/1537/1560/1562/1584 の note に記録済み。'
  }),
  Object.freeze({
    version: '0.1.1611', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1611', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト8種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1612', metric: 'bundle-kb', value: 1398,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は会場側(venueBar)だけの変更で popup.js は触っていない(1398KB は v0.1.1611 と同値)。過去最良 1360KB との差は v0.1.1454 以降の機能追加によるもので、今回の悪化ではない。'
  }),
  Object.freeze({
    version: '0.1.1612', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1612', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト5種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1613', metric: 'bundle-kb', value: 1398,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は会場側(venueBar)の CSS だけの変更で popup.js は触っていない(値は v0.1.1612 と同じ)。過去最良 1360KB との差は v0.1.1454 以降の機能追加によるもので、今回の悪化ではない。'
  }),
  Object.freeze({
    version: '0.1.1613', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1613', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト2種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1614', metric: 'bundle-kb', value: 1398,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は popup 側の小さな純関数(userSupportGridAccent)の変更で、値は v0.1.1613 と同じ。過去最良 1360KB との差は v0.1.1454 以降の機能追加によるもので、今回の悪化ではない。'
  }),
  Object.freeze({
    version: '0.1.1614', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1614', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト3種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1615', metric: 'bundle-kb', value: 1398,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は読み上げの小さな純関数の追加だけで、popup.js の増分は数十バイト。過去最良 1360KB との差は v0.1.1454 以降の機能追加によるもので、今回の悪化ではない。'
  }),
  Object.freeze({
    version: '0.1.1615', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1615', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト5種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1616', metric: 'bundle-kb', value: 1400,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は計器(マスの中身の指紋)の追加で popup.js が少し増えた。過去最良 1360KB との差は v0.1.1454 以降の機能追加によるもので、ちらつきの原因を測るための意図した増加。'
  }),
  Object.freeze({
    version: '0.1.1616', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1616', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト6種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1617', metric: 'bundle-kb', value: 1401,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は小さな純関数の追加と配線で popup.js が数百バイト増えただけ。過去最良 1360KB との差は v0.1.1454 以降の機能追加によるもので、今回の悪化ではない。'
  }),
  Object.freeze({
    version: '0.1.1617', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1617', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト6種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1618', metric: 'bundle-kb', value: 1417,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は /live/ と同じ集計の純モジュール(liveCommentTally/liveLaneBuckets/liveRankingView)を popup へ取り込んだ分だけ増えた(影運用=比較のため)。過去最良 1360KB との差は v0.1.1454 以降の機能追加+今回の意図した取り込みで、集計器を1本にする計画(I2→I3)の一部。'
  }),
  Object.freeze({
    version: '0.1.1618', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1618', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト10種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1619', metric: 'bundle-kb', value: 1417,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は小さな純関数の追加と配線で popup.js が数百バイト増えただけ。過去最良 1360KB との差は v0.1.1454 以降の機能追加と v0.1.1618 の意図した取り込みによるもので、今回の悪化ではない。'
  }),
  Object.freeze({
    version: '0.1.1619', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1619', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト7種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1620', metric: 'bundle-kb', value: 1417,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は件数順の純モジュール(laneCountOrder)ぶんだけ。バンドルの大きさは前の版(1618 で /live/ の集計を取り込んだ分)から実質増えておらず、過去最良との差はその取り込みによるもの。'
  }),
  Object.freeze({
    version: '0.1.1620', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1620', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト4種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1621', metric: 'bundle-kb', value: 1420,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は件数順の純モジュール(laneCountOrder)ぶんだけ(りんく資格の純モジュール)。1418→1420KB の微増で、過去最良との差は 1618 で /live/ の集計を取り込んだ分。'
  }),
  Object.freeze({
    version: '0.1.1621', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1621', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト4種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1622', metric: 'bundle-kb', value: 1420,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★並びの取り直し条件の追加ぶんだけ(数行)。過去最良との差は 1618 で /live/ の集計を取り込んだ分で、この版では実質増えていない。'
  }),
  Object.freeze({
    version: '0.1.1622', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1622', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト3種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1623', metric: 'bundle-kb', value: 1421,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加はギフト/広告の応援者をりんく候補へ入れる純関数(数十行)。過去最良との差は 1618 で /live/ の集計を取り込んだ分で、この版は1KB増。'
  }),
  Object.freeze({
    version: '0.1.1623', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1623', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト4種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1624', metric: 'bundle-kb', value: 1422,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の直しは status.js 側(共有設定欄の下書き)で popup.js は変わらない。過去最良との差は 1618 で /live/ の集計を取り込んだ分+以降の小さな追加。'
  }),
  Object.freeze({
    version: '0.1.1624', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1624', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト3種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1625', metric: 'bundle-kb', value: 1422,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は status.js 側(鍵ファイルの読み込み)で popup.js は変わらない。過去最良との差は 1618 で /live/ の集計を取り込んだ分+以降の小さな追加。'
  }),
  Object.freeze({
    version: '0.1.1625', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1625', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト3種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1626', metric: 'bundle-kb', value: 1423,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は status.js 側(鍵ファイルの自動取り込み)で popup.js は変わらない。過去最良との差は 1618 で /live/ の集計を取り込んだ分+以降の小さな追加。'
  }),
  Object.freeze({
    version: '0.1.1626', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1626', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト4種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1627', metric: 'bundle-kb', value: 1423,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の直しは status.js 側(鍵ファイルの再取り込み判定)で popup.js は変わらない。過去最良との差は 1618 で /live/ の集計を取り込んだ分+以降の小さな追加。'
  }),
  Object.freeze({
    version: '0.1.1627', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1627', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト4種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1628', metric: 'bundle-kb', value: 1426,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は顔画像の合成を画面の近くに来てからにする部品(数十行)と状態速報の1行。過去最良との差は 1618 で /live/ の集計を取り込んだ分+以降の小さな追加。'
  }),
  Object.freeze({
    version: '0.1.1628', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1628', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト6種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1629', metric: 'bundle-kb', value: 1427,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は sidepanel.js と status.js 側(送信担当の起動と送信の連打止め)で popup.js は変わらない。過去最良との差は 1618 で /live/ の集計を取り込んだ分+以降の小さな追加。'
  }),
  Object.freeze({
    version: '0.1.1629', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1629', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト12種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1630', metric: 'bundle-kb', value: 1429,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は保存データの記憶(storageKeyMemo)と読み出し側の数十行。過去最良との差は 1618 で /live/ の集計を取り込んだ分+以降の小さな追加(顔画像のゲート・送信担当 ほか)。'
  }),
  Object.freeze({
    version: '0.1.1630', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1630', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562 の note と同じ理由)。今回も変異テスト14種で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1631', metric: 'bundle-kb', value: 1431,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は発言の証拠(speechEvidence.js 約180行・純関数)と、行/参加者/census への持ち回し数十行。表示は変えず、嘘の件数を測れるようにするための増分。過去最良との差の大半は 1618 以降の /live/ 取り込みなどで、今回は +2KB。'
  }),
  Object.freeze({
    version: '0.1.1631', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1631', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630 の note と同じ理由)。今回も変異テスト(鏡の speech 落とし・件数の下駄 Math.max(1)混入)で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1632', metric: 'bundle-kb', value: 1431,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加はカードの文言を発言の証拠から作る分岐(venueHoverCard.js 数十行)だけ。過去最良との差の大半は 1618 以降の /live/ 取り込みなどで、増分は小さい。'
  }),
  Object.freeze({
    version: '0.1.1632', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1632', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630・1631 の note と同じ理由)。今回も変異テスト(ゲートを false にする→10件赤)で確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1633', metric: 'bundle-kb', value: 1432,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は本文の持ち回し(mergeRecentTexts と集計/名簿の数行)だけ。過去最良との差の大半は 1618 以降の /live/ 取り込みなどで、増分は小さい。'
  }),
  Object.freeze({
    version: '0.1.1633', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1633', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1632 の note と同じ理由)。今回も変異テスト(集計の本文合流を消す・hydrate の本文読みを消す)で赤を確認して復元している。'
  }),
  Object.freeze({
    version: '0.1.1634', metric: 'bundle-kb', value: 1432,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は会場のピックアップ枠の入力(rosterSpeechRows 数十行)だけ。popup.js のサイズへの影響は小さい。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1634', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1634', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1633 の note と同じ理由)。'
  }),
  Object.freeze({
    version: '0.1.1635', metric: 'bundle-kb', value: 1432,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加はピックアップ枠の入力リング(venuePickupRing.js 約50行・venue.js 側)で、popup.js への影響は小さい。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1635', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1635', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1634 の note と同じ理由)。今回は実配信を開いた headless で枠に本文が出ることを前後比較(案内文→本物のコメント)した。'
  }),
  Object.freeze({
    version: '0.1.1636', metric: 'bundle-kb', value: 1432,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は会場のピックアップ枠の発言者表示(venuePickupSpeaker.js 約60行・venue 側)。popup.js への影響は小さい。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1636', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1636', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1635 の note と同じ理由)。今回も実配信を開いた headless で、枠にサムネ(読込成功)・ID・リンクが出ることを確認した。'
  }),
  Object.freeze({
    version: '0.1.1637', metric: 'bundle-kb', value: 1433,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は会場のキャラ層の配置CSSと定数(charaLiveStage.js 数十行・venue 側)。popup.js への影響は小さい。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1637', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1637', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1636 の note と同じ理由)。今回は実配信を開いた headless のスクリーンショットで、3人が上端・PICK UP 枠と重ならないことを確認した。'
  }),
  Object.freeze({
    version: '0.1.1638', metric: 'bundle-kb', value: 1433,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は会場のキャラ層のお祝い(charaLiveStage の CSS・charaLiveController の cheer・判定 lib)。大半は venue/content 側で popup.js への影響は小さい。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1638', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1638', metric: 'cross-checked-claims', value: 24,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1637 の note と同じ理由)。今回は実配信を開いた headless で、記録件数 97→101 の跨ぎで3人が弾み「100件!」が出て自動で消える・102 と一括流入(500)では再発火しないことを確認した。'
  }),
  Object.freeze({
    version: '0.1.1639', metric: 'bundle-kb', value: 1433,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は会場のキャラ層のお祝いの節目判定の差し替え(lib 数十行のみ)。popup.js への影響は小さい。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1639', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1639', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1638 の note と同じ理由)。今回は節目判定の単体テスト(1000件ごと・間は祝わない)で確認した。'
  }),
  Object.freeze({
    version: '0.1.1640', metric: 'bundle-kb', value: 1434,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の追加は増分を数える器(laneHeatTracker.js)の減少時の扱いと peek の追加(数十行)。popup.js への影響は小さい。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1640', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1640', metric: 'cross-checked-claims', value: 25,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1639 の note と同じ理由)。今回は暫定→確定の遷移を模擬した単体テストと、ガードを外す変異テスト(配線2件・追跡器2件が赤)で確認した。'
  }),
  Object.freeze({
    version: '0.1.1641', metric: 'bundle-kb', value: 1434,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は発言者を会場行へ足す純関数(venueSpeech.js)の数行。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1641', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1641', metric: 'cross-checked-claims', value: 26,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1640 の note と同じ理由)。今回は、既存行の項目が落ちることを再現する単体テストと、該当の1行を外す変異テスト(赤になる)で確認した。'
  }),
  Object.freeze({
    version: '0.1.1642', metric: 'bundle-kb', value: 1435,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場のクリック処理(venueBar.js 数行)とテール読みのタイムアウト。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1642', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1642', metric: 'cross-checked-claims', value: 27,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1641 の note と同じ理由)。今回は実際のニコ生配信(lv351604395)を開いたテスト環境で、通常クリックはタブが増えず発言パネルが開く・Ctrl+クリックは新規タブでパネルは開かないことを確認した。'
  }),
  Object.freeze({
    version: '0.1.1643', metric: 'bundle-kb', value: 1435,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場のクリック処理(venueBar.js 数十行)。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1643', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1643', metric: 'cross-checked-claims', value: 28,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1642 の note と同じ理由)。今回は実配信(lv351612268)を開いたテスト環境で、席なしの広告・ギフト列のクリックでも新規タブが開かず発言パネルが開く・パネルを開いたまま別のアイコンをクリックしても閉じないことを確認した。'
  }),
  Object.freeze({
    version: '0.1.1644', metric: 'bundle-kb', value: 1435,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場のCSS 1規則(venueBar.js)。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1644', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1644', metric: 'cross-checked-claims', value: 29,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1643 の note と同じ理由)。今回は実配信(lv351612268)を開いたテスト環境で、閉じた発言パネルが修正前は 562×520 で表示され続け、修正後は display:none・0×0 になることを実測で確認した。'
  }),
  Object.freeze({
    version: '0.1.1645', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場のパネル開閉(venueBar.js 数十行)。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1645', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1645', metric: 'cross-checked-claims', value: 30,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1644 の note と同じ理由)。今回は実配信(lv351612268)を開いたテスト環境で、Escが発言パネルだけを閉じ会場は残る・2回目のEscで会場が閉じる・パネルを開いたまま会場を閉じて開き直してもパネルが復活しないことを確認した。'
  }),
  Object.freeze({
    version: '0.1.1646', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場のドラッグ処理(venueBar.js 数十行)。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1646', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1646', metric: 'cross-checked-claims', value: 31,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1645 の note と同じ理由)。今回は実配信(lv351612268)を開いたテスト環境で、ドラッグして会場の外でボタンを離したあとの最初のクリックが、修正前は発言パネルが開かず、修正後は開くことを前後比較で確認した。'
  }),
  Object.freeze({
    version: '0.1.1647', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場ヘッダーのCSS 2規則(venueBar.js)。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1647', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1647', metric: 'cross-checked-claims', value: 32,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1646 の note と同じ理由)。今回は実配信(lv351612268)を表示幅 420・640・900・1280px で開いたテスト環境で、修正前は 420・640px で『✕閉じる』が画面の外(右端 841px)へ出て、修正後は全幅で画面内に収まることを前後比較で確認した。'
  }),
  Object.freeze({
    version: '0.1.1648', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場のCSS(pointer-events 4か所)とパネルの外側クリックの受け方(venueBar.js 数十行)。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1648', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1648', metric: 'cross-checked-claims', value: 33,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1647 の note と同じ理由)。今回は実配信(lv351612268)を開いたテスト環境で、会場を開いたまま映像の位置の elementFromPoint が修正前は会場配下・修正後はページ(VIDEO)を返すこと、ヘッダーボタンとタイルは会場が受けること、パネルの外をクリックするとパネルだけ閉じ会場は残ることを確認した。'
  }),
  Object.freeze({
    version: '0.1.1649', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場のCSS 1規則(venueBar.js)。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1649', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1649', metric: 'cross-checked-claims', value: 34,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1648 の note と同じ理由)。今回は実配信(lv351562946)を開いたテスト環境で、会場を開いたときのポップアップの iframe が修正前は visible・修正後は hidden、閉じると元の visible に戻ることを前後比較し、スクリーンショットでも透けが消えたことを確認した。'
  }),
  Object.freeze({
    version: '0.1.1650', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は各ページ先頭のCSS 1規則(popup.html・状態画面・別窓・コメビュ・会場)。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1650', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1650', metric: 'cross-checked-claims', value: 35,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1649 の note と同じ理由)。今回は拡張の7ページ(popup・状態・コメビュ・別窓・会場・サイドパネル)を実ブラウザで開き、hidden 属性なのに表示扱いの要素数を前後比較した(修正前: popup 20・status 12・live-view 1、修正後: 全ページ 0)。実配信でポップアップが正常に描画される(557タイル・統計カード・起動の幕は非表示)ことと、会場の Esc・クリック透過・パネルの開閉が退行しないことも確認した。'
  }),
  Object.freeze({
    version: '0.1.1651', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場のたぬ姉の列の目印クラス1つとCSS 1規則(venueBar.js)。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1651', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1651', metric: 'cross-checked-claims', value: 36,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1650 の note と同じ理由)。今回は実配信(lv351562946)を開いたテスト環境で、会場のたぬ姉の列の高さが修正前 1474px・タイルの間隔 8px/6px・26人目の幅 66px(名前つき)から、修正後 656px・4px/4px・22px(アイコンのみ)になることを前後比較で確認した。'
  }),
  Object.freeze({
    version: '0.1.1652', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場の広告段の器のクラス名1語(venueBar.js)。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1652', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1652', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1651 の note と同じ理由)。今回は実配信(lv351562946)を開いたテスト環境で、会場の広告段の器が修正前は --gift で行の幅が器より14px狭く(1144/1158)、修正後は --ad で器と同じ幅(1158/1158)になることを前後比較し、スクリーンショットでも確認した。'
  }),
  Object.freeze({
    version: '0.1.1653', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場のパネルのCSS 1規則と、パネルの外側クリックの処理(venueBar.js 数行)。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1653', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1653', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1652 の note と同じ理由)。今回は実配信(lv351562946)を表示幅×高さの5格子(420x900・640x900・1280x900・1280x720・1280x1000)で開いたテスト環境で、一覧パネルを開いた状態のヘッダー6ボタンのうち押せない数が修正前 6・6・2・2・2 から、修正後は全格子で 0 になることを前後比較し、会場の箱の最大高(432/345.6/480px)が変わらないこと、ボタンを押すたびに開閉が切り替わること(二重トグルなし)も確認した。'
  }),
  Object.freeze({
    version: '0.1.1654', metric: 'bundle-kb', value: 1438,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場の「しまう」ボタンとその状態管理(venueBar.js 数十行・CSS 2規則)。popup.js への影響はありません。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1654', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1654', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1653 の note と同じ理由)。今回は実配信(lv351562946)を表示幅×高さの9格子(420/900/1280 × 720/900/1000)で開いたテスト環境で、コメント入力欄の中心にクリックが届くかを前後比較した(修正前: 9格子のうち 900x720・900x900・1280x900・900x1000・1280x1000 の5つで会場に覆われる / 修正後: しまっている間は9格子すべてでページに届く)。戻した後の席数が同じ(206)・戻すピルが押せる・しまっている間に Esc で閉じて開き直すと通常状態から始まることも確認した。'
  }),
  Object.freeze({
    version: '0.1.1655', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は、公式ギフト貢献度の全行を控える変数1つと、その参照(popup-entry.js 数行)。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1655', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1655', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1654 の note と同じ理由)。今回は、実配信の保存データ(公式ギフト貢献度65行・あかねこ。さんは33番目=11位・10pt)で原因を確かめ、全行を渡すと11位以下にも giftPt が付く単体テストと、10位で切ると付かないことの再現(先に赤)で確認した。'
  }),
  Object.freeze({
    version: '0.1.1656', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は発言パネルのCSS(venueBar.js・数行)だけ。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1656', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1656', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1655 の note と同じ理由)。今回は実配信の前後比較(本文の幅 44px→470px・見出し3行→1行)で確認し、CSSの配線テストは元に戻すと赤くなることを確認した。'
  }),
  Object.freeze({
    version: '0.1.1657', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★前版(0.1.1656)と同じ 1439KB で、今回の変更による増加はゼロ。変更は comeview.html の CSS 2 行(min-width と overflow-x)だけで、バンドルされる JS に触れていない。過去最良との差は 1618 以降の /live/ 取り込みなど別要因。'
  }),
  Object.freeze({
    version: '0.1.1657', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1657', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(1630〜1656 の note と同じ理由)。今回は実測で確かめている: パネル幅150pxで本文が23行(1文字ずつ)になることを再現し、修正後に3行へ戻ることを同じ環境で測った。'
  }),
  Object.freeze({
    version: '0.1.1658', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は会場のEscキーの入口の判定(venueBar.js・十数行)だけ。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1658', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1658', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1657 の note と同じ理由)。今回は実配信で、変換中・入力欄・しまい中・通常の4通りのEscを送って確認した。'
  }),
  Object.freeze({
    version: '0.1.1659', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は発言パネルの表示(venueBar.js 数行+新規の小さな lib 1つ)だけ。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1659', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1659', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1658 の note と同じ理由)。今回は実配信で、ギフト・広告だけの人をクリックして、応援の一行と文言が出ることを確認した。'
  }),
  Object.freeze({
    version: '0.1.1660', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は発言パネルの表示(venueBar.js 数十行+新規の判定 lib 1つ)だけ。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1660', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1660', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1659 の note と同じ理由)。今回は実配信で、記名の人の明細と注記が出ること・IDのない人には何も出ないことを確認し、判定 lib の各ガードは外すと赤になることを変異テストで確認した。'
  }),
  Object.freeze({
    version: '0.1.1661', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は書き出しHTMLの演出を既定で無効にするスイッチ1つ(marketingChartsHtml.js)。拡張本体の描画には影響しない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1661', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1661', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1660 の note と同じ理由)。今回は生成HTMLに演出の部品が入っていないことをテストで固定し、スイッチを戻すと赤になることを変異テストで確認した。'
  }),
  Object.freeze({
    version: '0.1.1662', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更はマーケ書き出しタブの設定の読み込み数行(marketing-export-entry.js)だけ。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1662', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1662', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1661 の note と同じ理由)。今回は配線テスト3件(先に赤→緑)で、固定値に戻すと赤になることを確認した。'
  }),
  Object.freeze({
    version: '0.1.1663', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更はギフト明細の保存に公開時刻を足す数行(kokenGiftHistoryApi.js)と、発言パネルの時刻表示(lib)だけ。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1663', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1663', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1662 の note と同じ理由)。今回は実配信で、ギフトの記録に「時計の時刻(○時間前) ・ 配信○」が出ることを確認した。'
  }),
  Object.freeze({
    version: '0.1.1664', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更はギフト明細の保存に公開時刻を足す数行(kokenGiftHistoryApi.js)と、発言パネルの時刻表示(lib)だけ。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1664', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1664', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1663 の note と同じ理由)。今回は実配信で、ギフトの記録に「時計の時刻(○時間前) ・ 配信○」が出ることを確認した。'
  }),
  Object.freeze({
    version: '0.1.1665', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は発言パネルの表示と、広告ランキングの保存時に気づいた時刻を足す記録(content-entry.js 数十行+新規の判定 lib 1つ)。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1665', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1665', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1664 の note と同じ理由)。今回は実配信で、ギフトの記録が出ない人に理由、広告の人に「初めて検知」の時刻が出ることを確認した。公式の履歴 API が直近10件ほどしか返さないことは、実際に取得して確かめた。'
  }),
  Object.freeze({
    version: '0.1.1666', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は広告ランキングの帯の描画を上位10行に絞る数行(popup-entry.js)と契約テストだけ。見た目は変わらない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1666', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1666', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1665 の note と同じ理由)。今回は挙動を変えない準備の版で、取得件数を増やす次の版の前提(帯の固定・社数と合計は全行・SW と lib の値の照合)をテストで固定した。'
  }),
  Object.freeze({
    version: '0.1.1667', metric: 'bundle-kb', value: 1440,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は広告の取得件数10→100と、広告段の表示件数の上限を外す数行(background.js・lib・popup-entry.js)。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1667', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1667', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1666 の note と同じ理由)。今回は実配信で、公式の広告主25社が保存25行・広告段25人になることを確認した。広告の取得は1回あたり約5KB。'
  }),
  Object.freeze({
    version: '0.1.1668', metric: 'bundle-kb', value: 1440,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更はマーケレポートの人数の数え方と表示(marketingAggregate.js に2項目追加・marketingChartsHtml.js の表示を1つの関数に集約)。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1668', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1668', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1667 の note と同じ理由)。今回は単体テストで、ID空3件を含む5コメントが「5件/1人(ID不明3件)」になることを固定した。従来の uniqueUsers は後方互換のため残した。'
  }),
  Object.freeze({
    version: '0.1.1669', metric: 'bundle-kb', value: 1442,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は公式ギフト履歴の取得件数を10→100にする1行(background.js)と、明細の保存に公式の合計・貢献度を足し、パネルの照合を同じ単位にする部分(lib)。取得は2回→1回に減る。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1669', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1669', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1668 の note と同じ理由)。今回は実配信で、保存される行が10→84になり、明細の合計=公式の合計(4,880pt)・記名25人すべてで明細の貢献度の合計=ランキングの値になることを確認した。'
  }),
  Object.freeze({
    version: '0.1.1670', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は公式プロフィール取得の1行(必要なヘッダ)と、プロフィールの項目を増やして表示する部分(lib)、書き出し時の取得。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1670', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1670', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1669 の note と同じ理由)。今回は実際の拡張の中で、ヘッダ無しは400・ヘッダ有りは200で名前が取れること、強制取得が10分の間引きを飛ばすことを確認した。'
  }),
  Object.freeze({
    version: '0.1.1671', metric: 'bundle-kb', value: 1444,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は自己紹介の本文をリンク付きHTMLにする小さな関数1つ(broadcasterProfileCard.js)だけ。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1671', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1671', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1670 の note と同じ理由)。今回は単体テストで、URLがリンクになること・末尾の句読点が含まれないこと・javascript: がリンクにならないこと・本文がエスケープされたままであることを固定した。'
  }),
  Object.freeze({
    version: '0.1.1672', metric: 'bundle-kb', value: 1445,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更はレポートに新しい章を追加するだけ(新規の計算ファイル1つ+marketingChartsHtml.js に章の表示を追加)。既存の章は消さず、並べ替えもしない。書き出し側は無変更。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1672', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1672', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1671 の note と同じ理由)。今回は単体テスト19件+HTML統合4件で、前後5分の件数・連鎖の束ね・窓不足の除外・n<5で中央値を出さない・軸が合わないときの抑止・共有用に伏せる、を固定し、各ガードを壊すと赤になることを変異テストで確認した。'
  }),
  Object.freeze({
    version: '0.1.1673', metric: 'bundle-kb', value: 1445,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更はレポートに章を1つ追加する表示(marketingChartsHtml.js)と、書き出し時に記録を1キー読んで渡す1行(marketing-export-entry.js)。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1673', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1673', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1672 の note と同じ理由)。今回は単体テスト5件+配線テスト2件で、章の出し分け・位置・注記・未検知の表示・伏せ字・名前が分からない人をIDで出す、を固定し、伏せ字を壊すと赤になることを確認した。'
  }),
  Object.freeze({
    version: '0.1.1674', metric: 'bundle-kb', value: 1445,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は extension/background.js のサイドパネル事前用意(既存ページ一括・タブ切替・押下時の差し替え省略)のみ。画面描画の経路は触っていない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1674', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1674', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1673 の note と同じ理由)。今回は配線テスト3件を足し、押下時の条件や起動時の呼び出しを消すと赤になることを確認した。'
  }),
  Object.freeze({
    version: '0.1.1675', metric: 'bundle-kb', value: 1445,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は計測のみ(background.js に押した時刻の控え・sidepanel-entry.js に区間計算・状態速報に1行)。描画の経路は触っていない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1675', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1675', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1674 の note と同じ理由)。今回は単体14件+配線9件で、区間の捏造禁止(押した時刻が無い・古いときは出さない)・履歴を読み終えるまで書かない・SW→パネル→速報の接続を固定し、接続を切ると赤になることを確認した。ヘッドレスで SW→パネル→履歴→行まで通ることを確認。'
  }),
  Object.freeze({
    version: '0.1.1676', metric: 'bundle-kb', value: 1445,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は計測のみ(sidepanel-entry.js に文書内の値の採取・lib に全回分の集計と行)。描画の経路は触っていない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1676', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1676', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1675 の note と同じ理由)。今回は単体27件で、押した時刻が無い回の数字・壊れた組の除外・押下なし回数の表示を固定。実機の保存データを一時プロファイルに写したヘッドレスで、記録から速報の行まで通ることを確認した。'
  }),
  Object.freeze({
    version: '0.1.1677', metric: 'bundle-kb', value: 1445,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は src/shared/avatar/avatarUrlGuard.js の avatarCompareKey に結果の記憶(上限3000件・超えたら全部捨てて作り直す)を足しただけ。結果は変わらない純粋関数。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1677', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1677', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1676 の note と同じ理由)。今回は単体5件(同じ文字列で URL を作り直さない・答えが同じ・失敗の記憶・空は記憶しない・大量でも壊れない)。実機の保存データを一時プロファイルに写した V8 CPU プロファイルで、avatarCompareKey の自己時間 1829ms→上位から消滅・全体 11.4秒→6.7秒を確認(別走行どうしで揺れはある)。'
  }),
  Object.freeze({
    version: '0.1.1678', metric: 'bundle-kb', value: 1447,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は、テールを表示用の行へ足す6か所を mergeTailRowsIntoDisplay(新規・純関数)に差し替えただけ。キーと統合は既存の storedCommentDedupeKey / mergeStoredCommentDedupeVariants を再利用。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1678', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1678', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1677 の note と同じ理由)。今回は単体11件+配線3件で、二重の再現(25+25→25)・投稿者情報の引き継ぎ・大きい配信でも定数オーダー・連投の保持を固定。ローカル e2e(snapshot-fetch-hang-resilient)は先読みを外した構成で修正前 2/2 赤→修正後 3/3 緑。'
  }),
  Object.freeze({
    version: '0.1.1679', metric: 'bundle-kb', value: 1447,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は popup-entry.js の起動処理から先読みの1行を外しただけ(書き出し側の呼び出しは残す)。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1679', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1679', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1678 の note と同じ理由)。今回は配線テスト2件(起動時に呼ばない・書き出しでは呼ぶ)。実機データの V8 CPU プロファイルで arrayBufferToBase64 が上位から消え、GC 時間も 670ms→442ms(別走行どうしで揺れあり)。先読み削除で露見した記録件数の二重(v1678 で修正)を直したうえで、ローカル e2e(snapshot-fetch-hang-resilient)が緑であることを確認した。'
  }),
  Object.freeze({
    version: '0.1.1680', metric: 'bundle-kb', value: 1451,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は、新規 avatarFaceStore.js(IndexedDB の永続キャッシュ)と avatarPartsComposer.js の2か所(作る前に読む・作ったら書く)のみ。顔の見た目(最終的な画像)は変えていない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1680', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1680', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1679 の note と同じ理由)。今回は単体9件+配線4件(書いた顔を読める・無ければ空・読みをまとめる・PNG以外は書かない・版でキーを分ける・上限で古いものを捨てる・IDB無し/故障でも落ちない)。実機データの V8 CPU プロファイルで、拡張プロセスの忙しい区間の合計(関数 blob=canvas.toBlob)が 3回の開閉で 8,025→4,658 サンプルに減り、3回目は ≥150ms の忙しい区間が無くなった。'
  }),
  Object.freeze({
    version: '0.1.1681', metric: 'bundle-kb', value: 1455,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は、顔の合成を専用 Worker へ移した(新規 avatarFaceRender・avatarFaceWorkerClient・avatar-face-worker-entry・avatarPartAnchors と、avatarPartsComposer の経路追加)。画像の中身は変えていない(60/60 完全一致)。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1681', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1681', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1680 の note と同じ理由)。今回は単体 render8+client12+配線9。実機データを写したヘッドレスで、永続キャッシュを空にした冷スタートの3回の開閉の主スレッドの忙しい区間(60ms超)が 30 件超→5 件に、合成由来(blob)のサンプルが 4,000〜8,000→0 になった。残る最大は自己診断の elementFromPoint(初回約0.5秒)。'
  }),
  Object.freeze({
    version: '0.1.1682', metric: 'bundle-kb', value: 1455,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は診断だけ(新規 avatarComposeDiagLine と、composer が統計を session へ書く・サイドパネルの自己診断が読む・速報に1行)。描画の経路は触っていない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1682', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1682', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1681 の note と同じ理由)。今回は単体5件+配線4件。ヘッドレス(実機データを写した一時プロファイル)で、サイドパネルの中の画面から Worker が起動し(ready・成功53・失敗0)、速報の1行まで届くことを確認した。'
  }),
  Object.freeze({
    version: '0.1.1683', metric: 'bundle-kb', value: 1456,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は、composer に isAnonymousFaceShown を足し、popup-entry の成長アイコン更新(applyStoryGrowthIconAttributes)で、同じ人の顔が出ているマスを上書きしないようにしただけ。見える絵は変えていない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1683', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1683', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1682 の note と同じ理由)。今回は単体4件+配線3件。実機データを写したヘッドレスで、img.src の代入を呼び出し元別に数えた: 12秒で SVG 約3,200+PNG 約3,700 回(75タイルなのに)→ SVG 約425+PNG 約250〜500 回。'
  }),
  Object.freeze({
    version: '0.1.1684', metric: 'bundle-kb', value: 1456,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は、sidepanel-entry.js の早い自己診断の測定を、最初の描画のあとまで待たせる(新規 firstPaintGate.js・関門は600msで必ず開く)。測定の内容は変えていない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1684', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1684', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1683 の note と同じ理由)。今回は単体5件。ヘッドレスで『先に別のパネルを開いて起動の最中にしておく』競合を再現した A/B(各7回×2周)で、最初の描画の中央値が約414ms→約244ms(平均 約413→約285)。競合なしの A/B では差が出ない(約72ms同士)。既存の挙動テスト1件は、node に paint が無いため『描画は起動直後に済んだ』ブラウザを模すスタブを足した。'
  }),
  Object.freeze({
    version: '0.1.1685', metric: 'bundle-kb', value: 1456,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は、personTileDom が、メモリに合成済みの顔があれば最初の src にする(composer に cachedAnonymousFace を足し、popup のレーン描画3経路で注入)・upgrade が同じ値を再代入しない、だけ。会場は注入しない。見える絵は変えていない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1685', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1685', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1684 の note と同じ理由)。今回は単体5+配線3。実機データを写したヘッドレスで、開いて12秒の PNG の代入が約250〜500→約180〜410回に減り、タイルの再描画時の SVG→PNG の差し替えがなくなったことを確認(初回の描画は顔が無いので SVG から始まる)。'
  }),
  Object.freeze({
    version: '0.1.1686', metric: 'bundle-kb', value: 1463,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は計器のみ(新規 flickerMeter・flickerMeterBoot・bootTimeline・bootTimelineBoot。popup が MutationObserver/longtask で数え session へ・サイドパネルが読んで速報に1行ずつ。watchPopupLoadDiagnostics に段階の年表を追加)。描画は触っていない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1686', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1686', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1685 の note と同じ理由)。今回は単体 meter13+boot7+timeline15 と配線 6+5。ヘッドレスで、計器が本物のちらつきを検出できることを確認した(v1683 の修正を外した昔の挙動で .nl-story-growth-icon の往復 7,506 回/12秒、今の版で 2 回・計器自身は約45ms)。年表は親の最初の描画+48ms・子のDOM構築+327ms・子の長い処理8件が行に出る。'
  }),
  Object.freeze({
    version: '0.1.1687', metric: 'bundle-kb', value: 1465,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は popup の描き直し(refresh)の入り口に合流器を1つ足しただけ(新規 src/lib/refreshCoalescer.js・popup-entry.js は 2 行追加 1 行置換)。描画の中身は触っていない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1687', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1687', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1686 の note と同じ理由)。今回は単体 6+配線 2。ヘッドレスの交互比較(各5回): 起動後6秒の storage 読み出し 607→551(中央値)・長い処理合計 576→459ms。ばらつき40%超のため、強い効果とは言わない。'
  }),
  Object.freeze({
    version: '0.1.1688', metric: 'bundle-kb', value: 1466,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は応援マスの属性反映(applyStoryGrowthIconAttributes)とギフト履歴の描画の「同値なら書かない」化のみ(新規 src/lib/domWriteIfChanged.js・popup-entry.js は置換中心)。見た目は変えていない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1688', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1688', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1687 の note と同じ理由)。今回は単体8+配線6。ヘッドレスの交互比較(各5回): 起動後6秒の属性書き込み 10,912→4,972(中央値)。長い処理合計は 950→829ms だがばらつき40%超で、強い効果とは言わない。'
  }),
  Object.freeze({
    version: '0.1.1689', metric: 'bundle-kb', value: 1467,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は応援マスの増加時の経路(syncStoryGrowth)だけ(新規 src/lib/storyGrowthAppendPlan.js・popup-entry.js は関数1つ追加+分岐1つ)。rebuildStoryGrowth・縮小・切り替えは触らない。過去最良との差の大半は 1618 以降の /live/ 取り込みなど。'
  }),
  Object.freeze({
    version: '0.1.1689', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1689', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1688 の note と同じ理由)。今回は単体6+配線4。ヘッドレスでは作り直しの減少を再現できず(全配信が360個で頭打ち)、実機のちらつき計で確認する。'
  }),
  Object.freeze({
    version: '0.1.1690', metric: 'bundle-kb', value: 1467,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は状態速報に行を足すだけ(新規 src/lib/blackCurtainLedger.js・sidepanel-entry.js と aiShareFullText.js に数行)。描画・保存の経路は触らない。直前の v0.1.1687〜1689 は削る版で、この版は計器の版(2連続ではない)。'
  }),
  Object.freeze({
    version: '0.1.1690', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1690', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1689 の note と同じ理由)。今回は単体11+配線2。'
  }),
  Object.freeze({
    version: '0.1.1691', metric: 'bundle-kb', value: 1469,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は顔の先読み(新規は getRecent と hydrateRecentAnonymousFaces のみ・avatarFaceStore のスキーマは不変)と、応援マスでメモリの顔を最初から使うこと。直前の v0.1.1690 は計器の版で、この版は削る版。'
  }),
  Object.freeze({
    version: '0.1.1691', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1691', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1690 の note と同じ理由)。今回は単体10+配線3。効果は実機で確認(ヘッドレス交互比較は環境の不調で未実施)。'
  }),
  Object.freeze({
    version: '0.1.1692', metric: 'bundle-kb', value: 1470,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は応援レーンの段の貼り替え(fillLaneTier)だけ(人ごとの鍵を取り出して控え、同じ鍵のタイルを使い回す)。段全体の diff-skip の鍵(storyLaneTierBodyKey)の出力は不変・会場の経路も不変。直前の v0.1.1691 は削る版、この版も削る版。'
  }),
  Object.freeze({
    version: '0.1.1692', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1692', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1691 の note と同じ理由)。今回は単体 +7(renderStoryUserLaneDom)。ヘッドレスの交互比較(各5回)は作り直しが起きず差が出ない(実機で確認)。'
  }),
  Object.freeze({
    version: '0.1.1693', metric: 'bundle-kb', value: 1471,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更はサイドパネルの iframe の読み込み時刻だけ(新規 sidepanel-iframe-boot と sidepanelIframeLoader・本体 sidepanel-entry は src に触れなくなった)。popup 本体・描画・保存は触らない。直前の v0.1.1692 までは削る版、この版も縞を縮める版。'
  }),
  Object.freeze({
    version: '0.1.1693', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1693', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1692 の note と同じ理由)。今回は単体9+配線(書き換え)。ヘッドレスは外枠の最初の描画が約70msで競合が再現せず、効果は実機の記録で確認する。'
  }),
  Object.freeze({
    version: '0.1.1694', metric: 'bundle-kb', value: 1472,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は書き込みの頻度とサイズだけ(取り込みログの保持数・較正リングの間隔・fastDiag 全文の間引き=新規 fastDiagFullGate)。読み手の挙動は変えない。この版は削る版。'
  }),
  Object.freeze({
    version: '0.1.1694', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1694', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1693 の note と同じ理由)。今回は単体 +7(fastDiagFullGate 5・ingestLog 2)・配線4。効果は実機の census で確認(ヘッドレスは content の書き込みが再現しない)。'
  }),
  Object.freeze({
    version: '0.1.1695', metric: 'bundle-kb', value: 1473,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更は、サイドパネル再表示時の更新を描画のあとへ送ること(新規 runAfterNextPaint)と、再表示の記録の計器(新規 showToFrameLedger・sidepanel-entry と aiShareFullText に数行)。popup の描画・保存は触らない。'
  }),
  Object.freeze({
    version: '0.1.1695', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1695', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1694 の note と同じ理由)。今回は単体10+配線5。ヘッドレスの交互比較は差が小さく(中央値 2ms→1ms・外れ値が減る)、実機の再表示の記録で確認。'
  }),
  Object.freeze({
    version: '0.1.1696', metric: 'bundle-kb', value: 1474,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回の変更はサイドパネルの開き方の構造(タブ専用の path をやめてグローバルにする・見せる配信をパネルが決める=新規 pickPanelLv・ローダーに update)。popup・描画・保存は触らない。v0.1.1695 の再表示の更新の後ろ送りと計器は、グローバルになれば再表示自体が起きないので不要になるが、今回は残す(計器で再表示が起きないことを確かめるため)。'
  }),
  Object.freeze({
    version: '0.1.1696', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1696', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1695 の note と同じ理由)。今回は単体 +7(pickPanelLv 4・loader.update 3)・配線テストを新構造へ書き換え(旧『setOptions が3か所』の固定は意図ごと置換)。実機のタブ切り替えで確認(ヘッドレスは Chrome の実サイドパネルを再現できない)。'
  }),
  Object.freeze({
    version: '0.1.1697', metric: 'bundle-kb', value: 1474,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は削る版: v0.1.1695 で入れた runAfterNextPaint(再表示の更新の後ろ送り)と showToFrameLedger(再表示の記録)を撤去。popup-entry.js・sidepanel-entry.js・aiShareFullText.js と2つの検査を v0.1.1694 の状態へ戻した(差分は v0.1.1695 の追加分とぴったり一致することを確認)。'
  }),
  Object.freeze({
    version: '0.1.1697', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1697', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1696 の note と同じ理由)。単体 -10・配線 -5(撤去した部品のぶん)。'
  }),
  Object.freeze({
    version: '0.1.1698', metric: 'bundle-kb', value: 1474,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は削る版: 見えない送信担当(status.html?publisher=1)の更新間隔を 2秒→10秒(新規 statusRefreshInterval・status-entry.js に2行)。描画・送信の中身は触らない。'
  }),
  Object.freeze({
    version: '0.1.1698', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1698', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1697 の note と同じ理由)。今回は単体 +3・配線の書き換え1。効果は実機の census(status の稼働%)で確認。'
  }),
  Object.freeze({
    version: '0.1.1699', metric: 'bundle-kb', value: 1474,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は読み先の移行版: content-entry.js の maybeFetchCommenterFollowingListBatchOnce が本体キーを直読みするのをやめ readChunkedComments へ(隣の2関数と同じ型・数行の置換)。バンドル増減は誤差。通知量を削るのは次の版(popup の書き戻しガード)。'
  }),
  Object.freeze({
    version: '0.1.1699', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1699', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1698 の note と同じ理由)。今回は配線テスト +4(新規 followingListReadsChunks.wiring.test.js)。'
  }),
  Object.freeze({
    version: '0.1.1700', metric: 'bundle-kb', value: 1475,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は削る版: popup-entry.js の本体キー書き戻し4か所(hydrate・snapshot後の汚染除去・intercept merge・自己投稿照合)に commentsChunked ガード。v0.1.509 の既存2か所と同じ型。条件追加のみで新関数なし。'
  }),
  Object.freeze({
    version: '0.1.1700', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1700', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1699 の note と同じ理由)。今回は配線テスト +5(新規 popupMainKeyWritebackGuard.wiring.test.js・変異4件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1701', metric: 'bundle-kb', value: 1475,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は削る版: content-entry.js の maybeResolveNamedUserProfilesOnce が、チャンクから読んだ配列を本体キーへ書き戻さない(1行の条件追加・fromChunks)。前版 v0.1.1700(popup 4か所)の続き。'
  }),
  Object.freeze({
    version: '0.1.1701', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1701', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1700 の note と同じ理由)。今回は配線テスト +4(新規 contentMainKeyWritebackGuard.wiring.test.js・変異2件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1702', metric: 'bundle-kb', value: 1477,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は直す版: popup-entry.js の renderUserRooms から capCommentsForAnalytics(2500サンプル)を外し(全件で集計)、並びを新規 lib rankedRoomsOrder.js(件数降順・同数は前回順位を保つ)に置換。popup-entry.js は行数が減る向き。'
  }),
  Object.freeze({
    version: '0.1.1702', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1702', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1701 の note と同じ理由)。今回は単体 +9(rankedRoomsOrder・性質テスト含む)・配線 +5(変異6件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1703', metric: 'bundle-kb', value: 1479,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は計器の版(前版 v0.1.1702 が直す版なので連続ではない): 順位計(rankOrderMeter.js・rankOrderMeterBoot.js)を popup の描画(1行)とサイドパネルの状態速報(約15行)へ配線。読むだけ・描画に触れない。'
  }),
  Object.freeze({
    version: '0.1.1703', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1703', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1702 の note と同じ理由)。今回は単体 +13・配線 +3(変異4件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1704', metric: 'bundle-kb', value: 1479,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は直す版: popup-entry.js の countToShow を新規 lib pickCountToShow(サマリが正本・0以下は未取得として配列の長さへ)に置換。1行の置換+import 1行。'
  }),
  Object.freeze({
    version: '0.1.1704', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1704', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1703 の note と同じ理由)。今回は単体 +6・配線 +2(変異3件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1705', metric: 'bundle-kb', value: 1480,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は診断の版(前々版 v0.1.1702 が直す版・前版 v0.1.1704 も直す版なので計器の連続ではない): supportersParity.js(純関数)と status の extras の統合 get に応援者鏡を1キー同梱・jsonBlob.supportersParity・AI共有全文に1行。読み取り回数は増えない(同じ get に同梱)。'
  }),
  Object.freeze({
    version: '0.1.1705', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1705', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1704 の note と同じ理由)。今回は単体 +9・配線 +4(変異6件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1706', metric: 'bundle-kb', value: 1480,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は削る版: popup-entry.js の syncLiveStatThreeCardsCharLoadingOverlays の setOne(無条件の hidden/aria-hidden 代入)を、新規 lib overlayShown.js(値が違うときだけ書く)に置換。popup-entry.js は行数が増えない(置換+import 1行)。'
  }),
  Object.freeze({
    version: '0.1.1706', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1706', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1705 の note と同じ理由)。今回は単体 +5・配線 +2(変異4件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1707', metric: 'bundle-kb', value: 1480,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は直す版: htmlReportDocument.js の heavy 時の集計から sampleMaxEntries(4000件サンプル)を外し、未使用になった定数 HTML_REPORT_AGGREGATE_SAMPLE_MAX を削除(行数は減る向き)。'
  }),
  Object.freeze({
    version: '0.1.1707', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1707', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1706 の note と同じ理由)。今回は配線 +3(実件数と合計が一致する性質テストを含む・修正前は赤を確認)。'
  }),
  Object.freeze({
    version: '0.1.1708', metric: 'bundle-kb', value: 1481,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は直す版: marketing-export-entry.js の commentsForAnalytics を全件に・marketingChartsHtml.js の新規 vs 常連を過去配信ありのときだけ出す(新規 lib newVsRepeatBasis.js)・未使用になった capCommentsForAnalytics(lib+テスト)を削除。'
  }),
  Object.freeze({
    version: '0.1.1708', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1708', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1707 の note と同じ理由)。今回は単体 +3・配線 +2(変異5件を検出・既存の marketing テスト緑)。'
  }),
  Object.freeze({
    version: '0.1.1709', metric: 'bundle-kb', value: 1481,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は機能追加の版: 新規 lib supportersGiftsSection.js(ユーザーごとのコメント+ギフトのまとめ・畳める HTML・CSS)と、marketingChartsHtml.js への章の追加(目次・CSS・全件のギフト台帳)。既存の約60章は不変。'
  }),
  Object.freeze({
    version: '0.1.1709', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1709', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1708 の note と同じ理由)。今回は単体 +11・配線 +4(変異9件を検出・既存の marketing テスト緑)。'
  }),
  Object.freeze({
    version: '0.1.1710', metric: 'bundle-kb', value: 1481,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は直す版(前版 v0.1.1705 の診断の誤検知の是正): popup-entry.js の publishTopSupportersMirror に暫定の印・差分判定キーに暫定の印を追加(数行)・supportersParity.js が暫定なら保留。'
  }),
  Object.freeze({
    version: '0.1.1710', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1710', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1709 の note と同じ理由)。今回は単体 +1・配線 +3(変異4件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1711', metric: 'bundle-kb', value: 1480,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は整理の版(挙動不変): popup-entry.js の downloadMediaKitHtml 約120行を src/lib/mediaKitExport.js へ移し、依存(storage・コメント全件読み・タイムアウト・辞書)を注入にした。popup の行数 22096→21775。'
  }),
  Object.freeze({
    version: '0.1.1711', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1711', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1710 の note と同じ理由)。今回は単体 +7・配線 +2(変異3件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1712', metric: 'bundle-kb', value: 1450,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は統合の版: marketing-export-entry.js が buildMediaKitDocument(注入)で作ったメディアキットを buildUnifiedReportHtml(新規 lib・CSS だけのタブ+iframe srcdoc・script 無し)で分析レポートと1つにして保存。mediaKitHtml に maskSupporters。popup の downloadMediaKitHtml 系は撤去(行数 21775→21724)。'
  }),
  Object.freeze({
    version: '0.1.1712', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1712', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1711 の note と同じ理由)。今回は単体 +9・配線 +5(変異8件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1713', metric: 'bundle-kb', value: 1449,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は直す版(前版 v0.1.1712 の見た目の不具合の是正): タブ+iframe をやめ、メディアキットを mediaKitEmbed.js(CSS を #mkt-media-kit で囲って本文を取り出す)でマーケ HTML の1章にした。応援者とギフトの章を暗い配色にし、検索窓+絞り込み script を追加。unifiedReportHtml.js は撤去。'
  }),
  Object.freeze({
    version: '0.1.1713', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1713', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1712 の note と同じ理由)。今回は単体・DOM 計 +14(変異8件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1714', metric: 'bundle-kb', value: 1447,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は直す版(前版 v0.1.1713 の取りこぼし): extension/popup.html の exportMediaKitBtn を撤去しマーケボタンの文言を更新、popup-entry.js の案内ハンドラを撤去(21724→21713行)。'
  }),
  Object.freeze({
    version: '0.1.1714', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1714', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1713 の note と同じ理由)。今回は配線テスト差し替えのみ。'
  }),
  Object.freeze({
    version: '0.1.1715', metric: 'bundle-kb', value: 1445,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は診断の嘘の是正(B3 の1件目): healthCells.js の pctCell が 0〜100 に丸めた値だけを返していたのを、100 を超えたとき over を立てる。status-entry.js が「%超」と描き、再描画の署名にも入れる。'
  }),
  Object.freeze({
    version: '0.1.1715', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1715', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1714 の note と同じ理由)。今回は単体 +1・配線 +1(変異2件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1716', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は診断の嘘の是正(B3 の2件目): buriedInstrumentCells.js の dom-nodes 注記を、memoryPressureProbe.js の実閾値(DOM_NODES_WARN/BAD)から出す。'
  }),
  Object.freeze({
    version: '0.1.1716', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1716', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1715 の note と同じ理由)。今回は単体 +1(変異2件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1717', metric: 'bundle-kb', value: 1444,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は削る版: commentTimelineMirror.js の row が、userId から決定的に作れる匿名 identicon(data: SVG)と一致するときだけ avatarUrl を空にする(合成した顔・https・userId 無しは残す)。消費側(ティッカー=pickTickerHighlight.tickerArgsFromMirrorRow)は空かつ匿名 userId なら同じ identicon を生成。応援タイムラインは元から生成する。'
  }),
  Object.freeze({
    version: '0.1.1717', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1717', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1716 の note と同じ理由)。今回は単体 +3(変異3件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1718', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は削る版: content-entry.js の較正リングの試行間隔 120s→300s・保持件数 appendCalibrationSample の cap=400(定数 CALIBRATION_LOG_KEEP_ITEMS)。読み手は開発モニタの書き出し(devMonitorExport.js)だけ。'
  }),
  Object.freeze({
    version: '0.1.1718', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1718', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1717 の note と同じ理由)。今回は配線テストの差し替えのみ。'
  }),
  Object.freeze({
    version: '0.1.1719', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は診断の嘘の是正(B3 の3件目): silentFailureCells.js の voice-start-fail で、failTotal>0 かつ理由が空のとき warn(理由が記録されていません)→ ok(復旧済み)。'
  }),
  Object.freeze({
    version: '0.1.1719', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1719', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1718 の note と同じ理由)。今回は単体 +1(変異1件を検出)。'
  }),
  Object.freeze({
    version: '0.1.1720', metric: 'bundle-kb', value: 1442,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は診断の嘘の是正(B3): 広告pt/ギフトpt の DOM↔NDGR 優先順位を lib(resolveOfficialPoints.js)へ集約。status が NDGR 先頭 fallback で popup と逆転していた逆順を正す。popup の6箇所も同じ関数へ統一。前版 v0.1.1719 の 1443KB より 1KB 小(過去最良 1360 超は v0.1.1454 以降の継続状態)。'
  }),
  Object.freeze({
    version: '0.1.1720', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1720', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1719 の note と同じ理由)。今回は単体テスト +8(resolveOfficialPoints の境界・逆順・負値)と probe 実行で確認。※この版はクラウドの浅いクローンで記録したため --auto が一旦 0 を書いたが、履歴を深くして再実測し 41(v0.1.1719 と同窓)へ訂正した。'
  }),
  Object.freeze({
    version: '0.1.1721', metric: 'bundle-kb', value: 1441,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は診断の嘘の是正(B3): giftEffectDiag を liveId でスコープ化し、別/終了済み配信のギフト音エラーを現配信の問題として出さない。前版 v0.1.1720 の 1442KB より 1KB 小(過去最良 1360 超は v0.1.1454 以降の継続状態)。'
  }),
  Object.freeze({
    version: '0.1.1721', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1721', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1720 の note と同じ理由)。今回は単体テスト +9(liveId タグ・isGiftEffectDiagForOpenLive の境界・ゲート)で確認。'
  }),
  Object.freeze({
    version: '0.1.1722', metric: 'bundle-kb', value: 1440,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は診断の嘘の是正(B3 follow-up): v0.1.1721 の liveId スコープ化を giftEffectDiag の全読み手(buildGiftEffectDiagLines・giftEffectDiagToActionCards・buildGiftEffectHealthCells)へ展開。前版 1441KB より 1KB 小(過去最良 1360 超は v0.1.1454 以降の継続状態)。'
  }),
  Object.freeze({
    version: '0.1.1722', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1722', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1562・1630〜1721 の note と同じ理由)。今回は単体テスト +9(3読み手の opt-in ゲート・後方互換)で確認。'
  }),
  Object.freeze({
    version: '0.1.1723', metric: 'bundle-kb', value: 1440,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は診断の嘘の是正(B3 follow-up): voiceDiag snapshot に liveId を刻み、silentFailureCells の voice-start-fail・voice-audio-blocked を照合。popup.js は前版 1440KB と同値(過去最良 1360 超は v0.1.1454 以降の継続状態)。'
  }),
  Object.freeze({
    version: '0.1.1723', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1723', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721/1722 の note と同じ理由)。今回は単体テスト +5(snapshot liveId 正規化・2セルの別配信/現配信/未タグ)で確認。'
  }),
  Object.freeze({
    version: '0.1.1724', metric: 'bundle-kb', value: 1440,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は診断の嘘の是正(B3 follow-up): commentPostDiag snapshot に送信先 liveId を刻み、送信先が変わればカウンタを捨て、行と comment-revert セルを照合。popup.js は前版 1440KB と同値(過去最良 1360 超は v0.1.1454 以降の継続状態)。'
  }),
  Object.freeze({
    version: '0.1.1724', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1724', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1723 の note と同じ理由)。今回は単体テスト +6(snapshot liveId・行ゲート・comment-revert セル)で確認。'
  }),
  Object.freeze({
    version: '0.1.1725', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は診断の嘘の是正(B3 項目1): 広告効果音を playEffectSound の戻り値で数え、ガード/未割当/エラー/OFF時の内訳を追加。前版 1440KB より 1KB 小(過去最良 1360 超は v0.1.1454 以降の継続状態)。'
  }),
  Object.freeze({
    version: '0.1.1725', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1725', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1724 の note と同じ理由)。今回は単体テスト +6(広告内訳の振り分け・行/カード/健全度セル)で確認。'
  }),
  Object.freeze({
    version: '0.1.1726', metric: 'bundle-kb', value: 1438,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は配信採点パネルを popup/WEB版から撤去(自動発表も停止・純libは残置)。前版 1439KB より 1KB 小(過去最良 1360 超は v0.1.1454 以降の継続状態)。'
  }),
  Object.freeze({
    version: '0.1.1726', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1726', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1725 の note と同じ理由)。今回は全テスト実行+デッドセレクタラチェットで確認。'
  }),
  Object.freeze({
    version: '0.1.1727', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は診断の嘘の是正(B3 項目4 第1版): summarizeOneLive の recordedCount を未観測なら null にし、表示「—」・出どころ/乖離判定で 0 扱いしない。前版 1438KB より 1KB 小(過去最良 1360 超は v0.1.1454 以降の継続状態)。'
  }),
  Object.freeze({
    version: '0.1.1727', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1727', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1726 の note と同じ理由)。今回は単体テスト +4 と全テスト実行で確認。'
  }),
  Object.freeze({
    version: '0.1.1728', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は診断の嘘の是正(B3 項目4 第2版): trend の合計/取得率を sumTrendKpiTotals に寄せ、未観測の配信を率から外した(status 側の変更で popup は実質不変)。過去最良 1360 超は v0.1.1454 以降の継続状態。'
  }),
  Object.freeze({
    version: '0.1.1728', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1728', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1727 の note と同じ理由)。今回は単体テスト +3 で確認。'
  }),
  Object.freeze({
    version: '0.1.1729', metric: 'bundle-kb', value: 1435,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回はスマホ化 第1段(送信間隔・304)で status 側と app/api の変更=popup は実質不変。過去最良 1360 超は v0.1.1454 以降の継続状態。'
  }),
  Object.freeze({
    version: '0.1.1729', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1729', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1728 の note と同じ理由)。'
  }),
  Object.freeze({
    version: '0.1.1730', metric: 'bundle-kb', value: 1435,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回はサーバー側(api/device・api/status)だけの変更=popup は不変。過去最良 1360 超は v0.1.1454 以降の継続状態。'
  }),
  Object.freeze({
    version: '0.1.1730', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1730', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1729 の note と同じ理由)。今回は単体テスト17本で確認。'
  }),
  Object.freeze({
    version: '0.1.1731', metric: 'bundle-kb', value: 1435,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は status 側の送信の配線(利用者ごとの鍵)=popup は不変。過去最良 1360 超は v0.1.1454 以降の継続状態。'
  }),
  Object.freeze({
    version: '0.1.1731', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1731', metric: 'cross-checked-claims', value: 36,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1730 の note と同じ理由)。今回は単体テスト16本で確認。'
  }),
  Object.freeze({
    version: '0.1.1732', metric: 'bundle-kb', value: 1434,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★今回は status 側の画面(スマホで見るスイッチ)=popup は実質不変。過去最良 1360 超は v0.1.1454 以降の継続状態。'
  }),
  Object.freeze({
    version: '0.1.1732', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1732', metric: 'cross-checked-claims', value: 36,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1731 の note と同じ理由)。今回は画面の単体テスト7本+配線テストで確認。'
  }),
  Object.freeze({
    version: '0.1.1733', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★popup に送信担当の起動(statusPublisherHost)を取り込んだ分の +3KB。過去最良 1360 超は v0.1.1454 以降の継続状態。'
  }),
  Object.freeze({
    version: '0.1.1733', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1733', metric: 'cross-checked-claims', value: 36,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1732 の note と同じ理由)。今回は配線テストで確認。'
  }),
  Object.freeze({
    version: '0.1.1734', metric: 'bundle-kb', value: 1440,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '★popup にスマホの WEB版用の「PC に中継して投稿する」口を足した分の +3KB。過去最良 1360 超は v0.1.1454 以降の継続状態。'
  }),
  Object.freeze({
    version: '0.1.1734', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1734', metric: 'cross-checked-claims', value: 36,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1733 の note と同じ理由)。今回は単体テストに加え、模擬サーバー+ブラウザで ⏱→✓→✓✓ を通しで確認。'
  }),
  Object.freeze({
    version: '0.1.1735', metric: 'bundle-kb', value: 1441,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '+1KB。今回の変更は status 側(gzip 送信・中身の比較)が主で、popup に入るのはコメント鏡の番号1行ぶん。'
  }),
  Object.freeze({
    version: '0.1.1735', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1735', metric: 'cross-checked-claims', value: 36,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1734 の note と同じ理由)。gzip は Node の gunzip で往復を確認。'
  }),
  Object.freeze({
    version: '0.1.1736', metric: 'bundle-kb', value: 1442,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '+1KB。popup.js は status と共有の lib(更新間隔・自動送信の判定)を含むため、その分。'
  }),
  Object.freeze({
    version: '0.1.1736', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1736', metric: 'cross-checked-claims', value: 36,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1735 の note と同じ理由)。'
  }),
  Object.freeze({
    version: '0.1.1737', metric: 'bundle-kb', value: 1442,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '±0。効果音の係は WEB版(app/live-view-sound.js)だけに入り、popup には入らない。'
  }),
  Object.freeze({
    version: '0.1.1737', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1737', metric: 'cross-checked-claims', value: 36,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '★直近30日窓のスライドによる自然増減(v0.1.1721〜1736 の note と同じ理由)。模擬サーバー+ブラウザで音なし→タップ→2件で1回鳴るを確認。'
  }),
  Object.freeze({
    version: '0.1.1738', metric: 'bundle-kb', value: 1442,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '±0。経過の補間は WEB版(app/)だけ、送信の返事の読み取りは status だけに入り、popup には入らない。'
  }),
  Object.freeze({
    version: '0.1.1738', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1738', metric: 'cross-checked-claims', value: 36,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: 'v0.1.1735〜1737 を別の目(Grok)で点検し、実コードで裏取りした4件を直した版。'
  }),
  Object.freeze({
    version: '0.1.1739', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '+1KB は丸めの揺れ。会場モードの係は WEB版(app/live-view-venue.js)だけに入り、popup には入らない。'
  }),
  Object.freeze({
    version: '0.1.1739', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1739', metric: 'cross-checked-claims', value: 36,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '模擬サーバー+スマホ幅のブラウザで、開いた瞬間は吹き出さない→コメントで吹き出し・ギフトで真ん中に品名を画面で確認。'
  }),
  Object.freeze({
    version: '0.1.1740', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。読み上げを送る係は状態速報(status.js)だけ、受け取る係は WEB版(app/live-view-voice.js)だけに入る。'
  }),
  Object.freeze({
    version: '0.1.1740', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1740', metric: 'cross-checked-claims', value: 35,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '本物の受け口+模擬 Redis+ブラウザ2枚(PC役・スマホ役)で、WAV→Opus→預かり→スマホで2件を順に再生(各1.67秒)を確認。'
  }),
  Object.freeze({
    version: '0.1.1741', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。片付けは WEB版(app/live-view-phone-fit.js)だけに入る。'
  }),
  Object.freeze({
    version: '0.1.1741', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1741', metric: 'cross-checked-claims', value: 35,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: 'Android 実機で全ボタンを押した結果(無反応12個)を、模擬サーバーのブラウザで再現(応援者アイコンの押下が popup に止められていた)してから直した。'
  }),
  Object.freeze({
    version: '0.1.1742', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。直しは WEB版(app/live-view-venue.js・live-view-voice.js)だけに入る。'
  }),
  Object.freeze({
    version: '0.1.1742', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1742', metric: 'cross-checked-claims', value: 35,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '模擬サーバー+スマホ幅のブラウザで、声が9秒遅れて届いたとき吹き出しが声の再生と同時(差0.1秒)に出る・声が来ないときは約15秒で出るのを確認。'
  }),
  Object.freeze({
    version: '0.1.1743', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。直しは送信担当(status.js)の phoneVoiceSender と WEB版(app/live-view-*.js)だけ。'
  }),
  Object.freeze({
    version: '0.1.1743', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1743', metric: 'cross-checked-claims', value: 35,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '読み飛ばしの原因は PC 実機の計測(3分でコメント約60件・声19本)と、別の目(Grok)のコード読みの両方で確かめた。'
  }),
  Object.freeze({
    version: '0.1.1745', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。直しは WEB版(app/live-view.js)と純関数 phoneVoice.js だけ。'
  }),
  Object.freeze({
    version: '0.1.1745', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1745', metric: 'cross-checked-claims', value: 35,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '模擬サーバー+スマホ幅のブラウザで、新しいコメントが来た後でも声が鳴っている間は読んでいるコメントが出て、声が終わると新しい方に戻るのを確認。'
  }),
  Object.freeze({
    version: '0.1.1746', metric: 'bundle-kb', value: 1442,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。数える処理は送信担当(status.js)の phoneVoiceSender だけ。'
  }),
  Object.freeze({
    version: '0.1.1746', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1746', metric: 'cross-checked-claims', value: 35,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '数え方は単体テストで固定。実機の内訳はこの版を入れて配信で測る(推測で直さないための計器)。'
  }),
  Object.freeze({
    version: '0.1.1747', metric: 'bundle-kb', value: 1442,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。直しは WEB版(app/live-view-venue.js)と純関数 phoneVenueModel.js だけ。'
  }),
  Object.freeze({
    version: '0.1.1747', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1747', metric: 'cross-checked-claims', value: 35,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '原因は PC 実機側のコード読みと、こちらのコード読みの両方で一致(DEFAULT_FACE 固定)。代わりの顔は単体テストで固定。'
  }),
  Object.freeze({
    version: '0.1.1748', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。読み上げの段階計測は会場(venue.js)とコメビュ(comeview.js)に入り、popup には入らない。'
  }),
  Object.freeze({
    version: '0.1.1748', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1748', metric: 'cross-checked-claims', value: 35,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日窓の数え方で前版と同値。今回は「エンジン待ち」の物差しが前提とする VOICEVOX の直列処理を、自宅PCの実測(3件同時でも15%しか縮まない)で確かめてから、時計を手で進める単体テストで固定した。'
  }),
  Object.freeze({
    version: '0.1.1749', metric: 'bundle-kb', value: 1444,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '+1KB。ポップアップの読み上げ音量スライダー(配線と正規化の純関数)。利用者が要望した設定画面の項目そのもの。'
  }),
  Object.freeze({
    version: '0.1.1749', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1749', metric: 'cross-checked-claims', value: 36,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日窓の数え方で前版+1。今回は増幅の基準(長文48%・短文19%)を、自宅PCの VOICEVOX 実測 WAV の振幅で確かめてから、合成した WAV の単体テストで固定した。'
  }),
  Object.freeze({
    version: '0.1.1750', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '-1KB(四捨五入の境目)。popup の処理は変えていない。変更はコメビュ(comeview.js)の先読み起動だけ。'
  }),
  Object.freeze({
    version: '0.1.1750', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1750', metric: 'cross-checked-claims', value: 37,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日窓の数え方で前版+1。今回は新しい配線テストを、呼び出しを消した変異で赤になることを確かめてから採用した。'
  }),
  Object.freeze({
    version: '0.1.1751', metric: 'bundle-kb', value: 1442,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。直しは WEB版(app/live-view.js・live-view-venue.js)だけ。'
  }),
  Object.freeze({
    version: '0.1.1751', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1751', metric: 'cross-checked-claims', value: 35,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '模擬サーバーで声と鏡を同時に足す競争を6回: 直す前は欄4/6・吹き出し2/6、直した後は6/6・6/6(Android 実測は欄7/17)。'
  }),
  Object.freeze({
    version: '0.1.1752', metric: 'bundle-kb', value: 1442,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。直しは送る前の絞り込み(deviceAuth.js)だけ。'
  }),
  Object.freeze({
    version: '0.1.1752', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1752', metric: 'cross-checked-claims', value: 35,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '拡張側(送る前)とサーバー側(保存前)の両方で同じ関数が絞る=古い拡張から来ても他の配信は残らない。単体テストで固定。'
  }),
  Object.freeze({
    version: '0.1.1753', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '+1KB。popup の鏡の書き込み前に、保存済みのコメント鏡が新しいかを1回読むだけ。'
  }),
  Object.freeze({
    version: '0.1.1753', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1753', metric: 'cross-checked-claims', value: 35,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '原因は実機でサーバーの中身を10秒ごとに見た結果(2種類が交互)と、コード読み(content と popup の2か所が同じキーに書く・popup は15秒ごとに書き直す)が一致。'
  }),
  Object.freeze({
    version: '0.1.1754', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。遅れの一言は会場(venue.js)とコメビュ(comeview.js)だけで、popup には入らない。'
  }),
  Object.freeze({
    version: '0.1.1754', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1754', metric: 'cross-checked-claims', value: 38,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日窓の数え方で前版+1。今回は文言の「8秒」を voiceAgeGate の実際の基準(VOICE_STALE_MS_NORMAL)とテストで突き合わせた(§12.7)。'
  }),
  Object.freeze({
    version: '0.1.1755', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。変更はサーバー(api/status.js)と判定(deviceAuth.js)だけ。'
  }),
  Object.freeze({
    version: '0.1.1755', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1755', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '上限は判定の単体テストと、模擬 Redis を使った受け口のテスト(2人目が 429・Retry-After 120)の両方で固定。'
  }),
  Object.freeze({
    version: '0.1.1756', metric: 'bundle-kb', value: 1442,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。変更はサーバー(api/status.js・liveEventsApi.js)と共有の判定(liveEvents.js)だけ。'
  }),
  Object.freeze({
    version: '0.1.1756', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1756', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: 'Ably の API の形は公式ドキュメント(SSE・requestToken・publish)で確かめ、模擬の Ably と Redis で受け口を試験。'
  }),
  Object.freeze({
    version: '0.1.1757', metric: 'bundle-kb', value: 1442,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。変更は状態速報(status.js)と視聴ページ(content.js)の配線で、popup は触っていない。'
  }),
  Object.freeze({
    version: '0.1.1757', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1757', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '送る係は模擬の送信で試験(最初は送らない・配信切替・無効化・サーバーがキー無し)。配線は文字列の配線試験で固定。'
  }),
  Object.freeze({
    version: '0.1.1758', metric: 'bundle-kb', value: 1441,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。変更はスマホの WEB版(app/live-view.js と新しい live-view-realtime.js)だけで、拡張の popup は触っていない。'
  }),
  Object.freeze({
    version: '0.1.1758', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1758', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '受け取り口を模擬の EventSource と fetch で試験(キー無し・届いたまとめ・配信切替・切断とつなぎ直し・http は拒否)。'
  }),
  Object.freeze({
    version: '0.1.1759', metric: 'bundle-kb', value: 1443,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '前版から変化なし(1KB 未満)。popup には設定の選択肢1つと配線(wireVoiceNarrowSelect.js)を足しただけで、絞り方の判定は lib の voiceNarrowing.js。'
  }),
  Object.freeze({
    version: '0.1.1759', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1759', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '前版と同じ。絞り込みは単体テスト(固定表の順・2件未満なら絞らない・先読みの順序)と、会場/コメビュ/popup の配線テストの両方で固定。'
  }),
  Object.freeze({
    version: '0.1.1760', metric: 'bundle-kb', value: 1442,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '前版から1KB減(popup は触っていない)。過去最良 1360 より大きいのは 0.1.1454 以降の機能追加の累積で、この版の悪化ではない。'
  }),
  Object.freeze({
    version: '0.1.1760', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1760', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '前版と同じ。吹き出しの置き方は単体テスト(純関数)に加え、拡張を読み込んだ実ブラウザで会場とスマホ会場を開いて吹き出しの位置を測った(PICK UP・案内文に被らない)。'
  }),
  Object.freeze({
    version: '0.1.1761', metric: 'bundle-kb', value: 1441,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '前版から1KB減(popup は触っていない)。過去最良より大きいのは 0.1.1454 以降の機能追加の累積。'
  }),
  Object.freeze({
    version: '0.1.1761', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1761', metric: 'cross-checked-claims', value: 39,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '前版と同じ。PC 実機の確認(段の上の案内文に被った)を、拡張を読み込んだ Chromium の再現で確かめてから直し、案内文との重なり 0% を実測。'
  }),
  Object.freeze({
    version: '0.1.1762', metric: 'bundle-kb', value: 1441,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '前版と同じ(popup は触っていない。変えたのはスマホの WEB版 app/ と iPhone アプリの mobile/)。'
  }),
  Object.freeze({
    version: '0.1.1762', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1762', metric: 'cross-checked-claims', value: 40,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '前版から増えた分は、スマホのデモ・通知・隠す機能の単体テスト(作り物の見本に実在の画像サーバーや実在の桁の ID が無いことも確かめる)。'
  }),
  Object.freeze({
    version: '0.1.1803', metric: 'bundle-kb', value: 1435,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '0.1.1762 以降この台帳への記録が止まっていた間(スマホ版・読み上げ・音量・自己更新)の機能追加で増えた分。この版の差分は計器2か所だけで popup.js は増やしていない。'
  }),
  Object.freeze({
    version: '0.1.1803', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1803', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '直近30日の窓で数える値なので、古いコミットが窓から抜けると減る。この間の確かめは PC の実機試験(RC)の数字で行い、コミット本文にその言い回しを書かなかった分は数えられていない。'
  }),
  Object.freeze({
    version: '0.1.1804', metric: 'bundle-kb', value: 1435,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '0.1.1803 と同じ(この版はコメビュだけの変更で popup.js は変わらない)。'
  }),
  Object.freeze({
    version: '0.1.1804', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1804', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1803 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1805', metric: 'bundle-kb', value: 1435,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '0.1.1803 と同じ(この版はコメビュだけの変更で popup.js は変わらない)。'
  }),
  Object.freeze({
    version: '0.1.1805', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1805', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1803 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1806', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '+1KB は GPU を使えるかを調べる関数と案内文(voicevoxClient/voiceLagNotice)。'
  }),
  Object.freeze({
    version: '0.1.1806', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1806', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1805 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1807', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '0.1.1806 と同じ(この版はコメビュの計器だけの変更)。'
  }),
  Object.freeze({
    version: '0.1.1807', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1807', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1806 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1808', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '0.1.1807 と同じ(読み上げ文の整え方 voiceReadingNormalize.js は1KB未満)。'
  }),
  Object.freeze({
    version: '0.1.1808', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1808', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1807 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1809', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '+1KB は「間引いた分を最後に1回書く」小部品(trailingPublisher.js)。'
  }),
  Object.freeze({
    version: '0.1.1809', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1809', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1808 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1810', metric: 'bundle-kb', value: 1438,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '+1KB は読み上げ文の整え方の追加(読める文字が無いコメントを飛ばす・w 1文字)と説明コメント。'
  }),
  Object.freeze({
    version: '0.1.1810', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1810', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1809 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1811', metric: 'bundle-kb', value: 1438,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。直しは会場の読み上げ係(voicePlayer)とコメビュの読み上げの列だけ。'
  }),
  Object.freeze({
    version: '0.1.1811', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1811', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1810 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1812', metric: 'bundle-kb', value: 1438,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。直しは会場の読み上げ係(voicePlayer)とスマホへ声を送る係(status.js)だけ。'
  }),
  Object.freeze({
    version: '0.1.1812', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1812', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1811 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1813', metric: 'bundle-kb', value: 1438,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。直しは読み上げる文を作る buildVoiceReadingText だけ。'
  }),
  Object.freeze({
    version: '0.1.1813', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1813', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1812 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1814', metric: 'bundle-kb', value: 1438,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '変化なし。直しは content.js 側のコメント欄の読み直し(nicoliveDom.parseCommentElement)だけ。'
  }),
  Object.freeze({
    version: '0.1.1814', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1814', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1813 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1815', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '+1KB。応援レーン集計の並べ替え省略と、確定済みキー集合の使い回し(WeakMap)を足した分。'
  }),
  Object.freeze({
    version: '0.1.1815', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1815', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1814 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1816', metric: 'bundle-kb', value: 1439,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js の差分は即時プッシュ再描画の間隔指定だけ(1.5秒・隠れている間のみ)。'
  }),
  Object.freeze({
    version: '0.1.1816', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1816', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1815 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1817', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '-2KB はコードではなく、popup に同梱する更新履歴から 0.1.1797 の項目が外れた分(split-changelog)。コードの差分は venue の CSS だけ。'
  }),
  Object.freeze({
    version: '0.1.1817', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1817', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1816 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1818', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js はコードの変更なし(更新履歴の入れ替わりのみ)。直したのは content.js 側。'
  }),
  Object.freeze({
    version: '0.1.1818', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1818', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1817 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1819', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js は変化なし。直したのは content.js(初回ゲートの結果を記録)と E2E テスト。'
  }),
  Object.freeze({
    version: '0.1.1819', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1819', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1818 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1820', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js は変化なし(更新履歴の入れ替わりのみ)。直したのは content.js(先読みの条件と host の動かし方)。'
  }),
  Object.freeze({
    version: '0.1.1820', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1820', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1819 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1821', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js は状態速報の計器セル(buriedInstrumentCells)の数行と更新履歴の入れ替わりのみ(1KB減は更新履歴が popup から出た分)。直したのは content.js の移設計器。'
  }),
  Object.freeze({
    version: '0.1.1821', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1821', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1820 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1822', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js はコードの変更なし(更新履歴の入れ替わりのみ)。直したのはスマホの WEB 版と /api/live-ranking。'
  }),
  Object.freeze({
    version: '0.1.1822', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1822', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1821 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1823', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js はコードの変更なし(更新履歴の入れ替わりのみ)。ファンにも公開は status.js 側。'
  }),
  Object.freeze({
    version: '0.1.1823', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1823', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1822 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1824', metric: 'bundle-kb', value: 1438,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js はコードの変更なし(更新履歴の入れ替わりのみ)。コメントを流す欄は app/dist/live-ranking.js 側。'
  }),
  Object.freeze({
    version: '0.1.1824', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1824', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1823 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1825', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'content.js に横付きのはみ出し判定(besideOverflowGuard)と配線を追加。popup.js は変更履歴の文字列だけ'
  }),
  Object.freeze({
    version: '0.1.1825', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1825', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: 'besideOverflowGuard の単体6件・E2E『横スクロールを出さず下へ逃がす』(旧コードで赤)・実配信 1252px で はみ出し +469→−15 / 1920px は変化なし'
  }),
  Object.freeze({
    version: '0.1.1826', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '0.1.1825 から -1KB。popup.js は変更履歴の文字列だけ(つなぎ直しはアプリ側 live-ranking の束)'
  }),
  Object.freeze({
    version: '0.1.1826', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1826', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1825 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1827', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '0.1.1826 と同じ。popup.js は変更履歴の文字列だけ(ギフト表示はアプリ側 live-ranking の束)'
  }),
  Object.freeze({
    version: '0.1.1827', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1827', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1826 と同じ(30日の窓で数える値)。'
  }),
  Object.freeze({
    version: '0.1.1828', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '0.1.1827 と同じ(popup は変更履歴の文字列だけ)。'
  }),
  Object.freeze({
    version: '0.1.1828', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1828', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '0.1.1827 と同じ(30日の窓で数える値)。席が無い人の吹き出しは配線テストと実寸ページでの測定で確かめた。'
  }),
  Object.freeze({
    version: '0.1.1829', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '前版と同じ水準。今回の変更は content とコメビュの配線(popup は触っていない)。'
  }),
  Object.freeze({
    version: '0.1.1829', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1829', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '近道は単体テスト(行の選び方・メッセージの検証・二度読まない・タブの選び方)と、content/コメビュの配線テストの両方で固定。実機での速さは状態速報の「受信→キュー」で確かめる。'
  }),
  Object.freeze({
    version: '0.1.1830', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'content.js に一度でも DOM に入った host の WeakSet を追加。popup.js は変更履歴の文字列だけ'
  }),
  Object.freeze({
    version: '0.1.1830', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1830', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: 'E2E『パネルを開いても host は1回しか作られない』(修正前の実測 host_created=4→1)'
  }),
  Object.freeze({
    version: '0.1.1831', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js から描画ごとの自動ログ呼び出し(setTimeout)を削除'
  }),
  Object.freeze({
    version: '0.1.1831', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1831', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: 'grep で __NLS_LANE_DIAG__ の自動呼び出しが他に無いこと・関数自体は DevTools 用に残ることを確認'
  }),
  Object.freeze({
    version: '0.1.1832', metric: 'bundle-kb', value: 1436,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '0.1.1831 と同じ(popup は変更履歴の文字列だけ)。'
  }),
  Object.freeze({
    version: '0.1.1832', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1832', metric: 'cross-checked-claims', value: 42,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '前版と同等(30日の窓)。診断の行との重なりは、実配信の測定(15件中14件被り)と同じ形のページで直す前 100%→直した後 0% を確かめた。'
  }),
  Object.freeze({
    version: '0.1.1833', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '前版と同じ水準。popup に音質の選択肢1つと配線(wireVoiceQualitySelect.js)を足しただけで、値の決め方は lib の voiceQuality.js。'
  }),
  Object.freeze({
    version: '0.1.1833', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1833', metric: 'cross-checked-claims', value: 41,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '音質の切り替えは単体テスト(エンジンへ渡す outputSamplingRate が 16k/24k/変な値→16k)と、3か所の配線・popup の既定のテストの両方で固定。音の違いは自宅PCで聞き比べてもらう。'
  }),
  Object.freeze({
    version: '0.1.1834', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js は変更履歴の文字列だけ(直したのは vercel.json の CSP)'
  }),
  Object.freeze({
    version: '0.1.1834', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1834', metric: 'cross-checked-claims', value: 42,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日の窓で数える値。'
  }),
  Object.freeze({
    version: '0.1.1835', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js は変更履歴の文字列だけ(アイコンはアプリ側 live-ranking の束)'
  }),
  Object.freeze({
    version: '0.1.1835', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1835', metric: 'cross-checked-claims', value: 42,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日の窓で数える値。'
  }),
  Object.freeze({
    version: '0.1.1836', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js は変更履歴の文字列だけ(二重表示の修正はアプリ側 live-ranking の束)'
  }),
  Object.freeze({
    version: '0.1.1836', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1836', metric: 'cross-checked-claims', value: 42,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日の窓で数える値。'
  }),
  Object.freeze({
    version: '0.1.1837', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js は変更履歴の文字列だけ(画面を消さないのはアプリ側 live-ranking の束)'
  }),
  Object.freeze({
    version: '0.1.1837', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1837', metric: 'cross-checked-claims', value: 42,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日の窓で数える値。'
  }),
  Object.freeze({
    version: '0.1.1838', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js は onerror 属性を data 印に替えただけ(+変更履歴)'
  }),
  Object.freeze({
    version: '0.1.1838', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1838', metric: 'cross-checked-claims', value: 42,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日の窓で数える値。'
  }),
  Object.freeze({
    version: '0.1.1839', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js は onerror 属性を data 印に替えただけ(+変更履歴)'
  }),
  Object.freeze({
    version: '0.1.1839', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1839', metric: 'cross-checked-claims', value: 42,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日の窓で数える値。'
  }),
  Object.freeze({
    version: '0.1.1840', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: '会場とコメビュの案内文の変更・popup は変更履歴の文字列だけ'
  }),
  Object.freeze({
    version: '0.1.1840', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1840', metric: 'cross-checked-claims', value: 42,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日の窓で数える値。'
  }),
  Object.freeze({
    version: '0.1.1841', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'popup.js は変更履歴の文字列だけ(会場とコメビュの読み上げの数え直し)'
  }),
  Object.freeze({
    version: '0.1.1841', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1841', metric: 'cross-checked-claims', value: 42,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日の窓で数える値。'
  }),
  Object.freeze({
    version: '0.1.1842', metric: 'bundle-kb', value: 1437,
    source: '[auto] extension/dist/popup.js のファイルサイズ',
    note: 'content.js の NDGR 前方向の読み方の差し替え・popup は変更履歴の文字列だけ'
  }),
  Object.freeze({
    version: '0.1.1842', metric: 'gate-selftest', value: 4,
    source: '[auto] npm run audit:gates（--selftest を持つ検査の本数）'
  }),
  Object.freeze({
    version: '0.1.1842', metric: 'cross-checked-claims', value: 42,
    source: '[auto] 直近30日のコミット本文で「別の手段でも確かめた」と書かれた回数',
    note: '30日の窓で数える値。'
  })
]);
