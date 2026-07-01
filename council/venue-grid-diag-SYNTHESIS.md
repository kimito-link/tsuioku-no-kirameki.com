# SYNTHESIS: 会場モードにグリッド(応援者ランキング)+診断を加える

会議 2026-07-01 / design カテゴリ / routed 5体(lead×2, critic×2, fast×1)。critic 1体は出力が壊れた(同記号ループ)ので破棄=有効4体。司令塔(Claude Code)が実コード裏取りの上で集約。

## 収束した結論(4体がほぼ一致)

### グリッド: 「A案(ひな壇上部の固定高バー)」だが、独立グリッドは最小化し**席の演出強調を主役に**
- **A採用**(全体一致)。B(右サイド=マルチモニタ前提)と C(完全不要)は退ける。
- **ただし critic/fast/lead が口を揃えた重要修正**: 会場は既に全員(匿名含む)が席に座っている。上に独立グリッドを出すと(1)同じ人が席とバーに二重表示=冗長 (2)高さ振動リスクが新たに増える。
  → **上位N人は独立バーで羅列するより、まず「席タイル本体に強調(枠色/冠アイコン)」で貢献度上位を表現**するのが第一手。独立バーは「席では埋もれる上位アピール」が実機で本当に必要と分かってから足す。
- **ランキングの意味を席と分離**: 席=「今アクティブ(入れ替え制)」、ランキング=「イベント通算の貢献度上位(固定)」。表記も PV延べ来場 ≠ 応援者ランキングを明確に。

### 診断: 会場固有の軽量ビューを新設(`venueAvatarDiagLine.js`)・折りたたみ「🩺 会場の状態」
- storyAvatarDiagLine の userId率/アバター解決率を**そのまま出すのは過剰**(一般ユーザーは userId率を気にしない=lead/critic 一致)。
- 会場固有のコア指標(席数/参加者総数/超過eviction数/吹き出し・読み上げ発動/ギフト履歴状態)を `venueSeats.js` から**参照で**取り、PIIなし件数のみで出す。
- 置き場=会場バー下部の折りたたみ。開発者向け詳細は畳んだ中のさらに奥へ。

### 全ロジックは `src/lib` に純関数で集約・会場描画層は read-only(drift 防止=全体の総意)

## 意見が割れた点(残す・実装で判断)
- **独立グリッドバーを作るか/席演出だけで足すか**: critic と fast は「席演出優先・独立バーは冗長」と強く主張。lead は「A案バーは作る。ただし席演出を最優先」と折衷。
  → **司令塔判断: 席演出を先に入れて実機で見る(検証ファースト)。独立バーは席で埋もれると分かってからにする**。過剰実装回避(星野ロミ式)に合致。
- **`venueUserThumbGrid.js` を新規で作るか**: critic は「新規計算レイヤー=drift の火種、userThumbGrid.js を read-only 参照に留めよ」。lead は「新規で作るが純関数として src/lib に」。
  → **司令塔判断: 既存 `userThumbGrid.js`/`userLaneCandidatesFromStorage.js` を read-only 参照する薄いアダプタに留める**。会場独自の集計は書かない。

## 高さ振動対策(会議の具体設計・handoff の地雷#1 対応)
批判役が handoff の3点(空で畳まない/高さ固定/capturedAt を sig に入れない)だけでは不十分と指摘:
- **sig キーは「上位N人の userId 集合」だけでなく「userId + count(貢献度)」を含めよ**。集合のみだと順位・件数変化を取りこぼす。ただし capturedAt(時刻)は入れない(v1022 明滅の教訓)。
- 会場は席入れ替えが常時走る=グリッド/診断も連動して走ると hot path が重い。**診断は1回計算→sig 照合で無変化 skip**、増分は既存 `mergeUserLaneAggregates` の流用可否を実装時に確認。
- 検証ファースト: 実データ連携前に**静的ダミーデータで高さ安定を先に証明**(lead 提案)。

## やってはいけない(批判役の穴指摘・handoff #2〜6 と一致)
1. 会場に独自集計を書いて popup と drift(最重要)。→ src/lib 参照のみ。
2. 席ロジック(満席維持・eviction)に手を入れて退化。→ 触らない。
3. 診断を毎フレーム再計算して hot path を重く。→ sig skip。
4. グリッド opts(anonymousIdenticonResolver/defaultThumbSrc/anonymousFallbackThumbSrc)渡し忘れで匿名の顔崩れ再発。→ popup と同じ opts を全部渡す。
5. popup-entry を太らせて max-lines 超過。→ 純関数は src/lib。

## 段階導入(会議を反映した改訂・handoff の Phase を上書き)
- **Phase 2a(席演出・先行)**: 上位N人を `renderSeats` の席タイルに枠色/冠で強調(独立バーより先)。実機で「上位が席で埋もれるか」を観測。src/lib に「上位N判定」純関数を追加、venueBar は read-only 参照。
- **Phase 2b(独立バー・条件付き)**: 2a で席演出だけでは上位アピールが弱いと実機で分かった場合のみ、ひな壇上部に固定高バーを追加(sig=userId+count・高さ固定・空で畳まない)。
- **Phase 3(診断)**: `venueAvatarDiagLine.js`(新・venueSeats 参照の会場固有件数)+ 会場バー下部の折りたたみ「🩺 会場の状態」。verify:cc 緑。
- **Phase 4(退化確認)**: 実機で「重い配信でも揺れない・遅延なし・人数増でも重くならない」+ memory に完了 handoff。

## 会議の限界(裏取り必須)
- 会議メンバーは実コードを読めない=ファイル名/関数の実在は司令塔が grep で確認済み(userThumbGrid.js/storyAvatarDiagLine.js/userLaneCandidatesFromStorage.js/venueSeats.js/personTileDom.js は実在、venueBar.js は grid/diag 未使用)。
- 「席演出で強調」の具体(枠色/冠アイコンが既存 buildPersonTileEl の演出ラッパーで足せるか)は実装前に venueBar.js の tile ラッパー(1246-1260付近)を読んで確認する。
