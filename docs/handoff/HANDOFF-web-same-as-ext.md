# 引き継ぎ: WEB URL(純Web公開)を拡張内プレビューと「同じ画面」にする

> このセッションは内部ツール文字列(invoke タグ)が本文に出て汚染されたため打ち切り。
> CLAUDE.md §2 に従い新チャットで再開すること。会話全文は貼らない。

## ゴール(ユーザー正本・星野ロミ理論)
- 「通常の応援ライブビューはいい感じなので、そのまま WEBサイトURLも同じものを出したい」
- 「現状のWEBを近づける(1個ずつレーンを足す)のはダメ。今あるものを使う。全部丸っとコピーすればいい」
- = 純Web /live-view を、拡張内プレビューと同じ全レーンにする。1個ずつ選別禁止=丸ごと。

## 確定している事実(実コード・世界調査で裏取り済み)
1. 純Web版 app/live-view.js は本物 popup-entry を chrome シムで動かしている=描画コードは純Webにも在る。
   足りないのは【データ(鏡)】だけ。
2. 純Webが今出せている: 配信者カード・上段3カード(statCardsMirror)・応援レーン(laneMirror)・
   応援者ランキング(topSupporters)・ギフト貢献度(northStarMirror.contributionRanking)。実機スクショ確認済。
3. 純Webが空欄: 広告ランキング・イベント現在順位・イベント累計スコア。
   真因= publishNorthStarMirror(popup-entry.js:5473)→buildNorthStarMirrorSnapshot が
   `{ liveId, contributionRanking }` だけ publish。広告/イベントを含めない。
4. ★広告/イベントの描画 state は popup の in-memory 変数 `_lastOfficialEventDomBundle`(popup-entry.js:6903)。
   代入は readOfficialEventDomBundleFromStorage(liveId)(7141)経由。
   - 広告ランキング: refreshNorthStarAdRankingLane(9618)が bundle.adContributionRanking を使う。
     bundle に無ければ storage `nls_nicoad_api_ranking_<lid>`(9681)直読み。
   - この bundle が「北極星系を丸ごと送る対象」の核心。中身(含むレーン)と読む storage キーは未確認(次の作業)。
5. 世界調査結論(URL裏取り済・council/liveview-web-same-as-ext-SYNTHESIS.md): StreamElements onWidgetLoad 型
   =全 state を1JSONで丸ごと送るのが正攻法。DOM丸ごとは重さで却下済(業界も不採用)。tunnel は PC生存依存で不可。
   CRDT/RxDB は読み取り専用視聴に過剰。Vercel+Upstash REST は SSE 不可=N秒ごとに最新を PUT が定石。
6. サーバ api/status.js は payload を丸ごと Upstash 保存(TTL7日・明示上限なし)。現状 jsonBlob ~131KB。
   laneMirror に 512KB 二段 cap ガードあり。
7. 別問題(既知): 純Web は PC が定期再送信しない=押した瞬間の1枚で止まる(「出た瞬間止まる」)。

## ★次にやるべきこと(丸ごとコピーの正しい実装)
- ❌「広告だけ足す」「イベントだけ足す」と1個ずつ選ぶのは禁止(ユーザーが何度も否定・私も今回踏んだ)。
- ✅ popup が描画に使う「確定済み state bundle を丸ごと」鏡にして送る:
  - 北極星系: `_lastOfficialEventDomBundle`(貢献度/広告/イベント全部入り)を丸ごと鏡へ。
    ★ただし bundle のサイズと、純Web側 paintNorthStarMirror がそれを受けて全レーン描けるか要確認。
  - 既存鏡: laneMirror / statCardsMirror / topSupporters は既に jsonBlob 同梱(継続)。
- 次の調査: (a)readOfficialEventDomBundleFromStorage が読む storage キー全部 (b)_lastOfficialEventDomBundle の
  全フィールド(adContributionRanking/eventCumulative/eventRank/programStats/mirrorHtml 等) (c)サイズ
  (d)app/live-view.js の paintNorthStarMirror(現在 contributionRanking のみ)を bundle 全体対応に拡張できるか。
- ★コメント全文(nls_comments_lv 等・数MB)は丸ごと送らない=描画済み state だけ(これは送る対象でない)。

## 会議結論(council/liveview-web-same-as-ext-SYNTHESIS.md)
- PR1(同じ画面): northStarMirror を adRanking 含む全レーンに拡張+純Web paintNorthStarMirror 拡張。
  ★ただしユーザー指摘で「1個ずつ足す」でなく「bundle 丸ごと」に方針修正すべき。SYNTHESIS の A は
  「adRanking を足す」と1個ずつ寄りなので、_lastOfficialEventDomBundle 丸ごと方式に読み替えること。
- PR2(定期再送信): status が開いている間 _lastRenderedBundle.jsonBlob を15-30秒間引いて再POST。
  送信のみ・refresh/paint 不触・in-flight ガード・signature 同一スキップ・document.hidden スキップ。

## 制約(触らない・地雷マップ)
- popup の refresh()/paint の read path は絶対触らない(v0.1.948 で2回却下=read cache/丸ごとHTML鏡で実機却下)。
- content-entry.js(記録の心臓部)不触。
- 拡張内プレビュー(v0.1.951 でいい感じに動作中)を壊さない。
- DOM丸ごと方式禁止(.nl-main を毎paint sanitize で重さ却下済 v0.1.948)。state(JSON)を送る。
- 「1個ずつ自作で足す/近づける」禁止。本物 lib・本物鏡・本物 state を丸ごと使う(似せて自作しない)。
- サブエージェント(Agent ツール)はこのセッションで2回続けて実行されず止まった=新チャットでも不安定なら直接 Grep/Read で調べる。

## 直近の完了済み(master push 済・実機確認はユーザー)
- v0.1.948: status から応援レーン鏡・数字カード鏡を撤去(軽量化)。
- v0.1.949: 応援プレビューを裏タブで一時停止(診断との storage 競合解消)。
- v0.1.950: 応援プレビュー passive の上段3カードを即表示(panel_summary read・onChanged 駆動)。
- v0.1.951: 応援プレビュー passive に応援レーン(鏡)+貢献度/広告ランキング表示
  (北極星ギフト履歴を passive で畳む collapseNorthStarGiftHistoryLaneForPassive +
   応援レーン鏡 applyLaneMirrorForPassive + getStoryUserLaneEls 切り出し)。実機で全レーン出た(スクショ確認済)。
- ★これらは「拡張内プレビュー」の話。今回の「WEB URL(純Web)を同じに」はまだ未実装。

## 設計資料(council/)
- council/liveview-web-same-as-ext-question.txt と -SYNTHESIS.md(今回の本題)
- council/liveview-all-lanes-SYNTHESIS.md(v0.1.951 の根拠)
- council/liveview-regression-SYNTHESIS.md(v0.1.950 の根拠)
