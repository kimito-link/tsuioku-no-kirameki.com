# 記録>本家コメ 102% 再評価 + 内訳計器の lite 間引き修正 — v0.1.1002 (2026-06-30)

## 結論
master HEAD = **v0.1.1002 (f35ae39c)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1002。
v0.1.1001 の内訳計器が状態速報に出ていなかった lite 間引きバグを修正。**102〜104% の真因はまだ未確定=次配信の欠落割合(計器)実測待ち**。診断の閾値・文言は触っていない。

## 新データ点(重要・仮説を1つ否定)
- 配信A lv350848725: withUidPercent=0(匿名主体)・記録9757/本家9420=**104%**。
- 配信B lv350859008: **withUidPercent=100(全部userId付き)**・記録5294/本家5200=**102%**。
- → 匿名でも非匿名でも 102〜104%。**「匿名 commentNo 欠落の二重計上」だけでは配信B を説明できない**(commentNo有り行は liveId|no|text で一意 dedup=二重しない)。

## Explore の結論は【自己矛盾で不採用】(過去2回外している教訓どおり裏取り)
- Explore は「102% は本家統計の母数差で正常」と結論。だが根拠として「本家 statistics.comments は
  gift/system を含む」(backfillRinkuNarration.js:293 のコメントで確認)を挙げた。
- **それが本当なら 本家≧記録 のはず**(記録は parseGiftCommentText でギフト除外・ndgrChatRows.js:42)。
  観測は逆(記録>本家)。→ **エージェントの「母数差で正常」は符号が逆=不採用**。
- 記録>本家 を説明できるのは: ①monotonic 焼き付き(記録は単調・一度膨れたら下がらない/monotonicCommentCount.js)
  ②記録の軽微な二重(commentNo 欠落の sec 割れ・少量) ③本家 statistics.comments の遅延/過小。
  → これ以上は**推測で直さず実測**(計器の欠落割合を見る)。

## この版でやったこと(計器を実際に出す・閾値は触らない)
- ★真因: 状態速報が読むのは **lite fastDiag**(buildStatusFastDiagLite)。これが savedCommentsUidStats から
  **withUidPercent だけ通して commentNoLess/Percent を間引いて落としていた**(statusFastDiagLite.js)。
  = v0.1.999 throughput の whitelist 落ちと**同型バグ**(表示が出ないときは間引き/whitelist 層を疑え)。
- statusFastDiagLite.js: lite に commentNoLess/commentNoLessPercent/totalSaved を通す(full と同形)。
- 出荷バンドル probe: full→lite で保持→provenance「内訳(計器): 記録のうち commentNo 欠落行 N件(P%)」が出る。

## 次の一手(実測ドリブン)
次配信の状態速報「数字の出どころ」の **内訳(計器) の欠落割合**を読む:
- 配信B(userId100%)なら欠落割合は**低い**はず。低いのに 102% → 二重計上説は弱い → ②本家遅延/過小 or ①焼き付き。
  → 候補: (a) provenance の判定を「記録>本家でも数% 差は normal 寄り(本家は遅延値で瞬間的に下回りうる)」に
     誤検知緩和、(b) officialCommentHistory(content-entry.js:2105・{at,statisticsComments,recordedComments}を
     48点/15分保持)を状態速報に出して『記録が伸びる間 本家が平らだったか』を見える化=焼き付き/遅延の確定。
- 欠落割合が**高い**配信(匿名主体)では二重計上の線が残る → loneDedupe 強化(会議級)。
- ※backfill 律速(v0.1.999)・記録104%(この計器)を次の1スクショで同時実測できる。

## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
