# 引き継ぎ 2026-08-12 — 計器を「面・機能ごとに特化」させる(設計確定・実装はここから)

> 次のセッションはこの1枚から始める。ブランチ **`feat/sidepanel-first-layout`**(push 済み)
> 現在 **v0.1.1348** / commit `ce7dcf6f`

---

## 0. まず結論

ユーザーの指示:
> 「計器強化したい。コメント記録特化型とか、自分でコメント送信特化型とか、あればエラー修正はやいとおもう」
> 「計器の数を増やしたい。先につくってから(実装は引き継ぎで)」

**設計は完了している。この文書の §4 の版割り(v1349〜v1356)をそのまま実装すればよい。**
★最初の1版(v1349)は **配線ゼロ・挙動変更ゼロ**なので安全に入れる。

---

## 1. ★なぜ必要か(2026-08-12 に実際に踏んだ9つの失敗)

計器を増やすほど、この9つを踏む機会も増える。**型を決めてから増やす**のが今回の主旨。

| # | 失敗の型 | 実例(全部この日に実際に起きた) |
|---|---|---|
| 1 | 判定はあるが**配線されていない** | contributionRanking の kokenApiRows が**約1年発火せず** |
| 2 | **読み手だけ足して書き手が無い** | ★v1347 の会場アイコン行(**私が作った**・v1348で修理) |
| 3 | **個別列挙する関数が値を落とす** | venueSeatsDiag の snapshot(**6回目**) |
| 4 | **異常時ほど診断が消える** | `if (line) push` / `if (overviewText)` の中 |
| 5 | **効いているときだけ出す** | heavyFreshReadReuseCount > 0 のときだけ行を出す(v1341で修理) |
| 6 | **データが保存されていない** | 成功0件だと storage に何も書かない(v1343で修理) |
| 7 | **settled state しか測らない** | 一瞬の症状は必ず正常に見える |
| 8 | **同名フィールドが2面にある** | avatarProbe(popup と会場) |
| 9 | **計測の穴** | rAF はタブ非表示で止まる(「最悪104秒」の正体) |

---

## 2. 計器の型(必須5点セット)

新計器 `xxxDiag.js` は必ずこれを持つ。**1機能=1チャンネル=1ファイル**。

```
① XXX_DIAG_SCHEMA        フィールド表(唯一の正本)
     { name, kind:'count'|'ms'|'flag'|'text'|'stage', default, unmeasured? }
     ★ms系は unmeasured:-1 必須(「0=観測して0」と「未計測」を型で分離 → 失敗#6/#7)
     ★時点は capturedAt(epoch)だけ保存。「N秒前」は読み手が算出(化石値ガードと同方針)
② makeInitialXxxDiag()   schema から機械生成
③ buildXxxSnapshot()     ★共有ヘルパー copyDiagBySchema(schema, input) を呼ぶだけ
     ★手書きの個別列挙を【禁止】 → 失敗#3(6回目)を構造的に根絶
④ buildXxxReachFragment(snap, ctx)  R層断片。★絶対に '' を返さない
     '✅3秒前' / '⚪未観測(面closed)' / '🔴齢480秒(化石)' / '🔴storageに無い'
⑤ buildXxxDiagLines(snap, now)      H層。正常=空配列。
     ★異常行は必ず【段(stage)】と【原因語】を含む(症状だけの行は禁止)
```

### R/H/P 3層の適用範囲(会場の会議で出た型を一般化)

- **R層(到達・生存)= 全チャンネル必須**。これが常在して初めて
  「無音=正常」と「無音=配線切れ」が区別できる(失敗#1/#2/#4/#5 の解毒剤)
- **H層(実害)= 全チャンネル必須**。ただし正常時は0行(R層が生存を保証するから黙れる)
- **P層(一致)= 鏡を持つ機能だけ・任意**。鏡が無い機能に義務化すると
  「同じヘルパーを両辺が呼ぶ恒真パリティ」を量産する([[comparison-needs-two-origins]])
  ★コメント記録・コメント送信には P層を作らない

### 出口の型(速報が長くなりすぎない工夫)

★**R層は全チャンネルを1行に集約する**。チャンネルごとに1行出すと破綻する。

```
計器到達: 記録✅2s / 送信⚪操作なし / 会場⚪面closed / 読上✅8s / 即push✅2s
```

この1行は `if (line)` の**外**・`if (overviewText)` の**外**に無条件 push。
異常チャンネルだけ 🔴+理由付きで太る。**正常時の速報増分は全体で1行だけ**。

### 面の扱い(失敗#8)

バンドルが面ごとに別=インスタンス共有不可。だから
**チャンネルIDに面を含める**(`venue.avatar` と `popup.avatar` は別チャンネル・別キー)。
snapshot に `source`(書き手の面名)を必須フィールドで持たせ、
読み手は source 不一致を R層で 🔴 にする。

### 計測の穴(失敗#9)

診断 lib で `requestAnimationFrame` 単独の経過測定を**禁止**(ゲートG5)。
描画完了系は Date.now ペア + `hiddenDuring: flag` を併記し、
hidden 中のサンプルは EMA に混ぜない(「最悪104秒」を名指しできる形にする)。

---

## 3. ★新計器を足すときのゲート(6つ・機械検査)

新設 `src/lib/diagChannelRegistry.js` に全チャンネルを登録し、
`diagChannelRegistry.contract.test.js` が **registry を反復して全チャンネルに同じ検査**を掛ける。
＝**計器を1個足す = registry に1エントリ足す = ゲートが自動で掛かる**。

```js
// registry エントリ(スケッチ)
{ id: 'commentPost', key: KEY_COMMENT_POST_DIAG,
  surface: 'popup',
  writerFile: 'src/extension/popup-entry.js',
  readerFile: 'src/extension/status-entry.js',
  schema: COMMENT_POST_DIAG_SCHEMA,
  reach: buildCommentPostReachFragment, lines: buildCommentPostDiagLines,
  status: 'wired' | 'planned' }   // planned=lib のみ先行を明示的に許す印
```

| ゲート | 塞ぐ失敗 | 検査の中身 |
|---|---|---|
| **G1 配線両端** | #1,#2 | status:'wired' の全エントリで、キー定数が writerFile と readerFile の**両方**で使われていることを**数で断言**(`toBe(N)`)。planned は一覧表示のみ(黙って許さない) |
| **G2 schema往復** | #3 | 全フィールドに非デフォルト値を入れた合成 snapshot を通して deep-equal。makeInitial のキー集合=schema のキー集合も断言。schema に無い値を落とすことも断言 |
| **G3 通し検査** | #4,#5 | `buildAiShareFullText` を**全入力 null** で呼び、R層集約行に全 wired チャンネルの断片が現れることを断言。reach が '' を返したらテストが落ちる |
| **G4 無条件書込** | #6 | 書き手が共有ヘルパー `createDiagPublisher(key, buildSnapshot)` 経由であることを断言。`if (count > 0)` の内側からの publish を禁止 |
| **G5 計測の穴** | #9 | `src/lib/*Diag*.js` に `requestAnimationFrame` が出現しないことを断言 |
| **G6 面の重複** | #8 | registry の id 一意性 + 同一 schema を2つの surface が共有していないことを断言 |

★**各ゲートは書いた直後に変異で赤を1回確認**。変異が**適用されたことまで確認**する
(CRLF/エスケープで空振りした前科が2回ある。`git diff --numstat` か grep で確認)。

---

## 4. ★版割り(v1349〜v1356・各版のDoD付き)

| 版 | 内容 | DoD(これが緑なら完了) |
|---|---|---|
| **v1349** | `diagChannelRegistry.js` + contract test + 共有ヘルパー(`copyDiagBySchema` / `createDiagPublisher`)を新設。**配線ゼロ** | test緑 / registryから1エントリ消す変異でG1が赤 / **速報本文に差分ゼロ** |
| **v1350** | `commentPostDiag` を schema 方式へ移行(挙動同値) | G2がcommentPostで緑 / 既存 buildCommentPostDiagLines の**ゴールデン出力が移行前後で同一文字列** |
| **v1351** | R層集約行 `buildDiagReachSummaryLine` 新設 + aiShareFullText へ1行配線(`if`の外・overviewTextの外) | G3緑(全null入力で行が出る) / 実機速報に「計器到達:」行が現れる |
| **v1352** | `recordIntakeDiag.js` 新設(schema+段taxonomy)。registryに `planned` で登録。**配線ゼロ** | 単体テスト緑 / planned一覧に出る / 速報差分ゼロ |
| **v1353** | recordIntake の**書き手+読み手を同版で**配線し `wired` へ | G1/G3/G4緑 / 実機速報に「記録✅ 段persist N件/最終2s」が出る |
| **v1354** | commentPostDiag に段フィールド追加。「締切1」→「締切1(段: frame応答待ち)」 | timeout合成入力で原因語が行に出る + 変異赤 / 既存フィールドはG2で退行ゼロ |
| **v1355** | venueSeatsDiag の snapshot を schema 方式へ移行(**個別列挙180行を廃止=6回目の再発を構造で終わらせる**) | G2がvenueSeatsで緑 / 行出力ゴールデン一致 / 「schemaに足してsnapshotに足さない」変異でG2赤 |
| **v1356** | G5(rAF lint)有効化 + 描画完了系に `hiddenDuring` 注記 | G5緑 / hidden中サンプルがEMAから除外される単体テスト |

★**v1353 だけが書き手+読み手の2箇所を触る**。両端を別版に割ると失敗#2の窓が開くので**意図的に同版**。
 registry の `planned → wired` 遷移がその印になる。

### 段(stage)の語彙

- **記録**: `connect → receive → parse → accept(重複判定) → persist(IndexedDB) → render`
- **送信**: `tabFound → frameAttached → postSent → ack → echo(実着)`

★voiceFailureTaxonomy(cause×stage)と**考え方だけ揃える**。ファイル・版は混ぜない。

---

## 5. 特化計器の優先順位(実害から逆算)

1. **チャンネル基盤(v1349-1351)** — 個別計器より先。
   今日の9失敗のうち#1/#2/#4/#5は**配線と出口の構造**の問題で、基盤なしに数を増やすと断線が量産される。
   既存計器を登録するだけで「venueSeatsDiag:null で1文字も出ない」が二度と黙らなくなる。
2. **コメント記録 `recordIntakeDiag`(v1352-1353)** — ユーザー指名 + 実害が現役:
   「取得率101%→0%、**なぜ止まったかが出ない**」。記録は本丸機能なのに intake の段別計器が無い。
3. **コメント送信の原因名指し(v1354)** — ユーザー指名 + 実測 `試行1(ok0/失敗0/締切1)` が症状止まり。
   **新規ファイル不要**。段フィールドを足すだけで「締切」が「どの段で待っていたか」になる。

---

## 6. やらないこと(検討して却下)

- **全計器の一斉schema移行** — 20超を一括は大改修(却下前例)。commentPost と venueSeats の2つだけ移行し、
  残りは「新規・変更時に移行」。G2のskip印が残作業の台帳を兼ねる
- **中央DiagManager(クラス/シングルトン)** — バンドルが面ごとに別=インスタンス共有不可。
  registryは**データ(配列)+純関数**に留める
- **P層の全機能義務化** — 鏡の無い機能に作ると恒真判定を量産する
- **全チャンネルのH層常時表示** — 速報が読めなくなる
- **実行時セルフチェック** — 実行時コスト+警告の置き場問題。テスト時ゲートで同じ穴が塞がる
- **popup-entry.js への書き手追加** — ★行数上限(22,119行)に張り付いており**不可**。
  新チャンネルの書き手は content/lib 側に置く

---

## 7. 反映3手順(司令塔が忘れないため)

`git pull` は**不要な場合が多い**(司令塔と同じ作業ツリーのため)。
★ユーザーに毎回 `git pull` を出さないこと(2026-08-12 に指摘された)。

必要なのは: **拡張リロード** → **watch タブ F5**。
★コメビュ/会場は**それ自体を開き直す**(watch の F5 では入れ替わらない)。
