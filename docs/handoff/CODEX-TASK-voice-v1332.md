# Codex 実装指示書 — 読み上げ系 v0.1.1332（Phase 1 + コメビュ計器の配線）

> **必ず先に読むもの（この順で）**
> 1. `AGENTS.md`（プロジェクトの掟）
> 2. `docs/handoff/VOICE-BASELINE-2026-08-11.md` ← **基線・正本。ここが根拠**
> 3. この指示書
>
> ブランチ: `feat/sidepanel-first-layout`（現在 v0.1.1331 / commit 35916cf6）

---

## 0. 状況（なぜこの作業をするか）

2026-08-11、読み上げが「ONにならない」症状を **10時間・6版** 追ったが、
**真因は拡張ではなく VOICEVOX の音声合成エンジンが未起動だった**。
エンジンを起動したら**拡張は無改変のまま鳴った**。＝6版は全部空振り。

★空振りの構造的原因: **失敗理由がどこにも記録されない**ため、推測で版を重ねるしかなかった。

**そして今夜、コメビュだけが鳴らないことが判明した（未解決）**。
エンジンは200なのに「VOICEVOXが見つかりません」と出る。
**しかしコメビュ側には失敗理由を記録する計器が無い**ので、原因を名指しできない。

→ **この作業の目的は「推測せずに原因が確定する状態」を作ること**。

---

## 1. やること（2つ・この順で）

### タスクA: `src/lib/voiceFailureTaxonomy.js` を新設（配線ゼロ）

**目的**: 失敗分類が2系統・値域が別・相互変換なしの状態を、1つの正本に統合する。

**真因**: 両分類器が「原因(cause)」と「段階(stage)」を1トークンに焼き込んでいた。
`refused` と `unreachable` は同じ cause の別名。`query_http` と `synth_http` は stage 違いの同 cause。

**設計（2軸に分解）**:
```
cause ∈ { down, timeout, http, payload, not_wired, unknown }
stage ∈ { probe, query, synth }

fromAliveFailure(token)   // voicevoxClient.js:195-208 の値域を変換
  'no-fetch'    → { cause:'not_wired', stage:'probe' }
  'timeout'     → { cause:'timeout',   stage:'probe' }
  'refused'     → { cause:'down',      stage:'probe' }
  'http-error'  → { cause:'http',      stage:'probe' }
  ''            → null（失敗していない）

fromSynthFailure(token)   // voiceSynthFailureReason.js:64-96 の値域を変換
  'timeout'     → { cause:'timeout', stage:'synth' }
  'unreachable' → { cause:'down',    stage:'synth' }
  'query_http'  → { cause:'http',    stage:'query' }
  'query_body'  → { cause:'payload', stage:'query' }
  'synth_http'  → { cause:'http',    stage:'synth' }
  'synth_body'  → { cause:'payload', stage:'synth' }
  'unknown'     → { cause:'unknown', stage:'synth' }

canonicalLabel({cause, stage}) → 日本語ラベル
```

**制約（厳守）**:
- ★**純粋関数のみ**。`chrome.*` / `document` / `fetch` / storage を**import も参照もしない**
- ★**どこからも import しない**（配線は次の版。この版は新設のみ）
- ★既存2関数（`classifyVoicevoxAliveFailure` / `classifyVoiceSynthFailureReason`）を
  **書き換えない**。文言も変えない

**ファイル先頭に5項目の定型ヘッダを付けること**（層の宣言・機械検査の対象）:
```
/**
 * 【層】L0 判定層（純粋関数・I/O禁止）
 * 【この箱に入るもの】失敗トークンの分類・変換・日本語ラベル
 * 【この箱に入らないもの】fetch / storage / DOM / chrome.*（import も禁止）
 * 【書けるstorageキー】なし
 * 【正本宣言】読み上げ失敗の値域はこのファイルのみ。他所での文字列リテラル比較は禁止
 */
```

**テスト `src/lib/voiceFailureTaxonomy.contract.test.js`**:
- ★旧2関数を**実際に import** し、代表入力→旧トークン→新変換の通しを固定する
- ★**旧トークンの全値域（5個 + 7個）をリテラルで表に書き写して**全件変換を断言する
  （新関数が旧関数を内部で呼ぶ形にすると恒真になる。必ず起点を2つにする）
- ★**失敗経路を全部含める**（正常系だけのテストは緑のまま壊れる。ここが最重要）
- 書いた直後に**変異で赤を1回確認**し、変異が実際に適用されたか `git diff` で見ること
  （CRLF で変異が空振りした事故が過去にある）

---

### タスクB: コメビュに「ON失敗理由」の計器を配線する

**目的**: コメビュが鳴らない原因を、**次にユーザーがボタンを押した1回で確定させる**。

**現状（grep で確認済み）**:
- 会場（`voicePlayer.js:355-357`）は失敗時に
  `diag.lastEnableFailReason` / `diag.enableFailTotal` を書いて `_emitDiag()` する
- **コメビュ（`comeview-entry.js`）には grep 0ヒット** ＝ 記録がどこにも残らない

**実装**:
`comeview-entry.js` の `enableVoiceReading`（491行〜）の失敗経路（`if (!probe.ok)` の中・
現在520-524行付近）に、会場と**同じフィールド名**で失敗理由を記録し、
既存の `publishVoiceDiag()`（248-262行）経由で書き出す。

成功時は会場と同様に `lastEnableFailReason` を空にすること
（古い失敗が残り続けて誤診させないため・`voicePlayer.js:369` と同じ考え）。

**★重要な制約**:
- ★**`KEY_VOICE_DIAG` の書き手を増やさない**。既存の `publishVoiceDiag()` を使う
  （書き手一本化は Phase 2 の仕事。ここでやらない）
- ★状態速報に出す側（`voiceDiag.js:297-311` の ON失敗理由の行）は**既に実装済み**。
  コメビュが書けば自動的に出る。**印字側を触る必要は無い**
- ★**通し確認**: 配線したら、その行が実際に状態速報テキストに現れるか確認すること
  （`statusFastDiagLite` に通っていないと永久に出ない既知の罠がある）

**テスト**: `src/lib/comeviewVoiceParity.wiring.test.js` が既にある（v1329で新設・7項目）。
ここに**8項目目として** `lastEnableFailReason` の配線を追加し、数で断言すること。

---

## 2. ★やってはいけないこと

| 禁止 | 理由 |
|---|---|
| **タイムアウト 5000ms / 1500ms を統一する** | `voicevoxClient.js:157-166` に理由が文書化済み（MV3 SWのコールド起床）。統一すると2026-06-14の症状が再発する |
| **`forceOn:true` を消す**（`venueBar.js:2953`） | 自動再生解錠の事情がある可能性。調査は別版 |
| **プロキシ経路の AbortSignal を「直す」** | `chrome.runtime.sendMessage` 越しに渡せない構造的制約 |
| **キュー上限の値を統一する**（動的 vs 8固定） | 値の統一は実機観察後の別版 |
| **文言を変更する**（「VOICEVOXが見つかりません」等） | DOMにしか出ずテストが無いので退行検知できない。Phase 2 でstorage経由になってから |
| **読み上げ区画の外を触る** | 未解決2件（会場同時性 `heavyEverSettled:false` / サイドパネルの窓0x0）と混ざると切り分け不能になる。**区画外の diff が1行でも出たらその版は捨てる** |
| **ちらつき7版の資産を触る** | `selectStableVisibleMembers` / diff-skip 機構 |
| **計器を新設する（タスクB以外）** | 「計器を2版続けて入れたら止まる」（25版・症状ゼロ改善の前例）。タスクBは既存フィールドの配線であって新設ではない |

---

## 3. バグ発見（歓迎・ただし報告のみ）

★**コメビュが鳴らない真因に心当たりがあれば、報告してください。ただし直さないでください。**

理由: 今日、推測で6版直して全部空振りした。**計器を入れて事実を1回見てから直す**のが本件の方針。
発見は `docs/handoff/VOICE-BASELINE-2026-08-11.md` に追記する形で報告してほしい。

**既に潰した仮説（再調査不要）**:
- ❌「表示が古いだけ」→ 押し直しても同じ文言が出た
- ❌「`_voiceToggleBusy` が立ちっぱなし」→ `disableVoiceReading`(`:465`)が false に戻している
- ❌「host_permissions が無い」→ `http://127.0.0.1:50021/*` あり
- ❌「プロキシ経由で短いタイムアウトが適用される」→ `proxyFetchFn` は拡張ページなら直接fetchに切替（`:52-54`）

---

## 4. 完了条件（DoD）

1. `npm run verify:cc` が緑（★`npm run verify` は使わない・ハングする）
2. 契約テストが緑。**変異で赤を確認済み**（適用確認つき）
3. `git diff --numstat` で行数爆発なし（LF→CRLF事故は行数で即バレする）
4. version bump 3点セット（manifest / package.json / changelog）が同期
   → `npm run verify:bump` で機械照合
5. **読み上げ区画の外に diff が無いこと**
6. changelog のプレフィックス:
   - タスクA = `refactor(voice)`（挙動差ゼロ宣言）
   - タスクB = `feat(diag)`（挙動変更＝計器の配線）
   ★1版にまとめず、**2版に分けること**（1版=1変更）

---

## 5. 期待する成果物

- v0.1.1332 `refactor(voice): 失敗分類の正本taxonomyを新設(配線なし)`
- v0.1.1333 `feat(diag): コメビュのON失敗理由を計器へ(会場と同じ片肺を解消)`
- 上記2版を `feat/sidepanel-first-layout` に push
- コメビュが鳴らない原因の**心当たりがあれば報告**（直さない）
