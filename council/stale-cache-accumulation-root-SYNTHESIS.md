# 司令塔の統合(裏取り済み): 過去配信キャッシュの無界蓄積という「根」を断つ

会議4応答(groq×2/nvidia qwen3.5/gemini)全員一致=2本柱:
1. **発生源を断つ(主軸)**: autopatrol が開く使い捨て配信では per-live キャッシュを書かない。
2. **LRU 件数上限(予備防衛線)**: per-live キー族に件数上限 N + TTL 短縮で古い順 prune。
3. (補助)索引化で診断/cleanup を O(全件)→O(N) に。

nvidia qwen3.5 が最精緻:「Q2(発生源抑制)主軸+Q1(LRU)予備+索引ベース削除で cleanup 自体も軽く」。

## 司令塔の実コード裏取り(会議の前提を確認・確定)
- `isAutopatrolTab()`(content-entry.js:8036)が既に存在=`#nls_autopatrol=1` ハッシュで使い捨てタブを
  確実に識別できる(SW が付与・content は読むだけ)。誤判定リスク低(本命視聴タブにこのハッシュは付かない)。
- per-live キャッシュ `nls_event_dom_<lv>` の【書き手】は `persistOfficialEventDomBundleNow()`
  (content-entry.js:16965・set は 17282)。autopatrol タブでここを return すれば 513件の主発生源を断てる。
- 較正データは別経路 `maybeLogConcurrentCalibrationSample()`(8048)が別キー(較正リング)へ書く=
  per-live キャッシュ抑止は較正収集を【壊さない】(会議の懸念を実コードで否定=安全)。
- 既存 prune `pruneStaleEventDomLvs.js` は TTL(24h)のみ・件数上限なし=無界の真因。

## 採用案(MVP・退行ゼロ)

### 修正1(発生源・主軸): autopatrol タブで per-live キャッシュを書かない
- `persistOfficialEventDomBundleNow()` 冒頭に `if (isAutopatrolTab()) return;`。
- 同様に per-live 鏡 fetch 群(runExternalApiFetchesAsTabLeader 経由の maybeFetch*MirrorOnce:
  koken/nicoad/participation/giftHistory/audition)も autopatrol タブでは起動しない
  (runExternalApiFetchesAsTabLeader の入口で autopatrol gate)。
  → autopatrol が開いた配信は per-live キャッシュをほぼ書かない=513件の発生源が止まる。
- 較正(maybeLogConcurrentCalibrationSample)は gate しない=同接較正収集は維持(autopatrol の価値)。

### 修正2(予備防衛線): pruneStaleEventDomLvs に件数上限(LRU)
- `pruneStaleEventDomLvs(entries, currentLiveId, nowMs, ttlMs, maxKeep=30)` に maxKeep を追加。
  TTL 内でも、capturedAt 新しい順に maxKeep 件だけ keep・超過分は prune(現 lv は無条件 keep)。
- TTL も 24h→6h に短縮(発生源を止めれば多くは要らない・人間の再訪は数時間内)。
- これで万一 autopatrol 以外で大量蓄積しても上限で頭打ち。純関数=単体テスト容易。

### 次フェーズ(MVP の後・今回はやりすぎない)
- 索引キー(nls_backfill_hb_lids_v1 パターン)で診断/読みを O(N) 化(会議 Q3)。
  今回は発生源を断てば 513→数十件になり全走査も軽くなるので、索引化は第2弾。
- 他の per-live キー族(koken/nicoad/...)にも同じ LRU を横展開(まず event_dom で効果確認)。

## 退行ゼロの絶対条件
- 記録(コメント本体=IndexedDB nls_comment_db_v1)・auto-backup は【触らない・消さない】(対象外)。
- 現在 watch 中の lv は無条件 keep(表示欠け防止)。
- autopatrol の較正データ収集は維持(per-live キャッシュだけ止める・別キーの較正は不変)。
- cleanup 自体を重くしない(prune は既存の cheap read 経路のまま・maxKeep は配列 sort/slice だけ)。
- fail-open: autopatrol 判定失敗は従来動作(書く)に倒す=機能を壊さない。

## 司令塔が会議を最小化した点
- 会議は「全キー族を1つの索引テーブル nls_live_prune_index_v1 に統合」「cache-manager.ts 新設」
  「TTL→4h」等の大改造を提案したが、実コードは event_dom が主発生源(513件)で他キー族は既に各 TTL
  cleanup 済み。**まず主発生源(event_dom)を①autopatrol で書かない②LRU 上限、の最小2点**で 513→数十に
  落ちる効果を確認してから横展開する(会議の大改造を MVP では採らない=退行最小)。
- 索引化(O(N))は発生源を断った後の第2弾(513件が無くなれば全走査も軽い)。
