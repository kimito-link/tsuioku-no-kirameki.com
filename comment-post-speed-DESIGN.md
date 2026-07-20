# comment-post-speed-DESIGN.md — 自分のコメント投稿の反応速度を速くする設計

> 設計=Fable(claude-fable-5) / 素材収集=会議ハーネス(クラウド3体成功・2026-07-19) / 裏取り=司令塔(Claude Code)
> 3段構えワークフロー(council-fable スキル)の手順2の産物。日付: 2026-07-19〜20。

## Context

ユーザーから「自分がコメントを打つ反応速度を速くしたい」という要望。状態速報の実測診断:

```
コメント送信: 試行14(ok14/失敗0/締切0) / 最終39238秒前(ok)
  → 送信応答 直近1.0秒 / 画面実着(echo) 直近2.7秒(平均2.2秒) / フレーム試行累計14 / 取消0
```

「送信応答」(1.0秒)= popup→content script→DOM操作完了確認までの往復時間。
「画面実着(echo)」(2.7秒)= 押下時刻から、自分の投稿がNDGR実フィード経由で「本物のコメント
一覧データ」として確認できるまでの時間。

## 確定事実(司令塔がコードを実際に読んで裏取り済み)

1. **送信区間(1.0秒)は既に調査済み**(v0.1.604、コミットメッセージ「明らかな過剰遅延は
   見つからなかった」「典型パスは早期returnが効くため影響ゼロ・70-150ms程度」)。状態速報の
   「直近1.0秒」は単発サンプル(EMAでない)で最悪ケースを引いた可能性が高い。
2. **echo(2.7秒)の下限は多段非同期パイプライン由来**: NDGR受信→150ms間隔バッファ
   (`ndgrFlushMs: 150`)→storage書き込み最小1.5秒間隔(`coalescerMinMs: 1500`、
   `burstThreshold: 0`で早期flush無効化)→popup側`chrome.storage.onChanged`かポーリング
   (3秒/30秒)を待つ。
3. **`coalescerMinMs`は速度を犠牲に安定性を取る方向で一貫して緩和されてきた**(初期300ms→
   v0.1.472で800ms「長尺配信でstorage全件read/writeがメインスレッド圧迫→スクロール重さ」→
   v0.1.489で1500ms+burstThreshold無効化「高流量時のO(N)マージ頻発によるフリーズ
   (『ページが応答しません』)を防ぐため」)。単純な間隔短縮はこの退行を再発させるリスクが高い。
4. **【設計フェーズで追加裏取り・実装済みと判明】自コメの楽観的表示(pending-self)は既に実装済み**:
   `appendSelfPostedComment()`(`popup-entry.js:5194`)が押下と同時に`selfPostedRecentsCache`
   (メモリ)を更新し、`buildDisplayCommentEntries()`(`popup-entry.js:5625`)がこのキャッシュから
   `pending-self:`エントリを合成してレーンに表示する経路が既にある。
5. **【追加裏取り】ロールバックも既に実装済み**: `revertLastSelfPostedComment()`(`:5226`)+
   `shouldRevertOptimisticPost()`(`src/lib/commentPostDeadline.js:59`)。「明確な失敗のみ
   取り消す/締切超過(不明)は取り消さない」という裁定コメント付き(`:20650-20652`、
   「ニコ生には届いている可能性があるコメントをレーンから消すと『一瞬載って消える』症状に
   なるため」)。
6. **【追加裏取り・核心】送信成功判定も既に実装済み**: `requestPostCommentToOpenTab()`の戻り値
   `result.ok`(`:20612`、`{ok:true}`=content script側のDOM操作完了確認)がそのまま使える。
7. **【追加裏取り・本設計の核心】`appendSelfPostedComment()`呼び出し直後(`:20598`)に、レーンの
   再描画要求は一切無い**。次の再描画は「`storage.set`往復→自分の`onChanged`発火→
   `scheduleCoalescedStorageRefresh()`(`:18608`)→`KEY_SELF_POSTED_RECENTS`は高頻度キー扱い
   (`:18599`、`isHighFrequencyCommentRelatedStorageKey`)→**450msスロットル**
   (`createCoalescedRefreshScheduler`、`popupStorageRefreshCoalesce.js`、既定
   `throttleMs: 450`、`popup-entry.js:18079-18080`でインスタンス化)→`safeRefresh()`全件
   refresh完了後」という経路を待つ。つまり「押下→自コメがレーンに見える」までの現状の遅延は
   **storage往復+最大450ms+refresh所要**の合算。

## A.【最重要・裁定】①送信区間 vs ②表示反映区間、どちらから着手すべきか

### 結論

**②表示反映区間から着手する(会議の合意を採用)。ただし攻撃対象を再定義する — 縮めるのは
「echo 2.7秒(実着)」ではなく「押下→楽観表示がレーンに描画されるまで」である。**

### 根拠

1. ①送信区間(1.0秒)は事実1の通り調査済み・典型パス70-150ms・伸びしろ薄い。
2. echo 2.7秒の下限は構造的(NDGRサーバ往復+150msバッファ+1.5秒coalescer+storage往復+
   450msスロットル+refresh)。この経路の短縮は事実3の地雷帯(フリーズ退行)に踏み込む。
   しかもechoは「本物の到着確認」という計測上の概念であり、ユーザー体感とは別物(pending→
   本物の置換は本文が同一なので見た目上ほぼ不可視)。
3. ユーザー体感の「反応速度」を決めるのは、事実7で判明した楽観表示描画遅延(現状 storage往復+
   最大450ms+refresh)。ここは**地雷帯の外**(coalescerMinMs/ndgrFlushMsに触れずに縮められる)で、
   理論限界(refresh1回分の所要のみ)まで縮められる。

会議への裁定: 「②に集中」は正しいが、会議は「②=echo 2.7秒を縮める」と解釈しており、それは
地雷帯への突撃になる。**②の中の非地雷部分(楽観表示の描画トリガ)だけを撃つ。**

## B. 自コメの楽観的表示の具体設計

### 結論

**新規の楽観表示機構は作らない。既存のpending-self機構(事実4)に「押下直後の即時再描画」を
1本足すだけ。送信成功判定も新規に作らない — 会議の`isSendSuccess()`ダミー実装は既存コードが
既に解決済み(事実6)。**

### 根拠(会議の穴の検証)

- 送信成功判定は`requestPostCommentToOpenTab()`の戻り値`{ok:true}`として既に存在する。
  会議(llama-3.3-70b)の`isSendSuccess(){return true}`は「既にあるものを再発明しかけて
  途中で切れた」だけ。
- 会議(gpt-oss-120b)の「**送信成功確認後にのみ即時描画を確定させる**」案は既存実装より
  **劣化**する。成功確認(送信応答)は直近1.0秒かかるので、それを待ってから描画すると体感が
  1秒余計に遅れる。既存実装は「押下と同時に楽観追記→明確な失敗時のみrevert、締切超過(不明)は
  消さない」という、より洗練された裁定を既に持っている。**この裁定を維持する。**

### 具体案

#### B-1. `src/lib/popupStorageRefreshCoalesce.js`に即時パスを追加(純関数・TDD)

```js
/**
 * @param {() => void} runRefresh
 * @param {{ floorMs?: number }} [opts]  // 既定150ms: 即時パス同士の最小間隔(連打・音声自動送信の暴発防止)
 * @returns {boolean}  // 実行したらtrue / floor内でスキップしたらfalse(既存trailingに委ねる)
 */
scheduler.scheduleImmediate(runRefresh, opts)
```

- 挙動: 前回paintから`floorMs`以上経っていれば**スロットル(450ms)を無視して即時`runRefresh()`**し
  `lastPaintAt`を更新(→直後に来る自分のstorage.onChanged由来のscheduleは自然にtrailingへ
  畳まれ、二重refreshにならない)。floor内なら既存のtrailing予約に委ねる。
- 既存`schedule()`の挙動は1バイトも変えない(既存テスト無変更で緑のまま)。
  `popupStorageRefreshCoalesce.test.js`に`scheduleImmediate`のテストを先に追加
  (即時実行/floorスキップ/`lastPaintAt`更新で後続scheduleがtrailing化、の3点)。

#### B-2. `submitComment()`への配線(popup-entry.js)

```js
if (lvPost && toggle.checked) {
  void appendSelfPostedComment(lvPost, text);   // 既存: メモリcacheは同期更新済み
  optimisticLogged = true;
  requestSelfCommentInstantPaint();             // 新規: この1行が本設計の本体
}
```

- `requestSelfCommentInstantPaint()`は`coalescedRefreshScheduler.scheduleImmediate(() =>
  safeRefresh())`を呼ぶ薄い関数。
- `document.hidden`ゲート(`decideVisibilityAction`)は既存`scheduleCoalescedStorageRefresh`と
  同じ扱いにする(自分が押した直後のパネルは実質必ず可視なので実害なし・一貫性のため)。
- **描画は既存の`safeRefresh()`をそのまま使う。新しい描画パスは作らない**(v0.1.421/422
  パネル消失リグレッションの教訓、`popup-entry.js:18611-18613`)。
- `toggle.checked === false`(記録OFF)時は楽観追記自体が無い既存挙動を踏襲し、即時paintも
  発火させない。

#### B-3. (Phase 2候補・挙動変更あり・要ユーザー裁定) 入力欄の楽観クリア

現状、入力欄が空になり「コメントを送信しました」が出るのは`result.ok`後(`:20634`)=押下から
直近実測1.0秒後。連投時の「次を打ち始められるまで」はこれが律速。押下と同時にクリアし、
`shouldRevertOptimisticPost`が真の失敗時のみ`commentInput.value`を復元する案。**MVPには
含めない**(失敗時に文面が一瞬消えて戻るUXの是非はユーザー裁定が要る)。

## C. reconcile(本物への引き継ぎ)の設計

### 結論

**`reconcileStoredOwnPostedEntries`は一切変更しない。経路の置き換えも追加もしない。二重描画・
ID重複の新規リスクはゼロである。**

### 根拠

- 本設計は「どのpendingをいつ表示するか」を1ミリも変えない。変えるのは「表示が走るタイミング」
  だけ。pendingの生成(`buildDisplayCommentEntries`)と消費判定(`matchSelfPostedRecentsToEntries`
  の`consumedIndexes`)は同一の照合関数を共有しており、本物到着時にpendingが表示から除外される
  のとreconcileで`selfPosted`が焼き込まれるのは同じ判定に基づく。即時paintはこの機構をそのまま
  早回しするだけ。
- 会議(gpt-oss-120b)が懸念した「二重描画・ID重複」は、**会議が提案した『自コメ専用の分離
  キュー』を作った場合にのみ発生するリスク**である。既存機構への相乗りなら照合の正本は1つのまま。
- echo計測(`:16755-16772`)も無傷: reconcileの発火箇所・`consumedAts`の意味は変わらないので、
  既存の「画面実着(echo)」数値の連続性が保たれる(改善前後の比較が正しくできる)。

## D. 失敗時のロールバック設計

### 結論

**`revertLastSelfPostedComment`+`shouldRevertOptimisticPost`の既存裁定(明確失敗のみrevert・
締切超過は残す)をそのまま使う。追加するのは「revert直後の即時paint」1本だけ。**

### 根拠

現状、revertしてもレーンからpendingが消えるのは次のonChanged→450msスロットル→refresh後。
即時paintを入れて表示が速くなると、相対的に「失敗したのに載りっぱなしの時間」が目立つように
なるため、消す側も同じ即時化で対にする([[story-userlane-churn-filllanetier-v1039]]の
「消す/空にする側に計器も高速化も入れ忘れる」教訓の予防的適用)。

### 具体案

`:20654`(明確失敗)と`:20683`(例外)の`revertLastSelfPostedComment(...)`直後に
`requestSelfCommentInstantPaint()`を呼ぶ。scheduleImmediateのfloor(150ms)は送信往復
(≧数百ms)より短いので、実質必ず即時実行される。

## E. 地雷(coalescerMinMs緩和の歴史)との関係

### 結論

**既存間隔を一切変更せずに実現できる。`coalescerMinMs: 1500`/`ndgrFlushMs: 150`/
`throttleMs: 450`(既定値)のいずれも変更しない。**

| 定数 | 本設計での扱い | 理由 |
|---|---|---|
| `coalescerMinMs: 1500`(content) | 触らない | 他人コメのstorage配達の話。自コメ楽観表示はpopupメモリ内で完結し、この経路を通らない |
| `ndgrFlushMs: 150`(content) | 触らない | 同上。echo(実着)の下限には効くが、実着は攻撃対象外(裁定A) |
| `throttleMs: 450`(popup) | **既定値は触らない**。バイパス口`scheduleImmediate`を1つ開ける | バイパスの発火源は「ユーザー自身の送信操作」のみ=人間律速で本質的に有界(NDGR流量と無関係)。さらにfloor150msで暴発を機械的に抑止 |

リスク評価: 増える負荷は「自コメ1送信につきrefresh前倒し最大1回」。`lastPaintAt`を更新する
ため、直後のonChanged由来refreshはtrailingに畳まれ、**総refresh回数はほぼ不変(タイミングが
前倒しになるだけ)**。事実3の歴史(高流量時のO(N)マージ頻発によるフリーズ)は「イベント流量に
比例して書き込み/描画が走る」構造が原因だったのに対し、本設計の追加トリガは人間の送信レートに
比例するため、同型の退行は構造的に起きない。

## F. 新規診断計器の最小設計

### 結論

`commentPostDiag.js`に「楽観表示(押下→pendingがレーンに描画完了)」の直近/EMAを追加する。
既存のecho計測方式(EMA)を丸ごと踏襲。

### 具体案

- state追加(`makeInitialCommentPostDiag`): `lastOptimisticPaintMs: -1`,
  `avgOptimisticPaintMs: -1`, `instantPaintRuns: 0`(scheduleImmediateが実行された回数;
  floorスキップとの切り分け用)。
- **`buildCommentPostDiagSnapshot()`のフィールド列挙への追加を忘れない**(白リスト方式なので
  漏れると計器がサイレントに0固定→§I地雷1)。
- 計測方法(挙動変更ゼロで動く・即時paintの有無に依存しない):
  - `submitComment`の楽観追記時にmarkを積む: `_commentPostOptimisticMarks.push({ at })`
    (at=押下時刻。上限8件・TTL30秒でprune、メモリ有界)。
  - refreshのpaint完了直後に、今回表示されたpending-selfエントリのat集合とmarkを突合する
    純関数で消費:
    ```js
    // commentPostDiag.js に追加(純関数・TDD)
    export function takeOptimisticPaintSamples(marks, displayedPendingAts, nowMs)
    // → { samples: number[], remaining: Mark[] }  // 照合成立分のみsample化(嘘をつかない)
    ```
  - sampleは既存EMA(`computeCommentEchoAverage`)へそのまま通す。
- 状態速報の行(`buildCommentPostDiagLines`): 既存2行は不変。3行目を追加:
  ```
  → 楽観表示 直近0.4秒(平均0.5秒) / 即時paint 12回
  ```
- 配線確認: commentPostDiagはpopup系計器(popupが書きstatusが再表示する既存経路)なので、
  既存フィールドと同じsnapshot→status経路に乗せれば出る。出荷時に**実機コピペで新3行目が
  出ることを必ず確認**すること([[fastdiag-lite-is-the-printer-subset]]の同型事故予防)。

## G. MVP(最初の1歩)

### 結論

**MVP = Phase 0(計器のみ・挙動変更ゼロ)。次いでPhase 1(即時paint)。既存の「コメント送信」
セクション・echo計測には一切手を触れない。**

- **Phase 0(1コミット・patch1つ)**: §Fの計器を追加。既存state/行は不変、3行目追加のみ。
  →ユーザーの実配信で1回計測し、「押下→楽観表示」の現状値(予想: 0.5〜1秒台、PC重負荷時に
  悪化)を確定させる。**体感の犯人が本当にここか、を数字で裏取りしてから手術する**
  (診断ファースト)。
- **Phase 1(1コミット・patch1つ)**: §B-1/B-2/Dの即時paint。効果はPhase 0と同じ計器の
  before/afterで実証(期待: 楽観表示≦refresh1回分の所要=百ms台)。
- Phase 2(裁定待ち): §B-3入力欄の楽観クリア。
- 各Phaseとも出荷ゲートは`npm run verify:cc`一本+reality-checker。反映はユーザーの3手順
  (pull→拡張リロード→watchタブF5)必須。

TDD順序(Phase 1): `popupStorageRefreshCoalesce.test.js`にscheduleImmediateの3テスト→実装→
popup-entry配線、の順。

## H. 捨てた案と理由

| 案 | 出所 | 捨てた理由 |
|---|---|---|
| instantCommentPushパターン(content→iframe postMessage)を自コメに応用 | 会議(強い合意) | **輸送問題が存在しない**。instantCommentPushは「contentで生まれた他人コメをstorageを迂回してpopupへ運ぶ」機構。自コメはpopup内で生まれ`selfPostedRecentsCache`に既にある(事実4)。運ぶものがない |
| 自コメ専用高速キュー(OptimisticEchoQueue)・他コメstorageフローと完全分離 | qwen3.6-27b / gpt-oss-120b | 既存の`selfPostedRecents`+pending-self機構がまさにそれ。新キューは第2の正本を作り、二重描画・dedupe問題を新規に発生させる(過剰設計) |
| `isSendSuccess()`の新規考案 | llama-3.3-70b | `requestPostCommentToOpenTab`の`result.ok`として実装済み(事実6) |
| 送信成功確認後にのみ即時描画を確定 | gpt-oss-120b | 既存の「押下時楽観+明確失敗のみrevert」より体感が約1秒劣化する(§B根拠) |
| coalescerMinMs / ndgrFlushMsの短縮 | (会議の暗黙の含意) | 事実3。フリーズ退行の再発リスクが高く、そもそも楽観表示経路はこれらを通らないので短縮する必要がない |
| ①送信区間(1.0秒)の再攻略 | — | 事実1(調査済み・典型70-150ms)。直近1.0秒は単発サンプルで平均ではない |
| echo(2.7秒)そのものの短縮 | — | 実着の下限はNDGR+意図的coalescerで構造的。体感はechoでなく楽観表示が決める(裁定A)。echoは「本物の到着」を正直に測る計器として現状のまま残す価値がある |
| standalone 30秒ポーリングの短縮 | — | 楽観表示・本物到着とも主経路はstorage.onChanged(イベント駆動)。ポーリングは保険であり律速でない |

## I. 地雷と回避策

1. **`buildCommentPostDiagSnapshot`の白リスト漏れ** — 新フィールドを列挙し忘れると計器が
   永遠に-1/0のまま(サイレント)。回避: snapshotのラウンドトリップテスト(新フィールド入り
   state→snapshot→値が残る)を先に書く。
2. **状態速報に「出るはず」で出荷** — [[fastdiag-lite-is-the-printer-subset]]と同型。回避:
   出荷後の実機コピペで3行目の実在を確認してからクローズ。
3. **即時paintで新描画パスを作りたくなる誘惑**(paintだけ軽く呼ぶ等) —
   `buildDisplayCommentEntries`はrefresh経路内で`STORY_SOURCE_STATE`と同期しており、部分
   paintはv0.1.421/422型のパネル消失リグレッションの温床。回避: 必ず既存`safeRefresh()`を
   丸ごと使う。
4. **scheduleImmediateが`lastPaintAt`を更新し忘れる** — 直後のonChanged由来scheduleが
   leading判定で通り、1送信でrefresh2連発になる。回避: 「immediate実行後のscheduleは
   trailingに畳まれる」テストを必須化(§B-1の3点目)。
5. **revert側の即時paint入れ忘れ** — 「消す側」の対応漏れ
   ([[story-userlane-churn-filllanetier-v1039]]の鉄則)。表示だけ速くなり、失敗コメの残留が
   相対的に悪化する。回避: §DをPhase 1のスコープに最初から含める。
6. **`refreshGen`世代管理との衝突** — 即時refreshは既存`safeRefresh()`経由なので世代管理が
   そのまま効く。独自にrefresh内部を呼び分けないこと。
7. **大配信でrefresh1回自体が重い問題** — 即時化してもrefresh所要(重負荷時数百ms〜)が
   新たな下限になる。これはrobust-architectureの継続課題(コアread1バッチ化)であり
   **本設計のスコープ外**。Phase 0の計器がこの下限も可視化するので、次の攻撃対象の判断材料に
   なる。
8. **検証エージェント並走中のcommit禁止** — [[reality-checker-stash-detaches-head-2026-07-07]]。
   Phase 0/1ともreality-checker完了を待ってからcommit。

## J. コメント規約の具体例(改修ファイル: `src/lib/popupStorageRefreshCoalesce.js`の追記ブロック)

```js
/**
 * scheduleImmediate — 自コメ送信の「押下直後の即時再描画」専用バイパス。
 *
 * 背景(2026-07-19 comment-post-speed-DESIGN.md):
 *   自コメの楽観表示(pending-self)は appendSelfPostedComment で押下と同時に
 *   メモリ(selfPostedRecentsCache)へ入るのに、画面に出るのは
 *   storage.set 往復 → 自分の onChanged → 450ms スロットル → refresh 完了後
 *   だった。データは手元にあるのに配達を待っていた、が体感遅延の正体。
 *
 * 担う責務:
 *   - ユーザー自身の送信/revert 操作を起点とする refresh の前倒し実行(スロットル無視)
 *   - floorMs(既定150ms)による即時パス同士の最小間隔保証(連打・音声自動送信の暴発防止)
 *   - 実行時の lastPaintAt 更新(直後に来る onChanged 由来 schedule を trailing に畳み、
 *     1送信で refresh 2連発になるのを防ぐ)
 *
 * 担わない責務(正本を明記):
 *   - pending エントリの生成/消費判定 → buildDisplayCommentEntries /
 *     matchSelfPostedRecentsToEntries(popup-entry.js)が正本
 *   - 送信成功/失敗の判定 → requestPostCommentToOpenTab の result.ok と
 *     shouldRevertOptimisticPost(commentPostDeadline.js)が正本
 *   - 描画そのもの → runRefresh(=既存 safeRefresh)に委譲。新描画パスは作らない
 *     (v0.1.421/422 パネル消失リグレッションの教訓)
 *   - NDGR/coalescer 系の間隔(ndgrFlushMs 150 / coalescerMinMs 1500) → 一切触らない。
 *     この関数の発火源は人間の送信操作のみで、イベント流量に比例しない(coalescerMinMs
 *     緩和の歴史と同型のフリーズ退行にならない構造的根拠)
 *
 * ★注意: throttleMs(450ms)の既定値・schedule() の既存挙動は変えないこと。
 *   高頻度キー(NDGR由来)のバイパスにこの関数を流用してはならない。
 */
```

## 検証済み事実(司令塔による裏取り)

- `appendSelfPostedComment`(`popup-entry.js:5194`)・`revertLastSelfPostedComment`(`:5226`)・
  `buildDisplayCommentEntries`(`:5625`)、実在確認済み(コード実読)。
- `appendSelfPostedComment`呼び出し直後(`:20598`)に再描画要求が無いこと、実読で確認済み。
- `KEY_SELF_POSTED_RECENTS`が高頻度キー扱い(`:18599`)であること、実読で確認済み。
- `createCoalescedRefreshScheduler`の`throttleMs`既定値450(`:18079-18080`)、実読で確認済み。
- `coalescerMinMs`の変遷(300→800→1500、v0.1.472/v0.1.489)、git logで裏取り済み。
