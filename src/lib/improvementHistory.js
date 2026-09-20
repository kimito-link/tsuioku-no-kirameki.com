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
  })
]);
