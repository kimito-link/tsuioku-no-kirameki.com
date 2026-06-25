# 会議 統合結論 — 純Web /live-view の P2(配信者カード)・P3(応援者ランキング)

> お題: council/liveview-p2p3-design.txt / 会議: COUNCIL_QUALITY=1・design・4体
> 生データ: council/liveview-p2p3-answers.json / 司令塔(Opus)が統合・実コード裏取り

## 会議の合意(4体ほぼ一致)

- **P2 配信者カード**: `buildChikuranHeaderEl`(status-entry.js:1679)を `src/lib/chikuranHeaderDom.js` に
  【無挙動抽出】し status と純Web で共有再利用。**データ送信追加は不要**(lives[0] に全フィールド既存・
  buildChikuranCardModel が純関数で読む)。P0/P1 と同じ型。
- **P3 応援者ランキング**: `topSupporters`(上位10件・rank/userId/name/avatarUrl/count/isAnonymous)を jsonBlob に
  送信追加し、純Web側で `supporterRowToPersonTile`→`buildPersonTileEl` を共有再利用(v0.1.937 の status 顔つきランキングと同一見た目)。

## 司令塔の裏取り(批判の懸念を実コードで検証=両方とも安全)

1. ★qwen「P3 で payload が 512KB cap で既に半減→肥大化リスク」=**誤り**。
   - 512KB cap(LANE_MIRROR_MAX_JSON_BYTES)は laneMirror **個別スナップショット**の上限であって jsonBlob 全体ではない。
   - 実測=現在の jsonBlob 全体は **131KB**(curl で 131,166 bytes)=512KB の 25%・cap 未到達。topSupporters 上位10件(~2KB)
     追加でも余裕。→ P3 の送信追加は安全(過大リスクではない)。ただし送信後にサイズ計測は念のため行う。
2. ★gpt-oss「buildChikuranHeaderEl に chrome 依存があるかも」=**依存ゼロ**(grep で確認・純DOM)。→ P2 の抽出は安全。

## 確定案(P0/P1 と同じ TDD 型で実装)

### P2(送信追加なし・先に実装=安全)
1. テスト先行: src/lib/chikuranHeaderDom.test.js(happy-dom)で、ChikuranCardModel→DOM(サムネ img[src]・配信者名・
   タイトル・メトリクス行)の構造をネガコン付きで固定。サムネ無し=プレースホルダ🎥、ended=⏹ プレフィクス、
   壊れ img=remove(error ハンドラ)、referrerPolicy=no-referrer。
2. 抽出: buildChikuranHeaderEl の DOM 生成を src/lib/chikuranHeaderDom.js#buildChikuranHeaderDom(model) に無挙動移行。
   status-entry は buildChikuranCardModel(live)→buildChikuranHeaderDom(model) を import して呼ぶ(挙動不変)。
3. 純Web: app/live-view.html に配信者カード DOM 枠(または JS で生成)+ render に buildChikuranCardModel(jsonBlob.lives[0])
   →buildChikuranHeaderDom を1関数。サムネは referrerPolicy=no-referrer(personTile と同じ)。CSS は status の card 見た目に合わせる。
4. verify:cc 全8緑→deploy→実機目視(配信者名/サムネ/タイトル/経過/来場/コメント/ギフトが popup と一致)。

### P3(送信追加あり・P2 の後)
1. テスト先行: jsonBlob に topSupporters(+liveId+capturedAt)が含まれることを固定。純Web側で
   supporterRowToPersonTile→buildPersonTileEl の本物再利用でランキングが顔つきで出る・空で hidden のネガコン。
2. 送信: status-entry.js の jsonBlob 組み立て(991行付近)に topSupporters/topSupportersLiveId/topSupportersCapturedAt を
   相乗り(reportPreview から・上位10件 cap)。api 無変更。★送信後 jsonBlob サイズを計測(512KB 未満を確認)。
3. 純Web: app/live-view.html にランキング DOM 枠+ render に1関数。鮮度ガード(capturedAt・3分)同型。
   匿名 identicon は chrome.runtime.getURL 非依存の displaySrc をそのまま(app/live-view.js:48 既存パターン)。
4. verify:cc 全8緑→deploy→実機目視(ランキングが status/popup そっくり・顔つき)。

## リスクと緩和(自己申告)

- P2 抽出時の依存漏れ: grep で chrome/グローバル state 参照ゼロを確認済み。CSS は status の card スタイルを参照。
- P2 サムネ CDN: referrerPolicy=no-referrer を img に付与(buildChikuranHeaderEl 既存・移植時も維持)。
- P3 payload 肥大: 実測 131KB=cap の25%・余裕。topSupporters 上位10件 cap。送信後にサイズ計測。
- P3 鮮度: capturedAt 同梱+鮮度ガード3分(数字カードと同型)。
- 画像パス: 純Web は絶対 /app/ パス(P1 の轍)。
- 既存(数字カード/応援レーン/拡張live-view/会場/popup)を壊さない: 共有 lib は無挙動抽出・status は import 置換のみ。

---
*会議: 2026-06-25 / 統合: Claude Opus(実コード裏取り済み) / P2→P3 の順で TDD 実装*
