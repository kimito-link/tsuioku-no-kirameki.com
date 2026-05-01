# 配信なし empty state 改善プラン

**バージョン**: 0.1.68 時点 / 2026-05-01 調査
**ブランチ**: `claude/nostalgic-wilbur-6c2bf9` (= `claude/flamboyant-perlman-a893c9` の baseline + 0.1.68 popup card fix)
**目的**: ユーザー報告「配信がなにもないときのがだめ」の根本対処を、複数案の比較で見極める。
**スコープ**: 実装はしない。問題分析 + 案 6 種の比較 + 推奨。

---

## 0. ユーザー報告の整理

> 「いろんな画面サイズで　配信がないところでボタンおすとみずらいです」(2026-05-01)
>
> 「配信がなにもないときのがだめなので どうすればいいかディープリサーチを 数時間かけてほしいです」(同日)

直前の 0.1.68 (`1746bc5`) で stat カードのプレースホルダ文言「（取得不可）」が縦書き状に潰れる症状は緩和したが、ユーザーは「カード本体が出ていること自体が変」というニュアンスで再フィードバック。empty state の **情報設計そのもの** に戻って考え直す要請。

---

## 1. 現在の empty state（What is rendered now）

### 1.1 trigger 条件（`src/extension/popup-entry.js:6325-6379`）

```js
const treatAsNoActiveWatch =
  !isNicoLiveWatchUrl(url) ||
  watchUrlPick.source === 'storage' ||
  watchUrlPick.source === 'none';
```

`url` は `pickWatchUrlFromMultipleSources` の結果。`source` は次の 4 つ:
- `activeTab` … 現在前面のタブが watch URL → empty 化しない（通常パス）
- `lastFocusedNormal` … 直近の通常 window のアクティブタブ → empty 化しない
- `storage` … `nls_last_watch_url` の fallback → **empty 化する**（前回見ていた放送に誤って繋がるのを 0.1.57 で止めた）
- `none` … どこにも無い → **empty 化する**

つまり empty state は「現在も直近 focus でも watch ページが見えてない」とき。

### 1.2 レンダリングされる要素（`extension/popup.html` 該当行）

| 要素 ID | 行番号 | 表示内容（empty state） | コメント |
|---|---|---|---|
| `nlVersionBadge` | 6330 | 「ビルド v0.1.68・b0501-0911」 | 必須・常時表示 |
| `noWatchRankingHint` | 6344 | 4 リンクのオレンジカード | **★ 0.1.52-0.1.56 でユーザー要望により追加。これは生きてる導線** |
| `offlineBanner` | 6371 | 「オフラインです」 | hidden（オンライン時） |
| `extensionContextBanner` | 6384 | 「拡張の接続が切れました」 | hidden（通常時） |
| `casterBanner` | 6411 | 配信者タイル | hidden（empty では当然） |
| `liveStatCards` (3 枚) | 6419 | 記録 / 推定同時接続 / 来場者数 | **★ 問題箇所 1**: 値が「（取得不可）」「（この配信は未取得）」 |
| `topSupportRankStrip` | 6499 | 応援ランクストリップ | hidden |
| `.nl-record-nav-hint` | 6507 | 「応援コメントの記録の ON/OFF は…」 | 案内文（常時表示） |
| `nlPopupSettings` | 6511 | 詳細設定 details | 折り畳み（常時表示） |
| `nl-vdh-divider` | 6905 | 「応援の記録と表示」見出し | 常時表示 |
| `nl-stats` (count + ticker + heat) | 6909 | 「応援 -」「ticker 空」「+0件 / 0人」 | **★ 問題箇所 2**: empty でも表示され「0」が並ぶ |
| `nl-story` (character scene) | 6953 | 「りんくがみんなの応援コメントを集める準備中だよ」 | 常時表示・キャラの語り |
| `userRoomList` | 7385 | 「応援可視化（ユーザー別）」見出し + 空 ul | **★ 問題箇所 3**: 見出しだけが空で残る |
| `nl-acquisition` (取得率チャート) | inline JS:5510 | 「ニコ生 watch を開いた状態でポップアップを開くと…」 | 自身で empty メッセージを持つ（OK） |
| `nl-comment-compose` | 7211 | コメント投稿欄 | disabled だが表示 |
| `commentTicker` | 6929 | コメント流し（空） | is-empty class |
| `roomHeatSummary` | 6937 | 直近5分の応援増加（0%バー） | **★ 問題箇所 4**: empty で「+0件 / 0人」が固定 |
| `nl-frame-switch` | 7459 | 配色プリセット | 常時表示 |
| `nl-session-summary-panel` | 7558 | session summary details | 折り畳み |
| `nl-gift-quick-panel` | 7571 | gift quick details | 折り畳み |

要約: empty state では **9 領域のうち 4 領域**（stat cards / count+ticker+heat / userRoomList / roomHeat）が「**配信があれば数字が入るが今は 0/プレースホルダ**」という状態になり、画面に「空・空・空…」が並ぶ。

### 1.3 INLINE_MODE / dock=sidepanel 時の差分

| 要素 | standalone popup | side panel (`dock=sidepanel`) | inline (`?inline=1`) |
|---|---|---|---|
| `nl-header` ロゴ帯 | 0.1.64 で hidden 化（共通） | hidden | hidden |
| `noWatchRankingHint` | **表示** | **表示**（同じ DOM） | hidden（JS で setAttribute） |
| `data-nl-toolbar-only` 要素 | 表示 | 表示 | hidden（CSS）|
| `liveStatCards` | 表示 | 表示 | 表示 |

ポイント: **standalone popup と side panel は同じ HTML を共有**。0.1.67 (AW) で side panel が watch じゃないタブの主役になったので、empty state UX の重要度が更に上がっている。inline は watch ページ内 iframe なので empty state は本来発生しない（content-entry が watchUrl を強制供給するパス）。

### 1.4 empty state を引き起こす画面サイズ別の見え方

ユーザースクショ 4 枚から再構成:

| popup width | 体感 | 問題 |
|---|---|---|
| ~340px (min) | 「（取得不可）」が 1〜2 字ずつ縦に潰れる | 0.1.68 で緩和 |
| ~370px (典型) | カード幅 ~100px、placeholder 文字は読める程度 | カード3枚が「空っぽ」感 |
| ~470px (中) | 余裕があるがカード3枚 + count + heat + lane が全部 0 | 「機能が壊れているのかな？」と誤認 |
| ~540px (max) | 横長で更に 0 が並ぶ違和感 | 同上 |

---

## 2. データ可用性（What we have to fill the empty state）

### 2.1 chrome.storage.local

| Key | 型 | empty state で使えるか |
|---|---|---|
| `nls_last_watch_url` | string | 直近の watch URL（誤誘導の原因 → 0.1.57 で参照しなくなった）|
| `nls_self_posted_recents` | object | 直近の自コメ記録 |
| `nls_recording_enabled` | boolean | 記録 ON/OFF |
| `nls_comments_${liveId}` | StoredComment[] | **過去の放送ごとのコメ記録**（タイトル無し）|
| `nls_gift_users_${liveId}` | array | 過去の放送のギフトユーザ |
| `nls_inline_panel_*` | various | パネル位置設定 |
| `KEY_CHEER_RECENT_V1` | array | 直近使用のチアコメ |
| `nls_user_comment_profile_cache` | object | ユーザープロファイル（avatar 含む）|

### 2.2 IndexedDB

| DB / Store | 内容 | empty state で使えるか |
|---|---|---|
| `nls_broadcast_summary_v1` / samples | 配信ごとの軽量サマリ（`liveId` `capturedAt` `commentStorageCount` `uniqueKnownCommenters` `peakConcurrentEstimate` `officialViewerCount`）| **★ 過去配信一覧の主軸**。`byCapturedAt` index で新しい順に取得可能 |
| `nls_thumb_v1` / thumbs | サムネ画像（liveId キー）| **★ 過去配信のサムネ**を引ける |

### 2.3 既存の純粋関数

- `listRecentUniqueBroadcastLiveIds(db, {limit})` → 直近 N 件の unique liveId（`src/lib/recentBroadcastLiveIds.js`）
- `listBroadcastSessionSummaryForLive(db, liveId, limit)` → 配信内の sample 行
- `summarizeStoredCommentsAtOnce` 系 → 1 パス集計
- `aggregateMarketingReport` → 重い（マーケDL 用、empty state には過剰）

### 2.4 現状の制約

**broadcastSessionSummaryDb のスキーマに `broadcastTitle` / `broadcasterName` / `thumbnailUrl` が無い**（`src/lib/broadcastSessionSummaryDb.js:14-29`）。

過去放送一覧を「タイトル付き」で出すには:
- (a) 既存スキーマを拡張（新フィールド追加・migration 不要 / undefined フォールバック許容）
- (b) `nls_broadcast_meta_${liveId}` という新しい storage キーを設けて title/thumb を保存
- (c) `nls_comments_${liveId}` 配列の最初の row に紐付くサムネを `thumbDb` から引く

(a) が最小コスト。content-entry が watch ページで snapshot を取るタイミングで append すれば良い。

---

## 3. 過去の設計意図（Why is it like this）

### 3.1 noWatchRankingHint の追加経緯（0.1.52〜0.1.56）

- **0.1.52 (AH)**: ユーザー要望「何もないところの場合、ニコニコの生放送ランキングに飛ぶのはどうでしょうか？ ちくらんとか？」に応えて 4 リンクを実装。
- **0.1.53 (AI)**: 「何もないところクリックで前ひらいた放送につながっている」報告 → source ベース判定で厳密化。
- **0.1.54 (AJ)**: 「再再 出ない」報告 → INLINE_MODE 以外は常時表示に簡素化。
- **0.1.55 (AK)**: 「再再再 出ない」報告 → HTML から hidden 撤去 + inline style で確実に表示。
- **0.1.56 (AL)**: 「位置」の問題 → version badge 直下（最上部）に固定。
- **0.1.57 (AM)**: 「導線下に前放送データが出てレイアウトガタガタ」→ source='storage'/'none' でも no-watch placeholder ブランチに入るよう判定変更。

**学び**: ユーザーは「empty state の優先導線は ランキング系」という前提を持っていて、これは生きている。**4 リンクは消すべきではない。** ただし、**他の領域（stat カード、count+heat、lane）は配信なし時には不要**。

### 3.2 stat カードが empty state でも残っている理由

明示的な設計判断は AGENTS.md / コミットメッセージに見当たらない。**「watch があるとき用の UI を、placeholder だけで empty 用に流用していた」**のが現状。0.1.19 (T) で `watchMetaCardStateGate` で文言を整理したが、カード自体を hide/show する判断はしていない。

### 3.3 character scene（りんく語り）の役割

`renderCharacterScene` は empty state でも「準備中だよ」という柔らかい語りで埋める。これは **意図的な空白埋め**で、ユーザーの心理的ハードルを下げる役割を担っている。empty state 撤去案ではこれを残す/活かす方向が望ましい。

---

## 4. シナリオマップ: empty state を引き起こす 8 ケース

| # | シナリオ | watchUrlPick.source | ユーザーの意図 | 「導線」「過去」「数字」のうち何が欲しい？ |
|---|---|---|---|---|
| 1 | 拡張インストール直後・初回起動・**履歴なし** | `none` | 「何の拡張？」「使い方は？」 | 導線（ランキング） + 使い方説明 |
| 2 | 拡張更新後・履歴あり・watch タブ閉じている | `storage` or `none` | 「次の放送どこかな」 | 導線 + **過去の放送一覧（再開しやすさ）** |
| 3 | Google や YouTube など全く別タブを見ている | `none` | 「ニコ生に飛びたい」 | 導線（ランキング）だけで十分 |
| 4 | live.nicovideo.jp/ranking などランキング系を見ている | `none`（watch じゃない） | 「気になる放送を選びたい」 | 導線 + **過去視聴履歴**（再訪用）|
| 5 | watch ページを閉じた直後（記録ON のまま） | `storage` | 「さっきの放送どうなった」 | **過去の放送 1 件のサマリ**（記録件数・最終ピーク同接）|
| 6 | 別 window で watch している（multi-monitor 時の発見しにくさ）| `none` | 「あれ？拡張壊れた？」 | **「他の window で開いている可能性」案内** + 導線 |
| 7 | 配信終了後の watch ページ（番組終了）| `activeTab` だが live が pre-listed | 「記録が動いてない」 | 配信終了 hint + 過去サマリ |
| 8 | オフライン | `none` | 「ネットワーク問題？」 | offlineBanner（既存）|

**観察**: シナリオ 2/4/5/7 で「**過去の放送（または直前の放送）の最低限のサマリ**」が欲しい。シナリオ 1/3/6 では「導線」が主役。シナリオ 8 は既に専用バナーあり。

---

## 5. 設計代替案（A〜F の 6 案）

実装コスト・情報量・UX 改善度で比較。

### 案 A: 「empty state 用に不要な領域を hide する」（最小工数）

**何をするか**:
- `liveStatCards` (3 枚) を empty 時に `hidden` に
- `nl-stats` (count + ticker + heat) を empty 時に `hidden`
- `userRoomList` 周辺の見出しを empty 時に `hidden`
- 残るのは: nlVersionBadge / noWatchRankingHint / character scene（語り）/ 詳細設定（折り畳み）/ コメ投稿欄（無効化）/ 配色プリセット / session summary / gift quick

**Pros**:
- 既存 DOM をそのまま流用、CSS + JS で `hidden` 切替だけ
- 0.1.68 で入れた `is-placeholder` も「念の為のフォールバック」として共存可能
- 工数 ~半日、リスク低

**Cons**:
- empty state は「シンプルすぎて何もない」体験になる
- ユーザーが「履歴を見たい」要望（シナリオ 2/4/5）には応えない
- character scene の「準備中」文言だけが残る → やや寂しい

**該当ユーザー報告**: 0.1.68 の延長線として直接の解決。ただし「次にどうしたい？」の答えにならない。

---

### 案 B: 「過去の放送一覧」セクションを新設（中工数）

**何をするか**:
- A の hide はやる
- 代わりに **「最近見た放送」セクション**を入れる:
  - IDB `nls_broadcast_summary_v1` から `listRecentUniqueBroadcastLiveIds(limit=5)` で抜く
  - 各行: サムネ（thumbDb から）/ 最終 capturedAt / 記録コメ件数 / 配信タイトル
  - **タイトルは broadcastSessionSummaryDb スキーマ拡張**で `broadcastTitle` を追加（最低限のマイグレーションで対応）
  - クリックで watch URL を新タブで開く

**Pros**:
- シナリオ 2/4/5/7 を直接ケア
- 「自分の記録」を見せることで拡張の価値を再認識させる
- 既存 IDB を活用、storage size 増加なし
- character scene の「準備中」と相性良し

**Cons**:
- 工数 1〜2 日（純粋関数 + UI + storage migration + テスト）
- broadcastSessionSummaryDb スキーマ拡張で `broadcastTitle` `thumbnailUrl` を追加する必要 → migration 戦略
- thumbDb から各行のサムネを引く I/O コスト（非同期で 5 件くらいなら OK）
- popup 起動時間が +50〜100ms 程度

**該当ユーザー報告**: 0.1.68 を完全に上書き、empty state を「自分のデータの入り口」に変える。

---

### 案 C: 「直近の配信のサマリカード 1 枚」だけ出す（中工数）

**何をするか**:
- A の hide はやる
- empty state に **直近 1 配信の compact サマリ**カードを 1 枚出す:
  - 配信タイトル + サムネ + 終了時刻 + 記録コメ件数 + 推定ピーク同接
  - 「もう一度開く」ボタン（watch URL を新タブ）
  - 「マーケ分析を DL」ボタン（既存 export パスを起動）
- それより古い放送は「もっと見る」リンクで HTML レポートにジャンプ

**Pros**:
- シナリオ 5（watch 直後）に最大ヒット
- 案 B より軽い（1 件のみ I/O）
- 「自分の記録の出口」を強化（マーケ DL 起点に）

**Cons**:
- 「最近の N 配信」の比較は出来ない
- 案 B との実装差は中程度（migration は必要）
- 「直近 1 件しかない」のに導線 4 個 + サマリ 1 件で配置バランスが微妙

**該当ユーザー報告**: 0.1.68 の延長として、しかも「自分の前回」を活かす。

---

### 案 D: 「ニコ生タブを自動で見つける」アクションボタン（中工数）

**何をするか**:
- A の hide はやる
- empty state に **「他のタブ・他の window で watch を開いていないか探す」**ボタンを置く
- 押すと `chrome.tabs.query` で全タブを舐め、watch URL があったらそのタブをアクティブに
- 該当無しなら「気になる放送はこちら」で noWatchRankingHint にスクロール

**Pros**:
- シナリオ 6（multi-window）の救済
- 既存 `collectWatchTabCandidates` / `prioritizeWatchTabCandidates` の流用可能
- 「拡張が壊れているわけじゃない」体感

**Cons**:
- そもそもユーザー自身が「watch タブ」を持っていないと意味がない
- 0.1.41 で既に同様の `reloadWatchTab*` が存在するため屋上屋
- 単独だと弱い（B/C と組み合わせるべき）

**該当ユーザー報告**: 直接ヒットしないが、副次的にシナリオ 6 を改善。

---

### 案 E: 「見せ方は今と同じ・カードを「お休み中」演出に変える」（小工数）

**何をするか**:
- 案 A の hide ではなく、**3 stat カードを「待機モード」のビジュアルに変える**:
  - 各カードのアイコン（ゆっくり画像）はそのまま
  - 値の代わりに `🌙 まちぼうけ` `🌙 まちぼうけ` `🌙 まちぼうけ` のような統一プレースホルダ
  - 全カード一括で「watch を開くと記録が始まるよ」キャプションに切替
- count / ticker / heat は同様に「お休み中」演出

**Pros**:
- 「empty を消す」ではなく「empty を意味付ける」
- character scene と一貫した語り口
- ユーザーが「壊れている」と誤解しにくくなる
- 工数 ~半日

**Cons**:
- 表面的な改善で本質的な情報量は増えない
- 「過去の放送が見たい」要望は満たさない
- ぴょん吉キャラっぽさはあるが趣味性が高い

**該当ユーザー報告**: 0.1.68 の延長で「もっとかわいく / もっと意味付けされた empty に」する。

---

### 案 F: 「ニコ生タブをマウントして配信中タブの一覧を出す」（高工数・将来案）

**何をするか**:
- A の hide はやる
- ニコ生 API（live.nicovideo.jp/ranking 等）を **fetch して配信中の人気放送一覧**を popup に並べる
- 各行クリックで watch URL を開く
- ランキング 5〜10 件 + 配信ジャンルフィルタ等

**Pros**:
- シナリオ 1/3/4 を強化、empty state を「ニコ生発見の入り口」に
- 拡張の付加価値が大幅に増す

**Cons**:
- ニコ生 API の利用条件・スクレイピング扱いの懸念
- CWS 審査で permission 拡大（host_permissions 追加）が必要かも
- API 仕様変更で壊れるリスク（保守コスト）
- 工数 3〜5 日（fetch + render + cache + test）
- 案 B/C との重複（本来は B/C で十分なケース）
- **AGENTS.md の方針「ニコニコの API/UI 仕様変更に依存する箇所は最小化」と相容れない**

**該当ユーザー報告**: ヒットするが、本人の「単独運営／疲れている時は無理させない」スタンスから見て **過剰**。

---

## 6. 案の比較表

| | 工数 | リスク | empty state の情報量 | シナリオカバー | 既存方針との整合 |
|---|---|---|---|---|---|
| A: 不要領域を hide | 半日 | 低 | 低（最小に） | 1/3 | ◎（minimal change）|
| B: 過去の放送一覧 | 1〜2 日 | 中（migration あり）| 高 | 2/4/5/7 | ○ |
| C: 直近 1 配信サマリ | 1 日 | 中 | 中 | 5/7 | ○ |
| D: タブ自動発見 | 半日 | 低 | 低 | 6 | ○ |
| E: お休みモード演出 | 半日 | 低 | 低（意味付けは増）| 全般の心理的負荷 | ◎ |
| F: ニコ生 API 統合 | 3〜5 日 | 高（外部依存）| 最高 | 1/3/4 | ✕（API 依存）|

---

## 7. 推奨

### 推奨 1（短期・確実）: **案 A + 案 E の組合せ**

- 不要な「0 が並ぶ」領域は hide
- 残った character scene は「お休み中」「次の放送をまっています」演出
- noWatchRankingHint は最上部のまま（生きている導線）
- 工数 ~1 日、リスク低、ユーザーの即効改善

これで **0.1.69** として出す。0.1.68 の `is-placeholder` 切替は念のため残す（fallback 保険）。

### 推奨 2（中期・機能追加）: **案 B（過去の放送一覧）を 0.1.70 で投入**

- broadcastSessionSummaryDb スキーマに `broadcastTitle` `thumbnailUrl` 追加（undefined 許容）
- popup-entry にロード関数 + render 関数を追加（純粋関数 + 単体テスト）
- character scene の下に「最近見た放送（5 件）」セクション
- これで empty state を「自分の記録の入り口」に進化

### 案 D / F: 取り扱い

- **案 D（タブ自動発見）**: 推奨 1 と一緒に実装してもよい（既存 lib 流用できれば +半日）。ただし優先度は低い。シナリオ 6 が頻発するなら追加。
- **案 F（API 統合）**: AGENTS.md 方針と相容れず却下。

---

## 8. 短期実装スケッチ（推奨 1 = A+E）

### 8.1 hide すべき要素

```html
<!-- empty state では hidden -->
<div class="nl-live-stat-cards" id="liveStatCards" data-nl-hide-when-empty>...</div>
<section class="nl-stats" data-nl-hide-when-empty>
  <!-- count / ticker / heat -->
</section>
<div data-nl-hide-when-empty>
  <h2>応援可視化（ユーザー別）</h2>
  <ul id="userRoomList"></ul>
</div>
<details class="nl-session-summary-panel" data-nl-hide-when-empty>...</details>
<details class="nl-gift-quick-panel" data-nl-hide-when-empty>...</details>
```

### 8.2 JS 切替

`refresh()` の `treatAsNoActiveWatch` ブロックの末尾で:

```js
document.documentElement.classList.toggle('nl-empty-state', treatAsNoActiveWatch);
```

CSS 側で:

```css
html.nl-empty-state body [data-nl-hide-when-empty] {
  display: none !important;
}
```

### 8.3 character scene の演出強化

`renderCharacterScene({ hasWatch: false, ...})` の文言を強化:

```js
setSceneStory(
  '🌙 まちぼうけ中だよ',
  recording
    ? '記録は ON のまま。次の watch ページで応援コメントが集まり始めるよ。\n上のオレンジカードから気になる放送を探してみて！'
    : '記録は OFF。watch ページを開いて、上の「詳細設定」から ON にしてみてね。',
  { liveId: '', delta: 0, reaction: 'idle', count: 0 }
);
```

### 8.4 検証ポイント

- 320 / 340 / 370 / 470 / 540px のすべてで「縦のスクロール量」が大きく減ること
- noWatchRankingHint が最上部に残っていること
- 詳細設定（記録 ON/OFF）にアクセスできること
- 配色プリセット（テーマ切替）にアクセスできること
- watch を開いた瞬間にカード類が再表示されること（class 切替で復活）

---

## 9. リスクと注意点

### 9.1 「ページ内パネル位置は崩すな」（feedback memory）

memory `feedback_inline_panel_beside_size_ok.md` で 0.1.68 が **inline panel 位置の locked-in baseline** と明示されている。本プランは popup（standalone + side panel）専用なので **inline panel に手を入れない**。INLINE_MODE 判定で empty state 切替を無効化する：

```js
if (!INLINE_MODE) {
  document.documentElement.classList.toggle('nl-empty-state', treatAsNoActiveWatch);
}
```

### 9.2 0.1.57 の「stale data 出さない」を維持

`treatAsNoActiveWatch` 判定はそのまま。新しいクラス切替は **判定の結果を CSS に反映するだけ**で、source 判定ロジック自体は触らない。

### 9.3 詳細設定アクセス

empty state でも記録 ON/OFF / パネル位置 / 配色プリセットへのアクセスは保持する。設定系は hide しない。

### 9.4 e2e

- `tests/e2e/popup-double-scroll.spec.js` … empty state でスクロール量が変わるので期待値の見直し
- `tests/e2e/lane-visibility.spec.js` … lane が hide されると spec が壊れる可能性。empty state 専用の挙動として許容するか検討

### 9.5 アクセシビリティ

- 突然 hide すると aria-live="polite" 領域が消える → screen reader が混乱しないか確認
- focus が hide された要素にあった場合のフォールバック（focus を nlPopupPrimary に戻す等）

---

## 10. 推奨実装順序（疲れたユーザー向け）

1. **0.1.69**: 推奨 1（A + E）を「半日 + テスト + 出荷」で完結。**ここで一旦 commit して様子見**。
2. **0.1.70**: 推奨 2（過去の放送一覧）に着手。broadcastSessionSummaryDb スキーマ拡張から。**migration を入れる時は必ず単体テスト**。
3. **0.1.71+**: 案 D（タブ自動発見）を追加するか判断。

ユーザーが疲れているので、**1 ステップずつ commit + 動作確認** で進める。ディープリサーチで得た情報は本ドキュメントに集約済みなので、次のセッションでも再開しやすい。

---

## 11. 付録: 引用したコード位置一覧

- `src/extension/popup-entry.js:337-363` … INLINE_MODE / INLINE_SIDE_PANEL 判定
- `src/extension/popup-entry.js:539-608` … setCountDisplay（0.1.68 で is-placeholder 追加済）
- `src/extension/popup-entry.js:4037-4096` … renderCharacterScene
- `src/extension/popup-entry.js:4106-4140` … clearWatchMetaCard（0.1.68 で is-placeholder 追加済）
- `src/extension/popup-entry.js:6300-6379` … treatAsNoActiveWatch ブランチ（empty state 本体）
- `src/extension/popup-entry.js:6067-6099` … populateStorySourceEntriesFromStorageFallback
- `src/extension/popup-entry.js:8920-8954` … 過去 N 配信ロード（マーケ DL 用、案 B 流用元）
- `src/lib/broadcastSessionSummaryDb.js:14-29` … BroadcastSessionSummaryRow 型
- `src/lib/recentBroadcastLiveIds.js:25-60` … listRecentUniqueBroadcastLiveIds
- `src/lib/storageKeys.js:280-283` … commentsStorageKey
- `extension/popup.html:5972-6028` … noWatchRankingHint CSS
- `extension/popup.html:6263-6370` … empty state 上部 DOM
- `extension/popup.html:6419-6505` … 3 stat カード DOM
- `AGENTS.md:179-208` … 0.1.67 の経緯
- `AGENTS.md:817-820` … recentBroadcastLiveIds の初出
- 0.1.52〜0.1.57 のコミットメッセージ … noWatchRankingHint 進化と stale data fix の経緯

---

**作成**: 2026-05-01 ディープリサーチ（0.1.68 直後）
**次のアクション**: ユーザーが元気なときに本プランを review → 推奨 1（A+E）を 0.1.69 として実装
