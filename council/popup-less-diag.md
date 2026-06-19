# お題: 「popup を開く手間すら無くす」をどう実現するか(Chrome 拡張)

## このお題はカラ会議用(役割分担で『結論→根拠→反論・リスク→具体案』)

役割: 総合=全体設計の整合と実現可能性 / 発散=既存と違う切り口・他拡張の先行事例 /
批判=各案の穴を最低1つ(原理的に不可能なら正直にそう言う) / 実装=具体ファイル/API/手順まで。

## 背景・ユーザーの願い

ニコニコ生放送の Chrome 拡張(MV3)。ユーザーは「状態を確認したいとき、status ページ1枚を見れば
全部わかる」状態を望んでいる。今は:
- **content script の診断(fastDiag)** は常時 storage に書かれ、status ページが読める。これは OK。
- **popup 固有の診断**(下記)は status に「未取得」と出て、ユーザーが「拡張ポップアップを開いて
  AI診断コピーを押す」という手間を踏まないと status に流れない。
- ユーザー: 「popup を開くこと自体が手間。それなしにできないか?」

## 動かせない技術的事実(会議はこれを前提に・ここは確定)

1. **MV3 のポップアップ(popup.html)は、ユーザーが拡張アイコンをクリックした時しか開けない。**
   拡張コードから勝手に popup を表示する API は無い(chrome.action.openPopup は限定的で、ユーザー
   ジェスチャ必須・MV3 では使えない場面が多い)。
2. **popup 固有診断は popup ランタイムが描画して初めて生成される値**:
   - avatarLoadDiag(アバター画像の load 成否・popup が img を描いて集計)
   - northStarRenderProbe(popup のレーン描画が途中で詰まったか)
   - watchSnapshotMeta / storageReadback(popup が解決したスナップショット)
   これらは content script や Service Worker には**存在しない**(別の実行コンテキスト・別 DOM)。
   正本: src/lib/aiSharePopupDiagKey.js のコメントに明記。
3. **この拡張には offscreen document 機構が既にある**(extension/offscreen.html /
   src/extension/offscreen-entry.js)。MV3 の offscreen は「ユーザーに見えない裏の DOM ページ」を
   拡張が能動的に作れる(用途は限定列挙: DOM parsing / audio など)。今はコメント IDB 書き込みに使用。
4. status ページ(status.html)と popup は別コンテキスト。storage 経由でしか繋がらない。

## 会議への質問

### Q1: 「popup を開かずに popup診断を取る」は原理的に可能か
- 案A: offscreen document で popup-entry の診断ロジックだけを走らせる。popup の描画値
  (avatarLoadDiag/northStarRenderProbe)は「popup を実際に描画」しないと出ないが、offscreen の
  非表示 DOM で同じ描画ロジックを動かせば取れるのでは? 実現可能性と落とし穴は?
- 案B: 診断ロジックを popup DOM 依存から切り離し、content script か SW で計算できる純ロジックに
  寄せる。avatarLoadDiag 等のうち「本当に popup DOM が要るもの」と「実は storage/データだけで
  計算できるもの」を分ければ、後者は popup レス化できるのでは?
- 案C: そもそも popup診断は status の切り分けにほぼ不要で、content診断(fastDiag)だけで9割の
  問題は解決できる(実例: backfill 失速・会場が空 は fastDiag だけで真因特定できた)。popup診断は
  「本当に要るときだけ開く」割り切りが最善では?(過剰実装の回避)

### Q2: offscreen で popup ロジックを動かす場合の罠
offscreen は「見えない DOM ページ」だが、popup と完全に同じ環境ではない(サイズ0・ユーザー操作なし・
ライフサイクルが違う)。avatarLoadDiag(画像 load 成否)や northStarRenderProbe(描画の詰まり)は
「実際に表示される popup」でしか再現しない値ではないか? offscreen で取った値は popup の実態と
ズレて、かえって誤診を生まないか? 批判的に。

### Q3: 自動実行のトリガーとコスト
popup レス化できたとして、その診断収集を「いつ」走らせるか。
- status を開いた時に1回 / 定期的に / content が異常を検知した時。
- offscreen を頻繁に起動/破棄するコスト、storage 書き込み頻度、電池/CPU への影響。
- 「裏で勝手に重い処理が走る」のはユーザー体験を損なう(過去にこの拡張は『自動ダウンロード連発』
  『裏タブで重い描画』で実害を出した経緯がある)。常時自動は危険では?

### Q4: ユーザーの真の願いを満たす最小の道は
ユーザーの本質的な願いは「popup を開く操作をしたくない」=操作レスで status1枚に集約。
- 完全自動(offscreen)が技術的に無理/危険なら、次善は何か?
  例: status ページに「popup診断も取り込む」ボタン1つ(押すと裏で offscreen 起動→診断→反映)で
  「拡張アイコン→popup→AI診断コピー」の3手を1手に縮める、など。
- 「開かずに」が原理的に無理な部分はどこまでで、どこまでなら操作を減らせるか、正直に線を引く。

## 期待する最終成果(司令塔が1案にまとめる)

「何を・どの順で・どのAPI/ファイルで作るか」が分かる1案。
原理的に不可能な部分は正直に「不可能」と言い、その上で**操作回数を最小化する現実解**を出す。
過剰実装(常時自動で重い処理)を避け、星野ロミ式(失敗体験の除去・既存データを活かす・重くしない)で。
MVP(最小で価値が出る一歩)とその後を分けて。
