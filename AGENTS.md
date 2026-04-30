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

- **次回提出バージョン**: 0.1.58（2026-05-01 ローカル準備）
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

**0.1.54 バンプで入った変更（ランキング導線を常時表示 AJ）**:

- ユーザー報告（再再）: 0.1.53 で source ベース判定にしても popup 側で
  導線が出ない（前ひらいた放送のデータが表示されたまま）。
- 原因（推定）: 複数 window / 複数モニタ環境で
  `chrome.windows.getLastFocused({windowTypes:['normal']})` が想定と違う
  window を返し、source='lastFocusedNormal' で hint を hidden 判定して
  しまうケースがある。確証取れず、デバッグログでの追跡が必要だが、それ
  より早期にユーザー要望を満たす方が優先。
- 修正: 判定を簡素化して、**`INLINE_MODE` 以外（standalone popup window）
  では常時 hint を表示**する形に変更。INLINE_MODE は watch ページ内 iframe
  なのでユーザーは既に watch を見ており hint 不要。
- 副作用: ユーザーが standalone popup window で watch 状態のときも hint が
  表示される（ランキング導線として併設）。データは引き続き表示されるので
  情報量が増えるだけで害は少ない。

**0.1.53 バンプで入った変更（ランキング導線の表示条件強化 AI）**:

- ユーザー報告: 0.1.52 でランキング導線を追加したが「何もないところを
  クリックすると前ひらいた放送につながっている」状態が継続。
- 原因: 0.1.52 は `!isNicoLiveWatchUrl(url)` で導線表示を判定していた。
  しかし `pickWatchUrlFromMultipleSources` は storage の `nls_last_watch_url`
  を fallback で使うため、Google 等の非 watch タブでも url が watch URL と
  なって導線が hidden のままだった。
- 修正: `watchUrlPick.source` を見て、`'activeTab'` / `'lastFocusedNormal'`
  以外（= `'storage'` / `'none'`）のとき導線を表示する。アクティブな watch
  タブが無いケースを正しく検出。
- 副作用: アクティブタブが watch じゃないと前回データの表示が（取得不可）
  表示と並走することはあるが、ランキング導線も同時に出るので「何もない
  ページでも次の放送を探せる」UX 確保。

**0.1.52 バンプで入った変更（ニコ生ランキング導線 AH）**:

- ユーザー要望: 「何もないところの場合、ニコニコの生放送ランキングに飛ぶ
  のはどうでしょうか？ ちくらんとか？」
- 内容: watch ページ以外で popup を開いた時、これまでは「（ニコ生 watch を
  開いてください）」のテキストだけだったのを、ニコ生のランキング系ページ
  への導線リンクを **light 配色のカード** で出すよう変更:
   - 🏠 ニコニコ生放送 トップ (live.nicovideo.jp/)
   - 📊 生放送ランキング (live.nicovideo.jp/ranking)
   - 🎯 ちくらん（コミュニティ生放送ランキング）(com.nicovideo.jp/ranking/live)
   - 🆕 開始したばかりの放送 (live.nicovideo.jp/recent)
- 実装: popup.html に `<section id="noWatchRankingHint">` を hidden で配置、
  popup-entry.js の refresh で `!isNicoLiveWatchUrl(url)` のとき hidden を
  外す。すべての URL は target="_blank" rel="noopener noreferrer"。

**0.1.51 バンプで入った修正（popup の dark を完全撤去 AG）**:

- ユーザー報告（再）: 0.1.50 で `prefers-color-scheme: dark` 検出に切り
  替えても、なにも放送がないページで popup を開くと依然 dark になる。
- 原因: Chrome のテーマ設定 / Windows のシステム配色（アクセント色等）が
  dark 寄りだと `window.matchMedia('(prefers-color-scheme: dark)').matches`
  が `true` を返してしまい、ユーザーの「OS は light」という体感と食い違う。
  matchMedia は環境依存で信頼性に欠けることが判明。
- 修正: `nl-skin-panel-dark` クラスの動的 toggle を撤去し、popup は常に
  light 配色（:root の cream-ish #fffaf2 背景）固定に変更。dark を望む
  ユーザー向けには将来 設定トグルを追加する余地は残す。
- 副作用: 従来 dark で慣れていたユーザーは突然 light に変わるが、視認性
  低下のクレームの方が深刻だったため light 固定で出荷。

**0.1.50 バンプで入った修正（popup 黒テーマ強制を撤去 AF）**:

- ユーザー報告: 「OS は dark に切り替えていないのに popup が真っ黒で視認性悪い」
  が継続。watch ページ以外（ブラウザのトップページ・他サイト等）でツールバー
  から popup を開くと standalone popup window が常に dark テーマで開いていた。
- 原因: `applyResponsivePopupLayout` (popup-entry.js:374-375) が
  `!INLINE_MODE || INLINE_SIDE_PANEL` で常に `nl-skin-panel-dark` クラスを
  当てる固定挙動だった。INLINE_MODE は親ページに同化するので影響なしだが、
  standalone popup window と side panel は OS 設定に関わらず dark に
  なってしまう。
- 修正: `window.matchMedia('(prefers-color-scheme: dark)')` を見て、
  OS が dark のときだけ `nl-skin-panel-dark` を当てるよう変更。OS が light
  なら popup も :root の light 配色（cream-ish #fffaf2 背景）になる。
- 副作用: dark を使っていたユーザーは OS 設定で切り替えれば従来どおり。

**0.1.49 バンプで入った修正（marketingDynamicAdvice 配線 AE）**:

ユーザー要望「もっとマーケ増やせますか？」に応えて、`marketingDynamicAdvice.js`
（0.1.33 で作成、329 行・100+ ルール）を完全に未配線（dead code）から
本番配線へ。マーケ分析の各セクションに「データに応じて変わるキャラ別
アドバイス」が動的に出るようになった。

- **配線方針**:
  - 既存の固定アドバイス（`adviceAfter*` 関数群）はそのまま残す（後方互換）
  - その直後に `dynamicAdviceCardsHtml(section, dynMetrics)` を挿入
  - rule が何もマッチしない場合は空文字を返すので、固定アドバイスのみ表示

- **対象 16 セクション**:
  kpi / concurrent / laughter / newVsRepeat / survival / silence / keyboard /
  recentCmp / growth / waveform / echo / firstSecond / talentPeak / sentiment /
  uniqueWords / reach

- **AdviceMetrics 組み立て**: 集約済みデータ（MarketingReport, ConcurrentPeakAnalysis,
  LaughterDensityTimeline, silenceZones, newVsRepeat, sentimentCurve, reach,
  growth, firstSecondLatency, survivalCurve, talentPeaks, echoPropagation,
  echoSync, recentComparison, uniqueWords, similarBroadcasts, keyboardTypes）
  から `buildDynamicAdviceMetrics(opts)` で AdviceMetrics 型に正規化。

**0.1.48 バンプで入った修正（大規模配信のマーケ分析安定化 AD）**:

- **M4 (AD): `Math.min(...arr)` / `Math.max(...arr)` のスタックオーバーフロー**
  - 原因: `marketingAggregate.js` の `Math.min(...timestamps)` /
    `Math.max(...vps)` は spread が引数上限（V8 で 65535 程度）を超えると
    "Maximum call stack size exceeded" を投げる。8 万コメ超の人気配信者
    放送でマーケ分析ボタンが「分析がタイムアウトしました」になる経路と
    区別がつかない無症状失敗を起こしていた。
  - 修正: `Math.min/max(...arr)` を for ループ reduce に置換。引数上限の
    制限を受けないため数十万件まで安全。

**0.1.47 バンプで入った修正（同接カーブ hybrid + 連打事故防止 AC）**:

- **M10 (AC): 同接タイムラインの source 二者択一による sample 落ち**
  - 原因: `buildConcurrentTimelineSeries` は「official が 1 件以上あれば
    全 official、無ければ全 estimated」の二者択一だったため、official が
    途中 1 件だけ入った放送で残り 90% の estimated 行が捨てられ、
    `sectionConcurrentTimeline` が `series.points.length < 2` で空表示に
    なっていた。「同接サンプルが取れていません」アドバイスが出るが実は
    estimated は十分取れているという食い違い。
  - 修正: per-row で official 優先 → 無ければ estimated に fallback する
    hybrid 方式へ変更。集約 source は all-official / all-estimated /
    `mixed`（混在）を返す。`marketingChartsHtml.js` の sourceLabel も
    mixed 対応（"公式来場者数 + 同接推定値（取れた方を採用）"）。

- **P1/P2 (AC): 連打防止漏れ（exportBtn / captureBtn）**
  - 原因: `exportBtn` / `captureBtn` のクリックハンドラ内でボタンを一度も
    `disabled = true` にしていなかった。`downloadCommentsHtml` は数万
    コメント環境では数秒かかるため、ユーザーが連打すると並行で走り、
    Blob URL が複数生成されて連番ファイルが大量ダウンロードされる。
    キャプチャは ms 単位 timestamp なので連打時に同名扱いで `uniquify`
    が連番化、`safeRefresh` も毎回 trigger されて UI が荒れる。
  - 修正: 開始時に `btn.disabled = true`、`finally` で `false` に戻す。

**0.1.46 バンプで入った修正（マーケ分析の精度向上 AB）**:

並列で 3 件の deep audit エージェントを走らせ（popup-entry / 性能 / マーケ分析）、
合計 43 件の発見のうち高優先度・低リスクの 2 件を修正。

- **M1 (AB): aggregateMarketingReport の配信者除外漏れ**
  - 原因: 0.1.17 で `sectionTopUsers` と `sectionUsersWithThumbnails` の
    表示時フィルタは入っていたが、`aggregateMarketingReport` の集計層は
    `broadcasterUserId` を引数で受け取らず、配信者本人のコメ（合いの手等）
    が KPI / CPM / uniqueUsers / timeline / segment / coreReturning に
    そのまま入っていた。配信者が合いの手 50 コメ打つと CPM が +1〜2、
    selfPosted% も歪む。
  - 修正: `aggregateMarketingReport(comments, liveId, { broadcasterUserId })`
    に optional 引数を追加し、`filtered` 段階で配信者 uid のコメを除外。
    popup-entry.js の 2 ヶ所（dev export ボタン経路 + STORY_SOURCE_STATE
    fallback 経路）から `watchMetaCache.snapshot.broadcasterUserId` を
    渡す形に更新。テスト 5 ケース追加。

- **M5 (AB): commentNo 欠落時の dedupe key に userId が無い**
  - 原因: `buildDedupeKey` は `commentNo` ありなら `${liveId}|${no}|${text}`、
    無しなら `${liveId}||${text}|${sec}` だった。NDGR 経由ではない DOM
    intercept fallback や、commentNo が拾えない局面で複数ユーザーが同じ
    1 秒内に同じ短文（"8888" / "草" 等）を打つと、最初の 1 件だけ採用
    され残りは patch 扱いになる。マーケ分析の **L1 コメ伝染** / **L5
    コメ被り瞬間** の `detectCommentSyncBursts` は minDistinctUsers=3 を
    要求するが、複数ユーザーが 1 件にマージされて条件を満たさなくなり
    検出不能だった。
  - 修正: commentNo 欠落時のフォールバック key に userId を含める
    （`${liveId}||${text}|${sec}|${uid}`）。同秒・同テキスト・別ユーザー
    が別行として扱われるようになる。テスト 3 ケース追加（後方互換 +
    別ユーザーの key 区別）。

**0.1.45 バンプで入った修正（裏側クリーンアップ + プライバシー AT）**:

deep audit 発見の中優先度バグ 2 件:

- **B5: `pageFrameLoopTimer` 停止漏れ**
  - 原因: `chrome://extensions` で拡張をリロードすると `hasExtensionContext()`
    が false に転じるが、`pageFrameLoopTimer`（360ms 周期で
    renderPageFrameOverlay/maybeRunEndedBulkHarvest を回す）は
    `stopContentIntervalsIfContextInvalidated` の停止対象に入っておらず、
    tick の冒頭で early return するだけ。setInterval slot と CPU が
    タブ寿命まで消費され続ける（特に多数の watch タブを長時間開いた後の
    ヘビーリロード時に蓄積）。
  - 修正: `stopContentIntervalsIfContextInvalidated` で `pageFrameLoopTimer`
    も `clearInterval` する。

- **B14: AI 診断 URL に query/fragment が残る**
  - 原因: `persistAiShareFastDiagnostics` と `buildAiShareFastDiagnosticsPayload`
    が `window.location.href.slice(0, 500)` をそのまま保存していた。ニコ生
    の querystring に session token / referrer / user 識別子が乗っていた
    場合、診断 dump を AI に貼ったり開発者に送ったりする際に個人情報が漏れる
    懸念。
  - 修正: 新規 helper `sanitizeWatchUrlForDiag` で `URL.origin + pathname`
    のみ残し query/fragment を strip。`buildAiShareFastDiagnosticsPayload`
    の 2 箇所と `persistAiShareFastDiagnostics` の 1 箇所、計 3 ヶ所を
    更新。

**0.1.44 バンプで入った修正（裏側のメモリ効率と整合性 AS）**:

deep audit エージェントが発見した中優先度のバグ 2 件を修正。

- **B8 (Z): thumbDb のメモリスパイク**
  - 原因: `addThumbBlob` が 30 秒ごとのサムネ保存で `idx.getAll(lid)` を
    呼び、過去の全 thumbnail（最大 500 枚 × 数百KB の Blob）を一括で
    deserialize → メモリ展開していた。長時間視聴で各回 100MB 級の
    瞬時アロケーションが発生し、低スペック端末で UI hitch を引き起こす。
    `countThumbsForLive` も `idx.getAll(lid).length` で同じ無駄をしていた。
  - 修正:
    - `addThumbBlob`: `idx.getAll` → `idx.openCursor` で 1 件ずつ
      iterate、id と capturedAt だけ抽出した summary 配列を作る形に変更。
      Blob 参照を都度作っては捨てるので peak メモリが大幅減。
    - `countThumbsForLive`: `idx.getAll(lid).length` → `idx.count(IDBKeyRange.only(lid))`
      で値を読まず件数だけ返す（高速・省メモリ）。

- **B2 (Z): KEY_AUTO_BACKUP_STATE の last-write-wins race**
  - 原因: `KEY_AUTO_BACKUP_STATE` は **content（commentCount/updatedAt
    /lastCommentAt/watchUrl 担当）** と **background SW（lastBackupAt/
    lastBackedUpdatedAt/lastBackupCount 担当）** の両方が更新する。
    旧 content コードは `bag` を冒頭で 1 回読んだだけで write したため、
    その間に background が更新した backup 系フィールドを stale 値で
    上書きする race があり、結果として **次サイクルで同じスナップショット
    を再保存し IDB に重複バックアップが溜まる**（24件枠の中身が全部同じ
    になる）現象を引き起こしていた。
  - 修正: content の persist 直前で `KEY_AUTO_BACKUP_STATE` を再 read。
    background 担当フィールドは fresh 値、content 担当フィールドは新規値
    で merge する。他の live のエントリは fresh state をそのまま使う。
    background 側は既に 0.1.x で fresh re-read パターンになっていた
    （対称化）。

**0.1.43 バンプで入った修正（パネルが開かない事象 + listener 二重登録 AR）**:

ユーザー報告と並行で deep audit エージェントを 2 件走らせ、未解決 2 件 +
新規発見 17 件のうち最も user-impacting な 2 件を修正。

- **症状 B (Y): kon-ta クリックしてもパネルが開かない**
  - 原因: 0.1.18 以降の prewarm 機構で、host が DOM 上にあっても
    `display:none` / offscreen のまま「見えない」状態が増えた。
    `shouldRespondFocusedNowFromToolbar` は `host.isConnected` だけで
    判定していたため、prewarmed host が renderPageFrameOverlay で
    可視化されないケース（プレイヤー未検出・タブ非アクティブ等）でも
    `focused=true` を返し、background.js は popup window fallback を
    起動せず → ユーザーから「kon-ta 押しても何も起きない」現象になっていた。
  - 修正: `shouldRespondFocusedNowFromToolbar` に optional の
    `getComputedStyle` deps を追加し、computedStyle が取れる環境では
    `display !== 'none'` && `visibility !== 'hidden'` を確認する。
    不可視なら false → background が popup window fallback を起動し、
    ユーザーに何かしら表示される。テスト 7 ケース追加。

- **B11: content script の onMessage listener が二重登録**
  - 原因: `chrome.runtime.onMessage.addListener` を content-entry.js の
    トップレベルで呼んでいたため、SPA navigation で再注入されると
    listener が累積。複数フレームから NLS_FOCUS_INLINE_PANEL に応答し
    sendResponse の port が複数解釈されて Chrome が "The message port
    closed before a response was received" エラーを投げ、background.js
    側が popup window fallback を誤発火する原因になっていた。
  - 修正: `globalThis.__NLS_CONTENT_MSG_LISTENER_BOUND__` フラグで
    listener 登録を idempotent にし、再注入時は二重登録しない。

**0.1.42 バンプで入った修正（複数タブ並行時の prewarm 競合解消 AQ）**:

- ユーザー報告: 複数 watch タブを同時に開いていると、kon-ta クリック→
 パネル表示までの体感が遅くなる。0.1.41 までのデータ混信は解消したが、
 表示速度の問題は残っていた。
- 原因: 各 watch タブが独立に `prewarmInlinePopupIframe` で popup.html を
 裏ロードしていた。複数タブが visible 並行状態のとき全タブで popup.html
 （10000+ 行 JS）が並列パース・実行 → CPU 取り合いで個々の prewarm が
 遅延 → kon-ta クリック時に iframe 未ロードでパネル表示が遅い。
 0.1.32 で「バックグラウンドタブはスキップ」にしたが、複数 window を
 並べて全 visible にされた場合は依然全タブ並列。
- 修正: 新規 lib `src/lib/prewarmCoordinator.js`
 （`decidePrewarmLeaseAction`、純粋関数 + 10 ケース TDD）。
 `chrome.storage.local` の `nls_prewarm_lease_v1` キーで lease 機構を
 実装し、prewarm 前に **同時に走らせるタブを 1 つに絞る**。
   - claim: lease が空 / 自分 / 古い（10s 経過） → 自分の名前で書き込む
   - proceed: 既に自分が保持中
   - defer: 他タブが保持中 → 1.5s 後に再試行
 prewarm 完了 / エラー時に lease を release。タブが落ちて release されない
 ケースは TTL（10s）で他タブが claim 横取り。
- 効果: 複数タブで連鎖的に prewarm が走るため、各タブの popup.html ロードが
 順序立てて 1 つずつ完了。クリック時には iframe がロード済みになっている
 確率が上がる。

**0.1.41 バンプで入った修正（深層監査結果の反映 AP）**:

ユーザー報告の「配信者タイル消える / multi-tab 混信 / 取り込み率 17%」を
deep audit エージェントで原因特定し、3 件まとめて修正。

- **W1: 配信者タイル「出たと思ったら消える」**
  - 原因: popup-entry.js が 10〜30 秒の polling で `watchMetaCache.snapshot`
    を無条件上書きしていた。content-entry.js の collectWatchPageSnapshot は
    `embedded-data` から broadcaster 系を引くが、niconico SPA は時間経過で
    `#embedded-data` を一瞬書き換えるため、運悪く polling がそのタイミング
    に当たると broadcaster フィールドが空文字の snapshot で旧値を消して
    しまっていた。
  - 修正: 新規 lib `src/lib/watchSnapshotPartialMerge.js`
    （`mergeWatchSnapshotPreservingBroadcaster`、純粋関数 + 11 ケース TDD）。
    broadcaster identity 5 フィールド（name / pageUrl / iconUrl / userId /
    level）は新値が空なら旧値を保つ partial-merge にする。

- **W2: 複数タブで kon-ta パネルが混信**
  - 原因: standalone popup window では `chrome.tabs.query({active:true,
    currentWindow:true})` が popup window 自身を currentWindow とみなし、
    popup.html の URL を返す。これは niconico URL ではないので storage
    `nls_last_watch_url` へ fallback していたが、この値は全 watch タブの
    content script が last-write-wins で書き換えるため、複数タブで popup
    を順に開くと **すべて同じ「直近 1 つの watch タブ URL」を見る** 状態に
    なり、データが混信する。
  - 修正: 新規 lib `src/lib/popupWatchUrlResolveMultiTab.js`
    （`pickWatchUrlFromMultipleSources`、純粋関数 + 8 ケース TDD）。
    `chrome.windows.getLastFocused({windowTypes:['normal']})` で「直前の
    通常 window のアクティブタブ」を取得し、storage より優先する 3 段
    判定（activeTab → lastFocusedNormal → storage）に変更。

- **W3: コメ取り込み率 17%**
  - 原因: `runDeepHarvest` が `!opts.force && shouldSkipDeepHarvest()` で
    NDGR active 中は早期 return していた。`tryPeriodicQuietDeepHarvest` /
    `onTabVisibleForCommentHarvest` 経路は recovery を計算して force=true
    を渡していたが、`scheduleDeepHarvest` 経路（liveIdChange / recordingOn /
    tabVisible reason）は `shouldForceDeepHarvestForReason` が startup
    のみ true を返すため、ライブ参加直後の backlog（既に積まれていた数百
    件のコメント）が NDGR active のせいで永遠に取れなかった。
  - 修正: `runDeepHarvest` 内に `shouldForceDeepHarvestRecovery`（既に
    lib 化済みだったが結線されていなかった）を OR 条件で追加。
    NDGR active でも前回 deep から 5 分以上経っていれば force 実行する
    defense-in-depth。

**0.1.40 バンプで入った修正（公式チャンネル放送の配信者タイル復活 AO）**:

- ユーザー報告: lv350162154（にじさんじオフィシャル ニコニコチャンネル）の
 watch ページで、配信者タイルが popup に出ない。一般ユーザー放送（kyoncy
 さん枠）では正しく出るので、公式チャンネル特有の事象。
- 原因: 公式チャンネル放送では embedded-data の構造が違う。
   - `program.supplier.name` = "株式会社ドワンゴ"（提供会社名で、画面で
    見える本来のチャンネル名ではない）
   - `program.supplier.pageUrl` は無い
   - 真のチャンネル名は `socialGroup.name`（"にじさんじオフィシャル
    ニコニコチャンネル"）、URL は `socialGroup.socialGroupPageUrl`
    (`https://ch.nicovideo.jp/channel/ch{id}`)、アイコンは
    `socialGroup.thumbnailImageUrl`
   - 既存 `collectWatchPageSnapshot` は supplier 側だけ見ていたため
    `broadcasterPageUrl` が空になり、popup の `resolveBroadcasterFollowTarget`
    が kind=none を返してタイルが消えていた。さらに既存のアイコン fallback
    は旧フィールド名 `thumbnailUrl` のみ参照していて、新フィールド
    `thumbnailImageUrl` を読まなかった。
- 修正: 新規 lib `src/lib/channelBroadcasterMeta.js`（純粋関数 + 19 ケース
 TDD）。3 経路（supplier.supplierType / program.providerType /
 socialGroup.type のいずれかが `"channel"`）でチャンネル放送を判定し、
 socialGroup から name / pageUrl / iconUrl を抽出する。
- `collectWatchPageSnapshot` で kind=channel のときは socialGroup 由来の
 値を broadcasterName / broadcasterPageUrl / broadcasterIconUrl に入れる。
 アイコンは `thumbnailImageUrl` / `thumbnailSmallImageUrl` を旧フィールド
 より優先。
- 効果: にじさんじオフィシャルでも配信者タイルが出て、フォロー先が
 正しい channel ページに飛ぶ。

**0.1.39 バンプで入った修正（配信者リンク誤検出の再発防止 + 切り出し AN）**:

- ユーザー報告: lv350421699（配信者 = ᖇIO / userId 143899079）の watch
 ページで、0.1.38 修正適用前は配信者タイルからクリックすると関連配信枠
 の覇成 赤（43068016, 1 度もコメしていない別人）に飛んでいた。
- 原因（追加調査）: watch ページの DOM には `/user/{id}/live_programs`
 形式 anchor が **5 件** 含まれていた:
   1. 関連配信サイドバー → 覇成 赤 (43068016)
   2. 関連配信サイドバー → アライ (94392112)
   3. 関連配信サイドバー → シルメリア (23600899)
   4. 関連配信サイドバー → ヒナたん (131913660)
   5. 配信者ペイン → ᖇIO (143899079) ← `?ref=watch_user_information` 付き
 0.1.38 で `embedded-data.program.supplier.programProviderId` 最優先にしたが、
 万一 embedded-data が読めない場合に DOM フォールバックが先頭 hit を採るため
 別人を返してしまう。
- 修正: `extractBroadcasterUserId` の API を拡張して
 `streamLinkHrefCandidates: string[]` を受け取るようにし、DOM 候補配列から
 `?ref=watch_user_information` 付き anchor を最優先（無ければ先頭）で 1 つに
 絞ってから uid を抽出する。embedded-data があれば従来どおり最優先。
- 同じパターンを使う `detectBroadcasterUserIdFromDom`（こん太レーン汚染検出
 等で使用）も同じ defense-in-depth に統一。
- TDD: 13 → 22 ケースに拡張（lv350421699 case を含む 9 ケース追加）。
- 同梱: アバター URL 比較ヘルパ（`avatarCompareKey` / `isSameAvatarUrl`）を
 `src/lib/avatarUrlCompare.js` に切り出し（純粋関数 + 14 ケース TDD）。

**0.1.38 バンプで入った修正（配信者 UID 取り違え修正 + 切り出し AM）**:

- ユーザー報告: lv350420992（配信者 = 刑事桃 / userId 115713314）の watch
 ページで、配信者タイルからクリックすると別人 Nasu（45300945）のページに飛ぶ。
 さらに本配信者 115713314 が こん太レーン に混入していた（ Nasu は本来の
 配信者ではなく、コメ投稿もしていない別ユーザ）。
- 原因: `collectWatchPageSnapshot` の `streamLink` ピッカが
 `document.querySelectorAll('a[href*="/user/"]')` で先頭 hit の
 `/user/{id}/live_programs` 形式 anchor から uid を取り出していた。
 watch ページにはコメ欄言及や履歴ウィジェット等で `/user/{id}/live_programs`
 形式 anchor が複数含まれることがあり、本配信者ではない uid を取ることが
 あった。さらに優先順位が「streamLink → embedded」で DOM 優先だったため、
 authoritative な embedded-data があっても DOM が勝っていた。
- 修正:
  - 新規 lib: `src/lib/broadcasterUserId.js`（`extractBroadcasterUserId`、
   13 ケースの TDD）。優先順位を embedded-data 最優先に：
     1. `embedded-data.program.supplier.programProviderId`（authoritative）
     2. `embedded-data.program.supplier.id`
     3. `embedded-data.program.supplier.pageUrl` の `/user/(\d+)/`
     4. DOM streamLink href の `/user/(\d+)/`（最後の手段）
  - `content-entry.js#collectWatchPageSnapshot` を新 lib にスイッチ。
- 効果: lv350420992 ケースでは embedded supplier.programProviderId =
 115713314 が即取れて、本配信者がレーンから除外される。配信者タイルからの
 リンクも正しく刑事桃のページに飛ぶ。
- 同梱: コメ送信エラー時の再読み込み案内ロジック (`withCommentSendTroubleshootHint`
 + `EXTENSION_RELOAD_USER_GUIDE_JA`) を `src/lib/commentSendTroubleshootHint.js`
 に切り出し（純粋関数 + 7 ケース TDD）。

**0.1.37 バンプで入った修正（重複定義整理 + 切り出し AL）**:

- `popup-entry.js` から `storyTileUsesYukkuriTvStyle` を
 `src/lib/storyTileTvStyle.js` に切り出し（純粋関数 + 6 ケース TDD）。
 ストーリータイルの「ゆっくり風キャラ画像かどうか」の判定ロジック。
- `isContextInvalidatedMessageText` の重複定義を撤去し、既存の
 `isContextInvalidatedError`（`reportSilentError.js`）に一本化（同名 alias
 `isExtensionContextInvalidatedError` 経由で popup-entry が使用）。

**0.1.36 バンプで入った修正（コンポーネント分割の続き AK）**:

- `popup-entry.js` から `prioritizeWatchTabCandidates` を
 `src/lib/watchTabPrioritize.js` に切り出し（純粋関数 + 9 ケース TDD）。
 chrome 依存なしの URL ソート ロジック。
- 0.1.35 の formatDateTime 切り出しに続く 2 件目の component 分割。

**0.1.35 バンプで入った修正（仕様注記＋内部分割の小さな一歩 AJ）**:

- ユーザー指摘: 「仕様の場合はちゃんと説明が入った方がいい」（0.1.34 で
 ニックネームがコメ記録時点のものという仕様の話を口頭で説明したのを、
 マーケ分析 HTML 自体に明記すべき）。
- 修正:
  - `marketingChartsHtml.js` の **離反 TOP / 出席カレンダー / サムネ付き
   ユーザー一覧** の 3 セクションに `<p class="mkt-spec-note">※ 表示名は
   コメ記録時点のもの（仕様）...</p>` の注記を追加。
  - 黄色アクセント + 左ボーダー（`#fbbf24`）で「仕様メモ」的に視覚区分。
- 内部リファクタ:
  - `popup-entry.js` から `formatDateTime` を `src/lib/formatDateTime.js`
   に切り出し（純粋関数 + 9 ケース TDD）。
  - 1 万行の popup-entry.js をモジュール化していくための第一歩。
   今後は同じパターンで「pure・依存なし」のヘルパから順次切り出す方針。

**0.1.34 バンプで入った修正（離反/出席にニックネーム表示 AI）**:

- ユーザー指摘: 離反 TOP の数値 ID 行が「134268998」のように ID だけ表示
 → 「もびー（134268998）」みたいに名前も出してほしい。
- 修正:
  - `commenterHistoricalAnalytics.js#indexPastUsers` で nickname を集約
   （同 userId で複数候補なら最も詳しい＝最長のものを採用）。
  - `findDepartedHeavyCommenters` / `buildCommenterAttendanceMatrix` の
   出力に `nickname` フィールドを追加。
  - `marketingChartsHtml.js` の `sectionDepartedHeavy` /
   `sectionAttendanceMatrix` で `displayUserLabel(uid, nickname)` に nickname
   を渡すよう変更。
- TDD: 2 ケース追加（合計 19 ケース）。

**0.1.33 バンプで入った修正（パネル準備時間短縮 AH）**:

- prewarm の起動 delay を 2 秒 → 800ms に短縮（0.1.32 で可視タブのみ対象に
 制限したので、CPU 取り合いリスクは少ない判断）。kon-ta 即押し時の
 体感反応を改善。
- 動的キャラ解説（marketingDynamicAdvice.js / 100+ ルール）の lib は
 作成済みだが、まだ marketingChartsHtml に配線せず deferred。次回別バンプ
 で wiring 予定。優先順は「バグ 0 + コンポーネント化 + リファクタ + 即反応」
 が先（user 要望）。

**0.1.32 バンプで入った修正（複数タブ時の panel 反応性 AG）**:

- ユーザー報告: 「クリックしてもすぐ反応しない / 複数開くと発生する現象」。
- 原因切り分け: 0.1.18 で入った `prewarmInlinePopupIframe`（watch ページ
 表示の +2 秒後に popup.html を裏で iframe ロードしておく仕組み）が
 「全タブで並列実行」になり、複数の watch タブを同時に開くと CPU・帯域の
 取り合いで個々の prewarm が遅延 → kon-ta 押下時に iframe が未ロードのまま
 panel が出る → 体感が悪い。
- 修正:
  - `schedulePrewarmInlinePopupIframe` 冒頭で `document.visibilityState !==
   'visible'` なら早期 return（バックグラウンドタブではスケジュールしない）
  - `startPageFrameLoop` の `tick` 内で `schedulePrewarmInlinePopupIframe()`
   を呼ぶ（idempotent: done flag で再走り済みは skip、未スケジュールなら
   schedule）
  - 既存の `document.addEventListener('visibilitychange', tick)` が tick を
   呼ぶので、タブが visible になった瞬間に prewarm が再開する流れになる

**0.1.31 バンプで入った修正（連続 DL の memory pressure 削減 AF）**:

- 旧実装は HTML レポート / マーケ分析 / セッション要約 の 4 箇所で
 `setTimeout(() => URL.revokeObjectURL(url), 60_000)` 固定。連続 DL すると
 blob データがメモリに 60 秒滞留し、5 回 DL で 100MB+ の memory pressure。
- 新規 lib: `src/lib/objectUrlRevokeQueue.js`（`createObjectUrlRevokeQueue`、
 6 ケースの TDD）。15 秒で revoke + 同時 3 個までの queue 管理。上限超過時は
 最古から即 revoke。
- popup-entry の 3 箇所（HTML レポート保存・マーケ分析・マーケ分析 fallback）
 と セッション要約 JSON DL に queue を thread。
- 注意: HTML レポート内の CSV ダウンロード ボタン（保存 HTML 中の inline
 script）は popup の queue を共有できないので、こちらは個別に 60 秒 → 15
 秒 に短縮（ファイルあたり 1 回しか押されないので queue 不要）。

**0.1.30 バンプで入った修正（マーケ DL 負荷削減 AE）**:

- 0.1.23 で入ったマーケ DL 経路の `chrome.storage.local.get(null)` で全
 ストレージを走査して 10 件分のコメ key を取り出すロジックを廃止。
- 代わりに `broadcastSessionSummary_v1` IDB の `byCapturedAt` index を
 新→古で iterate して unique liveId を最大 10 件抜き、その liveId から
 `nls_comments_<lid>` キーリストを作って `storage.local.get([...keys])` で
 必要分だけ取得するように変更。
- 新規 lib: `src/lib/recentBroadcastLiveIds.js`
 （`listRecentUniqueBroadcastLiveIds`）。
- 配信記録が多いユーザ（200+ 配信ぶんのストレージを持つ場合）でマーケ DL の
 待ち時間とメモリ消費を削減。
- 副調査: `userCommentProfileMap` は既に `USER_COMMENT_PROFILE_CACHE_MAX = 5000`
 で頭打ち + 30 日 freshness で prune 済みのため追加対応不要。

**0.1.29 バンプで入った修正（observer / timer lifecycle AD）**:

- 深層監査の中優先度 2 件を投入。
  - **MutationObserver disconnect**: `stopContentIntervalsIfContextInvalidated`
   に `mutationObserver?.disconnect()` を追加。拡張リロード後に旧 observer が
   DOM 変化のたびに走り続けて CPU を消費する問題を抑止。
  - **start() 冒頭の defensive disconnect**: まれに content script が二重
   起動した時に旧 observer が残留しないよう、新 observer 作成前に必ず
   旧 observer を disconnect する。
  - **thumbTimerId**: 拡張リロード時に明示的に clearInterval（既存の
   `runThumbCaptureTick` 内 hasExtensionContext check に加えて二重防御）。
- ResizeObserver（`supportVisualScrollObserver`）は既に singleton + 冪等な
 cleanup で問題なし（再確認のみ）。

**0.1.28 バンプで入った修正（深層監査の高優先度 fix AC）**:

- 並列で 3 領域 deep audit を実施（レース / データ整合 / 性能）。計 60+ 件の発見、
 詳細は memory `plan_deep_audit_findings_0_1_27.md` に保存。
- データ整合性・XSS・PII の四大リスクは健全（既存防御が機能）。
- 高優先度から 2 件投入:
  - **page-intercept setInterval ライフサイクル**: `_fiberScanIntervalId` /
   `_mainPollIntervalId` / `_spaUrlCheckIntervalId` を保持。10 秒ごとの URL
   poll で SPA 遷移検知 → 非 watch ページに変わったら全 timer を clearInterval。
   旧 timer が SPA 遷移後も走り続けて CPU・帯域を消費する問題を抑止。
  - **popup-entry refresh 経路の storage write 世代ガード**: `void async`
   IIFE 内の `await storageSetSafe(...)` 直前にも `if (refreshGen !==
   watchPopupRefreshGeneration) return` を追加。古い refresh が新しい
   refresh の取得結果を上書きする「コメ汚染」リスクを抑止。
- 中・低優先度の残り発見は version-by-version で追加対応予定（roadmap 参照）。

**0.1.27 バンプで入った修正（表示改善・パネル安定化 AB）**:

- マーケ分析:
  - 離反コメンター TOP / 常連出席カレンダーに**サムネ列 + ID 列**を追加
   （ユーザー指摘: 数値 ID だけだと判別しづらい）
  - **20 個の PRO セクションそれぞれに「りんく・こん太・たぬ姉」の解説カード**
   を直後に追加（このデータで何がわかるか / 注意点 / 配信スタイルを否定しない）
- インラインパネル安定化:
  - `pickPrimaryInlinePopupHostFromDom` が DOM 確定後に singleton を追従させる。
   旧 singleton（既に DOM から消えた host）が ensureInlinePopupHost の fallback
   経路で返り、画面に 2 つの host が出る race の根を抑止。
  - `inlineHostLooksVisible` が iframe 初回ロード中に false を返してフリッカー
   していた問題に tolerance を追加。iframe が src を持って居る間は「これから
   レイアウトされる」と見なし、サイズだけで不可視判定しない。

**0.1.26 バンプで入った修正（表現・UX 修正 AA）**:

- 表現修正: 「アヘ顔密度」 → 「**笑い密度**」（盛り上がり指標）に改名。
 ユーザー指摘で性的な含意を避けるためリネーム。
- UX: HTML 保存ボタン（💾 HTML）の真横に「📊 マーケ」クイックボタンを追加。
 詳細設定に潜らずに 1 クリックでマーケ分析 HTML が保存できる。
 既存の `devMonitorExportMarketingBtn` のハンドラを click 委譲する形なので
 マスク設定 / status 表示はそのまま使える。
- バグ修正: マーケ分析 HTML の目次（TOC）に **データ不足で描画されないセクション**
 へのリンクが残り、クリックすると謎のスクロール挙動になる問題を解消。
 「実際に描画されたセクション」だけを目次に並べるように動的フィルタ:
 `bodyHtml.includes('id="..."')` で出現を確認してから TOC 候補を絞る。
- HTML レポートの目次も同様にフィルタ（`sec-thumb-grid` をサムネ無し時に除外）。

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
  - **笑い密度（L4）**: w/ｗ/草/8888/笑/爆笑/ワロタ 等の出現を 30 秒粒度で（旧称 "アヘ顔密度" を 0.1.26 で改名）。
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
