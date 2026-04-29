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

- **最新提出バージョン**: 0.1.10（2026-04-29 提出済 / 審査中）
- **同日内包した前バージョン**: 0.1.9（master の 6f36a24）/ 0.1.8（master の b18de07）— いずれも CWS 未提出のまま 0.1.10 にロールアップ済み
- **直近通過バージョン**: 0.1.7（2026-04-23 提出 / 審査通過済・公開中）
- **前回提出**: 0.1.6（2026-04-19 / 審査通過済）
- **ステータス**: 0.1.7 が公開中。0.1.10 を CWS に提出済（審査中）。承認後は自動公開 ON。
- **0.1.10 内訳**: 0.1.8 自コメ修正 + 0.1.9 シナリオ調査 8 件 + 0.1.10 Privacy 整合 / XSS 対策 / a11y 修正 / 出自不明アセット差し替え 13 件 をロールアップ。
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
