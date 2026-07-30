# 実装ハンドオフ — 診断アーキテクチャ強化

正本設計: [diagnostic-architecture-strengthen-DESIGN.md](diagnostic-architecture-strengthen-DESIGN.md)

**重要**: このファイルのC章の完全な差分・D章の偽陽性潰しの全パターンは、設計を行ったFableサブエージェントの応答(本セッション内)にある。実装開始時は必ずその応答を参照し、行番号を実コードと突き合わせて裏取りしてから着手すること。

## ブランチ運用の注意(最重要)

現在以下の未マージブランチが同じ座標(gift段・storyLaneAvatarSrc.js)を触っている:
- `fix/venue-gift-ad-mirror-slim-cell`(v0.1.1141)
- `fix/gift-lane-thumb-own-posted-mismatch`(v0.1.1142)

**Patch②(名前ありゆっくり顔)は、上記2ブランチがmasterへマージされた後に着手すること**。座標衝突・二重実装を避けるため。

## スコープと実装順序(推奨)

### 1. MVP: Patch④(おすすめユーザー混入・最優先)
- `src/extension/content-entry.js`のgift行スキャンに`isInsideRecommendedUserSection`のimport+ガード追加
- 二重canary(`excludedByClass`/`excludedByHref`)を`isInsideRecommendedUserSection.js`に姉妹関数として追加(既存シグネチャは不変)
- fastDiag.content・statusFastDiagLite・healthCells `harvest-exclusion`セル・diagnosisRegistry登録を同一コミットで

### 2. Patch①(リンク欠落)
- `src/lib/personTileDom.js`の`isLinkable`判定を`nicoUserPageUrl(fullUid) !== ''`のみに変更(`isNumericNicoUserId`のANDを外す)
- 未使用になった`isNumericNicoUserId`のimportを削除
- characterization testの意図的更新(退化ではなく仕様変更として明記)
- 新規`src/lib/laneInvariantCensus.js`で`linkableExpected`/`anchorPainted`/`linkableMissing`を計器化
- `laneDiag.js`への相乗り+healthCells `lane-linkable`セル+diagnosisRegistry登録

### 3. Patch③(診断カウンタchurn)
- `popup-entry.js`のカウンタ代入をローカル構築→末尾一括`Object.assign`で原子化
- 新規`src/lib/storyDiagMonotonic.js`(`monotonicCommentCount.js`を内部委譲)
- 適用点は消費側の関所3箇所のみ(20箇所の直接代入には触らない)
- healthCells `diag-stability`セル+diagnosisRegistry登録
- **注意**: `popup-entry.js`のrefresh本体を触るため、進行中の`status-diag-608s-freeze`設計(同ファイルのread経路手術・既に`perf/status-stale-guarded-read`ブランチで実装済み)とセッションを分けること

### 4. Patch②(名前ありゆっくり顔・要ブランチマージ後)
- `venueLaneBuckets.js`の`resolveStoryLaneAvatarSrc`呼び出しに`avatarCtx`注入
- `venueDomCensus.js`の`countSection`に`yukkuriNamed`カウンタ追加
- healthCells `face-name-parity`セル+diagnosisRegistry登録

## 着手手順(各Patch共通・TDD)

1. ブランチを切る(Patchごとに独立ブランチ推奨。例: `feat/diag-harvest-exclusion-canary`)
2. 該当テストを先に書いて赤にする
3. 実装
4. `npm run verify:cc`全緑確認
5. `grep -rn "resolveMonotonic" src/`で重複実装がないか確認(Patch③のみ)
6. version bump(3点セット)+`npm run copy:ext`
7. reality-checkerに検証委任

## 機械的な完了判定

- `npm run verify:cc`全緑
- 各Patchについて、healthCells+diagnosisRegistry+statusFastDiagLite passthrough+wiring テストの5点セットが揃っていること
- 実機確認(reality-checkerに委任): 状態速報に新しいセル(lane-linkable/face-name-parity/diag-stability/harvest-exclusion)が表示され、正常時はok・異常時は具体的な件数で警告が出ること

## 地雷(正本設計から再掲・特に注意)

1. registry/healthCells/completenessScoreの3点同時登録を忘れると黙って集計対象外になる(v0.1.1054の実例)
2. 新カウンタはstatusFastDiagLite passthroughを忘れると状態速報コピペに永久に出ない
3. 診断の重さ: 新規タイマー・新規storage readは絶対に追加しない。既存census呼び出しへの相乗りのみ
4. 検証エージェント(reality-checker)実行中はcommitしない

## 次に必要な作業

実装は次チャット、または別モデルへ委譲してよい。着手時はこの1枚と正本設計、必要なら本セッションのFable応答(会話履歴)を参照すること。MVPのPatch④から着手することを推奨。
