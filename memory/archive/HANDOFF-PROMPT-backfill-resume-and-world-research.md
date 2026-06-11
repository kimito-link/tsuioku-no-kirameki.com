# 引継ぎ: 過去ログ backfill レジューム実装 + 世界調査結果（2026-05-29 深夜）

次に Claude Code を開いたらこの内容を**そのままコピペ**してください。

---

## コピペする内容（ここから）

```
おはようございます。前回セッション（2026-05-29 深夜・4.8 で会議駆動）の引き継ぎです。
過去ログ取り込みが一部の配信で途中%で止まる問題を追っていて、世界調査で真因と
正しい方向が判明し、次の一手（レジューム実装）の設計まで固めた状態です。

# 状況把握（まずこれを）

1. `git log --oneline -8` で master 確認（v0.1.455 まで入っているはず）
2. `gh pr list --base master` で open PR 確認（無いはず）
3. `git status --short --branch` でクリーン確認
4. memory/MEMORY.md 先頭エントリと、下記 2 つの reference を読む:
   - reference_backfill_honest_completion_and_completion_rate.md（過去ログの停止真因の歴史）
   - reference_ndgr_backward_packedsegment_protocol.md（crawl 本体のアルゴリズム）

# 前回の到達点（master = v0.1.455・3 PR を会議駆動で出荷）

ユーザー指示「会議から開始」を守り 1 トピックずつ会議→実装した。
- ✅ PR #185 (v0.1.453): 100% 取れてるのに「遡れません」警告ループ根治
- ✅ PR #186 (v0.1.454): コメント多い配信のスクロール重さ軽減（ユーザー実機「軽くなった」確認）
- ✅ PR #187 (v0.1.455): 途中参加で過去ログが空区画で一発停止する退化を根治
  → これで「個人の長い配信（4〜5時間）」は実機で 100% 取れるようになった

# 残っている問題（実機データで確定）

過去ログ backfill が配信タイプによって途中%で止まる:
| 配信タイプ | 結果（v0.1.455 実機） |
|---|---|
| 個人・長い（4〜5時間） | ✅ 100% |
| 個人・短い（20〜53分） | ❌ 13〜33% で停止 |
| 公式チャンネル（テレ朝/NHK・24時間枠） | ❌ 1〜72% で停止 |

「もう一度ためす」を押すと 125→135→143 とわずかしか増えない。

# ⭐世界ディープリサーチで判明したこと（一次ソース＝OSS 実コードで確認）

ユーザー提案「世界中の事例を調査」が的中。NDGRClient(Python)/NdgrClientSharp(C#)の
実コードを読んだ結果:

1. ⭐世界の実装は「再シードしていない」。`?at=now`（ライブ最前）から始め、
   `backward.next.uri` の一本道だけで配信開始まで遡る。停止条件は「next が無くなったら
   終わり」だけ（vpos 判定も再シードも無い）。我々の「区画ごとに再シード」は独自方式。
2. ⭐我々に欠けている最有力 3 点:
   a. **previous（複数 MessageSegment）の回収漏れ** — C# 実装は必須処理。backward 入口は
      「2セグメント前まで」しかカバーしないので、最前〜入口の間が欠落して % が下がる。
   b. **レジューム（続きから）が無い** — runNdgrBackfillOnce は毎回 crawl をゼロから新規生成。
      前回の最古到達点を保存・再注入しないので、同じ区画を取り直して dedupe で弾かれる
      （125→135→143 の正体）。
   c. **起点が ?at=過去時刻** — 世界は ?at=now から始める。
3. 公式チャンネル（テレ朝/NHK）が取れない別要因: **放送終了番組の過去ログはプレミアム
   会員ログイン必須**。24時間枠は構造も違う。これは個人配信とは別問題。
4. 私の当初「reached_start 誤発火」仮説は外れ（vpos は絶対オフセットで短配信誤発火は
   理屈が通らない・v0.1.436 で対策済み）。真因は「レジューム無し + 取り方が世界標準と違う」。

詳細は reference_backfill_honest_completion_and_completion_rate.md 末尾に記録済み。

# 次の一手＝レジューム実装（会議⑥で設計確定・ユーザー承認済み「レジュームを先に」）

「もう一度」で前回の続きから遡るレジュームを入れる。これで「押すたびに前進」する。

## 確定した設計（会議⑥ Plan の結論）

1. **保存するもの = 案A（最古到達 vpos = globalMinVpos）**。
   - URI カーソル（案C）は失効リスクがあり不採用。vpos なら既存の seedAt 算出式
     （programStartSec + 最古vpos − buffer）をそのまま使える。
   - 保存先: per-liveId キー `nls_backfill_resume_<lv>` に `{lid, minVpos, seg, rows, ts}`。
2. **crawl への渡し方**:
   - `crawlNdgrBackward` の opts に `resumeFromVpos`（number|null）を追加。非 null なら
     seedCandidates 先頭に `programStartSec + floor(resumeFromVpos/100) − RESEED_BUFFER_SEC`
     を積む（+ globalMinVpos を resumeFromVpos で初期化）。既存 seed 探索は残す（フォールバック）。
   - generator の return（done() L401）に `minVposReached: globalMinVpos` を追加（保存用）。
     NdgrBackfillProgress typedef(L155) と yield(L611-617) にも optional で追加。
3. **保存/読み/リセットのタイミング**（storage 負荷を避ける）:
   - 読む: runNdgrBackfillOnce 冒頭（L11670 付近）で resume を await 読み、resumeFromVpos で渡す。
   - 保存: finally（L11813）で return の minVposReached を1回 + persist バッチ境界
     （flushPendingBackfillRows L11797・800行ごと）で coalesce。毎 yield では書かない。
   - リセット: reached_start で完了したらクリア。no_progress/cap_*/aborted/rate_limited は残す。
     minVposReached が前回より小さくならなければ上書きしない（後退防止）。
4. **dedupe・自動リトライ**: 続きから取れば同区画再取得が消え dedupe の無駄が激減。
   境界1バケット重なりは安全（dedupe 吸収）。backfillTransientRetry に no_progress を
   resume 有り時だけ加える検討余地あり（別判断・必須化しない）。_backfillTriedLiveId
   ガードは「もう一度」「自動リトライ」が既に解除してから再起動するので変更不要。
5. **後方互換**: resume 無し（初回）= resumeFromVpos=null で完全に従来動作。resume 破損/
   失効時は seedCandidates 後続にフォールバック。初回取得は壊れない。

## 実装手順（会議⑥・行番号付き）

1. storageKeys.js に `backfillResumeStorageKey(liveId)`（`nls_backfill_resume_<lv>`）+ normalize
   ヘルパ追加（他の per-liveId キー L381-435 と同形）。
2. ndgrBackfillCrawl.js L370-401: opts.resumeFromVpos を読み globalMinVpos 初期化(L430)+
   seedCandidates 先頭追加(L508-513)。done()(L401) 戻り値に minVposReached 追加。
   NdgrBackfillProgress typedef(L155) と yield(L611-617) に minVposReached 追加。
3. content-entry.js L11718: crawl 起動直前に resume 読んで resumeFromVpos 渡す
   （読みは runNdgrBackfillOnce 冒頭 L11670 付近で await）。
4. content-entry.js L11732/L11816(finally): return の minVposReached を backfillResumeStorageKey
   に setStorageLocalSilent で1回保存。reached_start のときだけ resume 削除。
5. content-entry.js L11797 付近: persist バッチ境界で最新 minVposReached を coalesce 保存。
6. （任意）backfillTransientRetry.js: resume 有り時に no_progress を再試行可能にするか別途判断。

## fixture テスト（会議⑥・退化防止）

ndgrBackfillCrawl.test.js の既存パターン（makeFetchFromMap + packedSegmentBytes + drain）を使う:
1. return に最古到達点が乗る（result.minVposReached が最古区画 vpos と一致）。
2. ⭐resume で続きから始まる（中核）: 続きの古い区画のみ登録した map で resumeFromVpos を渡し、
   1回目で行く浅い区画を fetch しない（calls に無い）ことと、続きの区画を取り込むことを assert。
3. resume 失効フォールバック: resumeFromVpos 由来 at に入口無い map で従来 seedCandidates に
   フォールバックして取り込めることを assert。
4. 後退防止/初回無害: resumeFromVpos=null で既存テスト全パス（回帰）。

# 進め方

ユーザーは「1 トピックずつ会議」「実機で動かないものは出さない」「低リスクから刻む」を好む。
レジューム実装 → fixture テスト + ネガティブコントロール → verify → PR（v0.1.456）。
実機確認は Claude-in-Chrome でユーザーブラウザを操作（ユーザーはコンソール操作不要）。
ただしニコ生は生配信なので、確認には今やっている途中参加できる配信が要る。

# その後の候補（レジューム後）

- previous セグメント回収（世界実装が必須にしている・欠落を埋めて取得率UP）= 中規模
- 起点を ?at=now に寄せる検討
- 公式チャンネル: プレミアムログイン必須の制約をユーザーに説明 + 取れない旨を UI で正直に
- 「途中%で止まったとき stopReason をユーザーに見せず確認する仕組み」（spawn task 済み）

# 守ってほしいこと（MEMORY から）

- ⛔ 申請フロー（CWS 提出）は回さない
- ✅ 1 トピックずつ会議で進める
- ✅ 実機で動かないものは出さない・推測でなく実証（今回 reached_start 誤発火仮説が
  数値トレースで覆った好例）
- ✅ ユーザーに何度もサンプル（配信スクショ）を見せさせない → fixture 自動検証 +
  Claude-in-Chrome で代替する（ユーザー痛点「毎回ちくらんからサンプル見せて直すの大変」）
- ✅ ユーザーが疲れているときは無理させない（今回「もう無理かも」発言あり→選択肢提示で再開）

# わたしから一言

今日は 4.8 で会議駆動が冴えて、3 PR 出荷 + 個人長配信 100% 達成 + 世界調査で正しい方向を
特定できました。ユーザーの「世界中の事例を調べる」直感がまた的中。レジュームは設計が
固まっているので、明日は実装に集中できます。焦らず、まず会議⑥の設計を再確認してから
実装へ。頑張ってください 💙
```

## コピペする内容（ここまで）

---

## 補足（自分用・コピペ対象外）

### 未片付け
- `git stash@{0}`（"WIP: 100%警告ループ修正" = 今朝採用して PR #185 で merge 済）は**もう不要**。
  ユーザー確認の上 `git stash drop stash@{0}` してよい（破壊的なので一応確認）。
- spawn task 1 件（stopReason 診断を popup に出す改善案）がチップで残っているかも。

### 実機データ全記録（2026-05-29 深夜・全て v0.1.455）
| 配信 | 種別 | 経過 | 記録/公式 | 結果 |
|---|---|---|---|---|
| かわいい（キューブ） | 個人 | 5時間7分 | 1,377/1,380 | ✅ 100%（後から補充） |
| 猫（かつお節） | 個人 | 4時間8分 | 603/603 | ✅ 100%（1発） |
| 人糞（自転車） | 個人 | 33分 | ~/~ | ❌ 13% |
| だるまくん（lv350632478） | 個人 | 52分 | 125→143/853 | ❌ 15-16%（押しても微増） |
| なぎ（lv...） | 個人 | 21分 | 126→142/422 | ❌ 30-33% |
| テレ朝（公式CH） | 公式 | 24時間枠 | 25→140/2,783 | ❌ 1-5% |
| NHK（公式CH） | 公式 | 24時間枠 | 2,936/4,098 | ❌ 72%・もう一度UI出ず |

### 世界調査の一次ソース URL
- NDGRClient (Python): https://github.com/tsukumijima/NDGRClient/blob/master/ndgr_client/ndgr_client.py
- NdgrClientSharp (C#): https://github.com/TORISOUP/NdgrClientSharp/blob/master/NdgrClientSharp/NdgrPastCommentFetcher.cs
- proto 定義: https://github.com/tsukumijima/NDGRClient/blob/master/proto/dwango/nicolive/chat/service/edge/payload.proto
- Qiita（backward=2セグメント前まで・previous で穴埋め）: https://qiita.com/DaisukeDaisuke/items/3938f245caec1e99d51e
