# 診断ページ健全度セル再設計（4領域）— 設計書

> 設計=Fable(claude-fable-5) / 会議素材=マルチLLM会議ハーネス(4体) / 裏取り=Claude Code(司令塔)
> 日付: 2026-08-12 / 3段構えワークフロー(council-fable)の手順2の産物
> 実装は**まだしていない**。着手は `health-cells-4domains-IMPLEMENTATION-HANDOFF.md` から。

---

## 0. なぜこの設計が要るか（ユーザー確定の判定基準）

> 「計器の価値は【読んで直せたか】だけで測る。読んでも直せないなら測定値が低い。誤誘導するなら価値は負。」

2026-08-12 の実害4件が、**状態速報1枚で切り分けられること**が目的。
セルを増やすことは目的ではない。**新設は3個のみ**（24→27・上限28以内）。

| # | 実害 | 現状なぜ切り分けられないか |
|---|---|---|
| ① | 過去コメント3000件が0.5件/秒・33%で停滞 | 律速3候補(裏タブ/yield/橋渡し)の数字は速報に出るが、**どれが律速か人間が暗算**している |
| ② | レーンのアイコンが39→3に消える | 一瞬で settled に戻るため `paint`(所要ms)も `lane-count`(現在数)も正常を示す |
| ③ | 名前ありゆっくり顔が「✅0件」と誤報 | 早期returnで checked にすら入らず「0件=測っていない」だった |
| ④ | 読み上げでVOICEVOX未起動を6版空振り | 外部依存の生死を出すセルが**1つも無い** |

---

## A. 設計原則（セルの契約）

- **A-1 原因の名指し**: `text` に症状語だけ(「遅い」「異常」)を書くのを禁止。**原因トークン＋次の一手**を必ず含む。
  生トークン(`refused` 等)は日本語に置換せず**併記**する（grep で storage の値と突き合わせるため）。
- **A-2 単独裁判官**: 1つの症状の判定関数は1つ。セルと速報の文章行が**別々に判定してはいけない**。
  判定は lib の純関数に置き、両者は同じ戻り値を整形するだけ（報告内矛盾の構造的封じ）。
- **A-3 異常時必出**: その面の diag が存在するならセルは**必ず描画**。`if (値>0)` で行ごと消す早期returnを禁止。
  未計測は「未計測」と描画する（消さない）。
- **A-4 鮮度契約**: 入力スナップショットは必ず時刻(`capturedAt`/`ts`)を持ち、§D の上限超過で **na＋経過表記**へ。
- **A-5 実装形態**: 既存契約 `{ id, label, kind, value, level, text }` 維持。**level は増やさない**。
  追加は任意フィールド `mark` のみ＝旧レンダラーは無視できる（後方互換）。

---

## B. 「—」の三義を分ける仕組み

**level も色も増やさない。** ①文言プレフィックス(正) ＋ ②固定グリフ(視覚の冗長) ＋ ③ARIA(非視覚) の3点で区別。
**ツールチップは使わない**（キーボード操作・スクリーンリーダーで情報が完全に失われるため。会議の批判役の指摘）。

| 意味 | level | mark(新設) | グリフ | text プレフィックス | 例 |
|---|---|---|---|---|---|
| 該当なし | `na`(灰) | `'none'` | `—` | `対象なし:` | `— 対象なし: 会場を開いていません` |
| 未計測 | `na`(灰) | `'unmeasured'` | `◌` | `未計測:` | `◌ 未計測: 計器が観測を書いていない` |
| 計器故障 | `warn`(黄)※ | `'broken'` | `⚠` | `計器故障:` | `⚠ 計器故障: 走行中なのに計器が20秒沈黙` |

- **「未計測」に青は使わない**。青は既存 `processing`＝「正常な途中」専用。測っていないのは途中ではない。
- ※計器故障は異常なので灰にしない。既定 `warn`。ただし**沈黙自体が症状の指紋**の場合(§C-1順1)は `bad` へ格上げ。
- **ARIA**: レンダラーは `aria-label="${label}: ${text}"` を付ける。text が三義プレフィックスを含むので情報が落ちない。
  グリフは `aria-hidden="true"` の装飾（意味は文言が正）。
- `mark` は任意追加フィールド。`summarizeHealthVerdict` は**変更不要**（level だけ見る現行実装のまま）。

---

## C. 4領域のセル定義

### C-1 コメント記録 — 新設 `backfill-bottleneck`（実害①）★MVP

**入力**: `KEY_BACKFILL_LIVE_METRIC`（content が1Hz＋5秒心拍で書く。読み手は status のみ＝popup に触れない構造分離を維持）
**実在フィールド**（裏取り済）: `lid / running / seg / rows / genSteps / dataSegs / bridgingSteps / yields / yieldWaitMsTotal / elapsedMs / fg / ts`

| 順 | 条件 | level | 表示文言の例（次の一手込み） |
|---|---|---|---|
| 1 | `running=1` かつ `now-ts > 15秒` | **bad** | `⚠ 計器故障: 走行中なのに計器20秒沈黙(取り込み自体の停滞を疑う)` |
| 2 | `fg=0` | warn | `律速=裏タブ(速度約1/6) → watchタブを前面に` |
| 3 | `yieldWaitMsTotal/elapsedMs ≥ 0.6` | **bad** | `律速=yield待ち67%(メインスレッド枯渇) → 同タブの重い処理を疑う` |
| 4 | 同 `≥ 0.3` | warn | `yield待ち38%(予兆)` |
| 5 | `dataSegs ≥ 10` かつ `bridgingSteps/dataSegs > 0.5` | warn | `律速=空区画の橋渡し(橋380/実区画120) → seek過多` |
| 6 | それ以外の `running=1` | ok | `約1区画29ms(実区画420・fg=1)` |
| 7 | `running=0` | na | `— 対象なし: 取り込み停止中(最終N分前)` |

★**上から1つだけ採用**（律速ポインタ方式）。しきい値30%/60%は会議diverge案、橋渡し比0.5は
`backfillLiveThroughputLine` のJSDocにある判読規則の数値化。`dataSegs≥10` は開始直後の比率暴れ防止。
★**A-2の適用**: 判定純関数(新設 `src/lib/backfillBottleneck.js`)を作り、**セルも速報行も同じ verdict を使う**。

**このセルが無かったら**: 33%で止まるたび、fg・yield・橋渡しの数字から人間が毎回暗算する往復が続く。

### C-2 サムネID — 既存 `venue-yukkuri-face` の判定拡張（実害③）

**入力**: `venueSeatsDiag.yukkuriNamedCensus`
**実在フィールド**: `checked / yukkuriNamed / outOfRangeDigits / checkedAnonymousStyle / yukkuriNamedAnonymousStyle / checkedNoUid / yukkuriNamedNoUid / lastSample / lastSampleAnonymousStyle / lastSampleNoUid`

★**「検査対象が0」と「検査をスキップ」は現行カウンタでは区別できない**（`observeVenueYukkuriNamedTile` は
名前なし・「匿名」始まりを数えずに return する）。→ **`observedTiles` を1個だけ新設**（関数先頭で無条件加算）。
**(新設・現状は存在しない — grep で0件を確認済)**

| 状態 | 判定材料 | 表示 |
|---|---|---|
| 計器が動いていない | `observedTiles=0` なのに `seatsShown>0` | `◌ 未計測: タイルN枚あるのに検査0(配線切れの疑い)` warn＋mark broken |
| 検査対象が0 | `observedTiles=0` かつ `seatsShown=0` | `— 対象なし: タイル0枚` |
| 対象外のみ | `observedTiles>0` かつ checked系すべて0 | `— 対象なし: 全N枚が名前なし/匿名` |
| 実害あり | 実害合計 > 0 | `warn: 3件(桁境界1/匿名系0/ID無2)/検18枚 → 直近{ノエル}` |
| 実害なし | checked系>0・実害0 | `ok: 0件/検18枚(ID無検5含む)` — **分母必須** |

★v0.1.1361 で `checked>0` ゲート＋分母表示は**着手済み**（残りは `observedTiles` の新設のみ）。

### C-3 描画速度 — 新設 `lane-drop`（実害②）

**入力**: `summarizeLaneTileOscillation(history, authoritative)` の戻り
**実在フィールド**: `samples / reversals / maxTiles / minTiles / amplitude / drops / worstDrop / worstDropFrom / worstDropTo / worstDropOrigin / originsSeen / monotonicGrowth`

| 条件 | level | 表示文言の例 |
|---|---|---|
| `samples=0` | na(mark unmeasured) | `◌ 未計測: paint履歴なし` |
| `drops>0` | **bad** | `最大39→3枚(−36)・直前供給元=light_summary → 供給元の縮小ガードを見る` |
| `reversals>0` | warn | `往復2回(2⇄67枚) → 供給元2種の交互上書き` |
| それ以外 | ok | `増え続け(0→67枚・観測12回)` |

★会議lead案の「直近5秒ウィンドウのpeak/delta」は**採らない**。既実装のリング履歴(`OSC_HISTORY_CAP=12`)＋
`worstDropFrom/To` が同じ答えをより正確に出す（settled state を測らず遷移を測る）。
落差そのもの(−36)を文言先頭に出す点だけ lead 案を採用。
★**(要確認)**: summarize の結果が `buildHealthCells` の入力に現在乗っているか。乗っていなければ
popup側で laneDiag スナップショットへ **capturedAt 付きで**同梱する配線が必要。

### C-4 読み上げ — 新設 `voice-engine`（実害④）

**入力**: `voiceDiag`（実在: `enabled / lastEnableFailReason / enableFailTotal / synthFailReasons / spokenTotal / capturedAt / source`）
**分類**: 既存 `voiceFailureTaxonomy.js` の `fromAliveFailure` / `canonicalLabel` を使う（**新しい判定文字列を作らない**＝正本宣言に従う）

★**外部エンジンの生死判定**: `probeVoicevoxAlive()`(`voicevoxClient.js:220`・`GET {base}/version`)が実在し、
戻りは `{ ok:boolean, reason:'timeout'|'refused'|'http-error'|'no-fetch'|'' }`（裏取り済）。
ON操作時に発火して失敗理由が `lastEnableFailReason` に、走行中の接続断は `synthFailReasons.unreachable` に既に記録される。
**常時ポーリングは新設しない**（負荷と新しい故障モードを増やすだけ）。
＝「生死を常時観測はできないので直近の失敗記録で代替する」ことを**文言にも正直に出す**（`最終確認=ON操作時`）。

| 条件 | level | 表示文言の例 |
|---|---|---|
| `capturedAt` 鮮度切れ(§D) | na | `— 対象なし: 会場休止中(N分前・source=venue)` |
| `enabled=false` かつ `lastEnableFailReason='refused'` | **bad** | `refused(VOICEVOXに接続できない=エンジン未起動の可能性) → GUIでなく音声合成エンジンの起動を確認` |
| 同 `'timeout'` | warn | `timeout(応答なし・起動はしている)` |
| 同 `'no-fetch'` | warn | `no-fetch(拡張の通信経路切れ) → ページ再読み込み` |
| 同 `'http-error'` | warn | `http-error(エンジンがエラー応答)` |
| `enabled=true` かつ `synthFailReasons.unreachable>0` | **bad** | `途中から接続不能N件 → エンジン再起動` |
| `enabled=true`・失敗なし | ok | `稼働中` |
| `enabled=false`・失敗記録なし | na | `— 対象なし: OFF` |

★**連動則**: `voice-engine` が bad のとき `voice-timing` / `voice-coverage` は判定せず
`na「— 対象なし: エンジン停止のため判定不能」` に落とす。拡張内部のセルが黄赤で並ぶと
「拡張の中を直す」方向へ誤誘導する＝**6版空振りの再発防止**。
★**(要確認)**: ON成功時に `lastEnableFailReason` がクリアされるか。されない実装なら
「enabled=true の間は probe 失敗を無視」の分岐順で誤発火を防ぐ。契約テストで固定すること。

---

## D. 化石値ガードの統一規則

**原則: しきい値 = 書き手の正常書込間隔 × 3（最低15秒）。超えたら na＋経過表記。色・スコアは付けない。**

| 領域 | 書き手の間隔 | ガード | 根拠 |
|---|---|---|---|
| backfill live metric | 1Hz＋心拍5秒 | **15秒** | ただし `running=1` のまま沈黙＝停滞の指紋なので na でなく **bad**(§C-1順1) |
| voiceDiag | 3秒 min-gap | **60秒** | ★`healthCells.js:39` に**同名定数が別値(90秒)で二重に存在する**(裏取り済)。voiceDiag.js 側を正本に一本化 |
| venue seats / census | 数秒ごと | **5分**（既存・変更なし） | 60秒〜5分は「開いているのに遅い」＝本物の warn |
| gift effect | 配信中随時 | **2時間**（既存・変更なし） | 前回配信の記録を今日の異常にしない |
| lane oscillation | paint ごと | **60秒** | laneDiag に `capturedAt` があるかは(要確認)。無ければ配線時に付ける |

---

## E. MVP（1つだけ作るなら）

**`backfill-bottleneck`（C-1）。**

理由:
- (a) 実害①は**現在進行形**でユーザーが踏んでいる痛み
- (b) 必要な観測値は `KEY_BACKFILL_LIVE_METRIC` に**全て書き込み済み**＝新しい観測コードゼロ・読み側の純関数1つと配線だけ
- (c) 判定表の7分岐が3候補＋計器故障を**直接名指し**するので「読んで直せたか」の測定値が最も高い

読み上げ(④)は基線が既にあり決着済、サムネ(③)は v1358/v1361 で主要穴が塞がれ残りは `observedTiles` のみ、
レーン(②)は配線の要確認事項が残る——いずれも2番手以降でよい。

---

## F. 捨てた案と理由

| 捨てた案 | 理由 |
|---|---|
| 領域あたり4セル（会議lead案） | セル総数34超で一覧性が死ぬ。数値の羅列は既存の速報文章行が担っており、**セルの仕事は名指し1つ**でよい |
| 「未計測」を青にする | 既存 `processing`(正常な途中)と意味衝突 |
| ツールチップで三義を区別 | キーボード/スクリーンリーダーで情報が完全に失われる |
| level に第6値(`broken`)を追加 | レンダラー・CSS・`summarizeHealthVerdict`・全既存テストに波及する割に、warn＋mark で同じ情報が出る |
| VOICEVOXへの常時生存ポーリング | 実在するのはON時probeのみ。常時化は負荷・タイマー間引き・新しい故障モードを増やす |
| サムネ桁境界(`^\d{5,14}$`)自体の修正 | 正本(identity.js)が「触るとUI挙動が丸ごとズレる」と明記した確定判断。本設計は**観測のみ** |
| lane-drop の直近5秒時間窓の新設 | 既実装のpaintリング履歴＋実DOM優先が同じ答えを出す。二重の時間窓は報告内矛盾の温床 |

---

## G. 地雷と回避策

| # | この設計での踏み方 | 予防 |
|---|---|---|
| 1 | `observedTiles` 新設後も「関数が呼ばれない経路」なら0のまま | 「タイルN枚描画済なのに observedTiles=0」を**計器故障(warn)として必出**に。0を✅にしない |
| 4 | backfillが詰まると `ts` 更新が止まり律速セルが黙る | **沈黙そのものをbadで出す**(C-1順1)。「詰まると消える」を「詰まると名指しする」に反転 |
| 5 | 新セルと既存の文章行が別判定で食い違う | 同じ純関数の verdict を両方が整形する(A-2) |
| 6 | 新セルを「異常時だけ描画」で実装 | A-3を契約テストに:「diag存在＋異常入力→セルが配列に**必ず**含まれる」を assert |
| 7 | lane-drop が未配線のまま「実装完了」と誤認 | wiringテスト＋**変異で赤**をDoDに。配線が複数箇所なら `toBe(n)` で数を断言 |
| 9 | ~~`VOICE_DIAG_FRESH_MS` が2ファイルに別値(60/90秒)~~ | ★**v0.1.1367 訂正: 一本化しない**。同名だが役割が別(healthCells=判定適用の境界・実効90秒 / voiceDiag=judgeValueFreshness の基準値・実効10分)。統合すると v0.1.1004 の誤発火が戻る。`VOICE_LIVE_JUDGE_WINDOW_MS` へ改名して衝突のみ解消済 |
| 10 | 鮮度判定に rAF/performance.now 由来の時刻を混ぜる | 比較は「書き手 Date.now vs 読み手 Date.now」のみ。`ts` の生成元を(要確認)し契約テストで固定 |
| 2 | 新セル自身が化石値で色を出す | §Dの統一規則を各セルの**最初の分岐**に置く(判定より先に鮮度) |
| 3 | lane-drop が候補数履歴だけ見て実DOMとずれる | 既存の `domShrinkCount` 優先を維持。文言に供給元を必ず含める |
| 8 | voiceセル群が拡張内部の異常を先に見せる | `voice-engine` を群の先頭に固定し、bad時は下流セルを na に連動 |
