# Codex 実装指示書 — v0.1.1342：コメビュに無い読み上げ計器を塞ぐ

> **必ず先に読むもの（この順で）**
> 1. `AGENTS.md`
> 2. `docs/handoff/VOICE-BASELINE-2026-08-11.md` ← 基線・正本
> 3. `docs/handoff/CODEX-TASK-voice-v1332.md` ← **禁止事項が全部生きている**
> 4. この指示書
>
> ブランチ: `feat/sidepanel-first-layout`（現在 v0.1.1341 / commit 30648e27）

---

## 0. 状況

読み上げは**2実装**（会場=`voicePlayer.js` の VoicePlayer クラス / コメビュ=`comeview-entry.js` の独自コピー）。
両者は**同じ storage キー `KEY_VOICE_DIAG` に3秒 min-gap で交互に書く**（last-writer-wins）。

★調査で判明: 会場にあってコメビュに**無い**計器フィールドが **8種類**残っている。
v0.1.1333 で `lastEnableFailReason` / `enableFailTotal` は塞いだが、まだ以下が空のまま:

| フィールド | comeview | voicePlayer(会場) | 意味 |
|---|---|---|---|
| `synthFailReasons` | **0箇所** | 2箇所 | ★合成が失敗した理由の内訳 |
| `synthNullTotal` | **0箇所** | 2箇所 | ★合成が null で返った累計 |
| `mergeTotal` | **0箇所** | 3箇所 | 同一発話の統合回数 |
| `rateClampTotal` | **0箇所** | 3箇所 | 再生速度が上限に張り付いた回数 |
| `dropCountGateTotal` | **0箇所** | 4箇所 | 件数ゲートで捨てた累計 |
| `sustainedBoostTotal` | **0箇所** | 3箇所 | 速度底上げの発動累計 |
| `lagVerdict` | **0箇所** | 3箇所 | 体感遅延の判定 |
| `arrivalPerMin` | **0箇所** | 6箇所 | 到着レート(件/分) |

**実害**: コメビュが書いた snapshot は常に「0件・未計測」を報告する。
読み手は `source` を見ない限り「コメビュでは合成失敗が一度も起きていない」と誤読する。
★しかも last-writer-wins なので、**会場が測った値をコメビュがゼロで上書きする**経路が成立する。

---

## 1. やること（1版・小さく）

### v0.1.1342 `feat(diag): コメビュにも合成失敗の理由を記録する`

**最優先の2つだけ**を塞ぐ。残り6つは別版（一度に広げない）。

1. **`synthFailReasons`** — 合成失敗の理由別内訳
2. **`synthNullTotal`** — 合成が null で返った累計

**実装**:
会場側の実装（`voicePlayer.js` の `_recordSynthFailureReason` 周辺・`:403` `:570` `:418-419`）を読み、
**同じフィールド名・同じ意味**でコメビュの合成経路に記録する。

コメビュの合成呼び出しは `comeview-entry.js` の `drainVoiceQueue`（`:594-792`）内。
会場は `synthesizeVoice(..., { onFailure: (info) => this._recordSynthFailureReason(info) })` の形で
`classifyVoiceSynthFailureReason` を呼んでいる。**コメビュは `onFailure` を一切渡していない**（grep 0ヒット）。

★**書き出しは既存の `publishVoiceDiag()`（`:248-262`）を使う**。書き手を増やさない。

---

## 2. ★やってはいけないこと（前回の指示書 §2 が全部生きている）

| 禁止 | 理由 |
|---|---|
| **残り6フィールドも一度に足す** | 1版=1変更。まず2つで型を作る |
| **`KEY_VOICE_DIAG` の書き手を増やす** | 書き手一本化は Phase 2 の仕事 |
| **`probeVoicevoxAlive` の戻り値・値域を変える** | 実機で観測中の値が壊れる |
| **タイムアウト 5000/1500 を統一** | `voicevoxClient.js:157-166` に理由が文書化済み |
| **`forceOn:true` を消す** | 自動再生解錠の事情の可能性 |
| **`voiceLoadingState.js` を触る** | DOMにしか出ず退行検知できない |
| **読み上げ区画の外を触る** | 区画外の diff が1行でも出たらその版は捨てる |
| **popup-entry.js に行を足す** | ★max-lines 上限(22,119行)に張り付いている。触らない |

---

## 3. 完了条件（DoD）

1. `npm run verify:cc` が緑（★`npm run verify` は使わない）
2. `comeviewVoiceParity.wiring.test.js` に項目を追加し、**数で断言**
3. **変異で赤を確認**（`git diff --numstat` または grep で適用確認込み）
4. `npm run verify:bump` が緑
5. 読み上げ区画の外に diff が無いこと

---

## 4. 報告してほしいこと

- push できたか（commit ハッシュ）
- `verify:cc` / `verify:bump` の結果
- **変異で赤を確認したか**（適用確認込み）
- ★**バグを見つけても直さず報告のみ**
