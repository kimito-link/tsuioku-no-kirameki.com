# 統合: backfill stalled(失速)の真因と最小修正(司令塔の実コード裏取りで確定)

会議5応答(groq×2/gemini部分/openrouter/local qwen3・ローカル大型はVRAM abort)。**意見は割れた**
(Q1: ①疎区間seek / ③URI途切れ・429 / ④no_progress睡眠連鎖)。司令塔が実コードで裏取りして確定。

## 会議の一致点(割れなかった部分)
- **Q3 取得率の分母問題=全員一致**: official(公式件数)に gift/system/空本文が含まれ「本文ありのみ記録」の
  拡張は構造的に100%に届かない。→ 取得率を本文基準に補正 or 「ほぼ取得」体感ラベルで正直に(星野ロミ)。
- **Q4 批判役=全員一致**: stalled しきい下げ/再起動増は 429 誘発・tight ループ(v0.1.750 の rows=0 即再入)
  再発リスク。**しきいを単純に下げる(A)は危険**。

## 司令塔の裏取りで確定した真因(会議の④に近いが精緻化)
実コード(ndgrBackfillCrawl.js)の確定事実:
- 429/403 backoff = `[2s,4s,8s]`(最大14秒で停止)。**150秒には届かない**=429単独は主因でない(会議③を退ける)。
- 疎区間/空区画の橋渡し = `NDGR_BACKFILL_NO_PROGRESS_RETRY_MAX=240` 回 reseed(1回=50秒ぶん前へ・最大~200分橋渡し)。
  各 reseed の間に **pause**: 前面タブ `BACKFILL_FOREGROUND_EMPTY_RESEED_PAUSE_MS=24ms`+gap6ms / 
  **裏タブ `NDGR_BACKFILL_EMPTY_RESEED_PAUSE_MS=150ms`+gap15ms**(嵐防止で意図的に遅い)。
- stall watchdog(content-entry.js:16324): `rows>0 && noProgressMs>150秒 && gapRemains` で `stalled`→abort→rearm。

**真因 = 裏タブの遅いペース(150ms/15ms)で疎区間を240 reseed 橋渡し中に、本物のコメントへ届く前に
stall watchdog(150秒)が先に発火して abort してしまう**。橋渡しは『進捗ゼロ』に見えるが実際は
『疎区間を前へ送っている正常動作』。watchdog がそれを失速と誤認して殺す→rearm で最初から橋渡しやり直し
→また150秒で殺される、を繰り返し「大配信/裏タブでなかなか100%にならない」体感になる。
今回の実機(裏タブ13分→前面16分)は、前面化で速いペースに変わり88%まで一気に進んだ(=ペース律速の傍証)。

## 採用する最小修正(星野ロミ式・失速で殺さない・重くしない・割り切る)
**本命=会議(B)+(D)の折衷を司令塔が精緻化: 『reseed 橋渡し中は stall watchdog にハングと誤認させない』。**

1. **疎区間 reseed の "前進" を進捗として watchdog に伝える**: crawl が reseed で起点を前へ送ったら
   `_backfillLastProgressAt` を更新する(rows は増えなくても『生きて橋渡し中』を示す)。これで
   150秒 watchdog が『正常な橋渡し』を失速と誤認して殺さなくなる。abort されないので resume やり直しの
   無駄も消える=滑らかに最後まで。
   - ⚠️本当のハング(fetch が全く返らない/無限待ち)は別途 caps.elapsedMs(15分上限)で必ず停止=watchdog を
     緩めても暴走しない(既存の有界性で担保)。
2. **(補助)裏タブの reseed pause を少しだけ詰める**: 150ms→例80ms(嵐防止は保ちつつ橋渡しを速く)。
   ただし 429 誘発を避けるため控えめに・gap15ms は据え置き。effect/risk を見て第2段で。
3. **取得率の分母補正(Q3・全員一致)**: 「ほぼ取得(88%)」体感ラベルは既にある(statusFormat の捕捉率行)。
   公式件数に gift/system が混じる旨を割り切り、100%に届かなくても『🟢 ほぼ取得』で安心させる(既存維持で十分)。
   ※本文基準の厳密補正は official の内訳(gift/system 件数)を別途取らないと不可=過剰実装回避で見送り。

## やらないこと(批判役の罠回避)
- stall しきい(150秒)の単純な引き下げ(A)はしない=429誘発/tightループ再発リスク(会議全員一致の懸念)。
- 疎区間スキップ幅の拡大(C)はしない=populated バケット飛び越しで取りこぼし(50秒ステップは据え置きが鉄則)。

## 退行ゼロの担保
- 取得する区画・順序・件数は不変(取りこぼし無し)。caps.elapsedMs(15分)の有界性は維持=暴走しない。
- watchdog は『本物のハング』(elapsedMs 上限/fetch 全失敗 rate_limited)では従来どおり止める。
- 純関数化してテスト(reseed 前進で lastProgressAt 更新/本物ハングは従来どおり stalled)。

## 検証観点(実機)
大配信/裏タブでも「取り込み中」が途中で stalled に落ちず滑らかに 100%(=ほぼ取得)へ。429 増えない。
正本フル: .artifacts/backfill-stalled-answers.json。
