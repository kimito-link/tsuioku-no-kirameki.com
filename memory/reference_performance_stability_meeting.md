# reference: レスポンス・安定性のボトルネック会議(2026-06-14)

> ユーザー要望「新機能でなくレスポンスと全体の安定性を上げたい」。全員集合会議(gpt-oss:20b /
> deepseek-r1:14b / Codex=クォータ切れで不参加)+ MEMORY の過去知見。推測でなく chrome-devtools
> 実測で裏付ける方針(Karpathy「検証可能に」/ AGENTS.md §12)。

## 会議の一致: ボトルネック仮説トップ5(推定インパクト順)
※実装前に必ず chrome-devtools で実測して裏付ける。

1. ⭐**paintWatchPopupUi の 450ms毎 O(N)走査**(gpt-oss/deepseek/MEMORY 一致・最大)。
   - cap前の全arr(1万件超)に O(N)走査を多数、450ms毎(スクロール中も)。memo/defer は一部入った
     が根は残る。実測=Performance録画で paintWatchPopupUi のタスク時間/頻度。Heap で割当。
   - 効き★★★★ / コスト高(ロジック再設計) / リスク大(UI破壊・心臓部に近い)→慎重に。
2. **renderUserRooms の全消し再構築**(白化60%↓)。実測=Heap Snapshot で DOMノード数・再構築頻度。
   - 効き★★★★ / コスト中(部分更新/差分化) / リスク中。
3. **content-visibility プレースホルダと実高さズレ**(スクロール白化)。実測=Layout タイムライン・
   ResizeObserver コールバック時間。効き★★★★ / コスト中(CSS+小JS)。
4. **IDB全件読みの sync-blocking**(ロード500ms↓)。実測=idbGetAll の長タスク(CPU80%超100ms+)。
   chrome.storage.session mirror で緩和済みだが getAll は残る。効き★★★ / コスト中(batch/cursor)。
5. **SW書込のスロットルflush飽和**(SW timeout 30%↓)。実測=swFlush タスク時間・sync発火。
   効き★★★ / コスト中(バッチ+レート) / リスク=溢れ時のデータ消失(過去事故)。

## TTI(popup を開いた瞬間)改善(星野メソッド=開いた瞬間に出す)
- 最小UIを先に描画→重い初期化は requestIdleCallback / setTimeout(0) で分割(1タスク16ms超えない)。
- 重い同期処理(集計)を初回paintの後ろへ。cached-first(session mirror)は既に一部あり。
- 計測: performance.mark('popup-open') + measure('TTI','DOMContentLoaded','popup-open')。

## スクロール白化を構造的に消す(素JS・全行DOM化してない前提)
- incremental集計(renderUserRooms を「今見えてるページ分だけ」処理→次は requestIdleCallback)。
- IntersectionObserver で可視領域だけ DOM生成 + content-visibility:auto で画面外 Paint スキップ
  (プレースホルダ高さを実測値に合わせてズレを消す)。
- windowing(完全仮想スクロール)は全行DOM化していないので前提外=今は不要。

## 安定性(SW飽和・複数タブ・backfill消失・timeout)
- **Web Locks 単一リーダー**: navigator.locks.request('backfill',...) で書込をシリアライズ(複数タブ衝突防止)。
  既存 backfillSlotPool/Web Locks 実績あり=延長。
- **バックプレッシャー write-queue**: requestIdleCallback で flush・上限超で古いものでなく「確実に書く」。
- **idempotent flush**: タブ離脱時も確実に書き切る(過去の数千件消失の類似リスク根治)。

## 巨大entryファイル分割(挙動不変・安全順)
- popup-entry.js 21k / content-entry.js 17k 行。max-lines ラチェットで増やせない。
- 安全順: ①DOM非依存の純計算を lib へ抽出(テスト付き・既に acquisitionDashboardChart 等で実績)
  → ②描画ヘルパを lib の HTML生成関数へ → ③content-entry は心臓部なので最後・最小差分。
  1抽出=即 commit(pure refactor)。ラチェットを抽出ぶん下げる。

## ルールベース自己診断の強化(「中にAI」より先・既存活用)
- 既存: errorAutoDiagnosis.js(主因+対処3行)/ KEY_RECORDING_WATCHDOG / shouldForceDeepHarvestRecovery /
  fastDiag / errorRing。→ これらを「読み上げ停止→再接続」「取得停止→再起動」「SWビジー→待避」など
  症状別の自動回復ルールに拡張。AI(LLM)診断はその後(直せない時に人へ説明)=ユーザー方針「両方」。

## 計測の入れ方(本番でも軽く)
- performance.mark/measure を主要関数前後に(devツール不要で performance.getEntriesByType('measure'))。
- 重い区間の自己計測値を status.html/diag に出す(既存の自己診断と統合)。

## 司令塔裁定(実装順)
1. **まず chrome-devtools 実測で #1(paintWatchPopupUi)を裏付ける**(推測で再設計しない)。
2. 効きが確認できたら、リスクの低い #2/#3(renderUserRooms 差分化・content-visibility ズレ修正)から。
3. #1 の再設計は最後(心臓部に近い・純関数抽出+テストで安全に)。
4. 並行で安定性(Web Locks/idempotent flush)と自己診断強化。
- 関連: [[reference_live_state_stream_meeting]] [[reference_ai_general_rules_learnings]]。
