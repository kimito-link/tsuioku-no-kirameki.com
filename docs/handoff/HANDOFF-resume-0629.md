# 引き継ぎ (2026-06-29) — 3画面パリティ「全部同じ数字でまともに機能」継続中

> 新チャットへの引き継ぎ。会話全文でなく必要事項だけ。正本ルール=~/.claude/CLAUDE.md §2(汚染)/§4(長セッション)。
> 詳細な真因と経緯は memory/reference_render_not_firing_root_fix.md(C:\Users\info\.claude\projects\...\memory\)が正本。

## 0. 現在地(一行)
- master HEAD = e8c671e3 / **v0.1.993**。origin と同期 0/0。C:\nicolive-ext も v0.1.993(copy:ext 済)。
- 未コミット作業ツリーは dist のビルドIDノイズ + 既存の council/*・scripts/meeting.mjs(セッション開始時から)だけ。今回の作業対象外。

## 1. ゴール(ユーザー設定・/goal)
**「ツールのPOP ＝ 応援プレビュー ＝ WEB化、全部正確な数字が出てまともに機能するまで」**。
設計の正本= 記事 role-separation-design(tsuioku-no-kirameki/articles/role-separation-design/・星野ロミ型4役割
「集める/集計/置く(鏡)/見せる」。見せる側は集計済みの置き場=鏡から貼るだけ・重い読み込みを持たない)。
①POP=watch ページ埋め込みパネル(?inline=1&lv=・viewKind="embed_watch") ②応援プレビュー(?inline=1&dock=liveview
=passive・extension/live-view.html が iframe 埋め込み) ③WEB化(純Web app/live-view.html・publish された jsonBlob を読む)。

## 2. このセッションで根治したこと(描画系=ほぼ完了)
状態速報を1枚ずつ貼ってもらい、真因を順に特定→実拡張ランタイムで実証→出荷、を繰り返した。
- v0.1.975 コピーボタン不全(execCommand フォールバック)
- v0.1.976/979 応援レーンを heavy read の前/鏡フォールバックで描画
- v0.1.977/978 北極星を heavy 非依存の独立 tick(初回早回し)で起動
- v0.1.980 状態速報に「未起動なら対処手順」明記 / v0.1.982 白化を状態速報で可視化 / v0.1.983 地図に共通ヘッダー戻る
- v0.1.984 popup診断に拡張バージョン併記(新コード未ロード判定)
- v0.1.985 ★状態速報の最先頭に「3画面パリティ総合判定」1行(✅/🟡保留/🔴不一致+次の一手)。src/lib/parityVerdict.js
  (決定木・誤検知根絶=取得不能は必ず保留)。②描画 ack は専用キー nls_preview_render_ack_v1(passive 不可侵原則を守る)。
- v0.1.986/988 独立 tick の lid を embedded 自タブ &lv= 最優先に(複数配信視聴で揺れて probe=0 を根治)
- v0.1.989 独立 tick を init 同期+storage.onChanged 駆動に(重い iframe のタイマー starvation 対策)
- v0.1.990 北極星 chain 先頭の await hideNorthStarEventLanesIfNotParticipating を非ブロック化(storage.get 詰まりで
  publish 未到達→鏡空 を根治)
- v0.1.991 応援レーン(アイコン列)を現配信の軽いコメント源 nls_csummary_<lv> から heavy 非依存起動
  (renderStoryUserLaneFromLightCommentsForCurrentLive)
- v0.1.992 記録/同接/来場の数字カードも heavy 非依存で panel_summary から起動(applyLightweightPanelSummaryCards(lid))
- v0.1.993 ★status-entry の buildAiShareFullText(状態速報の本体・223行)を src/lib/aiShareFullText.js に
  【バイト一致】抽出(②③ で同じ状態速報を使う土台)。pure refactor・全6479テスト緑。

★実機 v0.1.991/992 状態速報で確認済: 北極星 貢献度/鏡✅一致・広告✅一致・応援レーン コメント→画面描画✅・
全鏡✅現配信・「ローディング継続」消滅・パリティ=🟡保留(③WEB送信が古い=「🌐WEBでも公開」押下待ちだけ・コード問題なし)。

## 3. 次の一手(ユーザー明示の残タスク・最優先)
ユーザーは「②応援ライブビュー・③WEB にも①status と【全く同じフル状態速報】を入れろ」と明言(/AskUserで「②③にフル状態速報」を選択)。
私が「達成」と言ったら「ひどすぎる・できたと言わない」と叱責された=描画だけでなく②③の自己診断まで出すのがゴール。
- **土台は完成(v0.1.993 で buildAiShareFullText を lib 化済)。** 残りは:
  (A) **②応援ライブビュー(passive popup)に buildAiShareFullText を呼ばせて全状態速報を表示**。②は拡張内=全storage 読める
      ので status と同じ入力(popupDiag/各鏡/fastDiag/publish/previewAck)を集めて呼べる。表示場所=passive popup 内 or
      extension/live-view.html のバー付近。
  (B) **③WEB(app/live-view.js)に同じ枠で状態速報を表示**。③は純Web=拡張storage 読めない=publish された jsonBlob のみ。
      jsonBlob から作れる範囲(各鏡/パリティの一部)で buildAiShareFullText を呼ぶ。※app は別バンドル(app/dist/)=
      src/lib/aiShareFullText.js を app ビルドに含められるか scripts/build.mjs を確認(import 経路 OK か)。
  (C) ★**「鏡に届いた」でなく「②③で実際に描画・診断が出た」まで実拡張/実Webで確認してから報告**(install_extension で
      ②=popup.html?inline=1&dock=liveview&lv=・③=app/live-view.html を開いて目視/probe)。「できた」を軽々しく言わない。

## 4. 別系統の残課題(描画と別・後回し可)
- 記録101%(記録>本家コメ・複数配信で頻出)= 別配信混入 or 二重計上の疑い。状態速報が毎回 commentCountProvenance で
  「要確認」を出している。実コードで切り分け(記録が消える話ではない)。
- 「一気に取れない/取り込みが遅い(取得率%が低い)」= backfill の取得スピードの話。描画とは別。

## 5. 地雷マップ(踏むな)
- ★**popup の refresh()/paint の read path にキャッシュを足さない・画面まるごとコピーしない・記録の心臓部(content)に
  集計を足さない**(role-separation-design §6・過去 revert 多数)。今回の修正は全て「描画トリガの配置/await外し/別キー」だけ。
- renderStoryUserLane / STORY_SOURCE_STATE は module 状態依存=#1 地雷=直接触らない。既存トリガに軽い entries を渡すだけ。
- 独立 tick は `if (!INLINE_PASSIVE)` ブロック内(initPopup 末尾 ~21290)。lid 解決は ①自タブ &lv=(INLINE_OWN_WATCH_URL)
  → ②snapshot.liveId → ③watchPopupLastPaintedLiveId の順(複数配信で揺れない)。
- 軽い源の storage は version 必須: nls_csummary_/panel_summary は { v:1, liveId, recordedCount, recent:[] } が
  isCommentSummary を通る最小形(v 抜けだと弾かれる=実機テストで踏んだ)。コメント行は text フィールド必須。
- max-lines ラチェット(eslint.config.js): popup-entry.js 現在 21539。行を足したら現値+εに上げ根拠コメント併記。
- dist 差分は push hook の NL_BUILD_ID だけ変わる=実コード差分が無ければ捨ててよい。
- verify は `npm run verify:cc`(ハング回避)。新 lib 追加で feature-map/tree-map drift→`npm run feature-map && tree-map
  && site-health` 再生成してコミットに含める。新 storage read で feature-map の「storage 断線」→ scripts/feature-map.mjs
  の STORAGE_DISCONNECT_BASELINE に fn:キー追記(producer=content の意図的分離)。changelog summary は35字以内。

## 6. 実機検証の確立手法(超重要・このセッションで確立)
ユーザーの配信に触れず実拡張ランタイムを検証できる正攻法:
1. `npm run build` → chrome-devtools MCP の `install_extension('...repo.../extension')`(C:\nicolive-ext は workspace 外で不可)。
2. `list_extensions` で v0.1.99x Enabled 確認。
3. `new_page('chrome-extension://<id>/popup.html?inline=1&lv=lvXXXX')`(②は &dock=liveview 追加)。
4. service worker(sw-N)or page で `chrome.storage.local.set` で生データ seed → `evaluate_script` で DOM/probe 観測。
5. 終わったら `uninstall_extension`。chrome-devtools は別 Chrome=ユーザーの配信タブに無関係。
※拡張IDは毎回同じ: edpellgokebgpjboflekdmmlnjgajnfn(再install で変わり得る・list_extensions で確認)。

## 7. 会議ハーネス(複雑な真因/設計で使う)
正本= C:\Users\info\OneDrive\デスクトップ\Resilio\github\COUNCIL-HOWTO.md を読んで手順どおり。
汎用会議= `node scripts/meeting.mjs council/質問.txt --out council/答え.json`(動的ルーティング既定・重要お題は
COUNCIL_CRITICS=2)。結果は司令塔(Claude)が実コードで裏取りして1案に統合。今回 parity 診断設計で実施
(council/parity-diagnose-SYNTHESIS.md)。会議案の地雷(passive が storage 書く案)を実コードで補正した実績あり。

## 8. 開発フロー(AGENTS.md §12.5)
1変更=patch 1つ。version は package.json/extension/manifest.json/src/lib/changelog.js の三者同期(verify:bump が verify:cc に内包)。
実装→verify:cc→copy:ext→commit→(master 直push or ff-only merge)→copy:ext 再同期。
ユーザー反映3手順= pull は司令塔代行・ユーザーは「拡張🔄リロード→watch F5」。③純Web は Vercel デプロイ別途要。
