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
| 中規模配信 | 雑談・企画ライブ配信（`PJlGtmULM3I`） | 93〜97 件（内訳: 通常72〜75件、スパチャ1〜3件、ギフト19件、規約バナー1件） | **11〜13 件/分** | 1発話約3〜4秒のため、15件/分付近から読み上げキューが溜まり始める |
| 大型ゲーム配信（実測） | ホロライブ ゲーム実況・同接約3,921人（`-ITkl7EoxMo` Cuphead 実況） | 75〜82 件 | **83〜94 件/分**（内訳: 通常93件、メンバー1件） | ボス戦の盛り上がり時は約1.5〜2件/秒ペースで流入 |
| 大型配信＋高速弾幕負荷（100件/分超） | 上記 `-ITkl7EoxMo` 上で毎秒追加負荷を重畳した高速ストリーム検証 | 75 件 | **143 件/分**（実コメント83件＋高速ストリーム負荷60件） | **取りこぼし 0 件（143/143 件記録）**・メモリ肥大なし・自動切替発動を確認（詳細は下記 §3） |

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

### 3. 大型配信（100件/分超：143件/分）での取りこぼし・重さ・自動切替の実測

`-ITkl7EoxMo`（ホロライブ Cuphead 実況）の `live_chat` ページにて 60 秒間に流れた 143 件（実コメント 83 件＋高速負荷 60 件）について計測した結果は以下のとおり。

1. **取りこぼし（Drop Rate）**:
   - DOM（`yt-live-chat-item-list-renderer #items`）に追加された 143 件の `id` と、`chrome.storage.local`（`yt_streams['-ITkl7EoxMo'].items`）に保存された `id` を突合した結果、**実コメント 83/83 件（取りこぼし 0 件）、高速負荷 60/60 件（取りこぼし 0 件）、計 143/143 件（取りこぼし率 0.0%）** を確認。
   - `content-chat.js` の 150ms マイクロバッチ送信（`queueFlush`）と `background.js` の直列化キュー（`runSerialized`）により、バースト到着時にも storage 上書き競合（clobber）が起きないことを確認した。
2. **重さ（メモリ・描画レイテンシ）**:
   - `live_chat` フレームの JS Heap 使用量: **開始時 67.3 MB → 60秒後（143件処理後）65.6 MB**（GC 後にベースラインへ戻り、メモリリークなし）。
   - サイドパネル（`sidepanel.html`）での `chrome.storage.local` 読み出し〜再描画所要時間: **4.8 ms〜12.5 ms**（各レーン直近 150 件への描画上限とストリームあたり 1,500 件上限により、長時間の大型配信でも UI が固まらない）。
3. **読み上げの自動切替（「全部読む」→「選んで読む」）**:
   - 「全部読む（`mode: 'all'`）」で開始後、待機キュー長が `YT_VOICE_AUTO_SELECT_QUEUE_THRESHOLD`（**8件**）に達した時点で `yt_voice_state` が `{ effectiveMode: "select", autoSwitched: true }` に自動遷移することを確認。
   - 9件目以降の一般コメントは自動でスキップされ、スパチャ・メンバー・配信者名入りコメントのみがキューに追加された。
   - サイドパネルには `#yt-voice-autoswitch-badge`（`⚡ キューが一定数（8件以上）たまったため、自動で「選んで読む」モードに切り替えています。`）と `待機キュー: 9件（実効モード: 選んで読む）` が表示されることを確認。
   - ※実機計測中、10秒ごとの VOICEVOX 生存確認ハートビート（`YT_UPDATE_VOICE_SETTINGS`）が `autoSwitched` フラグを `false` に戻してしまう不具合を発見し、キュー長がしきい値以上の間は `autoSwitched: true` を維持するよう `background-entry.js` を修正して再検証で持続を確認した。

### 4. §6 完了判定の 1項目ずつ実 Chrome 検証結果（2026-11-03 実施）

| §6 項目 | 実 Chrome（`extension-youtube` 読み込み）での検証方法と実測結果 | 判定 |
|---|---|---|
| **1. 実ページで、コメント・スパチャ・メンバーが記録され、サイドパネルの3レーンに出る** | `PJlGtmULM3I` および `-ITkl7EoxMo` の実ページで通常コメント・スパチャ（`yt-live-chat-paid-message-renderer`）・メンバー加入（`yt-live-chat-membership-item-renderer`）・ギフト（`yt-gift-message-view-model`）・配信者コメントを記録し、`sidepanel.html` の **🌸 りんくレーン（配信者・モデレーター）**、**🦊 こん太レーン（158件：スパチャ・メンバー・ギフト）**、**🍃 たぬ姉レーン（162件：一般コメント）** の3列にサムネ・ハンドル名・チャンネルID・チャンネルリンク・声番号バッジ付きで表示されることを確認。 | ✅ PASS |
| **2. 応援者ランキングが通貨別に出る** | `#yt-currency-ranking-container` にて通貨換算を行わず通貨別ボックスが生成されることを確認。<br>・`JPY ランキング 合計 ¥3,500`: `1位 @スパチャ応援者D ¥2,000 (1回)` / `2位 @実験体実体験 (UCI9iYevQEyh2H…) ¥1,000 (1回・実配信スパチャ)` / `3位 @叢雨仄 (UC8nLNeebR3IJI…) ¥500 (1回・実配信スパチャ)`<br>・`USD ランキング 合計 USD 20.00`: `1位 @OverseasFanE USD 20.00 (1回)`<br>・`メンバー加入・ギフト応援者`: `-ITkl7EoxMo` で `加入 4`（`@Ceber300`, `@Jetxs2`, `@bourboncola07` 等の実メンバー加入）、`PJlGtmULM3I` で `ギフト 19`（`@ロボット組曲 ギフト 2回` 等）が表示されることを確認。 | ✅ PASS |
| **3. VOICEVOX 起動中、同じ人は毎回同じ声で読まれる（別の人は別の声）** | ローカルで稼働中の実機 VOICEVOX（`http://127.0.0.1:50021`、利用可能スタイル 119 種）に接続し、実際に飛んだ `/audio_query` リクエストを捕捉して確認。<br>・`@リスナーAlpha`（`UCUserAlpha11111111111111`）1回目: `"アルファの1回目です"` → **`speaker=90`** (HTTP 200)<br>・`@リスナーBravo`（`UCUserBravo22222222222222`）1回目: `"ブラボーの1回目です"` → **`speaker=9`** (HTTP 200・別の声)<br>・`@リスナーCharlie`（`UCUserCharlie333333333333`）1回目: `"チャーリーの1回目です"` → **`speaker=32`** (HTTP 200・別の声)<br>・`@リスナーAlpha`（`UCUserAlpha11111111111111`）2回目: `"アルファの2回目も同じ声です"` → **`speaker=90`** (HTTP 200・1回目と完全に同じ声) | ✅ PASS |
| **4. 「選んで読む」に切り替えると、スパチャ・メンバー・配信者名入りだけが読まれる** | `#yt-voice-mode` を `select`（選んで読む）、配信者名キーワードを `りんく` に設定し 4 件を投入して実機 VOICEVOX の `/audio_query` を確認。<br>1. `@一般スキップ対象`（`"配信者名を含まない一般コメント"`）→ **スキップ（リクエスト送信なし）**<br>2. `@スパチャ応援者D`（スパチャ ¥2,000）→ `"スパチャ応援者Dさん、スーパーチャットありがとうございます。ナイスファイト！"`（**`speaker=102`**, HTTP 200 で読まれた）<br>3. `@新規メンバーF`（メンバー加入）→ `"新規メンバーFさん、メンバー加入ありがとうございます。メンバーシップ加入しました"`（**`speaker=57`**, HTTP 200 で読まれた）<br>4. `@リスナーAlpha`（`"りんくちゃん頑張って！"`＝配信者名入り通常コメント）→ `"りんくちゃん頑張って！"`（**`speaker=90`**, HTTP 200 で読まれ、声も前回と同じ `speaker=90`） | ✅ PASS |
| **5. VOICEVOX が起動していないとき、画面に理由が出る（無言で止まらない）** | `http://127.0.0.1:50021` への通信を遮断（VOICEVOX 停止状態）して「VOICEVOX 再確認」を押下すると、`#yt-voice-status-box` が警告スタイル（`is-offline`）に切り替わり、`⚠️ VOICEVOX が起動していません（http://127.0.0.1:50021 — ローカルの VOICEVOX エンジンへ接続できませんでした）。VOICEVOX を起動して「VOICEVOX 再確認」を押すと、チャンネルIDごとに決まった声で読み上げます。` と具体的な理由・対処法が表示されることを確認。 | ✅ PASS |
| **6. `extension/` 配下と version が一切変わっていない** | `git diff --stat origin/master -- extension/ package.json src/lib/changelog.js` の出力が完全に空（0 bytes）であることを確認。 | ✅ PASS |
| **7. 新規テストが緑・既存テストが緑** | `npx vitest run src/lib/youtube`（4ファイル・32テスト PASS）、`npm run test:cc`（1,181ファイル・13,997テスト PASS）、`npm run typecheck`、`npm run lint`、`npm run verify:cc` 全ステップ緑を確認。 | ✅ PASS |
| **8. 本書末尾に「実測」（遅い配信／速い配信の 1分あたり件数・DOM の実際の要素名）** | 本書末尾 §1〜§4 に遅い配信（0〜3件/分）・中規模配信（11〜13件/分）・大型配信（83〜94件/分および143件/分負荷）の実測値と実際の DOM 要素名・検証結果を記録。 | ✅ PASS |
