# お題: 過去ログ取得(backfill)が途中で失速(stopReason=stalled)し「一気に取れない」

## 背景(司令塔が実コードで確認済みの事実・推測でない)

ニコ生視聴拡張(MV3)。配信のコメントを記録し、過去ログは NDGR backward 巡回(backfill)で遡って取る。
ユーザー実機で「一気に取れない・なかなか100%にならない」。時間をおくと取れるが、途中で失速する。

## 実機 diag(時系列・同一配信 lv350771920)
- 13分時点: `backfill { running:true, rows:0, seg:0, stopReason:"" }`・取得率45%(49/108)・取得0.0件/秒
- 16分時点: `backfill { running:true, rows:108, seg:3, stopReason:"stalled", gapRearmCount:1 }`・取得率88%(126/144)・取得0.9件/秒
- = 3分で 45→88% に進む(=最終的には取れる)が、途中で **stalled(失速)** が出て gapRearm(再起動)1回でしのいでいる。
- 小配信(144件)なので再起動1回で88%まで来たが、**大配信(1万件)だと stalled→再起動が何度も起き「なかなか100%にならない」体感**になる(過去実機で歌枠/長時間配信で確認)。

## stalled の発生条件(content-entry.js:16317-16343 で確定)
- `stalledEmpty` = `seg===0 && rows===0 && noProgressMs>60秒 && gapRemains`(入口取得失敗・0行のまま固着)
  → guard 保持し backfillTransientRetry(指数backoff+ジッタ)で ?at=now 仕切り直しに一任(v0.1.750)。
- `stalledMidRun` = `rows>0 && noProgressMs>150秒 && gapRemains`(途中ハング・今回これ)
  → `_backfillTriedLiveId=''` で即 guard 解除・abort し、resumeFromVpos で続きから再開。
- `gapRemains` = 残ギャップ(official - observed)が effectiveMinGap 以上(小〜中規模はギャップ比率で動的)。

## 既知の周辺事実(memory/reference_backfill_*.md より)
- no_progress バックオフ睡眠は最大~45秒(reference_backfill_sw_migration_pr1b)。stalledMidRun の150秒しきいは
  この誤検知回避のため。だが「150秒も無進捗→abort→resume」自体が『途中で詰まる』体感の根。
- COLD_RETRY_MAX(everMadeProgress=false の cold crawl の no-progress 連続上限)は過去 12→40 に調整。
- ndgrForwardCrawl(能動pull)=segmentsPerHop=8・2-8s gap・429 backoff・visited 4000上限。
- 「公式件数に gift/system/空本文が含まれ分母過大=取得率が見かけ低い」指摘あり(本文ありのみ記録)。
  今回 commentTypeValues に generalSystemMessage が混じる=144 の一部は本文なしの可能性。

## 問い(これに答えてほしい・4ブロック厳守)

1. **stalledMidRun(rows>0で150秒無進捗)の最有力原因**は何か。NDGR backward 巡回が途中で150秒も
   進まなくなるのは: ①疎区間(コメントが無い時間帯)を延々 seek している ②429/レート制限で長い backoff
   ③segment の next URI が途切れて待っている ④no_progress バックオフ睡眠(~45秒)が連鎖して150秒に達する、
   のどれが最有力か。診断材料(rows:108/seg:3/3分で進む/小配信)からの推定。

2. **「一気に取れる」体感への最小修正**。星野ロミ式(失敗体験の除去・重くしない・割り切る)で、
   stalled で詰まらず滑らかに最後まで取り切るには: (A)150秒しきいを下げて早く再起動 (B)no_progress
   バックオフ睡眠を短く/賢く (C)疎区間スキップを大きく跨ぐ (D)stalled でも resumeFromVpos を
   保持して『続きから』を確実に。どれが効果/リスク比が最良か。過剰な並列化や重い再取得は避ける。

3. **取得率の分母問題**: official(公式件数)に gift/system/空本文が含まれ「本文ありのみ記録」の拡張は
   構造的に100%に届かない。なら『取得率』表示を「本文コメント基準」に補正すべきか、それとも
   「ほぼ取得(88%)」のような体感ラベルで割り切るべきか(星野ロミ=正直さと安心の両立)。

4. **批判役**: stalled しきいを下げる/再起動を増やす修正の罠を1つ。tight な再起動ループ(v0.1.750で
   一度踏んだ rows=0 即再入の無限ループ)を再発させないか。429 を誘発しないか。

## 制約
- 記録の永続(IDB/chunk/テール)不変。新 storage 書き込みを増やさない。
- backfill は過去に何度も触り毎回違う真因だった=会議結論は素材・司令塔が実コードで裏取りして1案に。
- 純関数化してテスト可能に(ndgrBackfillCrawl.js / backfillTransientRetry.js の作法)。

## 出力フォーマット
`結論 → 根拠 → 反論・リスク → 具体案(どこを/どう)` の4ブロックで。役割ごとに視点を変える。
