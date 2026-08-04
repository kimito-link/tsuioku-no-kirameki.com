# 会議SYNTHESIS(司令塔統合・裏取り済): 3画面パリティ「同一で完全」の総合診断

> 会議: scripts/meeting.mjs(動的ルーティング design・CRITICS=2)。4メンバー(lead/fast/critic×2)が強く収束。
> 司令塔(Opus)が実コードで裏取りし、会議案の地雷を1点補正して1案に統合。

## 結論(1案)
状態速報の**先頭に「総合パリティ判定」1行**を出す。①POP=②応援プレビュー=③WEBプレビューが
「同一で完全」かを ✅合格 / 🟡保留(判定不能) / 🔴不一致 の3値で示し、🔴/🟡 のときは**決定木で唯一の原因**を
1行添える。判定は**既存指標(diagnosticsTrust / liveviewPublishSelfDiag / render probe / perfDiag)の roll-up**で作り、
②③の「実際に描けたか」だけは観測手段が無いので**最小の追加**(②③が自分の描画完了を専用キーに best-effort 書き戻し)で補う。

## 判定式(会議合意・必須条件 AND)
PARITY_OK = ①POP描画OK && ②応援描画OK && ③WEB描画OK && データ整合OK
- perf(paintMs/白化)は**警告(🟡)のみ**=×にしない(遅いだけで不一致と断じない)。
- どれか**取得不能**(watch無し/未ロード/未publish/apiRows無し) → 🟡保留(×にしない=誤検知根絶)。
- 必須が**取得できているのに false** → 🔴不一致。

| 観測 | 合格条件 | 取得元(既存) | 取得不能時 |
|---|---|---|---|
| ①POP 描画 | storyUserLaneRenderProbe.started>0 かつ northStarRenderProbe.refreshAllStarted>0(+paintMs>0) | popup診断(diagnosticsTrust) | watch無し/popup未取得=保留 |
| ②応援描画 | 応援プレビューの描画完了フラグが新鮮(now-Tfresh) | **追加(下記・地雷回避版)** | フラグ無し=保留 |
| ③WEB 描画 | publish 済(lastPost.everSent && ok)かつ lastPost が新鮮 かつ 送った鏡の整合OK | liveviewPublishSelfDiag(publish/lastPost) | 未publish=保留 |
| データ整合 | consistency が全て match/normal(拡張 apiRows ≒ 鏡件数・現配信 liveId 一致) | liveviewPublishSelfDiag.consistency | apiRows無し=保留 |

## 決定木(×/保留の原因を一意に・優先順)
1. watch無し or popup診断が古い/未取得 → 🟡保留「視聴中の配信が無い/popupを開くと埋まる」
2. 拡張バージョンが旧 → 🟡保留「新コード未ロード(🔄リロード)」 ※v0.1.984 で版併記済=これで判定可
3. ①POP描画OK=false(probe 0) → 🔴「①が描画起動していない(a)」
4. データ整合 false(鏡空/別配信/大差) → 🔴「①は描けたが鏡に出ていない/食い違い(b)」
5. perf 白化 → 🟡「スクロール等で白化(c)・警告」
6. ②応援フラグ無し/古い → 🟡or🔴「②応援プレビュー未描画」
7. ③未publish → 🟡「WEBへ未送信(e)・『WEBでも公開する』を押す」/ publish済なのに不整合 → 🔴

## 司令塔の裏取りと【補正】(会議案の地雷を1点修正)
会議(critic)の「②③が描画完了フラグを storage に書き戻す」案は、そのままでは**地雷**:
- 実コード原則(popup-entry.js:792/5575等)= **INLINE_PASSIVE(応援プレビュー)は storage に書かない/鏡・診断を上書きしない**
  (本物 popup の鏡と競合させないため)。会議の「観測のみだから OK」は原則に反する。
- 【補正】②応援プレビューは**本物の鏡キーを上書きしない**。代わりに **passive 専用の別キー**
  (例 `nls_preview_render_ack_v1`=passive だけが書く・本物 popup は読まない)に「描画完了+時刻+liveId」を
  best-effort で書く。これは「鏡を上書きしない」原則を保ったまま「②が描けた」を status に伝えられる。
  render probe は既に recordStoryUserLaneStep でメモリにあるので、その started/domTiles を ack キーに出すだけ。
- ③WEBは公開ページの DOM を status から読めない(別ドメイン)。**観測の天井は「publish 済+新鮮+送った鏡が整合」**。
  これで「③に正しいデータが届いた」までは保証でき、純Web側の描画は v0.1.96x で鏡を貼るだけ=整合すれば描ける。
  (③の実描画 ack が要るなら将来 ingest で webReady を書き戻すが、第1段では publish+整合で代替=最小)。

## 第1段の最小実装(1 PR・観測のみ・§6地雷ゼロ)
1. `src/lib/parityVerdict.js`(純関数): 入力=既存の {popupProbe(diagnosticsTrust), liveviewPublishSelfDiag,
   previewAck, extVersion}, 出力={verdict:'ok'|'pending'|'mismatch', reason, nextAction}。決定木を1か所に集約。
   characterization test で a〜e の各ケースを固定(誤検知=保留になることを検証)。
2. 状態速報の先頭(診断の信頼性の直前)に1行: 例
   - `## 3画面パリティ: ✅ 同一で完全(①POP=②応援=③WEB)`
   - `## 3画面パリティ: 🟡 保留 — 視聴中の配信が無い/🔄リロード/WEB未送信のいずれか`
   - `## 3画面パリティ: 🔴 不一致 — ①は描けたが北極星鏡が空(b)。鏡publishの取りこぼし`
3. ②応援プレビュー: passive 専用 ack キー(別キー・best-effort・本物の鏡不可侵)に描画完了を書く。
   status がそれを読んで「②描画OK」を判定。
4. perf/白化・版・watch有無は**保留理由**として既存値を流用(新規計測なし)。

## 反論・リスク(会議+司令塔)
- ②の ack キーが「passive は書かない」原則の例外になる→**別キーで本物の鏡を汚さない**なら原則の趣旨(競合回避)は守れる。
  それでも気になるなら ack を書くのは「描画完了の瞬間1回・min-gap」に限り、本物 popup は ack を一切読まない(片方向)。
- ③は実描画を status から確証できない=「publish+整合」で代替=厳密には「届いた」止まり。これは技術的天井で、
  純Web の描画は鏡を貼るだけ(既存)なので整合すれば描ける、という設計上の信頼に乗る(正直に「③は送達まで確認」と明記)。
- 誤検知防止が最重要: 取得不能は必ず🟡保留。✅は「必須が全部取れて全部OK」のときだけ(厳しめ)。

## 到達条件
状態速報1枚の先頭を見れば、運営者が「3画面そろってる?」に ✅/🟡/🔴 で即答でき、🔴/🟡 は次の一手まで分かる。
誤検知(鮮度差/未ロード/未publish を×にする)を出さない。描画/記録/数字の挙動は不変(観測のみ)。
