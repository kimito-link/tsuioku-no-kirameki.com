# SYNTHESIS: 応援ライブビュー「完全コピー」の実装方式

会議3体(critic=qwen3-32b / implement=gemma 統括 / fast=llama-3.3-70b)+ 司令塔の実コード裏取りで確定。
発散役(nvidia qwen3.5-122b)はタイムアウト脱落(0ms)。

## 投票
- **案A(共有lib移植・漸進・master継続)**: implement(gemma)が支持。
- **案B(popup.html 丸ごとクローン)**: fast(llama)が支持。ただし根拠が弱い(下記)。
- **批判役(qwen)**: A/B どちらも穴を指摘。最重要の指摘=「案A は popup の module-level state/ヘルパ
  (avatar load guard・identicon キャッシュ)を opts 注入する時、**再現(アレンジ)に陥る危険**がある=
  過去 paintNorthStarStripInto で却下されたパターンと構造が一致」。あわせて **案C(iframe)は MV3 で不可**
  (CSP/local-resource 制約・iframe 内で chrome.windows.getCurrent() 不可)を確認。

## 司令塔の裏取り(=会議の結論を実コードで検証)= 案A を採用

批判役の「A は state 注入で再現に陥る」という穴は **理論上は正しいが、master の実コードで既に解決済み**:

- live-view-entry.js:97-108 は guard を**自作再現していない**。popup と同じ本物のファクトリ
  `createSupportAvatarLoadGuard`(popup-entry.js:3770 と同一)を呼び、popup と同じ4点 I/O
  (`storyAvatarLoadGuard / isHttpOrHttpsUrl / storyTileUsesYukkuriTvStyle / upgradeAnonymousAvatarImage`)
  を `_laneMirrorDomIo` として本物 `buildPersonTileEl` に渡している。
- = これは「再現」ではなく「本物の runtime を注入」=案A の正しい形。応援レーン鏡(v0.1.913/927)は
  popup と最も忠実に一致しているパネル=**案A が実機で機能している証拠**。
- 一方 fast(llama)の「B の方がアレンジ混入が少ない」は**逆**。55コミット遅れ+描画配線未完のクローンこそ
  drift が入る場所。さらに popup-entry.js の chrome.tabs/scripting/windows 依存を剥がすコストが重い。
- 批判役が確認した通り **案C(iframe)は MV3 で不可**=却下。

→ **採用 = 案A(共有lib移植・漸進・master 継続)。** 批判役の穴は「state を opts 注入する時、自作スタブで
  代用せず、popup と同じ本物のファクトリ/I-O を注入する」という規律で回避する(既に lane 鏡で実証済)。

## 完全コピーの規律(これを守れば再現に陥らない=批判役の穴を塞ぐ)
1. popup の render 関数が使う **純関数(src/lib)** と **CSSクラス** を実コードで特定する。
2. 純関数は live-view から **そのまま import**。CSS は popup.html から live-view.html へ **verbatim コピー**。
3. popup の module-level state/ヘルパが要る時は、**自作スタブを書かず**、popup が使う **本物のファクトリ**
   (createSupportAvatarLoadGuard 等)を live-view でも生成して **同じ I/O を注入**する(lane 鏡 v0.1.913 が手本)。
4. データが無いパネルは hidden(死にリンクにしない)。
5. 自作の代用アイコン(👤 等)・絵文字順位・独自色は **禁止**(過去に却下されたアレンジ)。

## 実装段取り(漸進・各段で実機確認)
0. **網羅リスト先取り**: popup の全パネル(セクション)を上から実コードで列挙し、各パネルの
   ①データ源 ②描画関数 ③CSSクラス を表にする。live-view に「無い/自作で残っている」差分を確定。
   (Explore エージェントに投げると速い=過去2回これで正確に裏取り済。)
1. 既知の残アレンジを本物へ置換(例: live-view-entry.js:414 `buildLaneTile` の 👤 代用 →
   本物のアイコン解決+ゆっくり画像フォールバックへ。lane 鏡の guard/I-O 注入と同じ recipe)。
2. popup にあって live-view に無いパネルを、本物の関数 + verbatim CSS で1枚ずつ追加。
3. 各 patch ごとに verify:cc 全緑→ commit → push → copy:ext → ユーザー実機確認。

## やらないこと(過剰実装・既知の地雷)
- popup.html 丸ごとクローン(案B): 55コミット追従 + chrome.* 依存剥がしのコスト過大・drift 源。
- iframe 埋込(案C): MV3 CSP/local-resource で不可(批判役確認)。
- 自作スタブで popup の state を代用すること(批判役の穴=再現に陥る)。本物のファクトリを注入する。
- 健全度/対処カード/AI共有 等の **status 専用診断系**は live-view に入れない(応援を見るページの趣旨外)。
  ただし「popup にあるパネルは全部」が原則なので、popup 本体に出ているものは入れる。境界が曖昧な
  パネルが出たらユーザーに1問だけ確認。
