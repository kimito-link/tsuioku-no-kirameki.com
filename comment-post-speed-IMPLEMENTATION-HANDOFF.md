# 実装ハンドオフ: コメント投稿の反応速度改善(MVP)

> 正本設計: [`comment-post-speed-DESIGN.md`](comment-post-speed-DESIGN.md)
> 日付: 2026-07-19〜20。3段構えワークフロー(council-fable)手順3の産物。実装はこのファイルを
> 読めば着手できる粒度。

## 背景(1行)

自分のコメントが送信後に画面に反映されるまでの体感遅延の正体は「echo(実着)2.7秒」ではなく、
既に実装済みの楽観表示(pending-self)が**押下直後に再描画トリガされず**、storage往復+最大
450msスロットル+refresh完了を待っているだけ、という配線漏れ(設計書§A/事実7)。

## MVPスコープ(今回はこれだけ)

設計書§Gの通り、**Phase 0(計器のみ・挙動変更ゼロ)→Phase 1(即時paint)**の2段階。
Phase 2(入力欄の楽観クリア、§B-3)はユーザー裁定待ちのため今回やらない。

## 着手手順

### 1. ブランチを切る

```bash
git checkout -b feat/comment-post-instant-paint
```

### 2. Phase 0: 計器追加(挙動変更ゼロ)

`src/lib/commentPostDiag.js`に以下を追加(設計書§F参照):

- state: `lastOptimisticPaintMs: -1`, `avgOptimisticPaintMs: -1`, `instantPaintRuns: 0`
  (`makeInitialCommentPostDiag`に追加)
- 純関数: `takeOptimisticPaintSamples(marks, displayedPendingAts, nowMs)` →
  `{ samples: number[], remaining: Mark[] }`(TDD、テスト先行)
- `buildCommentPostDiagSnapshot()`のフィールド列挙に**必ず**新フィールドを追加すること
  (白リスト方式・漏れるとサイレントに-1/0固定のまま=地雷§I-1)
- `buildCommentPostDiagLines()`に3行目を追加: `→ 楽観表示 直近X秒(平均Y秒) / 即時paintN回`

`popup-entry.js`側の配線:
- モジュールスコープに`_commentPostOptimisticMarks`(上限8件・TTL30秒でprune)
- `submitComment()`の楽観追記時(`appendSelfPostedComment`呼び出し直後)にmarkを積む
- refreshのpaint完了直後(`paintWatchPopupUi()`後)に、今回表示されたpending-selfエントリの
  at集合とmarkを`takeOptimisticPaintSamples`で突合してsample化

**完了判定**: `npm run verify:cc`緑。実機で状態速報の「コメント送信」セクションに新3行目が
出ることを確認(出る前にPhase 1へ進まない)。

### 3. Phase 1: 即時paint配線(挙動変更あり)

Phase 0の計器で「押下→楽観表示」の現状値を実測してから着手する(診断ファースト)。

#### 3-1. `src/lib/popupStorageRefreshCoalesce.js`に`scheduleImmediate`追加

設計書§B-1・§Jのコメント規約通りに実装。TDD:
`popupStorageRefreshCoalesce.test.js`に以下3テストを先に追加:
1. floor(既定150ms)を超えていれば即時実行される
2. floor内ならスキップし既存trailingに委ねる
3. 即時実行後は`lastPaintAt`が更新され、直後のscheduleがtrailing化する(leading判定を通らない)

既存`schedule()`のテストは無変更で緑のままであることを確認。

#### 3-2. `submitComment()`への配線(popup-entry.js)

`requestSelfCommentInstantPaint()`(薄い関数、`coalescedRefreshScheduler.scheduleImmediate(()
=> safeRefresh())`を呼ぶだけ)を追加し、以下3箇所に配線:
1. `:20598`付近(`appendSelfPostedComment`呼び出し直後、楽観追記時)
2. `:20654`付近(明確失敗でのrevert直後・設計書§D)
3. `:20683`付近(例外でのrevert直後・設計書§D)

**地雷(設計書§I-5)**: revert側の即時paintを入れ忘れないこと。「表示する側」だけ速くして
「消す側」を忘れると、失敗コメの残留が相対的に悪化する。

**完了判定**: `npm run verify:cc`緑。実機で「押下→コメントがレーンに見えるまで」が体感で
速くなっていることを確認。Phase 0の計器(`楽観表示`行)の値がPhase 0時点の実測より
大幅に短縮(理論値: refresh1回分の所要=百ms台)されていることを確認。

## 機械的な完了判定(両Phase共通)

- [ ] `npm run verify:cc`全緑(各Phase個別に)
- [ ] 新規/変更ファイルのtree-map/feature-map再生成をコミットに含める
- [ ] `coalescerMinMs`・`ndgrFlushMs`・`throttleMs`の既定値を一切変更していないこと
      (grepで確認: `git diff`にこれらの定数値変更が含まれていないこと)
- [ ] `reconcileStoredOwnPostedEntries`・echo計測ロジックを一切変更していないこと
- [ ] reality-checkerによる実地検証(各Phase個別にcommit前)
- [ ] 実機確認: 状態速報の「コメント送信」セクションに新3行目が実際に印字されること
      (「出るはず」で終わらせない・[[fastdiag-lite-is-the-printer-subset]]の教訓)

## 地雷(設計書§Iより実装時に特に注意すべきもの再掲)

- `buildCommentPostDiagSnapshot`の白リスト漏れ(新フィールド追加を忘れるとサイレント欠落)
- 即時paintで新しい部分描画パスを作らない。必ず既存`safeRefresh()`を丸ごと呼ぶ
  (v0.1.421/422パネル消失リグレッションの教訓)
- `scheduleImmediate`実行後に`lastPaintAt`を更新し忘れると1送信でrefresh2連発になる
- revert側の即時paint入れ忘れ厳禁(表示だけ速くして消す側を忘れる)
- `refreshGen`世代管理を迂回する独自refresh呼び出しを作らない
- 大配信でrefresh1回自体が重い問題(robust-architectureの継続課題)は本設計のスコープ外
- 検証エージェント実行中はcommitしない([[reality-checker-stash-detaches-head-2026-07-07]])

## 次フェーズ(MVP完了後、このハンドオフのスコープ外)

- Phase 2(設計書§B-3): 入力欄の楽観クリア。押下と同時にクリアし、失敗時のみ復元する案。
  UXの是非はユーザー裁定が要る。
- 大配信でのrefresh所要そのものの短縮(robust-architecture継続課題、コアread1バッチ化)。
