# 会議 SYNTHESIS: P2 ローディング幕が終わらない=本物バグか診断誤検知か(3画面パリティ第2段)

> 司令塔が実コードで土台を作り 3視点(CSS/JS乖離・JS撤去失敗・診断批判)で独立検証→統合。

## 総合判定: css_failsafe_root_confirmed / 本物か誤検知か: both

## ユーザーへ正直に伝える判定
応援レーン描画は完了・幕も画面から消えていますが、内部状態(--done クラス)が更新されていない状況です。本来 12秒以内に解決するはずですが、INLINE_MODE 時のタイマー競合により遅延している可能性があります。第1段修正(CSS アニメーション終了時に自動クラス付与)で根治します。

## 根の要約
CSS フェイルセーフ(15秒で opacity:0/visibility:hidden)が幕を視覚的に消すが、nl-init-shade--done クラスを付けない設計。同時に INLINE_MODE 時のタイマー競合(21369の5秒タイマーが18743/18863側の poll/fallback を上書きする可能性)により、JS側の dismissInitialLoadShade() 実行が遅延または条件分岐に入り続け、--done クラスが付されない。結果、shadeActive(クラス判定)が永続 true のまま、クラスと視覚的状態が乖離する。

## 他に幕が --done なしで残る経路(優先順)
1. INLINE_MODE時のタイマー上書き：21369の5秒タイマーが dismissInlineShadeWhenDataReady(10s) を新たに開始し、既に wait 中のタイマー(18743/18863)の inlineShadeDataPollTimer/inlineShadeDataFallbackTimer を上書き → poll/fallback が想定と異なる時刻に実行される
2. inlineWatchPanelHasRealDataForShade() の永続 false：watchMetaCache.snapshot が null のままで、公式コメント数・来場者数・視聴者数が全て undefined → poll が 10秒フォールバックまで走り続ける。その間の 5秒タイマー割り込みで新タイマーセット → ハーモニクス的にズレ
3. refresh が throw/中断：finally に到達しない → 18858側のタイマーが set されない → 18743の12秒安全網だけが頼り。しかし initPopup 自体が throw する場合、18743に到達しない
4. 別popup インスタンス(toolbar/sidepanel)：dismiss が各インスタンスで独立実行 → 表示中の popup のみ perfDiag.storyUserLaneRenderProbe が完了でも、別インスタンスの perfDiag.shadeActive=true が収集値に混在

## 第1段の最小修正(案b: animationend で --done 付与)
popup-entry.js の dismissInitialLoadShade() 内で、shade 要素に animationend イベントリスナーを追加し、CSS フェイルセーフアニメーション終了時に自動的に nl-init-shade--done クラスを付与する。具体実装：shade 要素への操作時に shade.addEventListener('animationend', (e) => { if (e.animationName === 'nl-init-shade-css-failsafe' && !shade.classList.contains('nl-init-shade--done')) { shade.classList.add('nl-init-shade--done'); } }, { once: true }); をリスナーハンドリング箇所に追加。

### なぜ安全か(地雷ゼロ)
CSS アニメーション(15秒)が自然に終了する タイミングに hook することで、refresh 状態・INLINE_MODE フラグ・タイマー競合に依存せず、クラスと視覚的状態を必ず一致させる。通常系(JS安全網12秒が先に--done付与)では animationend は発火しない(--done既付与)ため二重付与のリスクなし。最悪系(refresh freeze)でも15秒後に必ず--done付与されるため、shadeActive が false になる。

### 単体テスト方針
（1）refresh 成功ケース：dismissInitialLoadShade() が12秒以内に JS から呼ばれ、animationend 前に --done が付く → animationend リスナーは何もしない。20秒後に assertion: shadeActive===false。（2）refresh freeze/JS エラーケース：CSS animation 15秒で animationend 発火 → --done が付く。20秒後に assertion: shadeActive===false。（3）全ケースで getComputedStyle(shade).visibility==='hidden' かつ opacity==='0' を確認（CSS フェイルセーフが効いている）。

## 3画面パリティ note
②応援ライブビュー/③純Web 側での幕実装・診断の有無を別途確認が必要。P2「3画面パリティ」確認項目。

## 実機での到達条件
案(b)：CSS フェイルセーフ終了時の animationend で --done を自動付与。最小・低リスク・地雷ゼロ。popup の refresh()/paint read path 改変なし、content/会場 不触、幕の視覚的消失タイミング不変（CSS animation 15秒で既に完了）。
