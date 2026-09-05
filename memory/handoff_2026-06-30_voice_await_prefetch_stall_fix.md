# 読み上げ await_prefetch 固着 + stale 誤検知 根治 — v0.1.1004 (2026-06-30)

## 結論
master HEAD = **v0.1.1004 (ec577b81)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1004。
状態速報で毎回出ていた「読み上げ追従🔴(停止位置=await_prefetch・合成0ms・最終発話5.5日前)」を
2層で根治。①本物のhangの穴 ②会場非稼働時のstale誤検知。

## 真因(実コードで確定・Explore の説は裏取りで取捨)
- 停止位置 await_prefetch = drainVoiceQueue が `await prefetch.promise`(comeview-entry.js:603)で固着。
- prefetch.promise = synthesizeVoice(...).catch(()=>null)。reject なら null になるので、永遠 pending に
  なるのは **synthesizeVoice 自体が settle しないとき**だけ。
- ★voicevoxClient.js:287 `await synthesisRes.arrayBuffer()` が**タイムアウト無保護**。
  fetchWithTimeout はリクエストに AbortSignal タイムアウトを掛けるが、200 OK 後の【body 読み取り】は
  Fetch 仕様上タイムアウト機構が無い。VOICEVOX が本体配信を途中で止めると arrayBuffer() 永遠 pending。
- 今回の🔴自体は **stale**: watch タブ無し(会場非稼働)なのに voiceDiag の過去値(待機8・沈黙5.5日)が
  残存→buildVoiceHealthCells が bad 誤発火。**番犬(VOICE_DRAIN_STUCK_MS=30s)は一度も発火していない**
  (再生TO=playbackTimeoutTotal が 0件)=今まさに固着ではない証拠。

## 修正(2層)
- ① voicevoxClient.js: `arrayBufferWithTimeout(res, synthesisTimeoutMs)` を新設し L287 をラップ。
  body 読み取りも Promise.race で打ち切り→超過は catch で null=この1件を捨てて次へ=固着を構造的に潰す。
- ② healthCells.js buildVoiceHealthCells: voiceDiag.capturedAt が **VOICE_DIAG_FRESH_MS(90秒)** より
  古ければ「会場休止中」(na)にして live 固着判定をしない。新鮮で実際に止まっていれば従来どおり bad。

## verify
- verify:cc 緑(arrayBuffer 永遠pending→null / stale voiceDiag→na / 新鮮実固着→bad)。
- 出荷バンドル probe: stale→na会場休止中・新鮮実固着→bad を確認。

## 教訓
- Fetch の「リクエストタイムアウト」と「body 読み取り(arrayBuffer/json/text)」は別物。後者は別途
  Promise.race で守らないと永遠 pending しうる。await を握る consumer(読み上げ等)が固着する。
- 累計でなく capturedAt の鮮度で「今の状態か」を判定する(過去セッションの残存値で🔴にしない)。
- Explore の cleanNdgrChatRows 説(別件)は buildDedupeKey が内部正規化するため誤り=今セッション4回目の取捨。
  →エージェント結論は必ず実コードで裏取り。

## 残課題(別系統・実測待ち)
- backfill 律速(v0.1.999 計器)・記録>本家の真の二重(v0.1.1002/1003 で誤検知は除去済、本物が出たら欠落%+
  officialCommentStatsAge で切り分け)。会場座席(venue-seats)も完全性スコアで不合格のまま=別途。

## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
