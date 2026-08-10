# reference_web_mirror_parity_SYNTHESIS.md — ③WEB完全丸写し→スマホ化 実装ハンドオフ設計書

> 段2(Fable設計)成果物。段1素材 = council/web-mirror-parity-SYNTHESIS.md（会議は共通描画lib方式を採用・DOMシリアライズ却下済み）。
> 実装は次段(別モデル)がこの1枚で着手する。**設計のみ・コードなし**。全ての行番号は 2026-07-07 時点
> (branch feat/robust-arch-phase0-instrument, commit 0517180a) の実読で裏取り済み。
> 出荷ゲートは `npm run verify:cc` 一本（AGENTS.md §12.5 / memory: verify-cc-lint-catches-unwired-import）。

---

## 0. 現状の実態（実コード裏取り・設計の土台）

丸写しのデータフローは既に4層構造で動いている。**作り直さない。抜けている「登録の一元化」だけを足す。**

```
①POP(popup-entry.js)                     status-entry.js                    ③WEB(app/live-view.js)
─────────────────────                    ─────────────────                  ─────────────────────
各セクション描画(本物paint)                extras read(12s間引き)              fetch /api/status?v=token
  └ publishXxxMirror(間引き鏡)     ──→   jsonBlob 組立(:1569-1595)    ──→   paintAllMirrors(:484)
      └ mergeAndScheduleFlush(:7182)       ├ statusReport 同梱(:1615)          ├ per-mirror 本物paint
          └ mirrorBundle 合流               ├ prune はしご(448KB,:1697)         ├ 鮮度1回判定+staleバナー
            (SECTION_KEYS 5鏡,              └ publishLiveViewPublish-           └ 自己修復repaint
             mirrorBundle.js:35-41)            Payload(:1625, min-gap 12s)        (MutationObserver,:646)
```

- 鏡バンドルの節キー正本: `src/lib/mirrorBundle.js:35-41` `SECTION_KEYS = ['lane','statCards','topSupporters','northStar','commentTimeline']`
- ③の paint 配線: `app/live-view.js:484-500` `paintAllMirrors` が **手書きで7関数**を並べている
  （paintBroadcasterCard / paintStatCardsMirror / paintLaneMirror / paintNorthStarMirror / paintSupporterRanking / paintCommentTimelineMirror / paintStatusReport）。
- **抜けの実例 = 応援タイムライン**: `paintCommentTimelineMirror`(live-view.js:453-479) は
  `restoreCommentTimelineRows(snap)` の**最新1件だけ**を `#commentTickerSegA` に流す。
  一方 `app/live-view.html:11501` に `#supportTimelineDetails`、`:11507` に `#supportTimelineBody` の
  **DOM土台とCSS(:5851-5960)が既存**。①は `popup-entry.js:12289 refreshSupportActivityTimeline` が
  `buildSupportActivityTimeline`(:12376, desc/limit 120) → `buildSupportTimelineBodyHtml`(:12390) で描く。
  ③はこの2つの純libを **import すらしていない**（live-view.js:30-68 の import 群に無し）。
- 自己診断: `src/lib/liveviewPublishSelfDiag.js:173 buildLiveviewPublishSelfDiag` — 鏡ごとに**手書き**の
  件数集計(:194-225)と consistency 突合(:254-322)。
- パリティ判定: `src/lib/parityVerdict.js:153 buildParityVerdict` — 決定木。既知の残穴 =
  **②の stat-card 実数値を①と突合していない**（rowcount と ack だけ。memory: parity-verdict-checks-rowcounts-not-statcard-values）。

### 真犯人の言語化（なぜ抜けるのか）

「新セクションを③に出す」には現状 **5箇所の手作業**が要る:
(1) ①の publish 関数 (2) mirrorBundle の SECTION_KEYS (3) status の jsonBlob 組立フィールド
(4) ③の paint 関数 + paintAllMirrors への追加 (5) selfDiag の件数/突合ブロック。
どれか1つ忘れても**コンパイルもテストも通る**（safeSection の try/catch と best-effort no-op が握りつぶす）。
応援タイムラインは (4) が「ティッカー1行」止まりで放置された。**これを「1箇所登録→5箇所が機械的に揃う」に変える。**

---

## A. アーキ設計 — セクション・レジストリ（1箇所登録・抜けたらCI赤）

### A-1. 全体図

```
src/lib/liveviewMirrorSections.js  ★新規・唯一の正本（純lib・chrome非依存）
  LIVEVIEW_MIRROR_SECTIONS = [ { key, blobField, restore, countOf, digestOf,
                                 hostIds, prunePolicy, liveIdOf, capturedAtOf }, ... ]
        │
        ├─(a) mirrorBundle.js SECTION_KEYS ← レジストリから導出（手書き配列を廃止）
        ├─(b) buildLiveviewJsonBlob()      ← status-entry:1569-1595 の組立を純lib化しレジストリ駆動
        ├─(c) app/live-view.js MIRROR_PAINTERS ← key→paint関数の辞書。paintAllMirrors は辞書を回すだけ
        ├─(d) liveviewPublishSelfDiag      ← 件数/digest 集計をレジストリ駆動化（手書きブロック撤去は段階的）
        └─(e) wiring テスト(vitest)        ← (a)(b)(c)+HTML host 存在を突合。忘れ=テスト赤=verify:cc 赤
```

**方針**: 既存の勝ちパターン（鏡定義lib＋restore＋③本物paint）は**1ミリも作り直さない**。
レジストリは「その一覧表」であり、descriptor の restore/countOf は**既存関数への参照**を束ねるだけの薄い層。

### A-2. レジストリ descriptor（1セクション分の契約）

| フィールド | 型 | 役割 | 既存資産との対応 |
|---|---|---|---|
| `key` | string | バンドル節キー | mirrorBundle SECTION_KEYS と同値 |
| `blobField` | string | jsonBlob 上のフィールド名 | 'laneMirror' 等（status-entry:1581-1594） |
| `restore` | (snap)=>rows | 描画用復元 | restoreLaneMirrorBuckets / restoreCommentTimelineRows 等の参照 |
| `countOf` | (snap)=>number | ③に載る非null実件数 | selfDiag の laneCellFilled 系ロジックを移設 |
| `digestOf` | (snap)=>string | 実値ダイジェスト（B節で使用） | 新規・純関数（件数+末尾キー+実数値文字列） |
| `liveIdOf` / `capturedAtOf` | (snap)=>v | 鮮度・対象配信 | 全鏡共通の liveId/capturedAt 規約 |
| `hostIds` | string[] | ③のDOM host id | wiring テストが live-view.html に存在確認 |
| `prunePolicy` | {order,floor} \| 'never' | 容量prune の順位/下限 | pruneLiveViewPublishBlob の削り順を宣言に昇格 |

**fail-closed 原則**: descriptor に `prunePolicy` を書かないとテスト赤（「削らない」も `'never'` と**明示**させる。
無言のデフォルトを作らない）。`hostIds` 空配列は「③に描かない節」（fastDiag 等の非表示データ）として明示。

### A-3. 「配線忘れ=CI赤」の機構（verify:cc に接続・新規CIジョブ不要）

`verify:cc`（scripts/run-verify-cc.mjs）は test:cc(vitest)+lint+typecheck+build+tree-map/feature-map:check+verify:bump
を既に一本で回す。**vitest に wiring テストを足すだけで CI が赤くなる**。新規スクリプト不要。

新規テスト `src/lib/liveviewMirrorSections.wiring.test.js` の断言（すべて純Node・実行時DOM不要）:

1. **バンドル整合**: `Object.keys(registry)` ⊆⊇ `mirrorBundle SECTION_KEYS`（(a)導出後は自明に緑だが、導出を
   壊すリファクタへのネガティブコントロールとして残す）。
2. **blob 整合**: `buildLiveviewJsonBlob(ダミー sections)` の出力キーに全 `blobField` が存在。
3. **③paint 整合**: `app/live-view.js` のソースを `fs.readFileSync` し、`MIRROR_PAINTERS` 辞書リテラル内に
   全 `key` が出現することを正規表現で断言（**ソーススキャン方式**。live-view.js は popup-entry を dynamic import
   する browser モジュールで vitest から直接 import できないため。辞書リテラルを1箇所に固定する規約とセット）。
   ※ 将来 painter 辞書を `app/live-view-painters.js` に分離して import-level 検証に昇格してよいが、
   分離時は import 連鎖（renderStoryUserLaneDom 等）が module top-level で document を触らないことを確認してから。
4. **DOM host 整合**: `app/live-view.html` を読み、各 `hostIds` の `id="..."` が存在。
5. **prune 宣言強制**: 全 descriptor が `prunePolicy` を持つ（'never' 含む）。
6. **selfDiag 整合**: `buildLiveviewPublishSelfDiag` の戻りの `mirrors` に全 key が現れる（(d)駆動化後）。

さらに**「新セクション追加手順」を強制する dogfood**: レジストリに1つ足してテストを流すと 3.(painter無し)
4.(host無し) が赤くなること自体が「何をどこに足すべきか」のチェックリストになる。
新規 lib 追加時は tree-map/feature-map 再生成をコミットに含める（memory: verify-cc-lint 教訓）。

### A-4. 第1号: 応援タイムラインを③に丸写しする最小実装（TDD・触るファイル:行）

**コード判定の結論**: ③が `supportActivityTimeline.js` / `supportTimelineHtml.js` を「import するだけ」では
**済まない。間に既存の鏡（commentTimelineMirror）が要る**。理由（実コード）:
- ①の組立入力は `readAllCommentsForLive(lid)`（storage 全チャンク）+ `nls_gift_events_<lid>`（popup-entry:12341-12345）。
  ③にはこの生データが無い。あるのは jsonBlob の鏡だけ。生データ全送は 448KB prune と正面衝突（却下済みDOMシリアライズと同罪）。
- **幸い commentTimelineMirror は既に jsonBlob に載っている**（status-entry:1594）。行の形は
  `{at, name, text, avatarUrl, userId, kind}`（commentTimelineMirror.js:15）。
  一方 `buildTimelineRowHtml`(supportTimelineHtml.js:99) が食う TimelineItem は
  `{kind, at, key, userId, nickname, text, commentNo, avatarUrl, selfPosted, (gift: itemName, point)}`。
  → **フィールド名変換アダプタ（純関数）が1枚要る**（name→nickname 等）。
- ギフト行: `buildCommentTimelineMirrorSnapshot` は `giftEvents` 引数を**既に受ける**（commentTimelineMirror.js:71）が、
  ①の publish 呼び出し（popup-entry:15961）は `comments: displayEntries` **のみ**でギフトを渡していない。
  かつ `toTimelineRow`(:33-53) は itemName/point を落とす。→ Step A1-4 で拡張。

**実装ステップ（この順・各ステップで verify:cc 緑を保つ）**:

- **A1-1 [TDD] アダプタ純関数**: `src/lib/commentTimelineMirror.js` に
  `restoreTimelineItemsForHtml(snap, opts)` を追加（:115 `restoreCommentTimelineRows` の直後）。
  鏡 rows(古→新) → TimelineItem[]（**desc=新しい順**。①の :12376 `order:'desc'` と並びを揃える）。
  変換: name→nickname / key は `${kind}:${userId||'anon'}:${at}:${index}` / commentNo=''/selfPosted=false /
  kind==='gift' なら itemName/point を透過（無ければ itemName=text フォールバック）。
  先にテスト（commentTimelineMirror.test.js に追記）: 並び反転・フィールド写像・空/不正入力で []。
- **A1-2 [③paint]**: `app/live-view.js` に `paintSupportTimelineMirror(snap)` を新設。
  - import 追加（:61-62 の restoreCommentTimelineRows import の隣）: `restoreTimelineItemsForHtml`、
    `buildSupportTimelineBodyHtml`(supportTimelineHtml.js:184)、`summarizeTimelineGifts`(supportActivityTimeline.js:179)。
  - host: `#supportTimelineBody`(live-view.html:11507) に `innerHTML = buildSupportTimelineBodyHtml(items, {defaultAvatar: _STRIP_DEFAULT_THUMB, now: Date.now()})`。
    `#supportTimelineDetails`(:11501) の hidden 解除・`#supportTimelineGiftMeta`(:11504) に summarize 結果。
    **署名ガード必須**（`_lastTimelineSig` と同型・:452 参照。diff-skip 機構の新設であり既存機構は不変）。
    rows空なら**何もしない**（①の空文言paintを上書きしない=死に画面回避・:460 と同流儀）。
  - **匿名リンク除去**: buildTimelineRowHtml は数値uidに `<a href=nicovideo>` を張る(supportTimelineHtml.js:171-173)。
    ③では referrer 露出回避の既存方針（live-view.js:469 コメント）に従い、paint 後に host 内の
    `a[href]` を span 化するか `rel=noreferrer` 済みを確認（実装時に `rel="noopener noreferrer"`(:173) が
    既に付いていることを確認済み → **リンクはそのまま可**。ただし referrerpolicy を実機で1回確認）。
- **A1-3 [③配線3点セット]**（自己修復系。ここを忘れると popup の空描画に負ける）:
  - `paintAllMirrors`(:484-500) に `paintSupportTimelineMirror(jsonBlob.commentTimelineMirror||null)` を追加
    （A2-1 の辞書化後は辞書へ登録）。
  - `forcePaintAllMirrors`(:548-559) の署名リセットに `_lastSupportTimelineSig = ' force'` を追加。
  - `startSelfHealingRepaint` の観測 targets(:646) に `'supportTimelineBody'` を追加。
    ★理由: ③でユーザーが `<details>` を開くと popup 本物の `refreshSupportActivityTimeline`(popup-entry:12289)
    が走り、シム storage にコメントが無いため**空文言で clobber する**(:12331/12390)。observer 自己修復が唯一の防御。
- **A1-4 [①ギフト同梱]**: `popup-entry.js:7259 publishCommentTimelineMirror` の input に `giftEvents` を追加し
  `buildCommentTimelineMirrorSnapshot` へ透過。呼び出し元(:15961)で popup が既に手元に持つギフト配列を渡す
  （in-memory 未保持なら「最後に読んだ nls_gift_events を popup 内変数にキャッシュ」を足す。**新規 storage read を
  publish 経路に足さない**=status-extras-read-not-core-read の鉄則）。
  `commentTimelineMirror.js:33 toTimelineRow` を拡張: kind==='gift' のとき `itemName`(≤120)/`point`(整数) を保持。
  テスト: ギフト行が itemName/point 付きで rows に載る・容量ガード(:88-95)が引き続き効く。
- **A1-5 [検証]**: verify:cc 全緑 → reality-checker で実機1配信（③で `#supportTimelineBody` に複数行・
  ギフト行が🎁カードで出る・details 開閉後も自己修復で復活・status:live の①vs③突合が緑）。

**容量影響**: 新規 blob セクション**ゼロ**（既存 commentTimelineMirror を再利用）。ギフト2フィールド追加分は
微増のみで、超過時は既存 prune はしご①(rows 半減・pruneLiveViewPublishBlob.js:70-87)がそのまま吸収し、
snapshotMeta.pruned 経由で selfDiag が「正常な削減」と判定する（liveviewPublishSelfDiag.js:252/309-311 既設）。

**件数の誠実表示**: ①は120件(:12378)・③は鏡cap60(commentTimelineMirror.js:22)。丸写しの範囲を偽らないため、
③の summary ラベルに「最新60件」を明記（selfDiag の 'capped=正常' 判定 :153 と同じ思想。嘘の完全一致を演出しない）。

### A-5. 段階2: 辞書化と既存5鏡の登録（レジストリ本体）

- **A2-1**: live-view.js に `MIRROR_PAINTERS = { lane: paintLaneMirror, statCards: ..., topSupporters: ...,
  northStar: ..., commentTimeline: paintCommentTimelineMirror, supportTimeline: paintSupportTimelineMirror }` を
  1リテラルで定義し、`paintAllMirrors` を「鮮度判定1回 → 辞書ループ + broadcasterCard/statusReport の2特例」に整理。
  ※ broadcasterCard(lives由来)/statusReport(文字列) は鏡でないので特例のまま（無理に一般化しない=薄く束ねる）。
  ※ `supportTimeline` は blob 上は commentTimelineMirror を共有する「view キー」。descriptor に
  `blobField:'commentTimelineMirror'` を書き、**同一鏡→複数paint** をレジストリで表現できることを第1号で証明する。
- **A2-2**: `src/lib/liveviewMirrorSections.js` 新設 + wiring テスト（A-3 の 1〜5）。
  mirrorBundle.js:35 の SECTION_KEYS をレジストリ import に置換（**挙動不変・テストで担保**。
  mirrorBundle.test.js:216 のネガティブコントロールを流用）。
- **A2-3**: status-entry.js:1569-1595 の jsonBlob 組立を `src/lib/buildLiveviewJsonBlob.js`（純関数）へ抽出し
  レジストリ駆動に。snapshotMeta.capturedAt の「各鏡 capturedAt の最大」規約(:1562-1568) は
  レジストリの capturedAtOf で機械化（now で偽らない誠実規約を関数名に固定）。
- **A2-4**: selfDiag の鏡別ブロック(:194-225, :342-355) をレジストリの countOf/liveIdOf 駆動へ**段階置換**
  （北極星の settled-state 突合(:57-110) はセクション固有 consistency としてそのまま残す。消さない）。

---

## B. 丸写し度の自動検証（嘘をつかない・不一致は必ず1行）

### B-1. 原理: digest 突合（rowcount 突合の上位互換）

既存の consistency(:254-322) は件数のみ。**残穴 = 実値**（stat-card の数字文字列・行の中身）。
レジストリの `digestOf(snap)` で各セクションの**実値ダイジェスト**（例: `rows数|先頭key|末尾key|代表実値`。
statCards は `recordsText|concurrent.estText|visitor.text` そのもの）を純関数で計算し、3点で突合する:

| 突合 | 左辺 | 右辺 | 経路 |
|---|---|---|---|
| ①vs blob | ①が publish 直前に計算した digest（mirrorBundle flush 時に節ごと同梱: `bundle.digests[key]`） | status が jsonBlob 化した後の digest 再計算 | selfDiag 内・read 追加ゼロ |
| ①vs② | 同上 | ② passive paint 直後に**実際に描いた snap** から同じ digestOf を呼び ack に `sectionDigests` として同梱（parityVerdict.js:143 previewAck の拡張・:249-261 supporterRows 特例の一般化） | 既存 ack キー1個・新規キー無し |
| blob vs ③ | jsonBlob の digest | ③がpaint直後に同じ digestOf で自己計算し**③画面の自己申告パネルに1行表示**（statusReport パネル :505 と同居） | ③は別ドメインで書き戻せない=観測の天井(parityVerdict.js:9 の宣言)。共通純libかつ同一入力なので「blob一致+共有painter」で構造的に③一致。③画面内の自己表示は人間の最終確認用 |

**嘘をつかない規約**（既存流儀の踏襲・強化）:
- digest 不一致は必ず `🔴 {section}: ①<digest> ≠ ②<digest>` の1行を formatLines に出す（沈黙禁止）。
- prune 済みセクションは snapshotMeta.pruned を見て「削減後 digest」との突合に切替え、`🟢正常(prune)` と件数差を**併記**
  （:311 の既設パターンを digest に拡張）。
- 判定3値は既存の match/normal(説明可能)/mismatch を踏襲（:87-110 judgeNorthStarConsistency と同思想）。
  鮮度差は capturedAt 窓で normal に落とす。**✅でも件数・実値が違えば理由を1行に必ず明記**。

### B-2. stat-card 実数値の残穴封じ（具体）

- `statCardsMirror` descriptor の digestOf = 表示文字列3値の連結。
- ② passive の statCards paint 完了時に ack へ digest 同梱 → `parityVerdict.buildParityVerdict` の手順7(:249) を
  「supporterRows 特例」から「全セクション digest ループ」へ一般化。不一致のみ fail、ack 側に digest が無い旧形式は
  pending（gen_unstamped 方式 :99-101 と同じ後方互換パターン）。
- テスト: parityVerdict.test に「② digest が①と1文字違い → mismatch 1行」「旧 ack → pending」を追加。

### B-3. 実装順（B は A2 の後・独立に出荷可）

B1: digestOf を全 descriptor に実装+単体テスト → B2: bundle.digests 同梱(①) → B3: ② ack 拡張+verdict 一般化 →
B4: ③ 自己申告パネル1行。各段とも観測のみ（描画・記録・数字を変えない=parityVerdict.js:2 の不変条件）。

---

## C. スマホアプリ化への道筋（③完成 → ラップ → 提出）

### C-1. 前提の確認（実コードで裏取り済み）

- ③は**既に chrome.\* 非依存の純Web**。chrome API はすべて live-view.js:128-189 の**シム**が吸収し、
  実体は `fetch('/api/status?v=token')`(:578) と DOM のみ。Vercel 配信。**アプリ化の技術的ブロッカーは無い**。
- 残る「Web臭」= `?v=<token>` の手入力導線(:750-753)。アプリでは**初回トークン入力/QR読取画面**が要る
  （現状はエラーボックスで案内するだけ :752）。

### C-2. 段階（各段が独立に出荷可能・fail-closed）

| 段 | 内容 | ゲート |
|---|---|---|
| C0 | ③完全丸写り完了（A+B が緑・digest 突合常時🟢） | reality-checker 実機判定 |
| C1 | **PWA 硬化**: manifest.json / SW(Cache-First は静的アセットのみ・`/api/status` は network-first+最終スナップショット cache=オフラインでも「N秒前の状態」を staleバナー(:733)付きで出す) / アイコン / トークン保存(localStorage)+入力画面 | Lighthouse PWA 合格・オフライン起動で死に画面にならない |
| C2 | **Android = TWA**: `ship-app-to-stores` スキルの web-ios-android キットで包む（Secrets登録→keystore→assetlinks.json を Vercel に配置→workflow_dispatch）。TWA は審査リスク最小（Play は PWA ラップに寛容） | store-guard 提出前チェック |
| C3 | **iOS = Capacitor**: 同キット。WKWebView ラップは **Guideline 4.2(最小機能)** が主敵。対策 = ネイティブ価値を最低1つ同梱: (i) プッシュ通知「配信が始まった/ギフトが来た」(robust-arch Phase 2 の publish 到達を FCM/APNs にファンアウト・サーバー側1エンドポイント追加) or (ii) ホーム画面ウィジェット。**「Webと同じだけ」の提出はしない**（store-guard の却下KBと照合してから出す） | store-guard + 過去却下ベクタ照合 |

### C-3. キット接続の具体

- 提出物のWebは**今の Vercel app/ をそのまま**（別ビルド禁止=正本1つ）。TWA は URL 参照・Capacitor は
  `server.url` でリモート参照（審査上「外部ネイティブコード無し」を満たす。iOS のリモートURL方式は
  4.2 と併せて store-guard で判定。却下されたらローカル同梱ビルドへフォールバック=その時だけ copy 工程を追加）。
- referrer 露出回避・匿名リンク方針(:469)は WebView 内でも同一コードが効く（③のコードを一切分岐させない）。
- CI: 既存キットの workflow_dispatch 実績に乗る。**このリポには新規リリースCIを作らない**（薄く束ねる）。

---

## D. 配送前提（robust-arch Phase 2 への依存とインターフェース）

丸写し設計は**配送の常時稼働を前提**とする。段1で確認済みの欠陥 = ①→クラウド publish が実配信で**23時間停止**
（status ページ生存に人質）。これは robust-arch Phase 2（**SW-alarm publisher + stateless 再送**）が根治する。
本設計は Phase 2 に以下を**インターフェースとして期待**する（丸写し側はこの契約だけに依存し、実装に依存しない）:

| 契約 | 内容 | 丸写し側の対応物 |
|---|---|---|
| P2-1 送達 | 配信中 at-least-once・latest-wins・目標 cadence ≤60s（③の POLL_INTERVAL_MS=60s :70 と整合） | ③は「最新1枚」だけ描く冪等 paint（既にそう） |
| P2-2 鮮度の誠実申告 | `snapshotMeta.capturedAt` = 各鏡 capturedAt の最大（now禁止・status-entry:1560-1568 の規約を Phase 2 でも維持） | ③の evaluateSnapshotFreshness(:486)+staleバナーがそのまま機能 |
| P2-3 単調性 | `bundle.gen` 単調（配信切替でも巻き戻さない・mirrorBundle.js:126-129） | ②③の stale ガード isMirrorBundleGenerationStale(:191) |
| P2-4 容量 | 1枚 ≤448KB(prune はしご後・pruneLiveViewPublishBlob.js:30)・削ったら snapshotMeta.pruned に必ず記録 | selfDiag/digest 突合が pruned を読んで嘘の🔴を出さない |
| P2-5 停止の可視化 | publish 停止時も lastPost(everSent/ageSec) が selfDiag に出続ける（:399-409 既設） | parityVerdict 手順5(:223-236) が pending/fail を出す |

**Phase 2 未着手でも A/B は独立に出荷可**（今日も publish は動く時間帯がある）。ただし C2/C3（ストア提出）は
P2-1 が入るまで**着手しない**（アプリで「23時間古い画面」は即★1レビュー=fail-closed）。

---

## 移行表（段階・各段で verify:cc 緑・単独ロールバック可）

| 段 | 内容 | 触る場所（節参照） | ロールバック |
|---|---|---|---|
| A1 | 第1号: 応援タイムライン③丸写し | A-4 の 5 ステップ | paintAllMirrors の1行+targets 1要素を戻すだけ |
| A2 | レジストリ+辞書化+wiring テスト | A-5 | レジストリは読み取り専用の一覧=消しても挙動不変 |
| B | digest 突合(①②③)+stat-card 残穴封じ | B-1〜B-3 | 観測のみ=判定行の削除で戻る |
| C1 | PWA 硬化 | C-2 | SW 解除のみ |
| C2/C3 | TWA/Capacitor 提出 | C-2/C-3（P2-1 待ち） | ストア側で停止 |

## 地雷（壊すな・実装者は着手前に音読）

1. **DOMシリアライズ禁止**（会議却下済み: 容量/ライブ性/CSP/資産破棄）。鏡=最小データ+③本物paint のみ。
2. **prune 448KB**: 新規 blob セクションを足すときは必ず prunePolicy 宣言（A-3.5 がテストで強制）。
3. **diff-skip 機構を触らない**: 既存の署名ガード(_lastLaneSig 等)・v1037-1042 の churn 対策は不変。
   新 paint には**新しい**署名ガードを足す（既存を共用しない）。
4. **③の clobber**: popup 本物が空で上書きする(:611-615 コメント)。新 paint は必ず (i)paintAllMirrors
   (ii)forcePaintAllMirrors の sig リセット (iii)observer targets の**3点セット**で配線（A1-3）。1つ欠けると
   「開いた瞬間だけ出て消える」バグになる。
5. **voice 触らない・referrer 露出回避**（匿名に外部リンクを張らない方針 :469）。
6. **publish 経路に新規 storage read を足さない**（status-extras-read-not-core-read / 大配信固まりの再発防止）。
7. **laneMirror 等の勝ちパターンを作り直さない**: レジストリは参照を束ねる薄い一覧。restore/paint の実体は現位置のまま。
8. **cap と鏡 cap はセットで見る**（lane-limit-200-mirror-cap-parity: :7204-7206 の教訓）。タイムライン cap を
   変えるときは TIMELINE_MIRROR_CAP・prune floor・③表示ラベル「最新N件」を同時に。
9. 反映3手順（pull→拡張リロード→watch F5）+ 配信中 copy:ext 禁止。③は Vercel デプロイが別に要る。
10. dist/ の build-id churn はコミットに混ぜない（robust-arch 引き継ぎと同じ流儀）。
