# reference: 会場モードを「本物のライブ会場」に見せる演出 ディープリサーチ

> 2026-06-13 ディープリサーチ(WebSearch/WebFetch)。ユーザー要望「武道館がガラガラでも満員に
> 見せるプロの撮影術を会場モードに再現したい・世界中の事例を参考に」。WebGL/物理エンジン不採用、
> 素CSS + Canvas 1枚で実現する具体技法。次の「ライブ演出会議」の一次資料。

## 1. 満員に見せる撮影術のWeb再現
核心=(a)ローアングルの強パース (b)前方密集・空席を画角外 (c)暗転で空席を闇に沈める。
- ローアングル: perspective を深く(400〜600px=強パース)・基準面 rotateX(45〜60deg)。前列が画面
  下端で大きく迫り後列が急速に小さく消える=「客席が無限に続く」錯覚。
- **空席を闇に沈める(最重要)**: 後方〜上方に向け暗くするビネット。
  ```css
  .venue::after{content:"";position:absolute;inset:0;pointer-events:none;
    background:
      radial-gradient(ellipse at 50% 85%, transparent 30%, rgba(0,0,10,.85) 90%),
      linear-gradient(to top, transparent 40%, rgba(0,0,15,.9) 100%);}
  ```
- 前方密集: 後列ほど横間隔を詰める(重なりOK=密集感)。縦構図/超広角=手前を誇張・前列1.0→後列0.3へscale段階。
- 参考: pond5 VFX crowd duplication / Eventbrite concert photography。

## 2. ライブ照明・空気感のWeb表現
- **god rays(光芒)は純CSSで作れる**: repeating-linear-gradient + mask + blur + mix-blend-mode:difference。
  実コード=CSS God Rays gist(LukaBostick)。ステージ上方一点から放射状に mask で切り抜く。
- スポットライト: radial-gradient + mix-blend-mode:screen(映像を白飛びさせず光だけ重ねる)。
- 円錐光芒: conic-gradient + mask でステージ下方向だけ残す。
- スモーク/ヘイズ: 大きな radial-gradient を filter:blur(40px) で2〜3枚ゆっくり translate ドリフト+screen。
- 参考: openreplay Five CSS Light Effects / CodePen各種。

## 3. 群衆を賑やかに見せる(VFXの2D複製をWeb移植)
- 少数シルエットを位置オフセット+scaleX(-1)反転+微サイズ違いで敷き詰める(同じ並びを繰り返さなければ
  目は複製に気づかない・NBC Smash も4枚合成)。
- **後列は顔→黒シルエット帯に格下げ+上端だけ淡いリム光(逆光)**=最も安く「無限の観客」。
  ★これが現状の「ゆっくり顔120人帯が映像を隠す」問題の直接解=後方はディテール捨てて低く薄く。
- ペンライト群衆: シルエット頭上に小光点多数・往復translate に animation-delay を黄金角でばらして非同期に
  揺らす=「振ってる群衆」。`animation-delay: calc(var(--i)*-137ms)`。
- 奥行き3層: 前景(鮮明)/中景(簡略)/後景(シルエット+暗+blur(1px)低彩度)。被写界深度の錯覚。

## 4. SHOWROOM/REALITY/cluster/プロセカ/VTuberの会場演出
共通解=「主催が色を一斉同期→客席が一つの色の海になる瞬間」「アバター+ペンライト+ギフトエフェクト
+コメント弾幕の重ね合わせ」。盛り上がりは“個々”でなく“同期した全体の動き”で表現。
- ペンライト一斉同期: サビで真っ赤・アンコールで一斉白・ラストにレインボー・BPM点滅を主催がワンタップ。
  **自由点灯でなく“統制された同期”が一体感の正体**(YEAAH)。
- プロセカ: タップ/スワイプでペンライト・アイテム投擲・他ユーザー行動も同期表示。
- 学術: 観客アバターの動きが presence(その場感)を高める(Frontiers VR)。一斉に同じリズムで揺らすだけで
  賑わいが跳ねる。

## 5. パフォーマンス(Canvas/光の軽量化)
- パーティクル上限: PC 500以下・モバイル100以下(sparticles: 1000で9%CPU/120fps可だが500超で劣化)。
- **グローは事前描画スプライト**: shadowBlur を毎回描くのは高価→オフスクリーンcanvasに発光円を1回描き
  drawImage でばら撒く(GPUアクセラ対象)。
- 避ける: shadowBlur・globalAlpha/rgba多用(GPUパス無効化)・サブピクセル座標(Math.floorで整数化)。
- レイヤー分割: 背景(god rays/照明=低頻度)と前景(粒子=毎フレーム)を別に。背景はCSS静的・前景canvasだけrAF。
- CSSグロー: box-shadow より filter:drop-shadow()(GPU化)。blur はモバイルで10px超でフレーム落ち。
- reduced-motion で粒子停止・点滅オフ・god rays animation停止。clearRect で変化領域だけ消す。
- 参考: web.dev canvas performance / MDN Optimizing canvas / sparticles GitHub / Josh Comeau Shadows。

## 今すぐ効く優先トップ5(実装コスト低い順)
1. **後方ビネット(空席を闇に沈める)** — CSS擬似要素1個・最小コスト。空席/隙間が消え「奥まで満員」化。
   現状の「映像を隠す顔帯」問題も後方を暗く薄くするだけで解決。★最優先。
2. **後列を顔→シルエット帯に格下げ** — 既存アバター描画の分岐・小コスト。120人帯が低く薄い黒シルエットに
   なり映像を隠さず群衆感は増す。
3. **ステージ god rays(純CSS)** — 実コードをコピペ調整・小コスト。一気に本物のステージ照明。
   mix-blend-mode で映像を壊さない。
4. **ペンライト光点(非同期揺れ)** — CSS or 軽量canvas・中コスト。少数を animation-delay 黄金角でばらす。
   多数なら canvas 事前描画スプライト100個以下。
5. **盛り上がり時の一斉色同期演出** — イベントトリガ配線・中コスト。コメント急増時にペンライト全体を
   一色→全点滅。SHOWROOM/プロセカ式の“統制された同期”=一体感の核心。

→ いずれも WebGL/物理エンジン不要。特に**1と2はCSSだけ**で現状の2大不満(空席でゆっくり顔が並ぶ/
  観客帯が映像を隠す)を演出強化と同時に解消でき投資対効果が最大。
→ 関連: [[reference_venue_fullscreen_meeting]](会議正本) / 既存の盛り上がり演出PR-c/d/e と統合。

## ライブ演出会議の確定(2026-06-13・全員集合 deepseek/gpt-oss/Codex 3者一致)

上記リサーチを一次資料に演出会議を実施。3者が実装順序で完全一致。司令塔が裁定。

### 確定: 実装順序(全員一致)
①後方ビネット → ②後列シルエット帯 → ③god rays → ④ペンライト光点 → ⑤盛り上がり色同期。
理由=「暗くする(空席を闇に沈める)」が満員感に最も効くので最初。CSSだけで効くもの(①②③)を
先に出し、Canvas演出(④⑤)を後に。各PRはスクショ比較できる独立単位。

### 確定: 中央(配信映像)を絶対に守る原則(Codex・決定的)
- **透明度でなく描画領域そのものを分離**。FXは上端/下端の領域に clip/overflow:hidden で閉じ込め、
  **中央セーフエリアには要素を一切置かない**。
- mix-blend-mode:screen は個別FX要素だけに付ける。.nlsb-stage に isolation:isolate。
- backdrop-filter は使わない(映像可読性+GPU負荷)。mask だけを安全装置にしない。
- Canvas は透明背景で上下の矩形内だけ clip して描画。

### 確定: 原則(サムネ/ハンドル/ID)との両立(Codex警告・重要)
- **実参加者(匿名含む)を装飾シルエットに置換して識別不能にするな**。シルエット化は観客席の顔帯の
  【後方の埋め草】だけ。アリーナの席(名前付き・しゃべった人=promote)はシルエットにしない=
  名前/ID/サムネを潰さない。後列シルエットは「無限の観客」の背景演出に留める。

### 確定: 共通演出制御層(Codex)
- PR-c(発言で跳ね)/PR-d(ギフト着弾)/ライブ照明 が個別にコメント監視するのを避け、共通の
  effects.update({heat, commentPulse, giftImpact, chorus}) を1つ置く。
  - PR-c=発言者本人の局所ジャンプ / PR-d=ギフト着弾の単発インパクト /
    照明=会場全体の継続的 heat(EMA) / 色同期=閾値超過時だけ発動する会場イベント。
- ギフト着弾と全体点滅を同時開始せず着弾後150〜300msで同期演出へ(視覚競合回避)。
  状態 idle→warm→peak→cooldown。クールダウンと最大発光時間を設ける(連打防止)。

### 確定: PR分割(司令塔裁定=Codex案)
- **PR1**: セーフエリア座標/z-index契約 + 後方ビネット(CSS擬似要素のみ)。
- **PR2**: 後列シルエット帯(観客帯後方のみ・アリーナは除外)。
- **PR3**: ステージ god rays(純CSS・mask+blend・中央除外)。
- **PR4**: 共通 heat 制御層 + PR-c/PR-d 統合。
- **PR5**: Canvas ペンライト(事前描画スプライト・DPR最大2・100個以下)。
- **PR6**: 一斉色同期・点滅・クールダウン。

### 確定: 罠(会議集約)
- 100vw による横スクロール→position:fixed; inset:0(B課題の横スクロール根絶を壊さない)。
- 巨大 blur の常時アニメ重い。Canvas は DPR を最大2に制限。非アクティブタブで rAF 以外のタイマー停止。
- 吹き出し(.nlsb-bubble-layer z5)より上に FX のスタッキングコンテキストを作らない=セリフ最優先。
- prefers-reduced-motion で移動/揺れ/点滅を止め、色温度と不透明度の緩やかな変化だけに。
