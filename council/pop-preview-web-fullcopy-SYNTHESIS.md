# SYNTHESIS: ①POP=②応援プレビュー=③WEB フルコピー

会議(最強モード QUALITY+CRITICS=2, code カテゴリ5体・成功4/5)の合議 + 司令塔Claudeの実コード裏取り。
会議は製品コードを読んでいない(仕様サマリのみ)ため、合議点は素材。以下は**実コードで検証した結論**。

## 会議の合議点(4体一致)と裏取り結果

| 会議の主張 | 裏取り | 判定 |
|---|---|---|
| ①固定cap(60/48/10)がフルコピーを壊す。容量74%余ってるのに固定値で削る | laneMirror cap=48・northStar cap=10・comment cap=60 は実在(popup-entry.js:5668, northStarMirror.js:21, commentTimelineMirror.js:22)。jsonBlob 131KB/512KB=26%も事実 | ✅ 当たり |
| ②描画とpublishが非対称(描画した最新が publish前に取りこぼされる) | **レーンでは誤り**。popup-entry.js:5294 の描画(paintStoryUserLaneDomFilled)と 5319 の publish(publishLaneMirror)は**同一 buckets・直後**。件数は構造的に一致 | ❌ 外れ(レーン) |
| ③自己診断の穴: レーン/コメントの①vs③突合が無い | liveviewPublishSelfDiag.js は北極星(貢献度/広告)しか突合していない=事実 | ✅ 当たり |
| ④「観測累計30」ラベルが誤解の元 | commentTimelineMirror.js:82 totalSeen=merged.length=「この鏡バッチの母数」で累計ではない=事実 | ✅ 当たり |

## 実コード裏取りで判明した【本当の食い違い】(会議が気づかなかった核)

**コメント鏡が30件しか出ない真因** = cap(60)でも描画/publish非同期でもない。
- publishCommentTimelineMirror({ comments: displayEntries }) に渡る displayEntries は**全記録級(808件)**(popup-entry.js:14297・14229・countToShow は記録総数808を採用)。
- だが buildCommentTimelineMirrorSnapshot の toTimelineRow(commentTimelineMirror.js:44)は
  **「text も name も avatarUrl も無い行は null で捨てる」**。
- 鏡が渡す resolveName=commentTickerDisplayLabel / resolveAvatar=storyGrowthTileSrcForEntry。
  → これらが**匿名等で空を返すコメントは鏡から消える**。808件→30件は、778件が「本文はあるが name/avatar が解決されず捨てられた」可能性が濃厚。
- **これが非対称の正体**: ①POPのティッカー(renderCommentTicker・同じ displayEntries)には出るのに、
  ③WEB鏡には resolve 差で載らない。会議の言う「非同期」ではなく「**解決関数の差による欠落**」。
  ※ toTimelineRow は text だけでも残すはず(44行: !text && !name && !avatarUrl のときのみ捨てる)なので、
    「text も空」= displayEntries の大半が本文空(スタンプ/ギフト/システム等)の可能性も残る。**要実データ確認**。

## 統合した1案(実装方針・優先順)

### P0: 「フルコピーか」をコピペで一発判定できる自己診断(まず穴を塞ぐ=説明不要化)
会議④+③の合議。ユーザーの一番の要求は「説明せず一発で分かる」。まず検知から。
- liveviewPublishSelfDiag.js の consistency に**応援レーン各段(りんく/こん太/たぬ姉/ギフト/広告)**と
  **コメント**の ①(popup が描いた件数) vs ③(鏡件数)突合を追加。
  - レーンは laneMirror に pickedLength/totalCandidates が既にある(popup-entry.js:5322)。①描画件数=laneDisplayedTotal。
  - コメントは「displayEntries 件数(=①ティッカー) vs 鏡rows件数(=③)」を突合。差が大きければ🔴+理由。
- 状態速報に「①POP N件 / ③WEB M件 一致✅ or 欠落🔴」を全レーン出す。**新規storageキー不要**(jsonBlob 相乗り)。
- これで「レーンが揃ってない・コメント0」をユーザーが目視で気づく必要が消える(自動で🔴+原因表示)。

### P0: 「観測累計」ラベルの正名化(誤解の除去)
- commentTimelineReport.js / status 表示の「観測累計 N 件」→「この鏡の対象 N 件(記録総数とは別)」等に。
- 会議④: 「最新N件(全体M件中)」形式。記録総数(808)と鏡母数(30)を並べて誤解を断つ。

### P1: コメント鏡欠落の根治(30件問題の本丸)
- toTimelineRow が捨てる条件を実データで確認。resolveName/resolveAvatar が空でも
  **text があれば鏡に載せる**(既にそうなっているはず→なぜ30件かを実データで詰める)。
- 匿名でも本文があるコメントは③WEBのタイムラインに出す=「コメントが進む」を回復。

### P1: 動的cap(容量が許す限り全件)— 会議①の合議
- 固定cap(48/60/10)を「512KB上限までの動的cap」に。jsonBlob サイズを測り、余裕があれば cap を上げる。
- **ただしレーンは cap48>実44 で既に全件**=レーンの食い違いは cap ではない(P0診断で本当の原因を先に特定してから)。
- 北極星10は「ニコ生本体1-10位表示に合わせた仕様」。フルコピー要求と衝突するなら cap を上げる価値あり。
- リスク(会議): 512KB超で413エラー。→ 分割送信/gzip は**過剰**。まず動的capで足りるか(現状26%)を測る。

### 却下・保留
- 会議の「描画イベント直後にpublishトリガー(直列化)」= レーンは既に同一bucketsで直列=不要(誤診)。
- 会議の「chunks分割POST/gzip」= 現状131KBで512KB上限に遠い=時期尚早。動的capで足りる。
- 会議の「共通モジュール mirrorBuilder.js で描画とpublish統一」= レーンは既に同一source=大規模リファクタ不要。
  popup-entry.js は max-lines ギリギリ=不用意なモジュール追加は避ける。

## 次の一手(順序)
1. P0診断(レーン+コメントの①vs③突合)を liveviewPublishSelfDiag.js に追加 → コピペで食い違いが見える。
2. その診断を実機の状態速報で見て、コメント30件・レーン各段の**本当の欠落箇所**を実データで確定。
3. 確定した箇所(コメント欠落 or 特定レーン)だけを P1 で根治。動的capは必要と分かってから。

**原則**: まず「どこが食い違うか」を状態速報が自動で名指しできるようにする(P0)。
推測で cap をいじる前に、診断で真因を出す。これがユーザーの「説明させるな」に最短で応える。
