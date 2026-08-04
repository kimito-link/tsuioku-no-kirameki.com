# レーン/会場「素性が取れた人を全員出す」設計会議 — 司令塔の収束 (2026-06-22)

質問: `council/lane-show-all-active-question.txt` / 生回答: `council/lane-show-all-active-answers.json`

## 実データで確定した真因(状態速報 lv350806949)
- interceptMapSize=522(素性=userId 取れた人) / コメントした人204 / 来場1287。
- avatarUidDiag.uidNoAv=522 / interceptAvatarSize=1 = 顔写真が紐付いたのは1人だけ(配信者本人)=ほぼ全員ゆっくり顔。
- popup-entry.js:5203 `const limit = INLINE_MODE ? 48 : 24;` で popup レーンは最大48人に打ち切り=474人が黙って漏れていた。
- storyUserLaneBuckets.js `bucketStoryUserLanePicks(sorted, maxTotal)` が tier 高い順に maxTotal 件だけ採用・残り捨て。
- 会場(venueBar)は userLaneCandidatesFromStorage の全候補をほぼ全員席に=popup(48)と食い違い。前回 cap 150→500 化は見当違い(無差別水増し)。

## 会議の結果(routed・design・3体回答)
- groq/qwen3-32b(批判)・local/gemma4(統括)・nvidia/qwen3.5(発散) が回答。groq/llama-3.3-70b は HTTP 429。
- **3体一致の方向=popup(狭い・確認用)と会場(全画面・没入の主役)で役割を分け、「全員」は会場で実現・popup は要約(上位N+ほかM人)。**

## ★司令塔の収束(qwen3-32b ベース+実コード裏取り・破壊手段は却下)
- **popup レーン**: limit 48 は残すが【「ほか M人」要約を必ず出す】(48で黙って切る不誠実をやめる=ユーザー「全員出るはず」への誠実な回答)。M = 候補総数 − 表示数。
- **会場**: 母集合を「レーン候補と同じ(素性が取れた人=userLaneCandidatesFromStorage 全候補)」にしその全員を席に。cap はこの集合の自然上限に任せる(前回の cap 500 無差別化は見直し)。
- **却下した破壊手段**: (gemma4)顔なしにアニメ演出追加・(nvidia)星の群れ/Canvas化/3D作り替え=既存の本物タイル(buildPersonTileEl)/bucket/会場tier を大きく作り替える=最小ブラスト半径超過・過去「壁で覆う」失敗と同型・loading=lazy 再発リスク(gemma4 自身も警告)。

## ユーザー確定
- popup は「上位+ほかM人」要約でよい(本人 OK)。会場は素性が取れた人を全員。

## 実装方針(最小ブラスト半径・各段で実機確認)
- PR-A: popup レーンに「ほか M人」要約行を足す(storyUserLaneGuideHtml の foot か別要素)。candidates 総数 − picked.length を出す。limit 48 自体は維持(popup の軽さ)。
- PR-B: 会場の cap 見直し=素性が取れた人(レーン候補集合)を全員席に・前回の VENUE_FULLSCREEN_MAX_SEATS=500 の扱いを再検討(集合が小さければ自然に収まる)。
- ★誠実さ最優先=「何人いるか」を必ず正直に出す。黙って切らない。

[[feedback_self_verifying_loop]] [[feedback_meeting_room_for_complex_tasks]]
