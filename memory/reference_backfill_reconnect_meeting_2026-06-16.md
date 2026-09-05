# 「10年後らくできる最終系」= NDGR能動取得を既定化 会議+司令塔統合(2026-06-16)

最強モード council(COUNCIL-HOWTO.md手順・役割自動付与・結論→根拠→反論→具体案の型)。応答4/10(クラウドgpt-oss-120b/llama/gemini/openrouter・ローカル5体は cold abort=既知)。**司令塔Claudeが実コードで裏取りして1案に収束**。

## 会議の全会一致(4/4クラウド)
**結論=受動傍受(プレイヤーのNDGR fetchを横取り)を主から外し、拡張が能動的にNDGRを独立long-pollするのを既定にする。** 既存 ndgrForwardCrawl(v0.1.511)を既定ONに。これが「プレイヤー依存の単一障害点」を消し、token を常に新鮮に保ち、過去ログが止まらない唯一の恒久解。

## ⚠️司令塔の裏取り=会議のハルシネーション除去(重要)
- ❌ LLMが挙げた `/api/v2/rooms/{roomId}/ndgr/view`・`/api/v2/watch`・`chrome.webRequest`・`chrome.alarms`・WebSocketでのview取得=**当リポに存在しない/不正確**。当リポの傍受は MAIN world の fetch/WebSocket Proxy(page-intercept:837)で、NDGR view は **HTTP long-poll(?at=now→nextAt)**(WebSocketではない)。→ LLMの具体的エンドポイント/API名は採用しない。
- ✅ ndgrForwardCrawl が能動pullの実体=正しい。429 backoff・2-8s gap・segmentsPerHop=8・visited 4000上限・previousUris初回のみ=重さ/429/二重化(dedupe=mergeNewComments)は既に対策済=会議の「sliding window limiter」等は自前実装済で不要。
- ✅ 会議の「TTL/lastReceived 差で『入口だけ古い』vs『全切れ』を見分ける」最小判定=妥当(下記採用)。

## 🎯司令塔が見つけた「会議が見落とした唯一の穴」(これを塞ぐのが最終系の肝)
**ndgrForwardCrawl も runNdgrBackfillOnce と同じく viewBase を【起動時に1回 readNdgrViewBaseUri() で読む】だけ。** だから:
- プレイヤーが切れる【前】に forward が走り出していれば、forward 自身の fetch が page-intercept を通り observeNdgrViewUri→最新token を維持し続ける=**自己持続する(virtuous cycle)**。✅
- だが既に死んだ後(cold-dead base)に起動すると、forward も古いtokenで0件→too_many_errors で死ぬ=ブートストラップできない。❌
- → **最終系= forward を【常時(前面タブ)既定ON】にして"切れる前から自分でNDGRを引いている"状態を保つ**こと。そうすれば token は forward 自身が更新し続け、プレイヤーの切断は無関係になる(プレイヤーは映像専任に降格)。これが「10年腐らない」本質=傍受という他者依存をやめ、自分でedgeを追う。

## ✅最終系の1案(司令塔統合・実コード制約内)
1. **ndgrForwardCrawl を前面タブ既定ON**(_ndgrForwardEnabled の既定 false→true)。裏タブは従来どおり hidden で abort(重さ/競合回避)。全タブ横断 GLOBAL_FORWARD_LOCK で同時1本=多タブでも負荷一定。
2. **forward が走る=その fetch が最新 view base を維持**→ backfill は常に生きた入口を持つ=「再接続待ち」が構造的に起きない。
3. **最小判定(無駄打ち防止・能動再取得の発火条件)**: `ndgrLastReceivedAgo > しきい(例120s)` かつ backfill が seg:0 backward_exhausted の連続=「入口が古い/死」→ forward を即再起動(fresh ?at=now で再シード)。`backward_exhausted + rows>0 で最古vposが配信開始近傍`=「本当に遡り切った」→ 触らない。
4. **段階導入(最危険境界)**: まず (a)on-demand(止まった時だけ forward 起動)で実機検証→効けば (b)常時ON へ。各段で①429ゼロ②前面固まりなし(ページ応答します)③二重化なし(dedupe効く)④記録が本家に追従し続ける を実機確認。
5. **キルスイッチ温存**: KEY_NDGR_FORWARD_ENABLED で即OFF可(ロールバック)。仕様変更で壊れたら受動傍受にdegrade。

## 進め方
- 次=(a)on-demand を最小・TDDで実装→実機検証(止まった配信で forward 起動→記録が伸びるか)。会議の段階導入と一致。常時ON(b)はその後。
- ⚠️ローカル5体が今回も cold abort=会議前に warm-up(ollama run で1語生成)すると次回参加率上がる。クラウド4体だけでも結論は出た。
