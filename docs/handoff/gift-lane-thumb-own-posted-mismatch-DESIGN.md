# 設計書 — ギフト列サムネ欠落(own-posted二重判定不一致)の根治

- 設計: Fable(claude-fable-5サブエージェント) / 裏取り・統合: 司令塔(Claude Code) / 素材: 会議ハーネス(5モデル)
- 日付: 2026-07-14
- 位置づけ: `/council-fable` 3段構え(会議ハーネス→Fable設計→実装引き継ぎ)の手順2の産物

## 背景・実測

①ポップアップの応援レーン「ギフト列」(gift段)で、視聴者自身のuserIdですらサムネイルが取得できずゆっくり顔になる不具合をユーザーが実機で発見。

## 真因(実コード裏取り確定)

gift段はlink/konta/tanu段と同一の`buildStoryUserLaneCandidateRow`/`storyGrowthAvatarSrcCandidate`(`src/extension/popup-entry.js`)を再利用しているが、視聴者自身かどうかの判定に**2つの別系統**を使っている:

1. gift段の候補構築(`popup-entry.js:7556-7639`)は**ギフト専用own-posted集合**(`giftOwnPostedUidSet`、`popup-entry.js:7567-7571`、ギフトコメント由来)を使う
2. 後段の`storyGrowthAvatarSrcCandidate`内で呼ばれる`isOwnPostedSupportComment`(`popup-entry.js:5259-5276`)は**通常コメントentries(`STORY_SOURCE_STATE.entries`)ベースの別の判定**

視聴者がギフトだけ投げてコメントを一度も投稿していない場合、(1)では`own=true`だが(2)では`own=false`となり、`resolveStoryLaneAvatarSrc`(`src/lib/storyLaneAvatarSrc.js:42-95`)の「自分のアイコンが他人に誤帰属するのを防ぐガード」が誤爆し、視聴者自身の正当なサムネ解決までnullに潰される。

**重要な発見**: ①のlink段は既にこの「本人免除」思想を実装済み(v0.1.775・`popup-entry.js:6610`のown-posted集合への視聴者強制追加、`:6633`の本人numeric免除)。**gift段だけがこの本人免除を欠いていた**構造的非対称。

## 設計(Fable)

### 採用方針
qwen3.6-27b(発散役)の「UID直接比較」案を採用。二重集合の単純OR統合は不採用(理由はF章)。

### C. 具体機構

**Patch 1(MVP)**: `src/extension/popup-entry.js:7583-7588`
```js
// before
const ownPostedForUid = giftOwnPostedUidSet.has(uidRaw);
if (!broadcasterUid && /^\d{5,14}$/.test(uidRaw)) continue;

// after
const ownPostedForUid =
  giftOwnPostedUidSet.has(uidRaw) ||
  (Boolean(viewerUid) && uidRaw === viewerUid);
if (!broadcasterUid && !ownPostedForUid && /^\d{5,14}$/.test(uidRaw)) continue;
```
`viewerUid`は既に7565行で取得済み・追加readゼロ。link段(6633行)と同じ形の免除。

**Patch 2(根治の厚み・保険)**: `src/lib/storyLaneAvatarSrc.js:42-50`にINV-1(viewerUserId等値→own)を加法のみで内蔵。呼び出し側がown注入を忘れた将来の再発を防ぐ最後の砦。
```js
const own =
  ctx?.isOwnPosted === true ||
  Boolean(viewerUid && entUid && entUid === viewerUid);
```
呼び出し側の変更はゼロ(snapshotは既にpopupから渡っている)。

### D. 偽陽性潰し(逆方向リスク=他人へ視聴者アイコンが誤帰属しないか)
4パターンで検証済み: (1)他人のタイルはown判定が一切動かない (2)uidが視聴者に化けたタイルは既存のCDN式URL公開マッピングとして現状でも起こり得る話で今回の変更で新たに発生しない (3)viewerUserId自体はログインセッション由来でコメント推定を経ない (4)viewerUid空なら完全に従来動作(fail-closed)。

### E. MVP
Patch 1の`ownPostedForUid`へのOR1行のみで症状は解消する。Patch 2は将来の再発防止の保険。

### F. 捨てた案
1. 二重集合の単純OR統合 — 集合の完全性依存が残る(ギフトのみの本人はどちらの集合にも載らないケースがある)。`isOwnPostedSupportComment`はlink/konta/tanu段からも共有される関数で触るのはリスク
2. selfPostedRecentsのテキスト照合をギフトへ拡張 — gift行はtext:''でテキスト照合の土俵に乗らない。過剰設計
3. ガード自体の削除・緩和 — 誤帰属防止の思想を壊す
4. `buildGiftThrowerLaneEntries`で入力層にavatarUrlを埋める — 鏡のcontentHash系(v0.1.1141で直したばかり)に波及する
5. venue側への今回のviewerUserId注入 — ①側が直れば鏡経由で自動的に直る。YAGNI

### G. 地雷と回避策
1. 既存テスト(giftSenderObservation.test.js等)は対象ファイル無変更につき影響なし
2. `storyLaneAvatarSrc.test.js`既存8ケースはviewerUserIdを渡していないためPatch2でも結果不変。ファイル冒頭の「1mm不変」コメントに例外の1行を追記
3. link/konta/tanu段は既にown=trueで届いているためPatch2のORは常に冗長(true||true)=挙動不変
4. 診断計器(`countResolvedAvatarEntries`)のresolved数が自枠視聴時+1する可能性あり。これは「嘘が直って真値になる」方向で許容
5. **ブランチ運用**: 現在`fix/venue-gift-ad-mirror-slim-cell`(v0.1.1141・未マージ)上で同じgift段周辺を触るため、同ブランチの上に積むか、マージ後に着手する
6. **実機再現確認**: ギフトを投げた本人アカウントで、当該配信にコメントを1件も投稿していない状態で確認する。コメントを1件投稿するとbeforeでも直ってしまうため、再現確認は必ずコメント0の状態で行う
