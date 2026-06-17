# お題: 記録件数が「また減る」— v0.1.792 の表示単調化を入れたのに再発した真因

## 背景(司令塔が実コードで確認済みの事実。推測でなく確定)

ニコ生視聴を盛り上げる Chrome 拡張(MV3)。視聴中の配信のコメントを記録し、件数を
状態速報(fastDiag UI)/popup に出す。**ユーザー実機で「再び記録が減る挙動」**。

v0.1.792 で「表示の直前(サマリ生成)で同一 lv 内は後退させない単調ゲート」を入れた:
- `monotonicCommentCount.js` の `resolveMonotonicCommentCount(state, lv, candidate)`(同一 lv で
  max を下回らせない・lv 変化で自動リセット)。
- content-entry.js の `recordedCountForDisplay(lid)`(単一 state `_recordedDisplayMonotonicState`)が
  これを通し、`buildPanelLiveSummary`(panel summary)/`buildCommentSummary`(comment summary)に渡す。
- 状態速報の per-live「記録 N」は status-entry が **panel summary(=ゲート済み値)** を読む。
- 状態速報の「累計 記録」は statusFormat.buildOverviewText が **各 live の panel summary 値を単純合算**。

つまり「同一 tab・同一 live・recording ON のまま」では表示は後退しないはずだが、再発した。

## 司令塔が実コードで特定した「ゲートを無効化しうる」経路(2つ)

### 経路1: 記録 OFF/ON のトグルで単調ゲートごとリセット
content-entry.js の `chrome.storage.onChanged` で `KEY_RECORDING` が OFF になると:
```
} else {                                   // recording → OFF
  ndgrLastReceivedAt = 0;
  cancelPendingDeepHarvest();
  resetOfficialCommentSamplingState();     // observedRecordedCommentCount=0 かつ
                                           //   _recordedDisplayMonotonicState.lv=''/max=0
  ...
}
```
`resetOfficialCommentSamplingState()` は **生件数を 0 にし、単調ゲートも明示クリア**する。
直後のフラッシュは `observedRecordedCommentCount = tailMainCount + tailRowsBuffer.length`(テールから
seed し直した小さい値)になり、リセット済みゲートはこの小さい値を新 max として採用→
**panel summary に小さい値を書く=状態速報の「記録 N」が後退**。
→ 同一 live でも recording が一瞬でも OFF→ON すると後退する。設計上は「配信切替/離脱」を想定した
  リセットだが、同一 live の OFF/ON トグルでも発火する。

### 経路2: 累計の合算対象から live ブロックが消える
状態速報の「累計 記録」は status-entry が enumerate した各 live の panel summary を合算。
- enumerate は ① `chrome.tabs.query`(開いている watch タブ)→ ② fastDiag.lives → ③ last watch URL
  の優先順。
- ある live の **panel summary キー(`nls_panel_summary_<lv>`)が storage クランプで蒸発**、または
  **その live の watch タブが閉じる**と、その live が enumerate から外れ **合算から落ちる=累計が減る**。
- 実機 diag で `multiTabDiag.eventDomLvCount=31`・`staleDomBundleSuspected=true`=per-live データが
  大量に滞留しており、クランプ蒸発・enumerate 揺れが起きやすい状況。

## 実機 diag の関連事実(2026-06-17T03:52)
- 記録中 2 配信: lv350770080(記録 88/公式 198・recording:true)、lv350769922(記録 7/公式 131)。
- `romiDebug.backfill = { running:true, rows:0, seg:0, done:0, stopReason:"" }`=バックフィルは
  走っているが 1 セグメントも yield していない(v0.1.795/796 の背面 backfill stall と同系統。
  背面 kick は v0.1.796 で既定 OFF 済み。前面 backfill も rows:0)。
- `nicknameDiag.liveIdChangedNonSwitchCount=1`=「切替でない liveId 変化」が 1 回観測。
- `commentIngestBySource`: visible 709 / mutation 119 / deep 85 / ndgr 5 / backfill 0。
- `observedRecordedCommentCount: 88`(生値・diag は生値を出す)。

## 問い(これに答えてほしい)

1. **どちらの経路が「記録が減る」の本命か**(両方ありうるが、実機で起きやすいのは?)。
   経路1(recording OFF/ON で gate ごとリセット→低値書き込み)か、
   経路2(累計の合算対象から live が落ちて累計が減る)か。診断材料(`liveIdChangedNonSwitchCount=1`・
   `staleDomBundleSuspected`・2 配信同時)からどちらを優先して直すべきか。

2. **経路1の安全な直し方**:
   - (A) `resetOfficialCommentSamplingState()` を「生件数リセット」と「単調ゲートリセット」に分離し、
     ゲートは **lv が実際に変わった時だけ**クリアする(同一 lv の recording OFF/ON ではゲートを保つ)。
   - (B) recording OFF→ON のトグルではリセットせず、live 切替(liveId 変化)だけでリセットする。
   - (C) 単調ゲートを per-live Map(`_recordedDisplayMonotonicState` を lv ごとに保持)にして、
     同一 lv に戻ったとき過去 max を復元する。
   どれが安全で副作用が少ないか。**「同一 live の recording OFF/ON で後退しない」かつ
   「本当の配信切替では正しく 0 から数え直す」を両立**できるのはどれか。

3. **経路2の安全な直し方**(累計が live 脱落で減るのを防ぐ):
   - per-live の「これまでの記録 max」を storage に持って enumerate から落ちても合算に含める案は、
     storage 書き込み増(過去に storage 飽和事故あり=禁忌)とのトレードオフをどう見るか。
   - あるいは「累計が減ったら据え置く」表示単調化を **overview 層**にも掛けるべきか
     (per-live と同じ思想を累計にも)。これは「タブを閉じたら本当に減る」を隠す危険があるか。

4. **真因 vs 対症**: v0.1.792 は per-live 表示単調化という対症だった。今回も対症(ゲート保持/累計単調化)で
   十分か、それとも「件数の正本を 1 つにする」根本(per-live max を storage で正本化)に踏み込むべきか。
   over-engineering と storage 飽和を避けつつ「もう減らない」を達成する最小案は?

5. **批判役**: 「単調化の罠」を必ず 1 つ指摘せよ。recording を本当に止めて別 live を見て戻ったとき、
   per-live Map に古い max が残って「実際は 0 件の新セッションなのに古い大きい値を出す」誤動作は
   起きないか。lv だけでなく「録画セッション ID」で区別すべきか。

## 制約
- 記録の永続(IDB/chunk/テール)の不変条件は壊さない。表示/カウントの後退だけ止めたい。
- **新しい storage 書き込みを増やさない**(過去に storage 飽和事故あり)。増やすなら 1 キー・有界・
  既存 set に相乗りで。
- 純関数化してテスト可能に(monotonicCommentCount.js と同じ作法)。
- 「安全に」が最優先=既存の記録経路を壊すリスクが最小の案を選ぶ。
- 星野ロミ観点(重くしない・有界・割り切る・体感最優先)。

## 出力フォーマット
`結論 → 根拠 → 反論・リスク → 具体案(どこに/擬似コード)` の 4 ブロックで。
