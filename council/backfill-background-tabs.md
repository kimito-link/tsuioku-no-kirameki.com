# お題: 全タブが裏(背面)のとき過去ログ backfill が rows:0/seg:0 のまま進まないのを直す

## ユーザーの言葉（実機・困りごとの本体）
「3配信とも裏タブで記録しているのに、3時間配信なのに過去ログが取れない（取得率19%）。
ぜんぜんうまくいってない。裏タブでも取れてほしい。」

## 司令塔が実コードで特定した真因（確定・推測でない）

### 症状（診断 JSON `nls_ai_share_fast_diag_v1` より・2026-06-16 22:08）
- 3配信とも【裏タブ】で記録中。
- lv350717950: 経過3h08m・取得率19%・
  `romiDebug.backfill = {running:true, rows:0, seg:0, stopReason:"", ndgrViewBaseObserved:true}`
- リアルタイム(RT)記録は動いている（累計 3,291 行）。**backfill だけが seg:0 で止まる**。

### 診断フィールドの意味（実コードで確認）
- `running: _backfillAbort != null`（content-entry.js:6321）
  = AbortController がセットされ、crawl が起動済みで finally に未到達。
- `seg:0 / rows:0 / stopReason:""`
  = crawl は走り出しているが【最初の1セグメントすら yield する前】で止まり、例外も投げず、
    finally(stopReason をセット)にも到達していない。
- `ndgrViewBaseObserved:true` = view base は観測済み。起動条件は満たしている。

### 真因の核心（タイマー駆動が背面タブで凍結/間引きされる）
1. backfill を駆動する経路は **content script の `setInterval(tickFromInterval, PAGE_FRAME_LOOP_MS)`**
   1本だけ（content-entry.js:7223 → tickPageFrameMaintenance → maybeAutoStartBackfill）。
   - 過去ログ取り込みの起動・スロット取得・**ストール検知/自動再開**が全部この tick に乗っている。
2. crawl 内部も `await ctx.sleep(gapMs)`（fetch 間 15ms・背面時）と
   `backfillFetchBinary` の per-request タイムアウト `setTimeout(()=>ac.abort(), 10000)` という
   **setTimeout 依存**で動く。
3. Chrome は **背面(hidden)タブの setTimeout/setInterval を間引き**(最小1秒)、
   さらに **5分以上背面 + 条件成立で intensive throttling(1分に1回)**、
   かつ **タブ凍結(freeze)で全タイマー停止**する。
   - 全タブが裏 = 前面タブが1つも無い = どのタブの tick も間引き/凍結される。
   - 結果、最初の fetch やストール検知 tick が長時間進まず、`seg:0/running:true/stopReason:""`
     のまま何時間も固まる。RT は **player の NDGR fetch を MAIN world で横取りする
     イベント駆動経路**なのでタイマー間引きの影響を受けず生き残る（だから RT だけ動く）。
4. **`chrome.alarms` は manifest の permissions に有るが、コード上どこでも使っていない**
   （`grep` で 0 件）。背面でも確実に起こせる駆動源を持っていない。

### 既知の設計制約（正面衝突している）
- 過去メモに明記: 「backfill は前面タブのみ・裏でも取り切るは別テーマ（星野ロミ式
  バックグラウンド継続）」。今回はまさにその「別テーマ」に正面から取り組む。
- ストール検知(content-entry.js:16217 `stalledEmpty`: seg0/rows0 が 60秒継続 + gap 残で
  abort→再起動)は存在するが、**その検知自体が同じ間引きされる tick に乗っている**ので
  背面では時間どおり発火しない。

## 既存の根治（絶対に壊さない＝退行ゼロが最優先）
- v0.1.758 前面(focused)タブ優先（amIForeground なら絶対譲らない）= 単一視聴タブ飢餓根治。
- v0.1.751 視聴中タブにスロットを譲る（歌枠34%飢餓根治）。
- v0.1.663 Nスロットプール（同時2配信並走）。
- v0.1.642 単一タブは rotation_yield しない（一気に掘り切る）。
- 共有 chrome.storage.local の stall spiral 対策（v0.1.769/784/786・有界化）。
  背面で重い処理を増やすと storage stall を誘発する罠がある。

## このプロジェクトの制約（必ず守る）
- Windows + PowerShell。`npm run verify:cc`（test/lint/typecheck/build/bump）。
- 「1変更=patch 1つ」。changelog(35字以内)/manifest/package を同期。
- MV3。SW は content と別 origin（Web Locks で橋渡し不可・storage/message で連携）。
- 純ロジックは src/lib に切り出して単体テスト（既存文化）。fail-open 原則
  （新機構が壊れても従来動作に degrade＝記録/RT を止めない）。
- 背面で CPU/ネットワーク/storage を浪費しない（前面タブ・他配信を巻き込まない）。

## 会議への質問（役割分担 + 結論→根拠→反論→具体案 の4ブロックで答えよ）
役割: 総合役=設計整合と退行防止 / 発散役=別の切り口 / 批判役=各案の穴を最低1つ /
実装役=具体的なファイル・関数・テスト名・データの流れまで。

### Q1: 背面タブでも確実に backfill を駆動する「タイマー間引き/凍結に強い駆動源」は何か
候補を評価し、主軸を1つ選べ（複数併用も可）:
- (A) `chrome.alarms`（最小粒度1分）を SW に置き、SW→content への message か、
  SW 自身が backfill を回す。alarms は背面/凍結でも発火する。粒度1分の粗さは許容できるか。
- (B) 既存の **SW backfill モード**(`_backfillSwModeEnabled`・backfill-sw-entry.js・実験/既定OFF)を
  本筋に昇格させる。SW はタブ凍結の対象外。だが SW は MV3 で ~30秒でアイドル停止する
  ので、alarms か keepalive で生かし続ける必要がある。SW から NDGR を `credentials:'omit'`
  で叩けるか（host_permissions 的に可能か）も論点。
- (C) content の tick を背面でも生かす小細工（Web Audio の無音再生・Worker の
  `setInterval`・`navigator.wakeLock`）。退行/電力/CWS 審査リスクは？
- (D) その他（offscreen document など）。

### Q2: 「前面優先(v0.1.758)」と「裏でも取り切る」をどう両立するか（退行ゼロ）
- 前面タブが居る時は今までどおり前面優先で速く掘る。
- 前面タブが【1つも無い】時だけ、いずれか1タブ（or SW）が背面でも掘り続ける。
- 「前面タブが居ない」をどう判定し、誰が掘るリーダーを決めるか（Web Locks はタブ間のみ・
  凍結タブがロックを握ったままになる罠は？ alarms/SW なら誰がリーダー？）。

### Q3: 背面駆動を入れても storage stall / 429 / 前面巻き込みを起こさない有界化
- 背面 backfill は遅くても良い（取り切れれば勝ち）。レート・並列・flush 頻度を背面では
  どう絞るか。既存 globalFetchRateLimiter（休眠中）や rotation をどう絡めるか。
- SW 経路にすると storage RMW の競合相手が変わる。stall spiral を再燃させない設計は？

### Q4（批判役の核心）: 各案の最大の穴は何か・最小で価値が出る MVP はどれか
- 「SW に全部移す」は大改造で退行リスク大。逆に「alarms で content tick を蹴るだけ」は
  最小だが、凍結された content はメッセージで起きるのか？（凍結タブは message で
  resume するのか、それとも message も届かないのか＝Chrome の freeze 仕様の事実確認が要る）。
- 背面で掘ると 3配信×背面で 3本走って前面不在でも storaging を圧迫しないか。

## 期待する最終成果（司令塔が1案に統合）
最小で価値が出る修正（MVP=背面でも backfill が前進する最短路）と、その後の構造改善を分けて。
退行ゼロ（v0.1.758 前面優先・RT 記録・storage stall 対策）を最優先。
具体ファイル・関数・純ロジックの切り出し・テスト名まで。
