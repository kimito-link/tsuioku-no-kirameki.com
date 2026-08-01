# 応援レーンが「出たり消えたり」する再発 — 会議結論と次の一手

> 2026-08-02 未明。**実装未着手（計器から始めること）。**
> 会議=4体（groq/nvidia）／司令塔が実コードで裏取り。
> 前段: `HANDOFF-heavyrace-backfill-IMPL.md`（過去の対策・今回も再発している）

## ユーザーの観察（2026-08-02 実機）

- **こん太列・りんく列が出たり消えたり**する
- **ホバーカードの発言が全部は出ない**（`発言 1` と出るが1件とは限らない）
- 昨日は**同一人物が 18件 と 1件** の2通りで表示された（スクリーンショット確認）

## 実測（速報の実データ。推測ではない）

小規模配信 `lv351085410`（経過7分・来場4人・コメント3件）:

```
laneTickProbe.runs: 29          ← 描画を29回試みている
domTilesPainted: 1              ← なのに1件しか描けていない
entriesLen: 6                   ← 候補は6件ある
heavyRaceReturns: 10            ← 重い読みが10回とも追い越された
heavyReadInflightJoinCount: 10  ← 10回とも「実行中の読みに合流」
heavySettleState: "race"
shrinkKeepCount: 0              ← ★縮小ガードが一度も発動していない
```

大規模配信 `lv351085223`（記録1000件）でも `heavyRace 10回`。
別配信では `未説明5(link:DOM欠5)` / `幾何≠ link:92×40px(①183×38px)` も観測。

## ★核心の事実（司令塔が実コードで確認）

縮小ガード `shouldKeepStoryUserLaneTilesOnShrink`
（[src/extension/story/renderStoryUserLaneDom.js:167](../../src/extension/story/renderStoryUserLaneDom.js#L167)）は
**第一関門が `if (entriesProvisional !== true) return false;`**。

`shrinkKeepCount: 0` ＝ **一度も発動していない**。
「出たり消えたり」を防ぐ仕組みがあるのに、その手前で素通りしている。

## 会議の結論（★対立あり。どちらとも断定しない）

### 多数派（lead / fast / diverge の3体）: **(b) フラグが立っていない**

> `shrinkKeepCount: 0` は「第一関門 `entriesProvisional !== true` で即 false」の証左。
> `heavyRaceReturns 10` / `inflightJoin 10` / `settleState "race"` の三点セットは
> **重い読みが一度も settled になっていない**ことを意味する。
> (a)「レース自体」は症状であって原因ではない。

### ★批判役（gpt-oss-120b）の反論: **(a) レースの頻発こそ根本**

> `entriesProvisional` を強制的に true にしても、**レース自体を抑制しなければ
> 根本的な描画欠如は解決しない**。(b) への固執は根本原因を隠蔽している。
> `shrinkKeepCount: 0` は「呼ばれていない」ことしか示さず、
> 「呼ばれたが条件を満たさなかった」可能性を排除できない。

**司令塔の判断: どちらとも断定しない。** 計器で機械的に切り分けてから決める。
この対立自体が「何を測れば決着するか」を示している。

### Q2（なぜ小規模配信で起きるか）— 会議の解釈が一致

「大配信で重いから追い越される」という**既存の説明は誤り**。
来場4人・コメント3件でも `heavyRace 10回` が出る。

> 重さではなく**タイミングの不整合**。初回の heavy read が「軽すぎて」
> 同期的に終わらず、かつ settle 発火条件を満たさないまま次の tick が来続ける。
> 大規模配信では「重くて当然」なので猶予が長く、レースが目立たないだけ。

★この視点は既存の引き継ぎ文書の前提を覆すので、次のセッションは
`HANDOFF-heavyrace-backfill-IMPL.md` の「backfill中だから重い」という
前提を疑ってかかること。

### Q3（緩めたときのリスク）— 全員が警告

`entriesProvisional` を race 時に true にする／ガードを緩めると:

| 正当な減少 | 起きること |
|---|---|
| 配信切替（lv 変更） | 旧配信のタイルが残り続ける |
| contamination フィルタ（NG/ブロック） | 消したはずの人が消えない |
| 視聴者が本当に退出 | 幽霊タイルが残る |

> **守りすぎは「更新されない」バグに転化する**（過去実績あり）。
> 会場（ホバー）も同じ鏡を見ているので、人数・発言数も古いまま固定される。

### Q5（ホバー発言との関連）— 同根の可能性

diverge の見立て:
> 両方とも `laneMirrorSupply` と名寄せに依存している。
> `preCount = Math.max(1, ... || 1)` は**名寄せ失敗の既定値**。
> 名寄せ失敗 → 再取得（heavy read）→ レース、という連鎖がありうる。
> 「1件」はレース起因の症状で、**同じ木の2枚の葉**。

★ただし**未検証**。因果を測ってから断定すること。

## 次の一手（計器先行。会議は全員一致）

**直す前に測る。** 今回は「(a) か (b) か」を機械的に切り分ける計器を先に作る。

### 測るもの（会議の具体案を司令塔が整理）

| 観測値 | 何が分かるか |
|---|---|
| `provisionalFlag`（tick時点の `entriesProvisional` 実値） | (b) の真偽が直接分かる |
| `paintSkippedReason`（`none`/`shrink`/`empty`/`diffskip`/`provisional-false`） | **29回走って1件**の内訳が説明できる |
| `heavySettledAtTick`（settle した tick。未なら null） | 「一度も settle しない」の裏取り |
| heavy read 開始→tick までの時間差 | Q2（軽いのに race）の検証 |

### 判定条件（あらかじめ決めておく＝後から解釈を変えない）

- `provisional-false` が支配的 → **(b) が正しい**。フラグ側を直す
- `provisionalFlag: true` なのに `shrinkKeepCount` が増えない → ガードの条件式が悪い
- `paintSkippedReason: none` が多い（＝skipせず描いて1件） → **(a) が正しい**。供給側を追う

### 制約（破らない）

- paint のたびの DOM 全走査は禁止（過去に拡張全体を重くした）
- storage への新しい書き込みを増やさない（大配信で Chrome 全体が固まった）
- diff-skip 機構は触らない（ちらつき7版ぶんの蓄積）
- 既存の縮小ガード／空ガードを**安易に緩めない**（Q3 の退行リスク）
- **推測で直さない**。同じ機能で5回外した実績がある

## 参考

- 会議の生ログ: スクラッチパッド `council-lane-churn-answers.json`（一時領域）
- 過去の対策: `HANDOFF-heavyrace-backfill-IMPL.md`（v0.1.1034 で heavySettleState:race 6回を確認済み）
- 関連メモリ: `story-userlane-churn-filllanetier-v1039`（ちらつき7版の総括。
  真犯人は「消す/空にする側に計器も diff-skip も無かった」こと）
