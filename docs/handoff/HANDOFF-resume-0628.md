# 引き継ぎ (2026-06-28 作成) — 星野ロミ型「3画面パリティ」の到達点と次の一手

> このファイルは新チャットへの引き継ぎ。会話全文ではなく必要事項だけ。
> 正本ルール: `~/.claude/CLAUDE.md` §2(汚染セッション) / §4(長いセッション)。
> 詳細な真因・学びは `memory/MEMORY.md`(C:\Users\info\.claude\projects\...\memory\) の各 v0.1.96x 行が正本。

## 0. 現在地(一行)

- バージョン **v0.1.966**。`origin/master` と同期 0/0。`C:\nicolive-ext` も v0.1.966(copy:ext 済)。
- 直近5コミット = v0.1.962〜966。**全て実装完了・push 済み・実機確認待ち**。

## 1. このセッションでやったこと(v0.1.962→966・星野ロミ型 3画面パリティ)

ユーザーの設計要求「**①watch本体 ＝ ②応援ライブビュー(拡張内プレビュー・passive) ＝ ③このURLをWEBで公開(純Web)
が全部おなじじゃないとだめ**」(星野ロミ型=作る人[記録]と見せる人[②③]を分け、見せる側はみな同じ鏡を読むだけ)。
個別バグ潰しでなく**会議(council)で根を洗ってから**直す方針で進めた。

| ver | 何を直したか | 種別 | 会議 SYNTHESIS |
|---|---|---|---|
| v0.1.962 | 応援プレビューを開いた瞬間の重さ=passive で heavy 全件 read を走らせず鏡から描く | 性能 | liveview-open-heavy |
| v0.1.963 | 貢献度コピー漏れ(拡張6≠鏡0)=deferWrite+allSettled後1回flush(後着レーン落ち防止) | バグ(P0) | three-views-parity |
| v0.1.964 | 「描画済みなのにローディング継続」誤検知=CSSフェイルセーフ終了の animationend で --done 付与 | 誤検知(P2) | loading-overlay-stuck |
| v0.1.965 | 応援プレビューで北極星(貢献度/広告)を鏡から描く=applyNorthStarMirrorForPassive 新設 | バグ(第1段) | single-source-of-truth |
| v0.1.966 | 「拡張7≠鏡6」1件差の誤警告を鮮度差として正常化=二系統突合を3段階判定 | 誤検知(第2段) | single-source-of-truth |

→ **星野ロミ型の貢献度/広告レーンへの適用は第1段(v0.1.965 描画)+第2段(v0.1.966 診断)で完成。**

## 2. ユーザー実機確認(未完了・最重要の次ステップ)

push しただけでは Chrome に届かない。ユーザーが **pull→拡張🔄リロード→watch タブ F5** で初めて反映。
実機で見てほしいもの(状態速報の🤖AI共有テキストを貼ってもらえば私が判定):
- v0.1.965: 応援プレビューで**貢献度・広告ランキングが鏡から表示される**(今まで空だった)。
- v0.1.966: 状態速報で**「北極星 貢献度: 拡張7 / 鏡6 🟢鮮度差で正常」**と出て🔴コピー漏れ警告が消える。
- v0.1.962/963/964 も実機確認待ち(重さ解消・貢献度件数一致・ローディング誤警告消滅)。

★ユーザーは「実機確認までやって」と要望 → **Claude-in-Chrome MCP** で実機検証する手法を確立した(§4)。

## 3. 地雷マップ(同じ轍を踏むな)

- **popup の refresh()/paint の read path には絶対に触れない**(過去2回 revert した最重要地雷)。
  鏡は write-only / passive は read-only。今セッションの全修正もこの原則を守った。
- **dist 差分(app/dist/live-view.js, extension/dist/popup.js, status.js)は push hook の再ビルドで
  NL_BUILD_ID だけ変わる**。`git diff <dist> | sed 's/NL_BUILD_ID=[0-9-]*//' | grep '[A-Za-z]'` で
  実コード差分が無ければ `git checkout` で捨ててよい(385KB minified を全読みしない)。
- **`scripts/meeting.mjs`** はセッション開始時点で既に未コミット変更あり(今セッションでは触っていない)。
  作業対象でなければ放置(`??` の council ログ類も同様=生成物)。
- **max-lines ラチェット**(eslint.config.js): popup-entry.js に行を足したら `npm run verify:cc` の lint で
  「too many lines」が出る。lib に抽出できない DOM/storage グルーは、現在値+εでラチェットを上げ、
  必ず**根拠コメント**(何を足したか・lib抽出不可の理由・council 名)を併記する(既存の作法に倣う)。
- **changelog の summary は35字以内**(changelog.test.js が落ちる)。
- **verify:cc の generated-doc ドリフト**: 機能追加で `tree-map:check`/`site-health:check`/`feature-map:check`
  が落ちることがある。`npm run tree-map && npm run feature-map && npm run site-health` で再生成して
  コミットに含める(verify:cc を再実行して全green を確認)。
- **二系統の整合チェックに完全一致を期待しない**: 「拡張(生データ)vs 鏡」のように別経路・別タイミングの
  計算を突合しているなら、鮮度差で小さくズレて当然。閾値で normal/mismatch に割る(v0.1.959/966 と同型)。

## 4. 実機検証の手法(今セッションで確立・再利用可)

ログイン・記録ON・拡張リロードは**ユーザー操作**で私は代行不可(認証情報入力は禁止事項)。
だが**修正ロジックの正しさは実ブラウザで確証できる**:
- `mcp__Claude_in_Chrome__list_connected_browsers` → `select_browser` → `tabs_context_mcp{createIfEmpty:true}`。
- `mcp__Claude_in_Chrome__javascript_tool` で、修正した**純関数のソースをそのまま貼って実Chromeのエンジンで走らせる**
  (mergeNorthStarMirrorLanes / shouldMarkInitShadeDoneOnAnimationEnd / restoreNorthStarMirrorRows /
   judgeNorthStarConsistency を実機で全合格させた)。CSS アニメは**バックグラウンドタブで時計が止まる**ので、
   `new AnimationEvent('animationend',{animationName})` を dispatch して本番ハンドラを直接叩いて検証した。
- ★**拡張の中身バージョンはページ側から読めない**(Chromeセキュリティ。拡張IDも隠れる)。
  確認できるのは「拡張が動作中(会場要素 nlsb-venue-* を注入)」と**popup のビルド番号バッジ**だけ。
- chrome-devtools MCP は別の空 Chrome に繋がっていて拡張を見られない(list_extensions=空)=Claude-in-Chrome を使う。

## 5. 次の一手(ユーザーに方向確認してから着手)

未確定。優先度順の候補:
1. **【最優先】ユーザー実機確認のサポート** — 状態速報を貼ってもらい v0.1.962〜966 が効いたか判定。
   実機NGなら、その状態速報を根に次の会議へ。
2. **P4(予防・3画面パリティの残)** — 数字カード鏡・コメント鏡も北極星と同じ min-gap(3秒)設計を持つ
   (publishStatCardsMirror / publishCommentTimelineMirror)。同型のコピー漏れを**先回りで**
   deferWrite+揃え後1回flush に統一すると同時解決。会議の fullParityChanges / stagePlan 参照。
3. **会議 parityNote の未調査項目** — ②応援ライブビュー/③純Web 側に「ローディング幕」や「この診断」が
   あるか(あれば同じ誤検知を持つ可能性)。single-source-of-truth-SYNTHESIS.md / loading-overlay-stuck の parityNote。
4. 別作業 — ユーザー指定。

⚠ どれも**まずユーザーに方向を聞く**(勝手に2へ進まない)。

## 6. 守るべき開発フロー(AGENTS.md §12.5)

- 1変更=patch 1つ。version bump は **package.json / extension/manifest.json / src/lib/changelog.js** の三者同期
  (`npm run verify:bump` が verify:cc に含まれる)。
- 検証は **`npm run verify:cc`**(ハング回避)。失敗時 `.artifacts/verify-cc.log` を Read。
- 実装完了後 **`npm run copy:ext`**(C:\nicolive-ext へ同期)→ commit → push。
- 司令塔は push 報告のたびに**ユーザー反映3手順(pull→🔄リロード→F5)**を併記する。
- 純Web(app/)の反映は **Vercel デプロイが別途必要**(copy:ext では純Webに届かない)。
