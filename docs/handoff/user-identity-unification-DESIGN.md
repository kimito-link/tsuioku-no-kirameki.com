# ユーザー識別情報解決の一元化・コンポーネント化 設計

> 設計=Fable(claude-fable-5) / 素材収集=会議ハーネス(クラウド5体・2026-07-17) / 裏取り=司令塔(Claude Code)
> 3段構えワークフロー(council-fable スキル)の手順2の産物。日付: 2026-07-17。
> 実装ハンドオフは同名 `user-identity-unification-IMPLEMENTATION-HANDOFF.md` を参照。

## Context

①popup(通常ポップアップ)と会場モード(全画面venue)という2つの画面で、「ユーザーID→表示名→
サムネイルURL→ユーザーページリンク」を解決するロジックが画面ごとにバラバラに実装されており、
繰り返しバグを生んでいた:

1. **会場サムネ白丸バグ**(修正済み・v0.1.1167): popup側の`rememberedAvatarUrlForUserId`が持つ
   UID→URL確定パターン生成フォールバック(`deriveAvatarUrlFromUid`)を、会場側の
   `enrichVenueRowsWithProfileAvatars`が持っておらず、記名ユーザーが白丸のままになっていた。
2. **広告列の独自実装**: `adLanePicksFromRooms.js`が同じ計算式を`nicoIconUrlForUid`という別名で
   独自に再実装(意図的コピペ)。
3. **りんく列(応援レーン本体)のユーザー出没ちらつき**(未修正): `broadcasterUid`解決
   (`inferBroadcasterUserIdFromComments`)がチャンネル放送でのフォールバック揺れにより不安定で、
   その揺れが応援レーン候補除外ガードに直接波及し、記名ユーザー全員が一時的に出没する。

**司令塔による裏取りで判明した追加事実**: UID→サムネURLの確定パターン計算式
(`floor(uid/10000)`バケット式)は、非テストコードだけで**実際に7箇所**に独立実装されている
ことをgrepで実測確認済み(下記表)。これは会議段階では見えていなかった、Fableの設計時裏取りで
発見された事実。

| ファイル:行 | 関数 | precondition | バケット式 |
|---|---|---|---|
| `src/lib/deriveAvatarUrlFromUid.js` | `deriveAvatarUrlFromUid` | `^[0-9]+$` | `floor(n/10000)` |
| `src/lib/venueSeats.js:198,201` | `deriveNicoUserIconUrl` | `^\d{2,15}$` | `floor(n/10000)` |
| `src/lib/adLanePicksFromRooms.js:33,36` | `nicoIconUrlForUid` | `^\d{2,15}$` | `floor(n/10000)` |
| `src/lib/supportGrowthTileSrc.js:29,34` | `niconicoDefaultUserIconUrl` | `^\d{5,14}$` | `max(1,floor(n/10000))` |
| `src/domain/user/avatar.js:76,81` | `synthesizeCanonicalUsericon` | `^\d{5,14}$` | `max(1,floor(n/10000))` |
| `src/domain/user/avatarResolver.js:122` | (同系) | 同系 | `max(1,floor(n/10000))` |
| `src/lib/reportUserThumb.js:26,35` | (base可変) | — | `floor(n/10000)` |

precondition regexが3種(`^[0-9]+$` / `^\d{2,15}$` / `^\d{5,14}$`)、バケット式が2種
(`floor` / `max(1,floor)`)ある。`\d{5,14}`前提下では`max(1,…)`は恒等(uid≥10000なのでbucket≥1)
だが、「同じ式のはず」が既に微妙に割れていること自体が白丸バグの母体。
**「増殖を構造的に止める」ことを本設計の第一目標とする**。7実装の物理統合そのものは段階的でよい。

`inferBroadcasterUserIdFromComments`の呼び出し箇所も実測確認済み: `popup-entry.js`の
6034/6586/7562/7777/13123/16123行目の**6箇所**(grepで実数一致確認済み)。

## 統合アーキ(コンポーネント4個)

```
┌────────────────────────────────────────────────────────────┐
│ [C4] CI構造ガード  nicoUserIdentity.guard.test.js          │
│   「usericon URL式の手書き」を src 全域 grep で検出し fail   │
└────────────────────────────────────────────────────────────┘
        守る対象 ↓
┌──────────────────────┐   ┌─────────────────────────────────┐
│ [C1] 識別プリミティブ正本 │   │ [C2] broadcasterUidTracker      │
│ deriveAvatarUrlFromUid.js│   │ (sticky配信者UID解決・唯一のstate)│
│  - deriveAvatarUrlFromUid│   │  update()/current()             │
│  - userPageUrlForUid(新) │   │  内部で inferBroadcaster        │
│  (7コピーは委譲へ)       │   │  UserIdFromComments を利用      │
└──────────┬───────────┘   └───────────┬─────────────────────┘
           │ 利用                        │ uid供給
┌──────────┴────────────────────────────┴─────────────────┐
│ [C3] resolveUserIdentity 関所 (resolveUserIdentity.js)   │
│   subject{userId,nickname,avatarUrl} + IdentityCtx        │
│   → {uid,kind,name,avatarUrl,avatarObserved,userPageUrl}  │
│   avatar解決は既存正本 resolveStoryLaneAvatarSrc に委譲    │
│   ctx builder: buildPopupIdentityCtx / buildVenueIdentityCtx│
└──────────┬───────────────┬──────────────┬────────────────┘
   popup応援レーン      会場(venueAvatar/    広告列(adLane
   (popup-entry.js)     venueLaneBuckets)    PicksFromRooms)
```

**責務分割**:

- **[C1] 識別プリミティブ正本**: 「UID→URL/リンク」の**式**だけを持つ。stateなし・contextなし。
  既存`deriveAvatarUrlFromUid.js`を正本に昇格(新ファイルは作らない)。
- **[C2] broadcasterUidTracker**: 配信者UIDの**時間方向の安定化**だけを持つ。本設計で唯一の
  statefulコンポーネント。「一度確定した候補を一時的な条件悪化で捨てない」
  (v1041/v1042の`shouldKeepStoryUserLaneTilesOnEmpty`と同思想を、DOM保持でなく判定値保持に適用)。
- **[C3] resolveUserIdentity関所**: 1ユーザーぶんの識別4点セット(uid/名前/サムネ/リンク)の
  **解決順序**だけを持つ。`venueBar.js`の`commitDisplay`と同じ「全経路がここを通る」思想。
  avatar解決の中核は既存`resolveStoryLaneAvatarSrc`(1mm不変保証済み)に委譲し、二重正本を作らない。
- **[C4] CI構造ガード**: 「増殖の再開」をコードレビュー頼みにしない。lintがunwired importを
  捕まえた前例(`verify-cc-lint-catches-unwired-import`)と同じ「機械が止める」路線。

## 具体機構

### C1: `src/lib/deriveAvatarUrlFromUid.js`(既存ファイルに加法拡張)

```js
/**
 * 数値UIDからニコニコユーザーページURLを生成。非数値(匿名'a:xxx'/合成キー)は''。
 * @param {string|number|null|undefined} uid
 * @returns {string} 'https://www.nicovideo.jp/user/<uid>' or ''
 */
export function userPageUrlForUid(uid) { /* normalizeUid 再利用 */ }
```

既存`deriveAvatarUrlFromUid`/`pickAvatarUrlForUid`/`extractUidFromAvatarUrl`はそのまま。
コピー側は**中身だけ委譲**に置換(precondition regexは呼び出し側に残しbit-identicalを保つ):

```js
// adLanePicksFromRooms.js — 式の内蔵をやめ正本へ委譲(preconditionは従来どおり ^\d{2,15}$)
function nicoIconUrlForUid(uid) {
  const s = String(uid || '').trim();
  if (!/^\d{2,15}$/.test(s)) return '';
  return deriveAvatarUrlFromUid(s);
}
```

`venueSeats.deriveNicoUserIconUrl`も同様(export名は維持=`venueLaneBuckets.js:12`のimportを
壊さない)。`supportGrowthTileSrc`/`domain/user/avatar*`も同型(`\d{5,14}`前提下で`max(1,…)`は
恒等なので委譲後も同値)。

### C2: `src/lib/broadcasterUidTracker.js`(新規・詳細は下記)

### C3: `src/lib/resolveUserIdentity.js`(新規)

```js
/** @typedef {import('./storyLaneAvatarSrc.js').StoryLaneAvatarSnapshot} StoryLaneAvatarSnapshot */

/**
 * @typedef {{
 *   uid: string,
 *   kind: 'numeric'|'anonymous'|'empty',
 *   name: string,
 *   avatarUrl: string,
 *   avatarObserved: boolean,
 *   userPageUrl: string
 * }} ResolvedUserIdentity
 */

/**
 * @typedef {{
 *   snapshot: StoryLaneAvatarSnapshot|null,
 *   isOwnPostedUid: (uid: string) => boolean,
 *   rememberedAvatarFor: (uid: string) => string,
 *   profileMap: Record<string, {nickname?: unknown, avatarUrl?: unknown}>|null
 * }} IdentityCtx
 */

export function resolveUserIdentity(subject, ctx) {
  // 1. uid 正規化・kind 分類
  // 2. name: profileMap 昇格(enrichUserLaneAggregatesWithProfileAndDisplay と同ルール)
  // 3. avatarUrl: resolveStoryLaneAvatarSrc(subject, {
  //      snapshot: ctx.snapshot,
  //      isOwnPosted: ctx.isOwnPostedUid(uid),
  //      rememberedAvatar: ctx.rememberedAvatarFor(uid)
  //    }) → 空なら pickAvatarUrlForUid(uid, null) を最後の砦に(白丸バグの恒久封じ)
  // 4. userPageUrl: userPageUrlForUid(uid)
}

/** popup: 実データ全部入り ctx。1 paint につき1回構築。 */
export function buildPopupIdentityCtx({ snapshot, ownPostedUidSet, rememberedAvatarFor, profileMap })

/** 会場: popup固有state(watchMeta/own判定/remembered)を持たない、と【ここで】宣言する ctx。
 *  remembered だけは profileMap から供給(ガード付き)=会場フォールバック欠落の再発防止。 */
export function buildVenueIdentityCtx({ profileMap })
```

### C4: `src/lib/nicoUserIdentity.guard.test.js`(新規・vitest)

```js
// src/**/*.js(*.test.js除く)を走査し、正本+委譲済み許可リスト以外に
//   /nicoaccount\/usericon\/[sm]?\/?\$\{|Math\.floor\([^)]*\/\s*10000\)/
// がヒットしたら fail。許可リスト: deriveAvatarUrlFromUid.js, reportUserThumb.js(base可変・別族)。
// メッセージに「deriveAvatarUrlFromUid を import して委譲すること」を印字。
```

## broadcasterUid揺れの安定化(sticky/confidence)

### 問題の構造(裏取り済み)

`popup-entry.js`は`inferBroadcasterUserIdFromComments(storageCtx, snapshot)`を**毎paint素で
呼ぶ**(6034/6586/7562/7777/13123/16123行目の6箇所)。チャンネル放送ではsnapshot経路が構造的に
空なのでフォールバック(ニックネーム完全一致検索)に依存するが、この関数は`matches.size !== 1`
で`''`を返すため、コメント蓄積に伴い0→1→2と揺れるたびに確定⇄未確定が反転し、ガード
`if (!broadcasterUid && !ownPostedForUid && /^\d{5,14}$/.test(uidRaw)) continue;`
(6634/7595行目)が数値ID段タイルを出没させる。

### 設計: `src/lib/broadcasterUidTracker.js`

```js
/**
 * @typedef {{
 *   uid: string,
 *   confidence: 0|1|2,           // 0=なし 1=コメント推定(揺れうる) 2=embedded-data/pageUrl(構造的)
 *   source: 'none'|'inferred'|'pageUrl'|'explicit',
 *   liveId: string,
 *   heldSinceMs: number,
 *   diag: { emptyStreak: number, conflictCount: number }  // 診断用(挙動には使わない)
 * }} BroadcasterUidState
 */
export function createBroadcasterUidTracker(nowFn = Date.now) {
  let state = EMPTY_STATE;
  return {
    /** @param {{ liveId: string, entries: readonly unknown[], snapshot: object }} input */
    update(input) { /* 下記遷移規則 */ return state; },
    current() { return state; }
  };
}
```

**遷移規則(5つ・これ以上増やさない)**:

1. **liveIdが変わったら全リセット**。前配信のuidを1msも持ち越さない(取り違えは出没より重罪)。
2. **explicit/pageUrl(confidence=2)は無条件採用**。構造的ソースが常に正。推定値と矛盾しても上書き。
3. **inferred一意(size===1, confidence=1)**: 保持がconf=2なら無視(格下で上書きしない)。保持が
   空なら採用。保持がconf=1で**同一uid**なら維持。**異なるuid**なら先勝ちで保持を維持し
   `diag.conflictCount++`(同一配信内で推定が別人に飛ぶのは同名視聴者ノイズの可能性が高く、
   後勝ちにすると出没が別形で再発する)。
4. **inferred空(size 0 or ≥2)**: **保持を維持**(これがstickyの核心)。`diag.emptyStreak++`。
   `shouldKeepStoryUserLaneTilesOnEmpty`の「一時的な条件悪化では消さない」の判定値版。
5. **降格なし**: 同一liveId内でconfは上がるだけ。保持uidが消えるのはliveId変更時のみ。

**実装の足場**: `inferBroadcasterUserIdFromComments.js`にdetailed版を加法追加
(既存関数はwrapper化しテスト不変):

```js
/** @returns {{ uid: string, source: 'explicit'|'pageUrl'|'inferred'|'none', candidateCount: number }} */
export function inferBroadcasterUserIdDetailed(entries, snapshot) { /* 既存ロジックを分岐印付きで */ }
export function inferBroadcasterUserIdFromComments(entries, snapshot) {
  return inferBroadcasterUserIdDetailed(entries, snapshot).uid;
}
```

**配線**: popup-entry.jsモジュールスコープにtrackerを1個。`inferBroadcasterUserIdFromComments`を
呼ぶ**全6箇所**(6034/6586/7562/7777/13123/16123行)を`tracker.update({liveId, entries, snapshot}).uid`
に置換する。一部だけ置換すると「ガードはsticky・鏡publishは生値」で①と会場の判定が割れる
(`mirrors-written-per-key-per-tick`と同型のパリティ嘘を自作することになる)ため、
**6箇所同時が必須**。update()はO(N) 1回(従来と同じ計算量)で冪等なので同一tick内の
複数呼び出しは無害。

**安全性の論証**: 誤保持のリスクは「size===1の瞬間に同名視聴者を掴む」ケースだが、これは
**現行コードでも同じ瞬間に同じ誤りをする**(その視聴者が配信者扱いで除外される)。stickyは
その誤りの頻度を増やさず、正解を掴んだ後に手放す誤りだけを消す。conf=2ソースが現れれば
必ず矯正される。

## 捨てた案と理由

1. **アダプターレジストリ型ポリモーフィックリゾルバー**(会議のqwen発散案): 画面2つ・レーン4本に
   レジストリ間接層は過剰。関所思想の利点は「配線が目で追える」ことで、レジストリはそれを殺す。
2. **resolveStoryLaneAvatarSrcをresolveUserIdentityに吸収合併**: 前者は「1mm不変」を
   characterization testで担保した正本。合併は正本を2度作り直す行為で、白丸バグを生んだ
   「作り直し時の移植漏れ」そのもの。関所は**委譲**で包む。
3. **識別情報の共有キャッシュサービス(subscription型)**: storage onChangedファンアウトが
   大配信激重の真犯人だった(`robust-architecture-design`)。新たな購読層は同じ地雷の増設。
   純関数+ctx注入で足りる。
4. **confidenceを連続スコア+時間減衰にする**: 3値(0/1/2)で仕様が言い切れる。連続値はテストで
   固定できない揺れを持ち込み、「揺れを消す装置が揺れる」本末転倒。
5. **inferBroadcasterUserIdFromComments自体にsticky内蔵**: 純関数をstateful化すると既存テストと
   他呼び出しの前提が崩れる。状態はtrackerに隔離。
6. **7実装の即時物理統合(1ファイル1関数へ)**: precondition 3種とバケット式2種の差を一括で
   潰すのは挙動変更リスク。まず委譲+CIガードで**増殖を止め**、regex収束は別途(必要なら)。

## 地雷と回避策

1. **preconditionregexの差**: `deriveAvatarUrlFromUid`は1桁uidも通す(uid=99→`s/0/99.jpg`)が、
   コピー群は`\d{2,15}`/`\d{5,14}`。委譲時に**呼び出し側のregexを消すと挙動が変わる**。
   → 委譲は式だけ、入口検査は現地に残す(C1のコード形)。
2. **`Math.max(1, bucket)`差**: `\d{5,14}`前提では恒等だが、regexを緩めた瞬間に非恒等化する。
   → regex収束をやらない限り安全。ガードテストのコメントに明記。
3. **`venueSeats.deriveNicoUserIconUrl`のexport依存**: `venueLaneBuckets.js:12`がimport中。
   削除せずdeprecated委譲として残す。
4. **popup-entryにほぼ同一ループが2本**(6621付近と7595付近)。ガード置換は必ず両方。片方だけ
   直すと「直ったのに再発」レポートになる(会場パリティで繰り返した轍)。
5. **6箇所の部分置換禁止**(配線参照)。ガードだけsticky・鏡publishだけ生値、はパリティ嘘の量産機。
6. **displayEntriesメモ化キャッシュが`broadcasterUid`を含む**: tracker導入でuidが安定化すると
   invalidation頻度が変わる(良い方向だが)。キャッシュ比較キーにtrackerのuidを渡す配線を
   確認してから置換すること。
7. **popup再オープンでtrackerはリセット**(in-memory)。初回paintは現行と同じ未確定挙動=退行では
   ないが、「開き直したら一瞬消えた」を再発と誤認しないようdiag(`heldSinceMs`)で判別可能に
   しておく。storage永続化はしない(前配信持ち越し事故のほうが怖い・fail-closed)。
8. **新diagはstatusFastDiagLiteを通す**(lite passthroughしないとコピペに永久に出ない・
   v0.1.1124の実績地雷)。
9. **新規lib追加時は`npm run verify:cc`一本+tree-map/feature-map再生成をコミットに含める**
   (サイレント欠落はsafeSectionが握り潰す)。
10. **検証エージェント実行中にcommitしない**(detached HEAD不完全コミット事故)。
11. **会場の`{snapshot:null, isOwnPosted:false, rememberedAvatar:''}`をMVPで触らない**。この
    非対称の解消は第3弾の`buildVenueIdentityCtx`で「宣言として」行い、その際
    `venueAvatar.test.js`をcharacterizationとして先に緑固定してから移行する。

## コメント規約(責務ブロックコメント)の具体例

全新規/移行ファイルの冒頭に、次の4項目+関所宣言を必須とする(AIにも人間にも
「何を頼ってよいか/よくないか」が一読で分かる形):

```js
/**
 * broadcasterUidTracker — 配信者UIDの sticky 解決(この機能群で唯一の stateful 部品)。
 *
 * 【入力の出どころ】
 *   - liveId: STORY_SOURCE_STATE.liveId(popup)。配信の同一性判定にのみ使用。
 *   - entries: 保存済みコメント storageCtx(全件)。ニックネーム一致推定の材料。
 *   - snapshot: watchMetaCache.snapshot(embedded-data 由来)。explicit/pageUrl の正。
 * 【出力の使われ方】
 *   - .uid は renderStoryUserLane の数値ID段ガード(6634/7595行)と、鏡 publish の
 *     broadcasterUserId(会場・③WEBが同じ値を見る)に使う。ガードと publish は必ず同源。
 * 【担う責務】
 *   - 推定候補数が 0→1→2 と揺れても、一度確定した uid を同一配信内で手放さないこと。
 *   - explicit/pageUrl(confidence=2)による矯正と、liveId 切替での即時全リセット。
 * 【担わない責務】
 *   - uid の一次推定そのもの(正本: inferBroadcasterUserIdFromComments)。
 *   - 配信者アイコンの取り違え検査(正本: avatarBroadcasterGuard)。
 *   - 永続化。popup を閉じたら忘れる(前配信の uid 持ち越し事故 > 再確定の一瞬 の判断)。
 * 【関所】
 *   popup-entry.js から inferBroadcasterUserIdFromComments を直接呼ぶことは禁止
 *   (全6呼び出しは update() 経由)。直呼びの復活は broadcasterUidTracker.guard.test.js が検出。
 */
```

規約のポイント: (1)**出どころ**は「どのstate/storageキー由来か」まで書く(引数名だけでは
popup固有state依存が見えないため)。(2)**使われ方**は行番号でなく「同源であるべきペア」
(ガードとpublish等)を書く — パリティ嘘の予防線。(3)**担わない責務**には必ず
「正本: <ファイル>」を併記し、コピペ実装したくなった読者を正本へ誘導する。(4)関所ファイルには
**直呼び禁止の宣言と、それを機械で守るテスト名**を書く(コメントだけの禁止は`nicoIconUrlForUid`
の「依存を増やさないため内蔵」が破った実績があるため、必ずC4型のガードテストと対にする)。

## 検証済み事実(司令塔による裏取り)

- 7ファイルすべて実在確認済み(`test -f`)
- UID→URL計算式7箇所、grepで実測一致確認済み(表の通り)
- `inferBroadcasterUserIdFromComments`呼び出し6箇所、grepで実数一致確認済み
  (6034/6586/7562/7777/13123/16123行目)
