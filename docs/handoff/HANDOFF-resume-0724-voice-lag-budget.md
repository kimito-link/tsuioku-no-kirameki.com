# 引き継ぎメモ 2026-07-24(会場読み上げ最大化 + 北極星鏡競合)

## 現在の状態

ブランチ: `feat/voice-lag-budget-shadow`(**push未実行・要`git push`確認**)
最新バージョン: v0.1.1185(全てcommit済み)

## 追記(2026-07-24 続きセッション): v0.1.1184のreality-checker検証→v0.1.1185で対応完了

前回セッションが「reality-checker未検証のままv0.1.1184をコミット」と申告していたため、まずreality-checkerでv0.1.1184を検証した。

**検証結果(1回目・PLAUSIBLE)**: ゲート(verify:cc)は全通過、v0.1.989の「複数回試行」トリガー自体も壊れていないことを確認。ただし2点の欠落を指摘:
1. `_northStarRefreshSingleFlight.joinCount()`が状態速報に配線されていない(heavyRead側は`heavyReadInflightJoinCount`として配線済みなのに対称性がない) → 「同時実行最大7→1に収束したか」を実配信で確認する手段がなかった
2. single-flight化そのものへの統合テストが無い(`singleFlightByKey.js`自体のユニットテストのみ)

**対応(v0.1.1185)**:
- `src/lib/northStarMirrorPublishRace.js`の`toNorthStarMirrorPublishRaceDiag(state, singleFlightJoinCount)`に第2引数追加、診断行に`single-flight合流{N}`を併記。
- `popup-entry.js`の該当箇所(line 18915)で`_northStarRefreshSingleFlight.joinCount()`を渡すよう配線。
- `northStarMirrorPublishRace.test.js`に統合テスト2本追加(同一liveId4回同時呼び出しでinflightMax=1・join=3回になること/別liveIdはjoinせず独立実行されること)。

**教訓(このセッションで踏んだ)**: 統合テストを書いたつもりが、最初は`singleFlightByKey.js`をimportせず**テスト内に同じロジックを手書きコピー**しただけの偽装テストになっていた(reality-checker再検証で指摘・PLAUSIBLE判定)。「本番コードをimportして使っているか」を必ず自分でも確認すること。`createSingleFlightByKey`を実際にimportして書き直し、2回目のreality-checker検証でPASSを得た。

**次にやること**:
1. `git push`してよいかユーザーに確認(まだ未実行)。
2. 拡張リロード→watch F5→対象配信視聴→状態速報取得。
3. 状態速報の「北極星鏡publish」行で`同時実行最大`が1に収束し`single-flight合流`が0より大きい値になっているか確認(実配信での効果の直接裏取り、これが今回追加した計器の役目)。
4. `voicePlayer.js`の実効上限適用(v0.1.1181)の体感も合わせて確認。

## このセッションでやったこと(時系列)

1. **council-fable 3段構え**で「会場読み上げ×吹き出しリアルタイム最大化」を設計。正本 `venue-bubble-voice-realtime-max-DESIGN.md` / 実装ハンドオフ `venue-bubble-voice-realtime-max-IMPLEMENTATION-HANDOFF.md`(リポ直下)。
2. **v0.1.1180**: `voiceLagBudget.js`新規実装(段階0=shadow計測のみ)。件数ゲート実効上限を処理時間EMAから算出しdiagに出すだけ、実際のキューはまだ8固定。
3. **実配信で`effectiveQueueMax<8`(実効上限3、処理時間1703ms/件)を実測** → 段階1(適用)へ進む条件を満たした。
4. **v0.1.1181**: `voicePlayer.js`の`pushVoiceQueue`呼び出しの`{max:8}`固定を`{max:this._effectiveQueueMax}`に変更(段階1=apply)。テスト2件追加。reality-checker検証pass。
5. **新規報告**: 会場参加者パネルのRANKバッジ(🥇🥈🥉)が「常にちらちらしている」。調査の結果、`resolveVenueRegularScore`(発言数の対数正規化)がコメントごとに微変動し上位3位が頻繁に入れ替わる構造+`dataset.venueRank`が順位不変でも毎paint delete→再代入していたのが真因。
6. **v0.1.1182**: `venueBar.js`にWeakMapベースの局所diff-skipを実装(RANKバッジのdataset属性1つだけが対象・renderSeats全体のsig-skipという既知の地雷=v0.1.1032で撤回済みは再導入していない)。reality-checker検証pass。
7. 実配信の状態速報で`実効上限3(未適用)`という**古い表示文言**に気づく → **v0.1.1183**で`voiceDiag.js`の表示文言修正(`(未適用)`削除、実害なし・表示のみ)。
8. ユーザーから「北極星鏡publish競合(同時実行最大7)も直して」と指示 → **v0.1.1184**: `popup-entry.js`の`refreshAllNorthStarMirrorLanes`を`singleFlightByKey.js`(既存・heavyReadで実績あり)でラップし、同一liveIdの多重並行実行をjoinさせる実装完了・commit済み。

## 次のセッションで最初にやること

**v0.1.1184の実機検証がまだ未実施**。以下を確認:

1. ユーザーに`git push`してよいか確認(まだpushしていない可能性が高い、`git log origin/feat/voice-lag-budget-shadow..HEAD`で確認)。
2. 拡張リロード→watch F5→対象配信を視聴→状態速報を取得。
3. 状態速報の「北極星鏡publish」行で`同時実行最大`が**1に収束しているか**確認(single-flight化の効果検証)。`liveIdリセット`が引き続き0のままか(配信切り替え時の動作破壊が無いか)も確認。
4. **reality-checkerでv0.1.1184を未検証のまま出荷している**。次チャットで必ず検証すること。特にv0.1.989の「タイマー任せにせず複数回試行してstarvationに対処する」という意図を壊していないか(呼び出し自体を減らしていないか、joinしているだけか)を重点確認。
5. `voicePlayer.js`の実効上限適用(v0.1.1181)の体感も合わせて確認: 混雑時に読み上げが間引かれて詰まりにくくなっているか。

## 教訓・地雷(このセッションで踏んだ/確認した)

- **renderSeats全体のsig-skip/diff-skip再導入は禁止**(`memory/handoff_2026-07-01_venue_mode_add_icon_grid_diag.md`に明記、v0.1.1032で実機ちらつき回帰を招き撤回済み)。今回のRANKバッジ修正は`dataset.venueRank`1属性だけの局所diff-skipに限定して回避した。
- **`voiceDiag.js`は`statusFastDiagLite.js`を経由しない独立経路**(`KEY_VOICE_DIAG`ストレージキー→`status-entry.js`/`aiShareFullText.js`が直接読む、加えて`statusExtrasBatch.js`という第三の集約経路も存在)。新しい会場読み上げ計器を追加する際は`voiceDiag.js`本体を拡張するだけで自動的に状態速報に反映される。
- **`scripts/council-lineup.mjs`は今回の一連の変更と無関係な既存差分**(Groqモデルカタログ撤去、別作業)。毎回のcommitで`git add`時に明示列挙して意図せず巻き込まないよう注意すること(このセッションでは4回とも正しく除外できた)。
- **`singleFlightByKey.js`はjoin方式**(進行中の実行に合流、skip方式ではない)。`heavyReadFromStoreGuarded`(popup-entry.js:15968付近)が既存の利用実績。新しい箇所に適用する際は「呼び出し自体を減らしたいのか、多重並行実行だけを防ぎたいのか」を区別すること。

## 保存済みメモリ

- `venue_bubble_voice_realtime_max_design_2026-07-24.md`(project型) — council-fable設計の記録、実装完了・段階1適用済みまで更新が必要(未更新)。
