# 会議 SYNTHESIS: 純Web応援ライブビューを「そっくり丸ごと」にする根本再設計

## 裁定（4視点 + 司令塔・実コード棚卸し裏取り）

ユーザーの「同じ画面・同じ動き」は2要素で決まる:
- (a) 全レーンが【揃って・同じ鮮度で】出る ＝ 今は per-section 鏡が別々鮮度でズレて永久に揃わない。
- (b) コメントが【進む動きが見える】 ＝ 今はコメントタイムラインが鏡に一切含まれず、純Webでは構造上絶対に進まない。

→ **選択肢 (2) 鏡を1枚に統合 → (3) コメントタイムラインを鏡に載せ定期再送信** をこの順で採用。
   選択肢 (1) iframe 化(webpopup)は「体験が同じ」を達成した後の drift ゼロ化として【保留】(chrome.* シム
   完全化コストが高く、(2)(3) で体験は揃うため後回しが合理的)。
   選択肢 (4) 丸ごとDOM鏡の再挑戦は【却下】(v0.1.948 で実機却下=毎paint全DOM sanitthat重い・同じ轍)。

## なぜこの順か（ユーザー擁護役）
- ユーザーの不満の核は「コメントが進まない・レーンが出ない」=体験。iframe 化は内部 drift 対策であって
  体験を直さない。まず体験((a)(b))を直し、drift ゼロ化(iframe)は後で。

## 第1段（選択肢2・鏡を1枚に統合）= まず「全レーンが揃う」
- popup が全鏡(laneMirror/statCardsMirror/northStarMirror/topSupporters)を【1スナップショット】に束ねて
  同時 publish(同一 capturedAt・同一 liveId)。純Webはその1枚を貼る=鮮度ズレが消える。
- 純関数の統合スナップショット build は lib(test)。popup の refresh/paint の read path は触らない=publish 側だけ束ねる。
- ★懸念対応: 既に各鏡は publish 済み。それらを「同一 capturedAt の1オブジェクト」にまとめる層を足すだけ。

## 第2段（選択肢3・コメントが進む動きを足す）= 「コメントが進む」
- 統合鏡にコメントタイムライン(最新N件=cap 120程度・displaySrc/name/text の最小)を含める。
  ★過去の重さ却下(丸ごとDOM鏡)との違い=「既に手元にある jsonBlob を間引いて再POSTするだけ」=重い計算ゼロ。
- PCが status を開いている間だけ、opt-in した配信について jsonBlob を間引いて(15-20秒)再POST。
  安全策=送信のみ/in-flight ガード/署名同一スキップ/document.hidden スキップ/status 閉じれば止まる。
  (MEMORY の「PCが定期再送信する仕組み」中断設計をここで再開・status-entry.js uploadStatusSnapshot 直後に loop)。
- 純Web POLL 60→15秒に短縮。これで「コメントが進む動き」が純Webで見える。

## 第3段（選択肢1・iframe webpopup）= drift ゼロ化【保留・任意】
- app 側に webpopup を1本ビルドし、純Web live-view が iframe で埋め込む。鏡を chrome シム storage.local へ流す。
- (2)(3) で体験が揃えば優先度低。chrome.* シム完全化(過去181箇所指摘)のコストを考え後回し。

## 却下（地雷マップ）
- ✗ (4) 丸ごとDOM鏡 = v0.1.948 で実機却下(毎paint全DOM sanitize重い・診断ページが開かない)。同じ轍。
- ✗ (B1) HTML丸ごとクローン = 12,263行二重メンテで必ず drift(過去会議で却下)。
- ✗ popup の refresh/paint read path 改変 = v0.1.948 で2回 revert した最重要地雷。

## MEMORY 訂正事項（実コードと食い違い）
- MEMORY/reference_liveview_popup_wholesale_copy.md の「丸ごとHTML鏡方式・実装完了(v0.1.948)」は【誤り】。
  実コードは app/live-view.js の per-section paint のまま。liveviewDomMirror.js / sanitizeFullHtml.js は現存しない
  (revert 済)。→ 司令塔が MEMORY をこの事実に訂正する。

## 制約の遵守（全段共通）
- popup refresh/paint の read path 不改変。content(記録)・会場読み上げ 不触。
- 「毎paintで重い同期処理」厳禁。再送信は手元 jsonBlob の間引きPOSTのみ(重い計算ゼロ)。
- 本物の描画関数/lib を再利用(似せて自作しない)。純関数は lib(test)。段階リリース(1コミット=1検証単位)。
- 実機検証はユーザー。実機OKまで「できた」と言わない。

## 次の一手
第1段(鏡を1枚に統合)から着手。まず popup が全鏡を同一 capturedAt で束ねて publish する統合層を
lib(test)で作り、純Webがその1枚を貼る。実機で「全レーンが揃って出る」を確認してから第2段(コメントが進む)へ。
