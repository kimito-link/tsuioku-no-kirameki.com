# UI/UX 改善ロードマップ（テスト駆動）

アドバイザー所見（二重表示の整理 D、スクロール単一化、下ドックの主役）を、**テストで受け口を固定してから**実装する順序。

## 原則（Red → Green → Refactor）

1. **受け入れ条件をテストで書く**（単体は `src/lib/*.test.js`、ブラウザ挙動は `tests/e2e/*.spec.js`）。
2. **失敗（Red）を確認**してから最小実装（Green）。
3. 重複を直す（Refactor）。契約（storage キー・メッセージ型）は変えない範囲で。

## フェーズ一覧

| フェーズ | 目的 | 主なテスト置き場 | 状態 |
|----------|------|------------------|------|
| **0** | ツールバー押下の「意図」を純関数で表す（将来 background と接続） | `src/lib/uiUxOpenStrategy.test.js` | 実装済 |
| **1** | ツールバー → インライン前面化（または通知）の **E2E / 手動** | `tests/e2e/`（新規 or 既存拡張） | 未 |
| **2** | 二重スクロール解消：`.nl-main` と `.nl-story-growth` の **scroll owner を一つに** | E2E: スクロール可能要素の数・ホイール挙動 | 未 |
| **3** | 下ドック時：応援表示優先＋入力折りたたみ（設定で A 切替は後回し可） | E2E + 必要なら単体 | 未 |
| **4** | 「常に別窓も許可」等の **storage フラグ**と排他オプション | 単体 + storage 整合 E2E | 未 |

## フェーズ 0（完了内容）

- `resolveToolbarPopupIntent(policy, context)`  
  - `policy`: `prefer_focus_inline` | `always_open_popup`  
  - `context`: `{ inlineHostVisible: boolean }`  
  - 戻り値: `focus_inline_host` | `open_toolbar_popup`  
- **Chrome API に依存しない**ため単体テストのみで完結。background から同関数を import して使う想定。

## フェーズ 1 以降の進め方（TDD）

### フェーズ 1: ツールバーとインラインの棲み分け

1. **E2E（Red）**: mock watch ページに `#nls-inline-popup-host` がいる状態で拡張アイコン相当の操作をすると、（仕様どおり）iframe がフォーカスされる or バナーが出る、を `expect` で固定。
2. **Green**: `chrome.action` の `onClicked` または既存経路で `focus_inline` 分岐（実装は最小）。
3. **Refactor**: メッセージ型を増やす場合は `NLS_*` の一覧と既存 E2E を確認。

### フェーズ 2: 単一スクロール

1. **Red**: `popup.html` 系で「縦スクロール `overflow-y` が付いた要素が想定では 1 つだけ」など、**数える** E2E（または `evaluate` で `scrollHeight > clientHeight` の要素数）。
2. **Green**: `popup.html` の CSS を調整（外側だけ / 内側だけ）。インラインは別テーマクラスで **B（内側単一）** を検討。
3. **Refactor**: 既存 `popup-layout.spec.js` のヘルパと共通化。

### フェーズ 3: 下ドックの主役

1. **Red**: `inline=1` + ドック相当の見た目で、コメント欄が折りたたみ初期状態であること、等。
2. **Green**: CSS / 初期 `details` / `hidden` の切替。
3. **Refactor**: `INLINE_MODE` 分岐の重複削減。

### フェーズ 4: 設定

1. **Red**: `chrome.storage.local` のキーとデフォルトをテストで固定。
2. **Green**: オプションページまたは既存設定 UI にトグル。

## 関連ファイル

- ポリシー: `src/lib/uiUxOpenStrategy.js`
- 将来の TODO テスト（未実装フェーズの受け皿）: `src/lib/uiUxRoadmapTdd.test.js`

## CI

各フェーズの完了ごとに `npm test` 必須。E2E を触ったら `npm run test:e2e:ci` または該当 spec。
