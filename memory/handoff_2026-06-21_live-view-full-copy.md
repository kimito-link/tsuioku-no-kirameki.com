# 引き継ぎ: 2026-06-21 応援ライブビューを popup と「完全コピー」にする(継続中)

> 新チャットへ。会話全文不要。CLAUDE.md / AGENTS.md / memory/MEMORY.md + 本ファイルで再開可能。
> 司令塔 Claude Code 本体が読む前提。コンテキスト満杯で引き継ぎ。

## ⚠️ 最初に確認(git 状態)
- **HEAD = origin/master = ddbd35a1 = v0.1.879(push済・全部 safe)**。未コミットの自分の変更は無い。
  - **v0.1.879 で公式値レーン(北極星=貢献度/広告ランキング)を装飾込みで完全コピー済**(MEMORY.md 先頭参照)。
    DOM/CSS は popup.html から verbatim 抽出・描画は paintNorthStarStripInto(popup の paintTopSupportRankStyleIntoElement と同型)。
  - 旧: HEAD = cf765cd7 = v0.1.878。
- `scripts/meeting.mjs` は前セッション由来の untracked-WIP=**触らない・stage しない**(push 前に毎回
  `git stash push -- scripts/meeting.mjs` → rebase/push → `git stash pop` で退避するのが定石)。
- 検証は `npm run verify:cc`(全緑を確認してから commit)。push の build hook が dist の NL_BUILD_ID を変えるので
  push 後 `git checkout -- extension/dist/ app/dist/` で掃除。

## 🎯 ユーザーの現在の指示(最優先・継続タスク)
**「応援ライブビュー(live-view)を拡張ポップアップ(popup)と完全コピーにする。盛り上がりメーターは残してOK。
他の要素を全部やって」**

### 超重要な約束(ユーザーに2回叱られた・絶対守る)
**「完全コピー」=自分の美的判断・アレンジを一切入れない。** popup の実装(HTML生成関数+CSSクラス+純関数)を
探して **verbatim 移植**する。過去にやらかしたアレンジ(撤回済):
- 🥇🥈🥉絵文字(正=順位の丸番号)/ 独自ダーク色(正=popup のライト --nl-* 変数)/ 👤代用アイコン
  (正=本物アイコン解決+ゆっくり画像フォールバック)/ 匿名全部同じ画像(正=anonymousIdenticonDataUrl で色違い)
- popup に無いパネルを足す・popup にあるパネルを省く=どちらも NG。

## live-view の現状(どこまで popup を再現したか)
ファイル: `extension/live-view.html`(CSS+DOM 骨格) / `src/extension/live-view-entry.js`(描画) /
ビルド: build.mjs に target 追加済(`extension/dist/live-view.js`)。?lv=lvXXX で開く。chrome.storage を2秒購読+
IDB から自前集計(popup 非依存)。**データ取得は createLiveViewDataSource() に隔離(将来サーバー版へ移植境界)。**

### 再現済み(popup と一致):
- 配色=popup のライト変数 --nl-*(v0.1.877)
- 応援者ランキング=popup の純関数 `topSupportRankLineModels`(src/lib/topSupportRankStripLines.js)+ 同じ
  クラス nl-top-support-rank__line/place/thumb-wrap/thumb/count/name/id + 配信者タイル __caster*(v0.1.877)
- 匿名 identicon=`anonymousIdenticonDataUrl`(src/lib/anonymousIdenticon.js)を resolver に渡す(v0.1.878)
- りんく列=`categorizeUsersForThumbGrid`(src/lib/userThumbGrid.js)の numericIdUsers(v0.1.875)
- ギフト列=`buildGiftThrowerLaneEntries`(src/lib/userLaneMergeGiftThrowers.js)+ storage `nls_gift_users_<lv>`(v0.1.875)
- 統計カード(記録/来場/本家コメ/経過/広告pt/ギフトpt)=renderStatCards(v0.1.878)
- 応援者は live-view 自身が IDB(commentDb: openCommentDb/countCommentsForLive/readAllCommentsForLive)→
  aggregateMarketingReport→buildSupporterRanking で自前集計・15秒間引き(v0.1.876)=popup 開かなくても出る
- 盛り上がりメーター🔥(computeHeatLevel・src/lib/heatLevel.js)=ユーザーが残してOKと明言

## 🔲 次にやること(継続タスク)= popup に「あって live-view に無い/違う」要素を全部移植
**まず popup の全パネル構成を実コードで網羅リストアップしてから移植(憶測で作らない)。** 調べ方:
- popup の DOM 骨格=`extension/popup.html`(セクション一覧)
- popup の描画=`src/extension/popup-entry.js`(各レーン render 関数)
- Explore エージェントに「popup の全パネル(セクション)を上から順に列挙し、各パネルの①データ源(storage per-live
  キーか in-memory か)②描画関数③CSS クラス を報告。live-view で再現可能か(storage/IDB から読めるか)も判定」
  と投げるのが速い(過去2回これで正確に裏取りできた)。

### popup にあって live-view にまだ無い可能性が高いパネル(要確認):
- 公式値レーン(北極星レーン: 貢献度ランキング/広告ランキング/ギフト履歴/番組累計pt/イベントスコア/順位)
  = content の `giftDiagnostics.北極星レーン` 由来。storage 経由で読めるか要確認。
- 健全度パネル/総合判定(これは status の領分=live-view に要るかはユーザー意図次第。応援ビューには不要かも)
- イベントランキング(audition 💎)= storage `nls_audition_event_ranking_*`(auditionEventRankingApi.js)
- マーケ分析系(分速/ヘビー層/時間帯)= aggregateMarketingReport の戻りに既にある
- コメントが流れる(ライブ感)= comeview の tailStorageKey 読み(まだ未実装・ユーザーが昔欲しがった)

**判定基準**: 「応援を見る」live-view にふさわしいパネルを popup からそのまま移植。status 専用の診断系
(健全度/対処カード/AI共有)は live-view には入れない方が自然=ユーザーに1問だけ確認してもよい
(「公式値レーン(貢献度/広告ランキング等)も live-view に入れる?」)。ただし基本は「全部」指示なので
応援系(ランキング/レーン/統計/イベント順位)は入れる方向。

## 移植の型(これを守れば完全コピーになる)
1. popup の render 関数(例 renderTopSupportRankStrip)を読む→使っている**純関数**(lib)と**HTMLクラス**を特定
2. その純関数を live-view-entry.js に import して同じ入力で呼ぶ(データは storage/IDB から・無ければ案内)
3. popup.html の該当 CSS クラスを live-view.html に**verbatim コピー**(--nl-* 変数で揃う)
4. DOM は popup と同じクラス名で生成(createElement で・textContent 安全)
5. データが無いパネルは hidden(死にリンクにしない)

## 版運用(毎回)
1変更=patch 1つ。manifest/package を同じ版に・src/lib/changelog.js に1エントリ(summary 35字以内・items は
ユーザー向け平易文)。`npm run tree-map`(FEATURES 追加したら)→`npm run verify:cc` 全緑→明示パス stage→commit→
stash meeting→pull --rebase→push→stash pop→dist 掃除。MEMORY.md に1行。

## このセッションで push 済(参考)
v0.1.871 ライブビュー土台 / 872 応援者タイル / 873 配信者タイル / 874 配色一致 / 875 りんく列+ギフト列 /
876 popup 非依存の自前集計 / 877 アレンジ撤回(本物の純関数+HTML+CSS) / 878 identicon+統計カード。

## 反映3手順(push 報告のたびに併記)
pull → 拡張リロード(chrome://extensions・**トグルが青(ON)か必ず確認**=OFF だと古いまま) → watch/live-view タブ F5。
「読み込めない/古い」はトグル OFF or Chrome リロード固着が大半(reference_extension_reload_troubleshoot.md)。
