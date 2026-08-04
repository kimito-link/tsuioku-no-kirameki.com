# 会議SYNTHESIS: 応援レーン/北極星の描画が一度も起動しない（render probe=0）

> 司令塔が実コードでトリガ連鎖を確認 + council(critic/lead/diverge/design)で設計判断を独立検証。
> 設計の正本: tsuioku-no-kirameki/articles/role-separation-design/（星野ロミ型・4役割）。

## 総合判定: confirmed（真因＝「見せる人」が「集める/集計の完了」に依存して起動している）

## 真因（実コードで特定・確度順）
1. 【最有力】`paintStoryUserLaneCoalesced`(popup-entry.js:5836) が async で、`renderStoryUserLane()`(5899) を
   呼ぶ前に `await chrome.storage.local.get([giftUsersKey, nicoadKey])`(5861) を挟む。直後に2つの早期return:
   - 5878 `if (seq !== _storyLanePaintSeq) return;`（await 中に新しい paint が来たら捨てる＝coalesce）
   - 5879 `if (STORY_SOURCE_STATE.liveId !== lid) return;`（await 中に lv が変わったら捨てる）
   12k件規模で storage.local が重い／refresh が高頻度だと、await 解決前に次の paint が seq を進め、
   **renderStoryUserLane に到達する前に毎回 return**＝probe started=0・entriesLen=-1 のまま。
   → 記事§1「画面が全件を読む＝重い」「開かないと出ない」の storage 版。描画(見せる)が重い read の後ろで餓死。
2. 北極星 `refreshAllNorthStarMirrorLanes`(10859) は refreshAllStarted=0＝そもそも呼ばれていない。
   応援レーンと「同じ1つの根」かは要確認だが、両方とも「描画/集計トリガが重い前段の後ろにある」点で同型。
3. critic 指摘の補強: 鏡(storage)は新鮮(北極星69秒前)なのに popup は空＝**鏡を読む経路が起動していない**
   のであって鏡が空なのではない。だから「鏡を読むだけ」に切り替えるなら storage.onChanged で
   「鏡が更新されたら貼る」通知経路が要る（passive は既に onChanged 配線あり=これに揃える）。

## 記事に従う最小の配置変更（第1段・council 収束）
「見せる人」を heavy/refresh の前段完了から切り離し、storage の鏡から貼るだけにする。①メインPOP も
②応援プレビュー(passive=既に applyLaneMirrorForPassive/applyNorthStarMirrorForPassive で鏡を読む) と
同じ「鏡 read + onChanged 購読」に揃える＝3画面パリティ。

具体候補（実装前にさらに精査）:
- A. `paintStoryUserLaneCoalesced` の await(storage.get) を描画トリガの前段から外す。giftUsers/nicoadApiRows は
  鏡(集計済み)から取る or 取得済みを引数で渡し、renderStoryUserLane を await の後ろに置かない。
  →「見せる」を storage read の後ろで待たせない（記事§5の核心）。
- B. メインPOP も passive と同じ「KEY_LANE_MIRROR / KEY_NORTH_STAR_MIRROR を読んで貼る」経路を初期化時に
  起動し、heavy refresh の完了を待たずに最初の1枚を出す（onChanged で更新）。
- C. 北極星 refreshAllNorthStarMirrorLanes が呼ばれない件を A/B と同根か切り分け、同じ配置に寄せる。

## §6 地雷を踏まない根拠
- 描画パス(refresh/paint の read path)を**包まない/キャッシュしない**（A は read を「減らす/前段から外す」＝§6の逆）。
- 画面まるごとコピーしない（最小の鏡データを読むだけ）。
- 記録の心臓部(content)に集計を足さない（変更は popup の描画トリガ配置のみ）。

## 第1段の到達条件（実機・状態速報で確認）
- storyUserLaneRenderProbe.started > 0 / activePath が "mirror" or "heavy" / domTilesPainted >= 0。
- northStarRenderProbe.refreshAllStarted > 0。
- 北極星鏡が現配信で貢献度/広告が埋まる（整合チェック「拡張 ≒ 鏡」）。
- 開いた瞬間に重い全件 read を待たず最初の1枚が出る（「重い・ローディング継続」解消）。

## 注意（critic）
鏡を読むだけにする時、鏡更新→UI の同期(onChanged)を必ず設計に含める。さもないと「空データを貼る」で
症状が残る。passive 側の onChanged 配線が既に正しい形なので、メインPOP をそれに揃えるのが安全。

## 次アクション
第1段は「描画トリガを storage read の後ろから外し、鏡 read + onChanged に寄せる」最小1PR。
ただし paintStoryUserLaneCoalesced は STORY_SOURCE_STATE(module 状態)依存が濃く、refresh/paint の
read path 地雷に近い領域なので、実装は実コード精査 → 小さく1段ずつ → 実機 render probe で検証する。
