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
    version: '0.1.2202',
    date: '2026-11-24',
    summary: 'ニコ生会場の推定同時接続と記録件数の表示ずれを修正',
    items: Object.freeze([
      '推定同時接続が「~3,143」のチルダでマイナスに見えていたのをやめ、材料が足りないとき（直近5分のコメント参加者がいない等）は人数を推測せず「—／計測中」と出すようにしました。負の人数は出しません。',
      '会場帯の「記録」が開いた瞬間の「1件」のまま止まり、状態ページの件数や保存済み件数と食い違うことがあったのを、同じ配信の正本（大きい方）に揃えるようにしました。',
    ])
  }),
  Object.freeze({
    version: '0.1.2201',
    date: '2026-11-23',
    summary: '会場・横欄・マーケレポートに「推定（視聴者の購入額）」を追加',
    items: Object.freeze([
      'YouTube のスーパーチャット・スーパーステッカーとニコ生の有料ギフト pt のみを対象に、会場・横欄・マーケ分析レポートへ「推定（視聴者の購入額）」チップ/KPI カードを追加しました（配信者の手取りは表示しません）。',
      'ニコニコポイントの標準単価（2026-11-23 確認）と ECB 基準為替レート（2026-11-20 確定値）を日付・出典 URL つきで 1 ファイル（estimatedViewerSpend.js）に集約しました。',
    ])
  }),
  Object.freeze({
    version: '0.1.2200',
    date: '2026-11-23',
    summary: '状態ダンプ（JSON）にニコ生以外のサービス計器・タブ一覧を追加',
    items: Object.freeze([
      '診断 JSON ダンプ（status-latest.json・既定 OFF）と status.html の JSON ダウンロードに、YouTube・Twitch・Kick・ふわっち・SHOWROOM・ミクチャ・ツイキャス・TikTok・ABEMA の計器スナップショットと開いている視聴タブ一覧（最大 30 件）を追加しました。',
      '固定ホワイトリストの計器キーと既存ホスト権限のみを使い、全 storage のダンプや権限追加は行いません。',
    ])
  }),
  Object.freeze({
    version: '0.1.2199',
    date: '2026-11-23',
    summary: '全サービスへ孤児タブ自動復帰・診断間引き・会場負荷抑制を横展開',
    items: Object.freeze([
      'Twitch・Kick・ミクチャ・SHOWROOM・ふわっち・ツイキャス・TikTok・ABEMA・YouTube チャットに拡張更新後の自動復帰（orphanTabAutoReload）を配線しました。',
      'Kick・ミクチャ・SHOWROOM のランキング定期タイマーを共通スケジューラ（裏タブ停止）へ移行し、Twitch・Kick の診断書き込みを差分・間隔抑制つき書き手へ統一しました。',
      '会場モードで閉鎖中・しまい中・裏タブの吹き出し位置再計算と読み上げ OFF 時の裏タブ発言ポーリングを抑止しました。',
    ])
  }),
  Object.freeze({
    version: '0.1.2198',
    date: '2026-11-23',
    summary: 'ニコ生の常駐タイマーを共通スケジューラへ集約し裏タブを間引き',
    items: Object.freeze([
      'ニコ生視聴ページ（content-entry.js）の常駐タイマー 6 本（360ms 枠更新・550ms パネルスキャン・4s 配信ID監視・5s 公式DOM・45s 統計・120s deep harvest）を共通ページ監視スケジューラへ集約しました。',
      '表タブの間隔とスクロール中見送り保護はそのまま維持し、裏タブでは間引きまたは停止、bfcache 復帰時は pageshow で再開します。',
    ])
  }),
  Object.freeze({
    version: '0.1.2197',
    date: '2026-11-23',
    summary: 'YouTube チャットの監視を共通 Observer ハブへ統合',
    items: Object.freeze([
      'YouTube ライブチャットの 4 つの DOM 監視（新着・遅延アイコン・スパチャ送信後・購入窓検出）を共通の MutationObserver ハブへ統合しました。',
      '混雑チャットでのバッチ集約・件数上限・スクロール中見送り（domHarvestScrollDefer 再利用）と overflow 時の全体回収を入れ、定期スキャンも共通スケジューラ（裏タブ 10 秒間引き）へ移行しました。',
      'ABEMA のチャット受信で同一配信キー内の chatId 表記揺れによる重複取り込み（seen 誤リセット）を防止しました。',
    ])
  }),
  Object.freeze({
    version: '0.1.2196',
    date: '2026-11-23',
    summary: 'ふわっち・ツイキャス・TikTok・ABEMA の復帰再接続を修正',
    items: Object.freeze([
      'ふわっち・ツイキャス・TikTok・ABEMA の視聴ページでも、ページ離脱（pagehide）後に戻る・進むやタブ復帰したときに同じ配信の記録・読み上げを確実に再接続するように修正しました。',
      '4 サービスの 1 秒定期監視を共通のページ監視スケジューラへ移行し、裏タブでは 10 秒に間引くようにしました。',
    ])
  }),
  Object.freeze({
    version: '0.1.2195',
    date: '2026-11-23',
    summary: '読み上げONのVOICEVOX未接続時は裏タブの未読を保持',
    items: Object.freeze([
      '読み上げを ON にしたまま VOICEVOX 未接続で表タブへ戻ったとき、裏タブ中に溜まった未読バッファを捨てないように修正しました。',
      '利用者が読み上げを OFF にした瞬間（onToggle）および OFF のまま復帰したときだけ未読バッファをクリアします。',
    ])
  }),
  Object.freeze({
    version: '0.1.2193',
    date: '2026-11-23',
    summary: '裏タブ中に届いたコメントを復帰時に直近3件と件数告知で読み上げ',
    items: Object.freeze([
      'タブを裏に回しているあいだに届いたコメントが既読のまま読まれなくなる不具合を修正しました。',
      '表タブへ戻ったとき、裏で届いた未読の直近3件だけを読み上げ、それ以上あるときは「ほかに○件ありました」と短く知らせます（大量の一斉読み上げは起きません）。会場を開く前の過去コメントはこれまでどおり読みません。',
    ])
  }),
  Object.freeze({
    version: '0.1.2192',
    date: '2026-11-23',
    summary: '戻る復帰時に配信の記録を再接続し、Twitch IRC 無通信を監視',
    items: Object.freeze([
      'Twitch・Kick・ミクチャ・SHOWROOM でページ離脱（pagehide）後に戻る・進むやタブ復帰したとき、同じ配信でも記録と読み上げを確実に再接続するように修正しました。',
      'Twitch のチャット（IRC）にも無通信の見張りを追加し、裏タブでは間隔を広げつつ表に戻ったらすぐ切断・再接続を検査するようにしました。',
    ])
  }),
  Object.freeze({
    version: '0.1.2191',
    date: '2026-11-23',
    summary: '戻る・進むで復帰した視聴ページでも監視を再開するように修正',
    items: Object.freeze([
      'YouTube 会場・重ね表示・Twitch・Kick の視聴ページで、ブラウザの「戻る・進む」（bfcache 復元）から戻ったあとも定期監視が止まったままにならないよう pageshow で再開するようにしました。',
    ])
  }),
  Object.freeze({
    version: '0.1.2190',
    date: '2026-11-23',
    summary: '裏タブや視聴ページの定期監視を共通スケジューラへ集約',
    items: Object.freeze([
      'YouTube 会場・重ね表示・Twitch・Kick の視聴ページで個別に動いていた定期タイマーを、共通のページ監視スケジューラへまとめました。',
      '裏タブでは定期チェックを停止または間引き、重ね表示ではボタン書き換え後の不要な DOM 走査を止めることで、低スペック PC での負荷を抑えます。',
    ])
  }),
  Object.freeze({
    version: '0.1.2189',
    date: '2026-11-23',
    summary: 'ミクチャの欄を探す部品の型を直す',
    items: Object.freeze([
      '拡張の動きは 0.1.2186 と同じです。ミクチャの公式コメント欄を探す部品に型の注釈が足りず、型検査が落ちていたので注釈だけ足しました。欄の探し方は変えていません。',
    ])
  }),
  Object.freeze({
    version: '0.1.2188',
    date: '2026-11-23',
    summary: '会場の本体ファイルを行数の上限内に収める',
    items: Object.freeze([
      '拡張の動きは 0.1.2186 と同じです。会場モードの本体ファイルが行数の上限を超えて試験が落ちていたので、送りの通過印を外す処理を小さな部品に移し、上限内に収めました。',
    ])
  }),
  Object.freeze({
    version: '0.1.2187',
    date: '2026-11-23',
    summary: '会場の Esc と部品の層の地図を今の実装に合わせる',
    items: Object.freeze([
      '拡張の動きは 0.1.2186 と同じです。会場をしまったときの Esc の試験を、送信中の一時退避も含めた今の判定に合わせ、部品の層の地図の数字を実測に合わせました。',
    ])
  }),
  Object.freeze({
    version: '0.1.2186',
    date: '2026-11-23',
    summary: 'ミクチャの公式コメント欄を、小さい画面でも見つけられるように',
    items: Object.freeze([
      'ミクチャの会場モードやパネルから送ると、「チャットの入力欄がありません」と出ることがありました。送り方は YouTube や SHOWROOM と同じ共通の経路のまま、公式の「コメントする...」欄の探し方だけを直しました。',
      'Chrome のサイドパネルで画面が狭くなり、公式の欄が小さくなっても、会場の箱が下にかぶっていても、ページが組み直されても、今ある欄を探して送ります。',
    ])
  }),
  Object.freeze({
    version: '0.1.2185',
    date: '2026-11-23',
    summary: 'ミクチャでコメントを送っても、会場が閉じないようにする',
    items: Object.freeze([
      'ミクチャの会場モードで「ここから発言」や送信をすると、会場が瞬間に閉じて見えることがありました。送りの処理が会場全体（ヘッダー含む）を隠していたためです。送っているあいだも会場は開いたままにし、送れなかったときも閉じません。',
      '前回の失敗で会場がしまったまま残っていた印は、次の送信の始まりで外します。しまったように見えて「🏟 会場モード」を押すと、本当に閉じてしまうことも防ぎます。',
      'Chrome のサイドパネルを開いて画面が狭くなり、ミクチャが組み直しても、視聴ページであるあいだは会場を閉じません。配信キーが一瞬取れないだけでは閉じません。',
    ])
  }),
  Object.freeze({
    version: '0.1.2184',
    date: '2026-11-23',
    summary: 'ミクチャの公式コメント欄を、今の入力の形でも見つけられるように',
    items: Object.freeze([
      'ミクチャの配信ページで、会場の「ここから発言」やパネルの「コメント送信」から送ると、公式の入力欄が見つからず送れないことがありました。公式の欄はギフト一覧の上の「コメントする...」です。今のページの形（placeholder が属性に無いとき、SimpleBar や open shadow の中）でも欄を探し、ギフトの「送信する」はコメント送信と取り違えないようにしました。',
      '送れなかったときも、しまった会場が閉じたまま残らないようにしました。送りのあいだだけ会場をしまい、失敗しても必ず戻します。',
    ])
  }),
  Object.freeze({
    version: '0.1.2183',
    date: '2026-11-23',
    summary: '会場から全サービスで発言でき、ミクチャの新着を読む',
    items: Object.freeze([
      '会場モードの「ここから発言」を、ニコ生・YouTube・Twitch・ツイキャス・SHOWROOM・ミクチャ・Kick・ふわっち・ABEMA・TikTok など、会場を使うどのサービスでも公式の欄へ通すようにしました。送っているあいだだけ会場をしまい、公式のコメント欄が箱に覆われて「送信ボタンを押しましたが、文字が入力欄に残っています」となることがないようにします。',
      'ミクチャでは、会場を仮の配信キーで開いたあとも同じ部屋のソケット新着を読み上げの列に載せます。開いた時点の過去分はこれまでどおり読みません。しまった会場でも読み上げは続け、裏タブでは待ち行列を貯めません。席の描画は、少ない人数では 500 席を先に作らず、しまったときと裏タブでは群衆の動きを止めて、低スペックの PC でもスクロールを奪いにくくしました。',
    ])
  }),
  Object.freeze({
    version: '0.1.2180',
    date: '2026-11-23',
    summary: 'ウェブのサポーターページの料金表示をわかりやすく',
    items: Object.freeze([
      '拡張そのものの動きは変わりません。ウェブのサポーターのページの更新です。',
      '無料で使えるものと、サポーターでできることを分けて書き、月額と年額（税込）を並べました。',
      'お試しの日数はこれまでと同じ数え方で、そのあと続けるときの日と金額を出します。',
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
