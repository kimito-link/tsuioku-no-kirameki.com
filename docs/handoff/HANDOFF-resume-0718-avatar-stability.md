# 引き継ぎ: サムネ不安定設計(council-fable進行中・Fable未実行)

日付: 2026-07-18。コンテキストウィンドウ上限のため引き継ぎ。

## 直前までの状況

前チャットの流れ(参考): 会場サムネ白丸バグ根治(v0.1.1167)→りんく列出没バグ根治
(broadcasterUidTracker、v0.1.1170)→会場モード記録件数リアルタイム同期(v0.1.1171、
push済み)→ユーザーが「サムネがあるべき人で無かったり表示が不安定なことが多い」と
新規報告→council-fableで再会議に着手、というライン。

## 今回のお題

サムネイル(顔アイコン)があるべき記名ユーザーで出なかったり、表示が不安定な不具合の
根治設計。既存の一元化設計(`user-identity-unification-DESIGN.md`、リポ直下)は
[C2]broadcasterUidTrackerのみ実装済み、[C1]識別プリミティブ委譲統合・
[C3]resolveUserIdentity関所・[C4]CI構造ガードは未着手。

## 実地調査で判明した事実(裏取り済み・そのまま使える)

1. **UID→サムネURL計算式の重複(7実装)が今も未解消**: `src/lib/deriveAvatarUrlFromUid.js`
   (正本候補)・`src/lib/venueSeats.js`の`deriveNicoUserIconUrl`・
   `src/lib/adLanePicksFromRooms.js`の`nicoIconUrlForUid`・
   `src/lib/supportGrowthTileSrc.js`の`niconicoDefaultUserIconUrl`・
   `src/domain/user/avatar.js`の`synthesizeCanonicalUsericon`・
   `src/domain/user/avatarResolver.js`(未配線dead code)・`src/lib/reportUserThumb.js`。
   precondition regex 3種、バケット式2種の割れ。

2. **会場側は意図的な空コンテキストで正本を呼んでいる**: `resolveStoryLaneAvatarSrc`
   (`src/lib/storyLaneAvatarSrc.js`、popup/会場共有の応援レーン正本)は、popup側は
   `watchMetaCache`由来の実データ(snapshot/isOwnPosted/rememberedAvatar)を渡すが、
   会場側は`{snapshot:null, isOwnPosted:false, rememberedAvatar:''}`という空ctx固定
   (`venueLaneBuckets.js`)。

3. **★最重要・司令塔が追加裏取りした事実(会議の前提を訂正する)**: popup側の
   `rememberedAvatarUrlForUserId(userId)`(`src/extension/popup-entry.js:5380`)は
   実は**2段構え**:
   - 第1分岐(5383-5392行目): `popupUserCommentProfileMap?.[uid]?.avatarUrl`を見る。
     これは`KEY_USER_COMMENT_PROFILE_CACHE`というstorageキー由来のプロファイルキャッシュで、
     **会場側の`profileAvatarMap`(venueBar.js内、同じキーを読む)と実質同じデータソース**。
     つまりこの第1分岐だけなら、会場側は既に代替手段(`enrichVenueRowsWithProfileAvatars`、
     `venueAvatar.js`、v0.1.1167で修正)を持っている。
   - 第2分岐(5393-5410行目): `STORY_SOURCE_STATE.entries`という**popup専用のメモリ上の
     生コメントentries配列**を、対象userIdについて逆順(新しい方から)走査し、avatarUrlが
     ある行を見つけたら使う。**これは会場には存在しない情報源**(会場はコメント本文の
     全件配列をメモリに保持していない設計)。
   - つまり「会場では効かないpopup限定のフォールバック」は、会議で言われた「記憶avatar
     全体」ではなく、**厳密には第2分岐(entries逆順走査)だけ**に絞り込める。

4. **会場だけでもサムネ解決経路が最低3系統並存**: (a)`venueSeats.js`の
   `deriveNicoUserIconUrl`をvenueBar.jsが直接import・呼び出し(4176行目付近)、
   (b)`venueAvatar.js`の`enrichVenueRowsWithProfileAvatars`、(c)`resolveStoryLaneAvatarSrc`
   経由(応援レーン専用)。

5. **診断計器の空白**: `avatarLoadDiag`はCDN404の分類のみで、経路混在によるサムネ欠落
   自体を計測する計器が存在しない。

## 会議(5体中3体成功・クラウド)の結果概要

保存済みJSON: `C:\Users\info\AppData\Local\Temp\claude\C--Users-info-OneDrive--------Resilio-github-tsuioku-no-kirameki-com\e8d94bca-014b-48d2-ad71-bd86d878387c\scratchpad\council-answers-avatar-stability.json`
(スクラッチパッドは再起動で消えている可能性あり。消えていたら会議は省略し、下記の
要約だけで直接Fableブリーフを作ってよい=既に十分な材料がある)。

**強い対立(最重要)**:
- gpt-oss-120b(批判役): 「会場に新しいstateを持たせるべきではない。既存の`profileMap`が
  実質的に『記憶avatar』の役割を果たしており、これを再利用せず新規state追加するのは
  設計の一貫性を破壊しバグの温床になる」。
  → **司令塔の追加裏取り(上記3番)で、この批判は部分的に正しいが不完全と判明**。
    `profileMap`(第1分岐相当)は既に会場でカバーされている。真に未解決なのは
    `STORY_SOURCE_STATE.entries`逆引き(第2分岐)であり、これは「会場に同種の生entries
    配列を持たせるか」という、より狭く具体的な問いになる。
- llama-3.3-70b: 単純に「会場にもstateを追加すべき」と収束(gpt-oss-120bの批判が
  そのまま刺さる形の提案、あまり参考にならない)。
- qwen3.6-27b(発散役、出力が思考ログで途中で切れた): 「空コンテキストは同期対象でなく
  遅延評価スタブとして再定義すべき」「7実装は消去でなく競合検知アダプターとして温存・
  計測化(pathId/confidenceScoreを付与し、どの経路が実際に解決したかを実行時計測する)」
  という設計思想。

## 次にやるべきこと(council-fableの続き)

1. `C:\Users\info\.claude\skills\council-fable`のワークフロー通り、**手順2(Fable設計)**
   から再開する。ブリーフは上記の情報で十分(前チャットで作成済みだったfable-brief.mdは
   スクラッチパッドが消えていたら再構築要、ただし内容はこのファイルにほぼ再現済み)。
2. Fableへの出力指定は以下(前回準備していたもの、そのまま使える):
   A. 理想の体験フロー / B. 統合アーキ(コンポーネント3-4個・配線図) /
   C. 具体機構(関数シグネチャ・ファイル名) /
   **D. 裁定(最重要): 「STORY_SOURCE_STATE.entries逆引き」相当の情報を会場にも
      持たせるべきか、それとも会場は空のままで安全に劣化させ続けるべきか、明確に
      結論を出す** / E. 7実装の重複解消の優先順位・移行手順 /
   F. 新規診断計器の最小設計 / G. MVP / H. 捨てた案と理由 / I. 地雷と回避策 /
   J. コメント規約の具体例。
3. Fableの主張は鵜呑みにせず、司令塔が実地裏取りしてから正本md
   (`avatar-stability-DESIGN.md`+`-IMPLEMENTATION-HANDOFF.md`、リポ直下)に保存する。
4. メモリ記録(project型)も忘れずに。

## 守るべき制約(Fableに伝えること)

- 既存の`venueAvatar.test.js`・v0.1.1167(会場白丸修正)・v0.1.1170
  (broadcasterUidTracker)を壊さない。
- 過剰設計を避ける(汎用アダプターレジストリ等を作りすぎない)。
- 会場は「popup固有stateを持たない」という既存の設計判断(意図的、venueLaneBuckets.jsの
  コメントに明記)を安易に覆さない。覆すなら明確な理由(実害の大きさ)を示すこと。
- 「各ブロックが何を担うかをAIにも人間にも分かるコメントで明記する」という設計思想
  (user-identity-unification-DESIGN.mdで確立した規約)を踏襲する。

## 現在のgit状態

未コミットの変更なし(今回のセッションは調査・会議のみでコード変更していない)。
直近のコミット: `654e9474 feat(venue): 会場モードの記録件数をリアルタイム同期 v0.1.1171`
(push済み)。

## 関連メモリ

- `user-identity-unification-design-2026-07-17`(元の一元化設計)
- `story-diag-realtime-sync-design-2026-07-18`(記録件数リアルタイム同期、実装・push済み)
- MEMORY.mdの索引にも上記2件のリンクあり
