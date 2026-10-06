# 実装ハンドオフ: 良い資産の「輸入」を、忘れたら赤・忘れようがない形にする

> 作成: 2026-10-06 / 司令塔 / この1枚だけで着手できる粒度で書く。
> 正本: 設計 [asset-import-DESIGN.md](asset-import-DESIGN.md)(Fable・会議素材つき)。読む順: この HANDOFF → DESIGN の B・C・F・G → 必要なら H。
> お題(ユーザー確定): 正確に・正しく良い資産を輸入してストレスなく使えるようにする。UI/UX＝ユーザー体験の最大化。
> 前段: v0.1.1562〜1568 は `feat/live-absorb-lane-stats` に push 済み(master 未マージ)。実装はそのブランチの続きから。

## 0. 司令塔の裏取り結果(2026-10-06・実コードで確認)

| 項目 | 結果 |
|---|---|
| 新規予定ファイル(`src/lib/laneImportContract.js` / `testSrcSlice.js` / `laneCssSync.parity.test.js`) | いずれも未存在=衝突なし |
| `popup.html` / `app/live-view.html` に `LANE_CSS_SYNC` **マーカー** | 無い(ヒットは私が書いたコメントだけ) |
| `venueBar.js` の SYNC 区間 | 317行・`${` 補間なし(正規表現で切っても壊れない) |
| `check-gate-bypass` の赤 | **今回の変更と無関係**。`.github/workflows/actionlint.yml:50` の `continue-on-error: true` は、同ファイル冒頭コメントが理由(actionlint を実測できず非ブロッキングで導入)を書いた**意図的な設定**。対応不要(格上げするなら別お題) |
| `laneHeatTracker.js:37` | 窓超えで全リセット=設計の指摘どおり(自分の実装) |
| `officialCommentRate.js:39-40` | `c <= last.count` を捨てる=固着は実コードで確定 |
| 会議の「CSS正本→注入ビルド」案 | **却下**(DESIGN F)。カスケード位置依存・意図的な差を消す・巨大機構 |
| ai-hub find | 該当なし(輸入手順の既存資産なし) |

## 1. スコープ(MVP)と版の分割(1変更=1版・各版 `/nicolive-ship`)

版番号は着手時の manifest 最新+1 に読み替える(2026-10-06 時点の最新 0.1.1568)。

| 版 | 内容 | 挙動 |
|---|---|---|
| **1569 (MVP)** | `popup.html` と `app/live-view.html` に `/* LANE_CSS_SYNC_SRC_BEGIN */` `/* LANE_CSS_SYNC_SRC_END */` を足す(コメント2行・**CSSの位置は動かさない**)。`venueBar.js:1162` の「popup.html:1037-1320」手書き行番号をマーカー参照に直す。新規 `src/lib/laneCssSync.parity.test.js`(3区間の**セレクタ集合・`--nl-lane-*` トークン名集合・`@keyframes` 名集合・reduced-motion で animation:none のクラス集合**を照合・値は比較しない) | 不変 |
| 1570 | `src/lib/laneImportContract.js`(テストだけが読む定数)+鏡キー集合の完全一致テスト+既存 `laneTilePresentation.wiring.test.js` の toContain 4ブロックを契約ループへ置換(行数が減る)+同一人物性の入れ替え fixture テスト(DESIGN D-1) | 不変 |
| 1571 | `renderStoryUserLaneDom.js` に `skipStoryUserLanePaint()` を足し、popup-entry の「描かない3経路」の直接 sync 呼び出し3つを置換(**行数不変**)。wiring は `syncStoryUserLaneStatsInPlace(`=0件・`skipStoryUserLanePaint(`=3件に | 不変 |
| 1572〜 | 既知弱点の修正(下記 §4)。**各々、実機で症状確認 or 単体テストで固定してから**。再会議(DESIGN 追記)により、速度の固着→熱い人の窓超えの順で、1569〜1571 より先に出してもよい(単体テストで固定できるため) | 修正 |

文字列スキャン型テストの脆さ(`laneContentLod.wiring.test.js:54-60` の `indexOf('continue;')`)は 1570 で `sliceFunction()`(`src/lib/testSrcSlice.js`・10行)に直す。

## 2. 着手手順

```bash
git fetch && git checkout feat/live-absorb-lane-stats && git pull --ff-only   # 1568 まで入っている
git checkout -b feat/asset-import-guards
npm run test:cc        # 着手前に全緑(約2分)
```
- TDD: まずテストを書いて赤→実装。**変異テストを版ごとに最低2件**(壊す→赤→cp で復元→緑。未コミット時は git checkout を使わない=作業が消える)。
- 出荷は `/nicolive-ship`。毎回落ちる所: improvement の note(bundle-kb)・tree-map/feature-map/layer-map/site-health の再生成・新規ファイルの git add・changelog 20版上限(`node scripts/split-changelog.mjs` → archive は HEAD に移った1版だけ差し込む最小差分)。
- reality-checker に独立検証を委任する(自己採点しない)。

## 3. 機械的な完了判定(1569)

- `npx vitest run src/lib/laneCssSync.parity.test.js` が緑で、**抽出したセレクタ数>0**を先に断言している(マーカー無し/CRLFで0件→緑を許さない)。
- 変異: popup.html の SYNC 区間に新セレクタを1つ足す→赤(live-view と venue に無い)/ live-view.html のマーカーを消す→赤 / venueBar の `@keyframes nl-lane-pulse-pop` を消す→赤。
- 会場に意図的に無い規則(中身LOD hollow 等=`laneContentLod.wiring.test.js:75`)は契約側の `only: [...]` と**理由コメント**で除外(テスト内に if を書かない)。
- 偽陽性: トークンは**名前の集合**で比較(mega の `#c02a2a` は `[data-pulse-tier="mega"]` 内のローカル再定義=重複定義と誤認しない)。会場は先頭の `.nlsb-venue-lane-stack ` を剥がして正規化。
- `npm run verify:cc` 緑・`popup-entry.js` 行数不変(1569 は触らない)。

## 4. 既知弱点の修正方針(1572〜・DESIGN H)

1. **公式コメ速度の固着**(`officialCommentRate.js`): 逆行(`c < last.count`)が**連続3回**で値源切替とみなし `reset()`。同値は従来どおり捨てる。テスト「過大値1回→正常値3回で null に戻り、20秒後に再び出る」。
2. **熱い人の窓超えリセット**(`laneHeatTracker.js:37`): 窓超えのギャップでは全リセットでなく events を空にして prev だけ更新。liveId 変更時の全リセットは維持。テスト「61秒ギャップ後は heat 0、その10秒後の増分は出る」。
3. **北極星OFFの注記**: legend に「公式ランキング取得OFF」。kokenRows が null(OFF)と空配列(取得したが0件)を区別(§3.6)。
4. 橙の同色(増分と熱い人)は**今は直さない**(単位 pt/件で区別でき、色の序列の議論が先)。

## 5. 実機確認(司令塔が `/nicolive-selfcheck` で自分でやる・ユーザーに頼まない)

視聴していないので `copy:ext`→reload は自由。順序は DESIGN H の表: ①鏡フラッシュが stats だけの変化で書かれるか(`chrome.storage.onChanged` で書き込み回数を数える) ②1568 の別人の数字(`data-stats` と `dataset.userKey`) ③会場の吹き出し座標 ④アニメ再発火(`animationstart` 数=0期待) ⑤裏タブの熱い人。
★devtools Chrome には拡張が無く、`install_extension` は workspace 外(`C:\nicolive-ext`)を拒否する→**リポの `extension/` を指定して入れる**(2026-10-06 に ID `ohifblceplfkfajfecaoaclmkiahfflm` で成功・popup.html を開いて CSS 実効を確認済み)。実配信データでの確認は未了=HANDOFF に「⏳実機待ち」で1行残す運用。

## 6. 地雷(要約・DESIGN G)

CRLF(正規化してから検査)/ dist の日本語は `\uXXXX`(C-2 はソース3つだけ見る)/ `app/live-view.html` は**手動管理のコピー**(build は書かない)/ popup-entry.js の max-lines 22,096(契約は `src/lib` に置き import しない)/ 鍵(bodyKey・署名・scene hash・parity key)に stats/pulse を入れない/ commit-msg フックは「根治」と実機証拠なしに書くと止まる/ `git add` は新規ファイルを列挙。

## 7. 次のセッションに渡す一言

> `docs/handoff/asset-import-IMPLEMENTATION-HANDOFF.md` を読んで、`feat/live-absorb-lane-stats` から `feat/asset-import-guards` を切り、版 1569(CSS 3区間の集合照合テスト+マーカー2行)から TDD で実装してください。各版は変異テスト2件以上→`/nicolive-ship`、最後に reality-checker へ独立検証を委任してください。
