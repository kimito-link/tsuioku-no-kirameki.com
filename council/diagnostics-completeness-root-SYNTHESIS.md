# 会議 SYNTHESIS: 診断が「全不具合を漏れなく出せる」根本（根を直せば全部直る）

## 確定した「2つの根」(司令塔が2エージェントで実コード棚卸し)
- 根1「1回だけ集約・以後更新なし」= popup 固有診断は popupDiagAutoPublish.js:30 で published=true により
  popup を開いた idle 時に1回だけ storage 書き込み。再集約しない=古い/started:0 固着。
- 根2「ページまたぎ非対称」= globalThis はページごと別物。globalThis 集計(liveviewPublishOutcome 等)は
  記録ページでしか読めない=「押したのに未送信」誤報。
- 両者は同じ病: 診断データに「いつの・どの配信の」が付かず、ページをまたいで集約されない。

## 裁定: (D)メタ診断 → (C)鮮度正直化 → (B)送信結果storage化。(A)再集約は保留(地雷)。

### なぜこの順か(ユーザー擁護役 + 批判役)
- ユーザーの本当の要求=「状態速報を見た瞬間、どこが信頼でき・どこが空/古いかが一目で分かる」。
- 今は started:0 を見ても「本当に描画してない」か「診断が古いだけ」か区別できない=同じループの原因。
- → (D)メタ診断(診断の自己点検)を冒頭に出せば、個々が古くても「これは古い/空」と即わかる=ループが止まる。
  これが網羅の本丸。(A)再集約(popup refresh/paint 改変)は2回 revert した地雷なので回避し、
  「古いと明示する」ことで誤報の実害を消す(古いと分かれば誤報ではない)。

## 第1段 (D)「### この診断の信頼性」= メタ診断【最優先】
状態速報の冒頭に1ブロック。新規 storage read ゼロ(手元の persistedAt/capturedAt/liveId だけ)。
- watch タブ(視聴中配信)の有無 → 無ければ「popup 由来の診断は空/古くて当然」と先に明示。
- popupDiag の鮮度: persistedAt の経過(N秒/分前)。3分超なら「⚠popup 診断が古い=開き直して」。
- 各経路の最終更新と liveId 一致を1行ずつ: fastDiag(content) / popupDiag(popup) / 各鏡 / 送信結果。
- 「この状態速報で信頼できるのはどこまでか」を verdict で(例: 「watch タブ有・popup 40秒前・鏡新鮮=全て信頼可」)。
純 lib(test)。status-entry は冒頭に1セクション足すだけ。

## 第2段 (C) 鮮度の正直化(popupDiag に liveId/persisted 照合)
- popupDiag を status で出す前に persistedAt 鮮度チェック+liveId 照合(currentLiveId と)。
  古い/別配信なら⏳保留表示(liveviewPublishSelfDiag と同方式に統一=誤検知防止の既存パターン流用)。
- reportPreviewKey.js:isReportPreviewFresh が既にある=同じ手法を popupDiag にも適用(似せて自作しない)。

## 第3段 (B) 送信結果を storage 化(根2の根治)
- liveviewPublishOutcome を globalThis から storage(新キー)に寄せ、live-view-entry.js:118 の公開ボタンからも
  recordLiveviewPublishOutcome を呼ぶ。status は storage から読む=どのページで送っても「送信済み✅」と言える。
- ★懸念対応: storage write 増は best-effort + min-gap で吸収(鏡 publish と同方式・既存実績)。

## 保留・却下
- (A) popupDiagAutoPublish の再集約化 = popup refresh/paint の read path に触れる地雷(2回 revert)。
  メタ診断(D)で「古い」を可視化することで実害を消し、本当に必要と判明してから安全策を別途会議。
- 重い同期再集約 = 厳禁(丸ごとDOM鏡の revert 理由と同じ轍)。

## メタ診断が「網羅」を保証する仕組み(=診断の自己点検)
状態速報の各診断セクションは、メタ診断が示す「信頼できる経路」の上でだけ意味を持つ。メタ診断が
「popup 診断は古い/空」と言えば、その下の応援レーン描画/北極星の値は「鵜呑みにしない」と分かる。
= 不具合を取りこぼしても「取りこぼしている事実」が必ず冒頭に出る=同じループが構造的に止まる。

## 制約(全段共通)
- popup refresh/paint の read path 不改変。content/会場 不触。重い同期処理を毎paint 禁止。
- 純関数は lib(test)。段階リリース(1コミット=1検証単位)。件数/step/時刻のみ。
- 実機検証はユーザー。実機OKまで「直った」と言わない。

## 次の一手
第1段(D・メタ診断「この診断の信頼性」)から着手。新 lib で「watch タブ有無/popupDiag 鮮度/各経路の
最終更新・liveId 一致」を組み、状態速報の冒頭に出す。実機で「信頼性ブロックが出て、空/古い経路が
一目で分かる」を確認してから第2段(C)へ。
