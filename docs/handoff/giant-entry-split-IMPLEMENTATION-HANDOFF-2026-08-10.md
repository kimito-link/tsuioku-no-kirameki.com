# 実装ハンドオフ: 診断の判定を1本化する（Phase 1 / MVP）

> **この1枚だけで着手できる粒度で書いた。** 作成: 2026-08-10
> 地図: [giant-entry-split-MAP-2026-08-10.md](giant-entry-split-MAP-2026-08-10.md)
> 仕様: [giant-entry-split-SPEC-2026-08-10.md](giant-entry-split-SPEC-2026-08-10.md)

---

## ★最初に読むこと（誤解を防ぐ）

**これはサイドパネル黒画面の修正ではない。** 黒画面は**未解決のまま**。

このタスクが直すのは「**診断が互いに矛盾して、開発者を誤った犯人へ7回誘導した構造**」。
黒画面の修正は、この作業が終わって診断が信頼できるようになってから別タスクで行う。

ユーザーにこの成果を報告するときは、**「黒画面が直った」と誤解させないこと**。

---

## 0. スコープ（MVP・これ以外はやらない）

| やる | やらない |
|---|---|
| `src/lib/timeAuthority.js` を新設（判定の正本） | 巨大関数の分割（Phase 2・別PR） |
| 3判定者を全員その消費者にする | 140ファイルの一斉移行 |
| 祖父条項 registry で新規増殖を止める | storage 形式の変更 |
| 判定者間の**無矛盾テスト** | 黒画面そのものの修正 |

**触ってはいけないもの**: `mirrorBundleFlushScheduler`（正常動作を確認済み）/
extras の12秒間引き（意図的設計）/ `LANE_MIRROR_CONSUMERS` の構成。

---

## 1. 着手手順

```bash
git checkout -b fix/time-authority-single-judge
```

TDD で進める。**テストを先に書き、赤を見てから実装する。**

---

## 2. 実装ステップ

### Step 1: 正本モジュールを作る

`src/lib/timeAuthority.js` を新設。シグネチャと判定規則は **仕様 §4「Phase 1」** をそのまま使う。

★**時点と経過を混ぜないこと**（このリポは過去に混ぜて「更新56年前」を出した
＝[[venue-seats-lastupdate-clock-mismatch-v1044]]）:

```
capturedAt      = Date.now()          → epoch の【時点】
shadeAgeMs      = performance.now()差  → 【経過時間】(別の時計)
readAgoMs       = 経過時間
```

`classifyReading` は両方を**別引数**で受ける（統合しない）。

### Step 2: 恒等テストを先に書く（移設で意味を変えないため）

移設**前**に `diagnosticsTrust.js` の `toEpochMs`(:33) / `agoLabel`(:41) の
入出力表をフィクスチャ化し、移設後も同値であることを断言する。

`src/lib/timeAuthority.test.js` のケース名は **仕様 §5** のとおり。
★最重要ケース:

```js
it('実機2026-08-10の再現(boot 4.3s・read 8s前)は pending', () => {
  const r = classifyReading({ present: false, writerBootAgoMs: 4300, readAgoMs: 8000, nowMs: NOW });
  expect(r.state).toBe('pending');
  expect(r.readAtRelativeToBootMs).toBe(-3700);
});
```

これが**7版目の症状の回帰**であり、**未検証だった v0.1.1303 ロジックの初の実効検証**。

### Step 3: 3判定者を配線する

- `diagnosticsTrust.js`: ローカル定義を削除し import。`mirrorOfWithGrace` を
  `classifyReading()` に置換。★**戻り値の形は1フィールドも変えない**
  （`present/pending/fresh/ageMs/lidMatch/bootAgeMs/readAtRelativeToBootMs`）。
  `POPUP_BOOT_GRACE_MS` は互換のため re-export。
- `popupDiagUptimeNote.js:29`: リテラル `3000` を `WRITER_BOOT_GRACE_MS` の import に置換。
- `parityVerdict.js`: **変更しない**（v1303 で既に pending を消費）。

### Step 4: 判定者間の無矛盾テスト（成功判定の核）

`src/lib/judgeConsistency.test.js`。仕様 §5 のとおり格子状に振り、
**`pending===true` のとき `verdict!=='mismatch'` を全点断言**。

★`present:true` 側の格子も含めること（fresh/stale 境界。仕様のテスター視点レビュー指摘）。

### Step 5: 祖父条項 registry

`src/lib/timeAuthorityRegistry.js` を新設。**初期内容は下の実行文で機械生成する**
（仕様の未解決4・実行して確認済み＝現在 **121ファイル**）:

```bash
grep -rlE "capturedAt|persistedAt|measuredAt" src/lib/*.js | grep -v "\.test\." | grep -v timeAuthority | sort
```

`src/lib/timeAuthority.registry.test.js` は仕様 §5 のとおり。
★**grep パターン自身の自己検査**（既知の陽性フィクスチャにマッチするか）を必ず入れる
— アンカーずれで全部素通しになる事故の防止（[[mutation-test-needs-anchored-regex-2026-08-05]]）。

---

## 3. 機械的な完了判定

すべて満たすまで完了と report しない。

- [ ] `npm run verify:cc` 全ステップ green（素の `verify` は使わない・ハングする）
- [ ] `timeAuthority.test.js` の実機再現ケースが green
- [ ] `judgeConsistency.test.js` が全格子で green
- [ ] **変異確認3件**（それぞれ赤を目視 → 復元）:
  1. `parityVerdict.js:228` の `if (mirrorsPending)` → `if (false)` で judgeConsistency が赤
  2. `classifyReading` の null ガードを外して timeAuthority.test が赤
  3. registry の grep を壊して registry.test が赤
- [ ] 変異が**本当に適用されたか**を先に確認（CRLF 空振りの前例あり
      = [[mutation-must-verify-it-applied-2026-08-06]]）
- [ ] `npm run tree-map` を実行し生成物を `git add`（add 忘れは手元緑・commit だけ drift）
- [ ] version bump 3点（manifest / package / changelog 先頭）が `verify:bump` で機械確認された

---

## 4. 地雷（踏むと戻すのが高い順）

1. **`diagnosticsTrust` の戻り値の形を変える** → formatDiagnosticsTrustLines /
   parityVerdict / aiShareFullText が**連鎖で壊れる**。移設は定義の場所だけ動かす。
2. **時点と経過を1つの型に統合する** → 「56年前」型の事故。別引数のまま。
3. **祖父条項リストを手書きする** → 必ず漏れる。上の grep で機械生成。
4. **文字列スキャンで判定ロジックをテストする** → `if(false)` 前置を素通しする恒真テストになる。
   判定は**必ず関数を呼んで戻り値を断言**する。
5. **max-lines ラチェットを緩める** → `eslint.config.js:250` は「増やすのは禁止」。
   Phase 1 は lib 内で完結するので、そもそも触る必要が無い。

---

## 5. Phase 2（今回やらない・次の次）

着手する場合、**最初の作業は抽出ではなく棚卸し**（仕様 §4「Phase 2」）:
`initPopup` の90リスナー各塊が読む module-level 変数を機械集計し、
結合度の最小な機能塊から 1PR=1塊 で抽出する。受け皿 `src/extension/popup/init/` は
**eslint に予約済み**（`eslint.config.js:252-254`・max-lines 2000）。

---

## 6. 実装後（自己採点しない）

- **reality-checker に検証を委任**する（仕様 §5 が検証依頼の土台）。
- 実機確認は**ユーザーに1回だけ**依頼する。確認内容は
  「popup を開いた直後に速報をコピー → 鏡が ⏳ になり、パリティも🔴でないこと」。
- ★**実機で確かめる前に「直った」と報告しない**（本セッションで2回やらかした）。
