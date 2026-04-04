# フェーズ B バックログ（信頼性の次）

[llm-handoff-questions.md](llm-handoff-questions.md) §2 と整合。実装は方針・データ損失ポリシー決定後に TDD で。

## パフォーマンス

- MutationObserver の `subtree: true` コストを、Performance API または開発専用の mutation 回数ログで計測する。
- [commentHarvest.js](../src/lib/commentHarvest.js) の間引き（デバウンス・レコード種別フィルタ）を、計測結果に基づき最小限で調整する。

## ストレージ

- FIFO 切り詰め・世代別キー・圧縮のいずれかを選ぶ前に、**保持件数・削除順・ユーザー通知**のポリシーを文書化する。
- しきい値と切り詰め順は [commentRecord.js](../src/lib/commentRecord.js) まわりの純関数としてテスト可能にする。

## 開発体験

- [scripts/build-watch.mjs](../scripts/build-watch.mjs) は 3 エントリを監視済み。
- **一般ユーザー向け**: MV3 拡張はアプリのように「自分で勝手に再読み込み」できないのが通常。不具合時は watch の F5 と `chrome://extensions` の「更新」が確実（ポップアップ内にも同趣旨の注意を表示）。
- **開発時の自動リロード**: 公式に一本化された仕組みはなく、次のような選択肢になる（工数と依存のトレードオフ）。
  - 手動: `build:watch` を回しつつ、変更後に拡張の「更新」と必要なら watch の F5。
  - 拡張リローダー系（Chrome ウェブストアの開発用拡張など）でホットキー更新。
  - `web-ext run`（Firefox 寄りだが Chromium でも試せる場合あり）、または CDP で `chrome.runtime.reload` を叩く自作スクリプト（脆弱でメンテ負荷大）。
- リポジトリ既定では **自動リロード用の npm スクリプトは入れない**（環境差・権限・セキュリティのばらつきが大きいため）。
