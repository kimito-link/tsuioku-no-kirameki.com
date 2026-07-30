# 設計書 — LaneScene構造改革(ロビー撤去含む)の妥当性検証と段階移行計画

- 設計: Fable(claude-fable-5サブエージェント) / 裏取り: 司令塔(Claude Code)
- 日付: 2026-07-14
- 位置づけ: `/council-fable` 3段構え(会議ハーネス→Fable設計→実装引き継ぎ)の手順2の産物。ユーザー自身が提示した大規模再設計案の妥当性検証。
- 前提: [venue-pop-parity-loop-root-cause-DESIGN.md](venue-pop-parity-loop-root-cause-DESIGN.md)(C1: 両端実DOM指紋・C2: stale鏡保持)の続き。C1/C2はpush済み(v0.1.1133-1136)だが実機確認は未了。

## 結論サマリ

ユーザーが提示したLaneScene構造改革案の方向性(SSOT化・一致証明の機械化)は正しく、**しかもその大部分は既に実装済み**である。`LaneMirrorSnapshot`(KEY_LANE_MIRROR)が事実上のLaneSceneであり、`paintStoryUserLaneDomFilled`が事実上のLaneSurfaceである。したがって採用すべきは「新構造の構築」ではなく「既存構造の正本宣言+穴の封鎖」。一方、**ロビー完全撤去は不採用**(論理的に不可能)、**①POP自身をScene消費者に改造する工程も不採用**(不要かつ高リスク)を勧告する。

## 必答論点への回答

### 論点A(最重要・前提訂正): LaneSurfaceは「新しい概念」か「既存パターンの延長」か

**判定: 既存パターンの延長。ほぼ実在する。**

実コードで確認した事実(司令塔による裏取り済み):

1. `renderStoryUserLaneDom.js`の`paintStoryUserLaneDomFilled(els, faces, buckets, pickedLength, io, opts)`は、①POP(`popup-entry.js:6779`)・②プレビュー(`:6927`)・①鏡フォールバック(`:7005`)・③WEB・**会場(`venueBar.js:4336`)**の全消費者から呼ばれている。DOM生成の正本は既に1つ。
2. これは「同じソースがビルド時に各バンドルへ静的に含まれ、各実行環境が自分のDOMを生成する」方式。実行時にオリジンを跨がない。会議の一部メンバーの「DOM共有不可→メッセージング必須」という主張は既存実装の実態を見ていない誤前提であり、**その提案(メッセージングレイヤー最優先MVP)は棄却が正しい**。新規メッセージング機構はゼロ行必要。
3. 提案のLaneSurfaceインターフェース(mount/update/measure/dispose)と現物の対応:
   - mount = `StoryUserLaneDomElements`(els束)の構築
   - update = `paintStoryUserLaneDomFilled` / `resetStoryUserLaneDom`(diff-skip・単調性ガード内蔵)
   - measure = `measureLaneDomSelf`(C1・`popup-entry.js:6783`)+`venueLaneParityKey`の`data-userKey`刻印
   - dispose = `resetStoryUserLaneDom`

   つまり**クラス化・ライフサイクル形式化は表記の変更であって能力の追加ではない**。バニラ関数+els束のまま何も失っていない。形式化は不採用(過剰設計)。

**本当に分裂しているのは入力合成だけ**。①は`STORY_SOURCE_STATE`→`bucketStoryUserLanePicks`+gift/ad picks、会場は`composeVenueBaseRows`→`bucketVenueLaneSeats`→`composeVenueLaneBuckets`。提案の核心的に正しい観察はここであり、その解も既に半分ある: 会場のP層は`restoreLaneMirrorBuckets(鏡)`そのもの=①の実paint出力を入力にしている。残る分裂は「鏡が使えない時のfallback合成」と「鏡外(T/X層)の扱い」のみ。

### 論点B/D: ロビー撤去の代替 — **撤去は不採用。AudienceArenaは実質「ロビーの改名」である**

提案は「ロビーは①との完全一致と論理的に両立しない」と言うが、実コードは逆を示す。制約を並べると:

- (i) 会場の5段=①の5段と**件数まで**厳密同一(v0.1.1112確定)
- (ii) 会場は全員表示(①はcap200で切る)(ユーザー確定原則)
- (iii) 匿名(uid空/a:系)は①のレーン候補になれない(`venueLaneBuckets.js:75`「①も uid 無しはレーン候補にならない」)

(i)∧(ii)より「①のcap外+鏡外の人」は5段の**外**に必ず居場所が要る。(iii)より匿名を段に入れると(i)が即座に破れる(=「匿名の壁」v0.1.1122で一度直したバグの再発)。**この居場所こそロビーであり、ロビーは一致を壊す存在ではなく一致を可能にしている緩衝装置**。提案自身が「会場固有機能はAudienceArenaに分離」と言っており、あふれ+匿名の受け皿をScene外の別コンポーネントに置くなら、それは現行ロビーと構造的に同一物。よって:

- **採用**: 「ロビー=LaneScene外のAudienceArena領域」という概念整理(命名と責務境界の明文化)。設計文書上の位置づけを「第6の段(一致対象)」から「Scene外の観客席(一致判定の対象外・非重複だけ検証)」へ格下げする。
- **不採用**: DOM・描画関数・判定の撤去。防御機構を捨てて別名で作り直すだけの往復になる。
- **維持すべき不変条件**(既に実装済み・これを正本化): ①段∩ロビー=∅(`composeVenueLaneBuckets`:171-181のmirrorKeySet dedupe+parity「二重在籍0」判定)、②匿名判定はID種別のみ(表示名を使わない=enrich後着churn防止、`venueLaneBuckets.js`:157-164)、③maxTotalはロビーに効かせない(全員表示、:165)。

### 論点C: C2(staleButUsable)とHOLDING_LAST_GOODの関係

**C2は提案の状態機械の実装そのもの(名前が付いていないだけ)**。対応表:

| 提案の状態 | 現物(`composeVenueBaseRows`・`venueBar.js:4581-4608`+`isLaneMirrorUsableForVenue`) |
|---|---|
| EMPTY | reason=absent/empty → fallback |
| READY | usable=true → 鏡 |
| HOLDING_LAST_GOOD | reason=stale → 直近の鏡を使い続ける(C2・v0.1.1136) |
| (配信切替) | reason=liveIdMismatch → fallback+aggregateParticipantsの明示クリア |

置き換え不要・そのまま組み込み済みと判定。唯一の改善余地は、この判定がvenueBar.jsのクロージャ(laneMirrorSnap/laneMirrorPaintSnap)に埋まっていること。ただし判定関数`isLaneMirrorUsableForVenue`自体は既に純関数libにあり単体テスト可能なので、切り出しの実益は薄い。**バグが再発したときに限り**`venueMirrorHoldPolicy.js`として状態遷移を純関数化する(今はやらない)。

### 論点D: 現実的な最初の1〜2段階

8段階のうち②③(①POPをScene消費者化・DOM所有権移動)は不採用(後述F)。着手すべきは:

**段階1(MVP・後述E): Sceneの正本宣言+revision/contentHash+RenderReceipt** — 新規純関数lib1本+呼び出し2箇所。
**段階2(実測で必要と出たら): 会場側再解釈の縮小** — 既にメモリで「後送=席ラップ撤去・グリッド丸写し」として合意済みの作業と同一。wrapTileEl(`venueBar.js:4352-4363`)と席装飾ループ(`:4373-4412`)を細らせ、会場5段のDOMを①とバイト一致に近づける。

### 論点E: 今すぐ全面着手すべきか

**No。C1/C2(v0.1.1133-1136)は実機確認すら未了**。判断基準:

1. **まずC1指紋を実運用2週間(または実配信10回)回す**。domFingerprint不一致率≈0なら、提案の動機(「一致が保証されない」)自体が解消しており、構造改革は不要と結論してよい。
2. 不一致が再発し、かつ原因が**入力合成の分裂**(fallback⇔鏡モード遷移・T/X層)に帰着したら段階2へ。
3. ①POP側の描画自体が原因と特定されたときのみ、①のScene消費者化を再検討(現時点では仮説にすらなっていない)。

「4回宣言して再発」の教訓(既存メモリ`venue-pop-parity-loop-root-cause`)は「作り直せば直る」ではなく「✅判定が浅かった」だった。同じ轍を踏まないため、**再設計より先に判定(C1)を信頼できる状態にする**のが正順。

## A. 理想の統合アーキテクチャ

前提訂正(ビルド時共有・メッセージング不要)を踏まえた到達点:

```
[①POP popup-entry.js]                          [会場 venueBar.js]
  候補集計 → buckets → paint(LaneSurface)         鏡read → restore → paint(同じLaneSurface)
        │ 同期フレームでmeasure(C1)                    │ 同期フレームでmeasure(C1)
        ▼                                             ▼
  publishLaneMirror ══ LaneScene ══ storage ══▶  RenderReceipt(revision突合)
  (Scene生産者・唯一)   (=LaneMirrorSnapshot        (Scene消費者)
                        +revision/contentHash)
                                                  [AudienceArena(=現ロビー)]
                                                    Scene外集合(cap外+匿名)・非重複不変条件のみ検証
```

要点: **Sceneの定義は「①が実際にpaintしたもの」**。①は生産者なので構造上Sceneと一致する(消費者化する必要がない)。一致証明は「会場が描いたSceneのrevision=①が発行したrevision ∧ 両端domFingerprint一致」で機械化する。

## B. コンポーネント構成(4個・既存ファイル対応)

| コンポーネント | 実体(既存) | 追加するもの |
|---|---|---|
| **LaneScene** | `laneMirror.js`のLaneMirrorSnapshot | `revision`(単調増加)+`contentHash`(buckets正規化hash)フィールド |
| **LaneSurface** | `renderStoryUserLaneDom.js`(既に共有・凍結気味) | 変更なし(触らない) |
| **SceneSupply(会場)** | `venueLaneMirrorSupply.js`+`composeVenueBaseRows`+C2 | 変更なし。paintしたsnapのrevisionをReceiptへ渡すだけ |
| **AudienceArena** | `paintVenueLobby`+`bucketVenueLaneSeats(anonymousToLobby)` | 改名不要・責務の明文化のみ(一致判定の対象外・非重複のみ検証) |

新規ファイルは1本だけ: `src/lib/laneSceneEnvelope.js`。

## C. 具体機構(シグネチャレベル)

```js
// src/lib/laneSceneEnvelope.js(新規・純関数・DOM/chrome非依存)

/** buckets を正規化して決定的な contentHash を返す(userKey+displaySrc+title、段順固定)。 */
export function laneSceneContentHash(buckets) // => string(djb2/fnv 8桁hex。crypto不要=同一性検査であり改竄耐性は不要)

/** publishLaneMirror が snap に焼き込む封筒。revision は①側の bundleGen を流用(既存の単調増加値・新カウンタを作らない)。 */
export function buildSceneEnvelope({ liveId, bundleGen, buckets, capturedAt })
  // => { revision: number, contentHash: string }

/** 描画側の受領証。C1 の domFingerprint と組み合わせて「同一Sceneを描いたか」を1行で返す。 */
export function buildRenderReceipt({ surface /* 'pop'|'venue' */, revision, contentHash, domFingerprint, paintedAt })
  // => RenderReceipt

/** 突合。verdict は状態速報(statusFastDiagLite passthrough 必須=地雷参照)に1行で出す。 */
export function compareRenderReceipts(popReceipt, venueReceipt)
  // => { match: boolean, line: string }
  // 例: "scene r1234 hash a1b2 ①=会場 ✅" / "①r1234≠会場r1230(2世代遅れ) 🔴"
```

配線は2箇所のみ:
1. `popup-entry.js`のpublishLaneMirror(`:6816`)呼び出し前後でenvelope焼き込み+自分のReceiptをstorageへ(既存min-gap相乗り・新規write増ゼロに近い)。
2. `venueBar.js`paint後(`:4365`直後、C1測定と同じ同期フレーム)でReceiptを`publishVenueSeatsDiag`のseatsDiagObsに1フィールド追加(新規キー不要)。

`bundleGen`は`popup-entry.js:6901,6945`で実在確認済み(既存の②ack世代パリティが使う値と同一系統)。

## D. ロビー撤去の代替策(=撤去せず責務を再定義)

論点Bで詳述のとおり撤去不採用。維持する具体ロジック(全て実装済み・不変条件として正本化):

1. **匿名の壁防御**: `bucketVenueLaneSeats(…, { anonymousToLobby: true })` — 境界は`uid==='' || isAnonymousStyleNicoUserId(uid)`のID種別のみ。表示名・enrich結果を判定に使わない(churn源を作らない)。
2. **全員表示**: maxTotalは段のみに効き、lobbyは切らない(`venueLaneBuckets.js:165`)。
3. **非重複**: `composeVenueLaneBuckets`のmirrorKeySet dedupe(:171-181)+parityの「二重在籍0」🔴判定。
4. **一致判定からの除外**: SceneEnvelope/Receipt突合の対象は5段のみ。ロビーは「段∩ロビー=∅」だけを検証(ロビーの中身の一致は定義上問わない=①に存在しない集合だから)。

## E. MVP — `laneSceneEnvelope.js`(状態速報への1行)を最初に作る

理由: (a)diff最小(新規lib1本+既存2呼び出し・DOM/描画/writeパターン不変)、(b)C1を「監視役」に昇格させる提案の一番良い部分をそのまま実現、(c)これが緑で安定すれば構造改革そのものが不要と証明でき、赤が続けば段階2の着手根拠(どの層で分岐したかrevisionで特定できる)になる。**再設計の前に、再設計が必要かを測る計器を置く**。

## F. 捨てた案と理由(正直に)

1. **①POPをLaneScene消費者に改造(提案手順②③)** — 不採用。①は生産者であり、Sceneを「①の実paint」と定義すれば①は構成上一致する。22k行のpopup-entry.jsで候補集計→paint→publishの同期フレーム構造(C1のTOCTOU防止:6779-6822)を組み替えるのは、得るものゼロでheavyRace/単調性ガード/diff-skipの精密な均衡を壊すリスクだけがある。
2. **ロビー完全撤去(手順⑤⑥の後半)** — 不採用。論点Bのとおり(i)件数厳密一致(ii)全員表示(iii)匿名排除の3制約下で受け皿は論理的必然。AudienceArena分離は撤去ではなく現ロビーの改名。ユーザー提案の「ロビーは一致と両立しない」は、v0.1.1112以前の「T/X層を段末尾に混ぜていた」時代の記憶に基づく診断で、現行コード(段=鏡のみ・鏡外は全部ロビー)では既に解消済み。
3. **mount/update/measure/disposeのコンポーネント形式化** — 不採用。既存のels束+純関数が同じ能力を持つ(論点A)。個人開発でクラス階層は保守負債。
4. **メッセージングレイヤー(会議統括案)** — 棄却。誤前提(論点A参照)。
5. **会場fallback完全停止(手順⑤前半)** — 保留。fallbackはL8(①未描画/会場先開きでも空白にしない)の担い手。C2で明滅は止まっており、停止はHOLDING_LAST_GOODの「最初の鏡が来る前」を空白にする改悪。fallback→鏡の初回1回遷移だけ許す現行が正しい。

**採用した提案部分**: SSOT方向・SceneEnvelope(revision/contentHash)・RenderReceipt・C1の監視役位置づけ・状態機械の明文化(C2がそれ)・AudienceArenaという責務境界の言語化。提案の価値は「新機構」ではなく「既にある機構の正しい名付けと検証の機械化」にあった、というのが正直な総括。

## G. 地雷と回避策

1. **contentHashに揺れるフィールドを入れる**(capturedAt・guard差替後src) → v1022型の毎tick不一致🔴。`storyLaneTierBodyKey`(`renderStoryUserLaneDom.js:159`)と同じ「確定フィールドのみ」規則を流用。
2. **新計器をstatusFastDiagLiteに通し忘れる** → コピペに永久に出ない(v0.1.1124で実際に踏んだ地雷)。wiring断言テストをセットで書く。
3. **revision新カウンタの二重管理** → 既存bundleGenを流用(②ack世代パリティ:6942-6945と同じ値系に乗る)。
4. **Receipt writeをhot pathに直置き** → 既存min-gap(3秒)相乗り必須。extras則(`status-extras-read-not-core-read`)。
5. **段階2(席ラップ撤去)を鏡cap変更と別々にやる** → v1051/1052の轍(limit変更と鏡capはセット)。
6. **検証エージェント並走中のcommit** → detached HEAD事故(既知)。段階1のcommit時に注意。
7. **host/iframe制約**: 本設計はDOM生成ロジックの置き場所の話でありhost/iframe構造に一切触れない(抵触しない)。ただし段階2で席DOM構造を変えるときはvenueOpenMoves/reloadCount計器を先に見る(ちかちか事故の教訓)。

## 移行計画まとめ

段階0=C1/C2実機確認(既定路線・今ここ) → 段階1=MVP(laneSceneEnvelope+速報1行・1patch) → 2週間実測 → 緑なら完了宣言(構造改革不要と正式結論)/赤なら段階2(席ラップ撤去=既合意の後送作業)へ。**①POP改造とロビー撤去はロードマップから外す**。
