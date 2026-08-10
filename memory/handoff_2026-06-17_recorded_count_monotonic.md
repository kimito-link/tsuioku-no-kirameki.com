# 引き継ぎ: 記録件数「増えて減る」の表示単調化 (v0.1.792・未コミット)

> このセッションは本文に内部ツール呼び出し断片を出してしまい汚染。CLAUDE.md §2 に従い中断。
> 新チャットで続きを引き継ぐ。会話全文は不要。下記だけで再開できる。

## やろうとしていること

ユーザー実機(状態速報)で「とれた記録が増えて、そして減る現象」。記録件数が後退して見える。

## 真因(司令塔が実コードで確認済み・確定)

content-entry.js の正本変数 `observedRecordedCommentCount`(モジュールスコープ)に、
6箇所以上の【絶対代入】があり単調ガード無し:
- テール経路3箇所: `= tailMainCount + tailRowsBuffer.length`
- offscreen DB append 2箇所: `= total`(total>0 のときのみ)
- incremental/chunk 経路1箇所: `= effectiveTotalCount`(= liveChunkIndex.total + incrementalAdded.length / next.length)

これらが非同期に別々の正本(テール/IDB/chunk)を読んで絶対代入→バックフィルが大量に足した直後に
テール経路の小さい値が上書き→表示後退=「増えて減る」。リセットは2箇所(配信切替/非watch遷移)のみ。

## 会議結論(4/12応答 groq×2/openrouter/qwen3・全一致)+司令塔の裏取り

会議は「(B) setRecordedCount ヘルパーに集約して正本変数を単調化」を推した。
**だが司令塔の裏取りで(B)は危険と判明**: observedRecordedCommentCount は表示用と【内部ロジック用の
実件数】の二役。バックフィルの gap 計算(gapForSweep)・evaluateRecordingStall・テール compaction が
【生件数】を必要とする。正本変数を単調化(過去最大に固定)すると gap/stall が壊れる。

**採用した安全策=(C) 表示サマリに渡す瞬間だけ単調化**:
正本変数は生のまま(内部ロジック不変)。表示ソースになる buildPanelLiveSummary / buildCommentSummary に
渡す recordedCount だけ、既存の純関数 monotonicCommentCount.js (resolveMonotonicCommentCount)で
「同一lv内で後退させない・lv変化で自動リセット」を通す。新ヘルパー不要・既存純関数の再利用。

## 既に【ファイルに入っている】変更(未コミット・未検証)

src/extension/content-entry.js:
1. import 追加: createMonotonicCommentCountState, resolveMonotonicCommentCount from '../lib/monotonicCommentCount.js'
2. observedRecordedCommentCount 定義の直後に追加:
   - const _recordedDisplayMonotonicState = createMonotonicCommentCountState();
   - 関数 recordedCountForDisplay(lid) = resolveMonotonicCommentCount でゲートした値を返す
3. buildPanelLiveSummary の recordedCount: observedRecordedCommentCount → recordedCountForDisplay(lid)
4. buildCommentSummary の recordedCount: observedRecordedCommentCount → recordedCountForDisplay(liveId)
5. resetOfficialCommentSamplingState に追加: _recordedDisplayMonotonicState.lv=''; .max=0;(単調化の罠回避)

src/lib/changelog.js: 0.1.792 エントリ追加済(summary「記録件数が増えてから減る表示を止めた」18字)
extension/manifest.json / package.json: version 0.1.792 に更新済
extension/dist/*.js: 直近の build 由来(content/popup/status が M)

## 新チャットで【まだやってない】こと(ここから再開)

1. テスト追加: monotonicCommentCount.js は既存テストあり。content の配線が壊れてないか判断。
   最低限 resetOfficialCommentSamplingState がゲートをクリアする点を担保したい。
2. verify:cc 実行(test/lint/typecheck/build/bump)→ 全緑確認。
3. git: branch 作成 → 自分の変更ファイルだけ stage → commit(メッセージはファイル経由 -F で渡す。
   PowerShell here-string の @ 混入に注意)→ master ff マージ → push。
   - stage 対象: src/extension/content-entry.js src/lib/changelog.js package.json extension/manifest.json
     extension/dist/content.js (+ build が status.js/popup.js を触るなら差分を確認して必要分だけ)
   - 注意(parallel-git-staging-hygiene): popup.js/status.js はこのタスクと無関係にセッション前から M
     だった可能性。git diff で中身を確認し、自分の変更(content 由来)だけ入れる。
4. MEMORY.md 更新 + 正本 reference 化。会議正本素材は
   council/recorded-count-regression.md と .artifacts/recorded-count-regression-answers.json。
5. ユーザーに「3手順(git pull→拡張リロード→状態ページ開き直し)」併記で報告(v0.1.792)。

## 検証観点(実機)

「同じ配信中に記録件数が一度出た数値より下がらない・別配信に切り替えたら0から正しく数え直す・
バックフィル(追いつき)や記録の保存自体は従来通り動く(=内部ロジックを壊してない)」。

## 直前のバージョン文脈(参考)

- v0.1.790 会場の人が時間で減るのを根治(満席維持)・push済(fbc46f3e)
- v0.1.791 記録が追いつく途中を「⏳追いつき中」表示・push済(2b948dda)
- v0.1.792 ← 今回(記録件数の表示単調化)・未コミット
