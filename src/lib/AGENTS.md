---
layer: L0
purity: pure
impure_exceptions: 41
files: 719
---

# `src/lib` — 純粋ロジックの箱

> **この1枚で `src/lib` の 719ファイルが分かる。** ここを触る前に読む。
> AGENTS.md は入れ子で読まれる（ツリー上で**最も近いもの**が優先）。
> リポ全体の話はルートの [AGENTS.md](../../AGENTS.md) にある。ここでは **lib だけ**を書く。

## この箱は何か（実測 2026-08-21）

| | |
|---|---|
| ファイル数 | **719**（非テスト）＋ テスト 829 |
| 大きさ | 中央値 **102行** / 640ファイルが300行以下 |
| 純粋 | **678 / 719** |
| 例外（副作用あり） | **41**（下に全部の名前がある） |

★**1ファイル1責務**が既に成立している。`src/extension/*-entry.js`（22,660行など）とは
性格がまったく違う箱なので、**同じ気持ちで触らない**こと。

## この箱に入るもの

- **判定**（〜してよいか / 〜は異常か）を返す純粋関数
- **変換**（データ → 表示用の形）
- **集計・要約**（数える・並べる・畳む）
- 上記の**定数・宣言テーブル**（例: `instrumentSpec.js` / `statusReadPolicy.js`）

## この箱に入らないもの

★次を**実コードで**呼ぶと `npm run check:layer` が赤くなる：

```
chrome.*   fetch()   localStorage   sessionStorage   indexedDB   document.*   window.*
```

★**コメントや文字列の中に書くのは OK**（検査は文字列を潰してから見る）。
例: `writtenBy: 'chrome.tabs.query (…)'` は違反ではない。

I/O が要るときは **呼び出し側（`src/extension/*-entry.js`）に置き、lib には判定だけ残す**。

## ★なぜ「純粋」にこだわるのか

1. **テストが書ける** — 829個のテストはブラウザ無しで走る（`npm run test:cc`）
2. **AIが読める** — 入力と出力だけ見れば分かる。外の状態を追わなくてよい
3. **再利用できる** — popup / content / venue / status / web版が同じ関数を共有できる
4. ★**逆流が起きない** — 実測で **lib → entry の import は 0件**。
   lib は「呼ばれる側」に徹しているので、依存の向きが常に一方向になる

## ★例外の41ファイル（なぜ lib にあるか）

★**名前で分かるようにしてある**。新しく例外を増やすときも、この命名に合わせる。

| 種類 | ファイル | なぜ lib にあるか |
|---|---|---|
| **DOM を組み立てる** (`*Dom.js` 等) | `avatarPartsComposer` `chikuranHeaderDom` `commentPostDom` `inlineBelowWideRowInsert` `laneDomSelfMeasure` `laneTickProbe` `mirrorSanitize` `paintTopSupportRankStyleIntoElement` `panelWakeCurtainDom` `personTileDom` `reportCommentsTableSection` `supportGrowthAvatarLoad` `supporterRankingDom` `venueDomCensus` `videoCapture` `watchCelebrationOverlay` | ★**5画面（popup/venue/comeview/status/web）が同じ見た目を作る**ため。ここに無いと5箇所にコピーが増える |
| **HTML を作る** (`*Html.js`) | `marketingChartsHtml` `mediaKitHtml` | 出力先が複数（レポート/プレビュー） |
| **保存する** (`*Db.js` `*Store.js`) | `broadcastSessionSummaryDb` `broadcastSessionSummaryFlush` `commentDb` `customSoundStore` `diagnosticRingStore` `globalBackfillQueue` `reportPreviewPublish` `thumbDb` | ★**書き手が複数コンテキスト**（content / offscreen / SW）。正本を1つにするため |
| **通信する** (`*Client.js`) | `kokenGiftHistoryFetchClient` `liveviewErrorReport` `officialEventDomBundle` `statusMindmapModel` `voicevoxClient` | 外部APIの作法を1箇所に閉じ込める |
| **音・映像を鳴らす** | `bgmDirector` `effectSoundPlayer` `reportCompleteVoice` `scoreCountUp` `voiceComment` `voiceInputDevices` | ブラウザAPIそのものが機能の本体 |
| **計測・診断** | `consoleErrorBuffer` `devMonitorTrendSession` `globalFetchRateLimiter` `interceptVisitorProbeDebug` `mainThreadBlockerBoot` `nameplateToggleBoot` `nicoCommentPanelAssetLauncher` `watchPopupLoadDiagnostics` | 測る対象がブラウザの状態そのもの |

★純粋にできたら `scripts/check-layer.mjs` の `IMPURE_BASELINE` から**消してよい**（減る方向は緑）。

## ファイルの書き出し（★形式は1つだけ）

新しいファイルには先頭にこれを書く。★**書式を増やさない**
（自由文だと必ず揺れる。実際 18ファイルで既に3種類に分かれていた）。

```js
/**
 * 【層】L0 判定層(純粋関数・I/O禁止)
 * 【この箱に入るもの】…（1行）
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*
 * 【書けるstorageキー】なし
 * 【正本宣言】…の判断根拠はこのファイルのみ
 *
 * <ファイル名>.js — 一言でいうと何か。
 */
```

見本: [`instrumentSpec.js`](instrumentSpec.js) / [`statusReadPolicy.js`](statusReadPolicy.js)

## 迷ったらどこを見るか

| 知りたいこと | 見る場所 |
|---|---|
| 全ファイルの「何をするか」 | [`docs/code-tree.md`](../../docs/code-tree.md)（自動生成・全ファイル網羅） |
| この関数を変えたら何が壊れる？ | [`docs/feature-map/impact-map.md`](../../docs/feature-map/impact-map.md) |
| storage キーは誰が書き誰が読む？ | [`docs/feature-map/storage-bus.md`](../../docs/feature-map/storage-bus.md) |
| `data-*` 属性は誰が書き誰が読む？ | [`docs/feature-map/dom-attr-bus.md`](../../docs/feature-map/dom-attr-bus.md) |
| 設計判断の理由・過去の地雷 | ルート [AGENTS.md](../../AGENTS.md) §3 |

## この箱を守る検査

```bash
npm run check:layer
```

★**新しく純粋でないファイルが増えたときだけ赤くなる**（既存41件は許容）。
`npm run verify:cc` にも入っているので、出荷前に自動で走る。

★**なぜベースライン方式か**: このリポで生き残った仕掛けは全てこの形
（未記入数のラチェット / バンドル予算 / storage断線検出）。
「全部きれいにしてから導入」は一度も成功していない。
