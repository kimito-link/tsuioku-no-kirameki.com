# 設計書 — 診断アーキテクチャ強化(4件の未検知不具合+今後の同種不具合を継続的に検知)

- 設計: Fable(claude-fable-5サブエージェント) / 裏取り・統合: 司令塔(Claude Code) / 素材: 会議ハーネス(4モデル)
- 日付: 2026-07-14
- 位置づけ: `/council-fable` 3段構え(会議ハーネス→Fable設計→実装引き継ぎ)の手順2の産物

## 背景

ユーザーが実機で4件の不具合を発見したが、いずれも既存の診断(状態速報・会場一致・健全度パネル)では検知できていなかった。ユーザーは「個別修正より診断強化そのものが最重要課題では」と提起。

## 4件の症状と真因(実コード裏取り確定)

1. **リンク欠落**: `src/lib/personTileDom.js`の`buildPersonTileEl`が`isLinkable = isNumericNicoUserId(fullUid) && pageUrl !== ''`。段付け用regex(`^\d{5,14}$`)とURL生成側(`^\d{1,18}$`)の桁レンジがズレており、1〜4桁・15〜18桁の数値IDユーザーはURL生成できるのにリンク化されない。
2. **名前ありゆっくり顔**: `venueLaneBuckets.js`が`resolveStoryLaneAvatarSrc`に`snapshot: null, isOwnPosted: false`固定で渡す。gift-lane-thumb-own-posted-mismatchと同系統の構造的ギャップが通常段(link/konta/tanu)にも及ぶ。
3. **churn(内訳・用語の顔一覧増減)**: `popup-entry.js`のカウンタが複数非同期経路で再構築される`arr`から毎回全件再集計され、reset→非同期fillの途中をpaintが観測する。既存の単調化パターン(`monotonicCommentCount.js`)は`recordedCount`にしか適用されていない。
4. **おすすめユーザー混入**: `content-entry.js`のgift行スキャンが`isInsideRecommendedLiveSection`のみ通し、`isInsideRecommendedUserSection`を呼んでいない(呼び出し漏れ)。

## 診断アーキテクチャの構造的欠陥

`diagnosisRegistry.js`+`healthCells.js`は既存一次集計値の再表示のみで、新しい異常を検知する一次集計機構を持たない。4件はいずれもこの空白領域。

## 設計(Fable)

### 採用方針
会議が提案した「同期的collectFn前提の汎用整合性検査フレーム」は、批判(gpt-oss-120b・qwen3-32b)により却下。非同期再構築とCSS Modulesハッシュ変化に対応できないため。**既存の一次計器(venueDomCensus・laneDiag・monotonicCommentCount)を薄く拡張する方針**を採用。新エンジンは作らない。

### 不変条件(INV)
- INV-L: リンク資格の正本は`nicoUserPageUrl`のみ
- INV-F: 強い表示名を持つタイルがゆっくり顔で描画されている状態を件数として観測可能にする
- INV-M: 原理的に減らない計数は単調・原子的にコミットされる。減りうる計数はクランプせず後退の発生自体を計数する
- INV-S: 全DOM走査が除外ガードを通り、除外機構自体の生存を二重検出の食い違いで観測する

### 具体機構(詳細はFable回答参照・実装時に再取得)

**C-1(①)**: `personTileDom.js`の`isLinkable`判定から`isNumericNicoUserId`を外し、`nicoUserPageUrl(fullUid) !== ''`のみにする。1行修正。

**C-2(②)**: `venueLaneBuckets.js`の`resolveStoryLaneAvatarSrc`呼び出しに`avatarCtx`(viewerUserId/rememberedAvatarForUserId)を注入可能にする。**実装順序: gift-lane-thumb-own-posted-mismatchのマージ後に着手**(同じstoryLaneAvatarSrc.js座標)。

**C-3(③)**: popup-entry.jsのカウンタ代入をローカル構築→末尾一括`Object.assign`で原子化。新規`src/lib/storyDiagMonotonic.js`(既存`monotonicCommentCount.js`を内部委譲する薄いラッパ)で、原理的に減らない3キー(total/withUid/selfSaved)のみ単調ゲート。クランプが効いた回数を`diagRegressions`として計器化(嘘をつかない)。

**C-4(④・MVP)**: `content-entry.js`のgift行スキャンに`isInsideRecommendedUserSection`のimport+ガードを追加。除外機構の生存証明として、class検出とhref検出の二重canary(`excludedByClass`/`excludedByHref`)を追加。

**C-5(共通)**: 新規`src/lib/laneInvariantCensus.js`(venueDomCensusと同じ「数えるだけ」規律)で①②を1回の走査で計数。既存`laneDiag.js`に相乗り(新規storage read/write・タイマーゼロ)。

### 偽陽性・偽陰性潰し
- 単調ゲートはper-live Mapで、lv切替時に必ずforget(既存パターン踏襲)
- クランプ対象は「原理的に減らない3キー」のみに限定
- CSS Modulesハッシュ変化はhref検出(ハッシュ非依存)とclass検出の食い違いで検知。両方0は「おすすめ欄が視界に無いだけ」として誤報しない

### MVP
**④(おすすめユーザー混入の除外漏れ)+canary**を最優先。理由: 記録データの汚染という唯一「後から消せない実害」を止める。実装コスト最小(import1行+ガード1行)。他ブランチとの座標衝突もない。

### 捨てた案
1. 同期的`createIntegrityCheck`汎用フレーム — 却下(非同期再構築・CSS Modulesハッシュ変化に対応不可)
2. 状態変異ストリーム追跡 — 却下(robust-architectureで潰したばかりのstorage輻輳と同型の重さを診断が持ち込む)
3. `isNumericNicoUserId`の桁レンジ拡張 — 却下(レーン段付けの正本を壊す)

### 地雷
1. `personTileDom.test.js`のcharacterization testは意図的な仕様変更として更新(退化ではない)
2. 単調化の重複実装チェック: `grep -rn "resolveMonotonic" src/`で確認
3. 鏡contentHashへの波及確認(v0.1.1141直後)
4. statusFastDiagLite passthrough必須(新カウンタ全て)
5. registry/healthCells/completenessScore の3点同時登録(v0.1.1054の実例=登録漏れで黙って集計対象外)
6. ②はfix/venue-gift-ad-mirror-slim-cell・gift-lane-thumb-own-posted-mismatchのマージ後に着手
7. 診断の重さ: 新規タイマー・新規storage read禁止、既存census呼び出しへの相乗りのみ
8. 出荷ゲートはverify:cc一本、reality-checker実行中はcommitしない
