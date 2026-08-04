# 会場モード=てこの原理(inline iframe を全画面化するだけ) 設計会議 — 司令塔の収束 (2026-06-22)

質問: `council/venue-lever-iframe-question.txt` / 生回答: `council/venue-lever-iframe-answers.json`
正本: `reference_venue_is_popup_panel_clone.md`(未作成・2026-08-04時点で存在しない)

## ★前回会議(venue-is-popup-clone)を覆す
前回は「会場ダイアログに popup 段組みを paint 関数で再構築=独自席撤去」=【中〜大工事】と結論。だがユーザー「星野ロミなら大工事でなく、てこの原理で最小実装」。実コードで【watch ページに既に inline パネル iframe(=popup.html 本物)が動いている】を発見=作り直す必要なし。前回案は破棄。

## 会議の結果(routed・design・3体回答)
- groq/qwen3-32b(批判)・local/gemma4(統括)・nvidia/qwen3.5(発散) が回答。groq/llama-3.3-70b は HTTP 429。
- **3体が完全一致**: 会場モード=iframe を移設せず `#nls-inline-popup-host` を CSS で全画面前面化するだけ(DOM移動も再ロードもしない視覚的トリック)。独自席はフラグで display:none。キャラ演出・VOICEVOX は既存流用。

## ★司令塔が実コードで裏取りした決定的事実
- inline iframe の src = `chrome.runtime.getURL('popup.html')`(content-entry.js:3488)=【別オリジン chrome-extension:// 】。親(content script=live.nicovideo.jp)から iframe 内 DOM へ【同一オリジンポリシーで直接アクセス不可】。→ 吹き出しは postMessage で座標をやり取りするのが唯一の正解(3体の見立て通り・直接 getBoundingClientRect は不可)。
- nvidia の核心指摘=appendChild で iframe を【移動すると別ドキュメントコンテキストへの移動で内部状態(VOICEVOX キュー/アニメ/スクロール)がリセット or 再ロード】=動いてるものを壊す=星野ロミ思想に反する。よって【移動せず CSS で見た目だけ全画面化】が正解(状態を完全保持)。
- 批判役の指摘=全画面化が通常 inline 表示と競合→会場モードフラグでクラス出し入れ(既存 display 制御あり)で解決。
- inline パネルは記録の主要機能=壊すと致命的→iframe 本体は触らず CSS クラスだけ・独自席撤去は段階的(フラグ→最後に削除)。

## 収束した1案(てこの原理・最小実装)
**会場モード = 既に動いている inline パネル iframe(popup.html 本物)を CSS で全画面前面化し、既存キャラ演出を流用、吹き出しは postMessage で重ねる。新規コード極小・iframe は再ロードしない。**

### PR順(各段で実機確認・最小ブラスト半径)
- **PR1**: 会場ボタンで `#nls-inline-popup-host` に `venue-mode` クラス付与→CSS で position:fixed; inset:0; z-index 全画面化(iframe 再ロードなし=状態保持)。独自席(venueBar buildVenueTiers/renderSeats)は display:none フラグで止める(削除しない)。実機で「popup の中身がそっくり全画面で出る」確認。
- **PR2**: 既存キャラローディング演出(ensureInlineLoadingPlaceholder・りんく/こん太/たぬ姉)を会場開始演出に流用+その間に VOICEVOX ウォームアップ(voicevoxClient)。演出は新規でなく流用。
- **PR3**: 吹き出し=iframe 内 popup(popup.html)が「誰がコメント・iframe内座標」を postMessage で親へ送出→親オーバーレイ層に iframe 座標基準で吹き出しを重ねる。別オリジンゆえ postMessage 必須。スクロール/リサイズ追従は rAF or 固定表示。
- **PR4**: 独自席(buildVenueTiers/createSeatNode/renderSeats)を撤去。群衆/ヒート演出の要否も判断(popup グリッドが役割を担うので捨ててよい可能性)。

## 注意
- iframe 本体・popup.html は触らず CSS クラスと postMessage だけ=記録の主要機能(inline パネル)を壊さない。
- content.js/venue.js 二重バンドル整合。
- popup.html 側に postMessage 送出(吹き出し用座標)を足すのは PR3 で(popup-entry に最小フック)。

## ★PR1 実装の確定接点(実コードで特定済み・次セッションはここから書ける)
- inline host = `id='nls-inline-popup-host'`(content-entry.js:2663 INLINE_POPUP_HOST_ID)。`ensureInlinePopupHost()`(content-entry.js:3577)が生成/取得し iframe(popup.html=chrome.runtime.getURL('popup.html') content-entry.js:3488)を保証。singleton=nlsInlinePopupHostSingleton。host は position:relative; width:100%; display:none/opacity で出し入れ(content-entry.js:2965 CSS)。
- 会場 toggle = venueBar.js mountVenueBarButton(1302)の toggle→setOpen(3231)。setOpen(true)で renderResidents/startAggregation/renderSeats(独自席)を開く。
- **PR1 でやること**: setOpen(true)時に【独自 stage を見せる代わりに inline host を全画面化】+独自席描画(renderResidents/startAggregation/renderSeats)を会場モードフラグで止める。setOpen(false)で戻す。
  - ★層の問題=inline host の【開閉(autoshow/placement/iframe ライフサイクル)は content-entry が握る】。venueBar が勝手に全画面化しても inline が閉じてたら空。→最小接点案: content-entry に「会場全画面トグル」関数を1つ公開(window.__nls 名前空間 or messageEvent)し、それが(1)inline パネルを確実に開く(既存の inline 表示経路を再利用)(2)host に `nls-venue-fullscreen` クラス付与。venueBar の toggle はそれを呼ぶだけ。
  - 全画面 CSS(content-entry の inline host CSS に追記): `#nls-inline-popup-host.nls-venue-fullscreen { position:fixed; inset:0; width:100vw; height:100vh; z-index:2147483000; }` + iframe を 100%×100%。iframe は再ロードしない(クラス付与だけ=状態保持)。
- ⚠content-entry.js は巨大・記録の主要機能(inline パネル)=壊すと致命的。inline の開閉ロジックを正確に理解してから書く。実機で「会場ボタン→popup の中身が全画面で出る・閉じる→元の inline 表示に戻る・記録は止まらない」を必ず確認。
- ⚠会場ボタンの出現条件: content-entry.js:12953 付近 isWatchInlinePanelTopFrame・autoshow OFF 既定ではこん太を1回押す必要(MEMORY 既知)。

## 次セッションへの引き継ぎ
このセッションは会場の正体取り違えで非常に長くなった。設計は確定(この SYNTHESIS+reference_venue_is_popup_panel_clone.md)。PR1 から上記接点で実装する。content-entry(記録の心臓部)を触るのでクリーンな状態で慎重に。

[[feedback_self_verifying_loop]] [[feedback_meeting_room_for_complex_tasks]] [[feedback_hoshinoromi_no_dead_links]]
