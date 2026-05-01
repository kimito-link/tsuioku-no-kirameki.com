# avatar resolver Refactor 設計書（Hoshino-Romi 方式）

> 2026-05-01 作成。Plan エージェントによる avatar pipeline 全面分析 + surechigai-lite
> 参考の component 統合設計。0.1.76〜0.1.81 の 6 層 patch 戦略を、単一 resolver に
> 集約する 5 phase 移行プラン。

---

## 1. surechigai-lite のパターン要約

surechigai-lite (`hosino-romi/surechigai-lite-handoff`) の avatar handling は、
サーバー API レスポンスを単一の真実源 (Single Source of Truth) として扱う薄い設計:

- **型は API 起源で固定** (`app/src/lib/api.ts`): `EncounterItem.other_avatar_url:
  string | null` という 1 フィールドを `request<T>` 経由で受け取り、それ以外の
  avatar 情報源は無い。
- **状態は Zustand 1 store** (`app/src/store/index.ts`): 自分の `avatarUrl` も
  `EncounterItem[]` に持つ他人の `other_avatar_url` も同じ store。setter は
  `setProfile`/`setEncounters` のみ。
- **表示は単一 component** (`app/src/components/Avatar.tsx`): Props は
  `{ url, nickname, size }` の 3 つのみ。

「URL は API が決める / store に置く / Avatar が描く」の 3 工程しかない。

nicolivelog は本質的に複数ソース（ニコ生プロトコル制約）なので、**「複数ソースを
`AvatarObservation` 形に正規化し、resolver を通る一筋道にする」**戦略を採る。

---

## 2. nicolivelog 現状の avatar pipeline

### 2.1 全体図（mermaid）

```mermaid
graph TB
  subgraph "観測層 (Write Sources)"
    S1[NDGR intercept entry]:::w
    S2[VIEWER_JOIN flush DOM]:::w
    S3[NDGR map userId→avatar]:::w
    S4[Snapshot embedded JSON]:::w
    S5[stored nls_comments_*]:::w
    S6[Comment harvester DOM]:::w
  end

  subgraph "中間キャッシュ層 (Mutation State)"
    C1[interceptedUsers Map<br/>commentNo→{uid,name,av}]:::c
    C2[interceptedAvatars Map<br/>uid→avatarUrl]:::c
    C3[interceptedNicknames Map]:::c
    C4[KEY_USER_COMMENT_PROFILE_CACHE<br/>chrome.storage.local]:::c
    C5[STORY_SOURCE_STATE.entries<br/>popup in-memory]:::c
    C6[broadcasterUidCache /<br/>broadcasterIconUrlCache<br/>module-local in content]:::c
  end

  subgraph "ガード層 (現状 6 層)"
    G1[isAvatarSafeToAssociate<br/>content-entry.js L1018]:::g
    G2[resolveUserEntryAvatarSignals<br/>lib/userEntryAvatarResolve.js]:::g
    G3[sanitizeRoomAvatarsForBroadcaster<br/>lib/sanitize...js]:::g
    G4[userLaneCandidatesFromStorage opts<br/>lib/userLane...Storage.js]:::g
    G5[storyGrowthAvatarSrcCandidate<br/>popup-entry.js L2426]:::g
    G6[storyUserLaneContamination<br/>contamination guard]:::g
  end

  subgraph "表示層 (Read Sinks)"
    R1[storyUserLane LinkColumn]:::r
    R2[topSupportRankStrip]:::r
    R3[room-card list]:::r
    R4[HTML report user table]:::r
    R5[HTML report comment list]:::r
    R6[CSV report]:::r
  end

  S1 --> G1 --> C1
  S1 --> C4
  S2 --> G1 --> C2
  S2 --> C4
  S3 --> G1 --> C2
  S4 --> C6
  S6 --> G2 --> C5
  S5 --> C5

  C2 --> G2
  C1 --> G2
  G2 --> C5

  C4 --> G5
  C5 --> G5
  G5 --> R1

  C5 --> G3 --> R2
  C5 --> G3 --> R3
  C5 --> G3 --> R4
  C5 --> R5
  C5 --> R6

  C5 --> G4
  G4 --> G6 --> R1

  classDef w fill:#cfc,stroke:#080
  classDef c fill:#fc9,stroke:#a40
  classDef g fill:#f99,stroke:#a00
  classDef r fill:#9cf,stroke:#06a
```

### 2.2 未ガードな書き込み経路（永続汚染源）

| # | 経路 | 場所 | ガード適用 |
|---|---|---|---|
| **W5** | VIEWER_JOIN → KEY_USER_COMMENT_PROFILE_CACHE | content-entry.js:962-984 | **未ガード** |
| **W6** | enriched comment → KEY_USER_COMMENT_PROFILE_CACHE | content-entry.js:5218-5223 | **未ガード** |
| **W7** | hydrateInterceptAvatarMapFromProfile | content-entry.js:5248 | **未ガード** |

これが 0.1.81 後も avatar 取り違えが直らない真因。`upsertUserCommentProfileFromEntry` /
`upsertUserCommentProfileFromIntercept` (`src/lib/userCommentProfileCache.js:134, 148`)
が broadcaster ガードを知らないので、汚染データが 30 日永続書き込みされ、次セッションで
W7 経由で in-memory cache に戻る。

---

## 3. 統合 component 設計案

### 3.1 名前と位置

- **名前**: `avatarResolver`
- **配置**: `src/domain/user/avatarResolver.js`（既存 `avatar.js` の発展）
- **補助**: `src/data/store/broadcasterContext.js`（broadcaster 情報の単一源）

### 3.2 インターフェース

```typescript
// src/domain/user/avatarResolver.d.ts

export type AvatarObservationKind =
  | 'dom'           // コメント DOM から直接観測
  | 'ndgr-entry'    // NDGR intercept 行
  | 'ndgr-map'      // NDGR userId→avatar マップ
  | 'stored'        // chrome.storage.local 復元
  | 'live-api'      // live-api / snapshot 経由
  | 'profile-cache'; // KEY_USER_COMMENT_PROFILE_CACHE 復元

export interface AvatarObservation {
  readonly kind: AvatarObservationKind;
  readonly url: string;
  readonly observedAt: number;
}

export interface BroadcasterContext {
  readonly broadcasterUid: string;
  readonly broadcasterIconUrl: string;
}

export interface ViewerContext {
  readonly viewerUid: string;
  readonly viewerAvatarUrl: string;
}

export interface AvatarResolveInput {
  readonly userId: string;
  readonly observations: readonly AvatarObservation[];
  readonly broadcaster: BroadcasterContext;
  readonly viewer?: ViewerContext;
}

export interface AvatarResolveResult {
  readonly displayUrl: string;
  readonly observedKinds: ReadonlySet<AvatarObservationKind>;
  readonly rejected: ReadonlyArray<{
    kind: AvatarObservationKind;
    reason: 'broadcaster-impersonation' | 'viewer-impersonation' | 'invalid-url';
    url: string;
  }>;
  readonly hasNonCanonicalPersonalUrl: boolean;
}

/** 全 avatar 解決の単一エントリポイント */
export function resolveAvatar(input: AvatarResolveInput): AvatarResolveResult;

/** 単一観測のガード判定（書き込み時のフィルタ用） */
export function isObservationSafe(
  userId: string,
  observation: AvatarObservation,
  broadcaster: BroadcasterContext,
  viewer?: ViewerContext
): { safe: true } | { safe: false; reason: string };
```

### 3.3 既存ガード関数との対応

| 既存ガード | resolver の何に吸収するか | 削除可能か |
|---|---|---|
| G1 `shouldAssociateAvatarWithUser` | `isObservationSafe` 内のガード 1+2 として再利用 | shim に縮小 |
| G2 `resolveUserEntryAvatarSignals` | `resolveAvatar` 入力作成 helper として書き直し | Phase E で削除 |
| G3 `sanitizeRoomAvatarsForBroadcaster` | aggregate **入力** 段で resolver を通す | 関数自体は不要に |
| G4 `userLaneCandidatesFromStorage` opts | observation kind を埋める時に broadcaster context を持たせる | 関数残し内部書き換え |
| G5 `storyGrowthAvatarSrcCandidate` の `guardAv` | popup の表示前 hook で `resolveAvatar` を呼ぶ | guardAv lambda は削除 |
| G6 `shouldSkipStoryUserLaneCandidateByContamination` | resolver の責務外 | そのまま残す |

---

## 4. 段階的移行プラン（5 phase）

### Phase A: contract test と broadcasterContext 集約（半日）

1. contract test 追加（既存ガード関数が resolver 経由で呼ばれるか）
2. `src/data/store/broadcasterContext.js` 新設（get/set/subscribe）
3. `shared/url/avatar.js` 新設（URL utility 集約）

**着地条件**: 既存テスト green、UI 変化なし。リリース不要。

### Phase B: `avatarResolver` 本体実装（1 日）

1. `src/domain/user/avatarResolver.js` 実装
2. `avatarResolver.test.js` で TDD 10 ケース
3. G1 を resolver の thin wrapper に置き換え
4. dev mode で diagnostic 追加

**着地条件**: 既存テスト green、新規 10 ケース green。
**リリース**: 0.1.82「内部基盤整備、UI 変化なし」

### Phase C: 書き込み経路を resolver 経由に統一（1 日） ← **最 critical**

1. `interceptedAvatars.set` 4 箇所を `observeAvatar` 経由に
2. **未ガード W5/W6**: `userCommentProfileCache.js` の upsert に broadcaster context
3. **W7**: `hydrateInterceptAvatarMapFromProfile` も同様
4. `interceptedAvatars` の型を `Map<uid, observation>` に拡張

**着地条件**: 全書き込みが resolver 経由、永続汚染が止まる。
**リリース**: 0.1.83「永続キャッシュへの汚染書き込み防止」← **これが本命の bugfix**

### Phase D: 読み出し経路を resolver 経由に統一（1 日）

1. `storyGrowthAvatarSrcCandidate` を 30 行に書き直し
2. `sanitizeRoomAvatarsForBroadcaster` の callsite 置換
3. `userLaneCandidatesFromStorage` の opts ガードを削除
4. memoize 導入

**リリース**: 0.1.84「6 層→1 層に集約」

### Phase E: 旧コード削除（半日）

1. shim 化、deprecated 削除
2. AGENTS.md / CLAUDE.md にルール明文化

**リリース**: 0.1.85「死コード削除、整理完了」

---

## 5. テスト計画（10 ケース）

| # | ケース | 期待 |
|---|---|---|
| T1 | 観測ゼロ + 数値 ID | canonical 合成 |
| T2 | 観測ゼロ + 匿名 ID | 空 |
| T3 | DOM 観測 1 件 | DOM 採用 |
| T4 | broadcaster なりすまし URL | reject + canonical fallback |
| T5 | サイズバリアント (uri150x150 vs s/) | reject |
| T6 | broadcaster 本人 uid + broadcaster icon | 通す |
| T7 | broadcaster 情報未取得 | ガード掛けず通す |
| T8 | 多ソース併存 | 優先順 (dom > ndgr-entry > stored) |
| T9 | profile-cache 経由汚染 | reject + canonical fallback |
| T10 | viewer なりすまし | reject |

**E2E (Playwright)**:
- C1: ギフト送信後の応援者リストに自分の uid のセルに broadcaster icon が出ない
- C2: chrome.storage に汚染データを事前注入しても表示時に canonical fallback
- C3: tab 切替で broadcaster 情報遅延取得 → 再描画後に正しいアイコン

---

## 補足: なぜこの設計が「次の patch を要求しない」か

surechigai-lite の安定性は「ソース 1 つ」由来。nicolivelog はソースを減らせないが、
**「複数ソースを `AvatarObservation` に正規化し、resolver を 1 度通る」**設計で、
新観測経路追加時も resolver 入力に新 kind を増やすだけでガードが自動的に効く。

broadcaster context を `BroadcasterContextStore` に集約することで、現状 25+ 箇所
散らばる `watchMetaCache.snapshot?.broadcasterUserId` 参照を 1 箇所に閉じる。
content-entry の `broadcasterUidCache` (L998) と popup-entry の `watchMetaCache`
(L290-) の 2 系統 sync ズレも解消。
