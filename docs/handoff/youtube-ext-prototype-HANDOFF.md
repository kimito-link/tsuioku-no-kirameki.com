# 実装ハンドオフ: YouTube Live 版の試作（第1段）

> 作成: 2026-11-03 / Claude（りんくの依頼「YouTube でも今のニコ生拡張みたいなことを」）
> 実装担当: **Antigravity（Gemini 4 Argon）**。この1枚と AGENTS.md を読めば着手できる。
> 調査の経緯: 他プラットフォーム比較で YouTube を優先（芸能系の伝手で YouTuber に届くため・りんく判断）。

---

## 0. 絶対に守ること（ここを破ると本体が壊れる）

1. **既存のニコ生拡張 `extension/` と、その配布物・manifest・version には一切触らない。**
   ニコ生版は CWS 審査中（0.1.1848）。version bump・changelog 追加も**しない**。
2. YouTube 版は**別の拡張**として新ディレクトリ `extension-youtube/` に作る（単一用途を分けるため）。
3. 共有ロジックは `src/lib/` の既存純関数を **import して再利用**する。既存ファイルの**挙動を変える編集は禁止**
   （どうしても必要なら止まってりんくに確認）。新しい純関数は `src/lib/youtube/` に置く。
4. **YouTube Data API は使わない**（1日 10,000 ユニットの上限があり、配布拡張に向かない）。
   ページのチャット欄（`youtube.com/live_chat?...` の iframe）を content script で読む。
5. **「人ごとに違う声で読み上げる」はりんくが特許出願中の中核機能**。同じ人には毎回同じ声。これを主役に残す。
6. 外部サイトは「いつか落ちる・形が変わる」前提（AGENTS.md §3.6）。DOM が変わっても**1件捨てて残りを描く**・空白で無言にしない。
7. コメント本文を `innerHTML` に流さない（`textContent` か既存の `escapeHtml`）。
8. 新規ファイルは `git add` で**明示列挙**（AGENTS.md §12.5 の事故）。

## 1. 目的 / 非目的

**目的（第1段で動かすもの）**
- YouTube Live の視聴ページで、チャットをローカル（`chrome.storage.local` または IndexedDB）に**記録**する。
- 拡張のサイドパネル（または popup）で、記録したコメントを**3レーン**で振り返れる。
- **スーパーチャット / スーパーステッカー / メンバー加入 / メンバーシップギフト**を拾い、配信ごとに**応援者ランキング**（金額は通貨ごとに分けて合計。換算は第1段ではしない）を出す。
- **読み上げ**: ローカルの VOICEVOX（`http://127.0.0.1:50021`）で、チャンネルIDごとに決まった声で読む。
  - モード「全部読む」と「選んで読む（スパチャ・メンバー・配信者名を含むコメントだけ）」。
  - キューが一定以上たまったら自動で「選んで読む」に切り替え（しきい値は定数にして実測で決める）。

**非目的（第1段ではやらない）**
- CWS 提出・LP 掲載・privacy.html の変更
- スマホ中継（Ably / live-view）、コメント投稿、サーバー連携
- 通貨換算、YouTube 公式のチャットポイント（👑#n / XP）の読み取り（第2段で実画面を見て判断）
- ニコ生版の画面・会場（venue）演出の移植

## 2. レーンの割り当て（たたき台・りんく確認前提）

YouTube には 184（匿名）が無いので、ニコ生のたぬ姉レーンの条件は使えない。第1段は次で実装し、定数1か所で変えられるようにする:

| レーン | キャラ | 条件（たたき台） |
|---|---|---|
| りんく | 配信者視点 | 配信者本人・モデレーター（チャットのバッジで判定） |
| こん太 | ファン視点 | スパチャ・メンバー・メンバーシップギフトの人 |
| たぬ姉 | 案内役 | それ以外の一般コメント |

## 3. 再利用する既存部品（必ず先に読む）

| 用途 | ファイル | 使い方 |
|---|---|---|
| 人ごとの声の割り当て | `src/lib/voiceAssignment.js`（`assignVoiceForUser` / `resolveVoiceForUser`） | userKey に **`yt:<channelId>`** を渡す（ニコ生の uid と衝突させない） |
| VOICEVOX 接続 | `src/lib/voicevoxClient.js` | 生存確認 `isVoicevoxAlive`・URL 定数 |
| 読む件数の絞り込み | `src/lib/voiceNarrowing.js` | 「選んで読む」の参考。そのまま合わなければ `src/lib/youtube/` に薄いラッパー |
| HTML エスケープ | `src/lib/htmlText.js`（`escapeHtml` / `safeHttpUrl`） | 表示時に必ず通す |

着手前に `docs/repo-tree-map.md` の機能逆引き索引で「読み上げ」「レーン」の担当ファイルを確認すること（AGENTS.md §10）。

## 4. 新規ファイル（案）

```
extension-youtube/
  manifest.json            MV3・name「追憶のきらめき for YouTube（試作）」・host: https://www.youtube.com/*
                           permissions: storage, sidePanel ／ host に http://127.0.0.1:50021/*（VOICEVOX）
  content-chat.js          live_chat iframe で動く（all_frames: true）。MutationObserver で新着を拾い SW へ送る
  background.js            受け取って保存・読み上げキューへ
  sidepanel.html / .js     3レーン＋応援者ランキング＋読み上げ ON/OFF・モード切替
src/lib/youtube/
  ytChatParse.js           DOM 1要素 → {id, channelId, name, iconUrl, text, kind, amount, currency, badges, ts} | null
  ytChatParse.test.js
  ytLaneAssign.js          §2 の割り当て（純関数）
  ytLaneAssign.test.js
  ytSupportRanking.js      配信ごとの応援者集計（通貨別）
  ytSupportRanking.test.js
  ytVoiceQueue.js          全部読む／選んで読む・自動切替（純関数）
  ytVoiceQueue.test.js
```

ビルド方式は既存の `extension/` の作り方（package.json の build スクリプト）を読んで合わせる。合わせ方が分からなければ、まずは**バンドル無しの素の ES modules** で動かしてよい（試作なので）。

### チャット DOM の要点（実ページで必ず確かめる・推測で確定しない）
- 要素名の目安: `yt-live-chat-text-message-renderer`（通常）、`yt-live-chat-paid-message-renderer`（スパチャ）、`yt-live-chat-paid-sticker-renderer`（ステッカー）、`yt-live-chat-membership-item-renderer`（メンバー）、ギフト系の renderer。
- 視聴者が「トップチャット」表示だと間引かれている。**「すべてのチャット」表示でないと全件は拾えない**ことを画面に注意書きする。
- 同じ要素が再描画されることがあるので、**コメント id で重複排除**。
- 取れなかった要素は `null` を返して捨てる（例外で全体を止めない）。

## 5. 手順

1. AGENTS.md と本書を読む。`git checkout -b feature/youtube-ext-prototype origin/master`。
2. **純関数から TDD**: `src/lib/youtube/*.test.js` を先に書く → 赤 → 実装 → 緑。
   ytChatParse のテストは、実ページから保存した renderer の HTML 断片（個人情報は伏せる）を fixture にする。
3. `extension-youtube/` を作り、Chrome に「パッケージ化されていない拡張」として読み込んで実ページで動作確認。
   - コメントの遅い配信（例: 音楽のアーカイブ配信）と速い配信（ゲーム・雑談の大型配信）の**両方で 1分あたりのコメント数を実測**し、本書末尾「実測」に追記する。
4. 新ディレクトリを `scripts/repo-tree-map.mjs` の `ROLES` に1行足して `npm run tree-map`（`git add` の後に実行）。
5. `npm run test:cc` と `npm run typecheck` が緑。`npm run verify:cc` も走らせ、ニコ生側を壊していないこと。

## 6. 完了判定

- [x] 実ページで、コメント・スパチャ・メンバーが記録され、サイドパネルの3レーンに出る
- [x] 応援者ランキングが通貨別に出る
- [x] VOICEVOX 起動中、同じ人は毎回同じ声で読まれる（別の人は別の声）
- [x] 「選んで読む」に切り替えると、スパチャ・メンバー・配信者名入りだけが読まれる
- [x] VOICEVOX が起動していないとき、画面に理由が出る（無言で止まらない）
- [x] `extension/` 配下と version が**一切変わっていない**（`git diff --stat origin/master -- extension/ package.json src/lib/changelog.js` が空）
- [x] 新規テストが緑・既存テストが緑
- [x] 本書末尾に「実測」（遅い配信／速い配信の 1分あたり件数・DOM の実際の要素名）

## 7. 止まってりんくに確認すること

- 既存の `src/lib/` ファイルの挙動を変えたくなったとき
- §2 のレーン割り当てに違和感があるとき
- YouTube の規約上まずそうな手段（内部 API の直接呼び出し等）が必要になったとき

## 実測（実装者が追記）

### 1. 遅い配信／速い配信の 1分あたりコメント件数（2026-11-03 実ブラウザ計測）

Chromium に `extension-youtube/` を unpacked 拡張として読み込み、`https://www.youtube.com/live_chat?is_popout=1&v=<videoId>` でヘッダーフィルタを「チャット（すべてのチャット）」に切り替えた状態で 60 秒間の新着 DOM 追加件数を `MutationObserver` で実測した。

| 区分 | 配信種別（videoId） | 初期履歴バッファ件数 | 1分あたり新着件数（実測） | 備考 |
|---|---|---|---|---|
| 遅い配信① | 音楽・朗読ラジオ配信（`0sfDth4lMLc` / `3iGDa__AL9k`） | 62〜76 件 | **0 件/分** | BGM・作業用配信では数分に1件ペース |
| 遅い配信② | 個人 VTuber 雑談配信・同接約12人（`sDvfg_jDIqE`） | 76 件 | **3 件/分** | 「全部読む」モードで余裕をもって全件読み上げ可能 |
| 速い配信 | 雑談・企画ライブ配信（`PJlGtmULM3I`） | 93〜97 件（内訳: 通常72〜75件、スパチャ1〜3件、ギフト19件、規約バナー1件） | **11〜13 件/分**（バースト時はさらに増加） | 1発話約3〜4秒のため、15件/分を超えると読み上げキューが滞留し始める。これに基づき `YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD = 8`（待機8件＝約24〜30秒分の滞留で自動的に「選んで読む」へ切替）に設定 |

### 2. 実ページで確認した YouTube Live チャット DOM の要素名と構造（2026-11-03 時点）

- **アイテム格納コンテナ**: `yt-live-chat-item-list-renderer #items`
- **チャット表示切替ヘッダー**: `yt-sort-filter-sub-menu-renderer #label`（初期値 `"トップチャット"` / 切替後 `"チャット"` または `"すべてのチャット"`）
- **実測で確認された子要素タグ名**:
  1. `yt-live-chat-text-message-renderer`: 通常コメント・メンバーコメント（`author-type="member"`）・モデレーター（`author-type="moderator"`）・配信者本人（`author-type="owner"`）
  2. `yt-live-chat-paid-message-renderer`: スーパーチャット（金額は `#purchase-amount yt-formatted-string` に `￥1,600` / `$10.00` 等の形式で格納、本文は `#content #message`）
  3. `yt-live-chat-paid-sticker-renderer`: スーパーステッカー（金額は `#purchase-amount-chip` または `#purchase-amount`、ステッカー説明は `#sticker img[alt]`）
  4. `yt-live-chat-membership-item-renderer`: メンバー加入・継続マイルストーン通知（`#header-subtext` / `#header-primary-text` / `#message`）
  5. `ytd-sponsorships-live-chat-gift-purchase-announcement-renderer` / `yt-live-chat-sponsorships-gift-purchase-announcement-renderer`: メンバーシップギフト購入通知（`#primary-text`）
  6. `yt-gift-message-view-model`: **2026年時点の現行 DOM で新設されているギフト系 ViewModel 要素**。従来の renderer と異なり外側の要素に `id` 属性を持たず、投稿者名は `#author-name-v2`、本文は `#message-v2`、時刻は `#timestamp` に入る。`ytChatParse.js` では両方に対応し、`id` 属性欠落時は `kind:channelId:ts` から決定論的 ID を導出して重複排除・集計できるようにした。
  7. `yt-live-chat-viewer-engagement-message-renderer`: コミュニティガイドライン等のシステム案内バナー（`parseYtChatElement` で `null` を返して破棄）。
- **投稿者チャンネル ID (`UC...`) の格納場所**:
  - 2026年時点の YouTube Live チャット DOM（ShadyDOM）では `data-author-external-channel-id` 属性が省略されるケースが多く、代わりに要素の `whole-message-clickable` 属性（JSON）内の `liveChatItemContextMenuEndpoint.params`（二重 Base64 エンコードされた protobuf）に配信者チャンネルID（先頭 `UC[A-Za-z0-9_-]{22}`）と投稿者チャンネルID（末尾 `UC[A-Za-z0-9_-]{22}`）が格納されていることを実データで確認した。
  - `extractChannelIdFromContextMenuParams()` でこの `params` から投稿者の `UC...` チャンネルIDを抽出し、万一取得できない要素（`yt-gift-message-view-model` 等）でも `handle:@ハンドル名` にフォールバックすることで、常に同じ投稿者が同じ `yt:<channelId>` キーで同じ VOICEVOX 声・応援者ランキングに紐づくよう実装した。
