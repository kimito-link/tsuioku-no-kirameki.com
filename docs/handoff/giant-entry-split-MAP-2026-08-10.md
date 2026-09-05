# 地図: 巨大entryの分割と「診断が互いに矛盾する」構造の根治

> **wayfinder(地図) — 司令塔(Claude)が実コードを読んで書いた事実ベースの地図。**
> 作成: 2026-08-10 / 手法の正本: `github/WAYFINDER-TO-SPEC-HOWTO.md`
> ★この地図はコードを一切変更せずに作成した。

---

## 0. なぜこの地図を作るか（お題の出どころ）

ユーザーの見立て:

> 「原因の切り分けは、コンポーネントとファクタリングと計器強化の気がする。それしかもないと。
>   そうすれば今後の運用も楽になるし」

**この見立ては実測で裏付けられた。** ただし「計器強化」の部分だけは実測が別の答えを出した
（計器は既に148個あり、足りないのは数ではなく**一貫性**）。詳細は §5。

### 直接の引き金（2026-08-09〜10 の連続失敗）

| 版 | 何をしたか | 結果 |
|---|---|---|
| v0.1.1294 | 外側 html にインライン style | 外した |
| v0.1.1295 | 自己診断を追加 | 状態速報に出ていなかった |
| v0.1.1296 | 受け渡しの断線を修正 | 診断は出たが黒は未解決 |
| v0.1.1298 | 一瞬の黒を上書きしないよう修正 | 黒は未解決 |
| v0.1.1299 | `<html>` を1行目へ | **外した**（計器の誤報に従った） |
| v0.1.1302 | 起動直後を🔴にしない | **実機で効かず** |
| v0.1.1303 | 判定基準を「読んだ時点」に是正 | 未検証 |

`git log --oneline -14` で確認済み。**同じ症状に7版**を費やしている。

---

## 1. 入口になる画面・コマンド

| 入口 | 実体 | 備考 |
|---|---|---|
| サイドパネル | `extension/sidepanel.html:81` が `popup.html?inline=1&dock=sidepanel` を iframe で載せる | **サイドパネルは①POPそのもの**（別画面ではなく入れ物） |
| 拡張ポップアップ | `extension/popup.html` → `src/extension/popup-entry.js` | 22,332行 |
| watch ページ常駐 | `src/extension/content-entry.js` | 19,065行 |
| 状態速報（診断ページ） | `src/extension/status-entry.js` → `src/lib/aiShareFullText.js` | 3,661行 |
| 会場モード | `src/extension/venueBar.js` | 6,651行 |

---

## 2. 関係する主要ファイルと責務

| ファイル | 行数 | 責務 |
|---|---:|---|
| `src/extension/popup-entry.js` | 22,332 | ①POPの全て（初期化・描画・鏡publish・診断収集） |
| `src/extension/content-entry.js` | 19,065 | watch常駐（記録・NDGR・公式値取得） |
| `src/extension/venueBar.js` | 6,651 | 会場モード（鏡のreader） |
| `src/extension/status-entry.js` | 3,661 | 状態速報の組み立て（extras 12秒キャッシュ） |
| `src/lib/*.js` | 632ファイル | 純関数・計器・契約 |

### 実測（2026-08-10・すべて機械集計）

```
popup-entry.js のトップレベル関数        : 435個
  うち 50行以下                          : 364個  ← 分割は既に進んでいる
  うち 51-150行                          :  59個
  うち 151-400行                         :   7個
  うち 401行超                           :   2個  ← ここが問題
lib からの import                        : 295個  ← 抽出実績は十分ある
```

**「分割が進んでいない」わけではない。** 295モジュールを既に切り出し、364個の関数は50行以下。
それでも22,332行残っているのは、**巨大な2つが割れていない**から。

---

## 3. データが流れる順番（今回の失敗が起きた経路）

### 3-1. 鏡が書かれる経路（①POP側）

```
renderStoryUserLane() [popup-entry.js:6718]
  └ publishLaneMirror() [popup-entry.js:7572]
      └ buildLaneMirrorSnapshot() [src/lib/laneMirror.js:187]  → capturedAt を刻む
      └ mergeAndScheduleFlush() [popup-entry.js:7555]
          └ 400ms の trailing-edge タイマー
              └ takeFlushPayload() [src/lib/mirrorBundleFlushScheduler.js:117]
                  ★初回は min-gap を待たない（:120 の `lastFlushAt > 0` ガード）
                  → storage へ 1回の set
```

**実測**: 最初の publish から **400ms** で storage に載る。実機の
`flushSuccess=1 / flushSkipped=5` は健全な姿（node で実行して確認済み）。

### 3-2. 鏡が読まれる経路（状態速報側）

```
status-entry.js の refresh ループ
  └ extrasStale = Date.now() - _extrasCacheAt >= EXTRAS_REFETCH_MS  [status-entry.js:673]
      ★EXTRAS_REFETCH_MS = 12000 [status-entry.js:312]
      └ 12秒に1回だけ storage を読む → _extrasCache に保持
  └ buildAiShareFullText() [src/lib/aiShareFullText.js:107]
      └ buildDiagnosticsTrust() [src/lib/diagnosticsTrust.js]
          └ mirrorOf(blob.laneMirror) → present:false なら 🔴なし
```

### 3-3. ★2つの経路が出会う瞬間に何が起きたか（実機 2026-08-10）

実機の値: `popup 起動から 4.3秒後` / `鏡は 8秒前の値`

```
t = -3.7秒 : status が鏡を読んだ   ← popup はまだ起動していない
t =  0秒   : popup 起動
t = +4.3秒 : 速報を撮影
```

**存在しないものを読んだので null なのは当然。** しかし v0.1.1302 の猶予は
「popup 起動から3秒未満か」だけを見ていたため、起動4.3秒＝猶予の外で🔴のまま出た。

---

## 4. 既存の設計判断と、その根拠（壊してはいけない境界）

| 判断 | 根拠 | 壊すとどうなるか |
|---|---|---|
| extras は12秒間引き | `status-entry.js:310-312` のコメント「追加データを2秒ごとに毎回読むと重い」 | 診断ページが重くなる（v0.1.868 で実際に起きた） |
| 鏡の書き手は①POPのみ | `src/lib/laneMirrorContract.js:73` の `LANE_MIRROR_CONSUMERS` を registry テストが grep 照合 | 書き手が増えると静かな上書き劣化に気づけない |
| `popup-entry.js` の max-lines ラチェット | `eslint.config.js:250`「抽出が進んだら数値を下げること（**増やすのは禁止**）」 | 巨大化が止まらなくなる |
| 会場は別ドキュメントのDOMを持つ | `src/lib/laneMirrorPerLivePublish.js:17-19` | データに指紋を同梱すると「同じデータなのにhash違い」を構造的に作る |
| 一致判定は両辺が別起点でなければ恒真 | [[comparison-needs-two-origins-2026-08-07]] | 嘘の緑が出る |

---

## 5. ★真の構造的問題（実測で判明・お題の見立ての修正）

ユーザーの見立て「計器強化」については、実測が**別の答え**を出した。

```
src/lib の計器・判定系ファイル          : 148個
「時刻・齢」を独自に持つファイル        : 140個
「保留/pending」を独自に判定するファイル :  48個
```

**計器は足りていない のではなく、多すぎて互いに矛盾している。**

### 同じ概念に9つの名前がある（実測）

| 名前 | 使用ファイル数 | 意味 |
|---|---:|---|
| `capturedAt` | 124 | いつの値か |
| `AgoMs` | 23 | いつの値か |
| `ageMs` | 16 | いつの値か |
| `persistedAt` | 7 | いつの値か |
| `measuredAt` | 5 | いつの値か |
| `shadeAgeMs` | 4 | いつの値か（popup起動から） |
| `AgoSec` | 2 | いつの値か |
| `lastPublishAgoSec` | 1 | いつの値か |
| `_extrasCacheAt` | 1 | いつの値か |

すべて「**その値がいつ真だったか**」を表すのに、**共通の型も語彙も比較規則も無い**。

### これが7回の失敗を生んだ機序（実証済み）

`src/lib/popupDiagUptimeNote.js` は 2026-08-01 に**私自身が同じ誤読をした後に書いたもの**で、
JSDoc にこう書いてある（:9-13）:

> 起動直後は多くの計器が構造的にゼロになる:
>   - 鏡の flush は publish の 400ms 後
>   - 初期ローディングの幕は最低 800ms 表示する設計

**正しい知識が、正しく文書化されていた。** しかしその判定は
`popup 固有診断セクション`（速報の下部）にしか出力されず、
🔴 が実際に出る `diagnosticsTrust`（冒頭）と `parityVerdict`（最上部）は
**それぞれ別の基準で独自に判定していた**（`diagnosticsTrust.js:76-88` / `parityVerdict.js:210-219`）。

→ **知識の共有ではなく、判定の共有が無いことが原因。** ドキュメントを増やしても直らない。

---

## 6. 変更すると壊れうる箇所

| 箇所 | 依存しているもの |
|---|---|
| `LANE_MIRROR_CONSUMERS` | `laneMirrorContract.registry.test.js` が実 import と grep 照合 |
| `eslint.config.js:250` の max-lines | popup-entry.js の行数（**増やす方向の変更は禁止**） |
| `docs/feature-map/*` | `feature-map:check` が生成物のdriftを検出 |
| `docs/repo-tree-map.*` | 新規ファイル追加時に必ず再生成が要る（pre-commit フックが強制） |
| 各種 wiring テスト | 関数名・呼び出しの形を文字列で固定しているものが多数（分割で壊れる） |

★**分割で最も壊れやすいのは wiring テスト**。関数を移動すると
「`fnBody(popupSrc, 'function xxx(')`」型のテストが軒並み赤くなる（今日3件経験済み）。

---

## 7. 未確認の前提（推測と明記）

- **推測**: `initPopup` の90個の `addEventListener` は互いに独立しており、
  塊ごとに切り出せる。→ **未確認**。依存する module-level 変数を追う必要がある。
- **推測**: `refresh`(1,763行) は世代ガード `isFreshRefresh()` に依存しているため、
  分割時にガードの適用範囲を壊しやすい。→ **未確認**。
- **未確認**: `content-entry.js`(19,065行) の内部構成は今回測っていない
  （popup-entry を先に扱う前提のため）。
- **未確認**: 時刻の型を統一した場合、既存の storage に保存済みの値との互換性を
  どう保つか（過去の snapshot は旧形式のまま残る）。

---

## 8. ★実装前に決める必要がある質問（Fableに答えさせる論点）

1. **どちらを先にやるか**: 「時刻の正本を作る」と「巨大関数を割る」は独立か、
   順序に依存するか。片方だけでも7回の失敗は止まるか。

2. **時刻の正本の形**: 新しい型（例 `Timestamped<T>`）を導入するか、
   既存の `capturedAt` を正式名として他を寄せるか。
   後方互換（storage に残る旧形式）をどう扱うか。

3. **判定の一本化**: 「この値は判定に使えるか（保留か）」を決める関数を1つにするとして、
   その関数はどこに置き、既存の48箇所をどう移行するか。一度に全部か、段階的か。

4. **巨大関数の切り方**: `initPopup`(2,552行/90 addEventListener/69 try) を
   どの単位で割るか。「UI配線」「storage読み込み」「タイマー登録」などの
   横断的関心で割るか、機能ごと（応援レーン/北極星/効果音）で割るか。

5. **wiring テストの扱い**: 関数移動で壊れる wiring テストを、
   移動のたびに直すのか、先に「壊れにくい形」に書き換えてから移動するのか。

6. **max-lines ラチェットの運用**: 分割中は一時的に行数が増える局面があるか。
   あるなら `eslint.config.js:250` の「増やすのは禁止」とどう折り合うか。

7. **MVPの範囲**: 今回のスコープを「popup-entry の2関数だけ」に絞るか、
   「時刻の正本」まで含めるか。ユーザーは「今後の運用も楽になる」ことを目的にしている。

8. **効果の測り方**: 分割が成功したことを何で判定するか。
   行数だけでは「移しただけ」と区別できない。

---

## 9. セルフチェック（HOWTO の項目）

- [x] ファイル名の列挙だけで終わっていないか → §3 でデータの流れを行番号付きで追った
- [x] 既存仕様を守る理由が書かれているか → §4 に根拠付きで表にした
- [x] ユーザー体験上の制約 → §4（診断ページの重さ）・§0（7回の失敗＝ユーザーの往復コスト）
- [x] データ保存・互換性・失敗時の挙動 → §7 に未確認として明記
- [x] 確認した事実と未確認の推測が分かれているか → §7 で分離
- [x] 重要な判断に根拠が付いているか → 全て file:line または実測コマンドの出力

## 10. 関連メモリ

- [[instrument-can-name-the-wrong-culprit-2026-08-10]] — 計器が結果を原因と名指しする
- [[instrument-must-not-overwrite-its-own-evidence-2026-08-09]] — 計器が証拠を消す
- [[red-may-be-snapshot-too-early-2026-08-08]] — 早すぎる撮影
- [[check-what-the-number-counts-2026-08-09]] — その数字が何を数えているか
- [[comparison-needs-two-origins-2026-08-07]] — 一致判定は両辺が別起点でなければ恒真
