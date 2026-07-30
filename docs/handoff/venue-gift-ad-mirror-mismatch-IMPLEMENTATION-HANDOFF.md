# 実装ハンドオフ — 会場一致🔴(gift/ad段DOM欠落+幾何差)の根治

正本設計: [venue-gift-ad-mirror-mismatch-DESIGN.md](venue-gift-ad-mirror-mismatch-DESIGN.md)

## 読む順
1. 本ファイルのMVPスコープ
2. 正本設計のC(具体機構)の差分をそのまま適用
3. 正本設計のG(地雷と回避策)のテスト追随を必ず行う

## スコープ(MVPのみ・今回はここまで)

1. **Patch 1**: `src/lib/laneMirror.js` の `toMirrorCell`(81-94行目)を、正本設計C章の差分どおりに書き換える。会員資格の判定を「displaySrc有り **または** (userId有り **または** idLine|title複合キーが空でない)」にする。
2. **Patch 2a**: `src/extension/venueBar.js` 4336行目の `buildSceneEnvelope(lanePaintSnap)` を、正本設計C章の差分どおり `restoreLaneMirrorBuckets(lanePaintSnap)` で復元した正準形に置き換える(Patch 1と同一コミット必須・分割不可)。
3. **Patch 2b(推奨・同コミット)**: `src/lib/laneMirror.js` 140行目の `contentHash` 算出を、復元後の正準形で計算するよう変更する。
4. **Patch 3(任意)**: `src/lib/venueLaneParity.js` に「スリムN」の情報表示(verdict不算入)を追加。今回は見送ってもよい。

## 着手手順(TDD)

1. ブランチを切る(例: `fix/venue-gift-ad-mirror-slim-cell`)
2. `src/lib/laneMirror.test.js` 71-78行の既存テスト「displaySrc空の要素は落とす」を、正本設計Gの3ケース(スリムセルは残す/広告主セルは残す/真に空のセルだけ落とす)に書き換える → 赤になることを確認
3. `toMirrorCell` を正本設計Cの差分どおり修正 → 該当テストが緑になることを確認
4. round-tripテスト追加: `buildLaneMirrorSnapshot`(スリムgiftセル込み)→`restoreLaneMirrorBuckets`→displaySrcがidenticonで復元されること、`snap.contentHash === laneSceneContentHash(restored)` を固定
5. `src/lib/venueLaneParity.wiring.test.js` 243行目の正規表現を、Patch 2a後の新しい呼び出し形に合わせて更新(venueBar.jsのimport行180行は変えないこと)
6. `venueBar.js` の Patch 2a を適用
7. `laneMirror.js` の Patch 2b を適用(推奨)
8. `npm run verify:cc` を実行し全緑を確認(失敗時は `.artifacts/verify-cc.log` を読む)
9. 新規lib追加は無いはずだが、tree-map/feature-mapのdriftが出たら `npm run tree-map` / `npm run feature-map` を再生成してコミットに含める
10. version bump(3点セット: manifest.json/package.json/changelog.js)を同期し、`npm run verify:cc` を再実行してdrift再発を確認

## 機械的な完了判定

- `npm run verify:cc` 全緑
- 実配信で状態速報を確認: `会場一致 ✅ ... gift3 ad3 ... DOM=データ / ①DOM=鏡 / 幾何=一致 / 未説明0` かつ `scene rXXXX hash… ①=会場 ✅`
- enrich遅延窓では「スリムN」(N>0、Patch 3採用時)が出ても✅のままであることが正常
- `幾何≠` が残る場合はそれは別の残差として扱い、隠さずに次の調査へ回す

## 地雷(正本設計Gから再掲・特に注意)

1. `laneMirror.test.js`の既存テストは仕様反転で確実に赤くなる。慌てず正本設計の3ケースに書き換える
2. `venueLaneParity.wiring.test.js` 243行の正規表現もPatch 2aで確実に赤くなる。venueBar.jsのimport行(180行)自体は変えないので、そこは既存のまま通ることを確認する
3. Patch 1とPatch 2aは同一コミットに含める(Patch 1単独出荷は「別の🔴に化ける」ため不可)
4. ①側(popup-entry.js)・診断ロジック(venueLaneParity.jsの判定本体)・既存のdiff-skip/cap/min-gapには一切触れない
5. 検証エージェント(reality-checker)実行中はcommitしない([[reality-checker-stash-detaches-head-2026-07-07]])。commit直後は`git branch --show-current`+`git show HEAD:<file>|grep <核心>`で中身確認

## 次に必要な作業

実装は次チャット、または別モデル(Codex/cursor-agent等)へ委譲してよい。着手時はこの1枚(本ハンドオフ)と正本設計だけで開始できる。
