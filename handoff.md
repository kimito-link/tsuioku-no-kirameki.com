<!-- claude-projects-attribution: {"github_login":"kimito-link"} -->
_Requested by **りんく** · [project thread](https://claude.ai/code/project/chan_0156DiwJETNymYoDji7fmUqo?thread=cmsg_0156DiwJETNymYoDji7fmUqo19628oFJc2WRRV7rgfqxyr)_

# Handoff — 応援の数字を全サービスで「いちばん知りたい順」に (v0.1.2208)

STATUS: PR #708（feat/support-summary-all-platforms）。レビューの指摘で v0.1.2208 に修正し、ローカル commit 済み・push 待ち（マージしない）
FIX_708（v0.1.2208・2026-11-24）:
- origin/master（f34edf68e・#706 #707）を取り込み。ぶつかった docs/feature-sitemap.* は手で直さず npm run tree-map で作り直した（ぶつかったままの状態で作ると件数が3重に数えられたので、解消後にもう一度作り直してマージのコミットに入れた）。
- ツイキャスのチップのラベル「有料アイテム」→「アイテム（記録）」（拡張の画面に「有料」を出さない。key は paidItems・title の「無料のお茶は数えていません。」はそのまま）。
- マーケ「この配信の記録」のギフト名のカード「出ていた名前（記録）」→「ギフトの内訳（記録・多い順）」。名前がそのサービスの決まった呼び名（view.giftWord または「ギフト」）1種類だけのときはカードを出さない（ミクチャは常に「ギフト」で、「ギフトの件数（記録）」と重なるため）。試験を2つ足した。
- 版 0.1.2208（manifest・package・changelog（0.1.2207 の項目を 0.1.2208 として、上の2つを1行ずつ足した。0.1.2207 は出していないので項目は1つにまとめた）・LP の index.html）。
ROOT_CAUSE: 推定額はどのサービスも記録→tallySupportItems→supportChips/panelExtraChips→横欄・会場、マーケまでつながっていたが、(1) 0 のときチップごと消えていた（YouTube はスパチャ 0 で欄ごと消えた）、(2) SHOWROOM・ふわっちは supportChips に枝が無く応援の数が1つも出なかった、(3) ラベルが3種類（推定（視聴者の購入額）/ 推定（視聴者の消費）/ チケット基準の推定）あった、(4) 公式の数が推定より先に並んでいた。マーケは推定が KPI にしか無く、ギフト名が出た順の上位6、ミクチャに「コインの単位は未確認です」が残り、前回比がコメント数だけだった。
FILES_CHANGED: src/lib/estimatedViewerSpend.js, src/lib/platform/platformMetrics.js, src/lib/platform/platformMetricChrome.js, src/lib/platform/marketingPlatformChapters.js, src/lib/platform/marketingPlatformPlan.js, src/lib/marketingChartsHtml.js, extension-youtube/src/ytGiftToNico.js, 試験（estimatedViewerSpend / platformMetrics / platformMetricChrome / marketingPlatformPlan / marketingChartsHtml / ytGiftToNico / 新規 supportSummaryAllPlatforms.test.js・マーケのスナップショット3つ・e2e の mixch/tiktok/showroom/twitcasting）、版4か所（extension/manifest.json・package.json・src/lib/changelog.js(+changelog-archive.js)・tsuioku-no-kirameki/index.html）、extension/dist/*・app/dist/live-view.js・extension/background.js・.dist-fingerprint.json、docs の地図（code-tree / feature-sitemap / repo-tree-map）、handoff.md
CHANGES:
- 集計（tallySupportItems・既存のループ1回のまま）: paidGiftCount / paidGiftUnits（SRPT・WWITEM・MXCOIN・TTCOIN・ツイキャスの有料アイテム。無料のお茶は数えない）、nativeTotals（SRPT・WWITEM・MXCOIN・TTCOIN の superchat 合計）、fanCount（mx_fan）、followCount（follow）、hostCount / hostViewers（kk_host）を足した。
- 横欄・会場のチップ: 全サービス「推定 → そのサービスの単位の合計 → 件数 → 反応 → 公式の数 → 数え始め」の順（panelExtraChips で並べ替え。会場の帯は同じ関数なので自動で同じ順）。横欄の DOM は順が違うときだけ並べ直す（同じなら触らない＝見張りのループを作らない）。
- 推定が 0 のとき（ready 済み・式のある youtube / twitch / kick / twitcasting / mixch / tiktok）は ¥0 ではなく「推定（視聴者の購入額） —」（placeholder・title「このPCの記録に、値段が公式で確認できる応援が来たら表示します。」）。まだ数えていないときは今までどおり出さない。ニコ生は変えていない（0 のときは出さない）。
- 円のラベルを「推定（視聴者の購入額）」1つにそろえた。ツイキャスのチケット基準は title / 注記の文に移し、お茶爆の pt は「お茶爆の消費pt（推定）」（key estimatedViewerConsumption）。
- 新しいチップは単位を数のすぐ後ろに付ける（例「60コイン」「4件」・officialChips と同じ。横欄で単位が別の行に割れるのを本物のページで見つけて直した）。
- YouTube: superchatWhenPositive はスパチャの欄だけに効く。メンバー加入 n人 / メンバーギフト n件（1以上のとき）。Twitch / Kick: 推定の title に「Bits / Kicks は円にしていません」。Kick にホスト（回数・title に人数）。ツイキャス: 有料アイテム n件。ミクチャ / TikTok: コイン（記録）・ギフト n件・ファン登録 / フォロー（1以上）。SHOWROOM: ギフト（記録）n pt・ギフト n件（推定なし・title「SHOWROOM のギフトの pt です。円にはしていません。」）。ふわっち: アイテム（記録）n個・n件（推定なし）。
- マーケ（他サービス）: 「この配信の記録」の先頭に推定のカード（出典を mkt-note）・0 のときは「—」と「この記録には、値段が公式で確認できる応援がありません。」。KPI の推定カードは他サービスでは出さない（ニコ生は KPI のまま）。ギフト名は個数の多い順の上位10・単位の合計つき（例「バラ ×120（1,200 コイン）」）。「ギフトの件数（記録）」のカードを足した。ミクチャの「コインの単位は未確認です」を削除（mixchUnitNote を外した）。前回までの配信との比較（今回＋同じサービスの直近4配信・同じ式・ytKind の無い過去配信は「—」・slimForHeavyExport のときは計算しない）。章の順を「表紙 → この配信の記録 → 応援してくれた人の流れ → この配信の山 → KPI」に（目次も同じ順）。
- estimateViewerSpendFromComments(platformId, comments) を estimatedViewerSpend.js に足し、マーケの KPI・記録・前回比で同じ式を使う。
- ytGiftToNico.js: 円の通貨は jpyPerCurrencyUnit()（ECB 2026-11-20）を先に使い、無い通貨（TWD 等）と数の単位（Bits 等=1）だけ従来の表。★挙動の差: 外国通貨のスパチャの順位の pt が少し変わる（例 USD 10 → 1,500pt が 1,586pt）。
- 権限・監視・タイマー・ネットワーク取得・価格・関所・無料範囲は変えていない。拡張の画面に紹介・有料・LINE・サポーター・手取りの言葉は足していない。円換算は ESTIMATED_VIEWER_SPEND_RATES のものだけ。
- 振る舞いが変わって直した既存の期待値:
  - platformMetrics.test.js「スパチャが無い YouTube は、0円の枠を出さない」→ 0円の枠は出さず「推定 —」だけ出す（ラベル列に 推定（視聴者の購入額）が増えた）
  - platformMetrics.test.js「YouTube の合計は円を先に…」→ メンバー加入・メンバーギフトのチップが出る（以前は出ないことを確認していた）
  - platformMetrics.test.js「Twitch は Bits・サブスク…」「Kick は Kicks・サブスク…」→ 推定が先頭、Kick の末尾にホスト
  - platformMetricChrome.test.js「YouTube ではニコ生のチップを隠し…」→ members のチップが出る（以前は null）・並びが 推定→スパチャ→メンバー加入
  - estimatedViewerSpend.test.js → ツイキャスの円は「チケット基準の推定」→「推定（視聴者の購入額）」、pt は「推定（視聴者の消費）」→「お茶爆の消費pt（推定）」、ミクチャ / TikTok は「推定（視聴者の消費）」→「推定（視聴者の購入額）」、Bits だけ / Kicks だけは「推定チップなし」→「推定 —（placeholder）」
  - marketingPlatformPlan.test.js → ミクチャの「コインの単位は未確認です」は出ない
  - ytGiftToNico.test.js → USD 10 の pt が 1,500 → 1,586
  - マーケのスナップショット（youtube / twitch / abema）→ 記録の章が流れの章の前・推定は記録の章の先頭・KPI に推定なし
  - e2e twitcasting / mixch / tiktok → ラベルが統一ラベルに
TESTS_RUN: npm test / npm run lint / npm run typecheck / npm run verify:bump / npm run build → npm run check:dist-fresh / npm run tree-map:check / npm run layer-map:check / npm run check:layer / verify:extension（絶対パス）/ playwright e2e 8本（youtube-concurrent-viewers・twitch・kick・twitcasting・mixch・tiktok・showroom・whowatch-recording）/ 一時プロファイルでの本物のページ確認
TEST_RESULT_2208: npm test 1,377 files / 15,823 passed（3 skipped・6 todo）、lint・typecheck 0 errors、verify:bump OK（0.1.2208）、build → check:dist-fresh OK、tree-map:check / layer-map:check / check:layer OK、verify キット（絶対パス）合格。e2e は8本を続けて回すと「記録が0行」（記録の段階・今回の変更より前）で落ちる試験が回ごとに変わった（1〜4本・単独では合格する回と落ちる回がある）。同じ8本を今の master（f34edf68e）で回しても mixch が同じ「記録が0行」で落ちた。この時の PC は CPU 61%・chrome/node が173個で混んでいた。今回足したチップやラベルのアサーション（ツイキャスの「アイテム（記録）」・ミクチャ/TikTok/SHOWROOM のチップ）まで届いた回は落ちていない。CI の e2e の結果で確かめるのがよい。
TEST_RESULT_2207: （単位の修正後に全部やり直した結果）npm test 1,377 files / 15,821 passed（3 skipped・6 todo）、lint 0 errors（既存の warning 2件は venueBubbleVoiceSync.sim.test.js）、typecheck 0 errors、verify:bump 全7ステップ OK（0.1.2207）、check:dist-fresh OK、tree-map:check / layer-map:check / check:layer OK、verify:extension 合格（全画面・全差し込み先）、e2e 8本 11試験すべて合格（--workers=1・修正の前後で2回）。★並列で回した1回目は twitch と twitcasting が「記録が0行」で落ち、直列の2回目は別の3試験が落ちたが、どれも記録が届く前の段階で、単独・直列の3回目ではすべて合格（master 660d494e6 の twitch 単独も合格）。今回足したチップのアサーションまで届いた回は落ちていない。
REAL_PAGE_CHECK: 一時プロファイルの Chromium（普段の Chrome には触れていない）で本物の配信を開き、横欄・会場の帯・マーケの「この配信の記録」を撮った（スクショは手元の作業フォルダ・コミットしていない）。
  - Twitch（indegnasen0706・視聴者 14,000 人台）: サブが来る前は「推定（視聴者の購入額）—」→ Bits 0 → サブスク 0人 → ギフトサブ 0人 → レイド 0回 → 数え始め。継続サブが1件来た回は「約¥792」（Tier1 $4.99）。マーケの記録の章も先頭に約¥792と出典。
  - ミクチャ（u/17424506）: 推定 約¥72 → コイン（記録）60コイン → ギフト 4件 → 公式のレベル・ファン・ガチファン・ライバーランクpt・イベント順位。マーケは推定 → コイン → ギフト名 → ページの数 → 出典の注記。
  - SHOWROOM（iseshuri）: ギフト（記録）2,896pt → ギフト 33件 → イベント順位 5位・イベントpt・目標Lv13。推定は出ない。マーケのギフト名は個数の多い順（ぷっくり13 ×65（650 pt）…）。
  - TikTok はログインしていない一覧から配信ページを自動で選べず未確認（ミクチャで代えた。TikTok は e2e で確認）。前回比の表は一時プロファイルに過去の配信が無いので本物のページでは未確認（単体試験で確認）。
REMAINING_RISKS: e2e が並列だと記録の段階で不安定（今回の変更より前の段階）。本物のページで、ギフトが来ている配信の推定の値そのものは配信次第。
NEXT_ACTION: りんくさんが PowerShell で push する（コマンドはスレッドに出してある）。CI の緑を確認してから、りんくさんの OK のあとマージ。
LAST_WORKED_ON: 2026-11-24
WORKED_BY: Claude Code（りんくさんの PC・Remote Control）
MACHINE_NOTES: worktree=..\_worktrees\tsuioku-no-kirameki.com\support-summary-all（branch: feat/support-summary-all-platforms, base: master 660d494e6）。node_modules は本体へのジャンクション。本体チェックアウトの未コミット変更には触れていない。

## NEEDS_JUDGMENT（司令塔が判断する。ここを自動で直してはいけない）

1. 認証エラー: sambanova/deepseek-v3.1: 実疎通4日連続失敗（認証エラー(キー/権限の問題・人が直すまで回復しない)・初回 2026-09-28）。応答: Incorrect API key  → キーの値より先に**変数名の取り違え**を疑う（2026-09-16の真因）。

## この日課がやること・やらないこと

**やる**: env充足の確認 / scoutの実行 / 日報の異常判定 / この handoff.md の更新。

**やらない**: LINEUPの追加・撤去 / weightの変更 / roleOfの編集 / トークンの再発行。
これらは「トークンは有効なのにWorkers AIだけ401」のような紛らわしい状態の切り分けを伴い、
自動化すると**間違った修理を自動実行する**（2026-09-16に実際に踏みかけた）。

正本: `scripts/council-daily.mjs` の冒頭コメント / `web-ios-android/docs/ai-workflows/MULTI-BRAIN-HOWTO.md`

<!-- COMMANDER-NOTES:BEGIN (council-daily はこの区間を上書きしない) -->

## ★SambaNova 401 は調査済み（再調査しないこと・2026-09-30）

**結論: キーの値そのものが失効している。変数名の取り違えではない。**
（日報の NEEDS_JUDGMENT は毎回「変数名の取り違えを疑う」と出すが、それは否定済み）

| 対象 | 実測 |
|---|---|
| カタログ `GET /v1/models` | **200・7件在籍**（読み取りは通る） |
| DeepSeek-V3.1（推論） | 401 `Incorrect API key provided: 10aa54*****a241.` |
| gemma-4-31B-it / MiniMax-M2.7 | **401**（9/26まで200を返していた2体も落ちた） |
| gpt-oss-120b | 401 |

＝**推論権限だけが失効**。`SAMBANOVA_API_KEY` に36文字・先頭`10aa54`が入っており、
401のエラー文の伏せ字と一致＝**キーは正しく渡っている**。

**人がやること（急ぎではない）**:
**https://cloud.sambanova.ai/apis** で再発行し `SAMBANOVA_API_KEY` を差し替えるだけ。
**LINEUP側の変更は不要**。この枠は weight4（予備）。
★LINEUPからこの行を消さないこと（再発行すれば同じ行のまま復活する）。

★2026-10-12 更新（この節の古い数字を実測で訂正）:
 旧文は「critic は groq + nvidia + cloudflare の3体・3プロバイダが生存／会議は19体」。
 実測では **critic は5席・sambanova(401)を除いても4体4プロバイダが生存**
 （groq / cloudflare / nvidia / **mistral**）。magistral-small を「死んでいる」側に
 数えていたのが誤りで、**429 は容量上限＝復帰する**
 （同一キーで codestral が **200/414ms**。2026-10-12 実測）。
 会議は **18体**（10-12 に openrouter/ling を有料化で撤去）。

## ★ling は撤去済み・後継は「居ない」が正しい状態（2026-10-12）

`openrouter/ling-3.0-flash`（`-sante:free`）が**有料化で消滅**
（`:free` 無しの有料版だけがカタログに残る＝10-01 に `-fin:free` で踏んだのと同型。
**同系譜への逃げは2回で尽きた**）。
★**席は空けたまま**にしている。OpenRouter の `:free` 15件を全件 roleOf にかけた結果、
lead を返すのは `nvidia/nemotron-3-ultra-550b-a55b:free` だけ＝**既に座っている**ため
（埋められない席を埋めたふりをしない）。
★lead の頭脳は **2系譜のまま維持**（nemotron=NVIDIA 2経路／magistral-medium=Mistral 別系譜）。
★再採用の条件: roleOf が lead を返す**別系譜**の `:free` が現れたらその席に入れる。

## ★worktree で日課を回しても state が分裂しなくなった（2026-10-12）

`council-scout/` の置き場所を **常に本体のチェックアウト**へ固定した
（`scripts/lib/council-scout-dir.mjs`）。**もう手でコピーして戻す必要はない。**
実損: 新しい worktree は `state.json`（gitignore）を持たないため「初回実行」と誤判定し、
**連続失敗日数が 4→1 にリセット**された（警告しきい値が `>=2` なので**本物の障害が
警告されなくなる**）。10-06 は逆向き（本体へ戻し忘れで巻き戻り）で踏んでおり、
**手順の記憶に頼る対策が実際に外れた**ので置き場所自体を直した。

<!-- COMMANDER-NOTES:END -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
