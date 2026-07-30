# 実装ハンドオフ: 厳密完全一致 v2(ロビー隔離+鏡スリム化)(v0.1.1112〜)

> この1枚だけで着手できる。設計正本=[memory/reference_pop_venue_exact_SYNTHESIS.md](memory/reference_pop_venue_exact_SYNTHESIS.md)(Fable設計v2・司令塔裏取り済み・2026-07-08)。
> 前提=v0.1.1111(鏡優先+P/T/X 3層・[memory/reference_pop_venue_parity_SYNTHESIS.md])が実装済み・実機確認済み。ブランチ feat/venue-lane-mirror-parity(d271c236)の続き。

## 背景(1分)
- v0.1.1111 の実機実測: 鏡の205人は欠落ゼロ・同順で会場に載った(成功)。しかし段の末尾に尾14+暫定1の「説明済み余剰」が居て、ユーザー判定は「完全一致じゃない」。
- v2 の解 = **尾・暫定の行き先を段末尾→「ロビー」(段の外の別セクション)へ変更**。5段は鏡と件数まで厳密同一・「会場で全員」はロビーが受け皿。
- 独立の実害 = jsonBlob 512KB/512KB(100%)。鏡の匿名セル(生成顔data URL ~3.2KB/件・鏡~160KBがjsonBlobに丸ごと相乗り)を **uidだけ運んで読み手が再生成**する方式で ~25KB へ(jsonBlob ~73%)。

## スコープ(Phase A → B-1 → B-2。C はやらない)

### Phase A: ロビー隔離(MVP・会場内で完結・1 patch)
1. `src/lib/venueLaneMirrorSupply.js`: composeVenueLaneBuckets の返り値を `{ buckets, lobby }` に変更(現在の「尾を段末尾へpush」を lobby 配列へ)。テスト更新+新規(尾がbucketsに混入しない/lobby順序=段順×comparator順)。
2. `src/lib/venueLaneParity.js`: 厳密判定へ締める。(a)入力に `lobby: string[]` (b)mirrorモードでは段内の鏡外を全部 unexplained(capOverflow分岐を mirror では使わない) (c)✅条件に「全段 drawn.length===pop.length」「lobbyInMirror===0」を追加 (d)出力トップレベルに `lobby:{total,transient,inMirror}`・line v2=`… / ロビー14(暫定1) / 未説明0`(fallbackは従来表記のまま=後方互換)。テスト更新。
3. `src/extension/venueBar.js`: (a)ロビーDOM(.nlsb-lobby=バナー+ラベル+list)を venueLaneEls.stack の直後に append・CSSは既存styleブロックへ (b)renderSeats で `{buckets, lobby}` を受け、paint後に `paintVenueLobby(lobbyItems)`(buildPersonTileEl+席ラップ・sig diff-skip・L18) (c)**席装飾ループを `[...visibleLaneItems, ...lobbyItems]` に**(L17=忘れるとロビー席が空白) (d)emptyMessage 判定を合算に(L19) (e)parity 呼び出しに lobby キー列 (f)fallback時は lobby=[] でロビー hidden。
4. バナー文言(たぬ姉口調): `たぬ姉: ここは ロビー だよ。①の画面(いま 200人まで)に 入りきらなかった人と、たったいま しゃべった人が ここで待ってるよ。①の画面に のったら、上の段へ うつるからね。`
5. wiring test 追記: `paintVenueLobby(` と lobby 受け渡しの存在assert。
- **完了判定**: verify:cc 全緑。実配信で token `✅ … / ロビーN(暫定M) / 未説明0` かつ全段件数=鏡と等値。reality-checker=ロビー人物の吹き出し・鏡出現→段への移動・fallback降格/復帰・①と並べて5段同一(スクショ)。

### Phase B-1: 読み手先行(1 patch・**Webデプロイが関所**)
- `src/lib/laneMirror.js` restoreLaneMirrorBuckets: `displaySrc空 ∧ userId有り → anonymousIdenticonDataUrl(userId, 64)` 再生成を追加(③と会場はこの関数経由なので呼び出し側変更ゼロ)。
- テスト: 旧鏡入力→byte同一出力(退行ゼロ)/''+uid→再生成一致。
- **完了判定**: verify:cc緑+**本番③(Web)に B-1 ビルドが配信されたことを確認してから B-2 へ**(版ずれ表の危険組合せ「新鏡×旧③」の封じ)。

### Phase B-2: 書き手スリム化(1 patch)
- `src/lib/laneMirror.js` toMirrorCell: `uid有り ∧ displaySrc === anonymousIdenticonDataUrl(uid, 64)` のときだけ displaySrc=''(byte比較=可逆・広告段の yukkuriFaceFor(roomKey・seed≠uid)は構造的に保護)。「!displaySrc→セル削除」は「uidも無い時のみ削除」へ。buildLaneMirrorSnapshot に `avatarGen: 2` 刻印(診断表示用・ゲートに使わない)。
- **急所(司令塔裏取り済み)**: ①の実生成は `anonymousIdenticonDataUrl(u)`(引数なし=既定64・popup-entry.js:5055)。**「①経路の実displaySrcとstrip比較が一致する」fixtureテスト必須**(往復byte同一の可逆性テストも)。
- **完了判定**: verify:cc緑。実配信: KEY_LANE_MIRROR ≤40KB・jsonBlob ≤87%(prune停止)・①③会場で同一uidの顔が同一(目視)・状態速報に鏡v2。

## 着手手順
1. 同ブランチ feat/venue-lane-mirror-parity で続行(d271c236の上)。
2. TDD: composeVenueLaneBuckets の返り値変更のテストから(fixture=実測: 鏡205+尾14+暫定1 → buckets205/lobby15。二重在籍を仕込むと lobbyInMirror>0→🔴)。
3. Phase A → verify:cc → bump(1 patch) → reality-checker → 実機確認 → B-1 → (Webデプロイ確認) → B-2。
4. 反映3手順(pull→拡張リロード→watchタブF5)を報告に併記。B-1だけは「Webデプロイ確認が先」。

## 地雷(設計正本 §G の要約・必読)
- L13: rows(席プール)から尾・暫定を外さない(吹き出し・群衆カウント・座席安定が rows 基準)。変えるのは buckets の行き先だけ。
- L14: 共有描画lib(paintStoryUserLaneDomFilled/renderStoryUserLaneDom/personTileDom)に第6段を足さない。ロビーは venueBar 内で完結。
- L17: 席装飾ループの合成列化を忘れるとロビー席が空白(venue-thumb-missing の同型)。
- L18: ロビーは sig diff-skip 必須+「消す側」(fallback降格で畳む経路)に計器 venueLobbyResetCount。
- L11: B は読み手先行の2段デプロイ。B-2 は本番③に B-1 が載った実確認後。
- L12: ①のタイル描画・getCachedAnonymousIdenticonDataUrl・フッター文言は1行も触らない。
- 無条件strip禁止(byte比較一致のときだけ)・avatarGen をゲートに使わない(診断表示のみ)。
- enrich関所(commitDisplay)・diff-skip・v0.1.1111 の supply/parity/wiring test を壊さない(返り値変更に追随してテストを更新する)。

## 転記元(実在確認済みパス)
- v0.1.1111 部品: `src/lib/venueLaneMirrorSupply.js`(composeVenueLaneBuckets=尾push箇所)・`src/lib/venueLaneParity.js`(buildVenueLaneParity/toVenueLaneParityDiag)・`src/extension/venueBar.js`(renderSeats 段割当/席装飾ループ/venueLaneEls.stack append 部/wrapTileEl の -1 素通し)・`src/lib/venueLaneParity.wiring.test.js`
- 鏡: `src/lib/laneMirror.js`(toMirrorCell/buildLaneMirrorSnapshot/restoreLaneMirrorBuckets)・`src/lib/laneMirrorKey.js`
- 顔: `src/lib/anonymousIdenticon.js:133-171`(anonymousIdenticonDataUrl(uid, sizePx=64)・純関数)・popup-entry.js:5049-5055(①のキャッシュ層=不触)・popup-entry.js:7691(広告段 yukkuriFaceFor=seed≠uid)
- ③: `app/live-view.js` paintLaneMirror(restoreLaneMirrorBuckets 経由=B-1で自動追随)
- タイル: `src/lib/personTileDom.js` buildPersonTileEl(venueBar.js:180 import済み)
