# 実装ハンドオフ: nls_comments_<lv> の書き戻し停止 + profile hydrate の同値書き戻し停止

設計正本: [storage-writeback-reduction-DESIGN-2026-10-20.md](storage-writeback-reduction-DESIGN-2026-10-20.md)(これを先に読む。ここは着手手順だけ)。
前提 master=v0.1.1698。1版=1変更。**マージ・配置はユーザーの「マージして配置して」の後**(それまでは PR まで)。

## 読む順
1. DESIGN の A・B-1・E。
2. 実コード: `src/extension/popup-entry.js` の :4921-4956(hydrate)・:15481(`commentsChunked`)・:15755-15760・:15830(既存ガード=前例)・:16347・:16479-16504・:16541。`src/extension/content-entry.js` の :15824・:15918-15934(V3)・:16053-16075(V1)・:15961-15970(V1 の写し元)。`src/lib/commentChunkStore.js`(`readChunkedComments` の戻り `fromChunks`、:277-310)。
3. 参照テスト: `src/lib/commentChunkModeFailOpen.wiring.test.js`(関数本体の切り出し型・CRLF 正規化)、`src/lib/recordPathUntouched.test.js`(緑のままであること)。

## スコープ(MVP)
V1 → V2 → V3 の3版。V4 は測定先行(出さない可能性が高い)。**記録3関数(bufferRowsToTail/flushBatchViaTail/persistCommentRowsImpl)は触らない**。ctail・timeline鏡・レーン鏡・shard 化は本件の外。

## 着手手順(各版共通)
1. `git switch -c perf/<版名>`(master 直書き禁止。着手前に `git branch --show-current` を確認)。
2. 赤いテストを先に書く(下記)→ 実装 → 緑。**変異確認**(一時的に元へ戻して赤を見て、復元)。
3. 4ファイル同期のバージョン bump(package.json / extension/manifest.json / src/lib/changelog.js 先頭(summary 35字以内・ユーザー向けの言葉) / tsuioku-no-kirameki/index.html)。
4. `npm run verify:cc`(失敗時は `.artifacts/verify-cc.log`)。新規ファイルを足す版は tree-map / feature-map / site-health を再生成し、`git add` は新規ファイルを明示列挙。
5. PR を作る(CI 緑を確認)。マージ・`npm run build`→`npm run copy:ext`→`npm run verify:deploy` はユーザーの「マージして配置して」の後。
6. 配置後、実機の測定(DESIGN §C)。効かない/悪化なら撤回してメモリに記録。

## 測定の自動化(2026-10-20 追加): `npm run census:watch`
配置後の「更新→F5→3分待つ→『おした』→速報を読む→比べる」は機械化済み(`scripts/census-watch.mjs`・判定の本体は `src/lib/censusWatch.js`)。
- 基準線を保存: `npm run census:watch -- --version v0.1.1700 --save v1700`(版が実機に届き、census の窓が3分溜まり、コメントが流れる(取得≥0.2件/秒)まで自動で待って測る)。
- 比べる: `npm run census:watch -- --version v0.1.1701 --vs v1700 --expect "nls_comments_*:0.7"`。
- 人の操作は【拡張の更新ボタンと視聴ページの F5 だけ】。「おした」は不要(版が届いたのを機械が検知する)。
- 終了コード: 0=合格 / 1=期待を破った / 2=測れていない / 3=上位3族に無く証明できない(=0回とは限らない。族別の回数は測定用ブラウザで数える)。
- 注意: 台帳は【上位3族】しか出ない。コメント流量が基準線と×2以上違う比較は結論に使わない(ツールが警告を出す)。

## V0 基準線(コードを変えない・最初に1回)
v1698 の状態で DESIGN §C の (a) 実機 と (b) 測定用ブラウザ A/B を取る。`nls_comments_*` の回数/KB、profile の回数/KB、記録件数と公式件数、STORY_AVATAR_DIAG の selfShown / withAvatar / resolvedAvatar。測定タブは事前に閉じる。

## V1: フォロー先一覧の直読みをチャンク対応に(`content-entry.js:16069-16075`)
- 変更: `get([...])` から `commentsKey` を外し、`comments` を `await readChunkedComments(lid, commentsKey, chunkGetMany)` の `rows` から作る(15961-15970 と同型)。他は不変。
- テスト(赤→緑): 新規 `src/lib/followingListReadsChunks.wiring.test.js`。関数本体を切り出して `readChunkedComments(` を含み `bag[commentsKey]` を含まない。content-entry.js 全体で `bag[commentsKey]` が0件。
- 完了判定: DESIGN §C の V1 行。撤回: `nls_commenter_follow_live_<lv>` が3分間更新されない。

## V2: popup の main 書き戻し4か所を `commentsChunked` でガード(`popup-entry.js`)
- :16347 / :16487-16489 / :16540-16548 を DESIGN B-3 のとおり。:4944 は ctx に `mainWriteAllowed: !commentsChunked`(16400-16412 の `scheduleDeferredUserCommentProfileHydrate` 呼び出し)。新関数は足さない(max-lines)。
- テスト(赤→緑): 新規 `src/lib/popupMainKeyWritebackGuard.wiring.test.js`。パターン `\[key\]: arr|save\[commentsKey\]|saveIc\[key\]|save\[key\]` の全出現を機械で拾い、各行の直前5行以内に `commentsChunked` か `mainWriteAllowed` が無ければ赤(4件を手で列挙しない)。**変異確認**: 1か所のガードを外して赤。既存の `storyGrowth*`・`popupStorageRefreshCoalesce*` 系テストが緑のまま。
- 完了判定: DESIGN §C の V2 行(popup 文書の `nls_comments_*` n が3分で ≤2)。撤回: selfShown 低下・祝祭が出ない・HTMLレポート件数不一致・名前/サムネ欠け。

## V3: content の main 書き戻しをチャンク由来のとき止める(`content-entry.js:15933`)
- 変更: `if (applied.patched > 0 && chunkRead.fromChunks !== true) save[commentsKey] = comments;`。15930-15931 は残す。
- テスト: 関数本体を切り出して `save[commentsKey]` の行が `fromChunks` を含む。`recordPathUntouched.test.js` 緑。
- 完了判定: チャンク配信で全文書の `nls_comments_*` n = 0(3分)。撤回: withAvatar・resolvedAvatar 低下。

## V4(測定先行): popup hydrate の同値書き戻し停止
先に出荷しない計器で popup 文書の profile set 回数と `hydrated` 由来割合を測る。3割未満なら出さない。出すなら DESIGN B-6 のフラグ方式(署名比較は使わない)。

## 地雷(DESIGN §E の要点)
- `liveChunkMigrated` を停止条件に使わない。
- 新配信の最初の数秒は従来どおり書く(index 無効のため)=通知が数回残るのは正常。
- CRLF で置換が空振りする=テストは `\r\n`→`\n` 正規化。`Edit` が空振りしたら Write+Python で。
- `popup-entry.js` は max-lines 上限に張り付き=条件追加のみ。
- `oc` は上位3族だけ=消えた証明は (b) の族別回数で。
- 「反映したら必ず `npm run verify:deploy`」「ユーザーに更新ボタン/F5/20秒待ちを伝える」。

## 機械的な完了判定(全体)
`npm run verify:cc` 緑・`recordPathUntouched.test.js` 緑・新規配線テストが変異で赤になる・(b) で `nls_comments_*` n が基準線(4分73)から 0〜2/3分に低下・記録件数−公式件数が基準線と同じ・`wholeWrites` が増えない。
