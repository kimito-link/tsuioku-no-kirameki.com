# 会場モードで配信画面以外を覆い尽くす — 会議の収束(星野ロミ式・ハイブリッドマスキング)

会議: `council/venue-fill-canvas-answers.json`(2026-06-22・design・routed・成功4/4=全員回答)
お題: 会場モードを出したとき、配信画面(映像)以外の余白を全部覆い尽くす。見やすさ使いやすさ重視。

## 会議の全員一致(critic / lead / diverge / fast)
**「ハイブリッド・マスキング」**=
1. `.nlsb-stage-layout` の `width: min(1500px,100%)` 制限を撤廃 → 画面全幅(100vw)に会場(席・装飾)を広げる。
2. `.nlsb-stage` の背景を【透明】から【不透明の会場壁色】へ → 余白(本家コメント欄・サイドバー・空白)を物理的に埋める。
3. **配信映像の矩形だけ `mask`/`clip-path` で「穴」を開けて透過** → 映像は見え続ける(過去方針「映像にスモークをかけない」を矩形限定で維持)。
4. 映像座標は `player.frameTarget.rect`(content script が取得可)を使い、`ResizeObserver` + scroll で追従。

## critic / lead が指摘した穴(司令塔が対処)
- 全画面を席で埋めると【散らかる・重くなる】(DOM 肥大・描画負荷)。
- `clip-path`/mask の座標計算が【セーフエリア判定のバグ源】になりやすい(回帰リスク最大)。
- 本家コメント欄を覆うと見えなくなる → ただしユーザーは「配信画面じゃない部分」と明言=映像以外は覆ってよいのが自然な解釈。

## 司令塔のコード裏取り
- **会場(venueBar.js)は現在プレイヤー座標を取得していない**(getBoundingClientRect も frameTarget も無い)。中央セーフエリアは grid `minmax(0,1fr)` の比率で"だいたい"空けているだけ=実際の映像矩形とはズレる(実機スクショで映像は【左上】=会場の中央想定とズレている=穴を正確に開けるには座標取得が必須)。
- 会場が content から受け取る API は `onLiveComments` のみ(映像座標は未連携)。
- だが**会場も content script 世界**なので、content-entry の既存パターン(`document.querySelector('video').getBoundingClientRect()`・L3775/3994)を会場自身が呼べる=映像矩形取得は実装可能・新規メッセージ配線は不要。
- mask は CSS 一発(矩形穴)。座標追従は ResizeObserver + scroll/resize。思ったより小さいブラスト半径。

## 収束した1案(段階実装)

### 段階1(今回実装=主訴を確実に解決・全員一致案)
- **全幅化**: `.nlsb-stage-layout` の `width: min(1500px,100%); margin:0 auto` を `width:100%` に(席が画面端まで広がる)。
- **余白を会場壁で覆う+映像だけ穴**: `.nlsb-stage` の背景を不透明の会場壁(暗い縦グラデ)にし、`mask`(または radial/conic を使わず矩形 mask)で【映像矩形だけ透明】に。映像座標は会場が `querySelector('video').getBoundingClientRect()` で取得し CSS 変数(--nlsb-hole-left/top/width/height)で渡す。ResizeObserver + scroll/resize で追従(throttle で重くしない)。
- **散らからない担保**: 席は既存の visibleSeats 制限(selectStableVisibleMembers)をそのまま使う=全幅でも表示数は増やしすぎない。背景の壁は静的(描画負荷ゼロ)。映像の穴以外は「壁+下端の席」で、上部・左右の空きは会場色で埋まる(席で埋め尽くさない=星野ロミ『散らからない』)。
- **クリック透過の維持**: 穴(映像)部分は mask で視覚的に透明だが、pointer-events は別問題。会場の操作可能領域(席リンク等)は従来通り。映像クリックは穴部分が pointer-events:none で透過(中央セーフエリアの既存設計を踏襲しつつ、穴座標に追従)。
- **フォールバック**: 映像要素が見つからない/座標 0 のときは穴を作らず従来(背景透明)に戻す=壊さない。

### 段階2(将来・任意)
- 左右の壁に「本家コメントのシンクロ簡易表示」「応援メーター」を配置して情報密度を上げる(diverge 案)。座標追従が安定してから。

## 評価軸での確認
- ①没入感=余白が会場壁で埋まり映像だけ浮く→◎ ②映像を隠さない=mask で矩形だけ透過→◎(座標追従が要・フォールバックあり)
- ③見やすさ=席は visibleSeats 制限で散らからない・壁は静的=重くない→◎ ④回帰リスク=mask 座標バグが最大懸念→フォールバック+throttle で抑える
- ⑤星野ロミ=大胆(全画面会場)×摩擦ゼロ(自動・設定不要)×既存資産(席割り・video rect 取得パターン流用)→◎ ⑥画面幅=全幅化+mask は幅非依存→◎

## 実装メモ
- venueBar.js: stage-layout width 100% / stage 背景を不透明壁+mask / 映像矩形を取る関数(resolveVideoHoleRect)+ ResizeObserver/scroll throttle で CSS 変数更新。
- ⚠ユーザー過去方針「映像にスモークをかけない」は【映像矩形は穴=透明】で厳守(周りだけ覆う=方針の精神を守りつつ余白を埋める)。
