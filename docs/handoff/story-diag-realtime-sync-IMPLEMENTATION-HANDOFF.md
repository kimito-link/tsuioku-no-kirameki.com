# 実装ハンドオフ: 会場モード記録件数リアルタイム同期(MVP)

> 正本設計: [`story-diag-realtime-sync-DESIGN.md`](story-diag-realtime-sync-DESIGN.md)
> 日付: 2026-07-18。3段構えワークフロー手順3の産物。実装はこのファイルを読めば着手できる粒度。

## 背景(1行)

②会場モードの「記録している応援コメント◯件です」パネルが、①popupを開いていないと
固定表示のまま更新されない。設計書のFableが裏取りで発見: 実は`content-entry.js`が
既にpopup非依存で件数(`recordedCount`)を`nls_panel_summary_<lv>`へ2秒間隔でpublish
し続けており、②会場モードがまだそれを読んでいないだけだった。

## MVP スコープ(今回はこれだけ)

設計書の**§F MVP**通り、②venueBar側の配線のみ実装する: [C-1]純関数
`resolveStoryDiagTotal` + [C-2]venueBarでのpanel summary購読(catch-up+onChanged+
保険read) + [C-3]`venueStoryDiagMirrorPanel.js`の拡張。

**①popup-entry.jsの3箇所の移行(設計書§E)はMVPに含めない**(次フェーズ)。理由: 事故
半径を最小にするため(popup-entryの巨大ファイルとvenueBarを同一patchで同時に触らない)。

**最重要の設計判断(§0)**: `background.js`への集計移行はしない。件数の一次生成元
(`content-entry.js`)は既にpopup非依存で動いているので、venueBar側がそれを読むだけで
根治する。

## 着手手順

### 1. ブランチを切る

```bash
git checkout -b feat/story-diag-realtime-sync
```

### 2. TDD: `src/lib/storyDiagTotalSource.js` + `.test.js`(新規)

設計書§C-1の型・関数シグネチャをそのまま実装:

```js
import { selectDisplayRecordedCount } from './displayRecordedCount.js';

/**
 * @param {{ panelSummary?: unknown, liveId?: string, fallbackTotal?: number, nowMs?: number }} args
 * @returns {{ total: number, source: 'panel'|'fallback', panelAgeSec: number|null }}
 */
export function resolveStoryDiagTotal({ panelSummary, liveId, fallbackTotal, nowMs }) {
  // panelSummary.liveId が liveId と正規化一致し、recordedCount が有限数なら
  //   { total: selectDisplayRecordedCount(panelSummary), source: 'panel', panelAgeSec }
  // それ以外は
  //   { total: max(0, floor(fallbackTotal||0)), source: 'fallback', panelAgeSec: null }
}
```

`panelSummary`の実際のフィールド名(`liveId`かそれとも別名か、更新時刻フィールドの名前)は
`src/lib/panelLiveSummary.js`と`content-entry.js:10923`付近の実際のオブジェクト構造を
先に読んで確認すること(設計書は構造の詳細まで裏取りしていないため、実装時に確認必須)。

**テストケース**:
- panelSummaryがliveId一致・recordedCount有限数 → `source: 'panel'`
- panelSummaryがliveId不一致 → `source: 'fallback'`
- panelSummary未指定/null → `source: 'fallback'`
- fallbackTotalが負数/NaN → 0にクランプ

### 3. venueBar.jsへの配線(設計書§C-2)

**3-1. catch-up**(`venueBar.js:4808-4828`付近の既存1回読みブロック):
`chrome.storage.local.get([KEY_LANE_MIRROR, KEY_STORY_DIAG_MIRROR])`に
`panelSummaryStorageKey(liveId)`を追加し、結果を`panelSummarySnap`(新規モジュールスコープ
変数)に保持してから`renderStoryDiagMirrorPanel()`を呼ぶ。

**3-2. onChanged**(`venueBar.js:5115-5119`付近の既存`KEY_STORY_DIAG_MIRROR`受信ブロックの
直後): 設計書§Iのコメント規約をそのまま使う:

```js
const panelChange = changes[panelSummaryStorageKey(liveId)];
if (panelChange && panelChange.newValue && typeof panelChange.newValue === 'object') {
  panelSummarySnap = panelChange.newValue;
  _panelSummaryLastSeenAt = Date.now();
  renderStoryDiagMirrorPanel();
}
```

**3-3. 保険read**(設計書§D-2、既存の定期ポーリング内、新規タイマーは作らない):

```js
const STORY_DIAG_PANEL_STALE_MS = 15_000;
if (Date.now() - _panelSummaryLastSeenAt > STORY_DIAG_PANEL_STALE_MS) {
  const bag = await runStorageOpWithTimeout(
    () => chrome.storage.local.get(panelSummaryStorageKey(liveId)), 3000);
  const snap = bag?.[panelSummaryStorageKey(liveId)];
  if (open && snap && typeof snap === 'object') {
    panelSummarySnap = snap;
    _panelSummaryLastSeenAt = Date.now();
    renderStoryDiagMirrorPanel();
  }
}
```

**地雷(設計書§H-7)**: この保険readは既存の「間引きポーリング」内に相乗りさせること。
毎tickの直列(コア)readに足すと大配信での重さ再発(既知の教訓)。

**地雷(設計書§H-3)**: 配信切替時に`panelSummarySnap`・`_panelSummaryLastSeenAt`を
リセットすること(前配信の値を持ち越さない)。

### 4. `venueStoryDiagMirrorPanel.js`の拡張(設計書§C-3)

`renderVenueStoryDiagMirrorPanel(host, snap, opts = {})`に`opts.panelSummary`を追加し、
内部で`resolveStoryDiagTotal`を呼んで描画用totalを解決する。

**単調クランプの再利用**: `src/lib/storyDiagMonotonic.js`の`createStoryDiagMonotonicState()`/
`applyStoryDiagMonotonic()`をvenueBarモジュールスコープに1つ持ち、`resolveStoryDiagTotal`の
結果を通してから描画すること(新規実装しない、既存libをそのまま使う)。

**鏡不在でも描画する**(現状は非表示): `panelSummary`が同一liveIdで有効なら、鏡
(`KEY_STORY_DIAG_MIRROR`)が無くても件数行だけは描画する。内訳(`details`)は
「内訳は①ポップアップを開くと表示されます」の1行に差し替える(0埋めのverboseで
「アイコン0件」と誤読させないため)。

**鮮度2本立て表示**: 見出しを`①の診断(内訳 ◯分前・件数 ◯秒前)`のような形にし、
`◯秒前`は`panelSummary`の更新時刻由来、`◯分前`は鏡の`capturedAt`由来、と区別して出す。

### 5. 計器追加(設計書§C-4)

`totalSource`/`panelAgeSec`をstoryDiag鏡payload相当の場所に追加する場合、
**statusFastDiagLiteのpassthroughに必ず追加すること**(忘れると状態速報のコピペに
永久に出ない)。この作業がMVPスコープに含まれるかは、実装難易度を見て判断してよい
(最小限は「MVPでは追加せず、次フェーズでE移行と同時に行う」でもよい)。

## 機械的な完了判定

- [ ] `storyDiagTotalSource.test.js`が境界値ケース(手順2に列挙)を全てカバーし緑
- [ ] `venueStoryDiagMirrorPanel.test.js`に「鏡不在・panelSummaryありで件数行のみ描画」
      「鮮度2本立て表示」のテストケースを追加し緑
- [ ] 実機確認: ①popupを閉じた状態で②会場モードを開き、配信中にコメントが増えると
      件数がリアルタイムで増えることを確認(これが今回の症状の根治確認)
- [ ] 実機確認: ①popupが一度も開かれていない状態でも②単独で件数が表示されることを確認
- [ ] 配信切替時に前配信の件数を持ち越さないことを確認
- [ ] `npm run verify:cc`全緑
- [ ] 新規ファイル追加のためtree-map/feature-map再生成をコミットに含める

## 地雷(設計書§Hより実装時に特に注意すべきもの再掲)

1. **`§12.8`のmax混ぜ禁止**: 鏡totalと正本の大きい方を取らない。fallbackは正本不在時のみ。
2. **配信切替での持ち越し**: monotonic state・`panelSummarySnap`はliveId照合+切替時破棄。
3. **鏡不在時の0埋めverbose誤読**: 内訳を出さない、代替の1行案内文にする。
4. **venue保険readをコアreadに足さない**: 既存の間引きポーリングへの相乗りのみ。
5. **storage onChangedファンアウト再燃を避ける**: 書き込み側のcadenceは一切増やさない
   (contentの既存publish頻度のまま)。

## 次フェーズ(MVP完了後、このハンドオフのスコープ外)

設計書の§E(`STORY_AVATAR_DIAG_STATE.total`をpopup-entry.js内3箇所で正本統合する)は
別PRで着手する。MVPだけでも症状(②の固定表示)は根治するため、この次フェーズは
「①の診断パネルのtotalも同じ正本を向ける」という仕上げの位置づけ。
