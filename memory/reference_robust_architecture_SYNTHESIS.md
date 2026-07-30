# reference: 大配信激重の根治アーキテクチャ設計書（SYNTHESIS）

> **設計=Fable(claude-fable-5) / 会議素材=council 6体(批判2+統合) / 地雷マップ+裏取り=司令塔Claude(Opus 4.8)**
> **3段構えワークフロー(/council-fable)の手順2の産物 / 2026-07-07**
> 対象: Chrome拡張「追憶のきらめき」v0.1.1100。大配信で全機能(コメント送信/スクショ/DL/診断)が激重・応答不良になる問題の**アーキテクチャ根治**。実装は次段(別モデル)。着手は `HANDOFF-robust-architecture-IMPL.md` を読む。

## 司令塔による実在裏取り結果（2026-07-07・採用前チェック）

Fableの主張するファイル/関数/キー/定数を実コードで確認した。**全て実在確認済み**:
- ✅ `unlimitedStorage` / `alarms` / `offscreen` 権限 = extension/manifest.json:14,17,21（→512KBは自己申告cap・quotaではない／SW-alarm publisher実現可能）
- ✅ `KEY_LIVEVIEW_PUBLISH_PAYLOAD = 'nls_liveview_publish_payload_v1'`（storageKeys.js:563）を status-entry.js:1663 が書き、**live-view-entry.js:257 の onChanged 購読が newValue を複製配達**（ファンアウト増幅は実在）
- ✅ jsonBlob に `statusReport = fullText` を同梱（status-entry.js:1586）= 構造データ＋本文の二重持ち（≒バイト2倍）は実在
- ✅ `laneMirror.js:30 LANE_MIRROR_MAX_JSON_BYTES = 512*1024` の cap 半減パターン（pruneはしごの手本）実在
- ✅ voice合成は**非同期fetch**（voicevoxClient.js `fetchWithTimeout` / voicePlayer.js `await this.fetchSynthesizeVoice`）= 3055msはawait待ちでイベントループ非占有（F-3の裁定は正しい）
- ✅ `min-gap 3000` 定数（status-entry.js:1657）= MVPの「3000→12000」は実在の1行変更
- ✅ 再利用ヘルパ4種実在（diagFlushThrottle.js / inFlightGuard.js / storageOpTimeout.js / liveViewPublishSignature.js）、`shouldAutoPublish`（autoPublishDecision.js:43）実在

---

## A. 単一根本原因の確定

### A-1. 二大仮説の実コード判定

**仮説1「voiceのメインスレッド専有がpostMessage受信を飢餓させる」→ 主犯ではない(実コードが否定)。**

- `src/lib/voicePlayer.js` の合成は `fetchSynthesizeVoice`(`src/lib/voicevoxClient.js:305-323`)= **`fetchWithTimeout` による非同期fetch(8秒タイムアウト付き)**。実測3055ms(voiceDiag.lastSynthMs、voicePlayer.js:315-325 で計測)は **await待ち時間であってイベントループの占有時間ではない**。await中のメインスレッドは空く。
- voice がメインスレッドに載せる仕事は `new Blob([wav])`+`Audio` 生成(voicePlayer.js:339-342)程度=1件あたり数十ms級。キューは max 8 で有界(voicePlayer.js:469)、先読み深さも動的有界(`resolveVoiceSynthDepth`)。
- **ただし無罪ではない**: VOICEVOX は同一PC上の別プロセスで CPU コアを食う。合成3055ms→8.2秒(memory: status-congestion-freeze)は「VOICEVOXが遅い=PC全体のCPU競合が激しい」の**温度計**であり、全体を遅くする**増幅器**ではあるが、13秒滞留の**機序**ではない。

**仮説2「cap漏れの単一大キー」→ 実在する。犯人キーを特定した。**

- 犯人 = **`KEY_LIVEVIEW_PUBLISH_PAYLOAD`**(status-entry.js:1652-1668 が書く `{ jsonBlob, ingestKey, viewToken, appOrigin, savedAt }`)。
- jsonBlob の中身(status-entry.js:1540-1566): overview+livesData+fastDiag+laneMirror+statCardsMirror+northStarMirror+topSupporters+commentTimelineMirror、**さらに同じ内容をテキスト化した statusReport(フル状態速報本文)を1586行目で丸ごと同梱**=構造データと本文の**二重持ちでバイト数ほぼ2倍**。
- **512KBは chrome.storage の quota ではない**。manifest に `unlimitedStorage` があり(extension/manifest.json:14)、local quota は事実上無制限。487KB/512KB(95%) は `src/lib/liveviewPublishSelfDiag.js:239-241` の**自己申告cap(sizeCap = 512*1024)に対する計測値**。つまり「容量が溢れて set が失敗する」問題ではなく、**「0.5MB級の単一キーを高頻度で往復させている」流量問題**である。
- cap漏れの構造: `laneMirror` は自前の 512KB 半減ガードを持つ(src/lib/laneMirror.js:30、popup-entry.js:7178)が、**それらを束ねた jsonBlob 全体には計測(selfDiag)だけあって強制(prune)が無い**。95%はこの「束ねた層のcap欠落」の数字。

### A-2. 真の主犯(1つに絞る): **ジャンボキーの高頻度storage往復が browser process の storage/IPC 経路を輻輳させ、両側イベントループへの配達を滞留させる**

13,475ms の計測区間を実コードで確定した:

- 起点 = content script(**pageプロセス**)が postMessage 送信時に打つ `sentAt`(content-entry.js:3855)。
- 終点 = popup iframe(**拡張プロセス**)の `repaintStoryUserLaneWithInstantPushBuffer` 完了(popup-entry.js:6002-6006)。
- 受信ハンドラ `handleInstantCommentPushMessage`(popup-entry.js:6031-6063)は同期・軽量(nonce照合+shape検証+300件capのmerge+diff-skip再描画)。paint実測74ms・集計0ms。
- **よって13秒の大半は「ハンドラが呼ばれるまでの配達待ち」**。chrome-extension:// のインラインiframeは OOPIF であり、page→iframe の postMessage は browser process 経由でルーティングされる。配達を遅らせられるのは (i) pageプロセスのイベントループ渋滞、(ii) 拡張プロセスのイベントループ渋滞、(iii) browser process の IPC/storageバックエンド渋滞、の3つだけ。
- **同型の前例が既に実証済み**: v0.1.1062(memory: status-congestion-freeze-2026-07-04)で「状態ページの read 頻度を下げただけで Chrome **全体**のフリーズが緩和」した。拡張内のJSが速い/遅いの話ではなく、**storageトラフィックの総量が browser process を詰まらせると、無関係な postMessage 配達や入力まで巻き添えになる**ことが実測で確認されている。read側は v1062 で対策済み。**残っていたのが write 側最大の流量 = KEY_LIVEVIEW_PUBLISH_PAYLOAD** である:
  - 487KB × min-gap 3秒(status-entry.js:1657。配信中は鏡の capturedAt が数秒ごとに動くため軽量シグネチャ(liveViewPublishSignature.js)はほぼ毎回通過) ≒ **書込 9.7MB/分**。
  - さらに `chrome.storage.onChanged` は set のたびに newValue を購読中の全コンテキスト(live-view-entry.js:258 の購読、status自身、popup)へ**複製配達**する= set 1回あたり実質 0.5MB×(1+購読数) のシリアライズ/デシリアライズ/IPC。**合計 ~20-30MB/分級の定常トラフィック**。
  - 大配信ではここに backfill 書込・コメント本体の flush 書込が重なり、LevelDB/IPC のサービスレートを超えた瞬間に待ち行列が伸びる(=「重い7.7秒はstorage往復輻輳」のメモリと一致)。

### A-3. 各症状への寄与の分解

| 症状 | 主因 | 副因 |
|---|---|---|
| 表示遅延13,475ms | (iii) browser process 輻輳による postMessage 配達滞留 | (i) 大配信のpage自体の重さ / (ii) statusタブの2秒tick長タスク |
| jsonBlob 95% | jsonBlob束ね層のcap欠落 + statusReport二重同梱(≒バイト2倍) | livesData/commentTimelineMirror の成長 |
| publish 45分停止 | status.html が非表示タブとして Chrome にスロットリング/凍結される(publish は renderAll 末尾 status-entry.js:1602 でしか呼ばれない=**ページの生存に publish が人質**) | (iii) の輻輳で tick 自体が延びる |
| voice合成3-8秒 | VOICEVOX プロセスの CPU競合(温度計) | — |

**結論**: 主犯は1つ=「**0.5MB級ジャンボキーの3秒間隔往復+onChangedファンアウトによる storage/IPC 輻輳**」。voice は増幅器(対象外)、publish停止は「publishがstatusページの生存に人質」という**独立した設計欠陥**として別途1手で切り離す。ただし (ii) 拡張プロセス側の渋滞説も**計器で棄却できるまで生かしておく**(Phase 0 で機械判定する。安直な単一犯人像で計器を省かない)。

---

## B. 統合アーキテクチャ

「不具合が起きにくい完全な状態」= **流量が常時計測され・ジャンボキーが物理的に存在できず・publishがページ生存から独立し・長タスクが予算内に収まる**状態。コンポーネントは4つ、すべて既存パターンの流用/拡張で薄く作る。

```
[content(page世界)] --postMessage(即時プッシュ・不変)--> [popup iframe]
      |                                                       |
      | 計器①: deliveryGap/paintGap 分離(要新設・1行)          |
      v                                                       v
[chrome.storage.local] <--計器②: 書込台帳(要新設)-- 全書き手が経由(safeStorageLocal流用)
      ^
      | 流量制御③: publishLiveViewPublishPayload の min-gap 3s→12s + pruneはしご(laneMirror半減パターン流用)
      |
[status.html 2秒tick] --jsonBlob組立(dirty-skip④で断食)--> KEY_LIVEVIEW_PUBLISH_PAYLOAD
                                                              |
[SW + chrome.alarms] --生存分離⑤: statelessに読んでPOST(live-view-entry.js:145-159のパターン流用)--> ③WEB
```

- **(a) storageバッチget+非同期書込キュー「新規に何が要るか」**: 汎用書込キューは**要らない**(diagFlushThrottle が既にその実装であり、per-tick診断書込は全部そこを通っている)。新規に要るのは2点だけ — **①流量の可視化(書込台帳)** と **③ジャンボキー1本の頻度/サイズ制御**。キューの再発明はしない。
- **(b) 残るcap漏れ源のリングバッファ化**: cap漏れは配列ではなく**束ね層(jsonBlob)**。リングバッファでなく **pruneはしご**(サイズ超過時に低価値セクションの行数を段階的に半減)が正しい形。laneMirror.js:30 の「512KB超でcap半減・最大2回」の実証済みパターンを jsonBlob 組立側に移植する。
- **(c) 512KB常時マージン確保**: pruneはしごの発動閾値を 448KB(87.5%)に置き、常時 12%以上のマージンを機械的に保証する。IDBへ逃がすのは**やらない**(このキーの本質は「③WEBへPOSTする一時ペイロード」であり永続でない。頻度とサイズを絞れば十分で、IDB移設はoffscreenハンドル経由の新配線=過剰)。
- **(d) voice合成のメインスレッド分離**: **不要と裁定**(A-1 の通り fetch は既に非同期でメインスレッドを専有していない。offscreen document は同一拡張プロセス=同一メインスレッド共有であり、移しても得るものが無い。詳細は F)。
- **(e) 障害分離**: publish を SW+alarms の stateless ワーカーへ(⑤)。status.html が凍結・輻輳・クラッシュしても ③WEB は更新され続ける。逆に SW が死んでも status ページ側の既存 publish(maybeAutoPublishStatusSnapshot)が残るので二重フェイルセーフ。

---

## C. 具体機構

### C-1. 計器① 配達/描画ギャップ分離(Phase 0・要新設だが実装は各1行)
- `handleInstantCommentPushMessage`(popup-entry.js:6031)冒頭で `handlerAt = Date.now()` を取り、`lastDeliveryGapMs = handlerAt - sentAt` を **既存の `instantPushDiagFlusherReceived.note()`**(popup-entry.js:5905-5913、diagFlushThrottle **流用**)に積む。EMA は既存 `computeInstantPushGapAverage`(instantCommentPush.js:193)を**流用**し `_instantPushAvgDeliveryGapMsLocal`(要新設・メモリ変数1つ)で追う。
- 既存の sentAt→paint 完了ギャップ(popup-entry.js:6002-6006)は不変。**deliveryGap ≫ paintGap なら配達滞留(A-2主犯説)、逆なら拡張プロセス長タスク説**が機械的に確定する。

### C-2. 計器② storage書込台帳 `storageWriteLedger`(要新設・Phase 0)
- `src/lib/safeStorageLocal.js` の set ラッパに「キー名 → {回数, 概算bytes(JSON.stringify(value).lengthは重いので**呼び出し側申告 or 上位5キーのみサンプリング**)}」をメモリ累積するフックを1つ足す。storage への書き出しは **diagFlushThrottle 流用**(10秒flush・変化なければsetしない)。status:live に「書込上位5キー: bytes/分」を1行出す。
- これが G の全フェーズの合否を判定する**唯一の物差し**になる(嘘の緑を作らない)。

### C-3. 流量制御③ ジャンボキーの頻度+サイズ制御(Phase 1 = MVP)
- **頻度**: `publishLiveViewPublishPayload`(status-entry.js:1652)の min-gap 定数 `3000` → `12000`。既存の軽量シグネチャskip(liveViewPublishSignature.js・P4済)はそのまま**流用**(変化なしtickではsetゼロのまま)。
- **サイズ(pruneはしご・要新設関数 `pruneLiveViewPublishBlob`)**: set 直前に `JSON.stringify(blob).length` を測り(12秒に1回だけなので許容)、448KB超なら次の順で削る:
  1. `commentTimelineMirror` の rows を半減(体感影響最小・正規表示はpopup側にある)
  2. `topSupporters.rows` 10→5
  3. `statusReport` を末尾から切り詰め+末尾に「※容量超過のため切詰め」を付記
  - **嘘つかない原則(perfect-parity-diag と同じ)**: 削ったら `jsonBlob.snapshotMeta.pruned = ['commentTimeline/2', ...]` を必ず残し、liveviewPublishSelfDiag がそれを1行表示する。
  - パターンの手本 = laneMirror.js の「JSON 512KB超でcap半減・最大2回」を**そのまま流用**。
- **リングバッファ上限の決め方**: 新規のリングバッファは作らない(既存capで足りている: instantPushBuffer 300 / commentIngestLog 500 / voiceQueue 8)。pruneはしごの閾値だけが新しい数値で、`448*1024`(=cap の 87.5%。1段prune後に再成長しても次の12秒まで超えない余白)とする。

### C-4. 生存分離⑤ SW-alarm stateless publisher(Phase 2・要新設)
- `extension/background.js`(SW)に `chrome.alarms.create('nls-web-publish', { periodInMinutes: 1 })`(alarms 権限は manifest 済み)。
- ハンドラは**毎回ゼロから**: `chrome.storage.local.get(KEY_LIVEVIEW_PUBLISH_PAYLOAD)` → `savedAt` が新鮮(<3分)かつ前回POSTから60秒以上(判定は既存 `shouldAutoPublish` 純関数を**流用**、`publishOutcomeRec` を読む)なら `fetch(appOrigin + '/api/status', { method:'POST', body: JSON.stringify({ ...jsonBlob, v: viewToken }) })`。**live-view-entry.js:145-159 が既に実証している read+POST パターンの丸写し**(再構築しない=byte一致原則も維持)。
- **SW~30秒死対策(会議批判1への回答)**: 状態を一切持たない。alarm→get→POST→終了。flush-on-suspend が要る「未flushキュー」がそもそも存在しない設計にする。POST結果は既存の publishOutcomeRec 記録関数へ(ページ側と同じキー=二重送信は shouldAutoPublish の lastSentAt 判定で自然に排他)。
- リトライ(会議批判3への回答): 失敗時は**次のalarmまで何もしない**(密ループ禁止。1分間隔alarm自体が指数バックオフの下限として十分)。

### C-5. tick断食④ fullText の dirty-skip(Phase 3)
- renderAll(status-entry.js:1575-1586)は**変化が無くても毎2秒 `buildAiShareFullText` でフル本文を再組立**している。既存の `_lastLivesSig`/`_lastHealthSig`(status-entry.js:300-305)と同型の signature-skip を**流用**: `buildLiveViewPublishSignature(jsonBlob)`(既存・軽量)が前回と同じなら fullText 再組立・textarea代入・publishLiveViewPublishPayload・maybeAutoPublish を丸ごとスキップ。
- 併せて renderAll の safeSection 間に `await scheduler.yield()`(未対応なら `setTimeout 0`)を挟むチャンク化(要新設・数行)で、拡張プロセスの長タスクを50ms予算に分割する — **ただし Phase 0 の計器で「paintGap側が大きい」と出た場合のみ実施**(出なければ着手しない=過剰設計の自制)。

---

## D. 障害分離の具体ロジック

**守るべき即時性 = ①コメント送信ボタンの応答 と ②即時プッシュ表示。線を引く場所は「経路にstorageとジャンボタスクを混ぜない」の1点で、優先度付き汎用タスクキューは作らない(F参照)。**

1. **即時プッシュ経路は既に隔離済み**(content→iframe直接postMessage・storage非経由・受信ハンドラ軽量)。本設計はこの経路に**一切手を入れない**。詰まりの原因は経路の外(輻輳)にあるので、外を掃除する(C-3)のが正しい隔離。
2. **voiceが3秒「合成待ち」してもボタンが即応する理由(機構)**: 合成はawait(イベントループ非占有)・再生はAudio要素(コンポジタ/メディアスレッド)・キューはmax 8で有界。voice経路がメインスレッドに置く同期仕事はBlob生成の数十msのみ。**追加機構は不要**であり、これを「隔離のためにoffscreenへ」動かすのは偽の安心(F-3)。
3. **statusページの重さがpopup iframeを巻き添えにしない**: 同一拡張プロセスのメインスレッド共有が疑われるため、(a) C-5のチャンク化で長タスクを分割、(b) そもそもの仕事量を C-3/C-5 で1/4以下に減らす。「別プロセスに逃がす」選択肢は拡張ページ間には存在しない(process-per-extensionモデル)ので、**仕事を減らすことが唯一の隔離**。
4. **publishがstatusページ凍結の巻き添えにならない**: C-4 で SW-alarm へ。status凍結・輻輳・タブ閉じの3障害すべてから publish が独立する。
5. **fail-closed**: 台帳(C-2)とpruneはしご(C-3)は診断/自衛専用で、例外時は catch して本体動作(記録・表示)に影響させない — diagFlushThrottle と同じ「計器は本体を妨げない」契約(voicePlayer.js:65 と同文)。

---

## E. MVP(1つだけ作るなら)

**MVP = C-3「ジャンボキー流量制御」(min-gap 3s→12s + pruneはしご)+ 抱き合わせでC-1の計器2行(挙動不変)。1 patch。**

**「その1手が本当に13秒滞留を消すか」の論証(実測数字):**

1. 現状流量: jsonBlob 実測487KB。配信中は鏡のcapturedAtが数秒ごとに更新→軽量sigがほぼ毎回変化→min-gap 3秒ごとにset ≒ **9.7MB/分の書込**。onChanged購読(live-view-entry.js:258 ほか)への newValue 複製配達を含めると **~20-30MB/分**が browser process の storage/IPC 経路を常時通過している。これは大配信時の全書込の中で単一キーとして最大の定常flowである(Phase 0 台帳で機械確認)。
2. MVP後: 12秒gap+prune(487KB→≦448KB)で **2.2MB/分(-77%)**。onChangedファンアウト込みで20-30MB/分→5-7MB/分。
3. これが13秒を消すと信じる根拠は**同一機序の実測前例**: v0.1.1062 で「状態ページのread頻度を下げる」だけでChrome全体フリーズが緩和した(memory: status-congestion-freeze-2026-07-04)。read側とwrite側は同じLevelDB/IPCバックエンドを通る。read削減で効いた蛇口の、残る最大のwrite側を同率以上に絞る。
4. **正直な限界と保険(批判役への回答)**: 13,475msの滞留点が「配達」でなく「pageプロセス自身の重さ」だった場合、この1手では消えない。だからMVPに計器C-1(deliveryGap/paintGap分離・各1行・挙動不変)を同梱し、**リリース直後の実配信1本で機械判定**する: `avgDeliveryGapMs` が支配的→本設計の主犯説どおり(MVPの効果がそのまま出る)。`paintGap` 側が支配的→Phase 3(tick断食+チャンク化)を繰り上げる。**どちらに転んでも次の1手が数値で確定する**構造にしてあり、「直ったはず」で終わらない。
5. **成功の機械判定**(status:live): 大配信中に (i) instantPushDiag の `avgGapMs` 13,475→**2,000ms未満**、(ii) 書込台帳の `KEY_LIVEVIEW_PUBLISH_PAYLOAD` が **2.5MB/分以下**、(iii) jsonBlobサイズ行が **87%以下**。
6. **ロールバック**: min-gap 定数 `12000→3000` を戻す1数値+pruneはしご閾値を `Infinity` にする1数値。フラグ運用不要の素朴さで戻せる。

---

## F. 捨てた案と理由

1. **Reduxストア風の全面状態管理刷新** — 却下。paint 74ms・集計0msが実測で正常=状態管理は壊れていない。壊れていない層を作り直すのは費用(全ページ書換+ちらつき7版クラスの回帰リスク)対効果(ゼロ)が成立しない。
2. **SW中央集権State Manager(全書込をSWキュー経由に)** — 却下。MV3 SWは~30秒で死ぬ(会議批判1)。キューを持つSWは flush-on-suspend・復活時再送・二重書込防止の3点セットが必須になり、diagFlushThrottleで既に解決済みの問題を難しく作り直すだけ。SWに許すのは C-4 の**stateless**な read→POST のみ。
3. **voiceのoffscreen移設** — 却下(会議素材にあったが裏取りで根拠消滅)。(i) 合成は既に非同期fetchでメインスレッドを専有していない(voicevoxClient.js:305-323)。(ii) 合成コストの実体はVOICEVOX**別プロセス**のCPUであり、拡張内のどこへ移しても消えない。(iii) offscreen documentは同一拡張プロセス=メインスレッド共有で、そもそも「別スレッド」ではない。(iv) offscreenは拡張ごと1枚でIDBハンドル専用(offscreen-entry.js)+chrome.storage不可という制約に、音声再生キューまで相乗りさせると新たな単一障害点を作る。
4. **即時プッシュへの書込キュー導入** — 却下。この経路はstorage非経由(instantCommentPush.js冒頭の設計裁定)であり、書込キューを入れる場所が存在しない。当初仮説の残骸。
5. **jsonBlobのIDB退避** — 却下。永続データでない一時ペイロードにoffscreen経由のIDB配線を新設するのは過剰。頻度とサイズの2ノブで足りる。
6. **優先度付き汎用タスクキュー** — 却下。守るべき2経路(送信ボタン/即時プッシュ)は既に構造的に軽く、必要なのは「重い側を減らす」ことだけ。汎用キューは全呼び出し箇所の書換=ちらつき7版級の地雷原を歩く割に、輻輳(browser process側)には無力。

---

## G. 段階的移行プラン(1変更=1patch・各段ロールバック可)

| Phase | patch | 内容 | 機械的完了判定(status:live) | ロールバック |
|---|---|---|---|---|
| **0** | v+1 | 計器のみ: C-1 deliveryGap分離 + C-2 書込台帳(diagFlushThrottle流用) | 新フィールド `avgDeliveryGapMs` と「書込上位5キー bytes/分」が表示され、**既存の全数値が不変**(挙動不変の証明) | 計器2行をrevert |
| **1(MVP)** | v+2 | C-3: min-gap 12000 + pruneはしご448KB + pruned明記 | 大配信で (i) `KEY_LIVEVIEW_PUBLISH_PAYLOAD` 書込 ≦2.5MB/分 (ii) jsonBlob ≦87% (iii) `avgGapMs` <2,000ms (iv) pruned発動時は明記行が出る | 定数2つ(12000→3000 / 448KB→Infinity) |
| **2** | v+3 | C-4: SW-alarm stateless publisher(shouldAutoPublish・live-viewパターン流用) | statusタブを**非表示のまま**1時間放置して ③WEBのpublish鮮度(publishOutcomeRec.at起点の経過表示)が常に**90秒未満**=45分停止の再発ゼロ | alarm作成1行をrevert(ページ側publishは温存されているので即復旧) |
| **3** | v+4 | C-5: fullText dirty-skip(_lastLivesSig同型) | refreshPerf の stepMs で「AI共有テキスト」stepが変化なしtickで **0-1ms**、tick totalMs p95 が半減 | signature判定1行をrevert |
| **4(条件付)** | v+5 | Phase 0台帳の上位が別キー(例: コメント本体flush)だった場合のみ、そのキーへ同じ「頻度+はしご」を適用。Phase 0で `paintGap` 支配と出た場合は renderAll チャンク化を代わりに実施 | 台帳上位キーの bytes/分が半減 / paintGap側なら `avgGapMs` <2,000ms 達成 | 各1定数 |

全phase共通: bump 3点セット(`npm run verify:bump`)・反映3手順(pull→拡張リロード→watchタブF5)併記・配信視聴中の copy:ext 禁止(AGENTS.md §12.5)。

---

## H. 地雷と回避策

- **diff-skip描画(popup-entry.js:5964 `repaintStoryUserLaneWithInstantPushBuffer`)**: 即時プッシュ経路には一切触れない(計器C-1はハンドラ冒頭の時刻取得のみ)。`paintStoryUserLaneCoalesced` を呼ぶ変更は本設計に存在しない。
- **nonce検証(instantCommentPush.js:65-76)**: 受信経路無変更。プッシュ行がstorage/記録/演出に触れない契約もそのまま(C-1の計器はdiagFlushThrottle経由の診断値のみ)。
- **freshnessガード(reportPreviewKey.js ほか)**: min-gap 3s→12s で ③WEBの鮮度は最大9秒古くなるが、鮮度判定は `snapshotMeta.capturedAt`(実データ時刻)基準なので**嘘の新鮮表示にはならない**(古ければ古いと出る=誠実表示は不変)。
- **in-flightガード(inFlightGuard.js・status-entry.js:257)**: 変更なし。SW-alarm publisher は get→POST のみでこのガードの対象readに触れない。
- **診断書込throttle(diagFlushThrottle.js)**: 新規per-tick書込(C-1計器/C-2台帳)は**すべてこれを通す**(直接setを1つも増やさない)。
- **offscreen常設IDBハンドル(offscreen-entry.js)**: 一切触れない(voice移設案を却下したため接点ゼロ)。
- **鏡capの連動地雷(lane-limit-200-mirror-cap-parity-v1051-1052)**: pruneはしごが commentTimelineMirror/topSupporters の**行数**を削るときは `snapshotMeta.pruned` に明記し、liveviewPublishSelfDiag の突合(①vs③件数)が「prunedなら件数差を正常扱い」する分岐を同patchで入れる=嘘の🔴を作らない。
- **「消す側に計器を」の鉄則(story-userlane-churn-filllanetier-v1039)**: pruneはしご(=消す側)には発動回数カウンタを必ず付け、status:live に出す。
- **SW ephemeral(会議批判1)**: C-4はstateless設計で回避(キュー・未flush状態を持たない)。
- **同期リトライ密ループ禁止(会議批判3)**: 全新設コードのリトライは「次のalarm/次のflush周期まで待つ」のみ。setloopは書かない。
