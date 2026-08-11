# Codex 実装指示書 — 読み上げ系 v0.1.1334〜1335（Phase 1 完了：taxonomy を配線する）

> **必ず先に読むもの（この順で）**
> 1. `AGENTS.md`
> 2. `docs/handoff/VOICE-BASELINE-2026-08-11.md` ← 基線・正本
> 3. `docs/handoff/CODEX-TASK-voice-v1332.md` ← 前回の指示書（禁止事項が生きている）
> 4. この指示書
>
> ブランチ: `feat/sidepanel-first-layout`（現在 v0.1.1333 / commit deaec37c）

---

## 0. ここまでの到達点

- **v0.1.1332**: `src/lib/voiceFailureTaxonomy.js` を新設（cause×stage の2軸・**配線ゼロ**）
- **v0.1.1333**: コメビュに `lastEnableFailReason` / `enableFailTotal` を配線（片肺解消）

★taxonomy は**まだどこからも import されていない**。この指示書でそれを配線し、Phase 1 を完了させる。

---

## 1. やること（2版・この順で）

### v0.1.1334 `refactor(voice): 失敗理由の日本語ラベルを taxonomy に一本化`

**目的**: 同じ「繋がらない」が2箇所で別々に日本語化されている状態を、taxonomy 1本にする。

**現状（実コードで確認済み）**:
- `src/lib/voiceSynthFailureReason.js:43-51` に日本語ラベル表がある
- `src/lib/voiceLoadingState.js:56-105` にも文言分岐がある（`refused` → 「VOICEVOXが見つかりません」等）
- **同じ cause が2箇所で別の日本語になっている**

**実装**:
`voiceSynthFailureReason.js` のラベル生成を、**taxonomy の `canonicalLabel()` を呼ぶ形に置き換える**。
（`fromSynthFailure(token)` → `canonicalLabel(failure)` の2段）

★**厳守**:
- **`voiceLoadingState.js` は触らない**（DOMにしか出ず退行検知できない。Phase 2 でstorage経由になってから）
- **公開APIのシグネチャを変えない**（呼び出し側を壊さない）
- ラベル文字列が変わる場合、**変わること自体は許容**するが、
  変更前後の対応表を**契約テストに固定**すること（何がどう変わったか機械で追える形に）

**テスト**: `voiceSynthFailureReason.test.js` が既にあるはず。
全7値域について「旧ラベル → 新ラベル」の対応をリテラルで固定する。

---

### v0.1.1335 `refactor(voice): 生存確認の失敗理由も taxonomy 経由にする`

**目的**: `classifyVoicevoxAliveFailure` の結果を taxonomy に通す経路を作る。

**実装**:
`voicevoxClient.js` の `probeVoicevoxAlive` が返す `reason` は**そのまま維持**しつつ、
taxonomy へ変換するヘルパを**呼び出し側で使えるように**する。

★**厳守（ここが最重要）**:
- **`probeVoicevoxAlive` の戻り値の形を変えない**。`{ ok, reason }` のまま。
  reason の値域（`no-fetch`/`timeout`/`refused`/`http-error`/`''`）も変えない
  → 理由: この値は `voicePlayer.js:354` と `comeview-entry.js` が
    `lastEnableFailReason` として**そのまま storage に書いている**。
    形を変えると**今まさに実機で観測しようとしている値が壊れる**
- **`voicevoxClient.js` に taxonomy を import しない**（L0同士の依存を増やさない）
  → 変換は**呼び出し側**（voicePlayer / comeview）か、状態速報の印字側で行う

**したがってこの版でやることは**:
`src/lib/voiceDiag.js` の ON失敗理由を印字する箇所（`:297-311` 付近）で、
生の reason に加えて **`canonicalLabel(fromAliveFailure(reason))` の日本語も併記**する。

例（現状 → 変更後のイメージ）:
```
現状:   ★ON失敗2回: refused
変更後: ★ON失敗2回: refused（VOICEVOXに接続できない(未起動の可能性)）
```

★**生の値を消さないこと**。日本語を**足す**だけ。
 理由: 生の値は次のセッションが原因を特定する material。日本語だけにすると grep できなくなる。

**テスト**: `voiceDiag.test.js` に、reason 5値域それぞれで
「生の値と日本語ラベルの両方が行に含まれる」ことを断言する。

---

## 2. ★やってはいけないこと（前回の指示書 §2 が全部生きている）

再掲（特に重要なもの）:

| 禁止 | 理由 |
|---|---|
| **`probeVoicevoxAlive` の戻り値・値域を変える** | 実機で観測中の `lastEnableFailReason` が壊れる |
| **`voiceLoadingState.js` を触る** | DOMにしか出ず退行検知できない。Phase 2 まで待つ |
| **タイムアウト 5000/1500 を統一** | `voicevoxClient.js:157-166` に理由が文書化済み |
| **`forceOn:true` を消す** | 自動再生解錠の事情の可能性。調査は別版 |
| **キュー上限の値を統一** | 実機観察後の別版 |
| **`KEY_VOICE_DIAG` の書き手を増やす** | 書き手一本化は Phase 2 の仕事 |
| **読み上げ区画の外を触る** | 未解決2件と混ざると切り分け不能。**区画外の diff が1行でも出たらその版は捨てる** |
| **計器を新設する** | 「計器を2版続けて入れたら止まる」の前例 |

★**追加の禁止（今回特有）**:
- **`storage_changed` による描き直し問題に手を出さない**。
  今日の速報で「1コメントあたり30回描き直し・表示遅延5秒」が判明したが、
  **これは読み上げとは別タスク**。混ぜると切り分け不能になる。

---

## 3. 完了条件（DoD）

1. `npm run verify:cc` が緑（★`npm run verify` は使わない）
2. テストが緑。**変異で赤を確認済み**（`git diff --numstat` で適用確認込み）
3. `git diff --numstat` で行数爆発なし（LF→CRLF事故の検知）
4. `npm run verify:bump` が緑（manifest / package / changelog の3点同期）
5. **読み上げ区画の外に diff が無いこと**
6. 2版に分けること（1版=1変更）

---

## 4. 報告してほしいこと

- push できたか（commit ハッシュ）
- `verify:cc` / `verify:bump` の結果
- **変異で赤を確認したか**（適用確認込みで）
- ラベル文言が変わった箇所の**変更前後の対応表**
- 禁止事項に触れそうになった箇所があれば、その判断
- ★**バグを見つけても直さず報告のみ**（推測で6版空振りした日なので）
