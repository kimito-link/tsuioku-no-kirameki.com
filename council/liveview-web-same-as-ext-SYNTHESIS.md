# SYNTHESIS: WEB URL(純Web公開)を拡張内プレビューと「同じ画面」にする

会議 2026-06-26(council/liveview-web-same-as-ext-question.txt)。発散役+爆速役一致。
世界調査(OSS世界調査・URL裏取り済)= StreamElements onWidgetLoad 型(全 state を1JSONで丸ごと・
DOMでなく state・tunnel/CRDT/DOM-mirror は不採用)が正攻法。このプロジェクトは既に chrome シムで
本物 popup-entry を純Webでも動かしている=描画コードは在る。足りないのは【データ(鏡)】だけ。

## 裁定
### A(不足レーンの鏡を足す・最重要)
純Web空欄の真因= publishNorthStarMirror(popup-entry.js:5473)→buildNorthStarMirrorSnapshot が
`{ liveId, contributionRanking }` だけを KEY_NORTH_STAR_MIRROR に publish。広告/イベントを含めていない。
→ **buildNorthStarMirrorSnapshot を拡張して adRanking(広告ランキング)を鏡に足す**。
   popup が既に描画用に持っている rows(再計算しない)を publishNorthStarMirror の input に渡すだけ。
   - 広告ランキング: popup が adRanking レーン描画に使う rows(nls_nicoad_api_ranking_<lid> 由来・
     officialDomRankingRowsToStripRooms を通す前の rows)を input.adRanking で渡す。純Web側は
     app/live-view.js の paintNorthStarMirror を adRanking 対応に拡張(本物 lib 再利用・似せて自作しない)。
   - イベント現在順位/累計スコア: ndgrValue や iframe 由来(診断 iframe_unrendered/no_event)。
     純Webで出せる値(順位の数値・スコア)があれば鏡に持つ。出せない(iframe必須)なら純Webでも畳む
     (拡張内 passive で v0.1.951 が畳んだのと同じ扱い=死にレーンにしない)。
   ★「1個ずつ自作で足す」のではない。popup が既に持つ rows を鏡に積む=今あるものを使う(星野ロミ理論)。

### B(集約スナップショット化)
**不要**。現状 status-entry.js:1001 で laneMirror/statCardsMirror/northStarMirror/topSupporters を
1つの jsonBlob に同梱して1 POST=実質1スナップショット。鮮度を1キーに統一する追加価値は薄い。
northStarMirror に adRanking を足せば、その1キーで貢献度+広告が同一鮮度になる(イベント系も同様)。

### C(PC定期再送信・別 PR)
StreamElements の「N秒ごとに最新を PUT」に倣う。status ページが開いている間だけ、
_lastRenderedBundle.jsonBlob(status の2秒ループが既に組み立て済=新規の重い計算ゼロ)を間引いて(15-30秒)
uploadStatusSnapshot で再 POST。ユーザーが「PCが定期再送信する仕組みを作る」を既に選択済(別件)。
→ 今回の「同じ画面(A)」を先に入れ、C は続けて or 同時に。送信のみ・描画/refresh は触らない・in-flight ガード・
   jsonBlob signature 同一ならスキップ・document.hidden スキップ・status 閉じれば止まる。

### D(サイズ)
広告/イベントは cap 10件程度=小。現状 jsonBlob ~131KB、laneMirror に 512KB 二段 cap ガードあり。
adRanking 追加でも数KB増=512KB 余裕。Upstash 明示上限なし。問題なし。

## PR 分割
- **PR1(本命・同じ画面)**: buildNorthStarMirrorSnapshot に adRanking を足す + publishNorthStarMirror の input に
  popup の adRanking rows を渡す + app/live-view.js の paintNorthStarMirror を adRanking 描画対応に拡張。
  イベント系は出せる値があれば足す/無ければ畳む。→ 純Webに広告ランキング(+可能ならイベント)が出る。
- **PR2(定期再送信)**: status が開いている間 jsonBlob を間引いて再 POST(C)。→ 純Webが古いまま止まらない。

## 制約(触らない)
- 拡張内プレビュー(いい感じに動作)の描画は壊さない。popup の refresh()/paint の read path 不触(v0.1.948地雷)。
- content-entry.js(記録の心臓部)不触。
- ★「1個ずつ自作で足す」禁止=popup が既に持つ rows・本物 lib・本物鏡を使う(似せて自作しない)。
- DOM丸ごと方式禁止(重さ却下済)。state(JSON)を送る。

## 実機検証手順
1. status(診断)を一度開く→拡張内プレビューを開く(鏡が publish される)。
2. 「🌐このURLをWEBでも公開する」→純Web /live-view?v=token を別端末/スマホで開く。
3. ★純Webに、拡張内と同じ全レーン(配信者カード・上段3カード・応援レーン・応援者ランキング・ギフト貢献度・
   ★広告ランキング)が出る。イベント系は出る値があれば出る/無ければ畳む(空欄の死にレーンにしない)。
4. (PR2 後)配信が進むと純Webも追従して更新される(古いまま止まらない)。
5. 実機で 3〜4 を確認するまで「直った」と言わない。
