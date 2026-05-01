# STATS_FAILURE_MODES — ニコ生統計値の失敗モード policy

> **Phase 2 (2026-05-01)** — 観測層 (StatObservation + observationStore) の上に
> 乗せる「数字の壊れ方」の最低限の語彙集。
>
> 5 AI（GPT-5.5 / Opus 4.7 / Grok / Gemini / Kimi）の独立提案で、共通して
> 「失敗モードを **F1〜F3 に絞って固定** してから増やす」が出た。空想で F4〜F7 を
> 先に固定すると、想像の失敗モードを入れがちで腐る。実機観測で発見してから足す。

## 観測層の前提

- `src/domain/observations/vocabulary.js` — `STAT_SEMANTIC` (concurrent / cumulative / unknown), `STAT_SOURCE` (official-stats / embedded-data / dom-text / ws)
- `src/domain/observations/StatObservation.js` — 不変条件付き観測値 factory
- `src/domain/observations/observationStore.js` — 直近 60 件のリングバッファ（メモリ常駐、永続化なし）

## F1: source 不在 (Source Outage)

**観測**: 期待した取得経路から、ある時間窓で 1 件も値が来ない。

| 例 | 状況 |
|---|---|
| `official-stats` 不在 | ニコ生 statistics WebSocket が切断、または初期 frame が来ていない |
| `embedded-data` 不在 | watch ページ HTML に `#embedded-data` が無い（仕様変更 / SSR 失敗） |
| `dom-text` 不在 | DOM の表示要素が見つからない（セレクタ陳腐化） |
| `ws` 不在 | ndgr / chat 系 WebSocket frame が空 |

**検出**: 連続 N 観測（例: 30 秒 = 約 30 件）で `source = X` の observation が 0 件。

**対応**:
- 即時アラートではなく、observation 層は記録だけする（UI は既存のフォールバックで継続）
- 観測診断 HTML タブ（Phase 4）に F1 イベントを表示
- 真因究明は人間に委ねる（コードでヒューリスティックに「原因はこれ」と決めつけない）

**反例（F1 と誤判定してはいけない）**:
- ライブ開始直後の数秒間は `official-stats` が来ていなくても異常ではない
- バックグラウンドタブ復帰直後の skew 期間（freshMs 超過）は F1 ではなく F2

## F2: semantic 不明 (Semantic Drift)

**観測**: 数字は出るが、それが「同接」か「累計来場者」か判定できない。

| 例 | 状況 |
|---|---|
| 値は来ているが、context が無い | DOM テキスト変更で `viewers` ラベルが消えた |
| `freshMs` 超過 | 観測値が古すぎて意味付けが曖昧 |
| 値域が両 semantic に整合しない | 4500 という数字が同接 (一桁オーダ大きすぎ) なのか累計 (妥当) なのか不明 |

**検出**: `createStatObservation` が `semantic = 'unknown'` を返した、または
`recentForLiveId(lv).filter(o => o.semantic === 'unknown').length` が閾値超過。

**対応**:
- F1 と同じく観測層は記録のみ
- UI レイヤは「不明な数字」を「同接」「累計」と決めつけて表示しない（contract violation）
- 既存の concurrentEstimate.js の fallback paths が引き続き動くので、popup の見え方は変わらない

**反例**:
- 一時的な `unknown` 1〜2 件は許容（瞬間的な race）
- 配信開始直後の累計 0 は `unknown` ではなく正常な `cumulative` 0

## F3: 単調性違反 (Monotonicity Breach)

**観測**: `cumulative`（累計来場者数）は単調増加でなければならないが、減った。

| 例 | 状況 |
|---|---|
| 来場者 4781 → 次観測 4750 | DOM のキャッシュ古値か、別 lv の数字が紛れた |
| 累計が 0 にリセット | 配信切替で前 lv の値が残っていた |
| 累計が突然桁違いに増減 | source 取り違え（`concurrent` を `cumulative` と誤認） |

**検出**: 同一 `liveId` の連続 `cumulative` 観測で、新しい value < 古い value。

**対応**:
- 違反した新観測の `semantic` を `unknown` に降格して store に入れる
  （`createStatObservation` 単体ではなく、配線時のラッパで判定 — Phase 3）
- 観測診断 HTML タブで F3 イベント履歴を表示

**反例**:
- 配信終了 → 別配信開始で `liveId` が変わった場合は monotonicity 適用外（liveId スコープでチェック）
- `concurrent` は単調性なし（増減自然）→ F3 は cumulative 専用

## 検出器のテスト方針

不変条件先行（Opus 4.7 流）:

```javascript
describe('F1 detector 不変条件', () => {
  it('source 不在は連続 N 件閾値で検出される', () => {});
  it('liveId が変わったら F1 カウントはリセット', () => {});
  it('observation 層を読むだけ（書き換えない）', () => {});
});

describe('F3 detector 不変条件', () => {
  it('cumulative の monotonicity は同一 liveId スコープでのみチェック', () => {});
  it('concurrent には適用しない', () => {});
  it('違反は新観測の semantic 降格として記録（古値は変えない）', () => {});
});
```

## やらないこと（最初は）

- F4 以降を空想で増やす
- F1〜F3 検出を popup の UI 挙動に直結させる（記録のみ）
- F1 で alert / toast を出す（Phase 4 の HTML タブに表示するのみ）
- Privacy レイヤを跨いで F イベントをローカル永続化する

## 関連実装

- `src/domain/observations/vocabulary.js` — Phase 1
- `src/domain/observations/StatObservation.js` — Phase 1
- `src/domain/observations/observationStore.js` — Phase 2
- 検出器ロジック — Phase 3 で `concurrentInputBuilder.js` の隣に置く想定
- 観測診断 HTML タブ — Phase 4

## 参考

- 計画全体: `docs/plan-empty-state-no-broadcast.md` ではなく
  `C:\Users\info\.claude\projects\...\memory\plan_observation_layer_architecture.md`
- TDD 方針: 不変条件 → 反例 → 例 (Opus 4.7 流)
- 既存の DO_NOT_REWRITE: `concurrentEstimate.js` / `wsStatisticsExtract.js` / `page-intercept-entry.js` は触らない
