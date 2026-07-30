# 引き継ぎ (2026-06-27 作成) — 「途中で止まった」の正体と次の一手

> このファイルは新チャットへの引き継ぎ。会話全文ではなく必要事項だけ。
> 正本ルール: `~/.claude/CLAUDE.md` §2(汚染セッション) / §4(長いセッション)。

## 1. 結論: 実装作業は止まっていない＝完了済みだった

前セッションで「途中で止まった」と見えたが、調査の結果 **追加実装は不要** だった。

- `git status` に出ていた dist 3ファイル
  (`app/dist/live-view.js` / `extension/dist/popup.js` / `extension/dist/status.js`)
  の差分は **`NL_BUILD_ID` のタイムスタンプ違いだけ**。実コード変更はゼロ。
  - コミット済み = `NL_BUILD_ID=0627-001741`
  - 前回 rebuild = `0627-024805`
- `src/` に未コミットの実変更なし。最新 src の mtime も最後のコミットより前。
- **v0.1.961**(コメント鏡を popup なしで出す＝星野ロミ型 役割分担)は
  `c30ac273` で **push 済み・実装完了済み**(MEMORY 記録どおり)。
- その後の記事スラッグ化コミット `60497361` の直後に rebuild が走り、
  ビルドID違いの dist 差分が捨て忘れられていただけ＝これが「止まった」状態の中身。

### このセッションでやった対処

- ビルドID違いだけの dist 差分を `git checkout -- <3ファイル>` で破棄。
- 作業ツリーの tracked 変更はクリーン(残るは `??` の council ログ等＝作業対象外の生成物)。
- `origin/master` と完全同期 (ahead/behind = 0/0) を確認。

### 地雷マップ(同じ轍を踏むな)

- **dist の差分を見たら、まず `NL_BUILD_ID` のタイムスタンプ違いだけか疑う**。
  判定法: `git diff <dist> | grep -oE 'NL_BUILD_ID=[0-9-]+'` で2つの ID が出るだけなら
  実コード差分はない＝`git checkout` で捨ててよい。実コードを読み込もうとして
  385KB の minified diff を全部読むのは無駄(コンテキスト浪費)。
- `app/live-view.js` のビルド番号 `v0.0.0-web` は chrome シム getManifest の固定値＝
  拡張(v0.1.961)とは別系統。純Web反映は **Vercel デプロイが必要**(copy:ext では純Webに届かない)。

## 2. 現在の到達点(MEMORY.md と一致)

- バージョン: **v0.1.961** (package.json / 拡張)。`C:\nicolive-ext` も v0.1.961 (copy:ext 済)。
- 星野ロミ型「データを作る人(content)と見せる人(popup/web)を分ける」設計の途中。
  - v0.1.960: 純Webにコメントタイムライン鏡(最新N件)を運ぶ → コメントが進む。
  - v0.1.961: popup を開かなくても content(記録の心臓部)が最新N件を publish。

## 3. 次の一手(ユーザーに方向確認してから着手)

未確定。前セッション終了時にユーザーへ提示した選択肢:

1. **実機確認サポート** — Claude-in-Chrome で watch タブを開き、popup を**開かず**に
   コメント鏡が出るか検証。純Web側は Vercel デプロイ後に `/live-view?v=token` で確認。
   MEMORY の「⚠次」はこれ(v0.1.960/961 とも実機確認待ち)。
2. **次の残タスク** — 「開いた瞬間の重さ(passive heavy read 全件)を鏡経路で軽くする」。
   `council/liveview-open-heavy-SYNTHESIS.md` 参照。第1段は一度実装→revert 済
   (会議で根本から見直し中)。content 化が進んだので再着手可。
3. 別作業 — ユーザー指定。

⚠ どれも未着手。新チャットは **まずユーザーに方向を聞く**(勝手に2へ進まない)。

## 4. 守るべき制約(この設計の地雷・MEMORY より)

- **popup の refresh()/paint の read path には絶対に触れない**(過去2回 revert した最重要地雷)。
- 丸ごとDOM鏡の再挑戦は禁止(v0.1.948 実機却下＝毎paint全DOM sanitize が重い)。
- passive(dock=liveview=INLINE_PASSIVE)は storage read のみ＝書かない/注入しない/fetch しない。
- content(記録の心臓部)・会場 iframe には触らない。storage write は best-effort。
- version bump は 1変更=patch 1つ。`npm run verify:bump` で manifest/package/changelog 同期。
- push しただけでは Chrome に届かない＝ユーザーが pull→拡張リロード→watch タブ F5 で初めて反映。
- 検証は `npm run verify:cc`(ハング回避)。失敗時 `.artifacts/verify-cc.log` を Read。
