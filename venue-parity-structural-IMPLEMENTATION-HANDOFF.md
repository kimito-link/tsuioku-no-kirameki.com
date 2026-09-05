# 実装ハンドオフ — 会場パリティ「再発する構造」への対処（MVP）

- 2026-08-06 / 地図・裏取り=司令塔(Claude) / 設計=Fable
- **この1枚で着手できる。** 詳細は仕様の該当章を指す。
  - 地図: [venue-parity-structural-MAP.md](venue-parity-structural-MAP.md)
  - 仕様: [venue-parity-structural-SPEC.md](venue-parity-structural-SPEC.md)（★冒頭の「司令塔による裏取り結果」を必ず読む）

---

## 1行で言うと

会場と①パネルの不一致は過去1ヶ月で8回直して8回再発した。**個別の症状ではなく、
`KEY_LANE_MIRROR` に契約が無いこと**が再発の源泉。契約を成文化し、読み口に関所を置き、
UIの嘘をやめ、再発をCIで機械検知する。**データフローは変えない。**

---

## スコープ（MVP・1PR）

| # | やること | 仕様の章 |
|---|---|---|
| 1 | `src/lib/laneMirrorContract.js` 新設（契約・消費者登録簿・sanitize関所） | §4-1 |
| 2 | `venueBar.js` の鏡受け入れ**2箇所**を関所経由に（5635 catch-up / 5962 onChanged） | §4-2 |
| 3 | 嘘コメント削除・両端を契約参照に置換 | §4-3 |
| 4 | UIの嘘3点（stale表示 / fallback時のgift/ad文言 / 件数ラベル） | §4-4 |
| 5 | 4層のテスト（登録簿・round-trip・verdict不変条件・嘘コメント禁止） | §5 |

**これ以外はやらない。** Phase 2〜5 と別案件は仕様 §6 に番号付きで隔離済み。

---

## 着手手順

```bash
git checkout -b fix/venue-parity-mirror-contract
npm run verify:cc          # baseline を記録（全10ステップ OK を確認してから触る）
```

★baseline が赤なら、それは**あなたの変更ではない**。先に原因を切り分けること。

### TDD の順番（このリポの流儀）

1. **テストを先に書く** → 赤を確認
2. 実装 → 緑を確認
3. **変異で赤を確認**（`if(false)` 前置・呼び出しを1つ消す等）→ 復元して緑
   ★ここまでで1セット。緑だけで終えると実効性ゼロのテストになる（前科あり）

---

## 実装ステップ

### Step 1: 登録簿の実体を確定させる（★推測で埋めない）

```bash
grep -rln "laneMirrorKey" src/ --include=*.js | grep -v "\.test\.js"
```

司令塔の実測では **11ファイル**（仕様冒頭の裏取り結果を参照）。
Fable の初期リストは食い違っているので**grep結果を正とする**。

★各ファイルの `role` は**1つずつ実体を読んで**付けること。`*MirrorKey.js` 系は
「キー定義の相互参照」であって鏡データの読み書きではない可能性がある（未確認）。
**役割を推測で埋めたら、この仕様が防ごうとしている「契約の嘘」を自分で作ることになる。**

### Step 2〜5

仕様 §4-1 → §4-2 → §4-3 → §4-4 の順。各ステップ末に `npm run verify:cc`。

---

## 機械的な完了判定

- [ ] `npm run verify:cc` が**全10ステップ OK**
- [ ] 新規テスト4系統がすべて緑
- [ ] **各テストで変異→赤→復元→緑を実施済み**（証跡をPR本文に書く）
- [ ] `grep -c "会場には一切関係しない" src/extension/popup-entry.js` が **0**
- [ ] `acceptLaneMirrorSnapshot` の出現数が **3**（定義1 + 呼び出し2）
- [ ] 登録簿テストが grep 結果と**配列等値**で一致
- [ ] version bump 4箇所同期（`npm run verify:bump`）
- [ ] 新規lib追加につき `npm run tree-map` `npm run feature-map` `npm run site-health` 再生成をコミットに含める

### 実機確認（★自己採点しない・reality-checker に委任）

実配信で会場を開き、**状態速報のコピペ1枚**で判定（[[feedback-trust-status-report-over-browser-check]]）:
1. 鏡stale帯で「①の鏡 N分前」が出る
2. fallback で gift/ad 段の文言が変わる
3. `鏡除外N` は通常 0

---

## ★地雷（踏むと再発させる）

1. **sanitize は受け入れ点で1回だけ**。paint/renderSeats 内で呼ぶと hot path 汚染。
   v0.1.1201 で paint毎のDOM走査を入れて拡張全体を重くした前科がある。
2. **`emptyTextOverrides` は venueBar からのみ渡す**。①③の描画呼び出しに触ると
   「3画面そっくり同じ」（[[venue-equals-lane-same-layout]]）を自分で壊す。
3. **SOFT(180s)/HARD(900s) を1つにまとめない**。C2のちらつき防止が壊れる（明文の警告あり）。
4. **鏡capを再導入しない**（238人欠落の再発）。**passive で publish しない**（②の不可侵原則）。
5. **fallback に gift/ad を作らせない**（v0.1.1138「会場独自の受け皿を持たない」に逆行）。
6. wiring テストの regex は**前後のアンカーまで固定**（[[mutation-test-needs-anchored-regex-2026-08-05]]）。
   CRLF は走査前に `\r\n`→`\n` 正規化。
7. **verify系サブエージェント実行中に commit しない**（detached HEAD で不完全コミットになる）。
8. push しても Chrome には届かない。報告に**反映3手順**（pull → 拡張リロード → watch F5）を併記。

---

## ★このPRで「やってはいけない」こと

- **新しい計器を足すこと。** 直近5日で28版・うち14版が計器で症状ゼロ改善という失敗の直後。
  本MVPの新規要素は**強制(enforcement)とテスト**であって観測ではない。
  唯一の数値追加（`鏡除外N`）は既存の venueSeatsDiag 1行に載せるフィールド1個だけ。
- **症状を1つずつ潰すこと。** ユーザーは明示的に「構造から問う」(=B)を選択した。
- **推測でコードを書くこと。** 未確認は仕様の「未解決の質問」に残す。

---

## 未解決（実装前にユーザー裁定が要るもの）

1. **Phase 5**（fallback の gift/ad 供給）が v0.1.1138 に抵触するかの裁定 → **MVPには不要**
2. staleHard 時「①パネル未接続」の文言・置き場所の最終デザイン → 実装案でよいか確認
3. ①が匿名を publish したのか鏡破損か（推測A）→ **MVPは両方封じるので着手可能**。
   発生源の特定は出荷後の `鏡除外N` と parity 未説明で自然に判明する

---

## 次のチャットでの始め方

```
venue-parity-structural-IMPLEMENTATION-HANDOFF.md を読んで実装して。
まず git status と npm run verify:cc で baseline を取ってから着手すること。
```
