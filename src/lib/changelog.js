/**
 * 拡張の更新履歴データと semver 比較ヘルパ。
 *
 * 設計（0.1.12 D: 更新履歴 popup 表示）:
 *   ・version 文字列・日付・概要・項目配列を JSON-like なデータ構造で保持。
 *   ・popup-entry.js が `<details id="changelogPanel">` の中身として
 *     描画する。<details> は既定折り畳みなので、開かない限り存在感ゼロ
 *     （UIUX 阻害ゼロ）。
 *   ・各項目は HTML を含まずプレーンテキスト（テキストノードで出す）。
 *     CWS 審査で問題になる外部リソース取得や script 系も入れない。
 *
 * 注：このファイルは「ユーザに見せる更新履歴」の正本。AGENTS.md §5 と
 *     重複する内容もあるが、AGENTS.md は開発者向けの詳細、ここはユーザ向けの
 *     要約という棲み分け。
 */

/**
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
    version: '0.1.166',
    date: '2026-05-05',
    summary: 'イベント不参加時の順位表示を撤去',
    items: Object.freeze([
      'イベントに参加していない配信なのに「ニコ生現在 50 位」のような順位が popup に表示される誤情報を直しました（公式バナーが取れた時だけ表示するように変更）',
      '「履歴」「ランキング」タブの DOM が公式と一致しているかを確認するための診断情報を追加しました（次の修正に必要なデータを集めるため）'
    ])
  }),
  Object.freeze({
    version: '0.1.165',
    date: '2026-05-05',
    summary: '「読み込み中」が消えない事故を防ぐ',
    items: Object.freeze([
      'popup を開いた直後の「読み込み中…」の絵が、なんらかの不具合で消えなくなっても、最大 15 秒後に必ず自動で消えるよう二重の安全網を入れました',
      '拡張の更新が部分的にしか反映されなかった場合でも、永遠に読み込み画面に固まらず popup の中身を表示するようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.164',
    date: '2026-05-05',
    summary: '貢献度ランキングを履歴からも掬う',
    items: Object.freeze([
      'ニコ生公式の「貢献度ランキング」タブの DOM をそのまま読み、応援者の名前と貢献ポイントを popup に表示するようにしました',
      'ランキングタブを開いていなくても、「履歴」タブの個別ギフトをユーザー単位で合算して同様に表示するフォールバックを追加しました',
      '順位が公式値で取れた時のラベルを「イベント現在 N 位」、NDGR 経由の汎用順位を「ニコ生現在 N 位」と分けて表記し、間違いを誤情報として出さないようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.163',
    date: '2026-05-05',
    summary: 'おさらいを漫画コマ風に',
    items: Object.freeze([
      'HTML レポートとマーケ分析の冒頭の「今回の放送のおさらい」を、コマ割り・吹き出し・強調数字・擬音語のついた漫画コマ風レイアウトに作り変えました',
      '画面幅に合わせて顔とフォントが拡縮するレスポンシブ設計（clamp + container query）にし、スマホでもPCでも読みやすくしました',
      '上位応援者は3人会話、捕捉率の良し悪しでこん太の表情と背景色が変わるなど、シーンごとに見た目が動くようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.162',
    date: '2026-05-05',
    summary: '公式DOMから掬った正本値を表示',
    items: Object.freeze([
      'niconico プレイヤー上のリアルタイム5値（来場・コメ・経過・広告pt・ギフトpt）を data-value から直接読み、NDGR 由来の値より優先するようにしました',
      '「○○さんが参加しています！現在 N 位 X」という公式の参加バナーを popup にネイティブで描き、ユーザー操作なしでイベント順位とスコアが見えるようにしました',
      '貢献度ランキングが取得できる場合は、NDGRギフト集計より公式ランキングを優先して表示するようにしました',
      'HTML レポート / マーケ分析の冒頭に「今回の放送のおさらい」というりんく・こん太・たぬ姉の三人解説を入れ、最終数値と上位応援者を読み上げる形にしました'
    ])
  }),
  Object.freeze({
    version: '0.1.161',
    date: '2026-05-05',
    summary: 'コメント表示ズレと診断混線を抑制',
    items: Object.freeze([
      'watch snapshot の liveId が現在の watch URL と合わない結果は採用しないようにし、別放送データが混ざる経路を塞ぎました',
      'refresh 世代が切り替わった後に古い fetch 結果が snapshot キャッシュを書き戻す経路を止め、放送切替直後の表示ズレを減らしました',
      'AI共有の高速診断キャッシュは現在の watch URL と同じ放送のときだけ使うようにし、診断JSONの liveId 混線を防ぎました'
    ])
  }),
  Object.freeze({
    version: '0.1.160',
    date: '2026-05-05',
    summary: '作戦会議UIと三人ガイドを強化',
    items: Object.freeze([
      'マーケ分析HTMLの「次回やること」を、りんく・こん太・たぬ姉の作戦会議として見出しと導線を整理し、吹き出し案内を増やして読みやすくしました',
      'HTMLレポートの次枠メモも三人の解説つきに刷新し、スマホ/PCのどちらでも読みやすい配置に調整しました',
      '「この内容は配信データに応じて毎回変わる」説明を、マーケ分析とHTMLレポートの両方に明記しました'
    ])
  }),
  Object.freeze({
    version: '0.1.158',
    date: '2026-05-04',
    summary: 'のどぐろ経由の公式ギフト指標を反映',
    items: Object.freeze([
      '拡張の版を 0.1.158 にしました。別環境の 0.1.157 より新しい番号で、読み込んだフォルダが正しいか判別しやすくなります',
      'のどぐろ（NDGR）由来の広告pt・番組・イベントのギフト累計・順位・イベント名の popup 表示と、マーケHTMLギフト節の注釈はこの版に含まれます'
    ])
  }),
  Object.freeze({
    version: '0.1.122',
    date: '2026-05-04',
    summary: '公式ギフト指標（NDGR）をpopup表示',
    items: Object.freeze([
      'のどぐろ（NDGR）の statistics を来場者数が無くても拾い、広告pt・番組・イベントのギフト累計・順位・イベント名を watch popup に表示します',
      'マーケ分析HTMLのギフト節に、番組・イベント累計がニコ生公式のギフト指標である旨の短い注釈を追加しました'
    ])
  }),
  Object.freeze({
    version: '0.1.121',
    date: '2026-05-04',
    summary: '同一放送だけ配信者メタを引き継ぎ',
    items: Object.freeze([
      'watch スナップショットの partial-merge で、前枠の配信者名などが別の live に残り続けることがないよう、prev と next の liveId が両方そろい同一のときだけ配信者同一性を引き継ぐようにしました',
      'liveId が片方だけ欠けるときは引き継ぎません（誤結合より一瞬の欠損を優先）'
    ])
  }),
  Object.freeze({
    version: '0.1.120',
    date: '2026-05-04',
    summary: 'マーケ分析とHTMLレポートに次回向けメモ',
    items: Object.freeze([
      'マーケ分析HTMLの先頭に「次回やること」や応援しやすい時間のメモを追加しました。ギフト記録があるときは前後の流れも表示します',
      'HTMLレポートに短い「次回メモ」ブロックを追加しました（保存して後から見返す用途向け）'
    ])
  }),
  Object.freeze({
    version: '0.1.119',
    date: '2026-05-04',
    summary: 'インライン below の挿入点を視聴行ラッパーへ（フル幅の根）',
    items: Object.freeze([
      '動画列の内側だけにホストがあると、祖先の overflow でタブ幅まで広がらないことがありました。動画と公式コメントパネルの両方を含み、幅が視聴行相当の祖先を探してその直後にホストを置くようにしました',
      'プレイヤー行の幅（player_row）の上限計算も、その挿入ブロック基準に合わせます。0.1.118 の margin 補正は引き続き残します'
    ])
  }),
  Object.freeze({
    version: '0.1.118',
    date: '2026-05-04',
    summary: 'タブ幅広げでコメ列下まで届くよう位置を補正',
    items: Object.freeze([
      '動画列の子要素に挿しているだけだと、幅をタブに合わせても右側のコメ列下に余白が残ることがありました。左マージンをビューポート寄りに寄せ、幅を「タブ右端まで」の実測に合わせて再計算します',
      '0.1.117 の max-width 明示と組み合わせて、ワイド時の見た目を揃えます'
    ])
  }),
  Object.freeze({
    version: '0.1.117',
    date: '2026-05-04',
    summary: 'タブ幅広げが親の幅で潰れるのを修正',
    items: Object.freeze([
      'プレイヤー行の下でパネル幅をタブに合わせて広げても、host の max-width が 100% のまま親列の幅にキャップされ、見た目が変わらないことがありました。広げた幅と同じ max-width を指定するようにしました',
      'body 直下フォールバック時も width と max-width を揃え、同様のキャップを避けます'
    ])
  }),
  Object.freeze({
    version: '0.1.116',
    date: '2026-05-04',
    summary: '初回はタブ幅いっぱいにパネルを広げる',
    items: Object.freeze([
      '「下／横付きのときの幅の広げ方」の未設定の既定を「初めての1回だけ」にしました。初めて watch を手前のタブで開いたとき、動画列より広いタブ幅に合わせてパネルを広げます（以降は従来の幅に戻ります）',
      '常に／1回だけ広げるときの目標幅から720pxの上限を外し、タブ幅に近いサイズ（超ワイドは1920pxまで）にしました。body 直下フォールバックの720px上限は従来どおりです'
    ])
  }),
  Object.freeze({
    version: '0.1.115',
    date: '2026-05-04',
    summary: 'インライン幅のタブ合わせを選べる',
    items: Object.freeze([
      '詳細設定に「下／横付きのときの幅の広げ方」を追加しました。従来どおり／タブ幅に近い上限まで常に／初めての1回だけ、から選べます',
      'watch のページ内パネルが設定に応じて幅を広げます。画面下固定・浮遊では無効です。「1回だけ」はタブが手前でパネルが描画されたタイミングで消費されます'
    ])
  }),
  Object.freeze({
    version: '0.1.114',
    date: '2026-05-04',
    summary: '視聴ページの省電力と表示の安定化',
    items: Object.freeze([
      'ページフレームの更新を整理し、スクロールは1フレームに1回、ウィンドウサイズ変更は短い間隔でまとめて処理するようにしました',
      'タブが裏側のときは、動画横パネルの探索や来場者などの統計取得を間引き、CPUの負担を抑えます',
      'インラインパネルの描き直しが重なったあと、画面に固定した表示が付かず位置がずれることがある不具合を修正しました',
      '横付きで幅が足りず自動的に下へ寄せられる場合でも、ブラウザ右側に十分な余白があるときは横並びのまま幅だけ従来どおり決めるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.113',
    date: '2026-05-03',
    summary: '記録途切れ防止と新規の配置おすすめ',
    items: Object.freeze([
      'インラインの位置を何度も切り替えたあと、公式コメント欄の差し替えで MutationObserver が古い DOM を見続け、記録が止まることがありました。レイアウト更新のたびに監視ルートを取り直すようにしました',
      '新規インストール時のみ、初めて視聴ページの content が動くときにタブ幅から「横付き／下／画面下」のおすすめを一度だけ自動で書き込みます（既存の保存済み設定は変えません）'
    ])
  }),
  Object.freeze({
    version: '0.1.112',
    date: '2026-05-03',
    summary: '横付き判定をタブ実幅ベースに修正',
    items: Object.freeze([
      'インライン横付きの可否と幅計算で visualViewport 幅だけを使っていたため、ページ拡大などで実タブより狭く見積もり、ワイド表示でも常に「プレイヤー行の下」になることがありました',
      'レイアウト幅（window.innerWidth）を基準にし、狭いときの下への逃がしは従来どおりです。縦横比だけで横付きを止める処理は撤去し、列との隙間が足りないときの自動フォールバックに任せます',
      '設定画面の注意文を、視聴タブの幅で決まる旨に更新しました'
    ])
  }),
  Object.freeze({
    version: '0.1.111',
    date: '2026-05-03',
    summary: '縦長画面では横付きを下へ自動寄せ',
    items: Object.freeze([
      '横付き設定でもウィンドウが縦長のときは実効だけ「プレイヤー行の下」に寄せ、動画や入力と重なりにくくしました',
      'ページの見え方が変わったときは Visual Viewport の変化でもレイアウトが追従します（ズームなど）'
    ])
  }),
  Object.freeze({
    version: '0.1.110',
    date: '2026-05-06',
    summary: '横付きパネル幅をコメ列との実ギャップで算出',
    items: Object.freeze([
      '横付き（beside）でパネルの横幅を「ブラウザ右端までの余白」だけから決めていたため、実際には公式コメント列が動画の右にあるレイアウトで幅が取りすぎになり、flex が折り返して動画や入力欄と重なることがありました',
      '動画カラムと、その右の要素の間に挟める実際のピクセル幅から決めるようにしました。間が狭く最小幅を満たせないときは自動で「プレイヤー行の下」へ寄せます',
      '親フレックスが折り返し（flex-wrap）のときは横付きを避け、同様に下へ寄せます',
      'Chrome の拡張機能一覧とポップアップのバージョン表示が 0.1.110 になります'
    ])
  }),
  Object.freeze({
    version: '0.1.109',
    date: '2026-05-04',
    summary: 'below時のインラインパネルを視聴行付近に寄せる',
    items: Object.freeze([
      '「プレイヤー行の下」など DOM に埋め込む配置では、アンカー候補の選び方によってパネルが関連放送や概要エリアよりずっと下に付き、ページを長くスクロールしないと見えなくなることがありました',
      '合格した候補のうち、いちばん面積の小さいブロック（視聴行に密なラッパー）を優先して選ぶようにし、パネルが視聴エリアのすぐ近くに付くようにしました',
      '画面下固定・フローティングモードは従来どおりです。末尾に固定されたように見えるときは詳細設定の「パネル位置」をご確認ください',
      'Chrome の拡張機能一覧とポップアップのバージョン表示が 0.1.109 になります'
    ])
  }),
  Object.freeze({
    version: '0.1.108',
    date: '2026-05-03',
    summary: 'インラインパネル配置を画面サイズ別に安定化',
    items: Object.freeze([
      '視聴ページを縮めたり縦長レイアウトにすると、プレイヤー行のラッパーが縦に長くなり、アンカー候補の評価から外れてパネルが「動画と公式コメントのあいだ」やページ末尾寄りに付くことがありました。狭く動画が横幅いっぱいに近いときだけ閾値を補正し、適切なブロックの直後に付くようにしました',
      '画面下固定（dock_bottom）や floating での見える範囲の計算に、利用できるとき Visual Viewport API を優先して使うようにしました（ズームやモバイルでのアドレスバー変化などで innerHeight と実表示がずれる場合の dock 高さのブレを抑えます）',
      'Chrome の拡張機能一覧とポップアップのバージョン表示が 0.1.108 になります'
    ])
  }),
  Object.freeze({
    version: '0.1.107',
    date: '2026-05-03',
    summary: '自動テストのインラインパネル配置検証を現仕様に整合',
    items: Object.freeze([
      'GitHub Actions のブラウザ自動テストで、beside（横付き）時に動画とパネルの間へ空白テキストを挟む検証が、環境によって期待値とずれて失敗することがありました',
      '設計どおり「空白が挟まっても毎フレーム DOM を差し替え続けない」ことと、安定後も動画の直前要素としてパネルが論理的に繋がっていることを確認する内容にテストを更新しました（本体の表示ロジックの変更ではありません）',
      'Chrome の拡張機能一覧とポップアップのバージョン表示が 0.1.107 になります'
    ])
  }),
  Object.freeze({
    version: '0.1.106',
    date: '2026-05-03',
    summary: '視聴ページパネルでランキング枠が一瞬出る現象を軽減',
    items: Object.freeze([
      'watch ページに埋め込んだパネル（インライン）で、読み込み直後に「ランキングへ」のオレンジ枠だけが先に見え、そのあと通常の表示に切り替わることがあったので抑えました',
      'ランキング導線は HTML では既定で非表示にし、ツールバーのポップアップなど「実質どこにもニコ生 watch が繋がっていない」ときだけ表示します。視聴タブとして watch が取れたときは出しません',
      'Chrome の拡張機能一覧とポップアップのバージョン表示が 0.1.106 になります'
    ])
  }),
  Object.freeze({
    version: '0.1.105',
    date: '2026-05-03',
    summary: '自動テストのポップアップ検証を安定化',
    items: Object.freeze([
      'GitHub Actions のブラウザ自動テスト（E2E）で、モックの視聴ページとは別タブでポップアップだけを開いたあと、アクティブタブが拡張側と判定され「配信なし」と同じ見た目の CSS がコメント欄を隠してしまい、見えない扱いになることがありました',
      'テスト側で「視聴タブを一度前面にしたうえでポップアップを再読み込みする」共通手順を追加し、視聴中と同じ前提で検証できるようにしました。通常の視聴・ポップアップの動作そのものは変えていません',
      'Chrome の拡張機能一覧とポップアップのバージョン表示が 0.1.105 になります'
    ])
  }),
  Object.freeze({
    version: '0.1.104',
    date: '2026-05-03',
    summary: 'deep gap recovery をさらに強化',
    items: Object.freeze([
      'ライブ中に公式コメント累計と記録件数の差が開いたときの追い quiet deep を、やや敏感にしました（クールダウン・ギャップ閾値）。また NDGR が続いても deep が空きすぎないよう、強制 deep の間隔を短めました',
      '約 2 分ごとの定期 quiet deep は、これまで recovery が不要なときは基本 1 パスでしたが、2 回に 1 回は 2-pass で仮想リスト全域を寄せ直すようにしました（CPU との折り合い）',
      'deep の仮想リスト走査で、スクロール間の待ち時間をわずかに短くしました。公式件数との比率がまだ離れる場合もありますが、取りこぼしを減らす方向の調整です'
    ])
  }),
  Object.freeze({
    version: '0.1.103',
    date: '2026-05-03',
    summary: 'deep harvest 最適化（下端・ギャップ追い）',
    items: Object.freeze([
      '公式コメント欄の仮想リスト走査で、スクロール下端を先にマージしてから上→下へスイープするオプションを deep / 深掘りエクスポートに有効化しました。途中参加でも新しめの帯を早く拾いやすくなります',
      'ライブ中に公式のコメント累計とローカル記録件数の差が大きいときの追加 quiet deep について、クールダウンとギャップ閾値をわずかに緩め、追い取りが少し早く反応するようにしました（終了後の bulk 取得との併用は従来どおり）',
      'Chrome の拡張機能一覧と popup のバージョン表示が 0.1.103 になるよう更新しています。「更新」後に watch ページを再読み込みすると確実です'
    ])
  }),
  Object.freeze({
    version: '0.1.102',
    date: '2026-05-01',
    summary: '0.1.101 が popup 起動を阻害した件を緊急 revert',
    items: Object.freeze([
      '0.1.101 で投入した「userLaneHttpForTilePick の universal rule guard 強化」が、何らかの経路で popup 起動を阻害してしまう不具合を引き起こしました。実機検証で popup が出てこない症状が確認できたので緊急に revert します',
      '機能としての挙動は 0.1.100 と同じに戻ります。grid に broadcaster の顔タイルが残る件は引き続き残課題ですが、popup が動かないほうが優先度高なのでこの判断にしました',
      '原因の特定と安全な再投入は別 commit で。観測層 Phase 1+Phase 2（StatObservation/observationStore）は runtime に触れないので残します'
    ])
  }),
  Object.freeze({
    version: '0.1.100',
    date: '2026-05-01',
    summary: '配信者本人の自コメは story grid から除外',
    items: Object.freeze([
      '配信者が自分の放送で post したコメが story growth grid (タイル系) や集計件数に含まれていた件を修正しました。配信者は応援される側で応援する側ではないため、popup の表示経路（grid / 件数 / lane / ticker）から除外します',
      '修正内容: 純関数 excludeBroadcasterFromCommentEntries を追加し、refresh の displayEntries 構築直後に適用。HTML レポート側では既に同等の inline filter が動いていたので、popup display 経路を統一しました',
      '配信者本人カードは watchMetaCache.snapshot.broadcaster* から別経路で描画されるため、配信者の表示情報自体は失われません。配信者は dedicated card のみに集約されます'
    ])
  }),
  Object.freeze({
    version: '0.1.99',
    date: '2026-05-01',
    summary: 'コメント単位 rendering でも avatar 取り違えを検出',
    items: Object.freeze([
      'rank strip の左端タイル (155 タイル系) に「ID 未取得（DOM に投稿者情報なし）」のコメと一緒に配信者の顔アイコンが乗る現象を修正しました。0.1.98 までは集約 room 単位の sanitize でしか filter していなかったため、コメント単位 rendering を経由するこの経路には届いていませんでした',
      '修正内容: 0.1.83 普遍ルール (isAvatarUrlForUserId) を厳格化。entry uid が空 / niconico 匿名 (a:xxx) の entry に niconico user icon が紐付いていたら必ず reject する。avatar 取り違えガードがコメ・room 両方の表示経路に効くようになります',
      '影響範囲: storyGrowthAvatarSrcCandidate, intercept hydration, profile cache の avatar 採用判定。test stub のような数値でも a:xxx でもない uid は従来どおり判定不可で通すので互換性は維持'
    ])
  }),
  Object.freeze({
    version: '0.1.98',
    date: '2026-05-01',
    summary: '他人の avatar 取り違えも broader に検出',
    items: Object.freeze([
      '0.1.97 までは「現配信者の icon」だけを strip 対象にしていましたが、複数 lv を行き来した時に snapshot の broadcaster uid が前の lv のままになるケースがあり、別 lv の broadcaster や他の viewer の icon が取り違えで残ったままだった件を修正',
      '修正: filter を「現配信者 1 人」に依存させず、avatar URL から niconico uid を抽出して entry uid と一致するかを純粋にチェックするロジックに変更。匿名 (a:xxx) / UNKNOWN entry に niconico user icon が乗っていたら問答無用で strip し、数値 uid entry の URL uid が entry uid と異なれば取り違えとして strip',
      'これで「他の人の icon が別の人にずれて出る」現象も同じ仕組みで補正されます。匿名は identicon に、UNKNOWN は何も表示しない fallback に倒れます'
    ])
  }),
  Object.freeze({
    version: '0.1.97',
    date: '2026-05-01',
    summary: '配信者 icon の取り違えをサイズ違いでも検出',
    items: Object.freeze([
      'rank strip の 1 番目（uid 不明の room）に配信者の顔アイコンが乗ってしまう症状を修正しました。原因は broadcaster icon が `/s/`・`/uri150x150/`・`/m/` などサイズ違いで storage に焼き込まれていた場合、URL 文字列一致で contamination 判定していたために stripped されていなかったことです',
      '修正内容: avatar URL から niconico uid を抽出し broadcasterUid と一致するかで判定するように強化（サイズ違い・query 違いを問わず検出）。URL 文字列一致は uid を含まない非標準 URL の fallback として残しています',
      'これで「ID 未取得（DOM に投稿者情報なし）」のコメントが配信者アイコンを抱き込んで rank strip 1 番目に出る現象が消えます'
    ])
  }),
  Object.freeze({
    version: '0.1.96',
    date: '2026-05-01',
    summary: '診断バンドルに snapshot 情報を追加',
    items: Object.freeze([
      '配信者がりんく lane に出続ける件の原因切り分けのため、AI 共有用診断バンドルに watchMetaCache.snapshot の broadcasterUserId / broadcasterName / viewerUserId を含めるようにしました（個人特定可能情報は既に他経路で扱っているもののみ）',
      'これで「snapshot の broadcasterUserId が空でフィルタが no-op になっている」のか「broadcasterUid は取れているが別経路で混入している」のかが診断バンドル 1 つで判別できるようになります'
    ])
  }),
  Object.freeze({
    version: '0.1.95',
    date: '2026-05-01',
    summary: '配信者が rank strip と専用カードに二重表示される件を修正',
    items: Object.freeze([
      '配信者が自分の放送でコメントを多めにすると、応援ランクストリップの 1〜10 にも入って「専用カード（末尾）」と二重表示されていた件を修正しました。配信者は応援される側で応援する側ではないため、rank strip 集計から明示的に除外します',
      'HTML レポート側で同じ意味の inline filter が既にあったので、新ヘルパー excludeBroadcasterFromRankedRooms に統一（DRY）。将来「集計除外ルール」が変わった時に 1 箇所で済む',
      'avatarResolver.js (0.1.84 で実装、0.1.90 で revert 後 dead code) のヘッダに「現状未配線」明記。再配線時は docs/plan-avatar-resolver-refactor.md の 5 phase に沿う旨を残置'
    ])
  }),
  Object.freeze({
    version: '0.1.94',
    date: '2026-05-01',
    summary: 'INLINE モードで「接続中…」固定の race を根治',
    items: Object.freeze([
      'INLINE モード（拡張をニコ生 watch ページに埋め込んだ状態）で 推定同接 / 来場者数が「（接続中…）」のまま固定される race condition を根治しました。0.1.91-0.1.93 の 3 連続修正でも残っていた症状の真因です',
      '真因: popup-entry.js#refresh() が世代番号で守られている設計だが、watch snapshot の merge も世代の bail-out の後ろにあったため、INLINE polling=10 秒 × slow fetch=最大 11 秒の組み合わせで 1 回目の取得結果が常に破棄されていました',
      '修正内容: snapshot は世代を超える永続キャッシュとして isFreshRefresh() の bail-out より先に merge するよう、純関数 popupWatchSnapshotPersist.js を新設して責務を分離。paint や derived UI 更新は引き続き世代で守る',
      '副作用修正: INLINE モードの visibilitychange 時にも snapshot=null クリアが残っていた漏れを撤去（タブ切替で戻った瞬間に「接続中…」が再点灯する症状の防止）'
    ])
  }),
  Object.freeze({
    version: '0.1.93',
    date: '2026-05-01',
    summary: 'lv 切替時は stale を捨てる修正',
    items: Object.freeze([
      '0.1.92 の stale-while-revalidate で、別配信に切り替わった時も古い snapshot を表示し続けるバグを修正。同じ lv の polling 再 fetch では stale を維持し、別 lv に切り替わった時のみ snapshot をクリアします',
      '効果: 多タブ運用で配信を切り替えても、別放送の数値が表示され続けることがなくなります。同じ放送内の polling では引き続き flicker しません',
      '判定: snapshot.liveId === 現在の lv で「同じ放送」と判定'
    ])
  }),
  Object.freeze({
    version: '0.1.92',
    date: '2026-05-01',
    summary: '数字ちらちら + 接続中固定の根治',
    items: Object.freeze([
      '推定同接 / 来場者数が「（接続中…）」のまま、または ちらちら点滅する症状を根治しました。原因は polling 時に snapshot を null クリアして loading 状態を再表示する設計でした',
      '修正内容: stale-while-revalidate パターンに変更。古い snapshot を fetch 中も保持し続けて表示する。新しい fetch が成功したら ATOMIC に置き換える。fetch 失敗時も古い表示が残る（「接続中…」点滅なし）',
      '具体的には popup-entry.js の polling と refresh で watchMetaCache.snapshot = null を撤去し、古いデータを loading 中も表示用に維持。loading ラベルは初回 fetch のみで表示し、stale snapshot がある場合はスキップ'
    ])
  }),
  Object.freeze({
    version: '0.1.91',
    date: '2026-05-01',
    summary: 'fetch hang を防ぐ + ちくらん URL 修正',
    items: Object.freeze([
      '推定同時接続/来場者数が「（接続中…）」のまま停滞する症状の対策。requestWatchPageSnapshotFromOpenTab の await が例外を投げると後続の watchMetaCache.fetchInflight = false が実行されず、永久に「（接続中…）」が表示される設計上の脆さを修正',
      '修正内容: popup-entry.js の snapshot fetch を try/catch/finally で囲み、例外時も必ず fetchInflight=false に戻す。snapshot は null、fetchError にメッセージを格納して fetch_failed 経路に倒す',
      'これで snapshot 取得失敗時も「（取得不可）」表示に進めるようになり、永久 loading 状態は発生しなくなります'
    ])
  }),
  Object.freeze({
    version: '0.1.90',
    date: '2026-05-01',
    summary: 'avatar refactor の影響切り分け revert',
    items: Object.freeze([
      '0.1.89 後にユーザーから「推定同時接続・来場者数が（接続中…）のまま、記録カウントも安定して出ない」報告があり、0.1.85 の avatar refactor (storyGrowthAvatarSrcCandidate を avatarResolver 化) を念のため revert しました',
      'avatar 取り違え修正（0.1.83 の普遍ルール）は維持。0.1.84 の avatarResolver 基盤コンポーネントも残置（他コードからは未使用）。CSS 系の修正（0.1.86/0.1.89 スクロールバー、0.1.88 パネル位置）も維持',
      '回帰の真因はまだ不明。0.1.90 で症状が変わるか、無関係（環境要因）か切り分けるための退避バージョン'
    ])
  }),
  Object.freeze({
    version: '0.1.89',
    date: '2026-05-01',
    summary: 'スクロールバー 2 重修正（host 側 overflow 撤去）',
    items: Object.freeze([
      '0.1.86 で popup window mode は対処しましたが、複数タブ同時視聴時に inline panel mode（dock_bottom / floating）でも 2 重 scrollbar が出ていました',
      '原因: src/extension/content-entry.js の renderInlinePanelDockBottomHost / renderInlinePanelFloatingHost で host (iframe wrapper) に overflow:auto を設定していたため、iframe 内部の .nl-main scrollbar と二重になっていました',
      '修正内容: 両関数の host.style.overflow を auto → hidden に変更。host は iframe より 16px 大きいだけで内側に余裕があり、外側 scrollbar は不要です。iframe 内部の正規 scrollbar は維持されます',
      'これで複数タブ視聴時も inline panel に scrollbar 1 本だけになります'
    ])
  }),
  Object.freeze({
    version: '0.1.88',
    date: '2026-05-01',
    summary: 'パネルが page 末尾に出るバグの修正',
    items: Object.freeze([
      'ニコ生 SEKIRO 系の縦積みレイアウトで、配信パネルがページの最下部（タグ・関連作品・アドバナーの下）に挿入されてしまう不具合を修正しました',
      '修正内容: src/lib/inlineHostAnchorScoring.js の maxHeightRatioToVideo を 3.5 → 2.0 に絞りました。3.5 だと「video + タグ + 配信者情報 + 関連作品 + アドバナー」までを含む巨大なラッパーまで eligible 判定されてしまい、その直後にパネルが挿入されていました',
      '2.0 では「video + 公式コメント列 + UI 1〜2 段」程度までしか eligible にならず、player の真下に正しく配置されます'
    ])
  }),
  Object.freeze({
    version: '0.1.87',
    date: '2026-05-01',
    summary: 'グリッドが新コメ無しで動くのを修正',
    items: Object.freeze([
      'コメント追加が無いのにアイコングリッドの最後尾が pulse（光る演出）するのを修正しました。avatar URL がキャッシュ補完などで後から埋まる度に「新コメ追加」と同じ演出が走っていました',
      '修正内容: popup-entry.js の syncStoryGrowth 内で、signature の変化（avatar URL 補完等）による再同期では pulseLast: false に変更。新規コメ追加（renderedCount < targetCount）の経路のみ pulseLast: true で光らせる',
      '既存の「新コメが来たら最後尾が一瞬光る」演出は変わりません'
    ])
  }),
  Object.freeze({
    version: '0.1.86',
    date: '2026-05-01',
    summary: 'スクロールバー 2 重の修正',
    items: Object.freeze([
      'popup window が縦に小さい時、html height (580px 等) が viewport を超えると、popup window 自体に scrollbar が出て、内側の .nl-main の scrollbar と二重になっていました',
      '修正内容: extension/popup.html の html:not(.nl-inline) と body の height/max-height を min(--nl-pop-height, 580px, 100vh) でクランプ。viewport を超えないので popup window 側に scrollbar が出なくなり、内部 .nl-main の 1 本のみになります',
      '大画面ではそもそも 2 重にならなかった（viewport が大きいので window scrollbar 不要）ため、本修正は小〜中画面で効果あり'
    ])
  }),
  Object.freeze({
    version: '0.1.85',
    date: '2026-05-01',
    summary: 'avatar 候補解決を resolver 経由に書換',
    items: Object.freeze([
      'popup-entry.js の storyGrowthAvatarSrcCandidate（アイコン列の avatar URL 決定）を、avatarResolver 経由に書き換えました。45 行の手書きガードロジックが 25 行のシンプルな observation 配列構築に置き換えられ、保守性が向上しています',
      '入力ソース 2 種（entry.avatarUrl, profile cache）を AvatarObservation に正規化して resolver に渡す形式に統一。ガード（uid mismatch / broadcaster impersonation / viewer impersonation）はすべて resolver 内で処理されます',
      '挙動は 0.1.84 と同等（既存 7 層ガードと resolver の判定結果が一致）。次の Phase E で旧コード削除予定'
    ])
  }),
  Object.freeze({
    version: '0.1.84',
    date: '2026-05-01',
    summary: 'avatar 解決の単一 component 化（基盤）',
    items: Object.freeze([
      'avatar 解決ロジックを単一の純粋関数 src/domain/user/avatarResolver.js に集約する基盤を実装しました（surechigai-lite の単一 store パターンを参考）。22 ケースの TDD 完備（合計 2153 件 PASS）',
      'shared レイヤに src/shared/avatar/avatarUrlGuard.js を新設し、URL helper（isSameAvatarUrl / extractNiconicoUserIdFromIconUrl / isAvatarUrlForUserId）を集約。レイヤ依存ルール（domain → shared）を遵守',
      'lib/avatarUrlCompare.js と lib/avatarBroadcasterGuard.js は shared への re-export shim に縮小（後方互換）。shouldAssociateAvatarWithUser は @deprecated とし、Phase E で削除予定',
      '今回 phase B 単体ではユーザー体験は変化しません。Phase C/D で書き込み・表示経路を段階的に resolver 経由に統合していきます'
    ])
  }),
  Object.freeze({
    version: '0.1.83',
    date: '2026-05-01',
    summary: '普遍ルール「URL の uid とエントリの uid 一致」で根治',
    items: Object.freeze([
      '0.1.76〜0.1.82 で broadcaster 情報に依存した個別ガードを 7 層積み上げてきましたが、永続キャッシュに焼き込まれた過去の汚染（過去 broadcast の broadcaster icon が viewer uid に紐付いている等）はガードがすり抜けて表示されていました',
      '修正内容: broadcaster 情報に依存しない普遍ルール「avatar URL に埋め込まれた uid とエントリの uid が一致しなければ取り違え」を実装（src/lib/avatarBroadcasterGuard.js#isAvatarUrlForUserId）。これを userCommentProfileCache.js の upsert / apply、interceptAvatarHydration.js、popup-entry.js の表示時 guard すべてに適用',
      '効果: 過去の汚染データ（どんな broadcaster の icon でも、どんな経路でも）も自動掃除。8 ケース TDD 追加（合計 32）',
      'これは Hoshino-Romi 流 clean design への第一歩。次フェーズで avatarResolver 単一 component に集約予定（docs/plan-avatar-resolver-refactor.md 参照）'
    ])
  }),
  Object.freeze({
    version: '0.1.82',
    date: '2026-05-01',
    summary: '永続キャッシュへの汚染書き込みを完全停止',
    items: Object.freeze([
      '0.1.76〜0.1.81 で計 6 層の表示時ガードを追加してきましたが、根本的に「永続キャッシュ（30 日保存される KEY_USER_COMMENT_PROFILE_CACHE）への書き込み時にガードが無く、書き込まれた汚染データが次セッションで in-memory cache に戻ってくる永続ループ」が原因で直っていませんでした',
      '修正内容: src/lib/userCommentProfileCache.js の upsertUserCommentProfileFromEntry / upsertUserCommentProfileFromIntercept に broadcasterContext 引数を追加。書き込み前に shouldAssociateAvatarWithUser でガード適用。content-entry.js の 3 箇所の呼び出し全てに broadcasterUid + broadcasterIconUrl を渡す',
      'さらに src/lib/interceptAvatarHydration.js の hydrateInterceptAvatarMapFromProfile（profile cache → intercept map への補完経路）にも同じガードを追加。これで 永続キャッシュに残った過去の汚染データも hydrate されなくなり、永続ループが断たれます',
      '正本設計書: docs/plan-avatar-resolver-refactor.md（avatar pipeline 統合 component の段階的 refactor 計画）'
    ])
  }),
  Object.freeze({
    version: '0.1.81',
    date: '2026-05-01',
    summary: 'プロファイルキャッシュ経由の汚染にも対応',
    items: Object.freeze([
      '0.1.80 で URL サイズ違いに対応しましたが、storyGrowthAvatarSrcCandidate という別経路で永続キャッシュ（KEY_USER_COMMENT_PROFILE_CACHE）から汚染データを読み出してフォールバックに使う処理が残っていたため、アイコン列のサムネが直っていませんでした',
      '修正内容: storyGrowthAvatarSrcCandidate 内の avatarUrl と rememberedAvatarUrlForUserId（プロファイルキャッシュ経由）両方に shouldAssociateAvatarWithUser ガードを適用。0.1.80 の URL 抽出ロジックがここでも機能するため、永続キャッシュに焼き込まれた broadcaster icon も表示時に除去されます'
    ])
  }),
  Object.freeze({
    version: '0.1.80',
    date: '2026-05-01',
    summary: 'avatar 取り違え修正の真因（URL サイズ違い）に対応',
    items: Object.freeze([
      '0.1.76〜0.1.79 で計 4 層のガードを入れましたが、すべて URL 完全一致（isSameAvatarUrl）で broadcaster icon を判定していたため、snapshot は 150x150 を返し、コメ harvester は s/ 小サイズを拾うサイズ違いで一致せず、4 層全部が空振りしていました（実際の汚染 URL: usericon/s/14367/143675916.jpg、snapshot: usericon/uri150x150/...）',
      '修正内容: avatarBroadcasterGuard.js に extractNiconicoUserIdFromIconUrl を追加し、URL 末尾の uid を抽出して broadcasterUid と直接照合するロジックを優先。サイズバリアント（s/m/l/uri150x150）に依存しない判定ができるようになりました',
      'これで 0.1.76〜0.1.79 の 4 層ガードが初めて正しく機能し、ギフト演出由来の取り違えが完全に解消されます。新規 12 ケースの TDD 追加（合計 36）'
    ])
  }),
  Object.freeze({
    version: '0.1.79',
    date: '2026-05-01',
    summary: 'アイコン列の汚染 avatar も表示時に補正',
    items: Object.freeze([
      '0.1.78 で aggregateCommentsByUser 経由（HTML レポート・上位ランク）はガードしましたが、応援ユーザーレーンのアイコン列は別経路（userLaneCandidatesFromStorage）を使っており、broadcaster icon の取り違えがそのまま表示され続けていました',
      '修正内容: src/lib/userLaneCandidatesFromStorage.js に broadcasterUid + broadcasterIconUrl の optional 引数を追加。viewer のコメ記録に焼き込まれた broadcaster icon と一致する URL を集約前に除外。popup-entry.js の syncStorySourceEntries から snapshot 経由でガード情報を渡す。6 ケース TDD 追加（合計 27）',
      'これで「アイコン列・グリッド・診断」セクションでも自分のサムネが正しい個人アイコンに戻ります'
    ])
  }),
  Object.freeze({
    version: '0.1.78',
    date: '2026-05-01',
    summary: 'コメ記録の汚染 avatar を表示時に補正',
    items: Object.freeze([
      '0.1.76 / 0.1.77 で intercept キャッシュと表示信号にガードを追加しましたが、過去のバージョンで chrome.storage に既に焼き込まれた nls_comments_* の avatarUrl は補正されませんでした。aggregateCommentsByUser が「最新コメ時刻の avatar」を採用する仕様のため、汚染レコードが残っている限り broadcaster icon が出続けていました',
      '修正内容: src/lib/sanitizeRoomAvatarsForBroadcaster.js を新設（純粋関数 + 13 ケース TDD）。aggregateCommentsByUser の出力に対し、broadcaster icon と一致する viewer の avatarUrl を空に倒す後処理を popup 表示と HTML レポート 2 箇所に適用',
      'これで chrome.storage 上の汚染データを削除しなくても、表示時に正しい canonical アイコンに戻ります（過去レコードに対する完全な後方互換補正）'
    ])
  }),
  Object.freeze({
    version: '0.1.77',
    date: '2026-05-01',
    summary: 'avatar 取り違え修正の表示時ガード追加',
    items: Object.freeze([
      '0.1.76 で intercept キャッシュへの broadcaster icon 紐付けを止めましたが、コメ記録に既に焼き込まれた avatarUrl までは戻せませんでした。0.1.77 で表示時にも同じガードを掛けることで、過去の汚染データも自動で正しい canonical アイコンに置き換わるようにしました',
      '修正内容: src/lib/userEntryAvatarResolve.js（resolveUserEntryAvatarSignals）の入力 3 ソース（rowAv / interceptEntryAv / interceptMapAv）すべてに対し、broadcaster icon と一致する URL は viewer 本人でない限り無効化（canonical fallback に倒す）。16 ケース TDD（既存 9 + 新規 7）',
      'これで「キャッシュクリアしないと直らない」状態が解消され、拡張更新後の最初のコメ受信から正しい表示に戻ります'
    ])
  }),
  Object.freeze({
    version: '0.1.76',
    date: '2026-05-01',
    summary: 'ギフト演出 DOM での avatar 取り違え修正',
    items: Object.freeze([
      'ニコ生でアイテム（ギフト）を投げた直後に、応援者リスト（アイコン列）に表示される自分のサムネイルが配信者のアイコンに化けてしまう不具合を修正しました',
      'ギフト演出 DOM では送信者の情報行に配信者アイコンも並んで描画される構造になっており、本拡張の avatar 観測が誤って「viewer の uid に broadcaster icon を紐付け」してしまうのが原因でした',
      '修正内容: avatar を uid に紐付ける直前に「その avatar が現在の broadcaster icon と一致するなら、その uid が broadcaster 本人でない限り紐付けを skip する」純粋関数ガード（src/lib/avatarBroadcasterGuard.js, 12 ケース TDD）を追加。content-entry.js の 4 箇所すべてに適用',
      '既に化けてしまっているキャッシュは、popup の「キャッシュクリア」ボタンで一度クリアすると、次回コメ受信時から正しく表示されます'
    ])
  }),
  Object.freeze({
    version: '0.1.67',
    date: '2026-05-01',
    summary: '関係ないタブで開く時のパネルを Chrome 統合に',
    items: Object.freeze([
      'watch じゃないタブで拡張アイコンを押した時、これまでは独立した popup window が Chrome から離れて表示されることがありました。これを Chrome 標準のサイドパネル（画面右側に統合）に変更しました。Chrome のウィンドウから離れて表示される問題が根本解決し、配信視聴中の inline panel と同じような一体感のある UX になります',
      '従来の popup window は、サイドパネルが使えない環境では fallback として残ります。設定で「常に popup window を開く」を選んでいた人は従来通りの挙動です'
    ])
  }),
  Object.freeze({
    version: '0.1.66',
    date: '2026-05-01',
    summary: '横付きパネルの幅・高さをどの画面サイズでも最適化',
    items: Object.freeze([
      '「横付き」モードで広い画面（1920px 級）でパネルが画面右にはみ出して「来場者数」が見切れる問題を修正。利用可能な右側余白を厳密に測り、足りなければ自動で「プレイヤー行の下」に切り替えるようになりました',
      '「横付き」モードで超広画面（2000px 級）でパネルが縦に間延びして下半分が空白になる問題を修正。動画+公式コメ列の高さに揃えて、空白なくぴったり収まるようになりました',
      'ウィンドウのリサイズ・全画面切替・モニタ移動時に、横付きパネルもリアルタイムで追従するようになりました（debounce 150ms）'
    ])
  }),
  Object.freeze({
    version: '0.1.65',
    date: '2026-05-01',
    summary: '画面下パネルの高さをどの画面サイズでも最適化',
    items: Object.freeze([
      '「画面下いっぱい」モードのパネル高さが viewport の 50% で固定だったため、大画面では下半分占有・小画面では動画圧迫の両極端になっていた問題を根本修正。動画+公式コメ列が画面で実際に占めている縦範囲を測定し、その残りスペースに自動でパネルを収めるよう変更。720p ノートから 4K 縦置きまで、どの画面サイズでも自動最適化されます',
      'ウィンドウサイズ変更（リサイズ・全画面切替・モニタ移動など）にもリアルタイム追従するようになりました（debounce 150ms）'
    ])
  }),
  Object.freeze({
    version: '0.1.64',
    date: '2026-05-01',
    summary: 'パネル位置の根治＋popup 表示まわりの不具合修正',
    items: Object.freeze([
      'watch ページのパネルが「ページ最下部（amazon・関連配信の後ろ）」に出る現象の根本原因（祖先候補の選定が緩く、視聴行+コメ欄+バナー一式の巨大ラッパーまで拾っていた）を修正。判定を純粋関数に切り出し、video の rect とのジオメトリ整合（幅比 0.95–1.6・top オフセット 120px・aspect 上限 2.6・面積上限 viewport 60%）まで含めて厳格化しました（0.1.63 の応急 migration と組み合わせて二重で改善）',
      'ツールバーから popup を開いた時、popup window の中に冗長な「君斗りんくの追憶のきらめき」ロゴ帯が出ていて Chrome 自身のタイトルバーと「枠が 2 つ」に見えていた問題を修正。standalone window では内部ヘッダーを非表示にしました',
      '5 モニタなどの多モニタ環境で、popup window が Chrome window の隣のモニタに飛んでしまう問題を修正。popup を Chrome window の右内側に配置するよう変更し、必ず Chrome のいるモニタに popup が出るようになりました（Chrome の content 右側と少し被るのは許容）',
      '画面幅が約1200px未満で「横付き」を選んでも自動で「プレイヤー行の下」と同じ動作になる仕様について、見落とされやすかったヒント文を警告調（黄色背景 + 太字）に強調しました'
    ])
  }),
  Object.freeze({
    version: '0.1.63',
    date: '2026-05-01',
    summary: '配信時のパネル位置を player の近くに戻す',
    items: Object.freeze([
      'watch ページのパネルが「ページ最下部（amazon・関連配信の後ろ）」に出るようになっていた問題を修正。「プレイヤー行の下」設定の人を「画面下いっぱい（既定）」に一度だけ自動移行し、player と panel が常に viewport 上でセットで見える状態に戻します（意図して「下」を選んでいた場合は設定画面から再度切り替え可能）'
    ])
  }),
  Object.freeze({
    version: '0.1.62',
    date: '2026-05-01',
    summary: 'popup を Chrome 右端に密着',
    items: Object.freeze([
      'popup と Chrome ウィンドウの間に隙間があった問題を修正。Chrome の右端ぴったりに popup の左端を合わせ、上端も揃えて隣接配置（隙間ゼロ）'
    ])
  }),
  Object.freeze({
    version: '0.1.61',
    date: '2026-05-01',
    summary: 'popup を Chrome の右側に隣接配置',
    items: Object.freeze([
      'popup が Chrome ウィンドウの中央に被さって「ボックスの中にあるかんじ」になる問題を修正。Chrome ウィンドウの右側に隣接する位置に popup を配置するよう変更（Chrome の content に重ならない）'
    ])
  }),
  Object.freeze({
    version: '0.1.60',
    date: '2026-05-01',
    summary: '複数モニタ時に popup を同じ画面に出す',
    items: Object.freeze([
      'モニタが複数あるとき popup が別モニタに開く問題を修正。直前に使っていた Chrome ウィンドウの中央に popup を配置するよう変更（同じモニタに出る）'
    ])
  }),
  Object.freeze({
    version: '0.1.59',
    date: '2026-05-01',
    summary: 'popup を毎回作り直して横長を確実に解消',
    items: Object.freeze([
      'popup window が横長で開いて空白だらけになる問題を確実に修正。0.1.58 では update でサイズ変更を試みたが Chrome が無視するケースがあったため、既存 popup を一度閉じて 420×780 で新規作成する形に変更（state:normal も明示）'
    ])
  }),
  Object.freeze({
    version: '0.1.58',
    date: '2026-05-01',
    summary: 'popup window サイズを毎回 420×780 にリセット',
    items: Object.freeze([
      'popup window が横に間延びして右側が空白だらけになる「レイアウトガタガタ」現象を修正。Chrome が以前のサイズを記憶していた問題で、popup を開くたびに 420×780 に強制リセットするよう変更'
    ])
  }),
  Object.freeze({
    version: '0.1.57',
    date: '2026-05-01',
    summary: '何もない時は前放送データを出さない',
    items: Object.freeze([
      'watch ページ以外で popup を開いた時に、storage 由来の前放送データ（記録 N 件・(取得不可) など）が表示されてレイアウトがガタガタになる問題を修正。アクティブな watch タブが無いときは「（ニコ生 watch を開いてください）」placeholder + ランキング導線のみのスッキリ表示に統一'
    ])
  }),
  Object.freeze({
    version: '0.1.56',
    date: '2026-05-01',
    summary: 'ランキング導線を最上部に固定表示',
    items: Object.freeze([
      'popup でランキング導線が出ない問題を確定的に修正。section 配置を version badge の直下（最上部）に移動し、display:block !important + 目立つオレンジ色枠線で必ず見える形にしました（INLINE_MODE のときだけ display:none）'
    ])
  }),
  Object.freeze({
    version: '0.1.55',
    date: '2026-05-01',
    summary: 'ランキング導線を確実に表示',
    items: Object.freeze([
      'popup を開いてもランキング導線が出ない問題を確実に修正。HTML の hidden 属性デフォルトを撤去し、popup window では最初から表示状態に変更（watch ページ内のパネル iframe では JS で hidden を付ける）'
    ])
  }),
  Object.freeze({
    version: '0.1.54',
    date: '2026-04-30',
    summary: 'ランキング導線を常時表示に',
    items: Object.freeze([
      'ツールバーから popup を開いた時にランキング導線が出ない問題を修正。複数 window 環境で source 検出が想定どおり動かないケースがあったため、popup window では常に導線を表示する形に変更（watch ページ内のパネル iframe では非表示）'
    ])
  }),
  Object.freeze({
    version: '0.1.53',
    date: '2026-04-30',
    summary: 'ランキング導線の表示条件を厳密化',
    items: Object.freeze([
      'watch 以外のページで popup を開いてもランキング導線が出ず、前に見た放送のデータが表示される問題を修正。アクティブタブが watch ページじゃない時は必ずランキング導線を出すように変更（storage fallback の影響を受けないよう判定強化）'
    ])
  }),
  Object.freeze({
    version: '0.1.52',
    date: '2026-04-30',
    summary: '何もない時はニコ生ランキング導線',
    items: Object.freeze([
      'watch ページ以外で popup を開いた時に、ニコ生トップ・生放送ランキング・ちくらん・直近開始の放送 へのリンクを表示。気になる放送をすぐ探せるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.51',
    date: '2026-04-30',
    summary: 'popup の dark を完全に撤去',
    items: Object.freeze([
      'popup を開いたときに dark テーマで真っ黒になる問題を完全修正。0.1.50 で OS の dark 設定検出に切り替えたが、Chrome のテーマや Windows のシステム配色で誤って dark と判定されるケースが残ったので、light 配色（クリーム色背景）固定に変更'
    ])
  }),
  Object.freeze({
    version: '0.1.50',
    date: '2026-04-30',
    summary: 'popup の黒テーマ強制を撤去（部分）',
    items: Object.freeze([
      'ツールバーから popup を開いた時に常に真っ黒だった件の対策（OS の dark 設定検出に切替、後の 0.1.51 でさらに完全 light 化）'
    ])
  }),
  Object.freeze({
    version: '0.1.49',
    date: '2026-04-30',
    summary: 'マーケ分析に動的アドバイスを追加',
    items: Object.freeze([
      'マーケ分析の各セクションに「データに応じて変わるキャラ別アドバイス」を追加。KPI / 同接 / 笑い / 新規 vs 常連 / 沈黙 / 感情 / リーチ / 成長 / 初コメ / 生存曲線 / キーボード型 / コメ伝染 / 直近比較 / 波形 / 言わなかった人気語 / 話芸ピーク の 16 セクション × 100+ ルールで具体的な助言を出します（既存の固定アドバイスはそのまま、その後ろに追加表示）'
    ])
  }),
  Object.freeze({
    version: '0.1.48',
    date: '2026-04-30',
    summary: '大規模配信のマーケ分析を安定化',
    items: Object.freeze([
      '人気配信者の 8 万コメ超放送でマーケ分析がスタックオーバーフローで無症状失敗していた問題を修正（Math.min/max の spread を for ループ化）'
    ])
  }),
  Object.freeze({
    version: '0.1.47',
    date: '2026-04-30',
    summary: '同接カーブと連打事故防止',
    items: Object.freeze([
      '同接推移カーブが「公式があれば公式・なければ推定」の二者択一で稀に取れる公式値があると推定値 90% を捨ててグラフがほぼ空になっていた問題を修正。各サンプル単位で公式優先 → 無ければ推定にフォールバックする hybrid に変更',
      'HTML レポートボタン / スクショボタンの連打で重複ダウンロードが起きていた問題を修正（処理中はボタンを disable）'
    ])
  }),
  Object.freeze({
    version: '0.1.46',
    date: '2026-04-30',
    summary: 'マーケ分析の精度向上',
    items: Object.freeze([
      'マーケ分析の KPI 集計から配信者本人のコメント（合いの手等）を除外（CPM・ユニーク・タイムラインが歪んでいた問題）',
      'コメ被り検出（伝染・被り瞬間）が複数人の同時バーストを 1 件として扱っていた問題を修正（同秒・同テキスト・別ユーザーを別行扱いに）'
    ])
  }),
  Object.freeze({
    version: '0.1.45',
    date: '2026-04-30',
    summary: '裏側のクリーンアップとプライバシー',
    items: Object.freeze([
      '拡張リロード後に長時間放置すると裏でタイマーが回り続けて CPU を消費していた問題を修正（pageFrameLoopTimer も停止対象に追加）',
      'AI 診断（共有テキスト）に保存する watch URL から query / fragment を削除（万一個人情報を含む token が乗っていた場合の漏洩を抑止）'
    ])
  }),
  Object.freeze({
    version: '0.1.44',
    date: '2026-04-30',
    summary: '裏側のメモリ効率と整合性',
    items: Object.freeze([
      'サムネイル保存時に過去の全サムネを毎回メモリ展開していた処理を cursor + count() ベースに変更。長時間視聴のメモリスパイクを抑止',
      '自動バックアップの状態管理で content と background SW の同時書き込みによる重複バックアップを抑止（write 直前に fresh re-read で merge）'
    ])
  }),
  Object.freeze({
    version: '0.1.43',
    date: '2026-04-30',
    summary: 'パネルが開かない事象の修正',
    items: Object.freeze([
      'kon-ta クリックしてもパネルが開かない事象を修正。focus 判定を強化し、host が DOM 上でも display:none / visibility:hidden の場合は popup window へフォールバックするよう変更（純粋関数 + テスト 7 ケース追加）',
      '内部: content script の onMessage listener を idempotent に変更（SPA 再注入時の二重応答 → port closed エラー対策）'
    ])
  }),
  Object.freeze({
    version: '0.1.42',
    date: '2026-04-30',
    summary: 'パネル準備の競合解消',
    items: Object.freeze([
      '複数 watch タブ並行時に kon-ta クリック→パネル表示までが遅くなる問題を修正。chrome.storage.local の lease を使って同時にパネル準備（prewarm）を走らせるタブを 1 つに絞り、CPU 取り合いを抑止（純粋関数 + 10 ケース TDD）'
    ])
  }),
  Object.freeze({
    version: '0.1.41',
    date: '2026-04-30',
    summary: '深層監査の結果を反映',
    items: Object.freeze([
      '配信者タイルが「出たと思ったら消える」事象を修正（30 秒ごとの再取得で broadcaster 系が空のとき旧値を保つ partial-merge を導入、純粋関数 + 11 ケース TDD）',
      '複数タブで kon-ta パネルの記録件数 / ランクストリップが混信する事象を修正（standalone popup window から「直前の通常 window のアクティブタブ」を拾うよう判定追加、純粋関数 + 8 ケース TDD）',
      'コメ取り込み率が 17% 程度に低下していた事象を修正（NDGR が active な間 deep harvest を全 skip していたが、5 分以上 deep が走っていなければ強制実行する recovery を runDeepHarvest 内部にも結線）'
    ])
  }),
  Object.freeze({
    version: '0.1.40',
    date: '2026-04-30',
    summary: '公式チャンネル放送の配信者タイル復活',
    items: Object.freeze([
      '公式チャンネル放送（運営・業者）で配信者タイルが出ていなかった事象を修正。embedded-data の supplier.name は提供会社名（例「株式会社ドワンゴ」）でチャンネル名ではないため、socialGroup.name / socialGroup.socialGroupPageUrl を優先するように変更。アイコンも socialGroup.thumbnailImageUrl 等を読むように追加（純粋関数 + 19 ケース TDD）'
    ])
  }),
  Object.freeze({
    version: '0.1.39',
    date: '2026-04-30',
    summary: '配信者リンク誤検出の再発防止',
    items: Object.freeze([
      '配信者タイルが関連配信枠の別人を指してしまう事象（0.1.38 の追加対策）。DOM 候補から ?ref=watch_user_information マーカ付き anchor を最優先にして二重防御。同種の検出ロジックを使う別関数（detectBroadcasterUserIdFromDom）も同じ防御に統一',
      'アバター URL 比較ヘルパ（avatarCompareKey / isSameAvatarUrl）を src/lib/avatarUrlCompare.js に切り出し（純粋関数 + 14 ケース TDD）。query/hash 違いを「同じアバター」として扱うロジックの単体検証を強化'
    ])
  }),
  Object.freeze({
    version: '0.1.38',
    date: '2026-04-30',
    summary: '配信者タイルのリンク先を修正',
    items: Object.freeze([
      '配信者タイルからクリックした時に別人のページに飛ぶ事象を修正（embedded-data の supplier.programProviderId を最優先に）。本配信者がレーンに混入する原因にもなっていた箇所',
      'コメ送信エラー時の再読み込み案内ロジックを src/lib/commentSendTroubleshootHint.js に切り出し（純粋関数 + 7 ケース TDD）'
    ])
  }),
  Object.freeze({
    version: '0.1.37',
    date: '2026-04-30',
    summary: '内部の重複定義を整理',
    items: Object.freeze([
      'ストーリータイルの「ゆっくり風キャラ画像か判定」を src/lib/storyTileTvStyle.js に切り出し',
      'isContextInvalidatedMessageText の重複定義を撤去（既存の isContextInvalidatedError に一本化）'
    ])
  }),
  Object.freeze({
    version: '0.1.36',
    date: '2026-04-30',
    summary: '内部コンポーネント分割の続き',
    items: Object.freeze([
      'popup-entry.js から watch タブの並び替え関数（prioritizeWatchTabCandidates）を src/lib/watchTabPrioritize.js に切り出し',
      '純粋関数 + TDD 9 ケースで単体検証可能に。今後の挙動修正でリスクを下げる準備'
    ])
  }),
  Object.freeze({
    version: '0.1.35',
    date: '2026-04-30',
    summary: '仕様注記の追加と内部分割の小さな一歩',
    items: Object.freeze([
      'マーケ分析の離反/出席/サムネ一覧に「表示名はコメ記録時点のもの（仕様）」の注記を追加。配信者がハンドルを変えた場合の挙動を明記',
      '内部リファクタ: popup-entry.js から formatDateTime を src/lib/formatDateTime.js に切り出し（コンポーネント分割の第一歩）'
    ])
  }),
  Object.freeze({
    version: '0.1.34',
    date: '2026-04-30',
    summary: '離反/出席にニックネームを表示',
    items: Object.freeze([
      '離反コメンター TOP / 常連出席カレンダーで、過去配信から拾えたニックネームをユーザー欄に表示',
      'ID だけでは誰か思い出せない問題を改善（数値 ID もハンドル名つきで表示）'
    ])
  }),
  Object.freeze({
    version: '0.1.33',
    date: '2026-04-30',
    summary: 'パネル準備時間を短縮（2秒→0.8秒）',
    items: Object.freeze([
      'パネルiframe の事前ロード（prewarm）の起動タイミングを 2 秒後 → 0.8 秒後に短縮。kon-ta 即押し時の体感反応を改善'
    ])
  }),
  Object.freeze({
    version: '0.1.32',
    date: '2026-04-30',
    summary: '複数タブ時の panel 反応性を改善',
    items: Object.freeze([
      'バックグラウンドのタブでは panel iframe の事前ロード（prewarm）をスキップ。複数の watch タブを同時に開いた時、CPU/帯域の取り合いで kon-ta 押下時の体感反応が悪化していた問題を抑止',
      'タブが可視化された時に prewarm が自動再スケジュールされる仕組みを追加'
    ])
  }),
  Object.freeze({
    version: '0.1.31',
    date: '2026-04-30',
    summary: '連続DL時のメモリ使用量を削減',
    items: Object.freeze([
      'HTMLレポート/マーケ分析/セッション要約のダウンロード時、blob URL の片付けを 60 秒待機 → 15 秒待機 + 同時 3 個までの queue 管理に変更',
      '連続でダウンロードしたときに blob データがメモリに長く残る問題を抑止'
    ])
  }),
  Object.freeze({
    version: '0.1.30',
    date: '2026-04-30',
    summary: 'マーケDLの読み込み負荷を削減',
    items: Object.freeze([
      'マーケ分析DL時、過去配信の読み込み方法を「全ストレージ走査」から「最近10配信を IDB index で特定して該当キーだけ取得」に変更',
      '配信記録が多いユーザでマーケ分析DLが重かった問題を改善'
    ])
  }),
  Object.freeze({
    version: '0.1.29',
    date: '2026-04-30',
    summary: '拡張更新時の片付けを強化',
    items: Object.freeze([
      '拡張リロード後に旧 MutationObserver が DOM 変化のたびに走り続ける問題を抑止（context invalidate 時に disconnect）',
      'サムネ自動撮影タイマー（thumbTimerId）も拡張リロード時に停止',
      'まれに content script が二度起動した時の旧 observer 残留を防ぐ start() 冒頭の defensive disconnect を追加'
    ])
  }),
  Object.freeze({
    version: '0.1.28',
    date: '2026-04-30',
    summary: '深層監査の高優先度 race / leak を修正',
    items: Object.freeze([
      'page-intercept の setInterval（fiber スキャン・stats poll）の id を保持し、SPA 遷移で非 watch ページに変わった時に clearInterval する仕組みを追加（CPU・帯域消費の蓄積を防止）',
      'popup の refresh 経路でストレージ書き込み直前の世代チェックを追加（古い refresh が新しい refresh の取得結果を上書きするコメ汚染リスクを抑止）'
    ])
  }),
  Object.freeze({
    version: '0.1.27',
    date: '2026-04-30',
    summary: 'マーケ分析の表示改善＋パネル安定化',
    items: Object.freeze([
      '離反コメンター TOP・常連出席カレンダーにサムネイル列とユーザー ID 列を追加',
      'マーケ分析の各 PRO セクション直後に「りんく・こん太・たぬ姉」のキャラ解説を追加（このデータで何がわかるか）',
      'インラインパネルが複数表示される race を抑止（singleton と DOM の対応関係を追従）',
      'iframe ロード中にパネルが消えたり再生成されたりするフリッカーを抑止'
    ])
  }),
  Object.freeze({
    version: '0.1.26',
    date: '2026-04-30',
    summary: '表現修正・目次の自動絞り込み・マーケDLボタン追加',
    items: Object.freeze([
      '「アヘ顔密度」セクションを「笑い密度」（盛り上がり指標）に改名',
      'HTML 保存ボタンの横に「📊 マーケ」クイックボタンを追加（マーケ分析HTMLをそこからすぐ保存）',
      'マーケ分析HTMLとHTMLレポートの目次（TOC）を自動絞り込み（データ無しで描画されないセクションのリンクを目次から除外）',
      '目次のアンカーリンクをクリックしたとき何も起こらなかった不具合を解消'
    ])
  }),
  Object.freeze({
    version: '0.1.25',
    date: '2026-04-30',
    summary: 'マーケ分析に文化分析 7 種追加',
    items: Object.freeze([
      'マーケ分析に「コメ伝染」と「コメ被り瞬間」を追加（短時間に同じ語が複数ユーザーから出るパターン、ラテラル L1/L5）',
      'マーケ分析に「初コメ→2コメ目 latency」分布を追加（乗ってきた派 vs 様子見派、ラテラル L6）',
      'マーケ分析に「配信者の話芸ピーク」を追加（沈黙→即反応の検出、ラテラル L10）',
      'マーケ分析に「感情曲線」を追加（ポジ/ネガ/驚き/困惑の語彙辞書を時系列、ラテラル L11）',
      'マーケ分析に「自分が言わなかった人気語 TOP」を追加（次回試したい弾の自動抽出、ラテラル L14）',
      'マーケ分析に「リーチ係数」を追加（同接 ÷ 5分内ユニーク = 1コメンターあたり何人が観てるか、ラテラル L15）',
      '0.1.21〜0.1.25 で計 28 件の分析機能を投入完了'
    ])
  }),
  Object.freeze({
    version: '0.1.24',
    date: '2026-04-30',
    summary: 'マーケ分析に横断比較系 5 種追加',
    items: Object.freeze([
      'マーケ分析に「直近 5 配信の比較」（コメ数+ユニーク並列バー）を追加',
      'マーケ分析に「曜日 × 時間帯 ヒートマップ」を追加（横断・全配信のコメ密度）',
      'マーケ分析に「成長メーター」（過去平均との偏差・z-score）を追加',
      'マーケ分析に「冒頭 5 分の予兆」散布図を追加（冒頭 CPM × ピーク CPM の Pearson 相関、ラテラル分析 L13）',
      'マーケ分析に「似てる配信」一覧を追加（CPM カーブを 16 次元に正規化してコサイン類似度、ラテラル分析 L3）'
    ])
  }),
  Object.freeze({
    version: '0.1.23',
    date: '2026-04-30',
    summary: 'マーケ分析にユーザー層動向 5 種追加',
    items: Object.freeze([
      'マーケ分析に「新規 vs 常連」分類を追加（過去配信と突合してヘビー常連も検出）',
      'マーケ分析に「コメンター生存曲線」を追加（最初の区間の base ユーザーが各区間に何 % 残っているか）',
      'マーケ分析に「離反コメンター TOP」を追加（過去ヘビーだったが今回不参加のユーザー、ラテラル分析 L8）',
      'マーケ分析に「常連出席カレンダー」を追加（過去 N 配信 × TOP 20 コメンターの出席マトリクス、ラテラル分析 L9）',
      'マーケ分析に「キーボード型診断」を追加（絵文字派/短文派/ロング派/無口観戦派/バランス派、ラテラル分析 L12）'
    ])
  }),
  Object.freeze({
    version: '0.1.22',
    date: '2026-04-30',
    summary: 'マーケ分析に同接推移など 4 種追加',
    items: Object.freeze([
      'マーケ分析に「同接推移カーブ」を追加（ピーク到達分・終了時保持率・半減点を併記、視聴維持率の代替指標）',
      'マーケ分析に「コメ速度カーブ」（CPM 1分粒度＋5分移動平均）を追加',
      'マーケ分析に「沈黙ゾーン」検出を追加（60秒以上のコメ無し区間 + 沈黙の質を ガン見系/離脱系/ふつう に自動分類）',
      'マーケ分析に「笑い密度」（盛り上がり指標）を追加（w/草/8888/笑/爆笑 等を 30秒粒度で）',
      'HTML レポートとマーケ分析の両方に目次（アンカーリンク）を追加'
    ])
  }),
  Object.freeze({
    version: '0.1.21',
    date: '2026-04-30',
    summary: 'HTML レポートに分析項目を追加',
    items: Object.freeze([
      'HTML レポートに「最初／最後の記録コメント・配信時間・1分あたりのコメント数（CPM）・配信者レベル・本文の平均/中央値/最大字数」を追加',
      'ユーザー別表に「累計字数（平均字数併記）」列を追加',
      '内訳統計（数値ID／184匿名／自コメ／その他の件数と比率）を新セクションで表示',
      '自分のコメントだけ抜粋する専用テーブルを追加',
      '保存コメント一覧の上に「CSV をダウンロード」ボタンを追加（UTF-8 BOM 付き、Excel/Google Sheets 対応）'
    ])
  }),
  Object.freeze({
    version: '0.1.20',
    date: '2026-04-30',
    summary: '公式チャンネル放送でも配信者タイル表示',
    items: Object.freeze([
      '運営・業者・公式チャンネル放送で「配信者」タイルとフォロー導線が出ない不具合を修正',
      'ニコニコ競馬等のチャンネル放送（ch.nicovideo.jp）の配信者ページにもボタンから飛べるように',
      'ボタン文言は「フォロー」（個人）／「チャンネルを見る」（公式）で出し分け'
    ])
  }),
  Object.freeze({
    version: '0.1.19',
    date: '2026-04-30',
    summary: '来場者数カードの「取得不可」を状態別に',
    items: Object.freeze([
      '来場者数 / 推定同時接続カードが「（取得不可）」のままになる場合があった表示を改善',
      '取得中は「（接続中…）」、放送側が来場者数を非公開にしている場合は「（数字非公開）」と区別表示',
      '「（取得不可）」は通信そのものが取れない最終フォールバック時のみに変更'
    ])
  }),
  Object.freeze({
    version: '0.1.18',
    date: '2026-04-30',
    summary: 'こん太ボタン押下時の体感速度を改善',
    items: Object.freeze([
      'こん太（ツールバー）押下時にパネルが「ぱっと」出るよう、watch ページ表示から約 2 秒後に裏で popup.html を読み込んで待機',
      '画面外（display:none + offscreen）で iframe をブートしておくので押下時のロード待ちが解消'
    ])
  }),
  Object.freeze({
    version: '0.1.17',
    date: '2026-04-30',
    summary: '配信者本人を応援者リストから除外',
    items: Object.freeze([
      'HTML レポート / マーケ分析 / サムネ付きユーザー一覧から、配信者本人のコメントを除外（応援する側ではないため）',
      '全コメント一覧テーブル・ユーザー別集計テーブル・トップコメンター・サムネ付きグリッドの各箇所で適用',
      '配信者本人のタイルは従来どおり「配信者情報」枠で別出し（変更なし）'
    ])
  }),
  Object.freeze({
    version: '0.1.16',
    date: '2026-04-30',
    summary: 'パネル同時出現の真因修正',
    items: Object.freeze([
      'kon-ta 押下時にインラインパネルとポップアップ窓が同時に出る不具合の真因を特定して修正（iframe broadcast race の解消）',
      'background から content script への送信を「画面トップフレームのみ」に絞り込み、niconico ページ内の各種 iframe が応答 port を先取りするのを防止',
      '結果として、kon-ta 押下時の表示遅延も解消'
    ])
  }),
  Object.freeze({
    version: '0.1.15',
    date: '2026-04-30',
    summary: 'サムネ一覧の分類とパネル動作改善',
    items: Object.freeze([
      'サムネ付きユーザー一覧を「数値 ID」と「匿名」のカテゴリに分けて並べました（HTML レポート / マーケ分析）',
      'kon-ta（ツールバー）押下時にインラインパネルとポップアップ窓が同時に出る不具合を修正',
      '×でパネルを閉じた後にもう一度 kon-ta を押すと、パネルがすぐ出ずポップアップ窓だけ開いていた不具合を修正'
    ])
  }),
  Object.freeze({
    version: '0.1.14',
    date: '2026-04-30',
    summary: 'ゲスト判定とサムネ一覧の視認性改善',
    items: Object.freeze([
      'ハンドル名が「ゲスト」（ニコ既定の placeholder）の場合は ID のみで表示し、独自ハンドルとは区別',
      '全コメント一覧の各行にニックネーム表示が出ていなかったバグを修正',
      'サムネ付きユーザー一覧の文字色を WCAG AA に合わせて読みやすく改善（ダーク背景上の白文字に統一）'
    ])
  }),
  Object.freeze({
    version: '0.1.13',
    date: '2026-04-30',
    summary: 'HTML レポートのサムネ強化と CSP 修正',
    items: Object.freeze([
      'HTML レポート / マーケ分析の各ユーザーに「最低サムネ」を必ず表示（個人サムネが無くてもニコ既定アイコン or identicon を充当）',
      '「サムネ付きユーザー一覧」セクションを HTML レポート / マーケ分析の両方に追加（カードグリッド形式）',
      '全コメント一覧の各行のユーザー欄にも 20px のインラインサムネを表示',
      'chrome://extensions のエラータブに毎回出ていた CSP 違反（onerror 属性）を解消'
    ])
  }),
  Object.freeze({
    version: '0.1.12',
    date: '2026-04-30',
    summary: '盛り上げワード ワンクリック挿入',
    items: Object.freeze([
      '✨ボタンから 8888 / wwww / 拍手 / 顔文字 等を 1 タップで挿入できるパレットを追加',
      '最近使ったワードが先頭に並ぶ学習動作（5 件まで保存）',
      '既存の入力欄レイアウトは動かさず、ポップオーバー方式で表示',
      '更新履歴をこの popup から確認できるようにしました'
    ])
  }),
  Object.freeze({
    version: '0.1.11',
    date: '2026-04-30',
    summary: '視認性・前面化バグ修正',
    items: Object.freeze([
      '配色プリセット切替時に文字色が読みにくくなる不具合を根治',
      'コメント入力欄の placeholder がダーク背景で読めない問題を修正',
      'ツールバー押下時にパネルが小さく出るタイミング競合を修正',
      '画面下固定（dock_bottom）配置にも × 閉じるボタンを追加'
    ])
  }),
  Object.freeze({
    version: '0.1.10',
    date: '2026-04-29',
    summary: 'セキュリティ・プライバシー・a11y 整備',
    items: Object.freeze([
      'プライバシーポリシーを実装と整合（OpenRouter は「未実装・将来予定」）',
      '保存 HTML を開いたときの XSS 経路を防御',
      'avatarUrl の容量上限（2KB）を導入してストレージ枯渇を防止',
      'ダーク配色で補助テキストの読みやすさ（WCAG AA）を確保',
      '視聴ページの × 閉じるボタン、補助テキストの a11y 改善',
      '「煌めき」→「きらめき」に表記統一（意匠ルビは保持）'
    ])
  }),
  Object.freeze({
    version: '0.1.9',
    date: '2026-04-28',
    summary: '184 匿名コメントとパフォーマンス',
    items: Object.freeze([
      '送信中の自コメ表示で 184 viewer ID を露出しないように修正',
      '長時間配信でメモリが無制限に増殖するのを上限カットで防止',
      '視聴ページ離脱後の余分な fetch を停止（CPU・帯域・プライバシー）',
      'マイク確認中にバックグラウンドでハングする不具合を修正',
      '拡張接続切れバナーに「再読み込み」ボタンを追加'
    ])
  }),
  Object.freeze({
    version: '0.1.8',
    date: '2026-04-27',
    summary: '自コメ表示の安定化',
    items: Object.freeze([
      'りんくレーンに自コメが表示されない症状を根治（textRaw 永続化など）'
    ])
  }),
  Object.freeze({
    version: '0.1.7',
    date: '2026-04-23',
    summary: '初公開バージョン',
    items: Object.freeze([
      'CWS 初リリース',
      'ニコ生応援コメントの記録と 3 レーン可視化（りんく / こん太 / たぬ姉）',
      'HTML レポート / スクショ / マーケ分析チャート の書き出し',
      'プライバシー優先（外部送信なし・広告なし・計測なし・完全ローカル保存）'
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
