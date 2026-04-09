# UX 仮説行列（テスト駆動 × リサーチトレース）

Quen 文書の観点を検証可能な仮説 ID に落とし、Playwright / 手動の合格基準と一次ソースメモを対応付ける。長文ポリシー回避のため最小限のみ記載する。

## 仮説一覧

| ID | 内容（要約） | 検証手段 | Spec / 場所 | 合格基準（例） |
|----|-------------|----------|----------------|----------------|
| H1-Perception | 開いた瞬間に記録 ON/OFF が視覚・マシン可読で一貫する | Playwright | `tests/e2e/popup-recording-sa.spec.js` | `#recordToggle` が見える。`.nl-record-hero` の `data-nl-recording` が `on`/`off` で `checked` と一致 |
| H1-a11y | 「説明ゼロ」と支援技術の両立 | Playwright + 手動 | 同上 + `popup.html` | `aria-label`（または等価の名前）が記録トグルに残る |
| H2-Consistency | ポップアップと `inline=1` で記録表示が同じストレージを反映 | Playwright | `tests/e2e/popup-recording-sa.spec.js` | 同一 `chrome.storage.local` 値に対し両方で `data-nl-recording` が一致 |
| H3-Progressive | 詳細設定は折りたたみ内（既存） | Playwright | `tests/e2e/popup-settings-details.spec.js` | `details#nlPopupSettings` 初期 `open === false` かつ記録トグルは常時可視 |

## リサーチトレース（仮説 ID 別）

### H1-Perception / H1-a11y

- **WCAG 2.2 4.1.2 名前・役割・値**: コントロールの状態がプログラム的に解釈できること。チェックボックスの `checked` に加え、テスト安定化用に `data-nl-recording` を併用（表示状態の単一ソースは仍ち `checked`）。
- **MDN `<input type="checkbox">`**: ネイティブの `checked` IDL 属性が支援技術に伝わる。独自 `role="switch"` への置換は必須ではない。
- **採用判断**: 既存の `aria-label` を維持しつつ、E2E と将来のスタイル用に `data-nl-recording` を付与。色のみに依存しない（色覚・暗所視聴）。

### H2-Consistency

- **Chrome Extension**: `popup.html` と `popup.html?inline=1` は同一ドキュメントのため、同一 `refresh()` 経路でハイドレートすれば理論上一致。検証はストレージ書き換え後の再読込で行う。
- **採用判断**: 二画面の分岐ロジックを増やさず、`refresh()` 内の単一関数で `data-nl-recording` を同期。

### H3-Progressive

- 既存実装・spec で担保済み。本行列では追跡のみ。

## 次サイクル（未着手の論点メモ）

- 周辺視野・1 秒グランサビリティ: 手動プロトコル（デュアルタスク）向け。自動 E2E 化は別タスク。
- Twitch Extension ガイドライン（点滅禁止等）: インラインオーバーレイ改修時に `H4-Motion` として追加推奨。
