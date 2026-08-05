# 実装ハンドオフ — 応援パネル4秒周期消失の決着 (v0.1.1267)

> この1枚だけで着手できる粒度で書いてある。設計の理由が知りたいときだけ
> `panel-flicker-resolution-DESIGN.md` を読む。

## 読む順

1. この文書(全部)
2. `panel-flicker-resolution-DESIGN.md` の C/D/E 節(差分・計器・テストの詳細)
3. 実コード: `src/extension/content-entry.js` の 2832-2910(計器群)

## ゴール(1つだけ)

**次の1版で必ず何かが確定すること。** パネルが直るかどうかは二の次。
ユーザーは3日・15版の空振りで疲弊している。「次も分かりませんでした」は許されない。

## スコープ(MVPのみ・これ以外やらない)

| # | 内容 | ファイル |
|---|---|---|
| 1 | 消失分類の純関数を新規作成 | `src/lib/inlineHostVanishClassifier.js`(新規) |
| 2 | forensicsに snapshot/pollDelta/hint/位相 を追加 | `src/lib/hostVanishForensics.js` |
| 3 | 壊れた変数共有を修理(`_hostStylePrevVisible` を2つに分離) | `content-entry.js` 2836/2855/2867/2892/2897 |
| 4 | observerを祖先まで拡張+host再生成に追従 | `content-entry.js` 2845-2874(関数名も変更) |
| 5 | 位相計器(`_lastLivePollTickAt`) | `content-entry.js`(4秒pollのtick先頭) |
| 6 | `<style>`生存ガード | `content-entry.js` 復帰ゲート2箇所(12820/12896付近) |
| 7 | CSSに min-width/min-height | `content-entry.js` 3392付近 |
| 8 | 新フィールドを statusFastDiagLite へ passthrough | `src/lib/statusFastDiagLite.js` ほか |

**やらないこと**: 案B(body直下fixed)/案C(復帰ゲート停止)/案D(ShadowDOM)。
理由は DESIGN.md F節。**復帰ゲートと autoshow ゲートの条件には一切触らない**。

## 着手手順

```bash
git checkout -b fix/panel-vanish-forensics-1267
```

TDDで進める。**純関数(#1)→テスト→wiring の順**。

1. `inlineHostVanishClassifier.js` を書き、`inlineHostVanishClassifier.test.js` で
   6分岐+優先順位+位相3分岐をテスト。**各条件を反転する変異で赤を確認**してから次へ
2. `hostVanishForensics.js` を拡張(samples上限4は維持)
3. `content-entry.js` を #3→#4→#5→#6→#7 の順に。**#3を先にやる**(#4が依存するため)
4. lite passthrough(#8)を配線し wiring テストで数を断言
5. `npm run verify:cc`(全10ステップ green が出荷ゲート)
6. version bump: `package.json` / `extension/manifest.json` /
   `tsuioku-no-kirameki/index.html`(4箇所) / `src/lib/changelog.js`
7. 新規libを足したので `npm run tree-map` と `npm run feature-map` を再生成してコミットに含める

## 機械的な完了判定

- `npm run verify:cc` が `verify:cc OK`(全10ステップ)
- 以下の wiring が**数で**通る:
  - `_hostStylePrevVisible` の出現 `toBe(0)`
  - `ensureHostAncestryMutationTrace(` `toBe(2)`
  - `ensurePageFrameStyleAlive(` `toBe(2)`
  - `_lastLivePollTickAt = Date.now()` `toBe(1)`
  - lite の新キー(hint/pollDeltas/styleReattach)各 `toBe(1)`
  - CSS の `min-width:280px` `toBe(1)`
- **変異テストで赤を確認した記録**がコミットメッセージにあること

## 地雷(過去に実際に踏んだもの)

1. **regexを緩く書くと `if (false)` 前置が素通りする**。前後のアンカー(`try {` 等)まで固定する。
   2026-08-05 に実際に緑のまま通した([[mutation-test-needs-anchored-regex-2026-08-05]])
2. **lite に通さない計器は速報に永久に出ない**([[fastdiag-lite-is-the-printer-subset]])。
   full だけに足して満足しないこと
3. **hot path にDOM走査を足さない**(v0.1.1201で拡張全体を重くした)。
   rAFへの恒常追加はポインタ比較2つまで。getComputedStyle は消失遷移の瞬間のみ
4. **ゲートを足す前に「唯一の復帰経路でないか」確かめる**(v0.1.1250)。
   `<style>`生存ガードは正常系で完全no-opであることを確認してから入れる
5. **計器の0は「未計測」かもしれない**。必ず観測回数を併記する
6. push直後の dist buildId 1ズレは pre-push フックの既知挙動。追わない
7. reality-checker等のgitを触るサブエージェント実行中に commit しない(detached HEAD事故)

## push後のユーザー報告に必ず書くこと

- **反映3手順**: pull → 拡張リロード → watchタブ F5
- **読んでもらう行は2行だけ**: 「消える直前の足跡」ブロックの `hint:` と `位相:`
- 判定表(DESIGN.md B節の結果マトリクス)のどれに当たるかは、その2行で決まる

## 転記元の実在パス(裏取り済み)

- `src/extension/content-entry.js`
  - 2783 `PAGE_FRAME_STYLE_ID` / 3351 `ensurePageFrameStyle()`
  - 2836 `_hostStylePrevVisible`(廃止対象) / 2845 `startHostStyleMutationTrace`(改名対象)
  - 2870 `observe(host, {...})`(祖先を足す箇所) / 2880 rAF tick / 2892-2897 遷移ブロック
  - 2922 `setInlineHostDisplay` / 3021 `setInlineHostVisible` / 3392付近 CSS既定
  - 4121 `startHostStyleMutationTrace(host)`(唯一の呼び出し・改名する)
  - 5649-5661 host移設 / 5729 `anchored_show`
  - 5932 `isInlineHostIntentionallyHidden` / 5964 `_inlineHostRecoveryDiag`
  - 684 `LIVE_POLL_MS` / 14719 `setInterval(..., LIVE_POLL_MS)` / 12820・12896 復帰ゲート2箇所
- `src/lib/inlineHostVisibilityIntent.js`(v0.1.1266で属性方式)
- `src/lib/inlinePanelShowGate.js`(autoshowゲートの純関数)
- `src/lib/hostVanishForensics.js`(拡張対象)
