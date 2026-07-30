# 過去ログ完了後に「取り込み中」へ戻る不具合 — SYNTHESIS

最終更新: 2026-07-14  
状態: 実装修正・対象テスト完了

視覚フロー: [backfill-complete-loading-flow.html](../docs/backfill-complete-loading-flow.html)

## 目的

過去ログ一括取得が `done=1 / stopReason=reached_start` で完了したあと、記録件数が公式件数の95%未満でも、公式比較行を「取り込み中」に戻さず「最新まで取り込み済み」と表示する。

## 非目的

- 一括取得エンジンや保存件数の変更
- 公式件数と記録件数の差を埋める処理
- version bump、dist生成、commit、push
- 既存の v0.1.1133 会場表示作業

## 実コードで確認した真因

1. content側は配信開始まで遡ると `done=1` と `stopReason='reached_start'` を保存していた。
2. popup側の `_backfillStateForOfficial` は storage `onChanged` だけで更新され、popupを完了後に開くと既に保存済みの状態を復元していなかった。
3. 状態を更新しても公式比較行を即時再描画していなかった。配信終了後は次の件数更新が来ないため、古い「取り込み中」が残り得た。
4. `resolveOfficialComparisonDisplay` は95%以上だけを完了扱いし、95%未満の `reached_start` を `recordingActive` の「取り込み中」へ落としていた。

OneDrive同期はユーザー確認により常時停止中であり、この因果から除外した。

## 状態遷移の正本

| 入力状態 | 表示 |
|---|---|
| `running=true` | 過去ログを取り込み中 |
| `done=true, stopReason=reached_start` | 最新まで取り込み済み |
| `done=true, stopReason` が中断系 | 再接続待ち |
| popup再起動後、同一lvの直近progressあり | progressを復元して上記判定を再実行 |

優先順位は `reached_start` の明示完了が件数比率より上。公式件数には保存対象外の差があり得るため、完了判定を95%だけに依存させない。

## 変更

- `src/lib/backfillRinkuNarration.js`: `reached_start` を明示完了として優先。
- `src/extension/popup-entry.js`: 保存済みprogressを公式比較状態へ復元し、live通知と復元の両経路で比較行を即時再描画。
- `src/lib/backfillRinkuNarration.test.js`: 公式5,200件・記録4,100件でも `reached_start` は完了になる回帰テスト。
- `src/extension/popupBackfillCompleteState.wiring.test.js`: popup再起動経路とlive通知経路の状態復元・再描画順序を固定。

## rollback

上記4ファイルの本件差分だけを戻す。保存形式・storage key・権限は変更していないため、データ移行は不要。

## 検証

- 対象Vitest: 2ファイル / 93件 pass
- 全単体テスト: 602ファイル / 7,836件 pass（1ファイルskip・6件todo）
- 対象ESLint: pass
- `node --check`: pass
- `npm run typecheck`: pass
- `git diff --check`: pass
