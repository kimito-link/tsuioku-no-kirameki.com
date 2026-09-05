# 複数配信同時の書込競合緩和+部分読み二重記録の再発根治 — v0.1.1013 (2026-06-30)

## 結論
master HEAD = **v0.1.1013 (a4a75a5a)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1013。
3配信同時+backfill の激重(更新11694ms)と、それが生んだ二重記録の再発(記録+1765)を緩和・根治。

## 実機の状況(高負荷で隠れていた本丸)
- 3配信記録中+backfill で 更新所要 11694ms(過去最悪・fastDiagLite 3154/popupDiag 2941/backfill 2889ms)
  =単一 LevelDB が書込で完全に詰まり、status の小さな read が待たされる。
- lv350861390: 直近40秒 **本家+36/記録+1765**(時系列計器が二重計上寄りと名指し)=ほぼ全件再記録。
  v0.1.1012(非配列チャンクだけ部分読み検出)をすり抜けた二重再発。**激重(競合)が二重を生む同根**。

## 修正(記録は壊さず・競合と二重の両方)
1. content-entry.js publishCommentTimelineMirrorFromContent: **無変化 set スキップ**(per-liveId 署名
   `liveId|totalSeen|件数|最新行id`・capturedAt は内容でないので署名に含めない)。~2秒 cadence で毎回
   set していた鏡を【内容変化時だけ】書く=3配信で倍増していた書込競合を削る。
2. commentChunkStore.js readChunkedComments: **complete 判定を強化**。全チャンクが配列で読めても
   **合計件数 < index.total なら complete:false**(古い空配列/未flush で件数が欠ける部分読み)。
   v0.1.1012 は非配列だけ検出=空配列で件数欠けをすり抜けていた=keySet 不完全 seed→再到来コメントを
   新規誤判定→ほぼ全件再記録(記録+1765 の真因)。これで ensureLiveDedupeStateSeeded/seedTailFromMain が
   requeue/approx に倒れ二重を断つ。

## verify
- verify:cc 緑(非配列→false / 件数欠け2<3→false / 件数一致3===3→true / 空index→true / main fallback→true)。
- 出荷バンドル probe: 空配列で件数欠け→complete:false / 完全→true。

## まだ残る可能性(次の高負荷スクショで判断)
- **更新所要 11694ms の【1回の重さ】はこれで完全には消えない**。timeline mirror skip は書込の一部を減らすだけ。
  まだ重ければ次の安全レバー(Explore 提案・効果順): (A) panel_summary/各鏡も無変化skip (B) backfill staging
  周期(2500ms)を content persist(1500ms)とずらす (C) KEY_AUTO_BACKUP_STATE を per-liveId 分割(SW改造・会議級)。
- 二重がまだ出るなら ensureLiveDedupeStateSeeded の storedTotal===myTotal skip(content-entry.js:10168)を
  Explore 案A(write前に liveChunkIndex 更新)で詰める。今回は readChunkedComments の件数欠け検出が主因と
  判断し先に断った。次配信の時系列計器が「過剰増なし」に戻れば二重は解消と確認できる。

## 既知だがバグでないもの(今回スクショ)
- popup診断「別配信」🔴・応援者ランキング「別配信の古い鏡」🟡 = 3配信視聴で popup が別 lv を映している
  正常な検知(watch F5 で直る・状態速報自身が案内)。
- 北極星 貢献度 拡張44≠鏡3(出たり消えたり)= API 更新の谷間の一時鮮度差の可能性。安定再現したら
  publishNorthStarMirror 経路を調査。

## 今セッション出荷(v0.1.998〜1013=16版・全 push 済み・同期0/0)
## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
