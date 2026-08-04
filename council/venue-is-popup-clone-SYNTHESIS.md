# 会場モード=popup パネルのコピペ 設計会議 — 司令塔の収束 (2026-06-22)

質問: `council/venue-is-popup-clone-question.txt` / 生回答: `council/venue-is-popup-clone-answers.json`
正本: [reference_venue_is_popup_panel_clone.md](../memory/reference_venue_is_popup_panel_clone.md)

## 会議の結果(routed・3体回答)
- groq/qwen3-32b(批判)・local/gemma4(統括)・nvidia/qwen3.5(発散) が回答。groq/llama-3.3-70b は HTTP 429。
- **3体一致**: 会場=「popup の DOM を物理コピー」でなく「同じ描画エンジン paintStoryUserLaneDomFilled を会場ダイアログ上で駆動し popup と同一のクラス・構造を生成」=本物の関数を会場で呼ぶ(=ユーザーの『コピペ=本物再利用』の正しい技術的実現)。

## ★司令塔の収束(採用する統合案)
1. **描画**: 会場ダイアログ内に popup と同じ段組み DOM(コンテナ)を作り、paintStoryUserLaneDomFilled + bucketStoryUserLanePicks + buildPersonTileEl + グリッド(renderUserRooms 相当)を会場が呼ぶ。
2. **独自席は【いきなり削除せずフラグで分岐】**(nvidia 案・破壊的変更を避け回帰リスク最小=過去に司令塔が壊しまくった反省)。buildVenueTiers/createSeatNode/renderSeats はフラグで止める→最後に撤去。
3. **CSS(qwen3-32b が最大リスクと指摘)**: popup.html 限定 CSS を会場に持ち込む問題=会場専用 `<style>` に popup と同一クラス定義を注入+会場コンテナに `isolation:isolate` で外部影響遮断。理想は共有 CSS lib 化。
4. **VOICEVOX 同期**: キャラ演出開始と同時に VOICEVOX ウォームアップ非同期発火→演出終了時 `Promise.race([voicevoxReady, timeout])` で判定→遅れたらキューに溜め準備完了後に読み上げ。待たせず「準備中」を可視化(既存 v0.1.770 ローディング演出を活用)。
5. **吹き出し**: 起点を seatAnchorEl(独自席)→popup タイルのアイコン要素へ。スクロール追従は IntersectionObserver/scroll 再計算。

## PR順(3体合意・各段で実機確認・最小ブラスト半径)
- **PR1**: 会場ダイアログに popup 段組みを描画(paint 関数再利用)+CSS 注入。独自席はフラグで止める(削除しない)。実機で「popup と同じ見た目が会場に出る」確認。
- **PR2**: キャラ演出中に VOICEVOX 準備(Promise.race 同期)。
- **PR3**: 吹き出しを popup アイコン基準に向け直す。
- **PR4**: 独自席を安全に撤去。

## 実装の足場(実コードで確認済み)
- paintStoryUserLaneDomFilled(src/extension/story/renderStoryUserLaneDom.js)=段組み描画の本体。popup の renderStoryUserLane(popup-entry.js:5114)は popup.html 固有 DOM($('sceneStoryUserLane...'))を集めて els とし buckets と共に paint へ渡すだけ。
- bucketStoryUserLanePicks(storyUserLaneBuckets.js)・buildPersonTileEl(personTileDom.js)・adLanePicksFromRooms(広告列)・renderUserRooms(グリッド・popup-entry.js:10703) も再利用対象。
- ⚠popup-entry.js の関数まるごとは chrome.tabs/scripting 依存で会場から呼べない=共有は描画 lib のみ。
- ⚠会場CSS/描画は content.js と venue.js 二重バンドル。
- 既存再利用部品: .nlsb-residents(3キャラ)・VOICEVOX ローディング演出(v0.1.770)・voicevoxClient.synthesizeVoice・drainVoiceQueue・bubbleLayer。

[[feedback_self_verifying_loop]] [[feedback_meeting_room_for_complex_tasks]] [[feedback_hoshinoromi_no_dead_links]]
