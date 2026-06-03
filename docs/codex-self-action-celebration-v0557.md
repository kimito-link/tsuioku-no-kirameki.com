# Codex 依頼: 自分操作時の必ず演出（self-action celebration）v0.1.557

## 起動方法

1. 作業ディレクトリ: `tsuioku-no-kirameki.com`（リポジトリ root）
2. Codex フル活用モードで **`.codex-task-prompt.txt` の全文** を最初のプロンプトに貼る
3. 完了まで実装・テスト・build・commit（push しない）

---

## 背景（会議決定の意図）

**「アプリから自分がコメント／ギフト／広告した瞬間 → 必ず軽い演出が返る」** ことで、記録ビューアから「投げると気持ちいいツール」へ体験を上げる。

### 二段構え（必須）

| 層 | トリガー | 演出強度 | 既存 |
|----|----------|----------|------|
| **A. 自分操作** | アプリ経由の成功直後 | 軽量（毎回） | **今回実装** |
| **B. 節目** | アプリ「記録」が 10/100/1000 件等 | 豪雨・飛び文字・強 pika | v0.1.554〜556 済 |

**自分操作でフル豪雨（180体）を毎回出さない。** 連投でうるさい。

---

## 既存実装（再実装禁止・再利用）

| モジュール | 役割 |
|-----------|------|
| `src/lib/supportCelebration.js` | 節目判定（`pickCommentMilestoneCelebration` 等）。**コメント節目はアプリ「記録」件数のみ**（公式コメ数は混ぜない） |
| `src/lib/giftBahamutCelebration.js` | ギフトログ検知 → ズーム spec |
| `src/lib/celebrationFlyText.js` | ニコ生／ボカロ MV 風飛び文字 |
| `src/lib/celebrationPika.js` | ぴかっ flash tier |
| `src/extension/popup-entry.js` | `playSupportCelebrationDom` / `playGiftBahamutDom` / `appendCelebrationFlyTextLayer` / `appendCelebrationPikaLayer` |
| `extension/popup.html` | `.nl-celebration-shower*` / `.nl-gift-bahamut*` / `.nl-celebration-flytext*` / `.nl-celebration-pika*` |

### 既存の受動トリガー（壊さない）

- `noteCommentMilestoneHighWater(liveId, countToShow)` … **アプリ記録のみ**
- `scanCommentsForGiftBahamut` / `scanCommentsForNicoadCelebrations` … コメントログ走査
- storage dedupe: `KEY_SUPPORT_CELEBRATION_STATE` … **節目用**。自分操作は **storage に書かない**（毎回出すため）

---

## 実装タスク

### 1. 新規 `src/lib/selfActionCelebration.js` + test

```ts
/** @typedef {'self_comment'|'self_gift'|'self_ad'} SelfActionCelebrationKind */

/** @typedef {Object} SelfActionCelebrationSpec
 * @property {SelfActionCelebrationKind} kind
 * @property {string} message
 * @property {number} durationMs  // 例: 1800〜2400
 * @property {string} sessionDedupeKey  // セッション内重複抑制のみ
 */
```

純関数:

- `buildSelfCommentCelebrationSpec()` → message: `コメント送信！` 等
- `buildSelfGiftCelebrationSpec({ sender, item, point })` → 既存 gift tier に応じた軽量メッセージ
- `buildSelfAdCelebrationSpec({ sender, point })` → `○○pt 広告！`
- `selfActionUsesGiftZoom(kind, point?)` … gift かつ point>=50 なら `playGiftBahamutDom`、それ以外は軽量 shower
- `SELF_ACTION_CELEBRATION_MIN_GAP_MS = 2500`（export）

**テスト**: `src/lib/selfActionCelebration.test.js`

### 2. popup-entry.js — フック（正本）

#### A. コメント送信（必須・最優先）

`submitComment()` 内、`result.ok` の直後（`setCommentPostNotice('コメントを送信しました'...)` の前後）:

```js
void maybePlaySelfActionCelebration(liveId, buildSelfCommentCelebrationSpec());
```

- `requestPostCommentToOpenTab` **成功時のみ**
- 失敗・revert 時は出さない

#### B. ギフト（自分の投げ）

`scanCommentsForGiftBahamut` で **seedOnly を抜けた新規行** のうち、送信者が視聴者本人と判定できたとき:

- `watchMetaCache.snapshot?.viewerUserId` と `parseGiftCommentText` の sender を照合
- または `getOwnPostedMatchedIdSet` / コメント行の `selfPosted` 相当
- 本人判定できたときだけ `maybePlaySelfActionCelebration` または `maybePlayGiftBahamut`（pt に応じて）

**他人のギフトは従来どおりログ検知のみ**（変更なし）。

#### C. 広告（自分の投げ）

`scanCommentsForNicoadCelebrations` 同様、**新規行かつ sender が viewerUserId / ニックネーム一致** のとき `buildSelfAdCelebrationSpec` で軽量演出。

`pickNicoadCommentCelebration`（累計マイルストーン）と **二重再生** しないよう、同じ comment key で session dedupe を共有。

### 3. `maybePlaySelfActionCelebration(liveId, spec)`（popup-entry 内）

- `supportCelebrationMotionEnabled()` 尊重
- `_celebrationSessionDedupe` に `sessionDedupeKey` を追加（**storage dedupe は呼ばない**）
- `_lastSelfActionCelebrationAt` + `SELF_ACTION_CELEBRATION_MIN_GAP_MS` で連投抑制
- 演出分岐:
  - **軽量 shower**: `dropCount` 6〜10、rinku/konta 混在、`dropVariant` なし、`pikaTier: 'soft'`
  - **ギフト medium+**: 既存 `pickGiftBahamutCelebration` 相当の spec で `playGiftBahamutDom`（本人かつ pt>=50 などルールは `selfActionCelebration.js` に集約）

既存 `playSupportCelebrationDom` を拡張するか、薄いラッパで `SupportCelebrationSpec` を組み立てて再利用してよい。

### 4. UI 文言

- 節目: `アプリ記録 ○○ 件達成！`（済）
- 自分操作: `コメントありがとう！` / `ギフト届いた！` / `広告ありがとう！` など短く

### 5. 動き控えめ

- `nl-calm-motion` / `prefers-reduced-motion`: 自分操作も **バナー文言のみ**（既存方針）

### 6. バージョン

- `package.json` / `extension/manifest.json` → **0.1.557**
- `src/lib/changelog.js` 先頭エントリ（日本語、items に angle-bracket タグ禁止）

### 7. 検証

```bash
npm run typecheck
npx vitest run src/lib/selfActionCelebration.test.js src/lib/supportCelebration.test.js src/lib/giftBahamutCelebration.test.js src/lib/celebrationFlyText.test.js src/lib/celebrationPika.test.js
npm run build
```

### 8. commit

```
自分操作時の必ず演出を追加（コメント・本人ギフト・本人広告）v0.1.557
```

---

## 触ってよいファイル

| 触る | 触らない（除非必要） |
|------|---------------------|
| `src/lib/selfActionCelebration.js`（新規） | `src/lib/marketingChartsHtml.js` |
| `src/lib/selfActionCelebration.test.js`（新規） | `extension/background.js` 大規模変更 |
| `src/extension/popup-entry.js`（フック + maybePlay） | `src/extension/content-entry.js`（viewerUserId 取得済みなら popup 側で足りる） |
| `extension/popup.html`（軽量 shower 用 class が要れば最小） | |
| `package.json` / `manifest` / `changelog.js` | |
| `extension/dist/popup.js`（build 生成） | |

---

## 受け入れ条件（手動）

1. 拡張 popup からコメント送信成功 → **2.5 秒以内** に軽い pika + 短い shower／文字（豪雨ではない）
2. 本人がギフトしたログが流れる → ズーム or 軽量（pt ルール通り）
3. 本人の「○○pt 広告しました」→ 軽量演出
4. **記録 100 件節目**は従来の豪雨のまま（退行なし）
5. 他人のギフト／広告だけでは、従来と同様（本人判定時のみ追加演出）

---

## 参考

- プレビュー（任意更新）: `docs/.visual-explainer/celebration-full-preview.html`（gitignore）
- 記録 vs 公式の不具合修正: v0.1.556 `noteCommentMilestoneHighWater` は `countToShow` のみ
