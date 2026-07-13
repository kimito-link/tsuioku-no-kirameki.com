# <外部AI>向け指示テンプレ: <1行タイトル>

> このテンプレは `council/codex-prompt-*.md` を書くときの雛形。実例は
> `council/codex-prompt-venue-guide-diag-exact-copy.md` を参照(成功実績あり)。
> 空欄のまま埋めずに委譲すると、委譲サブエージェント(codex-impl/cursor-impl)が差し戻す。

## 背景(なぜこの形式か)

口頭要約は無視・誤修正の実績あり。**この指示にない箇所は変更しない**こと。
「直した」という報告は禁止。証拠(diff+実測)で示すこと。

## 対象(正本の名指し)

- 正本ファイル: `src/...`(関数名・行番号は「NNN行付近」表記 — コードは変化するので行番号だけに頼らず関数名を主キーにする)
- 既存フラグ/定数: `FLAG_NAME`(場所と現在値を明記)
- 影響範囲: <司令塔が `Grep` / `npm run impact-check` で裏取りした波及先を列挙>

## やること(番号付き・各項目に完了条件)

1. ...
2. ...

## 触ってはいけない箇所(ネガティブ制約)

- <個別列挙>
- 定型で常に付ける:
  - `MEMORY.md` / `memory/reference_*.md` 編集禁止(司令塔専用領域)
  - push禁止(司令塔がdiffを読んでから判断)
  - ローディング演出(spinner/skeleton)を新規追加しない
  - host/iframeには触らない(ちかちか再発の既知地雷)
  - 鏡(mirror)に載せるのは数値・構造化データのみ(生HTML文字列をblobに足さない)
  - 新しい計器を足すなら `statusFastDiagLite` への passthrough を忘れない

## 設計判断が必要になったら

実装を止めて、その質問を完了報告に書くこと。決め打ちで進めない。

## 完了条件(全部必須)

1. `npm run verify:cc` が緑(ログは `.artifacts/verify-cc.log`)
2. bump 3点セット同期(`extension/manifest.json` / `package.json` / `src/lib/changelog.js` 先頭・AGENTS.md §12.5)
3. 新規libファイルを足したら tree-map/feature-map の再生成をコミットに含める
4. `git add` は新規ファイルを明示列挙する(`git status | grep -v '^??'` のようなフィルタでの取りこぼし禁止)
5. commitして停止する(pushしない)

## 完了報告の書式

- 変更ファイル:行番号一覧
- `npm run verify:cc` の STEP 行(全ステップ分)
- 実測して確認した事実(「〜のはず」ではなく実際に見た結果)
- 未解決の質問(あれば)
