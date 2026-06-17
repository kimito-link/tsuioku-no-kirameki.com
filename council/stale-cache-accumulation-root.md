# お題: 過去配信のキャッシュが溜まって全体が重くなる「根底」を断つ

## ユーザーの言葉
「時間が経ったら(記録カードの数字は)増えた=表示が遅れていただけ。**診断が重いのも根本問題かも。
そこを直せば一気に直る根底問題がありそう。根が深ければ枝が太いので。**
過去のデータがキャッシュなどで溜まって遅くなっている原因もありそう。」
= 個別の枝(記録カード遅延・popup遅い・診断重い・ギフト履歴表示遅れ)を1つずつでなく、**共通の根を1つ**直したい。

## 司令塔が実機診断+実コードで特定した「根」(確定・推測でない)

### 実機診断(状態速報 2026-06-17・v0.1.800)が示す異常
- `multiTabDiag.eventDomLvCount: 513` = **過去513配信ぶんの nls_event_dom_<lv> キーが storage に残留**。
- `multiTabDiag.staleDomBundleSuspected: true` = 古いDOMバンドル残留を拡張自身が疑っている。
- 一方、記録自体は健全(取得率98%・backfill reached_start)・longTasks 0・paint 20ms。
  = **「重い」の正体は同期処理でなく、共有 chrome.storage.local に溜まった大量の per-live キャッシュ**。

### 根の構造(実コードで確定)
- 多数の「配信ごとキー族」が chrome.storage.local に貯まる:
  - nls_event_dom_<lv>(イベントDOMバンドル) ← 513件
  - nls_koken_*/nls_nicoad_*/nls_event_participation_*/nls_event_score_ranking_*/
    nls_event_voting_ranking_*/nls_nicoad_ranking_* など(貢献度/広告/参加/スコア/投票の鏡)
- cleanup は存在する(content-entry.js:17026〜・pruneStaleEventDomLvs.js)が **TTL(24h)のみ・件数上限なし**。
  → **24h 以内に大量の配信に触れると上限なく溜まる**。
- **増幅源=autopatrol**(background.js・AUTOPATROL_TICK_MINUTES=0.5=30秒ごと): ユーザーが見ていない間も
  ランキングから配信を背景タブで次々開く(同接較正データ収集)。1配信開くたびに上記キー族が書かれる
  → 30秒に1配信×24h で理論上数千件規模。513件はまさに autopatrol スケール(人間の視聴では出ない数)。
- 溜まった結果、複数のホットパスが「全 per-live キーを走査」して重くなる:
  - readPrunableStorageBagCheap(prune prefix 群を読む)・診断ビルド・popup の light read が
    肥大した storage と競合 → 「診断が重い・popup が遅い・表示が遅れる」が【同じ根】から派生。

### なぜ「根」なのか(1つ直すと枝が一斉に細る)
- per-live キャッシュの無界蓄積を断てば: storage 総量が小さくなり、prune 走査も light read も
  診断ビルドも軽くなる → popup の数字が早く出る・診断が軽い・表示遅延が減る、が同時に改善。

## このプロジェクトの制約(必ず守る)
- Windows + PowerShell。`npm run verify:cc`。「1変更=patch 1つ」。changelog 35字以内・
  manifest/package 同期。純ロジックは src/lib に切り出して単体テスト。
- 記録(コメント本体)は IndexedDB(nls_comment_db_v1)で別管理=【絶対に消さない・触らない】。
  今回の対象は「イベント/ランキング/DOM 鏡などの per-live キャッシュ」だけ。記録/バックアップは保護。
- 現在 watch 中の lv は保護(消さない)。autopatrol の較正データ収集機能自体は止めない(別価値)。
- 多タブ/storage stall を増やさない(cleanup 自体が重い全走査になっては本末転倒)。
- 後退ゼロ: cleanup しすぎて「直近の有効データまで消す」と表示が欠ける。境界を慎重に。

## 会議への質問(役割分担 + 結論→根拠→反論→具体案 の4ブロックで答えよ)
役割: 総合役=設計整合と退行防止 / 発散役=別の切り口 / 批判役=各案の穴を最低1つ /
実装役=具体的なファイル・関数・キー族・上限値・テスト名まで。

### Q1: 無界蓄積を断つ「件数上限(LRU)」をどう入れるか
- 現状 TTL(24h)のみ。**per-live キー族ごとに件数上限(例: 直近 N=30 配信)** を足し、capturedAt 古い順に
  超過分を prune するのが筋か。N の妥当値は?(autopatrol が 30秒ごとに増やす前提で)
- TTL を 24h→もっと短く(例: 2〜6h)するのと、件数上限を入れるの、どちらが効くか/両方か。
- prune を「全キー族横断で1回の走査」にまとめて、cleanup 自体を軽くできるか。

### Q2: そもそも autopatrol が per-live キャッシュを書かない設計にできるか(発生源を断つ)
- autopatrol(背景巡回)で開いた配信は「較正データ(同接サンプル)」だけ要る。イベントDOM/貢献度/
  ギフト鏡などの per-live キャッシュは autopatrol 配信では不要では?
  autopatrol タブ(#nls_autopatrol=1)では per-live キャッシュ書き込みを抑止すれば、根の発生源を断てる。
- 「視聴中の本命配信」と「autopatrol の使い捨て配信」を content がどう区別するか(URL ハッシュは既にある)。

### Q3: 診断ビルド/popup light read が「溜まったキーに比例して重くなる」のを切る
- readPrunableStorageBagCheap や診断の multiTabDiag が全 per-live キーを読む/数える設計だと、
  溜まるほど重い。索引キー(直近 N lv の配列)を1本持ち、それ経由で必要分だけ読む設計にできるか
  (backfill heartbeat で導入した nls_backfill_hb_lids_v1 と同じ索引パターン)。
- eventDomLvCount のような「全件カウント」は診断から外す/索引長で代替できるか。

### Q4(批判役の核心): 「根を1つ」は本当か・cleanup の罠
- 513件の per-live キャッシュは本当に「診断重い/popup遅い」の主因か、それとも別の枝
  (profile cache 同梱の light read・heavy IDB read の cold コスト)が独立に効いていて、
  キャッシュ掃除だけでは「一気に」直らないか。司令塔は何で切り分けるべきか。
- cleanup を強めすぎて「現 lv の有効データや直近の再訪配信」まで消すと表示欠け。
  autopatrol 書き込み抑止は較正データ収集を壊さないか。

## 期待する最終成果(司令塔が統合・裏取り)
「過去配信の per-live キャッシュ無界蓄積」という根を断つ1案。MVP(最小で storage 総量と診断/popup の
重さが下がる)と、発生源(autopatrol)を断つ構造改善を分けて。退行ゼロ(記録/バックアップ不可侵・現lv保護・
較正収集維持)を最優先。具体ファイル(pruneStaleEventDomLvs.js / content-entry.js / background.js)・
キー族・LRU 上限値・索引キー式・テスト名まで。司令塔が実コードで裏取りして1案に収束(会議は素材)。
