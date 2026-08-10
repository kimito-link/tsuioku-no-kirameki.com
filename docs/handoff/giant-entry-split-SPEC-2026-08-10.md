# 実装仕様: 巨大entryの分割と「診断が互いに矛盾する」構造の根治

> **設計 = Fable(claude-fable-5) / 地図・裏取り = 司令塔(Claude) / 作成: 2026-08-10**
> 地図: [giant-entry-split-MAP-2026-08-10.md](giant-entry-split-MAP-2026-08-10.md)
> 手法の正本: `github/WAYFINDER-TO-SPEC-HOWTO.md`

---

## ★司令塔による裏取り結果（Fableの主張の検証）

HOWTO の定めどおり、Fable が挙げたファイル・行番号・既存挙動を**実コードで確認**した。

| Fable の主張 | 検証結果 |
|---|---|
| `eslint.config.js` に `src/extension/popup/**` の max-lines 2000 が**予約済み** | ✅ **事実**（`eslint.config.js:252-254`）。司令塔は見落としていた。受け皿は設計済み |
| `parityVerdict.js` は既に `trust.mirrors.*.pending` を消費 | ✅ 事実（`:223`, `:228`） |
| `toEpochMs` / `agoLabel` は `diagnosticsTrust.js` にローカル定義 | ✅ 事実（`:33`, `:41`） |
| `popupDiagUptimeNote.js:29` にリテラル `3000` がある | ✅ 事実。`diagnosticsTrust.js:30` の `POPUP_BOOT_GRACE_MS = 3000` と**同じ値が2箇所に**。★司令塔自身が v0.1.1302 で「2箇所で違う定義を作らない」とコメントに書きながら、実際には作っていた |
| A1: 冒頭に verdict を出す判定者は3つだけ | ✅ 事実（`aiShareFullText.js:203` / `:219` / `:557` の3経路のみ） |

### ★司令塔が追加調査で解決した論点（Fableの「未解決6」）

> Fable: 「`shadeAgeMs`/`AgoSec` 系が本当に『値がいつ真だったか』に還元できるか要確認」

**還元できない。実コードで確定した：**

```
shadeAgeMs = nowPerf - NL_INIT_SHADE_BORN_AT   [popup-entry.js:19297]
             ↑ performance.now() 基準の【経過時間】
capturedAt = Date.now()                        [popup-entry.js:2816]
             ↑ epoch 基準の【時点】
```

**2つは別の時計であり、別の種類の量**（duration と timestamp）。
このリポは過去に同じ取り違えで事故っている（[[venue-seats-lastupdate-clock-mismatch-v1044]]
＝会場座席の「更新56年前」）。

→ **仕様を修正**: 正本は「時刻」を1つにするのではなく、
**`timestamp`(epoch の時点) と `duration`(経過ミリ秒) を型として分け**、
`classifyReading` は両方を**別の引数**として受け取る（Fable のシグネチャは既にそうなっている＝
`capturedAt`(時点) と `readAgoMs`/`writerBootAgoMs`(経過) が別引数なので、**設計は正しい**）。
ただし「9つの名前を capturedAt に寄せる」という Q2 の回答は
**`AgoMs`/`AgoSec`/`shadeAgeMs` 系には適用しない**（別の量なので寄せてはいけない）。
寄せる対象は時点系（`capturedAt` / `persistedAt` / `measuredAt`）に限る。

---

## 1. Problem Statement

同じ症状（サイドパネル黒画面・鏡🔴誤報）に **7版**（v0.1.1294〜1303）を費やした。
ユーザーへの影響は「直った」報告 → 実機で再発 → 取り直し依頼、の往復コストそのもの。

真因は3層（地図で実測済み）:

1. **判定が共有されていない。** `popupDiagUptimeNote.js` は「起動直後は計器が構造的にゼロ」
   という正しい知識を持ち文書化もされていたが、それは**注記テキスト**としてしか存在せず、
   🔴 を実際に出す `diagnosticsTrust.js:76-88` と `parityVerdict.js:210-219` は
   各自別基準で判定した。**知識の共有ではなく判定の共有が無い。**
2. **同じ概念に9つの名前**（capturedAt 124ファイル / AgoMs 23 / ageMs 16 …）。
   140ファイルが独自に時刻/齢を持ち、48ファイルが独自に保留を判定。
   計器148個 = **足りないのではなく、多すぎて互いに矛盾する**。
3. **巨大関数2つ**（`initPopup` 2,552行 / `refresh` 1,763行）が関数全体の25%を占め、
   変更のたび「その場で判定を1個足す」誘因になっている（9つの名前はこうして増えた）。

★補強証拠（裏取りで判明）: 共有の道具は**既にある**のに使われていない。
`cardFreshnessNote.js` の `formatAgoLabel` を使うのは **4ファイルだけ**。
一方 **49ファイルが「◯秒前」を自前で組み立てている**。

---

## 2. Solution

**MVP = 「時刻と保留の判定を1つの純関数に集約し、3人の判定者を全員その消費者にする」。
巨大関数の分割は Phase 2 として独立に行う。**

理由: 7回の失敗の機序は全て「別の瞬間・別の基準で判定した」ことにあり、行数にはない。
`initPopup` を割っても8回目は止まらない。逆に判定を1本化すれば、分割せずとも失敗ループは止まる。
ただし分割を先にやると切り出した各モジュールが10個目の名前を持ち込むため、
**正本を先に立ててから割る**順序に意味がある（推奨であって前提条件ではない）。

### 地図§8 の質問8つへの回答

**Q1. 順序・独立性** — 独立。**「時刻の正本」だけで7回の失敗は止まる**。
分割は失敗ループ防止に寄与せず、変更コスト削減（運用が楽になる）のための独立施策。
順序は正本→分割。分割時に「新モジュールは timeAuthority を使う」を registry で機械強制できる。

**Q2. 正本の形** — 新ラッパー型（`Timestamped<T>`）は**導入しない**。
既存 `capturedAt`（epoch ms）を正式名とし、**時点系の名前だけ**を寄せる。
★司令塔修正: `AgoMs`/`AgoSec`/`shadeAgeMs` は**経過時間（別の量・別の時計）なので寄せない**。
storage 形式は**一切変えない**（正本は「読み方」の関数）。過去 snapshot は旧形式のまま読める。

**Q3. 一本化の場所と移行** — `src/lib/timeAuthority.js`（新規）。移行は3段階:
- **Stage 1(MVP)**: 冒頭で🔴/⏳を出す3判定者のみ配線
- **Stage 2**: registry で残りを「祖父条項リスト」に凍結。**新規追加は禁止**（テスト赤）、
  既存はそのファイルを触るついでに移行しリストから削る（**単調減少**）
- **Stage 3(スコープ外)**: 十分減ったら一括移行

このパターンは `LANE_MIRROR_CONSUMERS` registry と max-lines ラチェットで**実績がある本リポの流儀**。

**Q4. 分割の切り方** — **機能ごと**（応援レーン/北極星/効果音…）。
横断的関心で割ると1機能の変更が複数ファイルにまたがり、7版事件を再生産する。
受け皿は `src/extension/popup/init/<feature>.js`（**eslint 予約済み・裏取り確認済み**）。
★地図§7 の通り「90リスナーが独立か」は**未確認**なので、Phase 2 の最初は抽出ではなく**棚卸し**。

**Q5. wiring テスト** — **先に壊れにくい形へ書き換えてから移動**。
共通ヘルパ `resolveEntryFnSource(fnName)` が popup-entry.js と `popup/**` の両方を探す。
断言そのもの（無条件呼び出し・アンカー付き regex）は**変えない**＝変異検知力を落とさない。
★裏取り: 本文切り出し型の wiring テストは **7個**（`fnBody(` 使用）。全30個ではない＝移行コストは限定的。

**Q6. max-lines** — **増やす局面は作らない**。Phase 1 は lib 内で完結。
Phase 2 の各抽出は「追加行 < 削除行」を同一コミットに束ねれば必ず純減。
束ねられない例外が出たら**その抽出はやらない**（ラチェット緩和を交渉しない）。

**Q7. MVPの範囲** — **Phase 1 のみ**。2関数の分割は含めない。
ユーザーの目的「今後の運用が楽になる」に最短で効くのは「診断が二度と矛盾しないこと」。

**Q8. 効果の測り方** — 行数ではなく**性質**で測る:
1. **判定者間無矛盾テスト**が緑（trust が⏳とした鏡について parityVerdict が🔴を出す組合せが**存在しない**）
2. **祖父条項リストが単調減少**（増えたら赤）
3. Phase 2: **関数行数ラチェット**（ファイル全体でなく関数を測る＝「同一ファイル内で移しただけ」と区別できる）
4. 運用指標: 次に類似症状が出たとき**2版以内**で収束するか

---

## 3. User Stories

- **US-1 空の状態**: popup を開いて1秒で速報をコピー → 鏡3行は🔴でなく「⏳判定保留」、
  parityVerdict も同じ理由で保留。**2つの表示が矛盾しない**
- **US-2 読み込み中**: 鏡は最大12秒古い。速報に齢が出続け、判定は「読んだ時点で
  書き手は書ける状態だったか」で行う。実機事例（起動4.3秒・読んだのは起動の3.7秒**前**）は⏳
- **US-3 失敗と再試行**: 取り直し後、書き手が書ける状態で読んだのに鏡が無ければ
  **今度こそ🔴**（保留は無限に🔴を隠さない）
- **US-4 古いデータ**: 旧 snapshot（`capturedAt` 無し）でもクラッシュせず、
  齢が取れなければ fresh 判定は null（**信頼を偽装しない＝fail-closed**）
- **US-5 別画面との競合**: timeAuthority は**読み手側の純関数**。書き手を増やさないので
  `LANE_MIRROR_CONSUMERS` は不変
- **US-6(Phase 2)**: 開発者が該当ファイルだけ開ける。wiring テストは関数名で解決するので
  移動済みでも緑。新モジュールが独自の時刻名を持ち込むと registry が赤で止める

---

## 4. Implementation Decisions

### Phase 1（MVP）

**新規 `src/lib/timeAuthority.js`**

```js
export const CANONICAL_TIME_FIELD = 'capturedAt';   // epoch ms(時点)
export const VALUE_FRESH_MS = 3 * 60 * 1000;        // = 旧 POPUP_DIAG_FRESH_MS
export const WRITER_BOOT_GRACE_MS = 3000;           // = 旧 POPUP_BOOT_GRACE_MS

export function toEpochMs(v);                       // diagnosticsTrust.js:33 から昇格
export function ageMsOf(capturedAt, nowMs);         // Number(null)===0 ガード内蔵
export function agoLabel(ms);                       // diagnosticsTrust.js:41 から昇格

/**
 * ★判定の正本。「この値は判定に使えるか」を決める唯一の関数。
 * ★時点(capturedAt)と経過(readAgoMs/writerBootAgoMs)は【別の量・別の時計】なので
 *   別引数のまま受ける。混ぜない([[venue-seats-lastupdate-clock-mismatch-v1044]])。
 * @returns {{ state:'fresh'|'stale'|'pending'|'absent',
 *   ageMs:number|null, readAtRelativeToBootMs:number|null }}
 */
export function classifyReading({ present, capturedAt, readAgoMs,
  writerBootAgoMs, graceMs, freshMs, nowMs });
```

判定規則（v0.1.1303 と同一・場所だけ正本へ）:
- `readAtRelativeToBootMs = writerBootAgoMs - readAgoMs`（どちらか null なら null）
- `present:false` かつ `readAtRelativeToBootMs < graceMs`
  （null なら `writerBootAgoMs < graceMs` へフォールバック）→ `pending`
- `present:false` でそれ以外 → `absent`
- `present:true` は齢で判定。**齢不明なら fresh を名乗らない**（`fresh:null` の三値を壊さない）

**変更 `src/lib/diagnosticsTrust.js`**: ローカルの `toEpochMs`/`agoLabel`/`POPUP_BOOT_GRACE_MS`
を削除し timeAuthority から import。`mirrorOfWithGrace` を `classifyReading()` に置換。
★**戻り値の形は不変**（`present/pending/fresh/ageMs/lidMatch/bootAgeMs/readAtRelativeToBootMs`）
— parityVerdict と formatDiagnosticsTrustLines が依存。`POPUP_BOOT_GRACE_MS` は互換 re-export。

**変更 `src/lib/popupDiagUptimeNote.js`**: リテラル `3000`(:29) を `WRITER_BOOT_GRACE_MS` の
import に置換。**コメントで書いていた規律が import として強制される**。

**変更なし `src/lib/parityVerdict.js`**: v1303 で既に pending を消費。テストだけ足す。

**新規 `src/lib/timeAuthorityRegistry.js`**: `LANE_MIRROR_CONSUMERS` と同型の凍結リスト。
初期内容は実装時に grep を再実行して**機械生成**（実行文はハンドオフに固定）。

### Phase 2（設計のみ・着手は別PR）

- **step 0 棚卸し**（抽出ではない）: 各リスナー塊が読む module-level 変数を機械集計。
  **抽出順は棚卸し結果で決める**（現時点で断定しない）
- **受け皿**: `src/extension/popup/init/<feature>.js`（eslint 予約済み・各2000行）
- **refresh の分割規約**: ステージ関数は世代トークンを受け取り**自分の先頭でガード**

```js
export async function refreshStage_laneRender(ctx, gen) {
  if (!ctx.isFreshRefresh(gen)) return; // ★呼び手を信用しない=構造で守る
}
```

- **wiring 共通ヘルパ** `src/lib/wiringTestSource.js`: `resolveEntryFnSource(fnName)`。
  見つからなければ **throw**（黙って空文字を返さない＝fail-closed）

---

## 5. Testing Decisions

すべて**挙動テスト優先**。文字列スキャンは registry 用途に限定し、判定ロジックには使わない
（関数を呼んで戻り値を断言するので `if(false)` 前置で必ず赤くなる
＝本リポの「恒真テスト」事故への構造的回答）。

**`src/lib/timeAuthority.test.js`**
- `実機2026-08-10の再現(boot 4.3s・read 8s前)は pending` →
  `{present:false, writerBootAgoMs:4300, readAgoMs:8000}` → `state:'pending'`,
  `readAtRelativeToBootMs:-3700`
  ★**7版目の症状の回帰であり、未検証だった v0.1.1303 ロジックの初の実効検証**
- `grace を過ぎた absent は pending にしない(保留が🔴を無限に隠さない)`
- `readAgoMs 欠落時は boot 基準へフォールバック(v1302 互換)`
- `capturedAt が null のとき起動0秒と誤認しない(Number(null)===0 ガード)`
- `toEpochMs/ageMsOf/agoLabel: 移設前後の恒等`（移設前に旧関数の入出力表をフィクスチャ化）

**`src/lib/judgeConsistency.test.js`（成功判定の核）**
- `pending の鏡に対し parityVerdict は mismatch を出さない(全格子)` —
  `(writerBootAgoMs, readAgoMs, present)` を格子状に振り、同一入力から
  `buildDiagnosticsTrust` → `buildParityVerdict` を通し、
  `pending===true` のとき `verdict!=='mismatch'` を**全点断言**
- `uptimeNote が「起動直後のため正常」と言う条件で trust が鏡🔴を出さない`
- ★**変異確認（必須）**: `parityVerdict.js:228` の `if (mirrorsPending)` を一時 `if (false)` に
  → 両テストが赤 → 復元。CRLF 空振りに注意（[[mutation-must-verify-it-applied-2026-08-06]]）

**`src/lib/timeAuthority.registry.test.js`**
- `独自の時刻/保留判定を持つファイルは祖父条項リストの部分集合`（新規持ち込みで赤）
- `リストの各エントリは実在する`（移行済みの削り忘れ検出）
- ★`grep パターン自身が既知の陽性フィクスチャにマッチする`
  — regex の腐り（アンカーずれで全部素通し）を検出する**自己検査**

**Phase 2 用**
- `popupEntryFunctionBudget.test.js`: `initPopup ≤ 2600` / `refresh ≤ 1800`。
  抽出のたび実測+30へ下げる（下げ方向のみ）。★変異確認: ダミー60行で赤 → 復元
- `wiringTestSource.test.js`: `移動後も同じ本文を返す` / `無い関数名は throw する`

---

## 6. Out of Scope

- `content-entry.js`(19,065行)の分割 — 内部未計測。popup-entry で型を確立してから別地図
- **140ファイルの一斉リネーム・storage 書式の変更** — 正本は読み方の関数。書式は不変
- 計器148個の削減・統廃合 — registry で**新規増殖を止めるだけ**
- extras 12秒間引きの変更 — 意図的設計（地図§4）
- `LANE_MIRROR_CONSUMERS` の構成変更
- `venueBar.js` / `status-entry.js` の分割
- **サイドパネル黒画面そのものの追加修正** — 本仕様は「判定が矛盾しない」ことを直す
- `initPopup`/`refresh` の具体的な抽出順 — 棚卸し待ち

---

## 7. Further Notes（実装時の地雷）

- **新規ファイルは `npm run tree-map` 必須**（pre-commit が drift で止める）。
  生成物の add 忘れに注意（[[generated-check-reads-worktree-not-index-2026-08-07]]）
- pre-push フックがビルドを走らせ dist の buildId が1つずれるのは既知（追わない）
- 検証は `npm run verify:cc` / `npm run test:cc`（素の verify はハングする）
- ★**diagnosticsTrust の戻り値の形を1フィールドでも変えると**
  formatDiagnosticsTrustLines / parityVerdict / aiShareFullText が連鎖で壊れる。
  移設は「定義の場所」だけ動かし、**形は凍結**
- fastDiagLite の罠（[[fastdiag-lite-is-the-printer-subset]]）: 出力を増やすなら lite にも通す
- registry の grep は `AgoMs` のような部分文字列が広すぎる。
  「timeAuthority を import せずに時刻フィールドを定義している」形にし、**陽性フィクスチャで自己検査**
- 変異確認は**変異が本当に適用されたか**を先に確かめる（CRLF 空振りの前例あり）
- Phase 2 で ctx を渡すとき、**フィールドを個別列挙で作り直す関数は値を落とす**
  （[[venue-mirror-is-the-primary-path-2026-08-01]] で5回踏んだ）。ctx は**参照を渡す・詰め替えない**

---

## 未解決の質問（★は司令塔が裏取りで解決済み）

1. `initPopup` の90リスナーの module-level 変数依存 — **未確認**。Phase 2 step 0 の棚卸し待ち
2. `refresh` と `isFreshRefresh()` の実際の関係 — **未確認**（先頭ガード規約は防御的設計）
3. **v0.1.1303 は実機で効くか** — **未検証**。本仕様のテストはロジックを検証するが、
   実機の extras 齢・boot 齢が実際に classifyReading へ届くかは実機確認が要る
4. 祖父条項リストの初期内容 — 実装時に grep を再実行して機械生成（実行文はハンドオフに固定）
5. 会場パリティ層（venueLaneParity / laneSceneEnvelope）も寄せるか — Stage 2 の判断
6. ★**解決済**: `shadeAgeMs` は `performance.now()` 基準の**経過時間**、
   `capturedAt` は epoch の**時点**。**別の量なので寄せてはいけない**（§裏取り参照）

## 仕様に根拠がない断定（assumption list）

- **A1** ★**裏取り済み**: 冒頭に verdict を出す判定者は3つだけ
  （`aiShareFullText.js:203/219/557` で確認）
- **A2**: parityVerdict の `data_mismatch` は同一瞬間の値どうしの比較であり、
  pending ガードで誤爆経路は塞がれている（consistency の生成元は未読）
- **A3**: `src/extension/popup/` への抽出で esbuild が相対 import を辿れる
  （lib への295 import 実績からの類推）
- **A4**: `classifyReading` を v0.1.1303 実装と完全同値に書ける
  → **恒等フィクスチャテストでこの断定自体を検証する設計**
- **A5**: 祖父条項リストの凍結+単調減少がこのリポの開発リズムで回る
  （LANE_MIRROR_CONSUMERS と max-lines での実績からの類推）

---

## 3視点レビュー（司令塔・HOWTO 必須項目）

**実装者視点**: Phase 1 は新規2ファイル＋既存2ファイルの小改修に収まり、
戻り値の形を凍結する制約が明記されているので着手可能。
★懸念: 祖父条項リストの grep 実行文が仕様に無い（→ ハンドオフで固定する）

**テスター視点**: 判定ロジックが挙動テストで、registry が自己検査を持つのは適切。
★懸念: 「全格子」の範囲（0〜15秒×1秒刻み）が仕様に明記されたのは良いが、
`present:true` 側の格子が薄い（→ 実装時に fresh/stale 境界も含めること）

**利用者視点**: US-1〜3 が「⏳ が出たら数十秒おいて取り直す」で一貫しており、
保留が🔴を無限に隠さない（US-3）ことが明記されている。
★懸念: 利用者（ユーザー）にとっては**黒画面が直ることが本命**であり、
本仕様はそれを直さない。Out of Scope に明記済みだが、
**ハンドオフで「これは黒画面の修正ではない」を最初に書くこと**。
