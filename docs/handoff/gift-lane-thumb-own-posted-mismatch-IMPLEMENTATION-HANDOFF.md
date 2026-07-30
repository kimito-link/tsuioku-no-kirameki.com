# 実装ハンドオフ — ギフト列サムネ欠落(own-posted二重判定不一致)の根治

正本設計: [gift-lane-thumb-own-posted-mismatch-DESIGN.md](gift-lane-thumb-own-posted-mismatch-DESIGN.md)

**重要**: このファイルの詳細(逆方向リスク検証D章の全パターン等)は、設計を行ったFableサブエージェントの応答(本セッション内)に完全版がある。実装開始時は、まず正本設計のC章に書かれた行番号・関数名を実際のコードと突き合わせて裏取りしてから着手すること。

## ブランチ運用の注意(最重要)

現在`fix/venue-gift-ad-mirror-slim-cell`(v0.1.1141・push済み・未マージ)ブランチが存在し、同じgift段周辺(laneMirror.js)を触っている。本件は**そのブランチの上に積むか、そのブランチがmasterへマージされた後に着手する**こと。コンフリクトと「どの版で直ったか」の混線を防ぐため。

## スコープ(MVP)

1. `src/extension/popup-entry.js:7583-7588`の`ownPostedForUid`判定に、視聴者自身のUID直接比較をOR条件で追加(Patch 1)
2. (推奨・同コミット)`src/lib/storyLaneAvatarSrc.js:42-50`にINV-1(viewerUserId等値→own)を加法のみで内蔵(Patch 2・将来の再発防止の保険)

## 着手手順(TDD)

1. ブランチを切る(`fix/venue-gift-ad-mirror-slim-cell`の上、または独立ブランチ)
2. `src/lib/storyLaneAvatarSrc.test.js`に3ケース追加(正本設計C章参照): (a)本人+configured broadcaster一致でもCDN式URLが返る(バグの最小再現) (b)本人+viewer-avatar一致でもHTTP_AVが返る (c)他人タイルは従来通り誤帰属しない(回帰断言) → 実装前に赤を確認
3. Patch 2を適用 → 該当テストが緑になることを確認
4. Patch 1を`popup-entry.js`に適用
5. `npm run verify:cc`を実行し全緑を確認
6. version bump(3点セット)

## 機械的な完了判定

- `npm run verify:cc`全緑
- 実機確認(reality-checkerに委任): ギフトを投げた本人アカウントで、**当該配信にコメントを1件も投稿していない状態**でwatchを開き、gift段の自分セルがゆっくり顔→個人サムネに変わることを確認。**コメントを1件投稿すると修正前でも直ってしまうため、再現確認は必ずコメント0の状態で行う**

## 地雷(正本設計Gから再掲)

1. `giftSenderObservation.test.js`等の既存テストは対象ファイル無変更につき影響なし(緑を確認するだけ)
2. link/konta/tanu段は既にown=trueで届いているためPatch2のORは常に冗長=挙動不変。これを`git diff`で確認
3. 診断計器(`countResolvedAvatarEntries`)の数字が自枠視聴時+1する可能性あり。これは「嘘が直って真値になる」方向なので退行と誤認しないこと
4. venue側のcontentHash(v0.1.1141で直したばかり)への波及は「正当なデータ変化」として許容。gift段が✅のまま件数+1になることを状態速報で確認
5. 検証エージェント(reality-checker)実行中はcommitしない

## 次に必要な作業

実装は次チャット、または別モデルへ委譲してよい。着手時はこの1枚と正本設計、必要なら本セッションのFable応答(会話履歴)を参照すること。
