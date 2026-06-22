# backfill 不進行(seg:0 rows:0 running:true triedLiveId:"")会議の収束

会議: `council/backfill-stuck-seg0-answers.json`(2026-06-22・design・2/3成功)

## 会議の結論(批判役 deepseek-r1 + groq 一致)
**最有力真因 = 仮説(a)「viewBase を crawlNdgrBackward に渡す経路が途中参加配信で欠落し、初回 view fetch が走らない」。**

根拠(会議 + 司令塔のコード裏取りで一致):
- `triedLiveId:""` が空 = `runNdgrBackfillOnce`(content-entry.js:15584)が L15601 `if (!viewBase) return` で抜けている。`_backfillTriedLiveId` は viewBase が取れた**後**(L15602)に設定されるので、空 = viewBase 段階で抜けた = (a) を裏付ける。
- `readNdgrViewBaseUri()`(L15473)は DOM 属性 `data-nls-ndgr-view-uri` を読む。MAIN world(page-intercept)が NDGR view URI を観測したら書く属性。**途中参加配信では観測が backfill キックより遅れる**ことがある。
- `ndgrViewBaseObserved:true` は診断生成**時点**の `Boolean(readNdgrViewBaseUri())`(L6372)。診断時には観測済みでも、backfill キックを試みた時点では未観測だった = タイミングのズレ。
- 仮説(b)「初回 fetch は走るが backward 空で即 done」は **triedLiveId が空であることを説明できない**(b なら viewBase が取れて triedLiveId が設定されるはず)→ 棄却。

## 全員一致の最重要規律
**コアをいじる前に、まず計器で「seg:0 で止まる箇所」を確定する。** 推測で viewBase 受け渡しを直すと外す。

## 実装(v0.1.891・計器のみ・純観測)
`runNdgrBackfillOnce` の5つの early return それぞれに理由を記録:
- `_backfillLastSkipReason` = '' | already_tried | disabled | not_recording | no_context | no_view_base | started
- 状態速報 `romiDebug.backfill.lastSkip` に出す(content-entry.js:6365付近・8980付近の2箇所)。
- 動作は一切変えない(理由を記録するだけ)=BAN リスクゼロ・回帰ゼロ。

## 次の判定(次の状態速報で確定)
- `lastSkip: "no_view_base"` → 仮説(a)確定 → **対策**: viewBase が DOM に来た後に backfill を再キックする(L16403 の駆動ループが viewBase 観測後も回り続けるか確認。回っていれば次 tick で `started` になるはず。それでも no_view_base のままなら、属性書き込み(page-intercept)が途中参加で発火していない=そちらを直す)。
- `lastSkip: "already_tried"` → 一度起動したが即終了して再アームされていない(別経路)。
- `lastSkip: "started"` なのに seg:0 → crawlNdgrBackward の初回 fetch/decode で詰まる(仮説b/c)=per-request timeout(L15495=10秒)や stopReason を追加観測。

## 安全に直せる範囲(会議3の合意)
throttle緩和・並列増強は**禁止**(BANリスク)。計器で「初手で詰まる」と確定したら、初手だけの堅牢化(viewBase 受け渡し修正・初回fetchリトライ・SW keepalive 延命)は安全側。
