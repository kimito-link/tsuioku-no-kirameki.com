# 貢献度ランキング鏡「不一致(コピー漏れ)」誤検知 根治 — v0.1.1000 (2026-06-29)

## 結論
master HEAD = **v0.1.1000 (77edbf4a)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1000。
実機 lv350857956 の「3画面パリティ🔴不一致: 北極星 貢献度 拡張42≠鏡10」は **誤検知**。データ欠落ではなく診断の比較基準ミス。

## 真因(司令塔 + Explore 2系統で確定)
- 鏡(純Webに送る northStarMirror)は**設計上 1 レーン 10 件で頭打ち**(NORTH_STAR_LANE_ROW_CAP=10・
  ニコ生本体の 1-10 位表示に合わせる。popup-entry.js:10043 で `ranking.slice(0,10)` を描画にも鏡にも渡し、
  northStarMirror.js capRows でも再 cap)。**描画・鏡・純Web は同じ10件で一致=データは1件も失われていない**。
- 一方 `apiRows=42` は **koken API の生取得深度**(content-entry.js:6200 `kokenApiRows.length`・11位以降含む)。
- 整合チェック(liveviewPublishSelfDiag.js judgeNorthStarConsistency)が **生42 vs 鏡10** を突合し、
  差が許容幅(2)超 → mismatch🔴 と誤判定。広告レーンが✅だったのは nicoad API がデフォルト10件設計で
  たまたま cap に当たらなかっただけ。

## 修正(記録・描画・鏡publish には触らない=診断の比較基準だけ)
- northStarMirror.js: `NORTH_STAR_LANE_ROW_CAP` を **export**(鏡上限の単一正本)。
- liveviewPublishSelfDiag.js judgeNorthStarConsistency: **apiRows を鏡上限でクランプしてから突合**。
  `ext = min(apiRows, CAP)`。20→10 等の設計通り cap は match、鏡=0 や 鏡<min(api,cap) の本物の欠落は
  引き続き🔴。mismatch メッセージは生件数(生42)を併記して透明性を保つ。`extRows`(pushConsistency)は
  生値のまま=既存テスト不変。

## verify
- verify:cc 緑。新規回帰: 42→鏡10=match / 上限後も鏡3<10=mismatch / 生件数併記。
  既存(6→2 mismatch・7→6 normal鮮度差・鏡0完全欠落)は cap 未満で挙動不変=緑。
- 出荷バンドル(src 実モジュール)で実機シナリオ probe: 貢献度42/10→match=true・広告10/10→match=true。
  純ロジック診断なので DOM 描画なし=ブラウザ install 不要(throughput の whitelist 層のような表示プラミングは無い)。

## 教訓
- 「拡張 N ≠ 鏡 M で大差」は必ずしもコピー漏れでない。**鏡側に意図的 cap がある**なら診断は同じ cap で
  比較せよ(生の取得深度を基準にしない)。整合チェック系を足すときは「両者が同じ正規化を経ているか」を確認。

## 残課題(別系統)
- backfill 取得率: v0.1.999 でスループット計器を出荷済。**次配信のスクショで律速(seek か)を実測**してから直す。
