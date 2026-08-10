# 取り込み中の部分読みでコメント二重記録 根治 — v0.1.1012 (2026-06-30)

## 結論
master HEAD = **v0.1.1012 (e61da5f2)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1012。
今セッションで初めて**本物の二重計上**を時系列計器で確定し、根治した。記録>本家(102%)の真因の1つ。

## 確定の経緯(計器3点+時系列ガードが設計どおり機能)
- 実機 lv350854400(チャンクモード・記録14817・**取得1505件/秒=backfill走行中**): 直近25秒 **本家+0/記録+189**
  =本家1件も増えてないのに記録過剰増。欠落0%(全行 commentNo あり)。
- v0.1.1008 の時系列ガードが正しく🟡維持し「記録の過剰増(二重計上)寄り」と名指し=本物を初確定。

## 真因(司令塔が実コードで確定・Explore の同タブ race 説は不採用)
- Explore は「persistCommentRowsImpl の write と次 seed の timing gap で storedTotal===myTotal 誤skip」と
  結論したが、persist は **persistCommentRowsChain で直列化**(content-entry.js:10010)=同タブ並行 flush は
  起きない=race 説は不採用(6回目の取捨)。backfill 行も content の persistCommentRows 経由で同チェーン(9280)。
- ★真因 = **readChunkedComments(commentChunkStore.js:285-288)が読めなかったチャンク(非配列=競合で
  timeout/未flush)を黙ってスキップ**して rows を返していた。storage 競合(1505件/秒+2配信)で一部チャンクが
  読めないと、dedup の keySet が【実際の保存件数より少ないキー】で seed → その漏れたチャンクのコメントが
  再到来時に keySet 不在=新規誤判定 → 二重記録。monotonic で焼き付き 102% 居座り。
  → 「競合下でだけ起きる correctness バグ」で、ずっと戦ってきた重さ(競合)と同根。

## 修正(記録は消さない・「読めないなら書かない」)
- commentChunkStore.js readChunkedComments: 返り値に **complete** を追加(全チャンク配列で読めたら true・
  いずれか非配列なら false)。
- content-entry.js ensureLiveDedupeStateSeeded: **complete===false なら seed せず requeue({ok:false})**
  =不完全 keySet で dedup しない(完全に読めるまで保存を遅らせる=既存 timeout 方針と同じ)。
- content-entry.js seedTailFromMain: 部分読みなら **main=null で approx 経路**へ(tailKnownCommentNoKeys を
  不完全 keys で作らない=tail 再追記での二重も断つ・欠けた行は畳み込み時 mergeNewComments が最終 dedup)。

## verify
- verify:cc 緑(readChunkedComments: 全読→true/1チャンク欠落→false/空index→true/main fallback→true)。
- 出荷バンドル probe: 全チャンク→complete:true rows=3 / 1チャンク欠落→complete:false rows=2。

## 効果と確認方法
- 取り込み中の記録過剰超過(本物の二重)を根治。記録漏れなし(完全に読めるまで安全に待つ=requeue)。
- ★次配信で時系列計器が **本家Δ≈記録Δ(過剰増なし)** に戻れば確認できる。逆にまだ 本家+0/記録+N が
  出るなら別経路が残る(その時は ensureLiveDedupeStateSeeded の storedTotal===myTotal skip(10168)を
  Explore 案A(write前に liveChunkIndex 更新)で詰める=今回は readChunkedComments の部分読みが主因と判断し先に断った)。

## 今セッションの「記録>本家」全体(計器→確定→根治の完成形)
1-5. v0.1.998/1001/1002/1003/1007/1008: 欠落割合・鮮度クロック・時系列計器+ガードで「誤検知(本家遅延型)」を全消し。
6. **v0.1.1012: 本物の二重(部分読み)を根治**。→ 誤検知も本物も両方カタがついた。

## 残(別系統)
- 更新の重さ(1回の summaries 905ms 等): 間引きで頻度は下げた。まだ重ければ書込側(timeline mirror 無変化skip 等)。
- 会場座席(venue-seats)完全性スコア不合格。backfill 律速そのもの(取得遅さ)は v0.1.999 計器の実測待ち。

## 今セッション出荷(v0.1.998〜1012=15版・全 push 済み・同期0/0)

## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
