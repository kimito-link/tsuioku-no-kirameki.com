# 記録>本家「焼き付きvs本家遅延」時系列計器 — v0.1.1007 (2026-06-30)

## 結論
master HEAD = **v0.1.1007 (c2a8ad57)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1007。
記録>本家(要確認)の最後の切り分け材料(時系列デルタ)を状態速報に見える化。次スクショ1枚で
「本家遅延(無害)か本物の二重計上か」が確定する。

## 背景(今セッションの記録>本家 追跡の到達点)
- v0.1.998 commentNo欠落の一時二重根治 / v0.1.1001-1002 欠落割合の内訳計器 / v0.1.1003 鮮度クロック根治。
- だが実機 lv350859704(記録1178>本家1169=101%・欠落0%・本家新鮮・終了配信で更新止まり)が
  鮮度クロックでも救えず要確認のまま=本物の二重か本家遅延か未確定だった。

## この版でやったこと(計器のみ・新規 read ゼロ・記録は触らない)
- ★気づき: 切り分け材料は **panel_summary に既にあった**。
  officialStatisticsCommentsDelta(本家Δ) / officialReceivedCommentsDelta(記録Δ) /
  officialCommentSampleWindowMs(窓) = content-entry が officialCommentHistory(48点/15分)から算出して
  panel_summary に同梱済み(watchSnapshotOfficialFields.js)。officialCommentHistory を別途 publish 不要だった。
- status-entry.js summarizeOneLive: 上記3デルタを lv summary に載せる。
- commentCountProvenance.js: p.timeSeries を持たせ、check 時に
  「時系列(計器): 直近N秒で 本家+X / 記録+Y — 本家Δ≈記録Δ＝母数差/本家の遅延寄り(記録が正しく先行)
   | 記録Δが本家Δを上回る＝記録の過剰増(二重計上)寄り」。
  判定しきい値: 記録Δ - 本家Δ > max(2, 本家Δ*0.2) なら二重寄り、それ以外は遅延寄り。
  併せて本家コメ齢表示を officialCommentStatsAgeMs(公式統計更新時刻)優先に統一(v0.1.1003 と整合)。

## verify
- verify:cc 緑(本家Δ≈記録Δ→遅延寄り / 記録Δ≫本家Δ→二重寄り / 材料無し→時系列行出さず後方互換)。
- 出荷バンドル probe: 50/51→「母数差/本家の遅延寄り」・10/60→「記録の過剰増(二重計上)寄り」。

## 次の一手(実測ドリブン・これで確定)
ユーザーが 101% 配信の状態速報を共有 → 「時系列(計器)」行を読む:
- **本家Δ≈記録Δ** = 本家統計の遅延/母数差(記録が正しく先行)=**無害**。→ provenance の判定を normal 寄りに緩める検討(終了配信や本家Δ≈記録Δ なら check しない)。
- **記録Δ≫本家Δ** = 記録の過剰増=**本物の二重計上**。→ loneDedupe 強化(会議級・同一text連投を誤消ししない設計が要)。

## 今セッションの「記録>本家」関連 計器の全体像(切り分けの3点セット)
1. 欠落割合(v0.1.1001/1002): 匿名主体か(commentNo欠落の二重温床)。
2. 鮮度クロック(v0.1.1003): 本家が本当に新鮮か(officialCommentStatsAgeMs)。
3. 時系列デルタ(v0.1.1007): 本家Δ vs 記録Δ(焼き付き/遅延 vs 二重)。
→ この3つで「記録>本家」の原因が状態速報1枚でほぼ確定できる。

## 残(別系統)
- backfill 律速(v0.1.999 計器の実測待ち)。会場座席(venue-seats)完全性スコア不合格(別途)。
- ②北極星鏡取りこぼしは直近スクショで✅一致に戻った(一時的鮮度差だった可能性・再発したら publishNorthStarMirror 経路を調査)。

## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
