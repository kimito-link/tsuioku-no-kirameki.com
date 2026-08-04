# SYNTHESIS: 応援ライブビューを popup と「そっくりそのまま」にする実装方式

会議4体(批判 qwen3-32b / 統括 gemma / 発散 qwen3.5-122b / 爆速 llama)+ 司令塔の実コード裏取りで確定。

## 前提の訂正(実機で確認・最重要)
- 直前まで「案A=popup の描画関数を1枚ずつ live-view へ移植(漸進)」で進めたが、Playwright で popup.html と
  live-view.html を直接開いて目視した結果、**骨格が根本から別物**(popup=操作ツールバー群+顔付き統計カード3枚+
  公式値レーン+応援レーン段組み… / live-view=配信ヘッダ+盛り上がり+応援者ランキンググリッド)と判明。
  ユーザー「はじめから違う・そっくりそのままでない」。**漸進(案A)は実機の事実とズレていた=破棄。**
- popup.html は **12,263 行**・popup-entry.js は **chrome.tabs/scripting/windows/runtime を 62 箇所**で使う。

## 投票
- 案B1(HTML丸ごとクローン+共有描画): lead(gemma)・fast(llama)。両者とも最大リスク=**12,263行の二重メンテで必ず drift**と自認。
- 案B2(iframe で本物 popup.html を埋める+embed分岐): diverge(qwen-122b)。drift が物理的に起きない・サーバー版移植性最良。
- 案B3(popup-entry を描画コア+ライフサイクルに分割): critic(qwen-32b)。長期保守は最良だが初期コスト最大。

## 司令塔の裏取り(=会議結論を実コードで検証)= **案B2(iframe)を採用**

会議の核心(批判役+発散役が一致)= **B1 の二重メンテ drift がユーザー要件①「popup を直したら live-view も追従」を
構造的に満たせない**。一方 **B2(iframe で本物の popup.html を読む)は drift が物理的に不可能**。そして決定的なのは:

★**iframe 埋め込みは「不可能」ではなく、この拡張に【既に実装され動いている】**(第1回会議で批判役が言った
「MV3 で iframe 不可」は誤り。司令塔も第1回はそれを鵜呑みにした=訂正する):
- `status-entry.js:1055 ensureStatusPopupIframe` が既に `chrome-extension://<id>/popup.html?inline=1&dock=status&lv=<lv>`
  を iframe で埋め込んでいる(v0.1.916 試作)。**MV3 同一拡張 iframe は動く。**
- manifest: `frame-src 'self'` 許可済 + `popup.html` は web_accessible_resources にある=iframe で読める。
- popup-entry.js は **既に埋め込みモードを持つ**(`inlineModeFlags.js`): INLINE_MODE=`?inline=1` /
  INLINE_PASSIVE=`dock=status`(受動ビュー=**storage に書かない・watch へ注入しない・外部 fetch しない**・
  鏡/数字カードを上書きしない・koken 書込しない)。=B2 が必要とする「embed 分岐」は**新規実装でなく既存**。
- INLINE_PASSIVE が副作用を全部止めるので、批判役/発散役が恐れた「62 箇所の chrome.* が iframe 内で暴れる/
  v0.1.917 のゴーストタブ」も既に封じられている(ゴーストタブの真因は古い重複拡張 v0.1.727=iframe 無関係と確定済)。

→ **採用 = 案B2。live-view.html を「本物の popup.html を iframe で全面に埋める」薄いページにする。** status の
  `ensureStatusPopupIframe` が動く実例=これを live-view 用に流用すれば最小・最確実・drift ゼロ・サーバー版移植も
  iframe の中身を差し替えるだけ。B1(12,263行クローン)/B3(62箇所分割の大改修)は過剰コスト=不採用。

## 実装方針(案B2・最小)
live-view は別タブ(全画面)なので、status の「小さい埋め込み枠」とは dock を分ける必要がある:
1. **新しい inline モード**: `popup.html?inline=1&dock=liveview&lv=<lv>` を受ける。inlineModeFlags.js に
   `INLINE_EMBED_LIVEVIEW=dock==='liveview'` を追加(INLINE_PASSIVE と同じ副作用抑止=storage 書かない・watch
   注入しない・外部 fetch しない を継承)。**popup 通常起動(dock 無し)は 1mm も変えない。**
   - なぜ status の dock=status をそのまま使わない? status 埋め込みは「小窓・受動」前提。live-view は全画面で
     「そっくり全部見せる」=別 dock にして将来 live-view 固有の調整(全画面 CSS 等)を can にする。まず挙動は
     INLINE_PASSIVE と同じで良い(副作用ゼロの受動表示)。
2. **live-view.html を作り直す**: 今の独自骨格(配信ヘッダ/盛り上がり/応援者ランキンググリッド/公式値レーン)を
   捨て、`<iframe src="popup.html?inline=1&dock=liveview&lv=<lv>">` を全面に置くだけの薄いシェルにする。
   ?lv= が無い時は今の「配信を指定してください」案内を残す(死に画面回避)。
3. **live-view-entry.js を作り直す**: ?lv= を読んで iframe の src を焼く(status-entry.js:1086-1112 の
   ensureStatusPopupIframe を流用)。自前の集計/描画(renderLiveView/renderLanes/renderNorthStarLanes/鏡 等)は
   iframe が本物 popup を描くので**不要=削除**(または iframe 不可時のフォールバックとして残すかは段階判断)。
4. **CSS**: iframe を全画面に(width/height 100%・border 0)。中身は本物 popup の CSS がそのまま効く=そっくり。

## 検証(各段で必須)
- Playwright で `popup.html?inline=1&dock=liveview&lv=<実 lv>` を直接開き、通常 popup と**見た目が一致**するか目視。
- 通常 popup(dock 無し)が回帰していないか(INLINE_EMBED_LIVEVIEW 分岐は dock=liveview の時だけ効く)。
- ユーザー実機で「ちくらんカード→live-view が popup そっくり全部出る」+「副作用(勝手なタブ開き/storage 汚染)が無い」。

## やらないこと
- 案B1(12,263行クローン)= 二重メンテ drift でユーザー要件①を満たせない。
- 案B3(popup-entry 62箇所の描画コア/ライフサイクル分割)= 巨大改修・回帰リスク。今は不要(iframe で足りる)。
- 「いらないパネルを省く」= まず丸ごと映す。取捨選択は映してからユーザーと相談(勝手に省くのは NG)。
- ⚠️ INLINE_PASSIVE 系の副作用抑止を弱めない(storage 書込/watch 注入を復活させると本物 popup と競合・ゴースト
  タブ再発の恐れ)。受動表示に徹する。
