# AGENTS.md — プロジェクト引き継ぎノート

Cursor / Claude Code / その他エージェントが共通で参照する前提ファイル。
直近のセッションで決まった設計判断と、引き継ぎ事項をまとめている。

---

## 1. プロジェクト概要

- **名称**: 君斗りんくの追憶のきらめき（Chrome 拡張機能）
- **ドメイン**: https://tsuioku-no-kirameki.com/ （紹介 LP + プライバシーポリシー）
- **運営**: Kimito-Link Project
- **単一用途**:
  ニコニコ生放送 (`*.nicovideo.jp`) で流れる応援コメントを、利用者本人の
  ローカル PC (`chrome.storage.local`) の中にのみ記録し、放送終了後に
  3 つのレーン（りんく／こん太／たぬ姉）＋活発度の色分けで振り返れるよう
  可視化すること。

---

## 2. Chrome Web Store ステータス

- **次回提出バージョン**: 0.1.25（2026-04-30 ローカル準備）
- **直前提出バージョン**: 0.1.10（2026-04-29 提出済 / 審査中）
- **直近通過バージョン**: 0.1.7（2026-04-23 提出 / 審査通過済・公開中）
- **前回提出**: 0.1.6（2026-04-19 / 審査通過済）
- **ステータス**: 0.1.7 が公開中。0.1.10 を CWS に審査依頼中。0.1.11 は 0.1.10 提出後に
 ディープリサーチで発見された残課題（privacy.html × 実装の整合不足、過去焼き込みデータの
 後方修復、184 自コメ viewerUid の他経路露出、avatarUrl cap の他経路漏れ、content-entry
 setInterval cleanup）+ A1 視認性根治・B1 前面化レース・B2 dock_bottom 閉じるボタンを
 一括修正。0.1.12 で「盛り上げワード ワンクリック挿入パレット」（C）・「更新履歴 popup
 表示」（D）を追加し、0.1.13 で CSP 違反 onerror 属性の撤去（E）・HTML レポート / マーケ
 分析の「最低サムネ フォールバック + サムネ付きユーザー一覧 + 全コメント一覧のインライン
 サムネ」（F/G）を追加した。0.1.10 が承認 → 公開された後、続けて 0.1.13 を提出予定。
- **0.1.10 内訳**: 0.1.8 自コメ修正 + 0.1.9 シナリオ調査 8 件 + 0.1.10 Privacy 整合 / XSS 対策 / a11y 修正 / 出自不明アセット差し替え 13 件 をロールアップ。
- **0.1.11 内訳**: privacy.html を IDB 3 つ・記録クリア言及で実装と整合 / 0.1.10 未満からの
 自動更新ユーザーで誤焼き込み `selfPosted:true` を 1 度だけ剥がす migration / 184 自コメの
 viewerUid 露出を表示経路で共通 helper でガード / avatarUrl 2KB cap を共通 helper 化して
 patchExistingComment と userCommentProfileCache に拡張 / content-entry.js の setInterval を
 context invalidate 時に clearInterval。**追加（A+B 視認性・前面化レース 3 件）**: 全フレーム
 プリセットに `KNOWN_FRAME_VARS` を強制して切替残留を防止（A1 親バグ：light/sunset 選択時に
 `html.nl-skin-panel-dark` の dark 値が抜けて読めない症状を根治）/ `--nl-placeholder` を 4
 プリセット + :root + dark スキンに揃え、`textarea`/`input::placeholder` を全プリセットで
 WCAG AA / `focusInlinePanelHostFromToolbar` を pollUntil + 500ms async 化（B1 race：toolbar
 押下直後に host rect が未確定で false 返却 → 小さい toolbar popup だけが出る症状を根治）/
 dock_bottom にも「× 閉じる」ボタンを設置（B2: A30 を floating だけでなく dock_bottom にも展開）。
- **拡張 ID**: `cjbabignmmodaickpeckiojjabnlogdb`
- **CWS Developer Dashboard**: 投稿者「君斗りんく」
- **ホスト権限**: `https://*.nicovideo.jp/*` のみ（`localhost` / `127.0.0.1` は
 提出版から除外済み）
- **0.1.10 の主変更（0.1.8 / 0.1.9 込みのロールアップ）**:
 1. **【Privacy】privacy.html §6 OpenRouter 連携を「未実装・将来予定」に書き換え**: 実装と
 文書の齟齬を解消（CWS 審査の差し戻しリスクを回避）。`tsuioku-no-kirameki/privacy.html` の
 §6 全体・要約・目次・§4-2・§10・meta description / OG 系を一掃。
 2. **【ブランド】「煌めき」→「きらめき」hiragana 統一**: LP / privacy.html / site.webmanifest /
 OG title / schema.org JSON で表記揺れを解消。意匠ルビ `<ruby>煌めき<rt>きらめき</rt></ruby>` のみ残置。
 3. **【アセット】出自不明アセット `kewXCUOt_400x400.jpg` を削除**: ファイル名が外部 CDN 命名規則
 だったため、`STORY_RINK_COLLECTING_JPG` を `link-yukkuri-blink-mouth-closed.png` に差し替え。
 提出 ZIP のホワイトリストからも除外。
 4. **【セキュリティ】HTML レポート / マーケ HTML の `<img src>` で URL scheme 検証**:
 `data:image/svg+xml,<svg onload=...>` での保存 HTML 開封時 XSS を防止。
 5. **【セキュリティ】`escapeHtml` で single quote エスケープ**: `'` も `&#39;` に変換し、
 single-quoted 属性での XSS も防御（ユニットテストも追加）。
 6. **【セキュリティ】`commentRecord.js` の `avatarUrl` に 2KB 上限**: storage quota DoS 防止。
 7. **【a11y】dark/midnight プリセットに `--nl-text-sub` 追加**: 補助テキストの WCAG AA を確保。
 8. **【a11y】`storageErrorBanner` の `role/aria-live` 矛盾を解消**（aria-live 削除、role=alert に統一）。
 9. **【a11y】`#recordToggle` に `:focus-visible`**: キーボードユーザーが録画 ON/OFF を見失わない。
 10. **【a11y】rank strip count を CSS 変数化**: ダークパネルでも読める色に切替。
 11. **【a11y】`commentInput` textarea に `aria-label`**: スクリーンリーダ向けの名前付与。
 12. **【a11y】floating panel に「× 閉じる」ボタン**: 設定画面に行かずに非表示にできる導線追加。
 13. **【0.1.9 から継承】設定変更の慎重実装 8 件**: 184 自コメ viewerUid 非表示、HTML 保存 URL revoke
 60 秒遅延、interceptedMaps の trim、pollStats URL 再チェック、setInterval cleanup、コンテキスト切れ
 banner reload ボタン、navigator.onLine、probeMicrophoneLevel ハング修正。
 14. **【0.1.8 から継承】自コメ表示の追加安定化 3 件**: Storage H8 / Self-comment M1 / textRaw 永続化。
 15. 権限・ネットワーク・保存キーの追加**無し**。

- **0.1.9 の主変更（0.1.8 込みのロールアップ）**:
 1. **【Privacy】184 自コメで viewerUid を表示しない**: pending self-post が ndgr 観測前に
 viewer の数値 ID を Story Detail カードへ露出させていた。`pending-self:` プレフィックスで
 識別し、ID 表示を「自分のコメント（送信中）」に置換。スクショ・画面共有時の身元バレ防止。
 2. **HTML 保存の URL.revokeObjectURL を 60秒遅延**: 巨大 HTML（数万コメント）で `a.click()`
 直後に同期 revoke するとブラウザのダウンロードが silent failure する不具合。`downloadSessionSummaryJson`
 と同じ 60 秒遅延に揃える。
 3. **interceptedNicknames / interceptedAvatars に `trimMapToMax`**: 長時間配信で 50,000+
 コメンターが居ても上限で頭打ちにし、メモリ無制限増殖を防止。
 4. **pollStats の URL 再チェック**: `pollStatsFromPage`（content）/`mainWorldPollStats`
 （page-intercept）が SPA 遷移後の非 watch ページでも 12 / 30 秒ごとに親 URL を fetch
 し続けていたのを停止。CPU・帯域の浪費とプライバシー上の意図しない fetch を防ぐ。
 5. **popup の setInterval を context invalidate で clearInterval**: 拡張更新後の
 popup window / inline iframe で空 tick が永続的に走り続けるのを停止。
 6. **拡張接続切れバナーに「このパネルを再読み込み」ボタン**: ユーザーが popup 内で
 1 クリックで `window.location.reload()` できる復帰経路を提供。
 7. **オフラインバナーを追加**: `navigator.onLine` の online/offline イベントを監視し、
 ネット切断時にバナーを表示。「コメントが流れてこない」を拡張不具合と誤解しないように。
 8. **probeMicrophoneLevel の RAF backgrounded ハング修正**: マイク確認中に popup を
 backgrounded すると `requestAnimationFrame` が pause して「確認中…」のまま固まる
 不具合。32ms の setTimeout を並走させて確実に進める。
 9. **【0.1.8 から継承】Storage H8 / Self-comment M1 / textRaw 永続化**: 自コメ表示の
 安定化（前回 master の b18de07 で入れた 3 件）。
 10. 権限・ネットワーク・保存キーの追加**無し**（HTML / 保存値の optional フィールド追加のみ）。
- **0.1.7 の主変更**:
 1. **不具合修正**: 自分で送信したコメントが上部ランキング・りんくレーンに即時反映されない不具合
 （`src/extension/popup-entry.js`）。送信直後から正しく表示されるようになる。
 2. **文言整理**: HTML 保存時のキャラ案内見出しをキャラ名プレフィックスに統一
 （AGENTS.md §3.1 方針に合流）。
 3. 権限・ネットワーク・保存キーの追加**無し**（審査差分は実質挙動バグ 1 本＋文言）。

---

## 3. 重要な設計判断（今後も踏襲すること）

### 3.1 「ゆっくり」という言葉の扱い（2026-04-29 方針更新）
- 本拡張のオリジナルキャラクター（りんく・こん太・たぬ姉）は **東方Project の
  二次創作キャラクター（霊夢・魔理沙）ではない**ため、「ゆっくり〜」という呼称や
  「ゆっくり解説」という表現を使っても問題ない、という方針。
- 一方で description / store listing では 3 キャラの独自性を伝えるため、
  「3 匹のガイドキャラ」「オリジナルキャラクター」「やわらかい雰囲気のキャラ案内」
  など、必ずしも「ゆっくり」を多用しなくてもよい言い回しも併用する。
- popup UI / LP 内では「ゆっくり始める」「ゆっくり解説」等の文言を従来どおり使用してよい。

### 3.2 3 キャラの役割（ブレさせない）
| キャラ | 役割 | レーン |
|---|---|---|
| りんく | 配信者視点 | りんくレーン |
| こん太 | ファン視点 | こん太レーン |
| たぬ姉 | 匿名ガイド / しっかり者解説 | たぬ姉レーン（184 匿名コメントの振り分け先） |

### 3.3 プライバシーの合言葉
- **外部送信なし / 広告なし / 計測なし / 完全ローカル保存**
- 唯一の例外が AI 連携 (OpenRouter)。ただし (1) API キー、(2) 機能 ON、
  (3) 送信同意 ON の **3 点すべて手動 ON** のときだけ通信する。既定は全 OFF。
- `chrome.storage.local` のみを保存先とし、自動同期はしない。

### 3.4 識別子の扱い
- 内部識別子 `nicolivelog` は `manifest.json` の description に **含めない**。
- CWS ストア掲載上の名称は `君斗りんくの追憶のきらめき` で統一。

---

## 4. ファイル配置のルール

```
extension/             ← 拡張本体のソース。ここを編集する。
  manifest.json        ← 公式の配布版ソース。version を更新する場所。
  images/logo/         ← アイコンのマスター（16/32/48/128/256/512）

src/                   ← LP 側のソース
  images/googlechrom/  ← CWS 提出物のマスター（コミット対象）
    konta-yukkuri-icon-128.png   ショップアイコン
    promo-tile-440x280.jpg       プロモタイル(小)
    marquee-1400x560.jpg         マーキー

tsuioku-no-kirameki/   ← 本番 LP の配信ディレクトリ（GitHub Webhook で XServer に deploy）
  index.html           ← LP 本体
  privacy.html         ← プライバシーポリシー
  google7e3e79636d884c2.html   Search Console 所有権確認（残置）
  google7e3e79636d884c2f.html  同上（末尾 f 付きが正で、Search Console 側で選択）

build/                 ← **.gitignore 対象**。CWS 提出用 ZIP + 生成アセット置き場。
  store-listing/
    description-ja.txt                5,377 字（そのまま貼付け用）
    privacy-justifications-ja.txt     7 種の権限理由 + データ開示テンプレ
    screenshot-1〜5-*.jpg              1280×800（コンセプトモック）
    promo-video.mp4                   46s / 1920×1080 / H.264（YouTube アップ済）
    youtube-thumbnail-1280x720.jpg    YT サムネ
    _gen_*.py                         再生成用 Python スクリプト
```

**編集時の注意**:
- `build/` は gitignore されているので、中の成果物は
  `_gen_*.py` から **再生成可能な状態** を保つこと。
- CWS 提出物のマスターは `src/images/googlechrom/` にだけ置く
  （`build/store-listing/` は中間生成物扱い）。

---

## 5. 直近セッションで入った変更（2026-04-30）

**0.1.25 バンプで追加した機能（マーケ分析有料 / 文化分析 Z）— 28 件投入完了**:

- マーケ分析に 7 件追加（PRO バッジ付き）。0.1.21-0.1.25 ロードマップ完走。
- 追加した分析:
  - **コメ伝染**（L1）: 30 秒窓・3 ユーザー以上の同一語連鎖を検出
  - **コメ被り瞬間**（L5）: 5 秒窓・3 ユーザー以上の同期歓声
  - **初コメ→2コメ目 latency**（L6）: 各ユーザーの 1 コメ目 → 2 コメ目間隔を 7 段階分布
  - **配信者の話芸ピーク**（L10）: 沈黙（60秒+）→ 沈黙明け 30 秒以内に 5+ コメ反応
  - **感情曲線**（L11）: 簡易語彙辞書ベースで「ポジ/ネガ/驚き/困惑」を時系列折れ線
  - **自分が言わなかった人気語 TOP**（L14）: 全コメ頻出だが自コメ未使用の語
  - **リーチ係数**（L15）: 直近 5 分の同接 / ユニークコメンター比
- 新規 lib（純粋関数 + TDD、計 27 ケース）:
  - `src/lib/commentEchoDetector.js`（12 ケース、L1/L5 を 1 ファイル）
  - `src/lib/commenterCulturalAnalytics.js`（15 ケース、L6/L10/L11/L14/L15 を 1 ファイル）
- **0.1.21-0.1.25 トータル投入**: 計 28 件の分析機能（無料 5 + 有料 23）。ラテラル
 思考 L1-L15 のうち L1/L2/L3/L4/L5/L6/L7/L8/L9/L10/L11/L12/L13/L14/L15 全 15 件投入。
- 課金ゲート（0.1.26 以降）は別タスク。CWS の課金 sensitivity を踏まえて
 OpenRouter API キー所持を PRO 解放条件にする案を memory の roadmap に保留。

**0.1.24 バンプで追加した機能（マーケ分析有料 / 横断比較 Y）**:

- マーケ分析に 5 件追加（PRO バッジ付き）。0.1.22-0.1.25 ロードマップの第 3 弾。
- 追加した分析:
  - **直近 N 配信の比較バー**: コメ数（青）と ユニーク（緑）を並列バーで横断表示。
  - **曜日 × 時間帯 ヒートマップ**: 過去全配信のコメ時刻を 7曜 × 24時間 セルに集計し
   濃淡で表示。アクティブ視聴者層の活動時間帯を可視化。
  - **成長メーター**: 過去 N 配信の総コメ数平均との差を「±%」「z-score」で表示。
  - **冒頭 5 分の予兆**（L13）: 各配信の「冒頭 5 分 CPM × ピーク CPM」を散布図にし、
   Pearson 相関係数を表示。配信開始の盛り上がりが結果に効くか検証用。
  - **似てる配信**（L3）: 現在の CPM カーブを 16 次元ベクトルに正規化し、
   過去配信の指紋とコサイン類似度で比較。形が近い過去配信を TOP 5 で。
- 新規 lib（純粋関数 + TDD、計 34 ケース）:
  - `src/lib/broadcastCrossCompare.js`（12 ケース、3 関数）
  - `src/lib/openingFiveMinuteCorrelation.js`（8 ケース、Pearson 相関込み）
  - `src/lib/broadcastWaveformFingerprint.js`（14 ケース、cosineSimilarity も export）
- 残り: 0.1.25 (Z 文化分析) で 7 件追加予定。

**0.1.23 バンプで追加した機能（マーケ分析有料 / ユーザー層動向 X）**:

- マーケ分析に 5 件追加（PRO バッジ付き）。0.1.22-0.1.25 で 28 件追加するロード
 マップの第 2 弾。
- 追加した分析:
  - **新規 vs 常連分類**（B5 + L7）: 過去 N 配信 DB と突合し「新規 / リピーター /
   ヘビー常連（過去 5+ コメ実績）」に 3 区分。
  - **コメンター生存曲線**（B6）: 配信を 5 等分し、最初の区間の base ユーザーが
   各区間に何 % 残っていたかを line chart で。「コメ参加維持率」=コメ書く層の
   残存。視聴維持率の代替指標の補強。
  - **離反コメンター TOP**（L8）: 過去ヘビー層 で今回不参加 = 引き留め候補
   TOP 15。共有モード（maskShare）では出さない。
  - **常連出席カレンダー**（L9）: 過去 N 配信 × TOP 20 コメンターの出席マトリクス。
   ●=出席 / ·=不参加。
  - **キーボード型診断**（L12）: 絵文字派 / 短文派 / ロング派 / 無口観戦派 /
   バランス派 の 5 型自動分類。配信スタイルとファン層の傾向把握用。
- 新規 lib（純粋関数 + TDD、計 38 ケース）:
  - `src/lib/commenterHistoricalAnalytics.js`（17 ケース、3 関数を含む）
  - `src/lib/commenterSurvivalCurve.js`（9 ケース）
  - `src/lib/keyboardTypeDiagnostic.js`（12 ケース、`classifyKeyboardType` も export）
- popup-entry.js のマーケ DL 経路で `chrome.storage.local.get(null)` から
 `nls_comments_lv*` キーを最大 10 件まで scan して `pastBroadcasts` を渡す。
- 残り: 0.1.24 (Y: 横断比較) / 0.1.25 (Z: 文化分析) で 12 件追加予定。

**0.1.22 バンプで追加した機能（マーケ分析有料コア W）**:

- 方針: 0.1.22-0.1.25 で「マーケ分析（将来有料）」に分析機能を 28 件追加するロード
 マップの第 1 弾。各セクションに `<span class="mkt-pro-tag">PRO</span>` バッジを
 仕込んで、将来課金ゲートで切り替えられるようにする（0.1.26 以降）。
- 追加した分析（マーケ HTML、有料側）:
  - **同接推移カーブ**: `broadcastSessionSummary_v1` IDB の 1分粒度サンプルから
   SVG 折れ線。`officialViewerCount` 優先で `peakConcurrentEstimate` フォールバック。
   ピーク到達分（黄丸）・半減点（赤丸）・終了時保持率（=終了/ピーク）を併記。
   YouTube/Twitch 流の per-viewer retention は不可だが、配信全体の視聴維持の特性を
   1 行で要約できる。
  - **コメ速度カーブ**: 1 分粒度 CPM 折れ線 + 5 分移動平均（オレンジ点線）。既存
   `sectionTimeline` の bar chart と別 view（こちらは滑らか）。
  - **沈黙ゾーン × 沈黙の質（L2）**: 60 秒以上の沈黙区間を検出 + 沈黙後 30 秒以内の
   コメ件数で「ガン見系（5+件）/離脱系（0-1件）/ふつう（2-4件）」に分類。
   ラテラル思考 L2。長い順 TOP 10 を表で表示し、沈黙直前/直後のコメも併記。
  - **アヘ顔密度（L4）**: w/ｗ/草/8888/笑/爆笑/ワロタ 等の出現を 30 秒粒度で。
   全体の笑い比率とピーク（30秒バケット）を表示。ラテラル思考 L4。
- TOC（アンカーリンク）を HTML レポートとマーケ分析の両方に追加。各セクションに
 `id="..."` を付け、ナビゲーション一覧から飛べるように。
- 新規 lib（純粋関数 + TDD）:
  - `src/lib/concurrentTimelineSeries.js`（11 ケース）
  - `src/lib/concurrentPeakAnalysis.js`（9 ケース）
  - `src/lib/commentVelocityTimeline.js`（32 ケース、`isLaughterText` の判定込み）
  - `src/lib/commentSilenceZones.js`（13 ケース）
- popup-entry.js のマーケ DL 経路で `openBroadcastSessionSummaryDb` から sessionRows
 を取得し、`buildMarketingDashboardHtml` の `sessionSummaryRows` /
 `commentsForAnalytics` opts に thread。fallback 経路（context invalidate 中）は
 sessionRows 空で comments のみ。
- 残りロードマップ: 0.1.23 (X: ユーザー層) / 0.1.24 (Y: 横断比較) / 0.1.25 (Z: 文化分析)
 で 23 件の追加分析を投入予定。

**0.1.21 バンプで追加した機能（HTML レポート無料拡張 V）**:

- 方針: HTML レポート（無料）= 記録の証拠 / マーケ分析（将来有料）= 配信を伸ばす
 示唆、で線引きする予定。0.1.21 では無料側のみ拡張。
- 追加した分析:
  - 配信メタの拡張: 最初／最後の記録コメント・配信時間・CPM（1分あたりのコメント
   件数）・配信者LV・本文の平均／中央値／最大字数
  - ユーザー別表に「累計字数（平均字数併記）」列を追加
  - 内訳統計セクション（数値ID／184匿名／自コメ／その他 件数と比率）
  - 自コメ抜粋セクション（自分が送ったコメントだけ抜粋表示）
  - CSV ダウンロードボタン（UTF-8 BOM 付き・Excel/Google Sheets 対応）
- 新規 lib（純粋関数 + TDD）:
  - `src/lib/broadcastReportSummary.js`（`summarizeBroadcastTiming` /
   `summarizeCommentBodyStats` / `summarizeIdentifierStats`、14 ケース）
  - `src/lib/reportCommentsCsv.js`（`buildReportCommentsCsv` / `csvEscapeField`、
   16 ケース・**CSV インジェクション対策**として `=+@-tab` プレフィックスを
   シングルクォートで予防エスケープ）
- `popup-entry.js#buildHtmlReportDocument` を上記の純粋関数経由に書き換え。
 概要テーブルに 7 行追加 / ユーザー別表を 4 列→5 列 / 新セクション 3 つ
 （内訳統計・自コメ抜粋・CSV ボタン入りコメ一覧）。
- 将来計画（0.1.22 以降の有料側）: 同接推移カーブ / ピーク到達分析 / コメンター
 生存曲線 / 過去放送横断比較 / 文化分析（コメ伝染・沈黙の質・波形フィンガー
 プリント・感情曲線等）を順次投入予定。詳細は memory の roadmap 参照。

**0.1.20 バンプで追加した修正（公式チャンネル放送のフォロー導線 U）**:

- ユーザー報告: 「運営とか業者だとフォローボタンがつかない気もする」。
- 真因: `topSupportRankStripCasterTileHtml()` が `broadcasterUserId` の数値判定
 （`/^\d+$/`）でだけタイルを出していたため、`supplier.pageUrl` が
 `https://ch.nicovideo.jp/<handle>` 形式（公式チャンネル / 業者 / 運営）の放送では
 数値 uid が無く、配信者タイル＋フォロー導線が消えていた。
- 修正: 純粋関数 `src/lib/broadcasterFollowTarget.js#resolveBroadcasterFollowTarget`
 を新設。`{ kind: 'user' | 'channel' | 'none', name, level, pageUrl, iconUrl,
 followLabel }` を返す。
  - 数値 uid あり → `kind=user`、CDN usericon URL（`buildNiconicoDefaultUserIconUrl`
   と同じ計算）+ ボタン「フォロー」
  - pageUrl が `ch.nicovideo.jp/...` → `kind=channel`、生 URL + ボタン「チャンネルを見る」
  - 名前無し / どちらの URL も無し → `kind=none`（タイル非表示）
- 副次：`content-entry.js` の snapshot に `broadcasterPageUrl` /
 `broadcasterIconUrl` を追加。`supplier.pageUrl`（http(s) のみ）と
 `supplier.icons.uri150x150` 等を拾う。
- `popup-entry.js` の `topSupportRankStripCasterTileHtml` と
 `renderWatchMetaCard#casterBanner` ブロックを上記ヘルパ経由に書き換え。
- `lib(new)`: `src/lib/broadcasterFollowTarget.js` / `broadcasterFollowTarget.test.js`
 （17 ケース：user / channel / none / URL 安全性 / 数値 uid 優先）。
 `changelog.test.js` の manifest 期待値を 0.1.20 に更新。

**0.1.19 バンプで追加した改善（来場者数カード状態化 T）**:

- ユーザー報告: 「来場者数 / 推定同時接続」カードに「（取得不可）」が出ることが
 ある。ランクストリップにはコメントが流れているので content script 自体は動い
 ているが、watch メタカードの数字だけ常時「取得不可」表示になる症状。
- 真因切り分け: `viewerCountFromDom` は WS → embedded-data#statistics.watchCount →
 DOM scan の三段で取りに行くが、番組によっては運営側が来場者数を非公開に
 している（toi の API が `watchCount` を返さない）。この場合、snapshot 自体は
 取れているが `viewerCountFromDom = null` で確定し、popup-entry が「（取得不可）」
 と表示してしまっていた。`liveAudienceDom.js` の正規表現自体は健在。
- 修正: `src/lib/watchMetaCardStateGate.js` を新設し、純粋関数
 `resolveWatchMetaCardState({ snapshot, snapshotFetchInflight, snapshotFetchError })`
 で 5 状態に分類:
  1. `loading` … snapshot 取得中 → 「（接続中…）」
  2. `fetch_failed` … snapshot 取得失敗 → 「（取得不可）」（最終フォールバック）
  3. `data_missing` … snapshot は取れたが viewerCountFromDom 無し →
     来場者だけ「（数字非公開）」、推定同時接続は既存ロジックで継続表示
  4. `pre_measurement` … 既存挙動「計測中…」（vc 無し・他シグナルも無し）
  5. `ok` … 来場者・同接ともに数値表示可能
- `popup-entry.js` の `clearWatchMetaCard()` / `renderWatchMetaCard()` を gate 経由に
 書き換え、`watchMetaCache` に `fetchInflight` / `fetchError` を追加。snapshot 取得の
 直前で inflight=true・直後に false にして文言を切替。
- `lib(new)`: `src/lib/watchMetaCardStateGate.js`（5 状態 + ラベル正本）。
- `test`: `watchMetaCardStateGate.test.js` 23 ケース新設（loading / fetch_failed /
 data_missing / pre_measurement / ok の各境界・引数耐性）。`changelog.test.js` の
 manifest 期待値を 0.1.19 に更新。
- 副次調査（broadcast race の他に該当無いか）: 0.1.16 で `chrome.tabs.sendMessage`
 に `{ frameId: 0 }` を投入したのは `extension/background.js#handleBrowserActionClick`
 のみで、popup→content の sendMessage は全て `tabsSendMessageWithRetry`（既定
 frameId=0）経由。content-entry の onMessage listener は非対象フレームを sync で
 弾くので broadcast race の追加箇所は無いことを確認。

**0.1.18 バンプで追加した改善（kon-ta 体感速度 S）**:

- ユーザー報告: 「こん太アイコンを押したとき、もうすこしささっと出るようにしてほしい」。
- 0.1.16 で popup 同時出現 race は根治済みだが、初回 kon-ta 押下時は popup.html
 を iframe 内で cold-start するため ~100–200ms の体感遅延が残っていた。
- 修正: `src/extension/content-entry.js#prewarmInlinePopupIframe` を新設し、watch
 ページ表示から ~2 秒後に host + iframe を `display:none` + offscreen で body に
 append。iframe は display:none でも popup.html をロードするので、押下時には
 popup.html はすでにパース済み → ほぼ即時に visible 化できる。
 - `schedulePrewarmInlinePopupIframe` を `startPageFrameLoop` から呼ぶ。
 - `prewarmInlinePopupDone` フラグで idempotent。
 - watch URL 以外 / iframe 内では何もしない（gate 二重）。

**0.1.17 バンプで追加した修正（配信者除外 R）**:

- ユーザー報告: 「配信者本人が応援者リストに入っている問題も解決したい」。
- 既に popup の 3 レーン（りんく/こん太/たぬ姉）には storyUserLaneContaminationGuard
 で配信者除外があるが、HTML レポート / マーケ分析 / サムネ付きユーザー一覧 /
 全コメント一覧 / トップコメンター 等には除外責任が無く混入していた。
- 修正:
  - `src/lib/userThumbGrid.js#categorizeUsersForThumbGrid` に `broadcasterUserId`
   opt を追加し、一致する uid は skipped に集計（TDD: 18 ケース、+3）。
  - `src/lib/marketingChartsHtml.js#buildMarketingDashboardHtml` に opt を追加し、
   `sectionTopUsers` / `sectionUsersWithThumbnails` 両方で除外。
  - `src/extension/popup-entry.js#buildHtmlReportDocument` で aggregatedRooms と
   commentsForReport を broadcaster で filter してから集計テーブル / サムネ付き
   一覧 / 全コメント一覧の各列に渡す。
  - 2 箇所の `buildMarketingDashboardHtml` 呼び出しに `broadcasterUserId` を thread。
- 配信者本人のタイル（topSupportRankStripCasterTileHtml）は応援される側として
 「配信者情報」枠で別出ししているのでそのまま。

**0.1.16 バンプで追加した修正（パネル同時出現の真因 P）**:

- 真因: `manifest.json` で content.js を `all_frames: true` で iframe にも注入していたため、
 `chrome.tabs.sendMessage(tid, msg)` が tab 内の全フレームに broadcast され、watch ページ
 内の各種 iframe（プレイヤー埋込・広告 frame 等）の listener が同期的に
 `if (!isWatchInlinePanelTopFrame()) return false;` で port を closed にしてしまう。top frame
 の async listener が `sendResponse({ focused: true })` する前に「The message port closed
 before a response was received」エラーで background の `await chrome.tabs.sendMessage` が
 reject → catch → `openOrFocusPopupWindow()` が走って popup 窓も同時に開いていた。
- 修正: `extension/background.js#handleBrowserActionClick` で `chrome.tabs.sendMessage`
 に `{ frameId: 0 }` を渡して top frame だけに送るように変更。iframe 側の listener は
 message を受け取らないので port を奪わない。これで「panel + popup 窓が同時に出る」
 user 報告現象を根治。kon-ta 押下時の表示遅延（race の影響で 100-300ms）も解消。
- 既に popup-entry.js の `tabsSendMessageWithRetry` は `frameId: 0` 既定で同じ対策を
 取っていたので、background.js もそれに揃えた形。

**0.1.15 バンプで追加した修正（カテゴリ分類 L / popup 同時出現 M / kon-ta 即時 N）**:

- `feat(report)`: 「サムネ付きユーザー一覧」を「数値 ID（個人サムネ・ニコ既定）」と
 「匿名（identicon）」の 2 カテゴリに分けて表示。0.1.12 では同じ grid に混在していて
 件数順が匿名で埋まると数値 ID の応援ユーザーが下に追いやられる UX 報告に対応。
 純粋関数 `categorizeUsersForThumbGrid`（src/lib/userThumbGrid.js）として共通化し、
 HTML レポート / マーケ分析の両方で使う。
- `fix(content)`: `focusInlinePanelHostFromToolbar` を「host が DOM に居れば即座に
 focused=true 応答 / scroll & iframe.focus は fire-and-forget」へ変更。旧実装は
 pollUntil で rect ≥120×120 を 500ms wait してから応答を返していたため、その間に
 background.js の `chrome.tabs.sendMessage` が応答待ちでブロックされ、timeout で
 false 返却された場合に popup 窓を開く path が走り「panel と popup 窓が同時に出る」
 現象を起こしていた（M：Bug1）。close ボタンで display:none された host は rect=0
 のまま pollUntil timeout → focused=false → popup 窓だけ開く現象（N：Bug2）も
 同じ修正で解消。判定は `shouldRespondFocusedNowFromToolbar`（`isConnected===true`
 のみ確認、display/rect は問わない）を新設し、unit test で固定。
- `lib(new)`: `src/lib/userThumbGrid.js` (15 ケース新設) ・
 `src/lib/inlinePanelFocusGate.js#shouldRespondFocusedNowFromToolbar` (5 ケース追加)。

**0.1.14 バンプで追加した修正（ゲスト判定 I / 視認性 J）**:

- `fix(report)`: `nicoAnonymousDisplay.js` に `isNiconicoGuestPlaceholderNickname`
 を新設し、`anonymousNicknameFallback` で「ゲスト」「user XXXX」placeholder を
 ハンドル無しと同等扱いに変更。HTML レポート / 集計テーブル / 全コメント一覧で
 「ゲスト（144049418）」が独自ハンドルのように出ていたのを ID のみ表示に揃えた。
 「ゲスト123」「ゲストさん」のような派生はカスタム名として尊重（完全一致のみ判定）。
- `fix(report)`: HTML レポートの全コメント一覧で `displayUserLabel(userKey)`
 が nickname 引数を落としていたバグを修正。「かんぺい（143106966）」のような
 ハンドル付き表示が出るようになった（旧: 数値 ID のみ表示）。
- `fix(a11y)`: HTML レポート `.report-thumb-grid__cell` の CSS で
 `var(--panel-bg, #ffffff)` を使っていたが、HTML レポート側は `--panel-bg` を
 定義しておらず白 fallback が当たり、テキスト色は親から `--text` (light gray)
 を継承していたため「白×ライトグレー」で読めなかった。dark テーマ
 （--bg #0b1220 / --panel #111b2e）に合わせ明示色（cell #1a2540 / label #e2e8f0
 + font-weight 600 / count #cbd5e1）で書き直し WCAG AA 達成。

**0.1.13 バンプで追加した修正（CSP 修正 E / 最低サムネ + 一覧 F / 全コメント一覧 inline サムネ G）**:

- 0.1.12 を CWS 提出する直前に、ユーザー側で chrome://extensions に CSP 違反ログが
 毎回出る不具合を発見し、HTML レポート / マーケ分析のサムネ充足を併せて修正したため、
 まとめて 0.1.13 として提出することにした。0.1.12 の機能は内包される（0.1.13 を入れた
 ユーザーは ✨ パレット・更新履歴 popup 表示も自動で得る）。
- 詳細は ↓「0.1.12 バンプで追加した機能」の E/F/G セクションに記述。

**0.1.12 バンプで追加した機能（盛り上げワード C / 更新履歴 D / CSP 修正 E / 最低サムネ + 一覧 F）**:

- `fix(popup-csp)`: `onerror="this.style.visibility='hidden'"` という inline 属性ハンドラが
 MV3 strict CSP で実行できず、画像読み込み失敗のたびに CSP 違反ログを吐いていた問題を解消。
 `topSupportRankStripCasterTileHtml()` の inline onerror を `data-on-error-hide="1"` マーカーに
 置換し、`bindOnErrorHideHandlersWithin(root)` で `addEventListener('error', ...)` を貼り直す
 方式に変更（`{ once: true }` + dataset 二重バインド防止）。
- `feat(report)`: HTML レポート / マーケ分析の各ユーザー行に「最低サムネ」を必ず出すフォール
 バックを追加。優先順位は ① avatarUrl が http(s) → 採用、② 数値 ID（5〜14 桁）→ ニコ既定
 user icon CDN URL（`secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/<bucket>/<uid>.jpg`）、
 ③ 匿名 a:... + identiconResolver → SVG data URL、④ 該当なし → 空。`src/lib/reportUserThumb.js`
 に `resolveReportUserThumbSrc` / `buildNiconicoDefaultUserIconUrl` として切り出し（純粋関数・
 vitest 単体検証）。
- `feat(report)`: HTML レポート / マーケ分析に「サムネ付きユーザー一覧」グリッドセクションを
 追加。サムネが解決できた応援ユーザーをコメント件数の多い順にカード表示（HTML レポート 80 件
 / マーケ 60 件、共有伏せ字時は出さない）。
- `feat(popup)`: `buildMarketingDashboardHtml(r, opts)` に `anonymousIdenticonResolver` を
 追加し、popup-entry の 2 箇所の呼び出しを `getCachedAnonymousIdenticonDataUrl` 経由で
 thread。`buildHtmlReportDocument` 側のユーザーテーブルにサムネ列を追加し、`<tr>` の
 colspan を 4 に変更。
- `test`: `reportUserThumb.test.js` を新規（17 ケース：bucket 計算、5 桁境界、scheme 検証、
 priority、resolver 呼び出し、UNKNOWN ケース、短い数字の誤識別防止）。
 `marketingChartsHtml.test.js` に F の 5 ケースを追加（数値 ID → CDN URL、匿名 + identicon、
 avatar 優先、maskShare 時のセクション非表示、avatar 画像非表示）。



- `feat(popup)`: popup 内に「更新履歴」セクションを追加。`<details id="changelogDetails">`
 既定折り畳みで、開かない限りスペースを取らない（UIUX 阻害ゼロ）。`src/lib/changelog.js`
 の `EXTENSION_CHANGELOG` をデータ正本とし、`popup-entry.js` で textContent 派の
 DOM 構築（XSS 安全）。summary 行に「最新: v0.1.12」を出して、開かなくても現行
 バージョンが分かる。version bump 時は `EXTENSION_CHANGELOG` 先頭にエントリを足す
 だけで popup と LP（将来）の両方に反映。
- `lib(new)`: `src/lib/changelog.js` を新設（`EXTENSION_CHANGELOG` /
 `getLatestChangelogEntry` / `compareSemver`）。compareSemver は 0.1.10 vs 0.1.9 の
 ような数値比較を文字列比較ではなく数値で行う（`'10' < '9'` 罠の回避）。
- `test`: `changelog.test.js` を新規追加（14 ケース：frozen 構造 / 各エントリの
 必須フィールド / version 単調降順 / version 重複なし / manifest と先頭が一致 /
 summary 35 字以内 / 項目に HTML タグなし / compareSemver の境界値）。



- `feat(popup)`: コメント textarea に「✨ 盛り上げワード パレット」を追加。
 既存の `.nl-compose-send-actions` に 36px の toggle ボタンを 1 つ差し込み、押下時のみ
 chip ポップオーバー（4 列グリッド）が `position:absolute` で上方向に開く。textarea や
 送信ボタンを押し下げない（UIUX 阻害ゼロを目標）。
 - プリセット 12 個（拍手・笑い・顔文字・歓声・〆）。`8888` / `wwww` / `パチパチ` /
 `👏👏👏` / `🎉🎉🎉` / `草` / `(*^▽^*)` / `(/・ω・)/` / `ｷﾀ━(ﾟ∀ﾟ)━!` / `すごい！` /
 `ナイス！` / `乙でした`。複数行 AA はニコ生で改行が無視されて 1 行に潰れるため、
 1 行で映えるパターンに限定。
 - chip クリック → `insertCommentTextAtCursor` で textarea のカーソル位置（or 選択範囲）
 に挿入し `input` イベントを dispatch（既存の文字数表示・送信ボタン enable 連動が走る）。
 250 字超過は no-op + 軽い通知。
 - 最近使った 5 件は `chrome.storage.local[KEY_CHEER_RECENT_V1]` に保存し、再オープン時に
 先頭に並ぶ（よく使うワードが上に来る学習動作）。次回オープン時に lazy 再描画。
 - 閉じる経路 4 つ: ① toggle 再押下 / ② chip 押下 / ③ Esc キー / ④ 外側クリック。
 chip 押下後は textarea にフォーカスを戻して即送信できる導線。
 - storageKeys.js に `KEY_CHEER_RECENT_V1='nls_cheer_recent_v1'` を追加。
- `lib(new)`: `src/lib/cheerPalette.js` を新設し、preset 定義 / `insertCommentTextAtCursor` /
 `rankCheerPresetsByRecent` / `pushRecentCheerKey` / `normalizeRecentCheerKeys` を分離。
 DOM/storage 非依存の純粋関数群で vitest 単体検証可能（happy-dom 環境）。
- `test`: `cheerPalette.test.js` を新規追加（32 ケース：境界・選択範囲置換・最大長拒否・
 input 発火・recent ランク並べ・上限カット・不正値正規化）。

**0.1.11 バンプまでに入った修正（残課題の後方修復・整合・回帰防止 6 件）**:

- `fix(privacy)`: privacy.html §3「保存場所」を「`chrome.storage.local` に限る」から
 IndexedDB 3 つ（`nls_thumb_v1` / `nls_broadcast_summary_v1` / `nls_auto_backup_v1`）併用に
 整合させる。§9「記録クリア」言及も実装に合わせて「キャッシュクリア + アンインストール」
 構成に書き直し。アンインストール = 完全データロスのため事前 export 推奨を明示。
- `feat(migration)`: `src/lib/migrateClearStaleSelfPosted.js` を新設。0.1.10 未満から自動
 更新したユーザー向けに、過去の TTL ガード抜けで誤って焼き込まれた `selfPosted:true` を
 全 `nls_comments_*` 行から 1 度だけ剥がす後方互換 migration。done flag
 (`nls_migration_clear_stale_selfposted_done_v1`) で再実行を防止。background.js の
 `onInstalled('update')` で `details.previousVersion < 0.1.10` のときだけ走る。
- `feat(lib)`: `src/lib/popupEntryPendingSelfPost.js` (`isPendingSelfPostEntry`) を新設し、
 popup-entry.js の Story Detail / `storyGrowthDisplayLabel` で共通利用。pending self-post
 entry（ndgr 観測前）に対して viewer の数値 ID を表示・リンク化しない（H1 / E-15）。
- `feat(shared)`: `src/shared/avatar/clampAvatarUrl.js` を新設して 2KB 上限を一元管理。
 `commentRecord.createCommentEntry` / `patchExistingComment` / `userCommentProfileCache.normalizeUserCommentProfileMap`
 で参照させる（H2 / D-5）。既存行の avatarUrl が 0.1.9 以前で書かれた長すぎる URL でも
 patch 経路で短縮される。
- `fix(content)`: content-entry.js の 4 つの `setInterval`（liveId poll / live panel scan /
 deep harvest periodic / stats poll）を id 保持化し、`hasExtensionContext()` が false に
 なった tick で `clearInterval`（ML1: 0.1.9-5 で popup 側だけ修正したのを content にも揃える）。
- `test`: `migrateClearStaleSelfPosted.test.js` (14 ケース) / `popupEntryPendingSelfPost.test.js`
 (7 ケース) / `clampAvatarUrl.test.js` (11 ケース) を新規追加。テスト先行で実装。

**0.1.11 への追加修正（CWS 提出前に発見した A+B：視認性 + 前面化レース 3 件）**:

- `fix(a11y/preset)`: `src/lib/popupFramePresets.js` に `KNOWN_FRAME_VARS` を export し、
 全 4 プリセット（light / dark / midnight / sunset）+ custom resolver に
 `--nl-text-sub` / `--nl-rank-count` / `--nl-stat-card-bg-start` / `--nl-stat-card-bg-end` /
 `--nl-stat-card-border` / `--nl-stat-card-shadow` / `--nl-placeholder` を強制追加。
 経緯（A1 親バグ）: light / sunset 選択時、popup.html の `html.nl-skin-panel-dark` 配下の
 ダーク色（`#cbd5e1` 等）が inline で上書きされず残留し、白背景上で薄水色の補助テキストが
 読めなくなる症状があった（toolbar standalone は INLINE_MODE=false で常に
 `nl-skin-panel-dark` が付く）。`popup-entry.js#applyPopupFrame()` で新プリセット適用前に
 `KNOWN_FRAME_VARS` を一括 `removeProperty()` し、必ず新プリセットの値で塗り直す。
- `fix(a11y/popup)`: `extension/popup.html` の `.nl-live-stat-card` を `var(--nl-stat-card-bg-start)`
 等に変数化（旧 `html.nl-skin-panel-dark .nl-live-stat-card` の dark ハードコード上書きを削除）。
 `--nl-placeholder` を `:root` と `html.nl-skin-panel-dark` に追加し、`input::placeholder` /
 `textarea::placeholder` でフレーム由来色 + `opacity:1` を強制。
- `fix(content)`: `src/extension/content-entry.js#focusInlinePanelHostFromToolbar` を async
 化し、`pollUntil` で host rect ≥120×120 になるまで最大 500ms 待つ（rAF 約 16 フレーム相当）。
 経緯（B1 race）: toolbar 押下 → `renderPageFrameOverlay()` で host 挿入直後の layout 未確定
 タイミングで `r.width < 120` 即時判定が false を返し、「toolbar popup だけが小さく出てインラインに
 前面化されない」症状の原因だった。判定条件を `src/lib/inlinePanelFocusGate.js` に純粋関数として
 切り出し、unit test（11 ケース）を併設。`onMessage` listener は `return true` でチャネルを
 維持し IIFE 内で sendResponse する Chrome MV3 標準パターンへ移行。
- `fix(content)`: dock_bottom placement にも「× 閉じる」ボタンを設置。元 `ensureInlineFloatingCloseButton`
 を `ensureInlinePanelCloseButton` に改称し、`renderInlinePanelDockBottomHost` 末尾でも呼ぶ
 （0.1.10 で floating だけに付けた A30 を、dock_bottom にも展開：F-7 残課題）。
- `test`: `inlinePanelFocusGate.test.js` (11 ケース新設) / `popupFramePresets.test.js` の
 KNOWN_FRAME_VARS 契約テスト 8 ケース追加（33 → 41）。

## 5. 直近セッションで入った変更（2026-04-29）

**0.1.10 バンプまでに入った修正（セキュリティ・Privacy・a11y・出自整理 13 件）**:

- `fix(privacy)`: privacy.html §6 OpenRouter を「未実装・将来予定」に書き換え。
 要約・目次・§4-2・§10・meta description / OG / 章間相互参照を一掃。
- `fix(brand)`: 「煌めき」→「きらめき」hiragana 統一（LP / privacy / site.webmanifest /
 OG / schema.org）。意匠ルビ `<ruby>煌めき<rt>きらめき</rt></ruby>` のみ残置。
- `chore(asset)`: `extension/images/icon/kewXCUOt_400x400.jpg` を削除し、`STORY_RINK_COLLECTING_JPG`
 を `images/yukkuri-charactore-english/link/link-yukkuri-blink-mouth-closed.png` に差し替え。
 stage-submission.py のホワイトリストからも除外。
- `fix(security)`: HTML レポート（popup-entry.js）/ マーケ HTML（marketingChartsHtml.js）の
 `<img src>` で `isHttpOrHttpsUrl` チェック必須化。data:URL 経由の保存 HTML 開封時 XSS を防止。
- `fix(security)`: `src/shared/html/escape.js` で single quote `'` → `&#39;` 追加 + 単体テスト。
- `fix(security)`: `src/lib/commentRecord.js` で `avatarUrl` を 2000 字 slice。
- `fix(a11y)`: `popupFramePresets.js` の dark / midnight に `--nl-text-sub: #cbd5e1` 追加。
- `fix(a11y)`: `#storageErrorBanner` の `role="alert"` と `aria-live="polite"` の矛盾を解消。
- `fix(a11y)`: `#recordToggle` に `:focus-visible { outline: 2px solid var(--nl-accent) }`。
- `fix(a11y)`: `.nl-top-support-rank__count` を `var(--nl-rank-count)` 経由にし、ダーク時に
 `#5eead4` で上書き。
- `fix(a11y)`: `<textarea id="commentInput">` に `aria-label="コメント本文（250文字まで）"`。
- `feat(content)`: floating placement の host に「× パネルを閉じる」ボタン追加（A30）。
- `docs(agents)`: §3.1「ゆっくり」方針を「東方Project の二次創作キャラと別物なので使用 OK」に
 更新。

**0.1.9 バンプまでに入った修正（シナリオ調査の小修正 8 件）**:

- `fix(privacy)`: pending self-post に `pending-self:` 識別子を持つ entry の Story Detail カード
 で viewerUid を表示せず「自分のコメント（送信中）」に。184 投稿時の身元バレ防止。
- `fix(popup)`: HTML 保存の `URL.revokeObjectURL` を `setTimeout(60_000)` で遅延化、
 巨大 HTML での silent download failure を回避。
- `fix(content)`: `interceptedNicknames` / `interceptedAvatars` の `trimMapToMax` 適用で
 長時間配信時のメモリ増殖を抑止。
- `fix(content, page-intercept)`: `pollStatsFromPage` / `mainWorldPollStats` 入口で
 watch URL 再チェック。SPA 後の非 watch ページでの無駄 fetch を停止。
- `fix(popup)`: `setInterval` の id を保持し、context invalidate 時に `clearInterval`。
- `fix(popup)`: `extensionContextBanner` に「このパネルを再読み込み」ボタンを追加。
- `feat(popup)`: `navigator.onLine` 監視でオフラインバナーを表示。
- `fix(lib)`: `probeMicrophoneLevel` の RAF backgrounded ハングに setTimeout フォールバック。

**0.1.8 バンプまでに入った修正（自コメ表示の追加安定化）**:

- `fix(content)`: pendingItems フィルタを `filterValidSelfPostedRecents` に統一し
 24h TTL を強制（Storage H8）。前日の自コメ recent が翌日の他人コメントに焼き込まれる
 永続汚染を防止。
- `fix(popup)`: pending self-posted entry に `avatarObserved: true` を立てる
 （Self-comment M1）。snapshot 取得前 paint でも linkPolicy 経路を通って link 段に
 安定配属されるようにする。
- `fix(popup, content)`: `appendSelfPostedComment` / `rememberNativeSelfPostedComment`
 で生本文を optional `textRaw` として保持。`selfPostedMatcher.filterValidSelfPostedRecents`
 を pass-through 化。pending → 本物 entry 切替時の改行・空白ちらつきを抑止。
- `test(lib)`: `selfPostedMatcher.test.js` に textRaw 保持・型不正時の除外ケース 2 件追加。

**0.1.7 バンプまでに入った修正**:

- `fix(popup)`: 自コメが上部ランキング・りんくレーンに出ない不具合（`hasOwnPostedEntryForUserId` 導入 + `laneFeedEntries` 合流）。
- `fix(content)`: 取り込み中ローディング文言とキャラガイド見出しを AGENTS.md §3.1 方針に合流
 （`htmlReportConceptGuide.js` / `content-entry.js` / `storageKeys.js` / `supportGrowthTileSrc.js`）。
- `fix(lp)`: LP と privacy の「ゆっくり(りんく/こん太/たぬ姉)」をキャラ名のみに置換（85 箇所）。
 `ゆっくり解説` 見出しは段階 2 扱いで未着手（別チャット）。
- `fix(e2e)`: inline-panel 系 E2E が既定 OFF 化した autoshow に追従できていなかったのを修正
 （`tests/e2e/fixtures.js` に `enableInlinePanelAutoshow` ヘルパ追加）。
- `chore(lint)`: `build/** / test-results/** / playwright-report/**` を ESLint ignore に追加
 （CWS 提出 staging で lint が 900+ エラーに膨れていたのを修理）。

**審査過去の変更**:

```
af5ec15 chore: Google Search Console 所有権確認用 HTML を設置
3d9172b fix(privacy): topbar を LP と同じハンバーガー＋in-app 警告に差し替え
cfba326 feat(lp): Phase H コメンター活発度色分けの説明を LP に追加 + プライバシーポリシーページを新設
```

加えて CWS 向けの画像アセットを `src/images/googlechrom/` にマスター置き済み。

---

## 6. 審査通過後にやること（TODO）

1. **LP (`tsuioku-no-kirameki/index.html`) に「Chrome ウェブストアで入手」
   ボタンを追加**。URL は承認メールが来たら CWS の公開ページから取得。
   ヒーローセクションの CTA と、フッターの 2 箇所に置くのが自然。
2. **privacy.html の最下部「インストールは Chrome ウェブストアから」リンク
   も同じ URL に差し替え**。
3. **スクリーンショットの段階的差し替え検討**。現状は UI 配色・機能を
   正確に表したコンセプトモックだが、将来的に実動画面に差し替える余地あり。
4. **YouTube 動画の説明欄に CWS の公式 URL を追加**（`tsuioku-no-kirameki.com`
   だけでなく、ストアページへのリンクがあると導線が強化される）。
5. **レビュー・評価が付き始めたら、LP の「ユーザーの声」セクションを更新**。

---

## 7. コミット・メッセージ規約

- プレフィックス: `feat` / `fix` / `chore` / `docs` / `refactor` / `style` / `test`
- スコープは括弧で括る: `feat(lp): ...` / `fix(privacy): ...`
- 日本語本文で OK。件名は 1 行 50〜72 字目安。
- Claude Code が付ける `Co-Authored-By: Claude ...` 行はそのまま残す。

---

## 8. デプロイ / CI

- **LP**: `master` ブランチへ push すると、XServer 側の GitHub Webhook が
  自動で `tsuioku-no-kirameki/` 配下を本番反映する。ビルド手順は不要。
- **拡張 ZIP**: `build/submission-<version>/` に ZIP 生成用の素ファイルを
 staging し、Python の `zipfile` でフォワードスラッシュ化して作る
 （Windows の `Compress-Archive` はバックスラッシュになるので使用不可）。
 - 一括手順: `python scripts/stage-submission.py <version>`
 - 生成物: `build/submission-<version>/` と `build/tsuioku-no-kirameki-<version>.zip`
 - スクリプトが自動でやること:
 (1) dev `extension/manifest.json` から localhost / 127.0.0.1 を落とす
 (2) description の「（開発識別子: nicolivelog）」サフィックスを落とす
 (3) ホワイトリストで必要な画像だけコピー（LP 用・マスター大容量アセットを除外）
 (4) ZIP 出力前に全エントリがフォワードスラッシュか検証

---

## 9. エージェントへのお願い

- **この AGENTS.md を最初に読むこと**。とくに §3 の「ゆっくり NG」と
  「3 キャラの役割」は、コピー＆新規生成するコンテンツに波及しやすい。
- **CWS 申請関連のファイル**（`src/images/googlechrom/`, `build/store-listing/`
  の `description-ja.txt` / `privacy-justifications-ja.txt`）は、仕様・文言を
  変える際に必ず「審査通過後の差分提出」を意識する。
- **プライバシー周り**の文言を変更したら、`privacy.html` と
  `description-ja.txt` と `privacy-justifications-ja.txt` の 3 点を
  同期させる（片方だけ変わると審査で齟齬として指摘される）。
