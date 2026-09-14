# サイドパネルが固まる／黒いまま(横縞)／スクロール不能 — 真因の実測と修正(2026-09-14)

> 状態: **真因特定・修正実装済み(v0.1.1509)。ユーザー実機での効果確認は未**(下「検証」の実機欄)。
> 前段: [HANDOFF-2026-09-05-sidepanel-stripes.md](HANDOFF-2026-09-05-sidepanel-stripes.md)(Playwright では再現せず「環境差」で止まっていた)
> ユーザーの言葉: 「メインプログラムも重くなるとスクロールできなくなるのも直して」「この真っ暗になるのはいつなおるの？」(9/14・横縞の黒のスクショつき)

## 1. 何が起きていたか(全部実測。推測はない)

| 観測 | 値 | 出どころ |
|---|---|---|
| サイドパネルのイベントループ停止 | 最大タイマー遅延 **49,988ms**(1回目の起動)→ **178,299ms**(2回目) | 拡張自身の計器 `nls_sidepanel_self_diag_v1.eventLoopStall`(devtools Chrome・実配信 lv351386196・chrome.sidePanel で開いた本物のパネル) |
| 止まっていた区間 | t=6.3s→127.8s(121秒)、t=129s→203s(74秒) | 同計器 `sizeSeries`(予定 sched と実発火 t の差) |
| その間の画面 | Chrome 標準の「読み込み中」= **ダークモードでは黒地に灰色の横縞** | `extension/background.js:3525` 付近の v0.1.1434 コメント(実機で同定済み)＋ユーザーのスクショ |
| メインスレッドの中身 | 1 つの RunTask 42.8 秒 = RunMicrotasks(7,492 microtask)の中で await の続きが 12.0 秒＋27.1 秒 | Chrome trace(拡張レンダラ pid=50916) |
| **CPU プロファイル** | 785,239 サンプル中、非 idle の過半が `rememberedAvatarUrlForUserId`(inclusive 168,454)。呼び手は `storyGrowthAvatarSrcCandidate` ← `countResolvedAvatarEntries`(59,360) / `renderStoryUserLane`(41,087)。次点は匿名アイコンの canvas 合成 `upgradeAnonymousAvatarImage`(37,360・toDataURL) | Chrome trace(拡張レンダラ pid=62372・`sidepanel.html?lv=` をタブで開いて Profiler を当てた) |

### 真因(コードで確認)
`src/extension/popup-entry.js` `rememberedAvatarUrlForUserId(uid)` は、プロファイルキャッシュに無い uid のたびに
`STORY_SOURCE_STATE.entries`(保存コメント全件)を**逆順に全走査**していた(O(N)/呼び出し)。
これを `countResolvedAvatarEntries(arr, lv)`(診断用の集計・`refresh()` の 16479 行付近・初回描画では defer ゲート無し)が
**全コメント分**呼ぶため O(N²)。21,680 件では ≒4.7 億回の文字列比較が refresh のたびに走る。
コメントが増えるほど二乗で悪化する＝「重くなるとスクロールできなくなる」の正体。

### なぜ Playwright では再現しなかったか
Playwright の計測(9/5)は**空の profile**でコメント 0 件だった。O(N²) は N が小さいと出ない。
「環境差」の正体は Chrome の版でもテーマでもなく**保存コメント件数**。

## 2. 直したこと(v0.1.1509)
- 新設 `src/lib/rememberedAvatarIndex.js`: entries 配列ごとに 1 回だけ uid→「最後に出た強い avatarUrl」の Map を作り、
  引きは O(1)。**意味論は逆順走査と同じ**(後勝ち)で、`rememberedAvatarIndex.test.js` がランダム 20 試行×全 uid の同値性を固定。
- `popup-entry.js` の `rememberedAvatarUrlForUserId` は索引を引くだけにした(診断カウンタ `hitEntriesScan` はそのまま)。
- Node 実測(同規模・逆順走査×全件 vs 索引×全件): 下の「検証」表。

## 3. 検証
| 手順 | 結果 |
|---|---|
| 単体テスト(同値性・後勝ち・参照/長さでの再構築・21,680×520 を 1 秒未満) | 5 件 緑 |
| Node ベンチ 21,680 件×520 人(合成データ・`scratchpad/bench-avatar-index.mjs`) | 逆順走査×全件 = **2,697ms** / 索引×全件 = **7.3ms**(答えは同じ 11,549 件ヒット)。★Node の合成データでは 2.7 秒だが、実機のプロファイルではこの関数が非 idle の過半＝実機の 1 回あたりの単価はもっと重い(isOwnPosted 判定・文字列処理・3 秒ごとの再描画の重なり)。数字の差は「合成データが軽い」であって「原因が違う」ではない |
| verify:cc | (コミット時に記載) |
| **実機(ユーザー環境)** | ⏳ 未確認。見る値: 状態速報の「最大タイマー遅延」(前: 50〜178 秒)と、サイドパネルを開いた直後に横縞の黒が出続けるか |

## 4. まだ残っているもの(この修正で消えない可能性がある順)
1. 匿名アイコンの canvas 合成(`avatarPartsComposer.js` の `toDataURL`)が描画のたびに走る(プロファイル 2 位・約 5%)。タイルごとの結果をキャッシュすれば消える。
2. `countResolvedAvatarEntries` は診断専用なのに初回描画のゲート外(16479 行)。O(N²) が消えた今は O(N) だが、
   「詳しく見る」を開いたときだけ計算する方が筋。
3. `background.js:3525` の `sidePanel.setOptions(path)` を await せずに `open()` する順序は、open が先に走ると既定パスで開いた後に path 差し替え＝**読み込み直し**が起きる(実測: 2 回目の open で `sidepanel.html`(lv 無し)が開いた)。読み込み直しのたびに黒い読み込み中表示が出る。要再設計(タブ固有 path を事前に setOptions しておく)。

## 5. 計測の作法で分かったこと(次に同じ症状を測る人へ)
- **devtools MCP の `evaluate_script` はメインスレッドが塞がると 300 秒待って失敗し、その後そのページへの全コマンドが詰まる。**
  拡張の自己診断(storage)を **SW 経由**で読む方が確実(`chrome.storage.local.get` は SW から読める)。
- Chrome trace の CPU プロファイルは **trace を始めたページのプロセス**しか取れない。サイドパネルは `list_pages` に出たり出なかったりするので、
  `sidepanel.html?lv=` を**普通のタブで開いてそこに Profiler を当てる**と同じプロセス(拡張レンダラ)の全スレッドが取れる。
- trace は 615MB 級になり `JSON.parse` できない(V8 の文字列上限)。scratchpad の `trace-agg.mjs` / `trace-longtask.mjs` / `trace-profile-pid.mjs`(ストリーム走査)で集計した。
- 純関数のベンチ(`enrichUserLaneAggregatesWithProfileAndDisplay` 167ms / `aggregateMarketingReport` 31ms)は**シロ**だった。コードを読んだ推測(8 候補)のうち当たりは 1 つ。★推測で直さず測る、が今回も正しかった。
