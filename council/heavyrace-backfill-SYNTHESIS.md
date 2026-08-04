# 素材まとめ(段1) — heavyRace再発(大配信backfill)の根治

> 3段構え段1。会議3体(critic2/lead)+Explore実コード調査+司令塔裏取り。段2でFableへ。2026-07-07。
> 会議ログ=council/heavyrace-backfill-answers.json。関連メモリ=[[embed-watch-heavyrace-inflight-guard-v1037]]。

## 症状(実配信の状態速報で確定)
大配信7,900人・過去ログ遡り中(backfill進行中)・embed_watch。heavyRaceReturns:11 / heavySettleState:"race" / activePath:"heavy" / entriesLen:307 / domTilesPainted:74。**アバター画像は31/32成功=画像は正常**。問題=heavyがraceで未settleのまま、アバターURL解決前の暫定描画(サムネ無し→たぬ姉段)で固着。withUid99.9%なのに鏡たぬ姉70件/りんく2件。**丸写し(③WEB)とは無関係=①拡張の描画層の問題(1103でも再発を実機確認)**。

## 真因(司令塔が実コード裏取り確定)
1. **canReuseHeavyChunkRead の80%再利用が backfill 中は構造的に永久不成立**(popup-entry.js:15634-15640 `cachedHeavy.arr.length >= Math.floor(currentChunkTotal*0.8)`)。backfillでtotalが秒単位で増え続ける→race時(16232)に「今読めた件+その瞬間のtotal」でキャッシュしても、次pollでtotalがさらに増えて80%を割る→また不成立→また全件read→また3秒polに追い越されrace。**v1035自己修復(一度読めた全件を次に活かす)はtotal固定前提で、動的total増加では機能しない**。
2. v1037ガード(heavyReadActive:3816・readHeavyFromStoreGuarded withTimeout15s:15702・poll見送り:21611)は【存在するが漏れる】。「readが走る間の追加refresh見送り」はするが「readが3秒で終わらず次pollに間に合わない」根本は解けていない。
3. サムネ無し固着の機序: race未settleで短い候補配列/未解決URLで tier計算→displaySrc が tier<3 で HTTP削除(storyUserLaneDisplaySrc.js:49)→Identicon/TV(たぬ姉段)。

## 会議の収束(3体)
- **Q1(canReuse成立条件)**: critic2体=(d)差分read(増分だけ読む・全件再readしない)。lead=(b)前回total基準。批判役が(b)を「total急増でまた破綻」と否定。→**(d)が理論最善だが実装リスク高(差分read関数新設・チャンク管理)**。
- **Q2(race根絶)**: 全員「readが終わるまでpollを本当に止める」。safeRefresh冒頭に `if(heavyReadActive)return`。→**但しv1032退行(早期return禁止)の地雷と正面衝突=要注意**。
- **Q3(描画単調性で緩和)**: 全員「前回の完全描画を保持しrace中の暫定で上書きしない」。displaySrc決定済みentryはpaint入口でスキップ。→**最も安全で即効**。

## 司令塔の統合判断(段2への申し送り)
会議の(d)差分read/isFullyPaintedフラグ等は実在しない前提を含む=Fableが実コードで安全化せよ。優先度:
- **即効=Q3(描画単調性)を先に**: race中に「件数が減る方向/暫定の短い候補」で上書きしない。前回の完全な描画(domTilesPainted多)を、少ない候補で塗り替えない単調性ガード。既存のdiff-skip(storyLaneTierBodyKey)を壊さず、race経路(16230-16235)で「暫定描画で上書きしない」を足す。これだけで「たぬ姉段固着」の体感は即改善。
- **根治=Q1**: 差分read(d)が正道だが実装が重い。まず「backfill中はcoverage判定のtotalを『前回読了時のtotal』でなく『安定した基準』にする」か「backfill進行中フラグを見て閾値を緩める」で canReuse を成立させ、全件再readループを断つ。差分readは第2段(それでも足りなければ)。
- **Q2上流ガードは慎重に**: v1032退行(refresh冒頭早期return=ちらつき)の地雷。safeRefreshでなく「readが遅いときの追い越しだけ」を止める最小変更に留める。

## Fableに設計させたい核心(段2)
1. **Q3描画単調性の最小実装**: race経路(popup-entry.js:16230-16235 bailHeavy RACE)で、前回のdomTilesPainted/候補件数を保持し「今回の候補がそれより少ない/暫定なら描画上書きしない」ガード。実コードで storyUserLaneRenderProbe や paintWatchPopupUi の呼び出し構造を読み、単調性をどこに足すか。既存の三重安全網・diff-skipを壊さない。
2. **Q1 canReuse成立の最小変更**: backfill進行中(total動的増加)を検知する既存の値(currentChunkTotal の履歴 or backfill state)があるか実読。80%固定閾値を「backfill中は前回読了total基準 or 増分許容」に変える最小変更。差分readは重いので、まず全件再readループを断つ方を優先。
3. **Q2**: poll見送り(21611)がなぜ足りないかを実読し、v1032退行を避けた最小の追加ガード(safeRefresh全面早期returnはしない)。
4. **③非影響の確認**: 変更が①描画層だけで③WEBの鏡/paintに影響しないこと。

## 制約・地雷
記録(content-entry)触らない・readを減らす方向のみ・refresh冒頭早期return足さない(v1032退行)・diff-skip(storyLaneTierBodyKey)触らない・backfill止めない・初回paint三重安全網触らない・popup-entry max-lines上限付近(lib抽出 or コメント圧縮)・②INLINE_PASSIVEは無影響。
