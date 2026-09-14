# `/live/` 追憶のきらめき ランキング — コンポーネント化の計画（2026-09-14）

> 状態: **実装完了（2026-09-14）。検証結果は末尾**
> 発端: ユーザー「web-ios-android のルールを見て、ちゃんとコンポーネント化を意識して」
> 正本ルール: `../../../web-ios-android/CLAUDE.md` 基準⑤⑥⑦（共有部品は共有置き場へ／2箇所目を書く前に1つ目を呼ぶ／同じ画面が増えるのは共通化のサイン）
> 前段: [PLAN-live-ranking-2026-09-05.md](PLAN-live-ranking-2026-09-05.md)（企画・Step 0〜3）。本ファイルはその続き。

## 目的
`/live/`（`tsuioku-no-kirameki/live/index.html`）を、**このリポの共有部品を呼ぶ形**に組み直す。
2026-09-14 の初版はページ内に JS/CSS を全部 inline で持ち、次の重複を作っていた（実コードで確認）:

| 重複していたもの | 1つ目（正本になるべき場所） |
|---|---|
| 滞留率の式 `retentionRate` | `src/lib/concurrentEstimate.js:205`（既に export 済み。ページは式をコピーしていた） |
| koken/nicoad の行の正規化 | `src/lib/kokenContributionRankingApi.js:171` / `nicoadContributionRankingApi.js:169`（収集側コメントも「画面側が使えるように生の形で載せる」と書いていた） |
| `escapeHtml` | `src/lib/supportTimelineHtml.js:54` と `src/extension/venueBar.js:573` に同じ本体（export なし） |
| `safeHttpUrl` / `sanitizeHttpUrl` | `eventRankingReportModel.js:48` ＋ 4ファイルの `sanitizeHttpUrl`（同じ本体・別名） |
| アイコン未設定の判定・UID からのアイコン URL | `src/lib/deriveAvatarUrlFromUid.js`（AGENTS.md §3.5 の確定パターン） |
| ゆっくり吹き出し（`.yukkuri-thread/.y-row/.speaker/.bubble`）の CSS | `tsuioku-no-kirameki/index.html`（LP）の inline CSS |

## 非目的
- `/live/` の見た目・機能を変えること（挙動不変で構造だけ整理する）
- LP（index.html）の見た目を変えること（吹き出し CSS を外に出すだけ。計算済みスタイルの前後比較で確かめる）
- `sanitizeNicoUserPageUrl` 等、本体が違う関数の統合（同名ではなく、責務も違う）

## 変更ファイル
| 種別 | パス | 何をするか |
|---|---|---|
| 新規 | `src/lib/htmlText.js`（+test） | `escapeHtml` / `safeHttpUrl` / `formatNumberJa` の正本（ESTABLISH_REHOME） |
| 新規 | `src/lib/liveRankingView.js`（+test） | `/live/` の純ロジック（時刻・経過・鮮度・推定同時視聴・行の変化追跡・行の正規化） |
| 新規 | `src/extension/live-ranking-entry.js` | DOM 描画（esbuild で `app/dist/live-ranking.js` へ） |
| 新規 | `tsuioku-no-kirameki/assets/css/yukkuri-thread.css` | LP から吹き出し CSS を**そのままの順序で**切り出し、LP と `/live/` の両方が読む |
| 変更 | `tsuioku-no-kirameki/live/index.html` | inline JS/CSS を捨て、共有 CSS と `app/dist/live-ranking.js` を読む |
| 変更 | `tsuioku-no-kirameki/index.html` | 吹き出し CSS の inline 部分を削除し `<link>` で読む |
| 変更 | `scripts/build.mjs` / `scripts/feature-map.mjs` / `scripts/repo-tree-map.mjs` | entry 追加・機能名・ディレクトリ役割 |
| 変更 | `src/lib/supportTimelineHtml.js` `src/extension/venueBar.js` `src/lib/eventRankingReportModel.js` ＋ `sanitizeHttpUrl` の4ファイル | 自前の同名関数を消して `htmlText.js` を import |
| 変更 | `.decision-receipts.json` | 新規 source file の判定（CANONICAL CHECK）を記録 |

## 状態遷移
描画の状態（初回描画／新規行／増えた行）は `createRowChangeTracker()` に閉じ込める。ページ内のグローバル変数 4 つ（`_prevPoints/_seenKeys/_firstPaint/_touched`）を廃止。

## 失敗時の戻し方
- `git revert` 1コミットで初版（84d32fed）へ戻る。`/live/` の URL・見た目は初版と同じ。
- LP の見た目が変わったら、`assets/css/yukkuri-thread.css` の中身を LP inline へ戻すだけ（順序をそのまま保っているので貼り戻せる）。

## 検証手順
1. `npx vitest run src/lib/htmlText.test.js src/lib/liveRankingView.test.js` → 緑
2. `npm run build` → `app/dist/live-ranking.js` が出る／`npm run check:layer`（lib の純粋性）
3. ローカルプレビュー（実データ）で `/live/` を描画: サムネ・配信者・時間・URL・キャラ・ロゴが初版と同じ
4. LP: 共有 CSS 化の前後で `.y-row/.speaker/.speaker img/.bubble` 全要素の計算済みスタイル（grid-template-columns / padding / border-radius / font-size / width / height / filter）を比較して差分 0
5. `npm run verify:cc`（tree-map / feature-map / site-health / lint / typecheck / test）

## 検証結果（2026-09-14 実測）
| 手順 | 結果 |
|---|---|
| 1. 単体テスト | `htmlText.test.js` 4件 / `liveRankingView.test.js` 12件 すべて緑。`timeAuthorityRegistry.test.js` は当初赤（新ファイルが `capturedAt` を独自に解釈）→ `timeAuthority.js` の `toEpochMs/ageMsOf` へ委譲して緑 |
| 2. build / layer | `app/dist/live-ranking.js` 15KB を出力。`check:layer` 合格（lib の純粋性） |
| 3. `/live/` 実データ描画 | 17 配信・サムネ 17/17・配信者名・時間・URL・壊れ画像 0。広告側の応援者アイコンは UID 導出で 0→24 枚に増えた（正規化関数を通した副産物） |
| 4. LP の計算済みスタイル前後比較 | 514 要素 × 19 プロパティ＋`::after`。★最初は差分 11 件（`.hero-thread .speaker img` 92→84px 等）。原因は `<link>` を `<style>` の前に置いたことで、LP 内で【後勝ちで負けていた】`.hero-thread` の同詳細度ルールが勝つようになったため。`<link>` を元の inline 定義と同じ位置（`<style>` を一度閉じて挟む）に移して **差分 0** |
| 5. verify:cc | OK（test 11374 / lint / typecheck / build / tree-map / feature-map / site-health / 各 selftest） |

★学び: 共有 CSS への切り出しは「中身が同じ」だけでは足りず、**カスケード上の位置**まで同じにしないと見た目が変わる。LP には効いていない上書き（`.hero-thread`）が眠っていて、位置を動かすと目を覚ます。
