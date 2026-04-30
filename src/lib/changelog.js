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
