# avatar-stability-DESIGN.md — サムネ表示不安定の根治設計(識別一元化・次フェーズ)

> 設計=Fable(claude-fable-5) / 素材収集=会議ハーネス(クラウド5体中3体成功・2026-07-18) / 裏取り=司令塔(Claude Code)
> 3段構えワークフロー(council-fable スキル)の産物。日付: 2026-07-18。
> 位置づけ: `user-identity-unification-DESIGN.md` の次フェーズ具体設計。[C2]broadcasterUidTracker
> (v0.1.1170)は実装済み。本書は[C1]委譲統合・[C3]関所・[C4]CIガード+新規計器[C5]の実装設計。
> 実装ハンドオフは同名 `avatar-stability-IMPLEMENTATION-HANDOFF.md` を参照。

## Context(司令塔がコードを実読して裏取り済みの事実。推測で新事実を作っていない)

①popup・②会場モード(全画面venue)・③純Web公開ページの3画面がある。過去に「会場サムネ白丸」
(v0.1.1167で対応)・「りんく列出没」(v0.1.1170でbroadcasterUidTracker実装)を個別修正してきたが、
ユーザーが改めて「サムネがあるべき人で無かったり、表示が不安定なことが多い」と報告した。

### 事実1: UID→サムネURL計算式の重複(7実装、未解消)

`src/lib/deriveAvatarUrlFromUid.js`(正本候補)・`src/lib/venueSeats.js`の`deriveNicoUserIconUrl`・
`src/lib/adLanePicksFromRooms.js`の`nicoIconUrlForUid`・`src/lib/supportGrowthTileSrc.js`の
`niconicoDefaultUserIconUrl`・`src/domain/user/avatar.js`の`synthesizeCanonicalUsericon`・
`src/domain/user/avatarResolver.js`(未配線dead code)・`src/lib/reportUserThumb.js`。
precondition regex 3種(`^[0-9]+$`/`^\d{2,15}$`/`^\d{5,14}$`)、バケット式2種(`floor`/`max(1,floor)`)の割れ。

### 事実2: 会場の「空コンテキスト」問題の実態(既存設計書の記述より精密に特定)

`src/lib/venueLaneBuckets.js:88`:
```js
resolveStoryLaneAvatarSrc(entryModel, { snapshot: null, isOwnPosted: false, rememberedAvatar: '' })
```
という意図的な空ctx呼び出し(85-87行目のコメントに「会場はpopup固有state(watchMeta/own判定/
remembered)を持たないため」と明記)。

しかし`resolveStoryLaneAvatarSrc`(`src/lib/storyLaneAvatarSrc.js`)の中身を読むと、
`ctx.rememberedAvatar`(56行目)と`entry.avatarUrl`(57行目、`entryModel.avatarUrl`経由)は
**別の入力**。後者は`entryModel = { userId: uid, nickname: rawName, avatarUrl }`の`avatarUrl`
(`venueLaneBuckets.js:70`、`participant.avatar`由来)で、これは**既に
`enrichVenueRowsWithProfileAvatars`(`src/lib/venueAvatar.js`、v0.1.1167で修正)が
profileMap補強+UID合成フォールバックまで適用済みの値**(呼び出しは`venueLaneBuckets.js:3992`
付近で先行実行)。

つまり:
- **`resolveStoryLaneAvatarSrc`の`guardedAvatarUrl`経路(entry.avatarUrl由来、79行目)は、
  会場でも実質「profileMapキャッシュ+UID合成フォールバック」でカバーされている**(空ではない)。
- **本当に空なのは`ctx.rememberedAvatar`だけ**であり、これはpopup側の第2分岐(下記事実3)にしか相当しない。

### 事実3: popup側`rememberedAvatarUrlForUserId`の実装(popup-entry.js:5380-5413)

2段構え:
- **第1分岐(5383-5392行目)**: `popupUserCommentProfileMap?.[uid]?.avatarUrl`を見る。これは
  `KEY_USER_COMMENT_PROFILE_CACHE`というstorageキー由来のプロファイルキャッシュで、
  **会場側の`profileAvatarMap`(venueBar.js、同じstorageキーを読む、2378/4772/5146行目)と
  同一データソース**。→ 事実2の通り、会場は既にこれをカバー済み。
- **第2分岐(5393-5410行目)**: 第1分岐が空(または弱い/怪しいURL)だった場合、
  `STORY_SOURCE_STATE.entries`という**popup専用・メモリ上の生コメントentries配列**を対象userId
  について**逆順(新しい方から)走査**し、`avatarUrl`が有効な行を見つけたら使う。
  **これは会場には存在しない情報源**(会場はコメント本文の全件配列をメモリに保持しない設計)。
- どちらも空なら`pickAvatarUrlForUid(uid, null)`(UID合成URL)にフォールバック(会場の
  `enrichVenueRowsWithProfileAvatars`にも同等ロジックがあり既にカバー済み)。

**つまり会場に本当に欠けているのは「第2分岐(entries逆順走査)」相当だけ**であり、既存会議で
言われた「記憶avatar全体」ではない、より狭い問題である。

### 事実4: 会場だけでもサムネ解決経路が最低3系統並存

(a)`venueSeats.js`の`deriveNicoUserIconUrl`をvenueBar.jsが直接import・呼び出し(4176行目付近)、
(b)`venueAvatar.js`の`enrichVenueRowsWithProfileAvatars`、(c)`resolveStoryLaneAvatarSrc`経由
(応援レーン専用、`venueLaneBuckets.js`)。

### 事実5: 診断計器の空白

`avatarLoadDiag`はCDN404の分類のみで、経路混在によるサムネ欠落自体を計測する計器が存在しない。

### 事実6(Fable設計時に発見・司令塔が実読で確認済み): `reportUserThumb.js`の式が他と異なる

`src/lib/reportUserThumb.js`の`buildNiconicoDefaultUserIconUrl`(32-37行目)は
`${NICO_USER_ICON_CDN_BASE}/${bucket}/${s}.jpg`という**サイズセグメント`/s/`が無いURL**を組む。
他6実装・正本`deriveAvatarUrlFromUid`は`${host}/${sz}/${dirNum}/${numUid}.jpg`(`/s/`あり)。
**出力URLが異なる**ため、単純委譲すると挙動変更になる。

## A. 【最重要・裁定】会場の `ctx.rememberedAvatar` を埋めるか

### 結論

**(a) 埋めない(現状維持)。ただし素通しではなく「宣言化+計器付き」の (a)+ で確定する。**

具体的には:
1. 空ctxを「未実装の穴」から「**明示的な null-source 宣言**」に格上げする([C3]の
   `buildVenueIdentityCtx` が `getRememberedAvatar: () => ''` を型として固定)。
2. `venueLaneBuckets.js` 85-87行目のコメントを本裁定の結論で更新する。
3. 再裁定条件を計器(§E)で定義する: **popup側で第2分岐(entries逆順走査)が解決の決め手になった率**
   を実測し、もし全解決の目安1%を超えて決め手になっているなら (b) を再検討する。

### 根拠

- 事実2により、会場の`entry.avatarUrl`経路は`enrichVenueRowsWithProfileAvatars`で既にカバー済み。
  **popupの第1分岐(profileCache)と同一データソース**であり、「記憶avatarが丸ごと欠けている」
  という旧前提は崩れた。
- 本当に欠けているのは第2分岐のみ(事実3)。効くのは「profileCacheへの書き込みが遅延/欠落し、
  かつ`participant.avatar`にも観測値が乗らなかった」**狭い残余窓**だけで、その窓もUID合成
  フォールバックが埋める(白丸ではなく本人のデフォルトCDNアイコンになる。v0.1.1167以降、
  白丸の主因は既に潰れている)。
- (b)を採ると会場に「生コメントentries配列相当」の新情報源が必要になる。これは:
  - 会議のgpt-oss-120b批判(profileMap再利用で足りるのに新state追加は一貫性破壊)が
    司令塔の裏取りで**結論として正しい**と確定済み。
  - 共有キャッシュのstorage購読は「onChangedファンアウトが大配信激重の真犯人」だった前科
    (既存設計書の捨てた案)に抵触する。
  - 「会場はコメント本文の全件配列をメモリに保持しない」設計判断を破壊する。
- 効果が残余窓のみ・コストが設計判断2つの破壊、で釣り合わない。

### 中間案(会議qwen案「遅延評価スタブ」)の扱い

思想は採用、適用点をずらす。[C3]の`IdentityCtx`でrememberedを**値でなくgetter関数**
`getRememberedAvatar(uid): string`として持つ(§C)。venueは`() => ''`定数、popupは既存
`rememberedAvatarUrlForUserId`をそのまま束ねる。これで:
- 会場は実行コストゼロのまま「埋めない」が型で宣言される。
- 将来(b)へ転じる場合も**関所のctx builderを1箇所差し替えるだけ**で済む(呼び出し側は無変更)。
- `resolveStoryLaneAvatarSrc`自体のctx型(`rememberedAvatar: string`)は**変更しない**
  (getterの評価は関所側で行い、stringに落としてから渡す。characterization test
  「1mm不変」を守るため)。

## B. [C1] 7実装の委譲統合

### 結論

正本 = `src/lib/deriveAvatarUrlFromUid.js`(既存)。6実装は**中身1行を正本へ委譲、precondition
regexは呼び出し側に残す**(既存設計書の型どおり)。ただし`reportUserThumb.js`は**式が正本と異なる
(事実6)ため挙動不変フェーズから除外**し、別途裁定する。`avatarResolver.js`は未配線dead codeなので
委譲でなく**削除**。

### 根拠(挙動変更ゼロの保証)

- 正本のpreconditionは`^[0-9]+$`(全実装のregexの上位集合)なので、呼び出し側regexを残せば
  正本委譲で入力集合は不変。
- バケット式の割れ`max(1, floor)` vs `floor`は、**`^\d{5,14}$`の下では数学的に等価**
  (5桁最小=10000 → floor≥1)。`^\d{2,15}$`系(venueSeats/adLanePicks)は元々`floor`なので
  正本と同式。→ 等価性を先にテストで固定してから委譲する(下記手順0)。
- `reportUserThumb.js`は事実6の通り出力URLが異なるため、委譲するとURL自体が変わる=挙動変更に
  なる。フェーズ1から外す。

### 移行順序と差分イメージ(1コミット=1ファイル、各コミットで`npm run verify:cc`緑)

**手順0(委譲前・テスト先行)**: `src/lib/deriveAvatarUrlFromUid.equivalence.test.js`を追加。
- 各コピーと正本の出力一致を、境界値(`99`/`9999`/`10000`/`10999`/`86255751`/14桁/15桁/
  非数値/空)で総当たり比較。
- 「`^\d{5,14}$`下で`max(1,floor)` ≡ `floor`」をテスト名に明記(この等価性がregexに**結合**
  していることを将来に残す。§H-2参照)。

**手順1**: `src/lib/adLanePicksFromRooms.js`(private関数・影響半径最小)
```js
import { deriveAvatarUrlFromUid } from './deriveAvatarUrlFromUid.js';
function nicoIconUrlForUid(uid) {
  const s = String(uid || '').trim();
  if (!/^\d{2,15}$/.test(s)) return ''; // precondition はここに残す(挙動不変・正本は緩い ^[0-9]+$)
  return deriveAvatarUrlFromUid(s, 's'); // 式の正本へ委譲
}
```

**手順2**: `src/lib/venueSeats.js`の`deriveNicoUserIconUrl`(200-201行目) — 同型。
regex `^\d{2,15}$`温存。

**手順3**: `src/lib/supportGrowthTileSrc.js`の`niconicoDefaultUserIconUrl`(29-36行目) —
利用箇所・テストが最厚=退行検知力最高。regex `^\d{5,14}$`と`n < 1`チェックを残し、
`max(1, floor)`の行だけ正本委譲に置換(等価性は手順0で固定済み)。
```js
export function niconicoDefaultUserIconUrl(userId) {
  const s = String(userId || '').trim();
  if (!/^\d{5,14}$/.test(s)) return '';
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return '';
  return deriveAvatarUrlFromUid(s, 's'); // 旧 max(1,floor(n/10000)) は ^\d{5,14}$ 下で floor と等価(equivalence.test で固定)
}
```

**手順4**: `src/domain/user/avatar.js`の`synthesizeCanonicalUsericon`(76-83行目) — 手順3と
同型。ただしこちらは`CANONICAL_USERICON_HTTPS_PREFIX`定数を使っているので、委譲後に
プレフィックス比較系関数(`isCanonicalUsericonUrl`)が壊れないことをテストで確認。

**手順1・3完了、手順4は見送り(v0.1.1173)**: `adLanePicksFromRooms.js`(手順1)・
`supportGrowthTileSrc.js`(手順3)を正本へ委譲済み。**`domain/user/avatar.js`(手順4)は
委譲を試みたが`tests/contract/layer-dependency.test.js`の依存方向契約
(`shared ← domain ← data ← ui ← extension`)により`domain/`から`lib/`への import が
禁止されておりNG判明**。正本`deriveAvatarUrlFromUid.js`を`shared/`層へ移動する対応は
13ファイルに影響する規模でMVPスコープ外のため、このファイルは見送り式のまま維持
(CI構造ガードの許可リストに残置)。[C1]は残り`domain/user/avatar.js`(レイヤー制約待ち)・
`reportUserThumb.js`(手順6・出力URLが異なるため実機裁定待ち)の2件。

**手順5(訂正・2026-07-18実装時): 削除しない**。当初「未配線dead codeなので削除」としていたが、
実装時にファイル冒頭のコメントで「設計の正本として意図的に残置。再配線時は
`docs/plan-avatar-resolver-refactor.md`の5phaseに沿う」という明示的な保持方針が確認された
(0.1.84実装→0.1.90 revert→revertの原因は別経路の競合と判明済み、再配線計画書あり)。
単なるdead codeではなく将来の再配線を見込んだ意図的な残置だったため、ユーザー判断で
**現状維持**。[C4]の許可リストにはそのまま残す(理由コメント付き)。

**手順6(フェーズ2・挙動変更を伴う別コミット)**: `src/lib/reportUserThumb.js`。実機で`/s/`
無しURLが有効か1件確認 → 無効(404/リダイレクト)なら**バグ修正として**正本式へ委譲(コミット
メッセージに挙動変更を明記)。有効なら「別バリアントである理由」をコメントに書き、[C4]の
許可リストへ理由付きで残す。

## C. [C3] resolveUserIdentity 関所

### 結論

新規`src/lib/resolveUserIdentity.js`。avatar解決は`resolveStoryLaneAvatarSrc`に委譲
(二重正本を作らない・既存設計書の型)。ctx builderは同ファイルに同居(3画面分で3関数に
分けるほどの量ではない。肥大したら分割)。

### 型定義とシグネチャ

```js
/**
 * @typedef {Object} IdentitySubject
 * @property {string} userId
 * @property {string} [nickname]
 * @property {string} [avatarUrl]   // 観測済みavatar(会場は enrich 済み participant.avatar)
 */

/**
 * @typedef {Object} IdentityCtx
 * @property {'popup'|'venue'|'web'} kind
 * @property {import('./storyLaneAvatarSrc.js').StoryLaneAvatarSnapshot|null} snapshot
 * @property {(uid: string) => boolean} isOwnPosted
 * @property {(uid: string) => string} getRememberedAvatar  // §A: venue は定数 () => ''(遅延評価スタブ)
 */

/**
 * @typedef {Object} ResolvedUserIdentity
 * @property {string} userId
 * @property {string} displayName
 * @property {string} avatarSrc      // http(s) or ''(呼び出し側がゆっくり顔等にフォールバック)
 * @property {AvatarPathId} avatarPathId  // §E 計器用: 何が決め手だったか
 */

/** @typedef {'entry-avatar'|'remembered'|'own-viewer'|'uid-synth'|'empty'} AvatarPathId */

export function resolveUserIdentity(subject, ctx) { /* → ResolvedUserIdentity */ }

/**
 * popup 用 ctx。rememberedAvatarUrlForUserId(popup-entry.js:5380、第1分岐=profileCache/
 * 第2分岐=entries逆順走査)をそのまま getter に束ねる。
 */
export function buildPopupIdentityCtx({ snapshot, isOwnPosted, rememberedAvatarUrlForUserId }) {
  return {
    kind: 'popup',
    snapshot: snapshot ?? null,
    isOwnPosted: typeof isOwnPosted === 'function' ? isOwnPosted : () => false,
    getRememberedAvatar:
      typeof rememberedAvatarUrlForUserId === 'function' ? rememberedAvatarUrlForUserId : () => ''
  };
}

/**
 * venue 用 ctx。§A 裁定: remembered は意図的 null-source(profileMap 相当は
 * enrichVenueRowsWithProfileAvatars が subject.avatarUrl 側で既にカバー済み)。
 * 引数を取らない=「会場は popup 固有 state を持たない」を型で宣言。
 */
export function buildVenueIdentityCtx() {
  return { kind: 'venue', snapshot: null, isOwnPosted: () => false, getRememberedAvatar: () => '' };
}
```

### 内部実装の要点

```js
export function resolveUserIdentity(subject, ctx) {
  const uid = String(subject?.userId || '').trim();
  const remembered = ctx.getRememberedAvatar(uid); // 関所で string に評価してから渡す
  const avatarSrc = resolveStoryLaneAvatarSrc(
    { userId: uid, avatarUrl: subject?.avatarUrl },
    { snapshot: ctx.snapshot, isOwnPosted: ctx.isOwnPosted(uid), rememberedAvatar: remembered }
  );
  const avatarPathId = classifyAvatarPath(avatarSrc, subject, remembered, ctx); // §E(出力を入力と後付け比較するだけ・解決ロジック不変)
  return { userId: uid, displayName: /* 既存 displayName 系正本へ委譲 */, avatarSrc, avatarPathId };
}
```

- `resolveStoryLaneAvatarSrc`のctx型(`rememberedAvatar: string`)は不変。getter→stringの評価は
  関所が担う(§A)。
- 配線順: まず`venueLaneBuckets.js:88`の直呼びを`resolveUserIdentity(entryModel,
  buildVenueIdentityCtx())`に置換(挙動同一・空ctxが型宣言に変わるだけ)。次にpopupの
  `storyGrowthAvatarSrcCandidate`相当の呼び出し元。web(③)は鏡(publish済みデータ)を表示する
  だけなので当面対象外。

## D. [C4] CI構造ガード

### 結論

新規`src/lib/usericonUrlGuard.test.js`(vitest。verify:ccのtestに自然に乗る)。**2段構え+
ratchet方式**: 許可リストは初回に現状の全違反を列挙して緑で導入し、委譲が済むたびに1件ずつ
削る(減る方向のみ許す)。

### 検出パターン

```js
// 対象: src/**/*.js(*.test.js は除外 — 期待値リテラルは正当。§H-8)
// パターンA(組み立て検出・fail対象):
//   同一ファイル内に 'nicoaccount/usericon' を含むテンプレート/文字列連結
//   かつ /\/\s*10000/(バケット計算)がある = URL式の手書き
// パターンB(文字列の存在のみ・理由付き許可):
//   'nicoaccount/usericon' を含むが /10000 が無い = プレフィックス比較等の正当利用
const ALLOWLIST_BUILD = [
  'src/lib/deriveAvatarUrlFromUid.js' // 正本(恒久)
  // 移行中のみ以下が並ぶ。委譲コミットごとに1件削除(追加はレビュー必須):
  // 'src/lib/venueSeats.js', 'src/lib/adLanePicksFromRooms.js',
  // 'src/lib/supportGrowthTileSrc.js', 'src/domain/user/avatar.js',
  // 'src/lib/reportUserThumb.js'  // ← /s/ 無しバリアント。§B手順6の裁定まで残置
];
const ALLOWLIST_STRING_ONLY = [
  'src/lib/supportGrowthTileSrc.js', // looksLikeNiconicoUserIconHttpUrl のプレフィックス判定
  'src/domain/user/avatar.js'        // CANONICAL_USERICON_HTTPS_PREFIX 比較
];
```

- テストはfsでsrcを全域読み(grep相当)、違反ファイルが許可リスト外なら**ファイル名と行番号を
  出してfail**。エラーメッセージに「正本deriveAvatarUrlFromUid.jsへ委譲せよ
  (avatar-stability-DESIGN.md §B)」を含める(fail-closed+次の一手を示す)。
- 追加で軽い1本: 許可リストのファイルが実在することの検査(リネームで許可リストが腐るのを防ぐ)。

## E. 新規診断計器(最小)

### 結論

2点だけ。どちらも**カウンタのみ**(URL文字列やuidは記録しない・軽量)。

1. **popup第2分岐カウンタ**(§Aの再裁定条件の実測): `rememberedAvatarUrlForUserId`
   (popup-entry.js:5380)内に`{ hitProfileCache, hitEntriesScan, hitSynth }`の3カウンタ。
   §A裁定の生死を握る唯一のデータ。
2. **avatarPathId分布**(経路混在の可視化): 関所`resolveUserIdentity`が返す`avatarPathId`を
   画面種別(kind)ごとに集計`{ popup: {entry-avatar: n, ...}, venue: {...} }`。事実5(経路混在
   によるサムネ欠落を測る計器が無い)の穴埋め。`empty`の数が「サムネがあるべき人で無い」の
   直接指標になる。

### 出力先(訂正・2026-07-18実装時に配線を実地確認)

当初「`statusFastDiagLite`へのpassthrough必須」としていたが、実装時に配線を再確認したところ
**popup計器(`avatarLoadDiag`等)は`fastDiag`/`statusFastDiagLite`とは別系統**と判明した:

- popupの診断ブロック(`collectAiShareDevMonitorPayloadBundle`が組み立てる`payload.popup`)は
  `buildAiSharePopupDiagRecord`(`src/lib/aiSharePopupDiagKey.js`)経由で**`KEY_AI_SHARE_POPUP_DIAG`
  という別キー**に書かれる。`fastDiag`(content-entry由来・`KEY_AI_SHARE_FAST_DIAG`)+その間引き
  `statusFastDiagLite`(`KEY_STATUS_FAST_DIAG_LITE`)とは完全に独立した経路。
- status.htmlは`loadPopupDiagSafe()`(`status-entry.js`)で`KEY_AI_SHARE_POPUP_DIAG`を読み、
  `aiShareFullText.js`が`popupDiag.popup`を**JSON.stringifyでそのまま状態速報テキストに出力**
  (`lines.push(JSON.stringify(popupDiag.popup ?? popupDiag, null, 2))`、既存の`avatarLoadDiag`も
  この経路で出ている)。
- つまり`avatarRememberedDiag`を`avatarLoadDiag`と同じ`payload.popup`ブロックに置けば、
  **追加配線なしで状態速報のJSON出力に自動的に現れる**。lite passthroughは不要
  (この地雷は content-entry 側の fastDiag 系計器にのみ適用される。popup 系計器は別経路)。
- 過剰にしない: CDN 404分類は既存`avatarLoadDiag`の縄張りのまま。confidenceScore・pathIdの
  永続化・時系列は作らない(会議qwen案の縮退採用。§G参照)。avatarPathId分布(関所実装後の
  §E-2)も同じpopup.*経路に置けば同様に配線不要。

## F. MVP(最初の1歩)

**MVP = 手順0+[C4]ガード導入+委譲1件+計器1点**(1〜2コミット、いずれも既存挙動不変):

1. `deriveAvatarUrlFromUid.equivalence.test.js`追加(§B手順0)。
2. `usericonUrlGuard.test.js`を許可リスト全部入りで導入(現状で緑)。以後、委譲するたび
   許可リストから削る=**ガード自体が移行の進捗表(ratchet)になる**。
3. `venueSeats.js`の委譲(§B手順2。venueBar.js 4176行目の呼び出し・`venueAvatar.test.js`・
   v0.1.1167/1170のテストはprecondition温存により無変更で緑のはず。赤くなったらそれ自体が
   等価性の反例=手順0のテスト漏れ)。
4. popup第2分岐カウンタ+lite passthrough(§E-1)。**これで次の実配信から§Aの再裁定データが
   貯まり始める**。

[C3]関所はMVP後の第2弾(委譲が3件済んでから)。理由: 関所は委譲済みの土台の上に置く方が差分が
読みやすく、[C4]が先にあれば関所実装中の手書きURL混入も自動検出される。

## G. 捨てた案と理由

| 案 | 捨てた理由 |
|---|---|
| (b)フル: 会場に生entries配列相当の新情報源 | 効果は残余窓のみ(§A)。「会場はコメント全件をメモリ保持しない」設計判断の破壊。gpt-oss批判が裏取りで正しいと確定済み |
| storage購読でrememberedを会場へ同期 | onChangedファンアウト=大配信激重の真犯人だった前科(既存設計書の捨てた案を再確認) |
| 会議qwen案フル: 7実装温存+競合検知アダプター(pathId/confidence常時計測) | 計測は関所1点で足りる(§E-2として縮退採用)。コピー温存はドリフトの源泉を温存する本末転倒。confidenceScoreは使い道が定義できず過剰 |
| `resolveStoryLaneAvatarSrc`のctx型をgetter直渡しに変更 | characterization test「1mm不変」を破るリスク。getter評価は関所側で吸収すれば同じ効果(§C) |
| `avatarResolver.js`を正本に昇格(名前が最も一般的だから) | 未配線dead codeを正本にすると実績ゼロの二重正本。実績ある`deriveAvatarUrlFromUid.js`が正本 |
| reportUserThumbも一括委譲 | `/s/`欠落で出力が変わる=「挙動変更ゼロ」原則違反。実機裁定を挟む(§B手順6) |

## H. 地雷と回避策

1. **reportUserThumbの`/s/`欠落**: 「同式のコピー」と思い込んで一括置換すると挙動変更が混入。
   → フェーズ1から除外・許可リストに理由付き残置(§B手順6)。
2. **`max(1,floor)` ≡ `floor`はregexに結合した等価性**: `^\d{5,14}$`を将来緩めた瞬間
   (4桁以下許可)に非等価化する。→ equivalence.testのテスト名とコメントに結合を明記(§B手順0)。
3. **lite passthrough忘れ**: 新計器は`statusFastDiagLite`に通さないとコピペに出ない
   (v0.1.1124前科)。→ wiring断言テスト同時追加(§E)。
4. **import漏れのサイレント欠落**: safeSectionのtry/catchが握りつぶし「永久に空欄」化。
   → 出荷ゲートは`npm run verify:cc`一本(lintが捕捉)。
5. **検証エージェント並走中のcommit**: detached HEADで中身欠けコミットの前科。→ 委譲コミットは
   reality-checker完了後に。コミット直後`git branch --show-current` + `git show HEAD:<file>`
   で核心行確認。
6. **ドキュメント地雷**: `venueLaneBuckets.js`85-87行目の空ctxコメントを更新しないと、
   将来の会議でまた「会場は空ctxだ!」と誤診され本設計が再発明される。→ §A-2のコメント更新を
   関所配線と同一コミットに含める。
7. **反映3手順**: pushしてもChromeに届かない。ユーザーのpull→拡張リロード→watchタブF5まで
   案内(配信中`copy:ext`禁止)。
8. **[C4]ガードの偽陽性**: `*.test.js`の期待値リテラル(`supportGrowthTileSrc.test.js`等に
   多数)を検査対象に含めると即赤。→ test除外+プレフィックス比較用途はSTRING_ONLY許可
   リスト(§D)。

## I. コメント規約の適用例(新規 `src/lib/resolveUserIdentity.js` 冒頭)

```js
/**
 * ユーザー識別の関所: subject + IdentityCtx → ResolvedUserIdentity(1関数)。
 *
 * 【入力の出どころ】
 *   subject: ①popup は STORY_SOURCE_STATE 由来の entryModel、②会場は
 *   enrichVenueRowsWithProfileAvatars(venueAvatar.js)適用済みの participant
 *   (avatarUrl は profileMap 補強+UID合成フォールバック済み)。
 *   ctx: buildPopupIdentityCtx / buildVenueIdentityCtx でのみ生成する
 *   (手組み ctx 禁止。会場の getRememberedAvatar が () => '' なのは
 *   avatar-stability-DESIGN.md §A の裁定=意図的 null-source であり未実装の穴ではない)。
 *
 * 【出力の使われ方】
 *   avatarSrc は応援レーン/会場タイルの img src(空ならゆっくり顔等へフォールバック)。
 *   avatarPathId は avatarPathDiag 計器の集計キーのみに使う(表示ロジックに使用禁止)。
 *
 * 【担う責務】
 *   ctx の遅延評価(getter → string)・own 判定の評価・avatarPathId の後付け分類。
 *
 * 【担わない責務(正本を明記)】
 *   avatar 解決の実体 = storyLaneAvatarSrc.js(resolveStoryLaneAvatarSrc)が正本。
 *   UID→URL 式 = deriveAvatarUrlFromUid.js が正本。
 *   本ファイルはどちらも再実装しない(二重正本禁止)。
 *
 * 【関所】
 *   画面(popup/venue/web)からの avatar/表示名解決は必ず本関数を通す。
 *   直接 resolveStoryLaneAvatarSrc を呼ぶ既存箇所は移行完了まで許容、新規は禁止
 *   (usericonUrlGuard.test.js が URL 手書きを、コードレビューが直呼び追加を止める)。
 */
```

## 検証済み事実(司令塔による裏取り)

- `venueLaneBuckets.js:88`の空ctx呼び出し、実在確認済み(コード実読)。
- `resolveStoryLaneAvatarSrc`内で`entry.avatarUrl`(57行目)と`ctx.rememberedAvatar`(56行目)が
  別入力であること、実読で確認済み。
- `enrichVenueRowsWithProfileAvatars`(venueAvatar.js)がprofileMap補強+UID合成フォールバックを
  持つこと、実読で確認済み。
- `rememberedAvatarUrlForUserId`(popup-entry.js:5380-5413)の2段構え、実読で確認済み。
- `reportUserThumb.js`の`/s/`欠落、実読で確認済み(事実6・Fable設計時の新発見)。
- `max(1,floor)` ≡ `floor`が`^\d{5,14}$`下で数学的に等価であること、確認済み。
